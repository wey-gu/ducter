// 7 · Done, in plain words: what changed and why, the checks it ran, and Merge into main as your
// call. The copy is the README hero's.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Btn, Bubble, Caption, Check, Code, Fill, MacWindow, Sub, clamp, useSpring, useSquare } from "../ui";

const Chip = ({ children, at }: { children: React.ReactNode; at: number }) => {
  const s = useSpring(at, { damping: 12, stiffness: 160 });
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 650, fontSize: 21, color: C.okInk, background: C.okSurface, borderRadius: 12, padding: "7px 14px", boxShadow: `0 3px 0 #B6E6C2`, transform: `scale(${s})`, opacity: s }}>
      {children}
    </div>
  );
};

export const Result = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const win = useSpring(0, { damping: 18, stiffness: 90 });
  const m1 = useSpring(10, { damping: 16 });
  const m2 = useSpring(24, { damping: 16 });
  const btns = useSpring(64, { damping: 14 });
  const glow = interpolate(frame, [80, 96, 120], [0, 1, 0.35], clamp);
  const ww = 1080, wh = 640;
  const scale = sq ? 0.84 : 1;
  return (
    <Fill style={{ background: C.bg }}>
      <div style={{ position: "absolute", left: sq ? 80 : 110, top: sq ? 80 : 330 }}>
        <Caption text={sq ? "Done, in plain words." : "Done, in\nplain words."} size={sq ? 84 : 112} at={4} />
        <Sub text={sq ? "With proof. Nothing merges until you say so." : "With proof. Nothing merges\nuntil you say so."} at={22} style={{ marginTop: 26, whiteSpace: "pre-line" }} size={sq ? 32 : 40} />
      </div>
      <div style={{ position: "absolute", left: sq ? (width - ww * scale) / 2 : 760, top: sq ? 290 : (height - wh) / 2, transform: `scale(${scale}) translateY(${(1 - win) * 80}px)`, transformOrigin: "0 0", opacity: win }}>
        <MacWindow face="ducter/done.png" status="1 done today · Working on 2" width={ww} height={wh}>
          <div style={{ padding: "30px 46px", display: "flex", flexDirection: "column", gap: 16 }}>
            <Bubble who="partner" style={{ opacity: m1, transform: `translateY(${(1 - m1) * 20}px)`, maxWidth: 900 }}>
              Fixed. The test slept a fixed 200 ms and hoped the flush had landed; now it waits for the flush itself. 50 runs in a row pass.
            </Bubble>
            <Bubble who="partner" style={{ opacity: m2, transform: `translateY(${(1 - m2) * 20}px)`, maxWidth: 900 }}>
              The change is on <Code>ducter/compaction-fix</Code>. Nothing is pushed.
            </Bubble>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
              <Chip at={38}><Check /> cargo test · 50/50 pass</Chip>
              <Chip at={46}><Check /> Workspace · 412 pass</Chip>
              <Chip at={54}><span style={{ color: C.ink }}>Diff · 2 files ›</span></Chip>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 14, opacity: btns, transform: `translateY(${(1 - btns) * 16}px)` }}>
              <Btn scale={1.35}>Open draft PR</Btn>
              <div style={{ borderRadius: 16, boxShadow: `0 0 0 ${8 * glow}px rgba(255,138,61,${0.35 * glow})` }}>
                <Btn kind="ink" scale={1.35}>Merge into main</Btn>
              </div>
            </div>
          </div>
        </MacWindow>
      </div>
    </Fill>
  );
};
