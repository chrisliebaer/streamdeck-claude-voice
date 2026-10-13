import fs from "node:fs";
import path from "node:path";

import { playWaveFile } from "./win32/sound.js";

/**
 * Audible feedback for what the push-to-talk action did.
 */
export type Cue = "hold-start" | "hold-end" | "tap";

const CUES: readonly Cue[] = ["hold-start", "hold-end", "tap"];

/**
 * Plays the sound files of the cues.
 */
export class CuePlayer {
	readonly #directory: string;
	readonly #onPlaybackFailed: (cue: Cue) => void;

	/**
	 * @param directory Directory that contains one `.wav` file per cue.
	 * @param onPlaybackFailed Invoked when Windows could not start playing a cue.
	 */
	constructor(directory: string, onPlaybackFailed: (cue: Cue) => void) {
		for (const cue of CUES) {
			const file = path.join(directory, `${cue}.wav`);
			if (!fs.existsSync(file)) {
				throw new Error(`Sound file ${file} is missing`);
			}
		}

		this.#directory = directory;
		this.#onPlaybackFailed = onPlaybackFailed;
	}

	play(cue: Cue): void {
		if (!playWaveFile(path.join(this.#directory, `${cue}.wav`))) {
			this.#onPlaybackFailed(cue);
		}
	}
}
