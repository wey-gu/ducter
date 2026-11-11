// 8 · Open anything, any time (v5: drawn, replacing v4's README crops). Two beats in one window:
// On hand as one list (D216: Working, Waiting, Done today, each row in the task's own words), a
// tap on the finished task, and the opened task with its workbench beside it (D214): the agent,
// model and effort it ran with (D202), what you asked, its steps, and Changes against main with
// the real diff from the Result scene's fix.
import type { ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy, useLang } from "../copy";
import { C, MONO } from "../theme";
import { Check, Fill, Headline, MacWindow, Tap, clamp, easeOut, useSpring, useSquare, useT, useType } from "../ui";

const OPEN = 66; // the tap on the done row; the task opens just after

const Section = ({ label, n, children }: { label: string; n: number; children: ReactNode }) => {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 750, fontSize: 21, color: C.muted }}>{t(label)} <span style={{ color: C.faint, marginLeft: 6 }}>{n}</span></div>
      {children}
    </div>
  );
};

const Row = ({ title, now, who, dot, tag, at, lit = 0 }: { title: string; now: string; who: string; dot: string; tag?: string; at: number; lit?: number }) => {
  const t = useT();
  const s = useSpring(at, { damping: 17 });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, background: C.surface, borderRadius: 18, padding: "12px 22px", boxShadow: `0 3px 0 ${C.line}${lit ? `, 0 0 0 ${3 * lit}px ${C.ink}` : ""}`, opacity: s, transform: `translateY(${(1 - s) * 14}px)` }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: dot, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 750, fontSize: 25, color: C.ink, whiteSpace: "nowrap" }}>{t(title)}</div>
        <div style={{ fontWeight: 500, fontSize: 19, color: C.muted, marginTop: 3, whiteSpace: "nowrap" }}>{t(now)}</div>
      </div>
      {tag && <div style={{ fontWeight: 700, fontSize: 18, color: C.okInk, background: C.okSurface, borderRadius: 10, padding: "4px 12px" }}>{t(tag)}</div>}
      <div style={{ fontWeight: 600, fontSize: 18, color: C.muted, whiteSpace: "nowrap" }}>{who}</div>
    </div>
  );
};

const OnHand = ({ lit }: { lit: number }) => {
  const c = useCopy();
  return (
    <div style={{ padding: "22px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Section label={c.secWorking} n={2}>
        <Row title={c.rowRebase} now={c.rowRebaseNow} who="Claude Code" dot={C.work} at={6} />
        <Row title={c.rowPRs} now={c.rowPRsNow} who="Codex" dot={C.work} at={10} />
      </Section>
      <Section label={c.secWaiting} n={1}>
        <Row title={c.rowNotes} now={c.rowNotesNow} who="pi" dot={C.faint} at={14} />
      </Section>
      <Section label={c.secDone} n={1}>
        <Row title={c.rowFix} now={c.rowFixNow} who="Claude Code" dot={C.okStrong} tag={c.draftPR} at={18} lit={lit} />
      </Section>
    </div>
  );
};

type Line = [kind: " " | "-" | "+", no: string, code: string];
const DIFF: Line[] = [
  [" ", "7", "for i in 0..1_000 {"],
  [" ", "8", "    db.put(format!(\"k{i:04}\"), format!(\"v{i}\")).unwrap();"],
  [" ", "9", "}"],
  ["-", "10", "db.flush_async();"],
  ["-", "11", "// give the flush time to land"],
  ["-", "12", "std::thread::sleep(Duration::from_millis(200));"],
  ["+", "10", "let seq = db.flush_async();"],
  ["+", "11", "// wait for the flush itself, however busy the machine is"],
  ["+", "12", "db.wait_for_flush(seq, Duration::from_secs(5)).unwrap();"],
  [" ", "13", "db.compact_range(..).unwrap();"],
];

const Bench = ({ at }: { at: number }) => {
  const c = useCopy();
  const t = useT();
  const frame = useCurrentFrame();
  const files: [string, string, string][] = [["crates/storage/tests/compaction.rs", "+3", "−3"], ["crates/storage/src/flush.rs", "+7", "−1"]];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 22px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: C.ink, marginRight: 14 }}>{t(c.workbench)}</div>
        {[c.pChanges, c.pFiles, c.pPreview].map((p, i) => (
          <div key={p} style={{ fontWeight: i === 0 ? 750 : 600, fontSize: 19, padding: "6px 14px", borderRadius: 10, color: i === 0 ? C.ink : C.muted, background: i === 0 ? C.sunken : "transparent" }}>{t(p)}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontWeight: 600, fontSize: 17, color: C.muted }}>{t(c.against)}</div>
      </div>
      <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
        {files.map(([f, a, d], i) => (
          <div key={f} style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 17, padding: "8px 12px", borderRadius: 10, background: i === 0 ? C.bg : "transparent", color: C.ink }}>
            <span style={{ flex: 1 }}>{f}</span>
            <span style={{ color: C.okStrong }}>{a}</span>
            <span style={{ color: "#C0492B" }}>{d}</span>
          </div>
        ))}
      </div>
      <div style={{ margin: "0 22px", borderRadius: 14, background: C.bg, padding: "12px 0", fontFamily: MONO, fontSize: 16.5, lineHeight: "31px" }}>
        {DIFF.map(([k, no, code], i) => {
          const p = interpolate(frame, [at + 8 + i * 1.6, at + 16 + i * 1.6], [0, 1], { ...clamp, easing: easeOut });
          return (
            <div key={i} style={{ display: "flex", whiteSpace: "pre", opacity: p, background: k === "-" ? "#FBE1DA" : k === "+" ? C.okSurface : "transparent", color: k === "-" ? "#8E2F18" : k === "+" ? C.okInk : C.ink2 }}>
              <span style={{ width: 56, textAlign: "right", paddingRight: 14, color: C.faint }}>{no}</span>
              <span style={{ width: 22 }}>{k === " " ? "" : k}</span>
              <span>{code}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Task = ({ at }: { at: number }) => {
  const c = useCopy();
  const t = useT();
  const zh = useLang() === "zh";
  return (
    <div style={{ padding: "26px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 28, color: C.ink, lineHeight: 1.2 }}>{t(c.rowFix)}</div>
      <div style={{ alignSelf: "flex-start", fontWeight: 650, fontSize: 18, color: C.ink2, background: C.sunken, borderRadius: 999, padding: "6px 14px" }}>{t(c.pill)}</div>
      <div style={{ background: C.surface, borderRadius: 16, padding: "14px 18px", boxShadow: `0 3px 0 ${C.line}` }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.muted }}>{t(c.whatYouAsked)}</div>
        <div style={{ fontWeight: 500, fontSize: 20, lineHeight: zh ? 1.6 : 1.4, color: C.ink, marginTop: 4 }}>{t(c.ask)}</div>
      </div>
      {[c.step1, c.step2].map((s, i) => (
        <div key={s} style={{ display: "flex", gap: 10, fontWeight: 500, fontSize: 19, color: C.ink2 }}>
          <span style={{ color: C.faint }}>{"•"}</span>{t(s)}<span style={{ color: C.okStrong, fontFamily: MONO, fontSize: 16, marginTop: 3 }}>{i ? "+7 −1" : "+3 −3"}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 650, fontSize: 19, color: C.okInk }}><Check size={18} color={C.okInk} />{t(c.step3)}</div>
    </div>
  );
};

export const Workbench = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const type = useType();
  const c = useCopy();
  const zh = useLang() === "zh";
  const win = useSpring(0, { damping: 18, stiffness: 90 });
  const lit = interpolate(frame, [OPEN - 4, OPEN + 2], [0, 1], clamp);
  const open = interpolate(frame, [OPEN + 6, OPEN + 18], [0, 1], { ...clamp, easing: easeOut });
  const bench = useSpring(OPEN + 14, { damping: 18, stiffness: 110 });
  const top = sq ? 290 : 300;
  const ww = sq ? 1180 : 1680;
  const wh = sq ? 760 : zh ? 700 : 660;
  const scale = sq ? (width - type.x * 2) / ww : 1;
  const left = sq ? 0 : 560; // the task's column on the wide cut; the square shows the workbench alone
  return (
    <Fill style={{ background: C.bgDeep }}>
      <Headline h={c.realH} sub={c.realSub} />
      <div style={{ position: "absolute", left: type.x, top, transform: `scale(${scale}) translateY(${(1 - win) * 60}px)`, transformOrigin: "0 0", opacity: win }}>
        <MacWindow face={open > 0.5 ? "ducter/done.png" : "ducter/working.png"} status={open > 0.5 ? c.doneToday : c.working(2)} width={ww} height={Math.min(wh, (height - top - 40) / scale)}>
          <div style={{ position: "absolute", top: 92, left: 0, right: 0, bottom: 0, opacity: 1 - open }}>
            <OnHand lit={lit} />
          </div>
          {open > 0 && (
            <div style={{ position: "absolute", top: 92, left: 0, right: 0, bottom: 0, opacity: open, display: "flex" }}>
              {!sq && <div style={{ width: left, borderRight: `1px solid ${C.line}` }}><Task at={OPEN} /></div>}
              <div style={{ flex: 1, transform: `translateX(${(1 - bench) * 80}px)`, opacity: bench }}>
                <Bench at={OPEN + 14} />
              </div>
            </div>
          )}
        </MacWindow>
        <Tap at={OPEN} x={sq ? 700 : 1100} y={zh ? 583 : 540} size={1} />
      </div>
    </Fill>
  );
};
