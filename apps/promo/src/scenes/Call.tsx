// 12 · It can make the call, too (D189, D208, D218). Dinner on the Tokyo trip: one Go card says
// exactly who, what for, what may and won't be said, whose voice, from which number and about how
// long; no countdown, no default (a call never has one). One tap on Call; the call runs from the
// owner's own phone, and its outcome comes back in one line.
import type { ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy, useLang } from "../copy";
import { C, cardShadow } from "../theme";
import { Art, Btn, Check, Fill, Headline, Tap, clamp, easeOut, useSpring, useSquare, useT, useType } from "../ui";

const CARD = 18, TAP = 80, LIVE = 86, DONE = 116;

const Field = ({ k, v }: { k: string; v: ReactNode }) => {
  const t = useT();
  return (
    <div style={{ display: "flex", gap: 20, fontSize: 22, lineHeight: 1.3 }}>
      <div style={{ width: 130, flex: "none", fontWeight: 650, color: C.decideInk }}>{t(k)}</div>
      <div style={{ fontWeight: 550, color: C.ink }}>{typeof v === "string" ? t(v) : v}</div>
    </div>
  );
};

export const Call = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const sq = useSquare();
  const type = useType();
  const c = useCopy();
  const t = useT();
  const zh = useLang() === "zh";
  const card = useSpring(CARD, { damping: 17 });
  const press = interpolate(frame, [TAP - 2, TAP + 1, TAP + 6], [0, 1, 0], clamp);
  const gone = interpolate(frame, [TAP + 4, TAP + 12], [0, 1], { ...clamp, easing: easeOut });
  const live = useSpring(LIVE, { damping: 17 });
  const done = interpolate(frame, [DONE, DONE + 8], [0, 1], { ...clamp, easing: easeOut });
  const handset = useSpring(4, { damping: 11, stiffness: 120 });
  const ring = frame >= LIVE && frame < DONE ? Math.sin((frame - LIVE) * 1.1) * 3 : 0;
  const secs = Math.max(0, Math.floor((frame - LIVE) * 2.2));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const cw = 960;
  const ks = sq ? (width - type.x * 2) / cw : 1;
  const cx = type.x, cy = sq ? 330 : 480;
  return (
    <Fill style={{ background: C.bg }}>
      <Headline h={c.callH} sub={sq ? c.callSub.replace("\n", " ") : c.callSub} />
      {/* on the square cut the handset comes in under the call's row once the Go card has gone */}
      {sq && frame >= LIVE - 2 && (
        <div style={{ position: "absolute", left: width - type.right - 230, top: 600, width: 230, transformOrigin: "50% 90%", transform: `scale(${0.9 + 0.1 * live}, ${1.1 - 0.1 * live}) rotate(${ring}deg)`, opacity: Math.min(1, live * 2) }}>
          <Art src="clay/ab_call.png" safe="ducter" style={{ width: "100%" }} />
        </div>
      )}
      {!sq && (
        <div style={{ position: "absolute", left: 1300, top: 360, width: 420, transformOrigin: "50% 90%", transform: `scale(${0.9 + 0.1 * handset}, ${1.1 - 0.1 * handset}) rotate(${ring}deg)`, opacity: Math.min(1, handset * 2) }}>
          <Art src="clay/ab_call.png" safe="ducter" style={{ width: "100%" }} />
        </div>
      )}
      <div style={{ position: "absolute", left: cx, top: cy, width: cw, transform: `scale(${ks})`, transformOrigin: "0 0" }}>
        {/* the Go card */}
        <div style={{ position: "absolute", left: 0, top: 0, width: cw, opacity: card * (1 - gone), transform: `translateY(${(1 - card) * 30 - gone * 20}px)` }}>
          <div style={{ background: C.decideSurface, borderRadius: 26, padding: "22px 30px", boxShadow: `0 4px 0 ${C.decideLedge}, 0 18px 40px -18px rgba(43,33,24,0.25)` }}>
            <div style={{ fontWeight: 800, fontSize: 36, color: C.ink, marginBottom: 14 }}>{t(c.callQ)}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Field k={c.rNumber} v={<span style={{ fontVariantNumeric: "tabular-nums" }}>+81 3 5568 0142</span>} />
              <Field k={c.rWhat} v={c.vWhat} />
              <Field k={c.rMay} v={c.vMay} />
              <Field k={c.rWont} v={c.vWont} />
              <Field k={c.rVoice} v={c.vVoice} />
              <Field k={c.rFrom} v={c.vFrom} />
              <Field k={c.rAbout} v={c.vAbout} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
              <div style={{ flex: 1 }} />
              <Btn onTint scale={1.3}>{t(c.notNow)}</Btn>
              <Btn kind="ink" scale={1.35} pressed={press}>{t(c.callGo)}</Btn>
            </div>
          </div>
        </div>
        {/* On hand's row while it calls, then the outcome */}
        {frame >= LIVE - 2 && (
          <div style={{ position: "absolute", left: 0, top: 40, width: cw, opacity: live, transform: `translateY(${(1 - live) * 20}px)` }}>
            <div style={{ background: done > 0.5 ? C.okSurface : C.surface, borderRadius: 24, padding: "26px 30px", boxShadow: done > 0.5 ? `0 4px 0 #B6E6C2` : cardShadow, display: "flex", flexDirection: "column", gap: 12 }}>
              {done > 0.5 ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 750, fontSize: 24, color: C.okInk }}><Check size={24} color={C.okInk} />{t(c.called)}</div>
                  <div style={{ fontWeight: 800, fontSize: 34, lineHeight: zh ? 1.4 : 1.25, color: C.ink, opacity: done }}>{t(c.calledLine)}</div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 7, background: C.work, opacity: 0.55 + 0.45 * Math.sin(frame / 4) }} />
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 26, color: C.ink }}>{t(c.onCall)}</div>
                  <div style={{ fontWeight: 650, fontSize: 24, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{clock}</div>
                  <Btn scale={1.15}>{t(c.hangUp)}</Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <Tap at={TAP} x={cx + (cw - 78) * ks} y={cy + 372 * ks} size={ks} />
    </Fill>
  );
};
