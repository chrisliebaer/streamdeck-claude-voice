import type { ClaudeSession } from "./sessions.js";

/**
 * Which session receives voice input.
 */
export type TargetSelection =
	| { mode: "automatic" }
	| {
			mode: "pinned";
			sessionId: string;

			/**
			 * Name of the session at the time it was pinned.
			 */
			name: string;
	  };

export type TargetResolution = { kind: "session"; session: ClaudeSession } | { kind: "none" };

/**
 * Holds the user's choice of target session and resolves it against the running sessions.
 */
export class TargetSelector {
	readonly #onChange: (selection: TargetSelection) => void;
	#selection: TargetSelection = { mode: "automatic" };

	/**
	 * @param onChange Invoked after the selection changed.
	 */
	constructor(onChange: (selection: TargetSelection) => void) {
		this.#onChange = onChange;
	}

	get selection(): TargetSelection {
		return this.#selection;
	}

	/**
	 * Short text that names the selection on a key or in a tooltip.
	 */
	get label(): string {
		return this.#selection.mode === "automatic" ? "auto" : this.#selection.name;
	}

	selectAutomatic(): void {
		this.#select({ mode: "automatic" });
	}

	pin(session: ClaudeSession): void {
		this.#select({ mode: "pinned", sessionId: session.sessionId, name: session.name });
	}

	/**
	 * Determines the session that receives voice input.
	 *
	 * In automatic mode this is the session whose status changed most recently. A pinned session that is no longer
	 * running resets the selection to automatic mode.
	 * @param sessions Sessions that are currently running and reachable.
	 */
	resolve(sessions: readonly ClaudeSession[]): TargetResolution {
		if (this.#selection.mode === "pinned") {
			const sessionId = this.#selection.sessionId;
			const pinned = sessions.find((session) => session.sessionId === sessionId);
			if (pinned !== undefined) {
				return { kind: "session", session: pinned };
			}
			this.selectAutomatic();
		}

		const [first, ...rest] = sessions;
		if (first === undefined) {
			return { kind: "none" };
		}

		const mostRecent = rest.reduce((best, session) => (session.statusUpdatedAt > best.statusUpdatedAt ? session : best), first);
		return { kind: "session", session: mostRecent };
	}

	#select(selection: TargetSelection): void {
		this.#selection = selection;
		this.#onChange(selection);
	}
}
