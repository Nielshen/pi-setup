/**
 * Pi Welcome — scrollback-friendly startup card.
 *
 * Important: this deliberately does NOT use ctx.ui.setHeader(). setHeader is a
 * fixed viewport region, so it remains visible while chat scrolls. Instead we
 * send a normal custom message, which lives in the transcript and scrolls away
 * naturally as the conversation grows.
 */

import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const LOGO = [
	"  ██████   ██",
	"  ██   ██  ██",
	"  ██████   ██",
	"  ██       ██",
	"  ██       ██",
	"  ██       ██",
];

type WelcomeDetails = {
	model: string;
	user: string;
	dir: string;
};

function compactCwd(cwd: string): string {
	const home = process.env.HOME;
	if (home && cwd.startsWith(home)) return cwd.replace(home, "~");
	return cwd;
}

function projectName(cwd: string): string {
	return path.basename(cwd) || "session";
}

export default function (pi: ExtensionAPI) {
	let showWelcome = false;

	pi.registerMessageRenderer("pi-welcome", (message, _state, theme) => {
		// The welcome card is a persisted custom message so it can scroll away like
		// normal chat. Hide persisted copies when resuming, forking, reloading, or
		// navigating branches; it should only be visible during a brand-new session.
		if (!showWelcome) {
			return {
				render: () => [],
				invalidate: () => {},
			};
		}

		const details = (message.details ?? {}) as Partial<WelcomeDetails>;
		const model = details.model ?? "no model";
		const user = details.user ?? process.env.USER ?? "user";
		const dir = details.dir ?? compactCwd(process.cwd());

		const box = new Box(1, 1, (s) => theme.bg("customMessageBg", s));
		box.addChild(new Text([
			...LOGO.map((line) => line.replace(/█/g, theme.fg("accent", "█"))),
			"",
			`${theme.fg("accent", theme.bold("pi coding agent"))} ${theme.fg("dim", "·")} ${theme.fg("text", user)} ${theme.fg("dim", "·")} ${theme.fg("dim", projectName(dir))}`,
			`${theme.fg("dim", "model:")} ${theme.fg("text", model)}`,
			`${theme.fg("dim", "dir:  ")} ${theme.fg("text", dir)}`,
		].join("\n"), 0, 0));

		return {
			render(width: number): string[] {
				return box.render(width).map((line) => visibleWidth(line) > width ? truncateToWidth(line, width) : line);
			},
			invalidate() {
				box.invalidate();
			},
		};
	});

	pi.on("session_start", (event, ctx) => {
		if (!ctx.hasUI) return;

		// Ensure any older fixed header from a previous version is removed.
		ctx.ui.setHeader(undefined);

		const branch = ctx.sessionManager.getBranch();
		const hasConversation = branch.some((entry: any) =>
			entry.type === "message" || entry.type === "toolResult"
		);
		const hasWelcome = branch.some((entry: any) =>
			entry.type === "custom_message" && entry.customType === "pi-welcome"
		);
		const isBrandNewSession = event.reason === "new"
			|| (event.reason === "startup" && !hasConversation && !hasWelcome);
		showWelcome = isBrandNewSession;
		if (!isBrandNewSession || hasWelcome) return;

		pi.sendMessage({
			customType: "pi-welcome",
			content: "pi welcome",
			display: true,
			details: {
				model: ctx.model?.id ?? "no model",
				user: process.env.USER || "user",
				dir: compactCwd(ctx.cwd ?? process.cwd()),
			} satisfies WelcomeDetails,
		});
	});

	pi.on("session_tree", () => {
		showWelcome = false;
	});

	pi.on("session_shutdown", (_event, ctx) => {
		showWelcome = false;
		if (ctx.hasUI) ctx.ui.setHeader(undefined);
	});
}
