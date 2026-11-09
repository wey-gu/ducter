// 3 · Say it once: one sentence to the partner, and its short answer. The copy is the README's.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Bubble, Btn, Caption, Fill, MacWindow, Sub, clamp, useSpring, useSquare } from "../ui";

const ASK = "Fix the flaky compaction test in HawDB and tell me when it's done";

export const SayIt = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const win = useSpring(0, { damping: 18, stiffness: 90 });
  const typed = Math.floor(interpolate(frame, [14, 62], [0, ASK.length], clamp));
  const send = frame >= 66;
  const press = interpolate(frame, [62, 65, 69], [0, 1, 0], clamp);
  const sent = useSpring(66, { damping: 16 });
  const reply = useSpring(88, { damping: 16 });
  const scale = sq ? 0.82 : 1;
  const ww = 1100, wh = 620;
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: sq ? 80 : 110, top: sq ? 90 : 330 }}>
        <Caption text={sq ? "Say it once." : "Say it\nonce."} size={sq ? 96 : 132} at={4} />
        <Sub text={sq ? "Write to it the way you'd write to a colleague." : "Write to it the way\nyou'd write to a colleague."} at={20} style={{ marginTop: 26, whiteSpace: "pre-line" }} />
      </div>
      <div style={{ position: "absolute", left: sq ? (width - ww * scale) / 2 : 700, top: sq ? 330 : (height - wh) / 2, transform: `scale(${scale}) translateY(${(1 - win) * 80}px)`, transformOrigin: "0 0", opacity: win }}>
        <MacWindow face={send ? "ducter/working.png" : "ducter/idle.png"} status={send && frame > 88 ? "Working on 1" : "Here when you need me"} width={ww} height={wh}>
          <div style={{ padding: "34px 48px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ alignSelf: "center", fontSize: 18, color: C.muted, fontWeight: 600 }}>14:30</div>
            {send && (
              <Bubble who="you" style={{ opacity: sent, transform: `translateY(${(1 - sent) * 120}px) scale(${0.9 + 0.1 * sent})`, transformOrigin: "100% 100%" }}>{ASK}</Bubble>
            )}
            {frame >= 88 && (
              <Bubble who="partner" style={{ opacity: reply, transform: `translateY(${(1 - reply) * 20}px)` }}>
                Fixing the flaky compaction test in hawdb now. I'll tell you when it's clear.
              </Bubble>
            )}
          </div>
          <div style={{ position: "absolute", left: 48, right: 48, bottom: 32, height: 78, borderRadius: 22, background: C.surface, boxShadow: `0 4px 0 ${C.line}`, display: "flex", alignItems: "center", padding: "0 12px 0 26px", gap: 16 }}>
            <div style={{ flex: 1, fontSize: 25, color: !send && typed > 0 ? C.ink : C.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
              {!send && typed > 0 ? ASK.slice(0, typed) : "Say something to Ducter…"}
              {!send && typed > 0 && <span style={{ opacity: frame % 14 < 7 ? 1 : 0, color: C.accent }}>|</span>}
            </div>
            <Btn kind="accent" pressed={press} scale={1.15}>
              <svg width="22" height="22" viewBox="0 0 24 24" style={{ display: "block" }}><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke={C.ink} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Btn>
          </div>
        </MacWindow>
      </div>
    </Fill>
  );
};
