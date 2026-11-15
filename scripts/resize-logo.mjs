// Makes the small logo the extension ships (public/logo.png) from a big original in assets-src/.
// Keeps the transparent background, since the page uses the logo as a mask. No dependencies.
// Run: node scripts/resize-logo.mjs [source.png] [out.png] [size]
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const [src = "assets-src/logo-original-2400.png", out = "public/logo.png", sizeArg = "512"] = process.argv.slice(2);
const SIZE = Number(sizeArg);

// ── decode: 8-bit RGBA or RGB, non-interlaced ──
function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || interlace) {
    throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace}); need 8-bit RGB/RGBA`);
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

// ── resize: area average on premultiplied alpha, so soft edges don't pick up dark fringes ──
// Smallest box around everything that isn't (nearly) transparent, so the art fills the square.
function bounds({ w, h, bpp, px }) {
  if (bpp !== 4) return { x: 0, y: 0, w, h };
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(img) {
  const b = bounds(img);
  if (b.w === img.w && b.h === img.h) return img;
  const px = Buffer.alloc(b.w * b.h * img.bpp);
  for (let y = 0; y < b.h; y++) img.px.copy(px, y * b.w * img.bpp, ((b.y + y) * img.w + b.x) * img.bpp, ((b.y + y) * img.w + b.x + b.w) * img.bpp);
  return { w: b.w, h: b.h, bpp: img.bpp, px };
}

function resize({ w, h, bpp, px }, size) {
  const scale = Math.min(size / w, size / h);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const offX = Math.floor((size - tw) / 2);
  const offY = Math.floor((size - th) / 2);
  const out = Buffer.alloc(size * size * 4);
  for (let ty = 0; ty < th; ty++) {
    const y0 = (ty * h) / th, y1 = ((ty + 1) * h) / th;
    for (let tx = 0; tx < tw; tx++) {
      const x0 = (tx * w) / tw, x1 = ((tx + 1) * w) / tw;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wt = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          const i = (y * w + x) * bpp;
          const al = bpp === 4 ? px[i + 3] / 255 : 1;
          r += px[i] * al * wt; g += px[i + 1] * al * wt; b += px[i + 2] * al * wt;
          a += al * wt; wsum += wt;
        }
      }
      const o = ((ty + offY) * size + tx + offX) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / wsum) * 255);
    }
  }
  return out;
}

// ── encode ──
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encode(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const image = crop(decode(readFileSync(src)));
const png = encode(resize(image, SIZE), SIZE);
writeFileSync(out, png);
console.log(`${out}: ${SIZE}x${SIZE} from ${image.w}x${image.h} (after trimming transparent margins), ${(png.length / 1024).toFixed(0)} KB`);
