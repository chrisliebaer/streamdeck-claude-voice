import koffi from "koffi";

const winmm = koffi.load("winmm.dll");

const SND_ASYNC = 0x00000001;
const SND_NODEFAULT = 0x00000002;
const SND_FILENAME = 0x00020000;

const PlaySoundW: (sound: string, module: null, flags: number) => number = winmm.func(
	"int __stdcall PlaySoundW(const char16_t *pszSound, void *hmod, uint32_t fdwSound)",
);

/**
 * Starts playing a WAV file on the default audio output and returns without waiting for it to finish.
 *
 * A sound that is still playing from an earlier call is cut off.
 * @param file Path of the WAV file.
 * @returns `false` when Windows could not start the playback, for example because there is no audio output device.
 */
export function playWaveFile(file: string): boolean {
	return PlaySoundW(file, null, SND_FILENAME | SND_ASYNC | SND_NODEFAULT) !== 0;
}
