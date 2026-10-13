import streamDeck, {
	action,
	SingletonAction,
	type KeyDownEvent,
	type KeyUpEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { KEY_REPEAT_TIMING, PUSH_TO_TALK_KEY, TAP_MAX_DURATION_MS } from "../config.js";
import type { Cue, CuePlayer } from "../cues.js";
import { KeyHold } from "../key-hold.js";
import { listInteractiveSessions, SessionFileError, type ClaudeSession } from "../sessions.js";
import type { TargetSelector } from "../target.js";
import { ConsoleUnreachableError, writeKeyEvent } from "../win32/console-input.js";

const IDLE_STATE = 0;
const TALKING_STATE = 1;

/**
 * Settings of one push-to-talk key, as stored by Stream Deck.
 */
type PushToTalkSettings = {
	/**
	 * Whether cues are played. Stream Deck stores no value until the user changes the checkbox.
	 */
	sounds?: boolean;
};

type Key = KeyDownEvent<PushToTalkSettings>["action"];

type HoldState =
	| { kind: "idle" }
	| {
			kind: "holding";

			/**
			 * Identifier of the action instance that started the hold.
			 */
			actionId: string;
			hold: KeyHold;
			session: ClaudeSession;
			playsCues: boolean;

			/**
			 * Time of the key press on the monotonic clock, in milliseconds.
			 */
			pressedAt: number;
	  };

/**
 * How a hold ended, which determines the feedback given to the user.
 */
type ReleaseOutcome = "not-holding" | "tapped" | "recording-ended" | "released-early" | "failed";

/**
 * Presses the push-to-talk key in the target Claude Code session.
 *
 * Holding the action holds the key, which makes Claude Code record until the action is released. Tapping the action
 * presses the key twice, which makes Claude Code submit a prompt that ends with a dictated transcript.
 */
@action({ UUID: "de.chrisliebaer.claude-voice.push-to-talk" })
export class PushToTalkAction extends SingletonAction<PushToTalkSettings> {
	readonly #logger = streamDeck.logger.createScope("PushToTalk");
	readonly #targets: TargetSelector;
	readonly #cues: CuePlayer;
	#state: HoldState = { kind: "idle" };

	constructor(targets: TargetSelector, cues: CuePlayer) {
		super();
		this.#targets = targets;
		this.#cues = cues;
	}

	/**
	 * Shows the current target selection on every visible key of this action.
	 */
	async showTargetLabel(): Promise<void> {
		for (const visible of this.actions) {
			if (visible.isKey()) {
				await visible.setTitle(this.#targets.label);
			}
		}
	}

	override async onWillAppear(ev: WillAppearEvent<PushToTalkSettings>): Promise<void> {
		if (ev.action.isKey()) {
			await ev.action.setTitle(this.#targets.label);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<PushToTalkSettings>): Promise<void> {
		if (this.#state.kind === "holding") {
			this.#logger.warn(`Ignoring key press: push-to-talk is already held for session ${this.#state.session.name}`);
			return;
		}

		let sessions: ClaudeSession[];
		try {
			sessions = listInteractiveSessions().reachable;
		} catch (error) {
			if (!(error instanceof SessionFileError)) {
				throw error;
			}
			this.#logger.error("Cannot start push-to-talk: reading the Claude Code sessions failed", error);
			await ev.action.showAlert();
			return;
		}

		const target = this.#targets.resolve(sessions);
		if (target.kind === "none") {
			this.#logger.warn("Cannot start push-to-talk: no reachable Claude Code session is running");
			await ev.action.showAlert();
			return;
		}

		const { session } = target;
		const playsCues = cuesEnabled(ev.payload.settings);
		let hold: KeyHold;
		try {
			hold = KeyHold.press(session.pid, PUSH_TO_TALK_KEY, KEY_REPEAT_TIMING, {
				onRepeating: () => void this.#onRecordingStarted(ev.action, session, playsCues),
				onLost: (error) => void this.#onHoldLost(ev.action, session, error),
			});
		} catch (error) {
			if (!(error instanceof ConsoleUnreachableError)) {
				throw error;
			}
			this.#logger.error(`Cannot start push-to-talk for session ${session.name} (process ${session.pid})`, error);
			await ev.action.showAlert();
			return;
		}

		this.#state = { kind: "holding", actionId: ev.action.id, hold, session, playsCues, pressedAt: performance.now() };
	}

	override async onKeyUp(ev: KeyUpEvent<PushToTalkSettings>): Promise<void> {
		const outcome = this.#release(ev.action.id, "key-up");
		if (outcome === "recording-ended") {
			await ev.action.setState(IDLE_STATE);
		}
		if (outcome === "failed") {
			await ev.action.setState(IDLE_STATE);
			await ev.action.showAlert();
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<PushToTalkSettings>): void {
		// A key that disappears while pressed, for example on a device disconnect, sends no key-up event.
		this.#release(ev.action.id, "disappeared");
	}

	/**
	 * Ends the hold that was started by the given action instance, if there is one.
	 * @param actionId Identifier of the action instance that was released.
	 * @param cause Why the hold ends; only a key-up can complete a tap.
	 */
	#release(actionId: string, cause: "key-up" | "disappeared"): ReleaseOutcome {
		if (this.#state.kind !== "holding" || this.#state.actionId !== actionId) {
			return "not-holding";
		}

		const { hold, session, playsCues, pressedAt } = this.#state;
		const heldMs = Math.round(performance.now() - pressedAt);
		const isTap = cause === "key-up" && heldMs <= TAP_MAX_DURATION_MS;
		const where = `session ${session.name} (process ${session.pid})`;
		this.#state = { kind: "idle" };
		try {
			hold.release();
			if (isTap) {
				writeKeyEvent(session.pid, PUSH_TO_TALK_KEY, "down");
				writeKeyEvent(session.pid, PUSH_TO_TALK_KEY, "up");
			}
		} catch (error) {
			if (!(error instanceof ConsoleUnreachableError)) {
				throw error;
			}
			this.#logger.error(`Cannot release push-to-talk for ${where}`, error);
			return "failed";
		}

		if (isTap) {
			this.#logger.info(`Push-to-talk tapped for ${heldMs} ms, sent the submit gesture to ${where}`);
			this.#playCue("tap", playsCues);
			return "tapped";
		}
		if (hold.isRepeating) {
			this.#logger.info(`Push-to-talk released after ${heldMs} ms, recording ended for ${where}`);
			this.#playCue("hold-end", playsCues);
			return "recording-ended";
		}

		this.#logger.info(`Push-to-talk released after ${heldMs} ms, too long for a tap and too short to record for ${where}`);
		return "released-early";
	}

	async #onRecordingStarted(key: Key, session: ClaudeSession, playsCues: boolean): Promise<void> {
		this.#logger.info(`Push-to-talk is held, recording started for session ${session.name} (process ${session.pid})`);
		this.#playCue("hold-start", playsCues);
		await key.setState(TALKING_STATE);
	}

	async #onHoldLost(key: Key, session: ClaudeSession, error: ConsoleUnreachableError): Promise<void> {
		this.#state = { kind: "idle" };
		this.#logger.error(`Push-to-talk lost session ${session.name} (process ${session.pid}) while the key was held`, error);
		await key.setState(IDLE_STATE);
		await key.showAlert();
	}

	#playCue(cue: Cue, playsCues: boolean): void {
		if (playsCues) {
			this.#cues.play(cue);
		}
	}
}

function cuesEnabled(settings: PushToTalkSettings): boolean {
	const { sounds } = settings;
	if (sounds === undefined) {
		return true;
	}
	if (typeof sounds !== "boolean") {
		throw new Error(`Setting "sounds" is not a boolean: ${JSON.stringify(sounds)}`);
	}
	return sounds;
}
