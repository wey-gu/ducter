// D206 test pictures: just enough of each format for the home to read its type and pixel size.

/** A PNG's signature and IHDR (w × h), then some bytes so two sizes differ. */
export function png(w: number, h: number, salt = 0): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  b[40] = salt & 0xff;
  return b;
}

/** A JPEG with an EXIF orientation (6 = turned a quarter) and a baseline SOF0 of w × h. */
export function jpeg(w: number, h: number, orientation = 1): Uint8Array {
  const exif = [
    0x45, 0x78, 0x69, 0x66, 0, 0, // "Exif\0\0"
    0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, // big-endian TIFF, IFD at 8
    0, 1, // one entry
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation, SHORT, 1, value
    0, 0, 0, 0,
  ];
  const app1 = [0xff, 0xe1, ((exif.length + 2) >> 8) & 0xff, (exif.length + 2) & 0xff, ...exif];
  const sof = [0xff, 0xc0, 0, 17, 8, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof, 0xff, 0xd9]);
}

export function gif(w: number, h: number): Uint8Array {
  return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 0xff, w >> 8, h & 0xff, h >> 8, 0, 0, 0]);
}

/** A lossless WebP (VP8L) header of w × h. */
export function webp(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 32, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 13, 0, 0, 0, 0x2f]);
  const v = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  b[21] = v & 0xff;
  b[22] = (v >>> 8) & 0xff;
  b[23] = (v >>> 16) & 0xff;
  b[24] = (v >>> 24) & 0xff;
  return b;
}
