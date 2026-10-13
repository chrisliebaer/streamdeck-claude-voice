import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const shell32 = koffi.load("shell32.dll");
const kernel32 = koffi.load("kernel32.dll");

type Handle = bigint | null;
type MessageParam = number | bigint;

const WindowProc = koffi.proto("intptr_t __stdcall TrayWindowProc(void *hWnd, uint32_t uMsg, uintptr_t wParam, intptr_t lParam)");

const WNDCLASSEXW = koffi.struct("TRAY_WNDCLASSEXW", {
	cbSize: "uint32_t",
	style: "uint32_t",
	lpfnWndProc: koffi.pointer(WindowProc),
	cbClsExtra: "int32_t",
	cbWndExtra: "int32_t",
	hInstance: "void *",
	hIcon: "void *",
	hCursor: "void *",
	hbrBackground: "void *",
	lpszMenuName: "const char16_t *",
	lpszClassName: "const char16_t *",
	hIconSm: "void *",
});

const NOTIFYICONDATAW = koffi.struct("TRAY_NOTIFYICONDATAW", {
	cbSize: "uint32_t",
	hWnd: "void *",
	uID: "uint32_t",
	uFlags: "uint32_t",
	uCallbackMessage: "uint32_t",
	hIcon: "void *",
	szTip: koffi.array("char16_t", 128),
	dwState: "uint32_t",
	dwStateMask: "uint32_t",
	szInfo: koffi.array("char16_t", 256),
	uVersion: "uint32_t",
	szInfoTitle: koffi.array("char16_t", 64),
	dwInfoFlags: "uint32_t",
	guidItem: koffi.array("uint8_t", 16),
	hBalloonIcon: "void *",
});

koffi.struct("TRAY_POINT", {
	x: "int32_t",
	y: "int32_t",
});

const WNDCLASSEXW_SIZE = 80;
const NOTIFYICONDATAW_SIZE = 976;
const MSG_SIZE = 48;
for (const [type, expected] of [
	[WNDCLASSEXW, WNDCLASSEXW_SIZE],
	[NOTIFYICONDATAW, NOTIFYICONDATAW_SIZE],
] as const) {
	if (koffi.sizeof(type) !== expected) {
		throw new Error(`${type.name} is ${koffi.sizeof(type)} bytes, expected ${expected}`);
	}
}

const WINDOW_CLASS_NAME = "ClaudeVoiceDeckTray";
const ICON_ID = 1;
const PUMP_INTERVAL_MS = 50;
const TOOLTIP_MAX_LENGTH = 127;

const WS_EX_TOOLWINDOW = 0x00000080;
const WM_NULL = 0x0000;
const WM_LBUTTONUP = 0x0202;
const WM_RBUTTONUP = 0x0205;
const WM_APP = 0x8000;
const TRAY_CALLBACK_MESSAGE = WM_APP + 1;
const PM_REMOVE = 0x0001;
const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x0010;
const SM_CXSMICON = 49;
const SM_CYSMICON = 50;
const NIM_ADD = 0;
const NIM_MODIFY = 1;
const NIM_DELETE = 2;
const NIF_MESSAGE = 0x01;
const NIF_ICON = 0x02;
const NIF_TIP = 0x04;
const MF_STRING = 0x0000;
const MF_GRAYED = 0x0001;
const MF_CHECKED = 0x0008;
const MF_SEPARATOR = 0x0800;
const TPM_RIGHTBUTTON = 0x0002;
const TPM_NONOTIFY = 0x0080;
const TPM_RETURNCMD = 0x0100;

const GetLastError: () => number = kernel32.func("uint32_t __stdcall GetLastError()");
const GetModuleHandleW: (moduleName: null) => Handle = kernel32.func("void * __stdcall GetModuleHandleW(const char16_t *lpModuleName)");
const RegisterClassExW: (windowClass: object) => number = user32.func("uint16_t __stdcall RegisterClassExW(const TRAY_WNDCLASSEXW *lpwcx)");
const UnregisterClassW: (className: string, instance: Handle) => number = user32.func(
	"int __stdcall UnregisterClassW(const char16_t *lpClassName, void *hInstance)",
);
const CreateWindowExW: (
	exStyle: number,
	className: string,
	windowName: string,
	style: number,
	x: number,
	y: number,
	width: number,
	height: number,
	parent: Handle,
	menu: Handle,
	instance: Handle,
	param: null,
) => Handle = user32.func(
	"void * __stdcall CreateWindowExW(uint32_t dwExStyle, const char16_t *lpClassName, const char16_t *lpWindowName, uint32_t dwStyle, int x, int y, int nWidth, int nHeight, void *hWndParent, void *hMenu, void *hInstance, void *lpParam)",
);
const DestroyWindow: (window: Handle) => number = user32.func("int __stdcall DestroyWindow(void *hWnd)");
const DefWindowProcW: (window: Handle, message: number, wParam: MessageParam, lParam: MessageParam) => MessageParam = user32.func(
	"intptr_t __stdcall DefWindowProcW(void *hWnd, uint32_t uMsg, uintptr_t wParam, intptr_t lParam)",
);
const PeekMessageW: (message: Buffer, window: Handle, filterMin: number, filterMax: number, remove: number) => number = user32.func(
	"int __stdcall PeekMessageW(_Out_ uint8_t *lpMsg, void *hWnd, uint32_t wMsgFilterMin, uint32_t wMsgFilterMax, uint32_t wRemoveMsg)",
);
const TranslateMessage: (message: Buffer) => number = user32.func("int __stdcall TranslateMessage(const uint8_t *lpMsg)");
const DispatchMessageW: (message: Buffer) => MessageParam = user32.func("intptr_t __stdcall DispatchMessageW(const uint8_t *lpMsg)");
const PostMessageW: (window: Handle, message: number, wParam: number, lParam: number) => number = user32.func(
	"int __stdcall PostMessageW(void *hWnd, uint32_t uMsg, uintptr_t wParam, intptr_t lParam)",
);
const RegisterWindowMessageW: (name: string) => number = user32.func("uint32_t __stdcall RegisterWindowMessageW(const char16_t *lpString)");
const GetSystemMetrics: (index: number) => number = user32.func("int __stdcall GetSystemMetrics(int nIndex)");
const LoadImageW: (instance: Handle, name: string, type: number, width: number, height: number, flags: number) => Handle = user32.func(
	"void * __stdcall LoadImageW(void *hInst, const char16_t *name, uint32_t type, int cx, int cy, uint32_t fuLoad)",
);
const DestroyIcon: (icon: Handle) => number = user32.func("int __stdcall DestroyIcon(void *hIcon)");
const CreatePopupMenu: () => Handle = user32.func("void * __stdcall CreatePopupMenu()");
const AppendMenuW: (menu: Handle, flags: number, itemId: number, text: string | null) => number = user32.func(
	"int __stdcall AppendMenuW(void *hMenu, uint32_t uFlags, uintptr_t uIDNewItem, const char16_t *lpNewItem)",
);
const DestroyMenu: (menu: Handle) => number = user32.func("int __stdcall DestroyMenu(void *hMenu)");
const TrackPopupMenu: (menu: Handle, flags: number, x: number, y: number, reserved: number, window: Handle, rect: null) => number = user32.func(
	"int __stdcall TrackPopupMenu(void *hMenu, uint32_t uFlags, int x, int y, int nReserved, void *hWnd, void *prcRect)",
);
const SetForegroundWindow: (window: Handle) => number = user32.func("int __stdcall SetForegroundWindow(void *hWnd)");
const GetCursorPos: (point: { x?: number; y?: number }) => number = user32.func("int __stdcall GetCursorPos(_Out_ TRAY_POINT *lpPoint)");
const Shell_NotifyIconW: (message: number, data: object) => number = shell32.func(
	"int __stdcall Shell_NotifyIconW(uint32_t dwMessage, const TRAY_NOTIFYICONDATAW *lpData)",
);

/**
 * Entry of the menu that opens when the tray icon is clicked.
 */
export type TrayMenuEntry =
	| {
			kind: "item";
			label: string;
			checked: boolean;
			onSelect: () => void;
	  }
	| {
			/**
			 * Text that cannot be selected.
			 */
			kind: "note";
			label: string;
	  }
	| { kind: "separator" };

export type TrayOptions = {
	/**
	 * Path of the `.ico` file to show.
	 */
	iconPath: string;
	tooltip: string;

	/**
	 * Provides the menu entries each time the menu is opened.
	 */
	buildMenu: () => TrayMenuEntry[];

	/**
	 * Receives a message when the icon cannot be shown because the taskbar is not available.
	 */
	onIconUnavailable: (message: string) => void;
};

/**
 * Icon in the notification area of the Windows taskbar that opens a menu when clicked.
 *
 * Node.js does not process window messages, so the tray polls the message queue of its hidden window on a timer.
 */
export class Tray {
	readonly #options: TrayOptions;
	readonly #instance: Handle;
	readonly #windowProc: bigint;
	readonly #window: bigint;
	readonly #icon: bigint;
	readonly #taskbarCreatedMessage: number;
	readonly #pumpTimer: NodeJS.Timeout;
	readonly #message = Buffer.alloc(MSG_SIZE);
	#tooltip: string;
	#iconShown = false;
	#menuRequested = false;
	#taskbarRecreated = false;

	/**
	 * Creates the tray icon.
	 */
	constructor(options: TrayOptions) {
		this.#options = options;
		this.#tooltip = options.tooltip;
		this.#instance = GetModuleHandleW(null);

		this.#taskbarCreatedMessage = RegisterWindowMessageW("TaskbarCreated");
		if (this.#taskbarCreatedMessage === 0) {
			throw new Error(`RegisterWindowMessageW failed: Win32 error ${GetLastError()}`);
		}

		// koffi turns an exception thrown by a callback into a zero return value, so the window procedure only records
		// what happened and #pump acts on it.
		this.#windowProc = koffi.register((window: Handle, message: number, wParam: MessageParam, lParam: MessageParam): MessageParam => {
			if (message === TRAY_CALLBACK_MESSAGE) {
				const mouseMessage = Number(lParam);
				if (mouseMessage === WM_LBUTTONUP || mouseMessage === WM_RBUTTONUP) {
					this.#menuRequested = true;
				}
				return 0;
			}
			if (message === this.#taskbarCreatedMessage) {
				this.#taskbarRecreated = true;
				return 0;
			}
			return DefWindowProcW(window, message, wParam, lParam);
		}, koffi.pointer(WindowProc));

		const windowClass = {
			cbSize: WNDCLASSEXW_SIZE,
			style: 0,
			lpfnWndProc: this.#windowProc,
			cbClsExtra: 0,
			cbWndExtra: 0,
			hInstance: this.#instance,
			hIcon: null,
			hCursor: null,
			hbrBackground: null,
			lpszMenuName: null,
			lpszClassName: WINDOW_CLASS_NAME,
			hIconSm: null,
		};
		if (RegisterClassExW(windowClass) === 0) {
			throw new Error(`RegisterClassExW failed: Win32 error ${GetLastError()}`);
		}

		// The window is never shown. It is a top-level window because message-only windows do not receive the
		// TaskbarCreated broadcast.
		const window = CreateWindowExW(WS_EX_TOOLWINDOW, WINDOW_CLASS_NAME, WINDOW_CLASS_NAME, 0, 0, 0, 0, 0, null, null, this.#instance, null);
		if (!window) {
			throw new Error(`CreateWindowExW failed: Win32 error ${GetLastError()}`);
		}
		this.#window = window;

		const icon = LoadImageW(null, options.iconPath, IMAGE_ICON, GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE);
		if (!icon) {
			throw new Error(`Loading icon ${options.iconPath} failed: Win32 error ${GetLastError()}`);
		}
		this.#icon = icon;

		this.#showIcon();
		this.#pumpTimer = setInterval(() => this.#pump(), PUMP_INTERVAL_MS);
	}

	/**
	 * Replaces the text that is shown when the pointer rests on the icon.
	 */
	setTooltip(tooltip: string): void {
		this.#tooltip = tooltip;
		if (!this.#iconShown) {
			return;
		}

		if (Shell_NotifyIconW(NIM_MODIFY, this.#iconData(NIF_TIP)) === 0) {
			this.#iconShown = false;
			this.#options.onIconUnavailable("Updating the tray icon failed; it is shown again once the taskbar is available");
		}
	}

	/**
	 * Removes the icon and releases the window that backs it.
	 */
	dispose(): void {
		clearInterval(this.#pumpTimer);
		if (this.#iconShown) {
			Shell_NotifyIconW(NIM_DELETE, this.#iconData(0));
		}
		DestroyWindow(this.#window);
		UnregisterClassW(WINDOW_CLASS_NAME, this.#instance);
		DestroyIcon(this.#icon);
		koffi.unregister(this.#windowProc);
	}

	#iconData(flags: number): object {
		return {
			cbSize: NOTIFYICONDATAW_SIZE,
			hWnd: this.#window,
			uID: ICON_ID,
			uFlags: flags,
			uCallbackMessage: TRAY_CALLBACK_MESSAGE,
			hIcon: this.#icon,
			szTip: this.#tooltip.slice(0, TOOLTIP_MAX_LENGTH),
			dwState: 0,
			dwStateMask: 0,
			szInfo: "",
			uVersion: 0,
			szInfoTitle: "",
			dwInfoFlags: 0,
			guidItem: new Uint8Array(16),
			hBalloonIcon: null,
		};
	}

	#showIcon(): void {
		// Adding the icon fails while the taskbar does not exist, for example during sign-in. Windows broadcasts
		// TaskbarCreated once it does.
		this.#iconShown = Shell_NotifyIconW(NIM_ADD, this.#iconData(NIF_MESSAGE | NIF_ICON | NIF_TIP)) !== 0;
		if (!this.#iconShown) {
			this.#options.onIconUnavailable("Adding the tray icon failed; it is shown once the taskbar is available");
		}
	}

	#pump(): void {
		while (PeekMessageW(this.#message, this.#window, 0, 0, PM_REMOVE) !== 0) {
			TranslateMessage(this.#message);
			DispatchMessageW(this.#message);
		}

		if (this.#taskbarRecreated) {
			this.#taskbarRecreated = false;
			this.#showIcon();
		}
		if (this.#menuRequested) {
			this.#menuRequested = false;
			this.#showMenu();
		}
	}

	#showMenu(): void {
		const entries = this.#options.buildMenu();
		const menu = CreatePopupMenu();
		if (!menu) {
			throw new Error(`CreatePopupMenu failed: Win32 error ${GetLastError()}`);
		}

		let command: number;
		try {
			entries.forEach((entry, index) => {
				const appended =
					entry.kind === "separator"
						? AppendMenuW(menu, MF_SEPARATOR, 0, null)
						: AppendMenuW(menu, menuItemFlags(entry), index + 1, escapeMenuLabel(entry.label));
				if (appended === 0) {
					throw new Error(`AppendMenuW failed: Win32 error ${GetLastError()}`);
				}
			});

			const cursor: { x?: number; y?: number } = {};
			if (GetCursorPos(cursor) === 0 || cursor.x === undefined || cursor.y === undefined) {
				throw new Error(`GetCursorPos failed: Win32 error ${GetLastError()}`);
			}

			// The menu only closes on a click outside of it when its owner window is the foreground window. Windows may
			// refuse the request, in which case the menu still opens.
			SetForegroundWindow(this.#window);

			// Blocks until the menu closes and returns the identifier of the selected entry, or zero.
			command = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON, cursor.x, cursor.y, 0, this.#window, null);
			PostMessageW(this.#window, WM_NULL, 0, 0);
		} finally {
			DestroyMenu(menu);
		}

		if (command === 0) {
			return;
		}
		const selected = entries[command - 1];
		if (selected === undefined || selected.kind !== "item") {
			throw new Error(`Tray menu returned command ${command}, which is not a selectable entry`);
		}
		selected.onSelect();
	}
}

function menuItemFlags(entry: Exclude<TrayMenuEntry, { kind: "separator" }>): number {
	if (entry.kind === "note") {
		return MF_STRING | MF_GRAYED;
	}
	return entry.checked ? MF_STRING | MF_CHECKED : MF_STRING;
}

/**
 * Escapes the characters that a menu would otherwise interpret as an access key marker or a column separator.
 */
function escapeMenuLabel(label: string): string {
	return label.replaceAll("&", "&&").replaceAll("\t", " ");
}
