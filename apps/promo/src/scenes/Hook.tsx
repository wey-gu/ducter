// 1 · The hook: how many of us work with agents today. A wall of terminals; one after another
// they stop and ask for you, the asks piling up; then the wall dims and one calm band of
// Ducter's paper says it plainly. Under 4 s.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy } from "../copy";
import { C, MONO } from "../theme";
import { Art, Caption, Fill, clamp, easeOut, useSquare } from "../ui";

type Tile = { coin: string; title: string; lines: string[]; ask: string };

// Realistic agent output from the same week of work the rest of the video shows (README, HawDB).
const TILES: Tile[] = [
  { coin: "claude_code", title: "claude · hawdb", lines: ["⏺ Read crates/storage/tests/compaction.rs", "⏺ Bash(cargo test -p hawdb-storage compaction)", "  test result: FAILED. 47 passed; 3 failed"], ask: "Make this edit to flush.rs?  1. Yes  2. No" },
  { coin: "codex", title: "codex · oar-runner", lines: ["• Updating the 3 steer calls in the runner", "• Ran bun test packages/runner", "  └ 2 fail · 118 pass"], ask: "Allow command?  bun install  (y/n)" },
  { coin: "pi", title: "pi · release-notes", lines: ["reading CHANGELOG.md", "reading 14 merged PRs since v0.3", "waiting on the v0.4 CI run"], ask: "CI is still running. Keep waiting?" },
  { coin: "deepseek_harness", title: "deepseek · docs", lines: ["> scanning docs/ for stale links", "> 3 links point at removed pages", "> 1 has no obvious target"], ask: "Which page should /docs/focus point to?" },
  { coin: "claude_code", title: "claude · review PRs", lines: ["⏺ Reviewing #1588 · read 6 files", "⏺ Reviewing #1592 · CI pending", "  Context left until auto-compact: 9%"], ask: "Post a review comment on #1590?" },
  { coin: "pi", title: "pi · dependency check", lines: ["checking 41 crates for updates", "tokio 1.47 → 1.48 (minor)", "rustls 0.23 → 0.24 (breaking)"], ask: "Upgrade rustls now or wait?" },
  { coin: "claude_code", title: "claude · site", lines: ["⏺ Bash(bun run build)", "  built 38 pages in 4.1s", "⏺ Preview ready on :4321"], ask: "Deploy to production?  1. Yes  2. No" },
  { coin: "deepseek_harness", title: "deepseek · translate", lines: ["> docs/getting-started.md → zh", "> docs/faq.md → zh", "> 2 terms not in the glossary"], ask: "Use 手头的事 for 'On hand'?" },
  { coin: "codex", title: "codex · flaky test", lines: ["• Running compaction 50 times", "• 47 passed; 3 failed", "• Proposed: wait for the flush"], ask: "Apply patch to 2 files?  (y/n)" },
  { coin: "claude_code", title: "claude · inbox", lines: ["⏺ Read 23 unread threads", "⏺ 2 need a reply this week", "⏺ Drafted 2 replies"], ask: "Send these 2 replies?  1. Yes  2. No" },
  { coin: "pi", title: "pi · weekly digest", lines: ["reading 9 open PRs", "reading 4 new issues", "#1601 duplicates #1577"], ask: "Close #1601 as a duplicate?" },
  { coin: "codex", title: "codex · fix-ci", lines: ["• fix-ci is 12 commits behind main", "• 2 conflicts, both in .github/ci.yml", "• stopped before rebasing"], ask: "Rebase fix-ci onto main?  (y/n)" },
];
// the order the asks arrive in, scattered over the wall
const ORDER = [5, 0, 10, 3, 7, 1, 11, 8, 2, 6, 9, 4];
const ASK0 = 8, ASK_EVERY = 3.5;
const DIM = 50, BAND = 48;

const TileView = ({ t, i, w, h }: { t: Tile; i: number; w: number; h: number }) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [i * 0.8, i * 0.8 + 6], [0, 1], clamp);
  const shown = Math.min(t.lines.length, Math.floor(frame / 4) + 1);
  const askAt = ASK0 + ORDER.indexOf(i) * ASK_EVERY;
  const asking = frame >= askAt;
  const since = frame - askAt;
  // a prompt arriving: the frame flashes, then blinks on and off like a waiting terminal
  const flash = asking ? interpolate(since, [0, 2, 10], [0, 1, 0.45], clamp) : 0;
  const blink = asking && since > 10 ? (Math.floor(since / 8) % 2 === 0 ? 0.55 : 0.25) : flash;
  const shake = asking && since < 6 ? Math.sin(since * 2.8) * 5 * (1 - since / 6) : 0;
  return (
    <div style={{ width: w, height: h, borderRadius: 18, background: C.term, overflow: "hidden", opacity: appear, transform: `translateX(${shake}px)`, boxShadow: `0 0 0 ${asking ? 3 : 0}px rgba(255,138,61,${blink}), 0 20px 40px -20px rgba(0,0,0,0.6)` }}>
      <div style={{ height: 50, background: C.termBar, display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
        <Art src={`clay/coin_${t.coin}.png`} style={{ width: 30, height: 30 }} />
        <div style={{ fontFamily: MONO, fontSize: 19, color: C.termText, opacity: 0.85 }}>{t.title}</div>
        <div style={{ flex: 1 }} />
        {asking && <div style={{ width: 13, height: 13, borderRadius: 8, background: C.accent, opacity: 0.4 + blink }} />}
      </div>
      <div style={{ padding: "16px 20px", fontFamily: MONO, fontSize: 18.5, lineHeight: 1.6, color: C.termText }}>
        {t.lines.slice(0, shown).map((l, k) => <div key={k} style={{ opacity: 0.66, whiteSpace: "pre" }}>{l}</div>)}
        {asking && (
          <div style={{ marginTop: 8, color: C.accent, whiteSpace: "pre", opacity: interpolate(since, [0, 2], [0, 1], clamp) }}>
            {"? "}{t.ask}<span style={{ opacity: since % 16 < 8 ? 1 : 0 }}>▌</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const Hook = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const sq = useSquare();
  const c = useCopy();
  const cols = sq ? 3 : 4;
  const gap = 22;
  const tw = sq ? 420 : 500;
  const th = sq ? 300 : 330;
  const rows = Math.ceil(TILES.length / cols);
  const gridW = cols * tw + (cols - 1) * gap;
  const gridH = rows * th + (rows - 1) * gap;
  const dim = interpolate(frame, [DIM, DIM + 12], [0, 1], { ...clamp, easing: easeOut });
  const push = interpolate(frame, [0, durationInFrames], [1.0, 1.05]);
  // the band of paper: opens from a line, then at the end widens to fill the frame
  const open = interpolate(frame, [BAND, BAND + 9], [0, 1], { ...clamp, easing: easeOut });
  const fill = interpolate(frame, [durationInFrames - 14, durationInFrames - 2], [0, 1], { ...clamp, easing: (x) => x * x });
  const bandH = (sq ? 300 : 230) * open + (height - (sq ? 300 : 230)) * fill;
  return (
    <Fill style={{ background: "#1A130D" }}>
      <div style={{ position: "absolute", left: (width - gridW) / 2, top: (height - gridH) / 2, width: gridW, height: gridH, transform: `scale(${push})`, filter: `brightness(${1 - dim * 0.6}) saturate(${1 - dim * 0.4}) blur(${dim * 2.5}px)` }}>
        {TILES.map((t, i) => (
          <div key={i} style={{ position: "absolute", left: (i % cols) * (tw + gap), top: Math.floor(i / cols) * (th + gap) }}>
            <TileView t={t} i={i} w={tw} h={th} />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: (height - bandH) / 2, height: bandH, background: C.bg, boxShadow: open > 0 ? "0 30px 80px rgba(0,0,0,0.45)" : undefined, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {open > 0.5 && <Caption text={sq ? (c.hook.includes("，") ? c.hook.replace("，", "，\n") : c.hook.replace(" asking", "\nasking")) : c.hook} at={BAND + 4} size={sq ? 76 : 92} align="center" />}
      </div>
    </Fill>
  );
};
