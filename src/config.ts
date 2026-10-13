import type { KeyRepeatTiming } from "./key-hold.js";
import { ConsoleKey } from "./win32/console-input.js";

/**
 * Key written into the console of the target session.
 *
 * It has to be the key that Claude Code binds to `voice:pushToTalk` in the `Chat` context, which is `Space` unless
 * `~/.claude/keybindings.json` says otherwise.
 */
export const PUSH_TO_TALK_KEY = ConsoleKey.space();

/**
 * Key-down events written while the action is held.
 *
 * A terminal does not report key releases. Claude Code recognizes a held key by its rapid repeats and ends the
 * recording once they stop arriving.
 *
 * After inserting a transcript, Claude Code submits the prompt when the push-to-talk key is pressed twice within
 * 300 ms. The delay before the first repeat is longer than that window, so that holding the action again continues
 * the dictation instead of submitting it.
 */
export const KEY_REPEAT_TIMING: KeyRepeatTiming = {
	delayMs: 350,
	intervalMs: 30,
};

/**
 * Longest press of the action that counts as a tap.
 *
 * A tap writes a second key press when the action is released, which completes the double press that makes Claude
 * Code submit the prompt. The value leaves a margin to the 300 ms window of that gesture.
 */
export const TAP_MAX_DURATION_MS = 150;
