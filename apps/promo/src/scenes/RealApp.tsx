// 8 · The real app, depth on demand: On hand (every task at a glance) and an opened task (what it
// did, step by step, and its diff). These are the README's product shots, not redrawn.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Art, Caption, Fill, Sub, clamp, useSpring, useSquare } from "../ui";

export const RealApp = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const sq = useSquare();
  const a = useSpring(0, { damping: 18, stiffness: 80 });
  const b = useSpring(14, { damping: 18, stiffness: 80 });
  const pan = interpolate(frame, [20, durationInFrames], [0, 1], { ...clamp, easing: (x) => x * (2 - x) });
  const A = sq ? { x: 40, y: 300, w: 820 } : { x: 90, y: 300, w: 1040 };
  const B = sq ? { x: 400, y: 520, w: 640, h: 520 } : { x: 1060, y: 250, w: 780, h: 760 };
  const bh = B.w * (1213 / 1288);
  return (
    <Fill style={{ background: C.bgDeep }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: sq ? 70 : 64, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Caption text="Open anything, any time." size={sq ? 76 : 92} align="center" at={2} />
        <Sub text="Every task, what it did step by step, and its changes." at={14} size={sq ? 30 : 36} style={{ marginTop: 12, color: C.ink2 }} />
      </div>
      <div style={{ position: "absolute", left: A.x, top: A.y, width: A.w, transform: `translateY(${(1 - a) * 120}px) rotate(${-1.5 + pan * 0.6}deg) scale(${1 + pan * 0.03})`, opacity: a }}>
        <Art src="shots/on-hand.webp" style={{ width: "100%", filter: "drop-shadow(0 30px 40px rgba(74,50,26,0.28))" }} />
      </div>
      <div style={{ position: "absolute", left: B.x, top: B.y, width: B.w, height: B.h, overflow: "hidden", borderRadius: 18, transform: `translateY(${(1 - b) * 160}px) rotate(${1.5 - pan * 0.6}deg)`, opacity: b, boxShadow: "0 40px 70px -30px rgba(74,50,26,0.5)" }}>
        <Art src="shots/task.webp" style={{ width: "100%", transform: `translateY(${-pan * (bh - B.h) * 0.85}px)` }} />
      </div>
    </Fill>
  );
};
