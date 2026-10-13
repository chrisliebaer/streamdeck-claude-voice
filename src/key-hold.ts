import { ConsoleUnreachableError, writeKeyEvent, type ConsoleKey } from "./win32/console-input.js";

/**
 * Timing of the key-down events that a keyboard generates for a held key.
 */
export type KeyRepeatTiming = {
	/**
	 * Time between the initial key-down event and the first repeated one.
	 */
	delayMs: number;

	/**
	 * Time between two repeated key-down events.
	 */
	intervalMs: number;
};

export type KeyHoldEvents = {
	/**
	 * Invoked when the first repeated key-down event was written.
	 */
	onRepeating: () => void;

	/**
	 * Invoked when the console becomes unreachable while the key is held; the hold has ended by then.
	 */
	onLost: (error: ConsoleUnreachableError) => void;
};

/**
 * A key that is held down in the console of another process, reported to that process as repeated key-down events.
 */
export class KeyHold {
	readonly #processId: number;
	readonly #key: ConsoleKey;
	readonly #timing: KeyRepeatTiming;
	readonly #events: KeyHoldEvents;
	#timer: NodeJS.Timeout;
	#repeating = false;

	private constructor(processId: number, key: ConsoleKey, timing: KeyRepeatTiming, events: KeyHoldEvents) {
		this.#processId = processId;
		this.#key = key;
		this.#timing = timing;
		this.#events = events;
		this.#timer = this.#scheduleRepeat(timing.delayMs);
	}

	/**
	 * Presses the key and keeps repeating it until {@link KeyHold.release} is called.
	 * @param processId Process whose console receives the key.
	 * @param key Key to hold.
	 * @param timing When the repeated key-down events are written.
	 * @param events Callbacks for what happens while the key is held.
	 * @throws {ConsoleUnreachableError} When the console cannot be reached for the initial key press.
	 */
	static press(processId: number, key: ConsoleKey, timing: KeyRepeatTiming, events: KeyHoldEvents): KeyHold {
		writeKeyEvent(processId, key, "down");
		return new KeyHold(processId, key, timing, events);
	}

	/**
	 * Whether at least one repeated key-down event was written.
	 */
	get isRepeating(): boolean {
		return this.#repeating;
	}

	/**
	 * Stops repeating the key and reports its release.
	 * @throws {ConsoleUnreachableError} When the console cannot be reached for the key release.
	 */
	release(): void {
		clearTimeout(this.#timer);
		writeKeyEvent(this.#processId, this.#key, "up");
	}

	#scheduleRepeat(delayMs: number): NodeJS.Timeout {
		return setTimeout(() => {
			try {
				writeKeyEvent(this.#processId, this.#key, "down");
			} catch (error) {
				if (!(error instanceof ConsoleUnreachableError)) {
					throw error;
				}
				this.#events.onLost(error);
				return;
			}

			this.#timer = this.#scheduleRepeat(this.#timing.intervalMs);
			if (!this.#repeating) {
				this.#repeating = true;
				this.#events.onRepeating();
			}
		}, delayMs);
	}
}
