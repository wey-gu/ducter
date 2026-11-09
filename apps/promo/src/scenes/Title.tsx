// 2 · The title moment, as the Mac app plays it (D87), made physical: the island rises out of the
// clouds, a shadow grows where Ducter will land, Ducter drops in (stretching as it falls), lands
// with a squash and a puff of dust, the island gives under it, a small rebound, it settles, breathes
// and blinks twice. The clay logotype drops in and lights.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy } from "../copy";
import { C } from "../theme";
import { Art, Fill, Sparkles, Sub, clamp, easeOut, useSpring } from "../ui";

// tools/art/title_layers.py: where the layers sit, as fractions of the 3200×2389 key art
const FRAME = [3200, 2389];
const ISLAND = { x: 0.268125, y: 0.51981, w: 0.4675, h: 0.27706 };
const DUCTER = { x: 0.390208, y: 0.3524, w: 0.215208, h: 0.25865 };

export const LAND = 28;

/** The key art's frame as laid out for a width and height, and Ducter's centre in it. */
export const titleLayout = (width: number, height: number) => {
  const s = Math.max(width / FRAME[0], height / FRAME[1]) * 1.04;
  const fw = FRAME[0] * s, fh = FRAME[1] * s;
  const ox = (width - fw) / 2, oy = (height - fh) / 2 + (width === height ? 0 : fh * 0.04);
  const box = (b: typeof ISLAND) => ({ left: ox + b.x * fw, top: oy + b.y * fh, width: b.w * fw, height: b.h * fh });
  const d = box(DUCTER);
  return { fw, fh, ox, oy, box, ducter: { x: d.left + d.width / 2, y: d.top + d.height / 2 }, feet: { x: d.left + d.width / 2, y: d.top + d.height * 0.93 } };
};

const k = (f: number, frames: number[], values: number[]) => interpolate(f, frames, values, clamp);

export const Title = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const c = useCopy();
  const L = titleLayout(width, height);
  const sq = width === height;
  const rise = useSpring(0, { damping: 13, stiffness: 70 });
  // the fall: gravity (y ∝ t²), stretching as it speeds up
  const t = k(frame, [LAND - 14, LAND], [0, 1]);
  const falling = frame < LAND;
  const fallY = falling ? -820 * (1 - t * t) : 0;
  // the landing: squash, rebound, settle
  const sy = falling ? 1 + 0.1 * t : k(frame, [LAND, LAND + 3, LAND + 6, LAND + 10, LAND + 14], [0.76, 1.1, 0.95, 1.02, 1]);
  const sx = falling ? 1 - 0.07 * t : k(frame, [LAND, LAND + 3, LAND + 6, LAND + 10, LAND + 14], [1.24, 0.93, 1.04, 0.99, 1]);
  const hop = falling ? 0 : k(frame, [LAND, LAND + 3, LAND + 7, LAND + 10, LAND + 13], [0, -28, 0, -7, 0]);
  const dip = k(frame, [LAND - 1, LAND + 1, LAND + 6, LAND + 12], [0, 14, -4, 0]);
  const breathe = frame > LAND + 14 ? Math.sin(((frame - LAND - 14) / 114) * Math.PI * 2) : 0; // 3.8 s
  const blink = (frame >= 54 && frame < 58) || (frame >= 63 && frame < 66);
  const shadow = k(frame, [LAND - 14, LAND], [0.15, 1]);
  const bob = Math.sin(frame / 24) * 5;
  const logo = useSpring(LAND + 10, { damping: 10, stiffness: 150 });
  const lit = k(frame, [LAND + 26, LAND + 40], [0, 1]);
  // the camera leans in at the end, toward Ducter, where the next scene opens
  const lean = k(frame, [durationInFrames - 22, durationInFrames], [1, 1.06]);
  const drift = interpolate(frame, [0, durationInFrames], [1.0, 1.03]);
  const isl = L.box(ISLAND);
  const dk = L.box(DUCTER);
  const logoW = sq ? 720 : 800;
  return (
    <Fill>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${drift * lean})`, transformOrigin: `${L.ducter.x}px ${L.ducter.y}px` }}>
        <Art src="title/sky.webp" style={{ position: "absolute", left: L.ox, top: L.oy, width: L.fw, height: L.fh }} />
        <div style={{ position: "absolute", ...isl, transform: `translateY(${(1 - rise) * 300 + bob + dip}px)`, opacity: Math.min(1, rise * 1.5) }}>
          <Art src="title/island.webp" style={{ width: "100%", height: "100%" }} />
        </div>
        {/* where it will land: a soft shadow that darkens as Ducter comes down */}
        <div style={{ position: "absolute", left: L.feet.x - dk.width * 0.36 * shadow, top: L.feet.y - 14 + bob + dip, width: dk.width * 0.72 * shadow, height: 34 * shadow, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(70,35,10,0.45), rgba(70,35,10,0))", opacity: frame > LAND - 14 ? 1 : 0 }} />
        <div style={{ position: "absolute", ...dk, transformOrigin: "50% 93%", transform: `translateY(${fallY + hop + bob + dip}px) scale(${sx * (1 + 0.012 * breathe)}, ${sy * (1 + 0.03 * breathe * 0.4)})`, opacity: frame >= LAND - 14 ? 1 : 0 }}>
          <Art src={blink ? "title/ducter_closed.webp" : "title/ducter.webp"} style={{ width: "100%", height: "100%" }} />
        </div>
        {/* dust where it lands */}
        {frame >= LAND && frame < LAND + 20 && [-1, 1].map((d) => {
          const p = k(frame, [LAND, LAND + 20], [0, 1]);
          return (
            <div key={d} style={{ position: "absolute", left: L.feet.x + d * (40 + 130 * easeOut(p)) - 45, top: L.feet.y - 30 - 22 * p + bob, width: 90 * (1 + p * 0.6), height: 46 * (1 + p * 0.4), borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,236,210,0.95), rgba(255,236,210,0))", opacity: 1 - p }} />
          );
        })}
        <Sparkles at={LAND + 1} x={L.feet.x} y={L.feet.y - 60} r={dk.width * 0.62} n={8} />
      </div>
      <div style={{ position: "absolute", left: (width - logoW) / 2, top: sq ? 120 : 54, width: logoW, opacity: Math.min(1, logo * 2), transform: `translateY(${(1 - logo) * -90}px)` }}>
        <Art src="title/logo.webp" style={{ position: "absolute", width: "100%" }} />
        <Art src="title/logo_lit.webp" style={{ position: "relative", width: "100%", opacity: lit }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: sq ? 150 : 140, display: "flex", justifyContent: "center", opacity: k(frame, [LAND + 30, LAND + 38], [0, 1]) }}>
        <div style={{ background: "rgba(255,246,234,0.94)", borderRadius: 22, padding: "12px 28px", boxShadow: `0 4px 0 ${C.line2}` }}>
          <Sub text={c.titleSub} at={LAND + 30} size={sq ? 30 : 36} style={{ color: C.ink, fontWeight: 650 }} />
        </div>
      </div>
    </Fill>
  );
};
