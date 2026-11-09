// 5 · Then it goes quiet. Ducter waits on its bench; the time moves on; nothing asks for you.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Art, Caption, Fill, Sub, clamp, useSpring, useSquare } from "../ui";

export const Quiet = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const pose = useSpring(0, { damping: 18 });
  const t1 = interpolate(frame, [30, 44], [1, 0], clamp);
  const breathe = 1 + Math.sin(frame / 14) * 0.012;
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: sq ? (width - 640) / 2 : 1060, top: sq ? 380 : (height - 760) / 2, width: sq ? 640 : 760, opacity: pose, transform: `translateY(${(1 - pose) * 30}px) scale(${breathe})`, transformOrigin: "50% 100%" }}>
        <Art src="ducter/waiting.png" style={{ width: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: sq ? 0 : 140, right: sq ? 0 : undefined, top: sq ? 100 : 360, textAlign: sq ? "center" : "left", display: "flex", flexDirection: "column", alignItems: sq ? "center" : "flex-start" }}>
        <Caption text={"Then it goes quiet."} size={sq ? 84 : 108} at={4} align={sq ? "center" : "left"} />
        <Sub text="Silence means it's going fine." at={18} size={sq ? 38 : 44} style={{ marginTop: 22, color: C.ink2 }} />
        <div style={{ marginTop: 40, position: "relative", height: 60, fontWeight: 700, fontSize: 40, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ position: "absolute", left: sq ? -60 : 0, opacity: t1 * pose }}>14:31</span>
          <span style={{ position: "absolute", left: sq ? -60 : 0, opacity: 1 - t1 }}>15:02</span>
        </div>
      </div>
    </Fill>
  );
};
