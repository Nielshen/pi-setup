/**
 * Confirm-Edits Extension
 *
 * Toggle whether pi must ask for confirmation before editing/writing files.
 *
 * Commands:
 *   /accept on        — require confirmation (auto-accept OFF)
 *   /accept off       — auto-accept all edits/writes (pi default behavior)
 *   /accept status    — show current mode
 *   /accept           — toggle (no arg)
 *
 * When confirmation is ON, every `edit` and `write` tool_call is intercepted
 * BEFORE execution: the projected diff is published into the chat stream
 * (visible message, no overlay) and a compact y/n confirm is asked. Apply →
 * the tool runs through (pi then shows its built-in chat diff anyway); Skip →
 * the tool_call is blocked and the file stays unchanged.
 *
 * Config is persisted across sessions at ~/.pi/agent/accept-edits.json.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// ─── Config ──────────────────────────────────────────────────────────────────

type AcceptConfig = {
	/** When true: pi auto-accepts edit/write (default pi behavior). When false: confirmation required. */
	autoAccept: boolean;
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "accept-edits.json");
const DEFAULT_CONFIG: AcceptConfig = { autoAccept: true };

function loadConfig(): AcceptConfig {
	try {
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<AcceptConfig>;
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch {
		return DEFAULT_CONFIG;
	}
}

function saveConfig(config: AcceptConfig) {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

// ─── Diff helpers ────────────────────────────────────────────────────────────

function splitLines(text: string): string[] {
	if (text.length === 0) return [];
	return text.replace(/\n$/, "").split("\n");
}

type DiffPart = { type: "same" | "add" | "remove"; line: string };

/**
 * Minimal LCS-based line diff. Good enough for human-readable previews.
 */
function diffLines(original: string[], current: string[]): DiffPart[] {
	const rows = original.length;
	const cols = current.length;
	const dp: number[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));
	for (let i = rows - 1; i >= 0; i--) {
		for (let j = cols - 1; j >= 0; j--) {
			dp[i][j] = original[i] === current[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}

	const out: DiffPart[] = [];
	let i = 0;
	let j = 0;
	while (i < rows && j < cols) {
		if (original[i] === current[j]) {
			out.push({ type: "same", line: original[i] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			out.push({ type: "remove", line: original[i++] });
		} else {
			out.push({ type: "add", line: current[j++] });
		}
	}
	while (i < rows) out.push({ type: "remove", line: original[i++] });
	while (j < cols) out.push({ type: "add", line: current[j++] });
	return out;
}

/**
 * Build a unified-diff style patch from a before/after pair.
 * Used to preview `write` (full file) and the composite result of all `edit` operations.
 */
function patchFromPair(displayPath: string, original: string | null, current: string): string {
	const before = splitLines(original ?? "");
	const after = splitLines(current);
	const diff = diffLines(before, after);
	const lines = [`--- ${displayPath}`, `+++ ${displayPath}`, "@@"];
	for (const part of diff) {
		if (part.type === "add") lines.push(`+${part.line}`);
		else if (part.type === "remove") lines.push(`-${part.line}`);
		else lines.push(` ${part.line}`);
	}
	return `${lines.join("\n")}\n`;
}

function countDiffLines(patch: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of patch.split("\n")) {
		if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) continue;
		if (line.startsWith("+")) added++;
		else if (line.startsWith("-")) removed++;
	}
	return { added, removed };
}

/**
 * Apply an array of edit operations {oldText, newText} to a string, sequentially.
 * Returns the resulting string, or throws if an `oldText` is not found.
 *
 * NOTE: we only apply the first occurrence of each oldText, mirroring pi's edit semantics
 * ("oldText must match a unique region").
 */
function applyEdits(content: string, edits: Array<{ oldText: string; newText: string }>): string {
	let out = content;
	for (const e of edits) {
		const idx = out.indexOf(e.oldText);
		if (idx === -1) {
			throw new Error(`oldText not found in current file (edit preview skipped).`);
		}
		out = out.slice(0, idx) + e.newText + out.slice(idx + e.oldText.length);
	}
	return out;
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function confirmEdits(pi: ExtensionAPI) {
	let config = loadConfig();

	function setAutoAccept(value: boolean) {
		config = { ...config, autoAccept: value };
		saveConfig(config);
	}

	function statusText(): string {
		return config.autoAccept ? "accept: auto" : "accept: confirm";
	}

	function systemPromptSuffix(): string {
		// Steering hint: tell the model that edits/writes will be gated by the user.
		return `\n\nConfirm-Edits is ON (auto-accept OFF). Every edit/write will be shown as a diff to the user before it is applied. If the user rejects a change, the tool will return an error and you should respect that decision and not immediately retry the identical change.`;
	}

	// ─── Commands ─────────────────────────────────────────────────────────────

	pi.registerCommand("accept", {
		description: "Toggle edit confirmation: /accept on|off|status",
		handler: async (args, ctx) => {
			const sub = (args ?? "").trim().toLowerCase();

			if (sub === "on" || sub === "confirm") {
				setAutoAccept(false);
				if (ctx.hasUI) {
					ctx.ui.setStatus("accept-edits", statusText());
					ctx.ui.notify("Edit confirmation ON (auto-accept off).", "info");
				}
				return;
			}
			if (sub === "off" || sub === "auto") {
				setAutoAccept(true);
				if (ctx.hasUI) {
					ctx.ui.setStatus("accept-edits", statusText());
					ctx.ui.notify("Auto-accept ON (edits applied without asking).", "warning");
				}
				return;
			}
			if (sub === "" || sub === "toggle") {
				setAutoAccept(!config.autoAccept);
				if (ctx.hasUI) {
					ctx.ui.setStatus("accept-edits", statusText());
					ctx.ui.notify(`Edit confirmation ${config.autoAccept ? "OFF" : "ON"}.`, config.autoAccept ? "warning" : "info");
				}
				return;
			}
			if (sub === "status") {
				if (ctx.hasUI) ctx.ui.notify(`Auto-accept is ${config.autoAccept ? "ON" : "OFF"} (confirmation ${config.autoAccept ? "OFF" : "ON"}).`, "info");
				return;
			}
			if (ctx.hasUI) {
				ctx.ui.notify("Usage: /accept on|off|status  (on = confirm each edit, off = auto-apply)", "warning");
			}
		},
	});

	// ─── UI status on startup ─────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setStatus("accept-edits", statusText());
	});

	// ─── Steer the model: mention the gating mode ─────────────────────────────

	pi.on("before_agent_start", async (event) => {
		if (config.autoAccept) return undefined;
		return { systemPrompt: event.systemPrompt + systemPromptSuffix() };
	});

	// ─── Intercept edit/write tool calls ──────────────────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		if (config.autoAccept) return undefined;
		if (event.toolName !== "edit" && event.toolName !== "write") return undefined;

		// Resolve absolute path (relative to cwd) and read current content
		const rawPath = (event.input as { path?: string }).path;
		if (typeof rawPath !== "string") return undefined;

		const { readFile } = await import("node:fs/promises");
		const { resolve, relative } = await import("node:path");
		const cwd = (ctx as { cwd?: string }).cwd ?? process.cwd();
		const absPath = resolve(cwd, rawPath.startsWith("@") ? rawPath.slice(1) : rawPath);
		const displayPath = (() => {
			const rel = relative(cwd, absPath);
			return rel && !rel.startsWith("..") ? rel : rawPath;
		})();

		let before: string | null;
		try {
			before = await readFile(absPath, "utf-8");
		} catch {
			before = null; // file does not exist yet → created
		}

		// Compute projected "after" content
		let after: string;
		try {
			if (event.toolName === "write") {
				after = typeof (event.input as { content?: string }).content === "string"
					? (event.input as { content: string }).content
					: "";
			} else {
				const edits = Array.isArray((event.input as { edits?: unknown }).edits)
					? ((event.input as { edits: Array<{ oldText: string; newText: string }> }).edits)
					: [];
				after = applyEdits(before ?? "", edits);
			}
		} catch (e: any) {
			// Cannot build a preview (e.g. oldText mismatch). Be safe: ask for a plain confirmation.
			const msg = `Cannot preview change to ${displayPath}: ${e?.message ?? String(e)}`;
			if (!ctx.hasUI) return undefined; // headless: allow (cannot prompt usefully)
			const choice = await ctx.ui.select(`${msg}\n\nAllow anyway?`, ["Allow once", "Block"]);
			if (choice === "Allow once") return undefined;
			return { block: true, reason: `User blocked edit on ${displayPath} (preview unavailable).` };
		}

		// No-op edit / write: let it pass silently.
		if (before === after) return undefined;

		const patch = patchFromPair(displayPath, before, after);
		const { added, removed } = countDiffLines(patch);
		const kind = before === null ? "new file" : event.toolName === "write" ? "overwrite" : "edit";
		const header = `${kind}  ${displayPath}  (+${added}/-${removed})`;

		// Headless: no UI to show a diff. Fall back to blocking to be safe.
		if (!ctx.hasUI) {
			return { block: true, reason: `Confirm-Edits is ON but session has no UI; blocked ${kind} on ${displayPath}.` };
		}

		// Inline-Confirm: Diff geht als sichtbare Nachricht in den Chat-Verlauf
		// (kein Overlay-Fenster). Die Freigabe läuft über einen dezenten J/N-Prompt
		// (ctx.ui.confirm), der die Tastatur nur kurz für die Entscheidung hält.
		// Akzeptiert → Tool läuft normal durch (Pi zeigt danach ohnehin seinen
		// built-in Chat-Diff). Abgelehnt → tool_call wird geblockt, Datei bleibt
		// unverändert.
		const body = `${header}\n\n\`\`\`diff\n${patch.trimEnd() || "(no changes)"}\n\`\`\``;

		try {
			(pi as unknown as {
				sendMessage: (msg: unknown, opts?: unknown) => void;
			}).sendMessage(
				{ customType: "confirm-edits-preview", content: body, display: true },
				{ triggerTurn: false },
			);
		} catch {
			// sendMessage nicht verfügbar (ältere Pi-Version / anderer Modus) →
			// Fallback: Nur der Confirm-Prompt ohne vorab gerenderten Diff im Chat.
		}

		const apply = ctx.hasUI
			? await ctx.ui.confirm(`Apply ${kind} on ${displayPath}?`, "y = apply  /  n = skip")
			: false;

		if (apply) return undefined;
		return { block: true, reason: `User skipped ${kind} on ${displayPath}.` };
	});
}
