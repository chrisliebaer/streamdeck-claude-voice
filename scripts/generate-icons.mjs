import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const IMAGES = path.join(import.meta.dirname, "..", "de.chrisliebaer.claude-voice.sdPlugin", "imgs");
const BACKGROUND = [0xd9, 0x77, 0x57];
const GLYPH = [0xff, 0xff, 0xff];
const SAMPLES_PER_AXIS = 4;
const ICO_SIZES = [16, 20, 24, 32, 48];
const STROKE_RADIUS = 0.032;

/**
 * Distance from a point to the line segment between two points.
 */
function segmentDistance(x, y, ax, ay, bx, by) {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSquared = dx * dx + dy * dy;
	const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
	return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * Whether a point of the unit square lies inside the rounded square that forms the icon background.
 */
function insideBackground(x, y) {
	const halfSize = 0.48;
	const radius = 0.22;
	const qx = Math.abs(x - 0.5) - (halfSize - radius);
	const qy = Math.abs(y - 0.5) - (halfSize - radius);
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= radius;
}

/**
 * Whether a point of the unit square lies inside the microphone glyph.
 */
function insideGlyph(x, y) {
	const capsule = segmentDistance(x, y, 0.5, 0.3, 0.5, 0.47) <= 0.105;
	const holderArc = y >= 0.47 && Math.abs(Math.hypot(x - 0.5, y - 0.47) - 0.2) <= STROKE_RADIUS;
	const holderLeft = segmentDistance(x, y, 0.3, 0.42, 0.3, 0.47) <= STROKE_RADIUS;
	const holderRight = segmentDistance(x, y, 0.7, 0.42, 0.7, 0.47) <= STROKE_RADIUS;
	const stem = segmentDistance(x, y, 0.5, 0.67, 0.5, 0.77) <= STROKE_RADIUS;
	const base = segmentDistance(x, y, 0.4, 0.77, 0.6, 0.77) <= STROKE_RADIUS;
	return capsule || holderArc || holderLeft || holderRight || stem || base;
}

/**
 * Renders the icon as top-down RGBA pixels with straight alpha.
 */
function render(size) {
	const pixels = Buffer.alloc(size * size * 4);
	const sampleCount = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS;
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			const sum = [0, 0, 0];
			let covered = 0;
			for (let sy = 0; sy < SAMPLES_PER_AXIS; sy++) {
				for (let sx = 0; sx < SAMPLES_PER_AXIS; sx++) {
					const x = (px + (sx + 0.5) / SAMPLES_PER_AXIS) / size;
					const y = (py + (sy + 0.5) / SAMPLES_PER_AXIS) / size;
					if (!insideBackground(x, y)) {
						continue;
					}
					const color = insideGlyph(x, y) ? GLYPH : BACKGROUND;
					sum[0] += color[0];
					sum[1] += color[1];
					sum[2] += color[2];
					covered++;
				}
			}

			const offset = (py * size + px) * 4;
			if (covered > 0) {
				pixels[offset] = Math.round(sum[0] / covered);
				pixels[offset + 1] = Math.round(sum[1] / covered);
				pixels[offset + 2] = Math.round(sum[2] / covered);
			}
			pixels[offset + 3] = Math.round((covered / sampleCount) * 255);
		}
	}
	return pixels;
}

function pngChunk(type, data) {
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(zlib.crc32(body));
	return Buffer.concat([length, body, checksum]);
}

function encodePng(size) {
	const pixels = render(size);
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header.writeUInt8(8, 8);
	header.writeUInt8(6, 9);

	const rowLength = size * 4;
	const scanlines = Buffer.alloc(size * (rowLength + 1));
	for (let row = 0; row < size; row++) {
		pixels.copy(scanlines, row * (rowLength + 1) + 1, row * rowLength, (row + 1) * rowLength);
	}

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk("IHDR", header),
		pngChunk("IDAT", zlib.deflateSync(scanlines)),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

/**
 * Encodes one icon image as a 32-bit device-independent bitmap, the format every Windows version reads for small icons.
 */
function encodeIcoImage(size) {
	const pixels = render(size);
	const header = Buffer.alloc(40);
	header.writeUInt32LE(40, 0);
	header.writeInt32LE(size, 4);
	header.writeInt32LE(size * 2, 8);
	header.writeUInt16LE(1, 12);
	header.writeUInt16LE(32, 14);

	const color = Buffer.alloc(size * size * 4);
	for (let row = 0; row < size; row++) {
		for (let column = 0; column < size; column++) {
			const source = ((size - 1 - row) * size + column) * 4;
			const target = (row * size + column) * 4;
			color[target] = pixels[source + 2];
			color[target + 1] = pixels[source + 1];
			color[target + 2] = pixels[source];
			color[target + 3] = pixels[source + 3];
		}
	}

	const maskRowLength = Math.ceil(size / 32) * 4;
	return Buffer.concat([header, color, Buffer.alloc(maskRowLength * size)]);
}

function encodeIco(sizes) {
	const images = sizes.map(encodeIcoImage);
	const directory = Buffer.alloc(6 + sizes.length * 16);
	directory.writeUInt16LE(1, 2);
	directory.writeUInt16LE(sizes.length, 4);

	let imageOffset = directory.length;
	sizes.forEach((size, index) => {
		const entry = 6 + index * 16;
		directory.writeUInt8(size, entry);
		directory.writeUInt8(size, entry + 1);
		directory.writeUInt16LE(1, entry + 4);
		directory.writeUInt16LE(32, entry + 6);
		directory.writeUInt32LE(images[index].length, entry + 8);
		directory.writeUInt32LE(imageOffset, entry + 12);
		imageOffset += images[index].length;
	});

	return Buffer.concat([directory, ...images]);
}

fs.mkdirSync(path.join(IMAGES, "plugin"), { recursive: true });
fs.writeFileSync(path.join(IMAGES, "plugin", "marketplace.png"), encodePng(256));
fs.writeFileSync(path.join(IMAGES, "plugin", "marketplace@2x.png"), encodePng(512));
fs.writeFileSync(path.join(IMAGES, "tray.ico"), encodeIco(ICO_SIZES));
