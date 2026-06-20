/**
 * Sandbox Extension — restricts pi's filesystem access to an allowlist of folders.
 *
 * Allowed folders ("roots"). A path is allowed when it is inside (or equal to)
 * one of the roots. Access via read/write/edit/bash/grep/find/ls to anything
 * outside the roots is blocked before execution.
 *
 * CONFIG SOURCE (global, deterministisch):
 *   Diese Extension wird von Pi aus ~/.pi/agent/extensions/sandbox.ts geladen
 *   (global, nicht projektorientiert). Die Config liegt deshalb ebenfalls
 *   global unter ~/.pi/agent/sandbox.json und gilt für jede Pi-Session
 *   unabhängig vom cwd. Der Pfad wird hartkodiert aufgelöst (kein import.meta.url),
 *   damit sich die Extension identisch verhält, egal ob sie gerade in
 *   pi-setup/extensions/ (Repo-Backup) oder ~/.pi/agent/extensions/ (Live)
 *   liegt — die geladene Datei ist immer die Live-Datei.
 *
 *   Reihenfolge:
 *   1. SANDBOX_ROOTS env var (colon-separated) — falls gesetzt, hat sie Vorrang.
 *   2. ~/.pi/agent/sandbox.json → { "enabled": true, "roots": ["/abs/path", ...] }
 *   3. sonst / Lesefehler / malformed JSON: roots = [] (Default-Deny).
 *
 * LAZY RELOAD: die Config wird bei JEDEM tool_call neu von der Datei gelesen,
 * nicht einmal beim Laden der Extension zwischengespeichert. Dadurch greifen
 * Änderungen (auch /sandbox add, /sandbox reset) sofort und zuverlässig, und es
 * gibt kein Race zwischen Ladereihenfolge und In-Memory-Cache.
 *
 * Bash policy: a bash command is allowed unless it references a path that
 * resolves OUTSIDE the allowed roots. The cwd itself is NOT checked anymore —
 * only the explicit path-like tokens inside the command string are. This makes
 * bash behave like read/grep/find: `ls`, `git status`, `npm test` run freely
 * regardless of cwd, while `cat /etc/shadow` or `cd /outside` are blocked.
 * Note: this means relative access (e.g. `cat ../secret.txt` from a non-root
 * cwd) is NOT caught — for real isolation run pi in a container with only the
 * allowed folders mounted. This is a best-effort guard, not a hardened jail.
 *
 * Complementary to safety-guard.ts: the safety guard confirms *risky* actions;
 * this sandbox enforces a hard *folder boundary*.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve as pathResolve, normalize, isAbsolute } from "node:path";
import { homedir } from "node:os";

type SandboxConfig = {
	enabled: boolean;
	roots: string[];
};

// Config liegt global neben der geladenen Extension (~/.pi/agent/). Hartkodiert,
// nicht über import.meta.url, damit Repo-Backup und Live-Datei identisch
// funktionieren und kein Cwd-bedingter Pfad-Zufall entsteht.
const PI_HOME = process.env.PI_HOME ?? join(homedir(), ".pi", "agent");
const CONFIG_PATH = join(PI_HOME, "sandbox.json");

function expandTilde(p: string): string {
	return normalize(p.replace(/^~(?=$|\/|\\)/, homedir()));
}

function resolveRoots(list: string[]): string[] {
	return list
		.map((r) => r.trim())
		.filter(Boolean)
		.map(expandTilde)
		.map((r) => (isAbsolute(r) ? r : pathResolve(process.cwd(), r)));
}

function loadConfig(): SandboxConfig {
	const envRoots = process.env.SANDBOX_ROOTS;
	if (envRoots && envRoots.trim().length > 0) {
		return { enabled: true, roots: envRoots.split(":") };
	}
	try {
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<SandboxConfig>;
		return { enabled: true, roots: [], ...parsed };
	} catch {
		// No sandbox.json and no env var → sandbox stays enabled but allows nothing.
		return { enabled: true, roots: [] };
	}
}

function saveConfig(config: SandboxConfig) {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** True if `target` (absolute) is inside one of the allowed roots. */
function isAllowedRoot(target: string, roots: string[]): boolean {
	const t = normalize(isAbsolute(target) ? target : pathResolve(process.cwd(), target));
	return roots.some((root) => {
		const rel = relative(root, t);
		return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
	});
}

function resolveAgainst(target: string, cwd: string): string {
	return normalize(isAbsolute(target) ? target : pathResolve(cwd, target));
}

/** Extract path-like tokens from a bash command string (best-effort). */
function extractPathsFromCommand(command: string): string[] {
	const tokens = command.match(/(?:[^\s"'$]+|"[^"]*"|'[^']*')+|\S+/g) ?? [];
	const paths: string[] = [];
	let afterCd = false;
	for (const tokRaw of tokens) {
		const tok = tokRaw.replace(/^['"]|['"]$/g, "");
		if (tok === "cd" || tok === "pushd") {
			afterCd = true;
			continue;
		}
		if (afterCd) {
			paths.push(tok);
			afterCd = false;
			continue;
		}
		if (isAbsolute(tok) || tok.startsWith("~") || tok.startsWith("./") || tok.startsWith("../")) {
			paths.push(tok);
		}
	}
	return paths;
}

const PATH_TOOLS = new Set(["read", "write", "edit"]);
const SEARCH_TOOLS = new Set(["grep", "find", "ls"]);

export default function sandbox(pi: ExtensionAPI) {
	/**
	 * LAZY RELOAD: Config immer frisch von der Datei lesen. So gibt es keinen
	 * In-Memory-Cache, der sich zwischen Ladezeitpunkt und tool_call aufhängen
	 * kann, und Änderungen (auch /sandbox add/reset) greifen sofort.
	 * Bei Lesefehler/malformed JSON → Default-Deny (roots: []).
	 */
	const current = (): SandboxConfig => {
		try {
			return loadConfig();
		} catch {
			return { enabled: true, roots: [] };
		}
	};
	const resolved = () => resolveRoots(current().roots);

	function setStatus(ctx: { hasUI: boolean; ui: { setStatus: (k: string, v: string) => void } }) {
		if (ctx.hasUI) {
			const c = current();
			ctx.ui.setStatus("sandbox", c.enabled ? `sandbox: ${resolveRoots(c.roots).length} roots` : "sandbox: off");
		}
	}

	pi.registerCommand("sandbox", {
		description: "Manage Sandbox: /sandbox enable|disable|status|list|add <path>|reset",
		handler: async (args, ctx) => {
			const [sub, ...rest] = args.trim().split(/\s+/);
			const arg = rest.join(" ").trim();
			switch ((sub || "status").toLowerCase()) {
				case "enable": {
					const next = { ...current(), enabled: true };
					saveConfig(next);
					setStatus(ctx);
					ctx.ui.notify("Sandbox enabled", "info");
					return;
				}
				case "disable": {
					const next = { ...current(), enabled: false };
					saveConfig(next);
					setStatus(ctx);
					ctx.ui.notify("Sandbox disabled", "warning");
					return;
				}
				case "list":
					ctx.ui.notify(`Roots:\n${resolved().map((r) => `  • ${r}`).join("\n")}`, "info");
					return;
				case "add": {
					if (!arg) {
						ctx.ui.notify("Usage: /sandbox add <absolute-path>", "warning");
						return;
					}
					const c = current();
					const next = { ...c, roots: [...c.roots, arg] };
					saveConfig(next);
					setStatus(ctx);
					ctx.ui.notify(`Added ${arg}. Roots: ${resolveRoots(next.roots).length}`, "info");
					return;
				}
				case "reset": {
					const next: SandboxConfig = { enabled: true, roots: [] };
					saveConfig(next);
					setStatus(ctx);
					ctx.ui.notify("Sandbox roots cleared (nothing allowed)", "info");
					return;
				}
				case "status":
				case "": {
					const c = current();
					ctx.ui.notify(
						`Sandbox is ${c.enabled ? "enabled" : "disabled"} (${resolveRoots(c.roots).length} roots)`,
						c.enabled ? "info" : "warning",
					);
					return;
				}
				default:
					ctx.ui.notify(
						"Usage: /sandbox enable | disable | status | list | add <path> | reset",
						"warning",
					);
			}
		},
	});

	pi.on("session_start", (_event, ctx) => setStatus(ctx));

	pi.on("tool_call", async (event, ctx) => {
		const config = current();
		if (!config.enabled) return undefined;
		const roots = resolveRoots(config.roots);
		const { toolName, input } = event;

		// Default-Deny: wenn keine Roots konfiguriert sind, blockt die Sandbox
		// JEGLICHEN Datei-/Such-/Bash-Zugriff — auch innerhalb des cwd. Pi läuft
		// quasi gesperrt, bis via /sandbox add mindestens ein Root freigegeben wird.
		if (roots.length === 0 && (PATH_TOOLS.has(toolName) || SEARCH_TOOLS.has(toolName) || toolName === "bash")) {
			if (ctx.hasUI) ctx.ui.notify(`Sandbox: blocked ${toolName} (no roots configured)`, "warning");
			return { block: true, reason: "Sandbox: no roots configured — nothing allowed (use /sandbox add <path>)" };
		}

		if (PATH_TOOLS.has(toolName)) {
			const p = (input as { path?: string }).path;
			if (typeof p === "string" && !isAllowedRoot(p, roots)) {
				if (ctx.hasUI) ctx.ui.notify(`Sandbox: blocked ${toolName} of ${p}`, "warning");
				return { block: true, reason: `Sandbox: path outside allowed roots: ${p}` };
			}
			return undefined;
		}

		if (SEARCH_TOOLS.has(toolName)) {
			const p = (input as { path?: string }).path;
			if (typeof p === "string" && p.trim().length > 0) {
				const cwd = (input as { cwd?: string }).cwd ?? process.cwd();
				if (!isAllowedRoot(resolveAgainst(p, cwd), roots)) {
					if (ctx.hasUI) ctx.ui.notify(`Sandbox: blocked ${toolName} in ${p}`, "warning");
					return { block: true, reason: `Sandbox: search path outside allowed roots: ${p}` };
				}
			}
			return undefined;
		}

		// Bash: nur die im Command referenzierten Pfade werden geprüft (wie bei
		// read/grep/find). Der cwd selbst wird NICHT mehr gecheckt — damit verhält
		// sich bash wie die anderen Tools: `ls`, `git status`, `npm test` laufen
		// frei, auch wenn der cwd selbst kein Root ist. Nur wenn ein Token im
		// Command (absoluter Pfad, ~, ./, ../, oder Ziel von cd/pushd) außerhalb
		// der Roots liegt, wird geblockt.
		// (Relativer Zugriff vom cwd aus wird bewusst NICHT validiert — siehe
		// Header-Kommentar "best-effort guard, not a hardened jail".)
		if (toolName === "bash") {
			const { command, cwd: cwdArg } = input as { command?: string; cwd?: string };
			const cwd = cwdArg && cwdArg.trim().length > 0 ? cwdArg : process.cwd();
			if (command) {
				for (const tok of extractPathsFromCommand(command)) {
					if (!isAllowedRoot(resolveAgainst(tok, cwd), roots)) {
						if (ctx.hasUI) ctx.ui.notify(`Sandbox: blocked bash referencing ${tok}`, "warning");
						return {
							block: true,
							reason: `Sandbox: command references path outside allowed roots: ${tok}`,
						};
					}
				}
			}
			return undefined;
		}

		return undefined;
	});
}

// Exposed for tests / future tooling.
export { loadConfig, isAllowedRoot, resolveRoots };
