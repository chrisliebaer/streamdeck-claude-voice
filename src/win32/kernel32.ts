import koffi from "koffi";

export const kernel32 = koffi.load("kernel32.dll");

/**
 * Error code of the most recent failed Win32 call on this thread.
 */
export const GetLastError: () => number = kernel32.func("uint32_t __stdcall GetLastError()");

export const CloseHandle: (handle: number) => number = kernel32.func("int __stdcall CloseHandle(intptr_t hObject)");
