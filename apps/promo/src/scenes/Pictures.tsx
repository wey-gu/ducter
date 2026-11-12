// 9 · Send a picture, get one back (D206). On the owner's iPhone: a screenshot of ducter.ai where
// the film won't play, sent with one line; the partner's answer comes back with the task's own
// picture (the film playing), and a tap grows it into the viewer: From {task}, Save, Share, Copy.
// The content is this very fix (Safari was handed the film as a download).
import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy, useLang } from "../copy";
import { C, HEAD } from "../theme";
import { Art, Fill, Headline, Phone, PlayMark, Tap, clamp, easeOut, useSpring, useSquare, useT } from "../ui";

const SEND = 10, REPLY = 44, TAP = 82;

/** The owner's screenshot: ducter.ai's last section on an iPhone, the film's poster that won't play. */
const SiteShot = ({ w }: { w: number }) => (
  <div style={{ width: w, height: w * 1.5, background: C.bg, borderRadius: w * 0.06, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: w * 0.16, boxShadow: `0 0 0 1px ${C.line}` }}>
    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: w * 0.13, color: C.ink, letterSpacing: "-0.02em" }}>Say it once.</div>
    <div style={{ width: w * 0.62, height: w * 0.035, borderRadius: 9, background: C.line, marginTop: w * 0.06 }} />
    <div style={{ position: "relative", width: w * 0.86, marginTop: w * 0.1, borderRadius: w * 0.05, overflow: "hidden", aspectRatio: "16 / 9" }}>
      <Art src="shots/film-poster.webp" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: w * 0.2, height: w * 0.2, margin: -w * 0.1, borderRadius: 99, background: "rgba(43,33,24,0.45)", display: "grid", placeItems: "center" }}>
        <PlayMark size={w * 0.1} color="rgba(255,255,255,0.55)" />
      </div>
    </div>
    <div style={{ display: "flex", gap: w * 0.04, marginTop: w * 0.12 }}>
      <div style={{ width: w * 0.32, height: w * 0.1, borderRadius: w * 0.03, background: C.surface, boxShadow: `0 2px 0 ${C.line2}` }} />
      <div style={{ width: w * 0.32, height: w * 0.1, borderRadius: w * 0.03, background: C.ink }} />
    </div>
  </div>
);

/** The task's picture: the film playing on the page, its controls showing. */
const FilmShot = ({ w, style }: { w: number; style?: CSSProperties }) => (
  <div style={{ position: "relative", width: w, aspectRatio: "16 / 9", borderRadius: w * 0.04, overflow: "hidden", ...style }}>
    <Art src="shots/film-poster.webp" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: w * 0.12, background: "linear-gradient(rgba(20,13,7,0), rgba(20,13,7,0.7))", display: "flex", alignItems: "center", gap: w * 0.03, padding: `0 ${w * 0.04}px` }}>
      <div style={{ display: "flex", gap: w * 0.012 }}>
        <div style={{ width: w * 0.012, height: w * 0.04, borderRadius: 2, background: "#fff" }} />
        <div style={{ width: w * 0.012, height: w * 0.04, borderRadius: 2, background: "#fff" }} />
      </div>
      <div style={{ flex: 1, height: w * 0.008, borderRadius: 9, background: "rgba(255,255,255,0.35)" }}>
        <div style={{ width: "23%", height: "100%", borderRadius: 9, background: "#fff" }} />
      </div>
      <div style={{ color: "#fff", fontWeight: 600, fontSize: w * 0.034, fontVariantNumeric: "tabular-nums" }}>0:12</div>
    </div>
  </div>
);

export const Pictures = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const c = useCopy();
  const t = useT();
  const zh = useLang() === "zh";
  const enter = useSpring(0, { damping: 16, stiffness: 90 });
  const sent = useSpring(SEND, { damping: 16 });
  const reply = useSpring(REPLY, { damping: 16 });
  const view = interpolate(frame, [TAP + 4, TAP + 18], [0, 1], { ...clamp, easing: easeOut });
  const bar = interpolate(frame, [TAP + 14, TAP + 22], [0, 1], clamp);
  const pw = sq ? 440 : 460;
  const ph = pw * 2.06;
  const k = pw / 430;
  const px = sq ? (width - pw) / 2 : 1250;
  const py = sq ? height - 40 - ph : (height - ph) / 2;
  const inner = pw * (1 - 0.064); // the screen's width
  // the reply's picture in the thread, and where it grows to in the viewer
  const tile = { x: 22 * k, y: 0, w: 300 * k };
  const big = { w: inner };
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", inset: 0, ...(sq ? { WebkitMaskImage: "linear-gradient(transparent 300px, black 380px)", maskImage: "linear-gradient(transparent 300px, black 380px)" } : {}) }}>
        <div style={{ position: "absolute", left: px, top: py, transform: `translateY(${(1 - enter) * 600}px)` }}>
          <Phone width={pw}>
            <div style={{ position: "absolute", top: 72 * k, left: 22 * k, right: 22 * k, display: "flex", alignItems: "center", gap: 10 * k }}>
              <Art src={frame >= REPLY ? "ducter/done.png" : "ducter/working.png"} style={{ width: 54 * k }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 19 * k, color: C.ink }}>Ducter</div>
                <div style={{ fontWeight: 500, fontSize: 13 * k, color: C.muted }}>{t(frame >= REPLY ? c.doneToday : c.working(3))}</div>
              </div>
            </div>
            <div style={{ position: "absolute", top: 150 * k, left: 22 * k, right: 22 * k, display: "flex", flexDirection: "column", gap: 12 * k }}>
              <div style={{ alignSelf: "flex-end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 * k, opacity: sent, transform: `translateY(${(1 - sent) * 60}px)` }}>
                <SiteShot w={150 * k} />
                <div style={{ background: C.accent, borderRadius: `${16 * k}px ${16 * k}px ${5 * k}px ${16 * k}px`, padding: `${9 * k}px ${14 * k}px`, fontSize: 16 * k, lineHeight: zh ? 1.6 : 1.4, color: C.ink, maxWidth: 300 * k, boxShadow: `0 3px 0 ${C.accentLedge}` }}>{t(c.picAsk)}</div>
              </div>
              <div style={{ alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 6 * k, opacity: reply, transform: `translateY(${(1 - reply) * 14}px)` }}>
                <div style={{ background: C.surface, borderRadius: `${16 * k}px ${16 * k}px ${16 * k}px ${5 * k}px`, padding: `${9 * k}px ${14 * k}px`, fontSize: 16 * k, lineHeight: zh ? 1.6 : 1.4, color: C.ink, maxWidth: 320 * k, boxShadow: `0 3px 0 ${C.line}` }}>{t(c.picReply)}</div>
                <FilmShot w={tile.w} style={{ opacity: 1 - view, boxShadow: `0 3px 0 ${C.line}` }} />
              </div>
            </div>
            {/* the viewer: the picture grows out of its tile onto a dark ground */}
            {view > 0 && (
              <div style={{ position: "absolute", inset: 0, background: `rgba(20,13,7,${view})`, zIndex: 4 }}>
                <div style={{ position: "absolute", top: 96 * k, left: 0, right: 0, textAlign: "center", color: "#F3E7D6", fontWeight: 600, fontSize: 14 * k, opacity: bar, padding: `0 ${30 * k}px` }}>{t(c.picFrom)}</div>
                <div style={{ position: "absolute", top: 22 * k, right: 22 * k, width: 30 * k, height: 30 * k, opacity: bar }}>
                  <svg width="100%" height="100%" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#F3E7D6" strokeWidth={2.4} strokeLinecap="round" /></svg>
                </div>
                <FilmShot
                  w={interpolate(view, [0, 1], [tile.w, big.w])}
                  style={{ position: "absolute", left: interpolate(view, [0, 1], [tile.x, 0]), top: interpolate(view, [0, 1], [ph * 0.58, (ph - pw * 0.064 - big.w * 0.5625) / 2]), borderRadius: interpolate(view, [0, 1], [12 * k, 0]) }}
                />
                <div style={{ position: "absolute", bottom: 46 * k, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 34 * k, color: "#F3E7D6", fontWeight: 650, fontSize: 15 * k, opacity: bar }}>
                  <span>{t(c.save)}</span><span>{t(c.share)}</span><span>{t(c.copy)}</span>
                </div>
              </div>
            )}
            <Tap at={TAP} x={pw * 0.032 + tile.x + tile.w / 2} y={ph * 0.58 + 60 * k} size={k * 0.8} />
          </Phone>
        </div>
      </div>
      {!sq && (
        <div style={{ position: "absolute", left: 250, top: 560, width: 320, transformOrigin: "50% 95%", transform: `scale(${0.9 + 0.1 * enter}, ${1.1 - 0.1 * enter})`, opacity: Math.min(1, enter * 2) }}>
          <Art src={frame >= REPLY ? "ducter/done.png" : "ducter/working.png"} safe="ducter" style={{ width: "100%" }} />
        </div>
      )}
      <Headline h={c.picH} sub={sq ? c.picSub.replace("\n", " ") : c.picSub} />
    </Fill>
  );
};
