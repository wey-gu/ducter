// 2 · The title moment, as the Mac app plays it (D87): the dawn sky, the island rising, Ducter
// landing on it and blinking, the clay logotype lighting up.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Art, Fill, Sub, clamp, useSpring } from "../ui";

// tools/art/title_layers.py: where the layers sit, as fractions of the 3200×2389 key art
const L = {
  frame: [3200, 2389],
  island: { x: 0.268125, y: 0.51981, w: 0.4675, h: 0.27706 },
  ducter: { x: 0.390208, y: 0.3524, w: 0.215208, h: 0.25865 },
};

export const Title = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  // cover: the key art's frame scaled to fill
  const s = Math.max(width / L.frame[0], height / L.frame[1]) * 1.04;
  const fw = L.frame[0] * s, fh = L.frame[1] * s;
  const ox = (width - fw) / 2, oy = (height - fh) / 2 + (width === height ? 0 : fh * 0.04);
  const drift = interpolate(frame, [0, durationInFrames], [1.0, 1.05]);
  const rise = useSpring(4, { damping: 18, stiffness: 60 });
  const land = useSpring(22, { damping: 9, stiffness: 140 });
  const logo = useSpring(46, { damping: 15 });
  const lit = interpolate(frame, [62, 78], [0, 1], clamp);
  const blink = (frame > 90 && frame < 95) || (frame > 101 && frame < 105);
  const squash = 1 + 0.12 * Math.sin(Math.min(1, land) * Math.PI) * (land < 1 ? 1 : 0);
  const box = (b: { x: number; y: number; w: number; h: number }) => ({ left: ox + b.x * fw, top: oy + b.y * fh, width: b.w * fw, height: b.h * fh });
  const sq = width === height;
  const logoW = sq ? 760 : 820;
  return (
    <Fill>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${drift})`, transformOrigin: "50% 60%" }}>
        <Art src="title/sky.webp" style={{ position: "absolute", left: ox, top: oy, width: fw, height: fh }} />
        <div style={{ position: "absolute", ...box(L.island), transform: `translateY(${(1 - rise) * 260 + Math.sin(frame / 22) * 6}px)`, opacity: rise }}>
          <Art src="title/island.webp" style={{ width: "100%", height: "100%" }} />
        </div>
        <div style={{ position: "absolute", ...box(L.ducter), transformOrigin: "50% 100%", transform: `translateY(${(1 - land) * -700 + Math.sin(frame / 22) * 6}px) scale(${1 / squash}, ${squash})`, opacity: land > 0.01 ? 1 : 0 }}>
          <Art src={blink ? "title/ducter_closed.webp" : "title/ducter.webp"} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: (width - logoW) / 2, top: sq ? 150 : 70, width: logoW, opacity: logo, transform: `translateY(${(1 - logo) * -40}px) scale(${0.9 + 0.1 * logo})` }}>
        <Art src="title/logo.webp" style={{ position: "absolute", width: "100%" }} />
        <Art src="title/logo_lit.webp" style={{ position: "relative", width: "100%", opacity: lit }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: sq ? 120 : 64, display: "flex", justifyContent: "center" }}>
        <div style={{ background: "rgba(255,246,234,0.92)", borderRadius: 22, padding: "14px 30px", boxShadow: `0 4px 0 ${C.line2}`, opacity: interpolate(frame, [72, 86], [0, 1], clamp) }}>
          <Sub text="A personal AI that runs on your own Mac or server." at={72} size={sq ? 34 : 38} style={{ color: C.ink2, fontWeight: 650 }} />
        </div>
      </div>
    </Fill>
  );
};
