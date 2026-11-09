// 7 · Done, in plain words: what changed and why in two sentences, the checks it ran as proof,
// and Merge into main left as your call. The copy is the README hero's.
import type { ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy } from "../copy";
import { C } from "../theme";
import { Art, Btn, Bubble, Check, Code, Fill, Headline, MacWindow, Sparkles, clamp, useSpring, useSquare, useT, useType } from "../ui";

const Chip = ({ children, at, ok = true }: { children: ReactNode; at: number; ok?: boolean }) => {
  const s = useSpring(at, { damping: 11, stiffness: 170 });
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: 24, color: ok ? C.okInk : C.ink, background: ok ? C.okSurface : C.surface, borderRadius: 14, padding: "9px 16px", boxShadow: `0 3px 0 ${ok ? "#B6E6C2" : C.line}`, transform: `scale(${s})`, opacity: Math.min(1, s * 1.5) }}>
      {children}
    </div>
  );
};

export const Result = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const sq = useSquare();
  const type = useType();
  const c = useCopy();
  const t = useT();
  const win = useSpring(0, { damping: 18, stiffness: 90 });
  const m1 = useSpring(8, { damping: 16 });
  const m2 = useSpring(20, { damping: 16 });
  const btns = useSpring(56, { damping: 14 });
  const glow = interpolate(frame, [70, 84, 110], [0, 1, 0.4], clamp);
  const ww = 1180, wh = 500;
  const scale = sq ? (width - type.x * 2) / ww : 1;
  const nod = useSpring(10, { damping: 9, stiffness: 140 });
  return (
    <Fill style={{ background: C.bg }}>
      <Headline h={c.resultH} sub={sq ? c.resultSub.replace("\n", " ") : c.resultSub} />
      <div style={{ position: "absolute", left: sq ? type.x : 690, top: sq ? 390 : 340, transform: `scale(${sq ? scale : 0.9}) translateY(${(1 - win) * 60}px)`, transformOrigin: "0 0", opacity: win }}>
        <MacWindow face="ducter/done.png" status={c.doneToday} width={ww} height={wh}>
          <div style={{ padding: "26px 44px", display: "flex", flexDirection: "column", gap: 14 }}>
            <Bubble who="partner" style={{ opacity: m1, transform: `translateY(${(1 - m1) * 14}px)`, maxWidth: 1040 }}>{t(c.fixed)}</Bubble>
            <Bubble who="partner" style={{ opacity: m2, transform: `translateY(${(1 - m2) * 14}px)`, maxWidth: 1040 }}>
              {t(c.branchA)}<Code>ducter/compaction-fix</Code>{t(c.branchB)}
            </Bubble>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              <Chip at={32}><Check /> {t(c.chipTest)}</Chip>
              <Chip at={38}><Check /> {t(c.chipWs)}</Chip>
              <Chip at={44} ok={false}>{t(c.chipDiff)}</Chip>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, opacity: btns, transform: `translateY(${(1 - btns) * 12}px)` }}>
              <Btn scale={1.3}>{t(c.openPR)}</Btn>
              <div style={{ borderRadius: 16, boxShadow: `0 0 0 ${9 * glow}px rgba(255,138,61,${0.3 * glow})` }}>
                <Btn kind="ink" scale={1.3}>{t(c.merge)}</Btn>
              </div>
            </div>
          </div>
        </MacWindow>
      </div>
      {!sq && (
        <div style={{ position: "absolute", left: 230, top: 560, width: 330, transformOrigin: "50% 95%", transform: `scale(${0.9 + 0.1 * nod}, ${1.1 - 0.1 * nod})`, opacity: Math.min(1, nod * 2) }}>
          <Art src="ducter/done.png" style={{ width: "100%" }} />
        </div>
      )}
      {!sq && <Sparkles at={14} x={395} y={600} r={170} n={8} color="#FFD9B8" />}
    </Fill>
  );
};
