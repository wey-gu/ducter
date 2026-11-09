// 1 · The hook: the way many of us work with agents today. A wall of terminals, each one
// stopping to ask for you, until the frame folds into one calm warm ground.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO } from "../theme";
import { Art, Caption, Fill, clamp, useSquare } from "../ui";

type Tile = { coin: string; title: string; lines: string[]; ask: string; askAt: number };

// Realistic agent output from the same week of work the rest of the video shows (README, HawDB).
const TILES: Tile[] = [
  { coin: "claude_code", title: "claude · hawdb", lines: ["⏺ Read crates/storage/tests/compaction.rs", "⏺ Bash(cargo test -p hawdb-storage compaction)", "  test result: FAILED. 47 passed; 3 failed", "⏺ Update(crates/storage/src/flush.rs)"], ask: "Do you want to make this edit?  1. Yes  2. No", askAt: 30 },
  { coin: "codex", title: "codex · oar-runner", lines: ["• Updating the 3 steer calls in the runner", "• Ran bun test packages/runner", "  └ 2 fail · 118 pass", "• Editing src/steer.ts"], ask: "Allow command?  bun install  (y/n)", askAt: 44 },
  { coin: "pi", title: "pi · release-notes", lines: ["reading CHANGELOG.md", "reading 14 merged PRs since v0.3", "drafting docs/releases/v0.4.md", "waiting on the v0.4 CI run"], ask: "CI is still running. Keep waiting?", askAt: 58 },
  { coin: "deepseek_harness", title: "deepseek · docs", lines: ["> scanning docs/ for stale links", "> 3 links point at removed pages", "> proposing redirects for 2", "> 1 has no obvious target"], ask: "Which page should /docs/focus point to?", askAt: 38 },
  { coin: "claude_code", title: "claude · review PRs", lines: ["⏺ Reviewing #1588 · read 6 files", "⏺ Reviewing #1590 · read 3 files", "⏺ Reviewing #1592 · CI pending", "  Context left until auto-compact: 9%"], ask: "Approve gh pr comment on #1590?", askAt: 52 },
  { coin: "pi", title: "pi · dependency check", lines: ["checking 41 crates for updates", "tokio 1.47 → 1.48 (minor)", "rustls 0.23 → 0.24 (breaking)", "drafting the upgrade plan"], ask: "Upgrade rustls now or wait?", askAt: 48 },
  { coin: "claude_code", title: "claude · site", lines: ["⏺ Read apps/site/src/pages/index.astro", "⏺ Bash(bun run build)", "  built 38 pages in 4.1s", "⏺ Preview ready on :4321"], ask: "Deploy to production?  1. Yes  2. No", askAt: 60 },
  { coin: "deepseek_harness", title: "deepseek · translate", lines: ["> docs/getting-started.md → zh", "> docs/faq.md → zh", "> 2 terms not in the glossary", "> holding 'On hand' for review"], ask: "Use 手头的事 for 'On hand'?", askAt: 34 },
  { coin: "codex", title: "codex · flaky test", lines: ["• Running compaction 50 times", "• 47 passed; 3 failed", "• All 3 compact before the flush", "• Proposed: wait for the flush"], ask: "Apply patch to 2 files?  (y/n)", askAt: 40 },
  { coin: "claude_code", title: "claude · inbox", lines: ["⏺ Read 23 unread threads", "⏺ 2 need a reply this week", "⏺ Drafted 2 replies", "  Context left until auto-compact: 14%"], ask: "Send these 2 replies?  1. Yes  2. No", askAt: 56 },
  { coin: "pi", title: "pi · weekly digest", lines: ["reading 9 open PRs", "reading 4 new issues", "#1601 duplicates #1577", "summary drafted"], ask: "Close #1601 as a duplicate?", askAt: 64 },
  { coin: "codex", title: "codex · fix-ci", lines: ["• fix-ci is 12 commits behind main", "• 2 conflicts, both in .github/ci.yml", "• both look mechanical", "• stopped before rebasing"], ask: "Rebase fix-ci onto main?  (y/n)", askAt: 66 },
];

const TileView = ({ t, i, w, h }: { t: Tile; i: number; w: number; h: number }) => {
  const frame = useCurrentFrame();
  const d = (i * 7) % 12 * 2.5;
  const appear = interpolate(frame, [d, d + 10], [0, 1], clamp);
  const shown = Math.min(t.lines.length, Math.floor(Math.max(0, frame - d) / 7) + 1);
  const asking = frame >= t.askAt;
  const pulse = asking ? 0.55 + 0.45 * Math.sin((frame - t.askAt) / 3.2) : 0;
  const shake = asking && frame - t.askAt < 8 ? Math.sin((frame - t.askAt) * 2.6) * 4 : 0;
  return (
    <div style={{ width: w, height: h, borderRadius: 18, background: C.term, overflow: "hidden", opacity: appear, transform: `translateX(${shake}px) scale(${0.94 + 0.06 * appear})`, boxShadow: asking ? `0 0 0 3px rgba(255,138,61,${0.35 + 0.5 * pulse}), 0 20px 40px -20px rgba(0,0,0,0.6)` : "0 20px 40px -20px rgba(0,0,0,0.6)" }}>
      <div style={{ height: 50, background: C.termBar, display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
        <Art src={`clay/coin_${t.coin}.png`} style={{ width: 30, height: 30 }} />
        <div style={{ fontFamily: MONO, fontSize: 19, color: C.termText, opacity: 0.85 }}>{t.title}</div>
        <div style={{ flex: 1 }} />
        {asking && <div style={{ width: 13, height: 13, borderRadius: 8, background: C.accent, opacity: 0.5 + 0.5 * pulse }} />}
      </div>
      <div style={{ padding: "16px 20px", fontFamily: MONO, fontSize: 18.5, lineHeight: 1.6, color: C.termText }}>
        {t.lines.slice(0, shown).map((l, k) => <div key={k} style={{ opacity: 0.72, whiteSpace: "pre" }}>{l}</div>)}
        {asking && <div style={{ marginTop: 8, color: C.accent, whiteSpace: "pre" }}>{t.ask}<span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>▌</span></div>}
      </div>
    </div>
  );
};

export const Hook = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const sq = useSquare();
  const cols = sq ? 3 : 4;
  const tiles = TILES;
  const gap = 22;
  const tw = sq ? 420 : 500;
  const th = sq ? 300 : 340;
  const rows = Math.ceil(tiles.length / cols);
  const gridW = cols * tw + (cols - 1) * gap;
  const gridH = rows * th + (rows - 1) * gap;
  // slow push in, then everything folds into the centre
  const fold = interpolate(frame, [durationInFrames - 26, durationInFrames - 4], [0, 1], { ...clamp, easing: (x) => x * x * x });
  const push = interpolate(frame, [0, durationInFrames - 26], [1, 1.06], clamp);
  const capY = height * 0.5;
  return (
    <Fill style={{ background: "#1A130D" }}>
      <div style={{ position: "absolute", left: (width - gridW) / 2, top: (height - gridH) / 2, width: gridW, height: gridH, transform: `scale(${push * (1 - fold * 0.92)})`, opacity: 1 - fold, transformOrigin: "50% 50%" }}>
        {tiles.map((t, i) => (
          <div key={i} style={{ position: "absolute", left: (i % cols) * (tw + gap), top: Math.floor(i / cols) * (th + gap) }}>
            <TileView t={t} i={i} w={tw} h={th} />
          </div>
        ))}
      </div>
      {/* a warm scrim behind the line so it reads over the tiles */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 62% 30% at 50% 50%, rgba(26,19,13,0.96) 40%, rgba(26,19,13,0.55) 75%, rgba(26,19,13,0.25))", opacity: interpolate(frame, [70, 84], [0, 1], clamp) * (1 - fold) }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: capY, transform: "translateY(-50%)", display: "flex", justifyContent: "center", opacity: 1 - fold }}>
        <Caption text={sq ? "Your agents keep\nasking for you." : "Your agents keep asking for you."} at={74} size={sq ? 84 : 96} color={C.bg} align="center" />
      </div>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: 999, background: C.bg, transform: `scale(${fold * fold * 120})` }} />
    </Fill>
  );
};
