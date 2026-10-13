import { CloseHandle, GetLastError, kernel32 } from "./kernel32.js";

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const STILL_ACTIVE = 259;
const ERROR_ACCESS_DENIED = 5;
const ERROR_INVALID_PARAMETER = 87;
const FILETIME_SIZE = 8;

const OpenProcess: (desiredAccess: number, inheritHandle: number, processId: number) => number = kernel32.func(
	"intptr_t __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)",
);
const GetExitCodeProcess: (process: number, exitCode: number[]) => number = kernel32.func(
	"int __stdcall GetExitCodeProcess(intptr_t hProcess, _Out_ uint32_t *lpExitCode)",
);
const GetProcessTimes: (process: number, creation: Buffer, exit: Buffer, kernel: Buffer, user: Buffer) => number = kernel32.func(
	"int __stdcall GetProcessTimes(intptr_t hProcess, _Out_ uint8_t *lpCreationTime, _Out_ uint8_t *lpExitTime, _Out_ uint8_t *lpKernelTime, _Out_ uint8_t *lpUserTime)",
);

/**
 * State of a process ID at the time of the probe.
 */
export type ProcessProbe =
	| {
			state: "running";

			/**
			 * Creation time as a `FILETIME` value, which together with the process ID identifies the process.
			 */
			creationTime: bigint;
	  }
	| { state: "gone" }
	| { state: "inaccessible" };

/**
 * Determines whether a process is running and when it was created.
 * @param processId Process ID to look up.
 */
export function probeProcess(processId: number): ProcessProbe {
	const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, processId);
	if (Number(handle) === 0) {
		const error = GetLastError();
		switch (error) {
			case ERROR_INVALID_PARAMETER:
				return { state: "gone" };
			case ERROR_ACCESS_DENIED:
				return { state: "inaccessible" };
			default:
				throw new Error(`OpenProcess for process ${processId} failed: Win32 error ${error}`);
		}
	}

	try {
		const exitCode = [0];
		if (GetExitCodeProcess(handle, exitCode) === 0) {
			throw new Error(`GetExitCodeProcess for process ${processId} failed: Win32 error ${GetLastError()}`);
		}
		if (exitCode[0] !== STILL_ACTIVE) {
			return { state: "gone" };
		}

		const creation = Buffer.alloc(FILETIME_SIZE);
		const exit = Buffer.alloc(FILETIME_SIZE);
		const kernel = Buffer.alloc(FILETIME_SIZE);
		const user = Buffer.alloc(FILETIME_SIZE);
		if (GetProcessTimes(handle, creation, exit, kernel, user) === 0) {
			throw new Error(`GetProcessTimes for process ${processId} failed: Win32 error ${GetLastError()}`);
		}

		return { state: "running", creationTime: creation.readBigUInt64LE(0) };
	} finally {
		CloseHandle(handle);
	}
}
