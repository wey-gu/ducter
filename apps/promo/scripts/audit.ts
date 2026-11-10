// The safe-area audit: renders every 2nd frame of each cut with the `audit` input prop, collects
// the boxes the composition logs for its marked elements (data-safe: headline, window, phone,
// tags, coins, devices, Ducter, logo, end card…), and fails if any visible one leaves the frame
// minus a safe margin at any sampled frame. Nothing is written to the repo (frames go to a temp dir).
//   node scripts/audit.ts                   all three cuts (Node: Bun loses the browser)
//   COMP=LaunchSquare node scripts/audit.ts one cut
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";
import { SCENES, X } from "../src/timeline.ts";

const MARGIN = Number(process.env.MARGIN ?? 24); // px at 1080p
const EVERY = Number(process.env.EVERY ?? 2);
// An element may enter from off the frame in its scene's first frames (Ducter drops in, the island
// and the phone rise): that is a move into the frame, not a camera push past its edges.
const ENTER = 32; // the title's drop and landing end at frame 31

const sceneAt = (f: number) => {
  let start = 0;
  for (const [name, d] of SCENES) {
    if (f < start + d - X) return `${name}+${f - start}`;
    start += d - X;
  }
  return `End+${f - start}`;
};

const serveUrl = await bundle({ entryPoint: resolve(dirname(fileURLToPath(import.meta.url)), "../src/index.ts") });
let failures = 0;
for (const id of (process.env.COMP ?? "Launch,LaunchSquare,LaunchZh").split(",")) {
  const composition = await selectComposition({ serveUrl, id, inputProps: { audit: true } });
  const { width: W, height: H } = composition;
  const bad = new Map<string, { frames: number[]; worst: string }>();
  let seen = 0;
  const dir = mkdtempSync(join(tmpdir(), "promo-audit-"));
  try {
    await renderFrames({
      serveUrl, composition, inputProps: { audit: true }, outputDir: dir, imageFormat: "jpeg", jpegQuality: 10,
      everyNthFrame: EVERY, concurrency: 4, onStart: () => {}, onFrameUpdate: () => {},
      onBrowserLog: (log) => {
        const m = /^SAFE (.*)$/.exec(log.text);
        if (!m) return;
        seen++;
        const { frame, boxes } = JSON.parse(m[1]) as { frame: number; boxes: [string, number, number, number, number][] };
        for (const [name, l, t, r, b] of boxes) {
          const out = [MARGIN - l, MARGIN - t, r - (W - MARGIN), b - (H - MARGIN)];
          const worst = Math.max(...out);
          if (worst <= 0) continue;
          const [scene, local] = sceneAt(frame).split("+");
          const key = `${Number(local) < ENTER ? "enter " : ""}${scene} · ${name}`;
          const e = bad.get(key) ?? { frames: [], worst: "" };
          e.frames.push(frame);
          if (!e.worst || worst > Number(e.worst.split("px")[0])) e.worst = `${worst}px out at frame ${frame} (${sceneAt(frame)}): [${l}, ${t}, ${r}, ${b}]`;
          bad.set(key, e);
        }
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`${id} (${W}×${H}, margin ${MARGIN}px): ${seen} frames checked`);
  for (const [k, v] of bad) console.log(`  ${k.startsWith("enter ") ? "ok   " : "OUT  "}${k}: ${v.frames.length} frames, worst ${v.worst}`);
  if (!seen) { console.log("  no audit logs: is the Audit component on?"); failures++; }
  failures += [...bad.keys()].filter((k) => !k.startsWith("enter ")).length;
}
console.log(failures ? `safe-area audit: ${failures} problem(s)` : "safe-area audit: 0 problems");
process.exit(failures ? 1 : 0);
