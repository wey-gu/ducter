// 3 · Say it once: one sentence to the partner, its one-sentence answer, and then nothing more.
// Ducter stands beside the window and starts reading as the work goes out.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy } from "../copy";
import { C } from "../theme";
import { Art, Bubble, Btn, Fill, Headline, MacWindow, clamp, useSpring, useSquare, useT, useType } from "../ui";

const SEND = 58, ACK = 80;

export const SayIt = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const sq = useSquare();
  const type = useType();
  const c = useCopy();
  const t = useT();
  const win = useSpring(2, { damping: 18, stiffness: 90 });
  const ask = t(c.ask);
  const typed = Math.floor(interpolate(frame, [12, SEND - 4], [0, ask.length], clamp));
  const sent = frame >= SEND;
  const press = interpolate(frame, [SEND - 4, SEND - 1, SEND + 3], [0, 1, 0], clamp);
  const fly = useSpring(SEND, { damping: 16 });
  const reply = useSpring(ACK, { damping: 16 });
  const ww = 1180, wh = sq ? 700 : 610;
  const scale = sq ? (width - type.x * 2) / ww : 1;
  const mascot = useSpring(6, { damping: 12 });
  const blink = (frame >= 30 && frame < 34) || (frame >= 39 && frame < 42);
  const reading = frame >= ACK;
  const breathe = Math.sin((frame / 114) * Math.PI * 2);
  return (
    <Fill style={{ background: C.bg }}>
      <Headline h={c.sayH} sub={c.saySub} />
      <div style={{ position: "absolute", left: type.x, top: sq ? 300 : 300, transform: `scale(${scale}) translateY(${(1 - win) * 60}px)`, transformOrigin: "0 0", opacity: win }}>
        <MacWindow face={reading ? "ducter/working.png" : "ducter/idle.png"} status={reading ? c.working(1) : ""} width={ww} height={wh}>
          <div style={{ padding: "26px 44px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ alignSelf: "center", fontSize: 18, color: C.muted, fontWeight: 600 }}>{c.time}</div>
            {sent && (
              <Bubble who="you" style={{ opacity: fly, transform: `translateY(${(1 - fly) * 110}px) scale(${0.92 + 0.08 * fly})`, transformOrigin: "100% 100%" }}>{ask}</Bubble>
            )}
            {frame >= ACK && (
              <Bubble who="partner" style={{ opacity: reply, transform: `translateY(${(1 - reply) * 14}px)` }}>{t(c.ack)}</Bubble>
            )}
          </div>
          <div style={{ position: "absolute", left: 44, right: 44, bottom: 28, height: 78, borderRadius: 24, background: C.surface, boxShadow: `0 4px 0 ${C.line}`, display: "flex", alignItems: "center", padding: "0 12px 0 26px", gap: 16 }}>
            <div style={{ flex: 1, fontSize: 25, color: !sent && typed > 0 ? C.ink : C.muted, whiteSpace: "nowrap", overflow: "hidden", direction: "ltr" }}>
              {!sent && typed > 0 ? ask.slice(Math.max(0, typed - 52), typed) : c.composer}
              {!sent && typed > 0 && <span style={{ opacity: frame % 14 < 7 ? 1 : 0, color: C.accent }}>|</span>}
            </div>
            <Btn kind="accent" pressed={press} scale={1.15}>
              <svg width="22" height="22" viewBox="0 0 24 24" style={{ display: "block" }}><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke={C.ink} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Btn>
          </div>
        </MacWindow>
      </div>
      {!sq && (
        <div style={{ position: "absolute", left: 1370, top: 470, width: 400, transformOrigin: "50% 95%", transform: `translateY(${(1 - mascot) * 80}px) scale(${1 + 0.012 * breathe}, ${1 + 0.03 * breathe * 0.4})`, opacity: Math.min(1, mascot * 2) }}>
          <Art src={reading ? "ducter/working.png" : blink ? "ducter/idle_closed.png" : "ducter/idle.png"} style={{ width: "100%" }} />
        </div>
      )}
    </Fill>
  );
};
