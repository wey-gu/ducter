// D304: the conversation side of Nowledge Mem, said quietly.
//   - RecallLine: one quiet, tappable line under a reply a recalled memory changed: 想起了你 11 月
//     10 日 说的 / Remembered from what you said on Nov 10, or what Claude Code saved. Never a list
//     of what it read; at most one per reply (the home sends at most one).
//   - RecallSheet: that memory (its title, who it is from, the day) with 忘掉 / Forget, which asks
//     first, and 在 Nowledge Mem 里打开 / Open in Nowledge Mem.
//   - LearnedLine: the week's first morning note offers, in one line, to show what it noted.
//   - LearnedSheet: 这周记下的 / What it learned this week: each line confirmed, fixed (written back
//     to Mem through nmem by the home) or forgotten.
// Its own component, apart from the conversation renderer (views.tsx calls RecallLine once per
// partner message). The Mac's: apps/desktop/internal/views/recall.go.
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn, Chev, DangerButton, Facts, LinkBtn } from "./controls.tsx";
import { ago, calDay } from "./format.ts";
import { MEM_SITE, Notebook } from "./memory.tsx";
import { recallLine, weekNoted } from "./mem-view.ts";
import { Check } from "./views.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const COINS: Record<string, string> = { "Claude Code": "claude-code", Codex: "codex", pi: "pi" };

/** Under a partner message: the one quiet source line, when a recall changed it. */
export function RecallLine({ seq }: { seq: number }) {
  const r = A.recalledUnder(seq);
  if (!r) return null;
  const { key, args } = recallLine(r, calDay(A.L, r.date));
  return (
    <button class="recall-line" aria-haspopup="dialog" onClick={() => A.openRecall(r.seq)}>
      <Notebook size={16} />
      <span class="recall-words">{t(key, ...args)}</span>
      <Chev />
    </button>
  );
}

/** Escape closes the sheet wherever the focus is (a button that asked may be gone by then). */
function useEscape(close: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}
const closeSheet = () => ((A.sheet = null), A.changed());

/** What it remembered: the memory, who it is from, the day; Forget (asks) and Open in Nowledge Mem. */
export function RecallSheet({ seq }: { seq: number }) {
  const [asking, setAsking] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => panel.current?.focus({ preventScroll: true }), []);
  useEscape(closeSheet);
  const r = [...A.S.recalled.values()].find((x) => x.seq === seq);
  if (!r) return null;
  const tool = r.by === "tool" && r.from ? r.from : undefined;
  const from = tool ? t("recall.from.tool", tool) : r.by === "said" ? t("recall.from.said") : t("recall.from.you");
  const coin = tool ? COINS[tool] : undefined;
  return (
    <>
      <div class="scrim" onClick={closeSheet} />
      <div ref={panel} tabIndex={-1} class="recall-sheet" role="dialog" aria-modal="true" aria-label={t("recall.title")}>
        <div class="past-head">
          <h2>{t("recall.title")}</h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={closeSheet}>
            ×
          </button>
        </div>
        <div class="recall-body">
          <div class="recall-card">
            <span class="recall-mark">{coin ? <Coin harness={coin} size={40} /> : tool ? <span class="mem-tool-letter">{[...tool][0]?.toUpperCase()}</span> : <Notebook size={40} />}</span>
            <div class="recall-text">
              <p class="recall-t" dir="auto">{r.title}</p>
              <Facts class="recall-facts" items={[from, calDay(A.L, r.date)]} />
            </div>
          </div>
          <p class="recall-why">{t("recall.why")}</p>
          {asking ? (
            <div class="recall-ask" role="alert">
              <p>{tool ? t("recall.forget.tool", r.title, tool) : t("mem.forget.ask", r.title)}</p>
              <div class="recall-acts">
                <Btn kind="text" size="sm" label={t("mem.forget.keep")} onClick={() => setAsking(false)} />
                <DangerButton label={t("partner.memory.forget")} about={r.title} onClick={() => (A.forget(r.seq), closeSheet())} />
              </div>
            </div>
          ) : (
            <div class="recall-acts">
              <DangerButton quiet label={t("partner.memory.forget")} about={r.title} onClick={() => setAsking(true)} />
              <LinkBtn kind="secondary" size="sm" href={MEM_SITE} label={t("recall.open")} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** In the week's first morning note: one line offering to show what it noted. */
export function LearnedLine({ count }: { count: number }) {
  return (
    <div class="learned-line">
      <span class="ftext">{count === 1 ? t("learned.line.one") : t("learned.line", String(count))}</span>
      <Btn kind="text" size="sm" chev class="learned-open" label={t("learned.open")} onClick={() => A.openLearned()} />
    </div>
  );
}

type Noted = NonNullable<typeof A.mem>["noted"][number];

function LearnedRow({ n }: { n: Noted }) {
  const [mode, setMode] = useState<"" | "fix" | "forget">("");
  const [words, setWords] = useState(n.title);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode === "fix") field.current?.focus(), field.current?.select();
  }, [mode]);
  const save = () => {
    if (words.trim() && words.trim() !== n.title) A.correctNoted(n.seq, words);
    setMode("");
  };
  if (mode === "forget")
    return (
      <div class="learned-row asking" role="alert">
        <p class="learned-ask">{n.memoryId ? t("mem.forget.ask", n.title) : t("mem.forget.ask.hide", n.title)}</p>
        <div class="learned-acts">
          <Btn kind="text" size="sm" label={t("mem.forget.keep")} onClick={() => setMode("")} />
          <DangerButton label={t("partner.memory.forget")} about={n.title} onClick={() => A.forget(n.seq)} />
        </div>
      </div>
    );
  if (mode === "fix")
    return (
      <div class="learned-row fixing">
        <span class="mem-dot" />
        <form
          class="learned-fix"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            ref={field}
            value={words}
            maxLength={80}
            aria-label={t("learned.fix")}
            dir="auto"
            onInput={(e) => setWords(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), setWords(n.title), setMode("");
            }}
          />
          <div class="learned-acts">
            <Btn kind="text" size="sm" label={t("learned.cancel")} onClick={() => (setWords(n.title), setMode(""))} />
            <Btn kind="secondary" size="sm" label={t("learned.save")} disabled={!words.trim()} onClick={save} />
          </div>
        </form>
      </div>
    );
  return (
    <div class="learned-row">
      <span class="mem-dot" />
      <div class="learned-text">
        <p class="learned-t" dir="auto">{n.title}</p>
        <Facts
          class="learned-facts"
          items={[
            ago(A.L, n.at),
            n.corrected && t("learned.fixed"),
            n.confirmed && (
              <span class="learned-ok">
                <Check />
                {t("learned.checked")}
              </span>
            ),
          ]}
        />
      </div>
      <div class="learned-acts">
        {!n.confirmed && <Btn kind="secondary" size="sm" label={t("learned.right")} about={n.title} onClick={() => A.confirmNoted(n.seq)} />}
        <Btn kind="text" size="sm" label={t("learned.fix")} about={n.title} onClick={() => setMode("fix")} />
        <DangerButton quiet label={t("partner.memory.forget")} about={n.title} onClick={() => setMode("forget")} />
      </div>
    </div>
  );
}

/** 这周记下的 / What it learned this week: a centred panel when wide, the whole screen on a phone. */
export function LearnedSheet() {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => panel.current?.focus({ preventScroll: true }), []);
  useEscape(closeSheet);
  const week = weekNoted(A.mem?.noted ?? []);
  return (
    <>
      <div class="scrim" onClick={closeSheet} />
      <div ref={panel} tabIndex={-1} class="learned-sheet" role="dialog" aria-modal="true" aria-label={t("learned.title")}>
        <div class="past-head">
          <h2>{t("learned.title")}</h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={closeSheet}>
            ×
          </button>
        </div>
        <p class="learned-lede">{t("learned.lede")}</p>
        <div class="learned-list">
          {A.mem && !week.length && <p class="past-none">{t("learned.none")}</p>}
          {week.map((n) => (
            <LearnedRow key={n.seq} n={n} />
          ))}
        </div>
      </div>
    </>
  );
}
