// 9 · It looks out for you, quietly (D165, D173). The morning note at the end of quiet hours:
// a greeting at most, then the finds themselves, each with its one next step, Hold and How I know.
// It never says what or how much it read; on a quiet day there is no note at all. The finds are
// design/connectors.md §6's own example (a domain about to lapse, a night with nowhere to stay).
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy, useLang } from "../copy";
import { C, cardShadow } from "../theme";
import { Art, Btn, Bubble, Fill, Headline, MacWindow, clamp, useSpring, useSquare, useT, useType } from "../ui";

const Find = ({ text, go, at }: { text: string; go: string; at: number }) => {
  const c = useCopy();
  const t = useT();
  const zh = useLang() === "zh";
  const s = useSpring(at, { damping: 16 });
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * 16}px)`, background: C.surface, borderRadius: 20, padding: "18px 24px", boxShadow: cardShadow, maxWidth: 1040, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 27, lineHeight: zh ? 1.6 : 1.4, fontWeight: 500, color: C.ink }}>{t(text)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Btn kind="ink" scale={1.15}>{t(go)}</Btn>
        <Btn scale={1.15}>{c.hold}</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ fontWeight: 650, fontSize: 21, color: C.muted }}>{t(c.howIKnow)} ›</div>
      </div>
    </div>
  );
};

export const HeadsUp = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const sq = useSquare();
  const type = useType();
  const c = useCopy();
  const t = useT();
  const win = useSpring(0, { damping: 18, stiffness: 90 });
  const hi = useSpring(10, { damping: 16 });
  const ww = 1180, wh = 590;
  const scale = sq ? (width - type.x * 2) / ww : 1;
  const wake = useSpring(6, { damping: 10, stiffness: 120 });
  // the light of a morning: the room warms as the note arrives
  const warm = interpolate(frame, [0, 40], [0, 1], clamp);
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(1200px 700px at 12% 100%, rgba(255,214,160,${0.45 * warm}), rgba(255,214,160,0))` }} />
      <Headline h={c.headsH} sub={sq ? c.headsSub.replace("\n", " ") : c.headsSub} />
      <div style={{ position: "absolute", left: sq ? type.x : 760, top: sq ? 380 : 400, transform: `scale(${sq ? scale : 0.9}) translateY(${(1 - win) * 60}px)`, transformOrigin: "0 0", opacity: win }}>
        <MacWindow face="ducter/idle.png" status={c.keepingEye} width={ww} height={wh}>
          <div style={{ padding: "22px 44px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ alignSelf: "center", fontWeight: 600, fontSize: 18, color: C.muted, opacity: hi }}>08:00</div>
            <Bubble who="partner" style={{ opacity: hi, transform: `translateY(${(1 - hi) * 14}px)` }}>{t(c.morning)}</Bubble>
            <Find text={c.find1} go={c.find1Go} at={24} />
            <Find text={c.find2} go={c.find2Go} at={40} />
          </div>
        </MacWindow>
      </div>
      {!sq && (
        <div style={{ position: "absolute", left: 210, top: 590, width: 330, transformOrigin: "50% 95%", transform: `scale(${0.9 + 0.1 * wake}, ${1.1 - 0.1 * wake})`, opacity: Math.min(1, wake * 2) }}>
          <Art src="ducter/idle.png" style={{ width: "100%" }} />
        </div>
      )}
    </Fill>
  );
};
