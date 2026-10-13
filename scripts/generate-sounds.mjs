import fs from "node:fs";
import path from "node:path";

const SOUNDS = path.join(import.meta.dirname, "..", "de.chrisliebaer.claude-voice.sdPlugin", "sounds");
const SAMPLE_RATE = 44100;
const PEAK = 0.3;
const ATTACK_SECONDS = 0.002;
const DECAY_SECONDS = 0.022;
const NOTE_SECONDS = 0.08;
const LOW_HZ = 660;
const HIGH_HZ = 990;
const TICK_HZ = 1320;

/**
 * Renders plucked sine notes into mono samples between -1 and 1.
 * @param notes Frequency and start time of each note.
 */
function render(notes) {
	const length = Math.ceil((Math.max(...notes.map((note) => note.startSeconds)) + NOTE_SECONDS) * SAMPLE_RATE);
	const samples = new Float64Array(length);
	for (const { frequencyHz, startSeconds } of notes) {
		const start = Math.round(startSeconds * SAMPLE_RATE);
		const count = Math.round(NOTE_SECONDS * SAMPLE_RATE);
		for (let index = 0; index < count; index++) {
			const time = index / SAMPLE_RATE;
			const envelope = Math.min(1, time / ATTACK_SECONDS) * Math.exp(-time / DECAY_SECONDS) * Math.min(1, (count - index) / (0.005 * SAMPLE_RATE));
			const phase = 2 * Math.PI * frequencyHz * time;
			samples[start + index] += envelope * (Math.sin(phase) + 0.25 * Math.sin(2 * phase));
		}
	}

	const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
	return samples.map((sample) => (sample / peak) * PEAK);
}

/**
 * Encodes mono samples as a 16-bit PCM WAV file.
 */
function encodeWav(samples) {
	const data = Buffer.alloc(samples.length * 2);
	samples.forEach((sample, index) => data.writeInt16LE(Math.round(sample * 32767), index * 2));

	const header = Buffer.alloc(44);
	header.write("RIFF", 0, "ascii");
	header.writeUInt32LE(36 + data.length, 4);
	header.write("WAVEfmt ", 8, "ascii");
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(SAMPLE_RATE, 24);
	header.writeUInt32LE(SAMPLE_RATE * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36, "ascii");
	header.writeUInt32LE(data.length, 40);
	return Buffer.concat([header, data]);
}

const cues = {
	"hold-start": [
		{ frequencyHz: LOW_HZ, startSeconds: 0 },
		{ frequencyHz: HIGH_HZ, startSeconds: 0.055 },
	],
	"hold-end": [
		{ frequencyHz: HIGH_HZ, startSeconds: 0 },
		{ frequencyHz: LOW_HZ, startSeconds: 0.055 },
	],
	tap: [{ frequencyHz: TICK_HZ, startSeconds: 0 }],
};

fs.mkdirSync(SOUNDS, { recursive: true });
for (const [name, notes] of Object.entries(cues)) {
	fs.writeFileSync(path.join(SOUNDS, `${name}.wav`), encodeWav(render(notes)));
}
