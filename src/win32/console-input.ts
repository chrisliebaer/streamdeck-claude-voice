import koffi from "koffi";

import { CloseHandle, GetLastError, kernel32 } from "./kernel32.js";

const user32 = koffi.load("user32.dll");

const KEY_EVENT_RECORD = koffi.struct("KEY_EVENT_RECORD", {
	bKeyDown: "int32_t",
	wRepeatCount: "uint16_t",
	wVirtualKeyCode: "uint16_t",
	wVirtualScanCode: "uint16_t",
	UnicodeChar: "uint16_t",
	dwControlKeyState: "uint32_t",
});

const INPUT_RECORD = koffi.struct("INPUT_RECORD", {
	EventType: "uint16_t",
	KeyEvent: KEY_EVENT_RECORD,
});

const INPUT_RECORD_SIZE = 20;
if (koffi.sizeof(INPUT_RECORD) !== INPUT_RECORD_SIZE) {
	throw new Error(`INPUT_RECORD is ${koffi.sizeof(INPUT_RECORD)} bytes, expected ${INPUT_RECORD_SIZE}`);
}

const KEY_EVENT = 0x0001;
const LEFT_ALT_PRESSED = 0x0002;
const VK_SPACE = 0x20;
const GENERIC_READ_WRITE = 0xc0000000;
const FILE_SHARE_READ_WRITE = 0x00000003;
const OPEN_EXISTING = 3;
const INVALID_HANDLE_VALUE = -1;
const MAPVK_VK_TO_VSC = 0;

const FreeConsole: () => number = kernel32.func("int __stdcall FreeConsole()");
const AttachConsole: (processId: number) => number = kernel32.func("int __stdcall AttachConsole(uint32_t dwProcessId)");
const CreateFileW: (
	fileName: string,
	desiredAccess: number,
	shareMode: number,
	securityAttributes: null,
	creationDisposition: number,
	flagsAndAttributes: number,
	templateFile: number,
) => number = kernel32.func(
	"intptr_t __stdcall CreateFileW(const char16_t *lpFileName, uint32_t dwDesiredAccess, uint32_t dwShareMode, void *lpSecurityAttributes, uint32_t dwCreationDisposition, uint32_t dwFlagsAndAttributes, intptr_t hTemplateFile)",
);
const WriteConsoleInputW: (consoleInput: number, records: object[], length: number, written: number[]) => number = kernel32.func(
	"int __stdcall WriteConsoleInputW(intptr_t hConsoleInput, const INPUT_RECORD *lpBuffer, uint32_t nLength, _Out_ uint32_t *lpNumberOfEventsWritten)",
);
const MapVirtualKeyW: (code: number, mapType: number) => number = user32.func("uint32_t __stdcall MapVirtualKeyW(uint32_t uCode, uint32_t uMapType)");

/**
 * Key press as a console application receives it from the keyboard.
 */
export class ConsoleKey {
	readonly virtualKey: number;
	readonly scanCode: number;
	readonly charCode: number;
	readonly controlKeyState: number;

	private constructor(virtualKey: number, charCode: number, controlKeyState: number) {
		this.virtualKey = virtualKey;
		this.scanCode = MapVirtualKeyW(virtualKey, MAPVK_VK_TO_VSC);
		this.charCode = charCode;
		this.controlKeyState = controlKeyState;
	}

	/**
	 * Space bar without modifiers.
	 */
	static space(): ConsoleKey {
		return new ConsoleKey(VK_SPACE, " ".charCodeAt(0), 0);
	}

	/**
	 * Letter key pressed together with the left Alt key, which terminals report as `meta+<letter>`.
	 * @param letter Single lowercase letter from `a` to `z`.
	 */
	static altLetter(letter: string): ConsoleKey {
		if (!/^[a-z]$/.test(letter)) {
			throw new Error(`Expected a single lowercase letter, got ${JSON.stringify(letter)}`);
		}

		return new ConsoleKey(letter.toUpperCase().charCodeAt(0), letter.charCodeAt(0), LEFT_ALT_PRESSED);
	}
}

/**
 * The console of the target process could not be attached to, for example because the process has exited or runs elevated.
 */
export class ConsoleUnreachableError extends Error {
	readonly processId: number;
	readonly win32Error: number;

	constructor(processId: number, win32Error: number) {
		super(`Cannot attach to the console of process ${processId}: Win32 error ${win32Error}`);
		this.name = "ConsoleUnreachableError";
		this.processId = processId;
		this.win32Error = win32Error;
	}
}

/**
 * Writes a single key event into the console input buffer of another process.
 *
 * The calling process is attached to the target console only for the duration of the write, because console control
 * events such as closing the terminal tab are delivered to every attached process.
 * @param processId Process whose console receives the event.
 * @param key Key to report.
 * @param direction Whether the key is pressed or released.
 * @throws {ConsoleUnreachableError} When the console of the process cannot be attached to.
 */
export function writeKeyEvent(processId: number, key: ConsoleKey, direction: "down" | "up"): void {
	// Fails when this process has no console, which is the regular state between writes.
	FreeConsole();

	if (AttachConsole(processId) === 0) {
		throw new ConsoleUnreachableError(processId, GetLastError());
	}

	try {
		const consoleInput = CreateFileW("CONIN$", GENERIC_READ_WRITE, FILE_SHARE_READ_WRITE, null, OPEN_EXISTING, 0, 0);
		if (Number(consoleInput) === INVALID_HANDLE_VALUE) {
			throw new Error(`Opening CONIN$ of process ${processId} failed: Win32 error ${GetLastError()}`);
		}

		try {
			const record = {
				EventType: KEY_EVENT,
				KeyEvent: {
					bKeyDown: direction === "down" ? 1 : 0,
					wRepeatCount: 1,
					wVirtualKeyCode: key.virtualKey,
					wVirtualScanCode: key.scanCode,
					UnicodeChar: key.charCode,
					dwControlKeyState: key.controlKeyState,
				},
			};
			const written = [0];
			if (WriteConsoleInputW(consoleInput, [record], 1, written) === 0) {
				throw new Error(`WriteConsoleInputW for process ${processId} failed: Win32 error ${GetLastError()}`);
			}
			if (written[0] !== 1) {
				throw new Error(`WriteConsoleInputW for process ${processId} wrote ${written[0]} of 1 records`);
			}
		} finally {
			CloseHandle(consoleInput);
		}
	} finally {
		FreeConsole();
	}
}
