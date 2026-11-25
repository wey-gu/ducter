// D562: an app's own icon, for a Home Screen (the web and the phone) and the Mac's Dock: its mark
// (APP_GLYPHS, the 20-grid strokes the tile draws) pressed into its clay (the person's muted tint),
// drawn here as a PNG so every device shows the same picture with nothing to install. Two shapes:
// "full", the whole square in clay (iOS and Android mask it themselves), and "mac", the clay body on
// the macOS icon grid (824 of 1024, centred) standing on its ledge with a soft shadow, as Ducter's
// own icon does. Pure TypeScript: a path flattened to segments, strokes drawn by their distance
// (round ends and joins, as the tile's), a superellipse body, and a PNG written with node:zlib.
import { deflateSync } from "node:zlib";
import { APP_GLYPH_STROKE, APP_GLYPHS, appIcon, appTint, type AppIcon, type AppMeta, type AppTint } from "@ducter/protocol";

/** The person's six clays (light, the tile's `--tint-*`), the mark's ink, and each clay's ledge. */
export const APP_TINT_RGB: Record<AppTint, [number, number, number]> = {
  clay: [0xf3, 0xcf, 0xb4],
  sand: [0xed, 0xdc, 0xb2],
  sage: [0xd3, 0xdf, 0xc4],
  mist: [0xcf, 0xda, 0xe6],
  lilac: [0xe1, 0xd3, 0xe8],
  stone: [0xdd, 0xd5, 0xca],
};
const INK: [number, number, number] = [0x3b, 0x2d, 0x22];

type Pt = [number, number];

/** SVG path data (the marks' subset and more: M L H V C S Q T A Z, both cases) as polylines. */
export function flattenPath(d: string): Pt[][] {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, cmd = "", i = 0;
  const num = () => Number(toks[i++]);
  const line = (nx: number, ny: number) => (cur.push([nx, ny]), (x = nx), (y = ny));
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    for (let k = 1; k <= 16; k++) {
      const t = k / 16, u = 1 - t;
      cur.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey]);
    }
    (cx = x2), (cy = y2), (x = ex), (y = ey);
  };
  const arc = (rx: number, ry: number, rot: number, large: number, sweep: number, ex: number, ey: number) => {
    // The endpoint arc as its centre (SVG 1.1, F.6.5).
    rx = Math.abs(rx), ry = Math.abs(ry);
    if (!rx || !ry) return line(ex, ey);
    const phi = (rot * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
    const dx = (x - ex) / 2, dy = (y - ey) / 2;
    const x1 = cs * dx + sn * dy, y1 = -sn * dx + cs * dy;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) (rx *= Math.sqrt(lam)), (ry *= Math.sqrt(lam));
    const s = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    const ccx = (s * rx * y1) / ry, ccy = (-s * ry * x1) / rx;
    const mx = cs * ccx - sn * ccy + (x + ex) / 2, my = sn * ccx + cs * ccy + (y + ey) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t0 = ang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry);
    let dt = ang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
    for (let k = 1; k <= n; k++) {
      const t = t0 + (dt * k) / n;
      cur.push([mx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn, my + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs]);
    }
    (x = ex), (y = ey);
  };
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i]!)) cmd = toks[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        if (cur.length > 1) out.push(cur);
        const nx = num() + ox, ny = num() + oy;
        cur = [[nx, ny]];
        (x = nx), (y = ny), (sx = nx), (sy = ny);
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": line(num() + ox, num() + oy); break;
      case "H": line(num() + ox, y); break;
      case "V": line(x, num() + oy); break;
      case "C": { const a = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy]; cubic(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!); break; }
      case "S": { const a = [num() + ox, num() + oy, num() + ox, num() + oy]; cubic(2 * x - cx, 2 * y - cy, a[0]!, a[1]!, a[2]!, a[3]!); break; }
      case "Q": { const qx = num() + ox, qy = num() + oy, ex = num() + ox, ey = num() + oy; cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey); break; }
      case "T": line(num() + ox, num() + oy); break;
      case "A": { const a = [num(), num(), num(), num(), num(), num() + ox, num() + oy]; arc(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!); break; }
      case "Z":
        line(sx, sy);
        if (cur.length > 1) out.push(cur);
        cur = [[sx, sy]];
        break;
      default:
        i++;
    }
    if (cmd.toUpperCase() !== "C" && cmd.toUpperCase() !== "S" && cmd.toUpperCase() !== "Q") (cx = x), (cy = y);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Each pixel's distance (in pixels) to the polylines placed at scale s and offset (ox, oy). */
function distanceField(lines: Pt[][], size: number, s: number, ox: number, oy: number, reach: number): Float32Array {
  const d = new Float32Array(size * size).fill(1e9);
  for (const pl of lines)
    for (let k = 1; k < pl.length; k++) {
      const ax = pl[k - 1]![0] * s + ox, ay = pl[k - 1]![1] * s + oy, bx = pl[k]![0] * s + ox, by = pl[k]![1] * s + oy;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + reach));
      const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1e-9;
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const qx = px + 0.5 - ax, qy = py + 0.5 - ay;
          const t = Math.max(0, Math.min(1, (qx * vx + qy * vy) / vv));
          const ex = qx - t * vx, ey = qy - t * vy;
          const dist = Math.sqrt(ex * ex + ey * ey);
          const at = py * size + px;
          if (dist < d[at]!) d[at] = dist;
        }
    }
  return d;
}

/** A superellipse (n = 5, near Apple's continuous corners): its signed distance, roughly, in pixels. */
function squircle(px: number, py: number, cx: number, cy: number, half: number): number {
  const u = Math.abs(px - cx) / half, v = Math.abs(py - cy) / half;
  return (Math.pow(Math.pow(u, 5) + Math.pow(v, 5), 1 / 5) - 1) * half;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** RGBA pixels as a PNG. */
export function encodePng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(12 + data.length);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, data.length);
    for (let k = 0; k < 4; k++) b[4 + k] = type.charCodeAt(k);
    b.set(data, 8);
    dv.setUint32(8 + data.length, crc32(b.subarray(4, 8 + data.length)));
    return b;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w), dv.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
}

let CRC: Uint32Array | undefined;
function crc32(b: Uint8Array): number {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let k = 0; k < b.length; k++) c = CRC[(c ^ b[k]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type AppIconShape = "full" | "mac";

/**
 * The app's icon as RGBA pixels, size × size. "full": the clay fills the square, the mark at 54% of
 * it (inside Android's maskable circle). "mac": the macOS grid, a body of 824/1024 with the clay's ledge
 * under it and a soft shadow, the mark at 52% of the body.
 */
export function drawAppIcon(icon: AppIcon, tint: AppTint, size: number, shape: AppIconShape): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const [tr, tg, tb] = APP_TINT_RGB[tint] ?? APP_TINT_RGB.clay;
  const mac = shape === "mac";
  const body = mac ? size * (824 / 1024) : size;
  const half = body / 2;
  const cx = size / 2, cy = mac ? size / 2 - size * 0.012 : size / 2;
  const ledge = mac ? body * 0.03 : 0;
  // The clay a shade deeper at the bottom (an object, not a flat swatch); its ledge darker still.
  const shade = (k: number): [number, number, number] => [tr * k, tg * k, tb * k];
  const ledgeRgb: [number, number, number] = [tr * 0.62 + INK[0] * 0.14, tg * 0.62 + INK[1] * 0.14, tb * 0.62 + INK[2] * 0.14].map((v) => Math.min(255, v / 0.76)) as [number, number, number];
  // The mark: the 20-grid path, its strokes 1.6 wide; a light edge above, a ledge below, the ink between.
  const lines = flattenPath(APP_GLYPHS[icon] ?? APP_GLYPHS.window);
  const gs = (body * (mac ? 0.52 : 0.54)) / 20;
  const gx = cx - 10 * gs, gy = cy - 10 * gs;
  // A touch bolder than the tile (1.15x), so the mark still reads at 16 and 32 in the Dock.
  const r = (APP_GLYPH_STROKE * 1.15 * gs) / 2;
  const ink = distanceField(lines, size, gs, gx, gy, r + 2);
  const hi = distanceField(lines, size, gs, gx, gy - 0.45 * gs, r + 2);
  const low = distanceField(lines, size, gs, gx, gy + 0.7 * gs, r + 2);
  const lowRgb: [number, number, number] = [tr * 0.78, tg * 0.78, tb * 0.78];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = y * size + x;
      const fx = x + 0.5, fy = y + 0.5;
      let a = 0, R = 0, G = 0, B = 0;
      const over = (cr: number, cg: number, cb: number, ca: number) => {
        // "source over" in straight alpha.
        const na = ca + a * (1 - ca);
        if (na <= 0) return;
        R = (cr * ca + R * a * (1 - ca)) / na;
        G = (cg * ca + G * a * (1 - ca)) / na;
        B = (cb * ca + B * a * (1 - ca)) / na;
        a = na;
      };
      if (mac) {
        // A soft shadow, then the ledge, then the body.
        const sd = squircle(fx, fy, cx, cy + body * 0.035, half);
        const sh = clamp01(1 - (sd + size * 0.004) / (size * 0.028)) * 0.26;
        if (sh > 0) over(40, 26, 14, sh);
        const ld = squircle(fx, fy, cx, cy + ledge, half);
        const la = clamp01(0.5 - ld);
        if (la > 0) over(ledgeRgb[0], ledgeRgb[1], ledgeRgb[2], la);
      }
      const bd = mac ? squircle(fx, fy, cx, cy, half) : -1;
      const ba = mac ? clamp01(0.5 - bd) : 1;
      if (ba > 0) {
        const k = 1.035 - 0.07 * clamp01((fy - (cy - half)) / body);
        const [br, bg, bb] = shade(k);
        over(Math.min(255, br), Math.min(255, bg), Math.min(255, bb), ba);
        // The mark, pressed in (only inside the body).
        const cov = (dist: number) => clamp01(r - dist + 0.5) * ba;
        const l = cov(low[at]!), h = cov(hi[at]!), n = cov(ink[at]!);
        if (l > 0) over(lowRgb[0], lowRgb[1], lowRgb[2], l);
        if (h > 0) over(255, 250, 244, h * 0.85);
        if (n > 0) over(INK[0], INK[1], INK[2], n);
      }
      px[at * 4] = Math.round(R);
      px[at * 4 + 1] = Math.round(G);
      px[at * 4 + 2] = Math.round(B);
      px[at * 4 + 3] = Math.round(a * 255);
    }
  return px;
}

const cache = new Map<string, Uint8Array>();

/** The icon as a PNG (kept, a few dozen at most: by mark, clay, size and shape). */
export function appIconPng(icon: AppIcon, tint: AppTint, size: number, shape: AppIconShape): Uint8Array {
  const key = `${icon}:${tint}:${size}:${shape}`;
  let png = cache.get(key);
  if (!png) {
    png = encodePng(drawAppIcon(icon, tint, size, shape), size, size);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    cache.set(key, png);
  }
  return png;
}

/** The sizes the home draws: a Home Screen's (180, 192, 512) and the Dock's (16 to 1024). */
export const APP_ICON_SIZES = [16, 32, 64, 128, 180, 192, 256, 512, 1024] as const;

/**
 * D562: what the home answers at `/app-icon/<id>/<key>/…` (`base` is that folder): `icon-<size>.png`
 * (the full square, for a Home Screen), `mac-<size>.png` (the Dock's), or the Home Screen manifest,
 * which opens straight into the app (`/app?app=<id>`), standalone, as its own app (its own `id`).
 */
export function appIconResponse(m: Pick<AppMeta, "id" | "name" | "icon" | "tint" | "kind" | "ask">, shape: "icon" | "mac" | undefined, size: number, base: string): Response {
  const headers = { "cache-control": "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
  const mark = appIcon(m);
  const tint = appTint(m);
  if (shape) {
    if (!(APP_ICON_SIZES as readonly number[]).includes(size)) return new Response("no such size", { status: 404, headers });
    return new Response(appIconPng(mark, tint, size, shape === "mac" ? "mac" : "full"), { headers: { ...headers, "content-type": "image/png" } });
  }
  const [r, g, b] = APP_TINT_RGB[tint];
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const manifest = {
    id: `/app?app=${m.id}`,
    name: m.name,
    short_name: m.name,
    start_url: `/app?app=${m.id}#app=${m.id}`,
    scope: "/",
    display: "standalone",
    background_color: `#${hex(r)}${hex(g)}${hex(b)}`,
    theme_color: "#FFF6EA",
    icons: [192, 512].map((s) => ({ src: `${base}icon-${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" })).concat([{ src: `${base}icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" }]),
  };
  return new Response(JSON.stringify(manifest), { headers: { ...headers, "content-type": "application/manifest+json" } });
}
