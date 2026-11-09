// 10 · The end card: back at dawn, where the title began. Open source, self-hosted, one line
// to install, and where to find it.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO } from "../theme";
import { Art, Fill, clamp, useSpring, useSquare } from "../ui";

// the title layers' layout (tools/art/title_layers.py), as fractions of the key art's frame
const ISLAND = { x: 0.268125, y: 0.51981, w: 0.4675, h: 0.27706 };
const DUCTER = { x: 0.390208, y: 0.3524, w: 0.215208, h: 0.25865 };

export const End = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const logo = useSpring(4, { damping: 15 });
  const card = useSpring(20, { damping: 17 });
  const links = useSpring(34, { damping: 17 });
  const s = Math.max(width / 3200, height / 2389) * 1.04;
  const fw = 3200 * s, fh = 2389 * s;
  // the island group, smaller, under the logo
  const g = sq ? 1000 : 1080; // the group's frame width
  const gx = (width - g) / 2;
  const gy = sq ? 60 : -20;
  const gh = g * (2389 / 3200);
  const bob = Math.sin(frame / 22) * 5;
  const blink = frame > 70 && frame < 75;
  const typed = Math.floor(interpolate(frame, [26, 58], [0, 46], clamp));
  const cmd = "curl -fsSL https://ducter.ai/install.sh | sh";
  return (
    <Fill>
      <Art src="title/sky.webp" style={{ position: "absolute", left: (width - fw) / 2, top: (height - fh) / 2, width: fw, height: fh, transform: `scale(${1.04 - frame * 0.0002})` }} />
      <div style={{ position: "absolute", left: gx + ISLAND.x * g, top: gy + ISLAND.y * gh + bob, width: ISLAND.w * g, opacity: logo }}>
        <Art src="title/island.webp" style={{ width: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: gx + DUCTER.x * g, top: gy + DUCTER.y * gh + bob, width: DUCTER.w * g, opacity: logo }}>
        <Art src={blink ? "title/ducter_closed.webp" : "title/ducter.webp"} style={{ width: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: (width - 640) / 2, top: sq ? 70 : 40, width: 640, opacity: logo, transform: `scale(${0.92 + 0.08 * logo})` }}>
        <Art src="title/logo_lit.webp" style={{ width: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: sq ? 70 : 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ background: C.bg, borderRadius: 26, padding: sq ? "22px 26px" : "22px 30px", boxShadow: `0 5px 0 ${C.line2}, 0 30px 60px -24px rgba(43,33,24,0.45)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, opacity: card, transform: `translateY(${(1 - card) * 60}px)` }}>
          <div style={{ fontWeight: 800, fontSize: sq ? 34 : 38, color: C.ink, letterSpacing: "-0.01em" }}>Open source. On your Mac or your server.</div>
          <div style={{ background: C.term, borderRadius: 14, padding: "14px 22px", fontFamily: MONO, fontSize: sq ? 25 : 30, color: C.termText, boxShadow: "0 4px 0 #120D09", whiteSpace: "pre" }}>
            <span style={{ color: C.accent }}>$ </span>{cmd.slice(0, typed)}<span style={{ opacity: typed < 46 || frame % 16 < 8 ? 1 : 0 }}>▌</span>
          </div>
          <div style={{ display: "flex", gap: 26, fontWeight: 700, fontSize: sq ? 26 : 30, color: C.ink2, opacity: links }}>
            <span>ducter.ai</span>
            <span style={{ color: C.faint }}>·</span>
            <span>github.com/wey-gu/ducter</span>
          </div>
        </div>
      </div>
    </Fill>
  );
};
