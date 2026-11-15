// Draws the extension icons (a blue morpho on the dark tile) into public/icons/ with no dependencies.
// Run: npm run icons. Replace the PNGs with your own art whenever you like; nothing else depends on this.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling per axis, for smooth edges

/** Inside an ellipse centred (cx, cy), half-axes (a, b), rotated by `rot` radians? */
function inEllipse(x, y, cx, cy, a, b, rot) {
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const u = (dx * c + dy * s) / a;
  const v = (-dx * s + dy * c) / b;
  return u * u + v * v <= 1;
}

/** Colour at (x, y) in 0..1 tile space, or null for transparent. */
function paint(x, y) {
  // Rounded-square tile.
  const r = 0.22;
  const qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  if (qx * qx + qy * qy > r * r) return null;

  let col = [6, 7, 12, 255];
  // Faint ASCII grid.
  const gx = (x * 8) % 1;
  const gy = (y * 8) % 1;
  if (gx < 0.04 || gy < 0.04) col = [16, 18, 30, 255];

  const m = Math.abs(x - 0.5); // mirror: both wings share one test
  const wing = (cx, cy, a, b, rot) => inEllipse(0.5 + m, y, cx, cy, a, b, rot) || inEllipse(0.5 - m, y, cx, cy, a, b, rot);
  const fore = wing(0.5 + 0.2, 0.4, 0.23, 0.15, -0.5);
  const hind = wing(0.5 + 0.14, 0.64, 0.15, 0.1, 0.55);
  if (fore || hind) {
    const t = Math.min(1, m / 0.4);
    // Edge rim darker, centre brighter, like the in-app morphos.
    col = fore ? [50 + 70 * (1 - t), 135 + 60 * (1 - t), 255, 255] : [40 + 50 * (1 - t), 105 + 60 * (1 - t), 235, 255];
    // Dark wing margin.
    const edge = fore ? !inEllipse(0.5 + m, y, 0.7, 0.4, 0.2, 0.12, -0.5) && !inEllipse(0.5 - m, y, 0.3, 0.4, 0.2, 0.12, 0.5) : false;
    if (edge) col = [22, 28, 62, 255];
  }
  // Body and feelers.
  if (inEllipse(x, y, 0.5, 0.52, 0.028, 0.2, 0)) col = [200, 210, 255, 255];
  if (inEllipse(x, y, 0.5, 0.31, 0.04, 0.04, 0)) col = [220, 228, 255, 255];
  return col;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = paint((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += c[3];
        }
      }
      const n = SS * SS;
      const covered = a / 255; // number of opaque samples
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = covered ? Math.round(r / covered) : 0;
      raw[o + 1] = covered ? Math.round(g / covered) : 0;
      raw[o + 2] = covered ? Math.round(b / covered) : 0;
      raw[o + 3] = Math.round((covered / n) * 255);
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // bit depth
  head[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size));
  console.log(`icon-${size}.png`);
}
