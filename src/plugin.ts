import path from "node:path";

import streamDeck from "@elgato/streamdeck";

import { PushToTalkAction } from "./actions/push-to-talk.js";
import { CuePlayer } from "./cues.js";
import { listInteractiveSessions, SessionFileError, type ClaudeSession } from "./sessions.js";
import { TargetSelector } from "./target.js";
import { Tray, type TrayMenuEntry } from "./win32/tray.js";

const TRAY_ICON_PATH = path.join(import.meta.dirname, "..", "imgs", "tray.ico");
const SOUNDS_PATH = path.join(import.meta.dirname, "..", "sounds");

const logger = streamDeck.logger;
logger.setLevel("info");

// Stream Deck does not show the standard error stream of a plugin, so a crash is recorded in the log file before the
// process exits.
process.on("uncaughtExceptionMonitor", (error, origin) => {
	logger.error(`Plugin is terminating because of an ${origin}`, error);
});

const targets = new TargetSelector((selection) => {
	logger.info(selection.mode === "automatic" ? "Target selection is automatic" : `Target selection is pinned to session ${selection.name}`);
	tray.setTooltip(trayTooltip());
	void pushToTalk.showTargetLabel();
});
const cues = new CuePlayer(SOUNDS_PATH, (cue) => logger.warn(`Windows could not play the ${cue} sound`));
const pushToTalk = new PushToTalkAction(targets, cues);
const tray = new Tray({
	iconPath: TRAY_ICON_PATH,
	tooltip: trayTooltip(),
	buildMenu,
	onIconUnavailable: (message) => logger.warn(message),
});
process.on("exit", () => tray.dispose());

streamDeck.actions.registerAction(pushToTalk);
await streamDeck.connect();
logger.info(`Plugin connected to Stream Deck ${streamDeck.info.application.version}`);

function trayTooltip(): string {
	return `Claude Voice: ${targets.label}`;
}

function buildMenu(): TrayMenuEntry[] {
	const entries: TrayMenuEntry[] = [
		{
			kind: "item",
			label: "Automatic (most recently active session)",
			checked: targets.selection.mode === "automatic",
			onSelect: () => targets.selectAutomatic(),
		},
		{ kind: "separator" },
	];

	let listing;
	try {
		listing = listInteractiveSessions();
	} catch (error) {
		if (!(error instanceof SessionFileError)) {
			throw error;
		}
		logger.error("Cannot build the session menu: reading the Claude Code sessions failed", error);
		entries.push({ kind: "note", label: "Reading the Claude Code sessions failed, see the plugin log" });
		return entries;
	}

	if (listing.reachable.length === 0 && listing.inaccessible.length === 0) {
		entries.push({ kind: "note", label: "No Claude Code session is running" });
		return entries;
	}

	const selection = targets.selection;
	for (const session of listing.reachable) {
		entries.push({
			kind: "item",
			label: sessionLabel(session),
			checked: selection.mode === "pinned" && selection.sessionId === session.sessionId,
			onSelect: () => targets.pin(session),
		});
	}
	for (const session of listing.inaccessible) {
		entries.push({ kind: "note", label: `${sessionLabel(session)} (not reachable, elevated?)` });
	}
	return entries;
}

function sessionLabel(session: ClaudeSession): string {
	return `${session.name} (${session.status}) ${session.cwd}`;
}
