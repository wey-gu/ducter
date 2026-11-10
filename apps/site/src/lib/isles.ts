// The Isles (D81) as the site draws them: the desktop app's Devices stage
// (apps/desktop/internal/views/isles.go), laid out at build time in two design spaces, a wide
// one and a narrow one for phones. Everything here is in design units; the page scales them with
// the stage (1 unit = stage width / W), so the clay, the bridges and the sea stay in proportion
// at any width, while the words keep their own sizes.
import art from "../art.json";

type Art = keyof typeof art;
export interface Box { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }

/** A device on stage. Only the home one carries Ducter; a phone stands on a smaller islet. */
export interface Device {
  key: string;
  name: string;
  /** The one line under its name, only when something is unusual (D69, D81). */
  line?: string;
  art: Art;
  home?: boolean;
  phone?: boolean;
  /** How its clay idles (D77): an awake device floats, a cloud machine drifts, a sleeping one's blanket breathes. */
  idle: "float" | "drift" | "blanket" | "still";
  /** The AI accounts signed in on it. */
  tokens: string[];
  /** Parcels cross its bridge: a task really runs there now. */
  working?: boolean;
  /** Asleep: its bridge relaxes a little. */
  asleep?: boolean;
}

export const devices: Device[] = [
  { key: "home", name: "This Mac", art: "laptop_awake", home: true, idle: "float", tokens: ["claude-code", "codex"] },
  { key: "cloud", name: "cloud-1", line: "Working on 1 task", art: "server_awake", idle: "drift", tokens: ["claude-code"], working: true },
  { key: "mini", name: "Mac mini", line: "Asleep · carries on when it wakes", art: "mini_asleep", idle: "blanket", tokens: ["codex"], asleep: true },
  { key: "phone", name: "iPhone", art: "phone", phone: true, idle: "float", tokens: [] },
];

export const accounts: Record<string, { name: string; art: Art }> = {
  "claude-code": { name: "Claude Code", art: "coin_claude_code" },
  codex: { name: "Codex", art: "coin_codex" },
};

/** The abilities in front of home: an empty well to fill, and one that is on. */
export const dock = [
  { id: "web", name: "Browse the web", on: false },
  { id: "remote", name: "Reach from anywhere", on: true },
] as const;

interface Spot { cx: number; top: number; w: number }
interface LayoutSpec {
  W: number;
  H: number;
  spots: Record<string, Spot>;
  /** An ability's object in front of home, and the room between two. */
  dockSize: number;
  dockGap: number;
  /** An AI account's token, and the room between two on one island. */
  token: number;
  tokenGap: number;
  /** The widest a tag under an island may be (it wraps past this). */
  tagMax: number;
  /** One design unit in CSS pixels at the size this layout is usually seen (to size words). */
  px: number;
}

// The wide stage (beside the list, ~880 px) and the narrow one (a phone, ~360 px).
export const specs: Record<"wide" | "narrow", LayoutSpec> = {
  wide: {
    W: 880, H: 720, px: 1,
    spots: {
      home: { cx: 432, top: 284, w: 392 },
      cloud: { cx: 728, top: 172, w: 200 },
      mini: { cx: 146, top: 190, w: 196 },
      phone: { cx: 312, top: 58, w: 112 },
    },
    dockSize: 140, dockGap: 30, token: 34, tokenGap: 6, tagMax: 230,
  },
  narrow: {
    W: 400, H: 780, px: 0.9,
    spots: {
      home: { cx: 196, top: 346, w: 330 },
      cloud: { cx: 312, top: 140, w: 156 },
      mini: { cx: 88, top: 150, w: 152 },
      phone: { cx: 204, top: 50, w: 92 },
    },
    dockSize: 124, dockGap: 18, token: 30, tokenGap: 16, tagMax: 164,
  },
};

const aspect = (a: Art) => art[a].h / art[a].w;

/** A device's clay width as a share of its island's (isles.go deviceSize). */
function share(d: Device) {
  if (d.phone) return 0.34;
  switch (d.art) {
    case "laptop_awake": return d.home ? 0.54 : 0.7;
    case "mini_asleep": return d.home ? 0.52 : 0.7;
    case "server_awake": return 0.7;
  }
  return 0.7;
}

// Rough widths of words, for laying tokens and the dock out (the page sets the real ones).
const wordW = (s: string, size: number) => s.length * size * 0.56;

export interface Placed {
  d: Device;
  island: Art;
  is: Box;
  dev: Box;
  ducter?: Box;
  tokens: { id: string; x: number; y: number; w: number; art: number }[];
  /** Where its name's tag hangs from (its top middle). */
  tag: Pt;
}

export interface Layout {
  spec: LayoutSpec;
  isles: Placed[];
  dock: { id: string; x: number; y: number; size: number; colW: number }[];
  bridges: Bridge[];
  horizon: number;
}

function place(d: Device, s: LayoutSpec): Placed {
  const { cx, top } = s.spots[d.key];
  let { w } = s.spots[d.key];
  const island: Art = d.home ? "island_big" : "island_small";
  const h = w * aspect(island);
  const seat = top + (d.home ? 0.5 : 0.47) * h;
  const is = { x: cx - w / 2, y: top, w, h };
  const dw = w * share(d);
  const dh = dw * aspect(d.art);
  const dcx = d.home ? cx + 0.11 * w : cx;
  const dev = { x: dcx - dw / 2, y: seat - dh, w: dw, h: dh };
  let ducter: Box | undefined;
  let lo = is.x + is.w * 0.02;
  if (d.home) {
    // The app's 128-point box is mostly air round the pose; the site's face fills its box.
    const size = 0.27 * w;
    const fx = cx - 0.27 * w, fy = seat + 0.13 * h;
    ducter = { x: fx - size / 2, y: fy - size, w: size, h: size };
    lo = ducter.x + ducter.w * 0.9 + 4;
  }
  // The AI accounts stand in front of the device, in one row centred on the island.
  const a = s.token;
  const ws = d.tokens.map((t) => Math.max(a, wordW(accounts[t].name, 12) / s.px + 18));
  const gap = s.tokenGap;
  const rowW = ws.reduce((x, y) => x + y, 0) + gap * Math.max(0, ws.length - 1);
  const hi = is.x + is.w * 1.02;
  let x = Math.min(Math.max(cx - rowW / 2 + (d.home ? 0.06 * w : 0), lo), hi - rowW);
  const y = top + h * 0.36 - a * 0.15;
  const tokens = d.tokens.map((id, i) => {
    const t = { id, x, y, w: ws[i], art: a };
    x += ws[i] + gap;
    return t;
  });
  const bottom = Math.max(top + h, tokens.length ? y + a + 24 / s.px : 0);
  const half = s.tagMax / 2 + 4;
  const tcx = d.line ? Math.min(Math.max(cx, half), s.W - half) : cx;
  return { d, island, is, dev, ducter, tokens, tag: { x: tcx, y: bottom + 4 } };
}

/* ---------- the bridges (isles.go paintBridge), as SVG ---------- */

export interface Bridge {
  key: string;
  /** The cubic, as an SVG path (parcels ride it). */
  d: string;
  shadow: string;
  planks: string[];
  edges: string[];
  ropes: string[];
  width: number;
  working: boolean;
  /** Where the parcels stand when nothing moves (reduced motion, no script). */
  parcels: Pt[];
}

function rimPoint(p: Placed, toward: Pt): Pt {
  const cx = p.is.x + p.is.w / 2, cy = p.is.y + p.is.h * 0.42;
  const rx = p.is.w * 0.4, ry = p.is.h * 0.3;
  const ang = Math.atan2((toward.y - cy) / ry, (toward.x - cx) / rx);
  return { x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry };
}

const f = (v: number) => +v.toFixed(1);

function bridge(home: Placed, s: Placed): Bridge {
  const mid = (p: Placed) => ({ x: p.is.x + p.is.w / 2, y: p.is.y + p.is.h * 0.42 });
  const A = rimPoint(home, mid(s)), B = rimPoint(s, mid(home));
  const dx = B.x - A.x, dy = B.y - A.y;
  const ln = Math.hypot(dx, dy);
  const nx = -dy / ln, ny = dx / ln;
  const relaxed = !!s.d.asleep;
  const bow = relaxed ? 12 : 6, sag = relaxed ? 12 : 6;
  const P = [A, { x: A.x + dx * 0.3 + nx * bow, y: A.y + dy * 0.3 + ny * bow + sag }, { x: A.x + dx * 0.7 + nx * bow * 0.6, y: A.y + dy * 0.7 + ny * bow * 0.6 + sag }, B];
  // Sample by length.
  const N = 64;
  const pts: Pt[] = [], lens: number[] = [0];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({
      x: u * u * u * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t * t * t * P[3].x,
      y: u * u * u * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t * t * t * P[3].y,
    });
    if (i) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const L = lens[N];
  const at = (l: number) => {
    for (let i = 1; i <= N; i++) {
      if (l <= lens[i] || i === N) {
        const seg = lens[i] - lens[i - 1];
        const k = seg > 0 ? (l - lens[i - 1]) / seg : 0;
        const a = pts[i - 1], b = pts[i];
        const n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, t: { x: (b.x - a.x) / n, y: (b.y - a.y) / n } };
      }
    }
    return { p: pts[0], t: { x: 1, y: 0 } };
  };
  const bw = 17;
  const step = 8, thick = step * 0.7;
  const planks: string[] = [], edges: string[] = [];
  for (let l = step / 2; l < L - step / 4; l += step) {
    const { p, t } = at(l);
    const n = { x: -t.y, y: t.x };
    const quad = (off: number) => {
      const hx = (t.x * thick) / 2, hy = (t.y * thick) / 2, wx = (n.x * bw) / 2, wy = (n.y * bw) / 2;
      return [
        [p.x - hx - wx, p.y - hy - wy + off], [p.x + hx - wx, p.y + hy - wy + off],
        [p.x + hx + wx, p.y + hy + wy + off], [p.x - hx + wx, p.y - hy + wy + off],
      ].map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
    };
    edges.push(quad(2));
    planks.push(quad(0));
  }
  const ropes = [-0.55, 0.55].map((side) => {
    const q: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const { p, t } = at((L * i) / 32);
      q.push(`${i ? "L" : "M"}${f(p.x - t.y * bw * side)} ${f(p.y + t.x * bw * side - 3)}`);
    }
    return q.join("");
  });
  const cubic = (o: Pt) => `M${f(P[0].x + o.x)} ${f(P[0].y + o.y)}C${f(P[1].x + o.x)} ${f(P[1].y + o.y)} ${f(P[2].x + o.x)} ${f(P[2].y + o.y)} ${f(P[3].x + o.x)} ${f(P[3].y + o.y)}`;
  return {
    key: s.d.key, d: cubic({ x: 0, y: 0 }), shadow: cubic({ x: 4, y: 10 }), planks, edges, ropes, width: bw,
    working: !!s.d.working,
    parcels: [1, 2, 3].map((i) => at(Math.min(Math.max((i / 4) * L, 10), L - 10)).p).map((q) => ({ x: f(q.x), y: f(q.y) })),
  };
}

export function layout(which: "wide" | "narrow"): Layout {
  const spec = specs[which];
  const isles = devices.map((d) => place(d, spec));
  const home = isles[0];
  // The abilities' row: under home's name, centred under the island.
  const tagH = 34 / spec.px;
  const y0 = home.tag.y + tagH + 12;
  const size = spec.dockSize;
  const cols = dock.map((a) => Math.max(size, wordW(a.name, 13) / spec.px + 30));
  const total = cols.reduce((a, b) => a + b, 0) + spec.dockGap * (cols.length - 1);
  let x = home.is.x + home.is.w / 2 - total / 2;
  const row = dock.map((a, i) => {
    const c = { id: a.id, x: x + cols[i] / 2 - size / 2, y: y0, size, colW: cols[i] };
    x += cols[i] + spec.dockGap;
    return c;
  });
  const top = Math.min(...isles.filter((p) => !p.d.home).map((p) => p.dev.y));
  const horizon = Math.min(Math.max(top - 10, spec.H * 0.12), spec.H * 0.26);
  return { spec, isles, dock: row, bridges: isles.slice(1).map((s) => bridge(home, s)), horizon };
}
