// 6 · The phone buzzes once. The camera moves in on the one question, its default and the
// countdown to it (the product's signature: decisions carry defaults). One tap on Rebase; the
// card turns green, says what it's doing now, and that it can be undone.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy, useLang } from "../copy";
import { C } from "../theme";
import { Art, Btn, Check, Fill, Headline, Phone, Tap, clamp, easeOut, useSpring, useSquare, useT } from "../ui";

const BUZZ = 14, SHEET = 22, ZOOM = 30, TAP = 112;

export const Decide = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const c = useCopy();
  const lang = useLang();
  const t = useT();
  const enter = useSpring(0, { damping: 16, stiffness: 90 });
  const buzzing = frame >= BUZZ && frame < BUZZ + 14;
  const buzz = buzzing ? Math.sin((frame - BUZZ) * 2.4) * 2.4 : 0;
  const sheet = useSpring(SHEET, { damping: 17 });
  const press = interpolate(frame, [TAP - 2, TAP + 1, TAP + 6], [0, 1, 0], clamp);
  const taken = frame >= TAP + 4;
  const turn = interpolate(frame, [TAP + 4, TAP + 10], [0, 1], { ...clamp, easing: easeOut });
  const pop = interpolate(frame, [TAP + 4, TAP + 8, TAP + 13], [0.97, 1.025, 1], clamp);
  const mins = frame < 80 ? 30 : 29;
  const left = interpolate(frame, [SHEET, 80, 81, TAP], [1, 0.995, 0.967, 0.962], clamp);
  const pw = sq ? 400 : 470;
  const ph = pw * 2.06;
  const k = pw / 430; // sizes below are for a 430-wide phone
  const px = sq ? (width - pw) / 2 : 1250;
  const py = sq ? 300 : (height - ph) / 2;
  // the card's centre inside the phone, and where the camera puts it
  const card = { x: pw / 2, y: ph - 268 * k };
  const Z = sq ? 1.85 : 1.5;
  const target = sq ? { x: width / 2, y: 650 } : { x: 1395, y: 560 };
  const z = interpolate(frame, [ZOOM, ZOOM + 22], [0, 1], { ...clamp, easing: easeOut });
  const scale = 1 + (Z - 1) * z;
  const dx = (target.x - (px + card.x)) * z, dy = (target.y - (py + card.y)) * z;
  const tint = (a: string, b: string) => `color-mix(in srgb, ${b} ${Math.round(turn * 100)}%, ${a})`;
  return (
    <Fill style={{ background: C.bg }}>
      {/* on the square cut the phone sits under the headline: it fades out before reaching it */}
      <div style={{ position: "absolute", inset: 0, ...(sq ? { WebkitMaskImage: "linear-gradient(transparent 250px, black 330px)", maskImage: "linear-gradient(transparent 250px, black 330px)" } : {}) }}>
      <div style={{ position: "absolute", left: px, top: py, transformOrigin: `${card.x}px ${card.y}px`, transform: `translate(${dx}px, ${dy + (1 - enter) * 600}px) scale(${scale}) rotate(${buzz}deg)` }}>
        {buzzing && [-1, 1].map((d) => (
          <div key={d} style={{ position: "absolute", left: pw / 2 + d * (pw / 2 + 30) - 3, top: 150 * k, width: 6, height: 70 * k, borderRadius: 4, background: C.accent, opacity: 0.4 + 0.5 * Math.abs(Math.sin(frame * 1.3)) }} />
        ))}
        <Phone width={pw}>
          <div style={{ position: "absolute", top: 72 * k, left: 22 * k, right: 22 * k, display: "flex", alignItems: "center", gap: 10 * k }}>
            <Art src={taken ? "ducter/working.png" : "ducter/needsyou.png"} style={{ width: 54 * k }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 19 * k, color: C.ink }}>Ducter</div>
              <div style={{ fontWeight: 500, fontSize: 13 * k, color: C.muted }}>{t(taken ? c.working(3) : c.needsYou)}</div>
            </div>
          </div>
          {/* the conversation behind the sheet leaves as the camera moves in: no half line at the frame's top */}
          <div style={{ position: "absolute", top: 150 * k, left: 22 * k, right: 22 * k, fontSize: 16 * k, lineHeight: 1.5, color: C.ink, opacity: 0.55 * (1 - z) }}>
            <div style={{ background: C.accent, borderRadius: 16 * k, padding: `${9 * k}px ${14 * k}px`, marginLeft: 60 * k, marginBottom: 12 * k }}>{t(c.ask)}</div>
            <div>{t(c.ack)}</div>
          </div>
          <div style={{ position: "absolute", inset: 0, background: "rgba(43,33,24,0.28)", opacity: sheet }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 440 * k, background: C.bg, borderRadius: `${30 * k}px ${30 * k}px 0 0`, transform: `translateY(${(1 - sheet) * 460 * k}px)`, padding: 16 * k }}>
            <div style={{ width: 44 * k, height: 5 * k, borderRadius: 4, background: C.line2, margin: `0 auto ${14 * k}px` }} />
            <div style={{ position: "relative", height: (lang === "zh" ? 256 : 272) * k, borderRadius: 22 * k, background: tint(C.decideSurface, C.okSurface), boxShadow: `0 ${4 * k}px 0 ${tint(C.decideLedge, "#B6E6C2")}`, transform: `scale(${taken ? pop : 1})`, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, padding: `${16 * k}px ${18 * k}px`, opacity: 1 - turn }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 * k, color: C.decideInk }}>{t(c.askTitle)}</div>
                <div style={{ fontWeight: 800, fontSize: 19.5 * k, lineHeight: 1.3, color: C.ink, marginTop: 8 * k, wordBreak: lang === "zh" ? "keep-all" : undefined }}>{t(c.askQ)}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 * k, fontWeight: 750, fontSize: 14 * k, color: C.decideInk }}>
                  <span>{t(c.defaultIs)}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{t(c.minutes(mins))}</span>
                </div>
                <div style={{ height: 6 * k, borderRadius: 4, background: "rgba(255,138,61,0.22)", marginTop: 6 * k }}>
                  <div style={{ height: "100%", width: `${left * 100}%`, borderRadius: 4, background: C.accent }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 * k, marginTop: 14 * k }}>
                  <Btn kind="plain" onTint scale={k}>{c.reply}</Btn>
                  <Btn kind="secondary" onTint scale={k}>{c.hold}</Btn>
                  <div style={{ flex: 1 }} />
                  <Btn kind="ink" scale={k * 1.05} pressed={press}>{c.go}</Btn>
                </div>
              </div>
              {taken && (
                <div style={{ position: "absolute", inset: 0, padding: `${20 * k}px ${20 * k}px`, opacity: turn, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 * k }}>
                  <div style={{ fontWeight: 750, fontSize: 15 * k, color: C.okInk }}><Check size={15 * k} color={C.okInk} /> {t(c.youSaid)}</div>
                  <div style={{ fontWeight: 800, fontSize: 21 * k, lineHeight: 1.32, color: C.ink }}>{t(c.rebasing)}</div>
                  <div style={{ fontWeight: 700, fontSize: 16 * k, color: C.okInk }}>{t(c.undoable)}</div>
                </div>
              )}
            </div>
            <div style={{ fontWeight: 500, fontSize: 13 * k, color: C.muted, textAlign: "center", marginTop: 14 * k, opacity: 1 - turn }}>{t(c.askDefault(mins))}</div>
          </div>
          <Tap at={TAP} x={pw * 0.032 + pw - 16 * k - 62 * k - (lang === "zh" ? 70 : 53)} y={ph - 268 * k + 104 * k - (lang === "zh" ? 64 : 48)} size={k * 0.8} />
        </Phone>
      </div>
      </div>
      <Headline h={c.decideH} sub={c.decideSub} at={ZOOM - 4} />
    </Fill>
  );
};
