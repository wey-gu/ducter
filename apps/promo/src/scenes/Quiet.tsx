// 5 · Then it goes quiet. Half an hour goes by in three seconds: the clock ticks round, the light
// from the window slides across the wall and turns golden, Ducter waits on its bench and breathes.
// Nothing asks for you; that is the point.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy } from "../copy";
import { C } from "../theme";
import { Art, Fill, Headline, clamp, easeOut, useSpring, useSquare } from "../ui";

const MIN0 = 14 * 60 + 31, MINUTES = 31;

const Clock = ({ minute, size }: { minute: number; size: number }) => {
  const r = size / 2;
  const m = (minute % 60) * 6;
  const h = ((minute / 60) % 12) * 30;
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, #FFB27A, ${C.accent} 55%, ${C.accentLedge})`, boxShadow: `0 10px 0 ${C.accentLedge}, 0 30px 40px -20px rgba(74,50,26,0.5)` }} />
      <div style={{ position: "absolute", inset: size * 0.1, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, #FFFDF8, #F6E7D2)", boxShadow: "inset 0 6px 10px rgba(120,70,30,0.18)" }} />
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: r - 4, top: size * 0.16, width: 8, height: i % 3 ? 10 : 18, borderRadius: 4, background: i % 3 ? C.faint : C.ink2, transformOrigin: `4px ${r - size * 0.16}px`, transform: `rotate(${i * 30}deg)` }} />
      ))}
      <div style={{ position: "absolute", left: r - 7, top: r - size * 0.24, width: 14, height: size * 0.24 + 7, borderRadius: 7, background: C.ink, transformOrigin: `7px ${size * 0.24}px`, transform: `rotate(${h}deg)` }} />
      <div style={{ position: "absolute", left: r - 5, top: r - size * 0.33, width: 10, height: size * 0.33 + 5, borderRadius: 5, background: C.ink, transformOrigin: `5px ${size * 0.33}px`, transform: `rotate(${m}deg)` }} />
      <div style={{ position: "absolute", left: r - 11, top: r - 11, width: 22, height: 22, borderRadius: 11, background: C.ink }} />
    </div>
  );
};

export const Quiet = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const sq = useSquare();
  const c = useCopy();
  const pose = useSpring(0, { damping: 18 });
  // the clock ticks a minute at a time, each tick a small bouncy step
  const T0 = 10, T1 = durationInFrames - 18;
  const per = (T1 - T0) / MINUTES;
  const ticks = Math.max(0, Math.min(MINUTES, Math.floor((frame - T0) / per)));
  const into = Math.max(0, frame - T0 - ticks * per);
  const step = ticks < MINUTES ? interpolate(into, [0, 2, 3], [0, 1.15, 1], clamp) : 1;
  const minute = ticks >= 1 ? MIN0 + ticks - 1 + step : MIN0;
  const shown = MIN0 + ticks;
  const hh = Math.floor(shown / 60), mm = shown % 60;
  // the light moves on: a soft window patch slides along the wall and warms
  const day = interpolate(frame, [0, durationInFrames], [0, 1], { ...clamp, easing: easeOut });
  const breathe = Math.sin((frame / 114) * Math.PI * 2);
  const dW = sq ? 560 : 640;
  const dx = sq ? (width - dW) / 2 - 120 : 780;
  const dy = sq ? height - dW - 150 : height - dW - 150;
  const clock = sq ? 230 : 280;
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(252,236,215,0) 0%, rgba(252,220,180,${0.55 * day}) 100%)` }} />
      <div style={{ position: "absolute", left: interpolate(day, [0, 1], [width * 0.62, width * 0.18]), top: height * 0.12, width: width * 0.36, height: height * 0.8, background: `linear-gradient(100deg, rgba(255,255,255,0), rgba(255,250,236,${0.75 - 0.25 * day}) 30%, rgba(255,226,170,${0.25 + 0.35 * day}) 70%, rgba(255,255,255,0))`, transform: `skewX(${interpolate(day, [0, 1], [-18, -34])}deg)`, filter: "blur(18px)" }} />
      {/* the floor line and Ducter's shadow, which leans as the light moves */}
      <div style={{ position: "absolute", left: 0, right: 0, top: dy + dW * 0.825, height: 2, background: C.line, opacity: 0.7 }} />
      <div style={{ position: "absolute", left: dx + dW * 0.18, top: dy + dW * 0.8, width: dW * 0.7, height: 40, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(110,70,30,0.28), rgba(110,70,30,0))", transform: `translateX(${interpolate(day, [0, 1], [-60, 90])}px) scaleX(${1 + day * 0.5})` }} />
      <div style={{ position: "absolute", left: dx, top: dy, width: dW, opacity: pose, transformOrigin: "50% 92%", transform: `translateY(${(1 - pose) * 30}px) scale(${1 + 0.012 * breathe}, ${1 + 0.012 * breathe * 1.3})` }}>
        <Art src="ducter/waiting.png" safe="ducter" style={{ width: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: sq ? width - clock - 110 : 1400, top: sq ? 330 : 330, transform: `scale(${pose})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <Clock minute={minute} size={clock} />
        <div style={{ fontWeight: 800, fontSize: sq ? 40 : 46, color: C.ink2, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
          {hh}:{String(mm).padStart(2, "0")}
        </div>
      </div>
      <Headline h={c.quietH} sub={c.quietSub} />
    </Fill>
  );
};
