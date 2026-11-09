// 6 · The phone buzzes once: a decision that already has a default. One tap on Rebase.
// The copy is the README's (the fix-ci rebase).
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Art, Btn, Caption, Check, Fill, Phone, Sub, Tap, clamp, useSpring, useSquare } from "../ui";

const TAP = 104;

export const Decide = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const enter = useSpring(0, { damping: 16, stiffness: 90 });
  const buzzing = frame >= 16 && frame < 34;
  const buzz = buzzing ? Math.sin(frame * 2.4) * 2.6 : 0;
  const sheet = useSpring(30, { damping: 17 });
  const press = interpolate(frame, [TAP - 2, TAP + 2, TAP + 8], [0, 1, 0], clamp);
  const taken = frame >= TAP + 6;
  const doneIn = useSpring(TAP + 8, { damping: 16 });
  const countdown = interpolate(frame, [30, TAP], [0.97, 0.9], clamp);
  const pw = sq ? 350 : 470;
  const ph = pw * 2.06;
  const px = sq ? (width - pw) / 2 : 1180;
  const py = sq ? height - ph - 36 : (height - ph) / 2;
  const k = pw / 430; // sizes below are for a 430-wide phone
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: sq ? 0 : 120, right: sq ? 0 : undefined, top: sq ? 56 : 330, width: sq ? undefined : 900, textAlign: sq ? "center" : "left", display: "flex", flexDirection: "column", alignItems: sq ? "center" : "flex-start" }}>
        <Caption text={sq ? "It asks only when\nit matters." : "It asks only\nwhen it matters."} size={sq ? 70 : 112} at={36} align={sq ? "center" : "left"} />
        <Sub text={sq ? "Every question comes with a default." : "Every question comes with a default.\nOne tap, and back to your day."} at={56} size={sq ? 30 : 40} style={{ marginTop: sq ? 12 : 26, whiteSpace: "pre-line" }} />
      </div>
      {buzzing && [-1, 1].map((d) => (
        <div key={d} style={{ position: "absolute", left: px + pw / 2 + d * (pw / 2 + 34) - 3, top: py + 180, width: 6, height: 70, borderRadius: 4, background: C.accent, opacity: 0.55 + 0.45 * Math.sin(frame * 1.3) }} />
      ))}
      <div style={{ position: "absolute", left: px, top: py, transform: `translateY(${(1 - enter) * 500}px) rotate(${buzz}deg)` }}>
        <Phone width={pw}>
          {/* the conversation behind the sheet */}
          <div style={{ position: "absolute", top: 72 * k, left: 22 * k, right: 22 * k, display: "flex", alignItems: "center", gap: 10 * k }}>
            <Art src={taken ? "ducter/working.png" : "ducter/needsyou.png"} style={{ width: 54 * k }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 19 * k, color: C.ink }}>Ducter</div>
              <div style={{ fontWeight: 500, fontSize: 13 * k, color: C.muted }}>{taken ? "Working on 2" : "1 needs you · Working on 2"}</div>
            </div>
          </div>
          <div style={{ position: "absolute", top: 150 * k, left: 22 * k, right: 22 * k, fontSize: 17 * k, lineHeight: 1.45, color: C.ink, opacity: 0.55 }}>
            <div style={{ background: C.accent, borderRadius: 16 * k, padding: `${9 * k}px ${14 * k}px`, marginLeft: 60 * k, marginBottom: 12 * k }}>Fix the flaky compaction test in HawDB and tell me when it's done</div>
            <div>Fixing the flaky compaction test in hawdb now. I'll tell you when it's clear.</div>
          </div>
          <div style={{ position: "absolute", inset: 0, background: "rgba(43,33,24,0.28)", opacity: sheet }} />
          {/* the decision */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 470 * k, background: C.bg, borderRadius: `${30 * k}px ${30 * k}px 0 0`, transform: `translateY(${(1 - sheet) * 480 * k }px)`, padding: `${16 * k}px ${16 * k}px` }}>
            <div style={{ width: 44 * k, height: 5 * k, borderRadius: 4, background: C.line2, margin: `0 auto ${14 * k}px` }} />
            <div style={{ position: "relative" }}>
              <div style={{ opacity: taken ? 1 - doneIn : 1 }}>
            <div style={{ background: C.decideSurface, borderRadius: 22 * k, padding: `${18 * k}px ${18 * k}px ${16 * k}px`, boxShadow: `0 ${4 * k}px 0 ${C.decideLedge}` }}>
              <div style={{ fontWeight: 700, fontSize: 14 * k, color: C.decideInk }}>Bring fix-ci up to date with main ›</div>
              <div style={{ fontWeight: 800, fontSize: 21 * k, lineHeight: 1.28, color: C.ink, marginTop: 10 * k }}>fix-ci is 12 commits behind main with 2 conflicts, both in the CI config, which I can resolve. Rebase it?</div>
              <div style={{ fontWeight: 500, fontSize: 14 * k, color: C.decideInk, marginTop: 10 * k, lineHeight: 1.4 }}>If you don't answer, I'll rebase in 30 min. It can be undone.</div>
              <div style={{ height: 5 * k, borderRadius: 4, background: "rgba(255,138,61,0.22)", marginTop: 12 * k }}>
                <div style={{ height: "100%", width: `${countdown * 100}%`, borderRadius: 4, background: C.accent }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 * k, marginTop: 16 * k }}>
                <Btn kind="plain" onTint scale={k}>Reply…</Btn>
                <Btn kind="secondary" onTint scale={k}>Hold</Btn>
                <Btn kind="ink" scale={k * 1.05} pressed={press}>Rebase</Btn>
              </div>
            </div>
              </div>
              {taken && (
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: C.okSurface, borderRadius: 22 * k, boxShadow: `0 ${4 * k}px 0 #B6E6C2`, padding: `${20 * k}px ${18 * k}px`, opacity: doneIn, transform: `scale(${0.96 + 0.04 * doneIn})`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 * k }}>
                  <div style={{ fontWeight: 700, fontSize: 15 * k, color: C.okInk }}><Check size={15 * k} color={C.okInk} /> You said: Rebase</div>
                  <div style={{ fontWeight: 800, fontSize: 22 * k, lineHeight: 1.3, color: C.ink }}>Rebasing fix-ci onto main now. I'll tell you when CI is green.</div>
                  <div style={{ fontWeight: 500, fontSize: 14 * k, color: C.okInk }}>It can be undone.</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 * k }}><Btn scale={k}>Close</Btn></div>
          </div>
        </Phone>
      </div>
      <Tap at={TAP} x={px + pw * 0.66 + pw * 0.032} y={py + ph - 168 * k} />
    </Fill>
  );
};
