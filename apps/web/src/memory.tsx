// D257: Settings › 记忆 / Memory and › 和你的其他 agent 通信 / Talk with your other agents (D332), each its own page;
// D295: both on the settings grid (D289). Memory shows the value first: the partner remembers you
// (what's new this week, the switch), what it noted this week and earlier (each forgettable, asking
// in place), what your other AI tools saved to Mem, then Nowledge Mem in human words (where it's
// kept, its name there, the raw ids behind 详情). Before Mem: a small empty state and the setup as
// steps. 和你的其他 agent 通信 / Talk with your other agents (D332) is the partner's link with the person's own agents,
// shown by who (peersShown). The Mac's: memory_pane.go, peers_pane.go.
// D321: Memory is "what it knows about you": Mem's own kinds as living groups (how you like things,
// what you decided, what it knows), each row fixable or forgettable in place with its source as a
// quiet line, a search, the week's check one tap away; other tools' working notes only as a count.
// D470: 和你的其他 agent 通信 says who reaches whom as a picture per agent with each broken way's fix, the
// exchanges as a thread per agent with what came of each, who may ask what, and the one switch first.
import type { BridgeView, MemCheckAnswer, MemCheckItem, MemItem, PeersSettings } from "@ducter/protocol";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandTile, toolBrand } from "./brand.tsx";
import { Coin } from "./coin.tsx";
import { copy } from "./conv-copy.ts";
import { Btn, DangerButton, LinkBtn, MenuRow, Switch } from "./controls.tsx";
import { ago, harnessName, keepClauses, spoken } from "./format.ts";
import { aboutGroups, bySource, exchangeThreads, groupNoted, MEM_MIN, memHealthLook, memPhase, memTrouble, memUpdate, ownsAgents, peersNamesUpdate, peersPhase, peersShown, peersSwitchOn, awayFor, reachRows, reachSplit, recentHandoffs, SENDER_DAILY, standing, trustOf, TRUSTED_DAILY, type Exchange as PeerExchange, type ReachRow, type MemPhase, type MemUpdate, type Thread } from "./mem-view.ts";
import { CopyLine } from "./lend.tsx";
import { GBlock, GConfirm, GFoot, GHead, GRow, Group, Said, say, Tile } from "./set-grid.tsx";
import { MemPluginRows } from "./mem-plugin.tsx";
import { keepWhy } from "./mem-keep.tsx";
import { openKeep } from "./keep.tsx";
import { Avatar, Check } from "./views.tsx";
import { title } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
export const MEM_SITE = "https://mem.nowledge.co";

const homeOf = (b: BridgeView | undefined) => b?.home || A.homeName || "";


/**
 * The partner's own notebook, the blue one it always carries (its clay art), drawn in the same
 * clay: the cover on a darker ledge, the pages' edge, the strap and its clasp, a highlight along
 * the top. Memory's mark in Settings (D257): literal, not a new metaphor. Colours: --notebook-*.
 */
export function Notebook({ size }: { size: number }) {
  return (
    <svg class="notebook" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect x="8.5" y="7.5" width="23" height="28" rx="5.5" fill="var(--notebook-ledge)" />
      <rect x="8.5" y="5" width="23" height="28" rx="5.5" fill="var(--notebook-cover)" />
      <rect x="27" y="7.5" width="3.2" height="23" rx="1.6" fill="var(--notebook-pages)" />
      <path d="M12 8.6c3.2-.9 8.2-1 12.4-.5" fill="none" stroke="var(--notebook-shine)" stroke-width="1.7" stroke-linecap="round" />
      <rect x="21.5" y="16.2" width="11" height="6.2" rx="3.1" fill="var(--notebook-strap)" />
      <circle cx="24.6" cy="19.3" r="1.75" fill="var(--notebook-clasp)" />
    </svg>
  );
}

/** D229: the detail behind a quiet disclosure: the main line stays in plain words. */
export function MemMore({ label, text }: { label: string; text: string | string[] }) {
  return (
    <details class="mem-more">
      <summary>{label}</summary>
      {typeof text === "string" ? <small>{text}</small> : text.map((x, i) => <small key={i} class="line">{x}</small>)}
    </details>
  );
}

/** D229: a failed install or update: one plain sentence, whether the old copy still works, the installer's words behind 细节. */
function MemFailed({ detail, kept, install }: { detail: string; kept?: boolean; install: boolean }) {
  return (
    <>
      <small class="mem-why">
        {install ? t("bridge.mem.install.failed") : t("bridge.mem.update.failed")}
        {kept ? ` ${t("bridge.mem.kept")}` : ""}
      </small>
      <MemMore label={t("bridge.mem.more")} text={detail} />
    </>
  );
}

// ---------- 记忆 / Memory (D295: on the settings grid) ----------

/** What it noted in the last 7 days. */
const weekCount = (noted: { at: string }[]) => groupNoted(noted).filter((g) => g.when !== "earlier").reduce((n, g) => n + g.items.length, 0);

/** 1284 → "1,284". */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const NotebookTile = () => (
  <Tile>
    <Notebook size={40} />
  </Tile>
);

/** A noted line's mark: a small accent clay pebble on its ledge. */
const PebbleTile = () => (
  <Tile>
    <span class="mem-dot" />
  </Tile>
);

/** Nowledge Mem's own mark, its app icon (D314; it replaced the letter N); faded while it isn't set up. */
const MemTile = ({ faded }: { faded?: boolean }) => <BrandTile name="nowledge_mem" faded={faded} />;

// D314: Claude (the app) is Anthropic's starburst and ChatGPT OpenAI's knot, the same marks as the coins.
const TOOL_COINS: Record<string, string> = { "Claude Code": "claude-code", Claude: "claude-code", Codex: "codex", ChatGPT: "codex", pi: "pi", Antigravity: "antigravity" }; // D555: Antigravity has its own row

/** Another AI tool's mark: its clay coin when Ducter has one, else its own mark on a white clay tile (D314), else its first letter on a sunken pebble. */
const ToolTile = ({ from }: { from: string }) => {
  const h = TOOL_COINS[from];
  const b = toolBrand(from);
  if (!h && b) return <BrandTile name={b} />;
  return <Tile>{h ? <Coin harness={h} size={36} /> : <span class="mem-tool-letter">{[...from][0]?.toUpperCase()}</span>}</Tile>;
};

/**
 * An agent that left no name and no tool (D332): a drawn agent, a rounded head with two eyes and a short
 * antenna, on the same sunken pebble as a letter, so it never reads as a minus or a remove button.
 */
export const AgentMark = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 2.6v2.6" />
    <circle cx="10" cy="2.3" r="0.9" fill="currentColor" stroke="none" />
    <rect x="3.6" y="5.6" width="12.8" height="10.4" rx="4" />
    <circle cx="7.6" cy="10.6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12.4" cy="10.6" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

/** Another agent's tile in 最近 and 不再听的: its tool's coin or mark by its name or the tool it runs in, else the drawn agent. */
const PeerTile = ({ agent, host }: { agent: string; host?: string }) =>
  agent || host ? (
    <ToolTile from={agent ? peerTool(agent) : host!} />
  ) : (
    <Tile>
      <span class="mem-tool-letter mem-agent">
        <AgentMark />
      </span>
    </Tile>
  );

/** The first group: the partner remembers you, what's new this week, the switch; the week's check (D304) one tap away. */
function MemHead() {
  const s = A.settings!;
  const n = weekCount(A.mem?.noted ?? []);
  const on = s.memory;
  // D348: held off by how the home was started (DUCTER_MEMORY=off): the switch shows, still, and says why.
  const pinned = !on && !!s.memoryPinned;
  return (
    <Group class="mem-g" label={t("settings.tab.memory")}>
      <GHead tile={<NotebookTile />} name={on ? t("mem.hero.on", A.speakerFor().name) : t("mem.hero.off", A.speakerFor().name)} line={!on ? t("mem.off.line") : n ? t("mem.week.count", String(n)) : t("mem.week.none")} tone={on && n ? "done" : undefined}>
        <Switch label={t("partner.memory.switch")} on={on} disabled={pinned} onChange={(memory) => A.setSettings({ memory })} />
      </GHead>
      <GFoot note={on ? t("mem.switch.note") : pinned ? t("mem.pinned") : t("partner.memory.off")}>{on && n > 0 && <Btn kind="text" size="sm" chev label={t("mem.head.check")} onClick={() => A.openLearned()} />}</GFoot>
    </Group>
  );
}

type Noted = NonNullable<typeof A.mem>["noted"][number];

/** A memory's row, tapped open in place: where it came from and when, 改 (its words, written to Mem), 忘掉 (asks). */
function MemRow({ m, open, onOpen }: { m: MemItem; open: boolean; onOpen: (id: string) => void }) {
  const [mode, setMode] = useState<"" | "fix" | "ask">("");
  const [words, setWords] = useState(m.title);
  const src = bySource(m);
  // D459: a row speaks only when it differs (D399): what the person told it is said once in the
  // section's note; only another tool's row carries a mark (its coin), never a dot on every row.
  const tile = m.by === "tool" && m.from ? <ToolTile from={m.from} /> : <span class="g-tile" aria-hidden="true" />;
  if (open && mode === "ask")
    return <GConfirm ask={t("mem.item.forget.ask", m.title)} keep={t("mem.forget.keep")} go={t("partner.memory.forget")} about={m.title} onKeep={() => setMode("")} onGo={() => (setMode(""), onOpen(""), A.memForget(m.id), say("mem-about", t("said.mem.forget", m.title)))} />;
  if (open && mode === "fix") {
    const save = () => words.trim() && (A.memFix(m.id, words), say("mem-about", t("said.mem.fix", words.trim().replace(/\s+/g, " "))), setMode(""), onOpen(""));
    return (
      <GBlock>
        <input class="mem-fix" dir="auto" value={words} aria-label={t("learned.fix")} onInput={(e) => setWords((e.target as HTMLInputElement).value)} onKeyDown={(e) => (e.key === "Enter" ? save() : e.key === "Escape" && (setWords(m.title), setMode("")))} ref={(el) => el?.focus()} />
        <span class="g-acts">
          <Btn kind="text" size="sm" label={t("learned.cancel")} onClick={() => (setWords(m.title), setMode(""))} />
          <Btn kind="secondary" size="sm" label={t("learned.save")} disabled={!words.trim()} onClick={save} />
        </span>
      </GBlock>
    );
  }
  return (
    <>
      <button type="button" class={`chat-row tiled mem-item${open ? " open" : ""}`} aria-expanded={open} onClick={() => onOpen(open ? "" : m.id)}>
        {tile}
        <span class="grow">
          <b dir="auto">{m.title}</b>
          {m.by !== "said" && <small>{t(src.key, ...src.args)}</small>}
        </span>
        {m.at && <span class="g-state">{ago(A.L, m.at)}</span>}
      </button>
      {open && (
        <div class="chat-foot mem-item-acts">
          <small class="grow">{t("mem.item.wrong")}</small>
          <span class="g-acts">
            <Btn kind="text" size="sm" label={t("learned.fix")} about={m.title} onClick={() => setMode("fix")} />
            <DangerButton quiet label={t("partner.memory.forget")} about={m.title} onClick={() => setMode("ask")} />
          </span>
        </div>
      )}
    </>
  );
}

/** Search what it remembers: the words go to Mem a moment after the last key. */
function MemFind() {
  const [q, setQ] = useState(A.memQuery);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const ask = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => A.memFind(v), 350);
  };
  return (
    <label class="mem-find">
      <span class="sr-only">{t("mem.find.label")}</span>
      <SearchMark />
      <input type="search" dir="auto" enterKeyHint="search" autoComplete="off" spellcheck={false} placeholder={t("mem.find.placeholder")} aria-label={t("mem.find.label")} value={q} onInput={(e) => ask((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && (clearTimeout(timer.current), A.memFind(q))} />
      {q && <Btn kind="text" size="sm" label={t("mem.find.clear")} onClick={() => (setQ(""), clearTimeout(timer.current), A.memFind(""))} />}
    </label>
  );
}

/** A drawn magnifier (never a font's glyph). */
const SearchMark = () => (
  <svg class="mem-find-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="7" cy="7" r="4.6" />
    <path d="m10.6 10.6 3.2 3.2" />
  </svg>
);

/**
 * D321: what it knows about the person, by Mem's own kinds, each row correctable in place; a search
 * above them. Before Mem's glance arrives, the lines it noted in the conversation stand in.
 */
function MemAbout() {
  const [open, setOpen] = useState("");
  const name = A.settings!.name;
  const g = A.mem?.glance;
  const found = A.memQuery ? A.memFound : undefined;
  const noted = A.mem?.noted ?? [];
  const asItems = (ns: Noted[]): MemItem[] => ns.filter((n) => n.memoryId).map((n) => ({ id: n.memoryId!, title: n.title, kind: "other", by: "said", at: n.at }));
  const items = g ? g.about : asItems(noted);
  const groups = aboutGroups(items);
  return (
    <section class="set mem-sec">
      <h3>{t("mem.about.title")}</h3>
      <p class="g-note">{t("mem.about.note", name)}</p>
      {/* D444: what it knows, said back in its own words: the question goes to the conversation. */}
      {groups.length > 0 && !A.memQuery && (
        <div class="mem-ask">
          <Btn kind="text" size="sm" chev label={t("mem.about.ask", name)} onClick={() => A.askAboutMe(t("mem.about.ask.words"))} />
        </div>
      )}
      <MemFind />
      {A.memQuery ? (
        <Group class="mem-g" label={t("mem.find.title")}>
          {!found ? (
            <GRow title={t("mem.find.title")} line="…" />
          ) : !found.ok ? (
            <GRow tile={<PebbleTile />} title={t("mem.find.failed")} />
          ) : !found.items.length ? (
            <GRow tile={<PebbleTile />} title={t("mem.find.none", A.memQuery)} />
          ) : (
            found.items.map((m) => <MemRow key={m.id} m={m} open={open === m.id} onOpen={setOpen} />)
          )}
        </Group>
      ) : !groups.length ? (
        <Group class="mem-g" label={t("mem.about.title")}>
          <GRow tile={<PebbleTile />} title={t("mem.about.empty")} line={t("mem.hero.empty.body")} />
        </Group>
      ) : (
        groups.map((gr) => (
          <Group key={gr.kind} class="mem-g" label={t(`mem.kind.${gr.kind}`)}>
            {!(groups.length === 1 && gr.kind === "other") && <div class="g-cap">{t(`mem.kind.${gr.kind}`)}</div>}
            {gr.items.map((m) => <MemRow key={m.id} m={m} open={open === m.id} onOpen={setOpen} />)}
          </Group>
        ))
      )}
      {/* D459: a forget or a fix is answered once, in the partner's word, under what it changed. */}
      <Said k="mem-about" />
    </section>
  );
}

/** D465: an answer's words. */
const ANSWER_KEY: Record<MemCheckAnswer, string> = { newer: "mem.check.newer", older: "mem.check.older", both: "mem.check.both", use: "mem.check.use", not: "mem.check.not" };

const aboutOf = (it: MemCheckItem) => it.title ?? it.pair?.map((p) => p.title).join(" / ") ?? "";

/**
 * D569: the suggestion, said, then the answers: the suggested one first as the secondary clay, the
 * others quiet text buttons (the group's one primary is Take the suggestions). The partner's reason
 * when it judged; else Mem's own suggestion, named as Mem's.
 */
function CheckAnswers({ it }: { it: MemCheckItem }) {
  const about = aboutOf(it);
  return (
    <>
      {it.suggest && (
        <span class="mem-check-advice">
          <b>{t(it.why ? "mem.check.mine" : "mem.check.mems", t(ANSWER_KEY[it.suggest]))}</b>
          {it.why && <small dir="auto">{it.why}</small>}
        </span>
      )}
      <span class="g-acts mem-check-acts">
        {[...it.answers].sort((x, y) => Number(y === it.suggest) - Number(x === it.suggest)).map((a) => (
          <Btn key={a} kind={a === it.suggest ? "secondary" : "text"} size="sm" label={t(ANSWER_KEY[a])} about={about} onClick={() => (A.memSettle(it.id, a), say("mem-check", t(`said.mem.check.${a}`)))} />
        ))}
      </span>
    </>
  );
}

/** D465: two memories Mem found may disagree: both titles, earlier first. */
function CheckContra({ it }: { it: MemCheckItem }) {
  const pair = it.pair ?? [];
  return (
    <GBlock>
      <b class="mem-check-q">{t("mem.check.contra")}</b>
      <ol class="mem-pair">
        {pair.map((p, i) => (
          <li key={i}>
            <small class="mem-pair-when">{t(i ? "mem.check.later" : "mem.check.earlier")}</small>
            <span dir="auto">{p.title}</span>
          </li>
        ))}
      </ol>
      {A.memSettleFailed === it.id && <small class="mem-why">{t("mem.check.failed")}</small>}
      <CheckAnswers it={it} />
    </GBlock>
  );
}

/** D465: a rule Mem learned from how the person works, still a draft: its words, use it or not. */
function CheckRule({ it }: { it: MemCheckItem }) {
  return (
    <GBlock>
      <small class="mem-check-cap">{t("mem.check.rule")}</small>
      <b class="mem-check-q" dir="auto">{it.title}</b>
      {it.body && <small class="mem-check-body" dir="auto">{it.body}</small>}
      {A.memSettleFailed === it.id && <small class="mem-why">{t("mem.check.failed")}</small>}
      <CheckAnswers it={it} />
    </GBlock>
  );
}

/** D569: every ask with a suggestion, answered as suggested, one Mem answer each; said once. */
export function takeSuggestions(asks: MemCheckItem[]) {
  const todo = asks.filter((it) => it.suggest && it.answers.includes(it.suggest));
  for (const it of todo) A.memSettle(it.id, it.suggest!);
  if (todo.length) say("mem-check", todo.length === 1 ? t("said.mem.check.all.one") : t("said.mem.check.all", todo.length));
}

/**
 * D465, D569: what Nowledge Mem couldn't settle by itself (two memories that disagree, a rule it
 * learned) is its own bookkeeping, never a needs-you: one quiet row, 「Nowledge Mem 有 n 处拿不定」
 * with 看看; open, each ask with the partner's suggestion as its default and its reason, every answer
 * still one tap, and Take the suggestions for all of them. The rest stays in Mem, said once, never
 * counted. Nothing waiting: no section at all.
 */
function MemCheckSec() {
  const [open, setOpen] = useState(false);
  const c = A.mem?.check;
  if (!c || (!c.asks.length && !c.more)) return null;
  const n = c.asks.length;
  const suggested = c.asks.filter((it) => it.suggest).length;
  return (
    <section class="set mem-sec mem-check-sec">
      <Group class="mem-g" label={t("mem.check.title")}>
        {n > 0 ? (
          <GRow tile={<PebbleTile />} title={keepClauses(n === 1 ? t("mem.check.unsure.one") : t("mem.check.unsure", n))} line={t("mem.check.line")}>
            <Btn kind="text" size="sm" chev expanded={open} label={t(open ? "mem.check.fold" : "mem.check.look")} about={t("mem.check.title")} onClick={() => setOpen(!open)} />
          </GRow>
        ) : (
          <GRow tile={<PebbleTile />} title={t("mem.check.clear")} />
        )}
        {open && n > 0 && suggested > 0 && (
          <GBlock>
            <span class="g-acts mem-check-all">
              <Btn kind="primary" size="sm" label={t("mem.check.take")} about={t("mem.check.title")} onClick={() => (takeSuggestions(c.asks), setOpen(false))} />
            </span>
          </GBlock>
        )}
        {open && c.asks.map((it) => (it.kind === "rule" ? <CheckRule key={it.id} it={it} /> : <CheckContra key={it.id} it={it} />))}
        {(open || n === 0) && c.more && (
          <GFoot note={t("mem.check.more")}>
            <LinkBtn kind="text" size="sm" href={MEM_SITE} label={t("mem.all.open")} />
          </GFoot>
        )}
      </Group>
      <Said k="mem-check" />
    </section>
  );
}

/** D465: the rules on in Nowledge Mem, read by every connected AI tool at a new conversation; each one tap to turn off. */
function MemRules() {
  const [asking, setAsking] = useState("");
  const rules = A.mem?.check?.rules ?? [];
  if (!rules.length) return null;
  const name = A.settings!.name;
  return (
    <section class="set mem-sec">
      <h3>{t("mem.rules.title")}</h3>
      <Group class="mem-g" label={t("mem.rules.title")}>
        {rules.map((r) =>
          asking === r.id ? (
            <GConfirm key={r.id} ask={t("mem.rules.off.ask", r.title)} keep={t("mem.forget.keep")} go={t("mem.rules.off")} about={r.title} onKeep={() => setAsking("")} onGo={() => (setAsking(""), A.memSettle(r.id, "not"), say("mem-rules", t("said.mem.rules.off", r.title)))} />
          ) : (
            <GRow key={r.id} title={r.title} line={r.body}>
              <Btn kind="text" size="sm" label={t("mem.rules.off")} about={r.title} onClick={() => setAsking(r.id)} />
            </GRow>
          ),
        )}
        <GFoot note={t("mem.rules.note", name)} />
      </Group>
      <Said k="mem-rules" />
    </section>
  );
}

/** D321: the person's other AI tools on the same Mem: who, and how many working notes this week; never their titles. */
function MemTools() {
  const tools = A.mem?.glance?.tools ?? [];
  if (!tools.length) return null;
  return (
    <section class="set mem-sec">
      <h3>{t("mem.tools.title")}</h3>
      <Group class="mem-g" label={t("mem.tools.title")}>
        {tools.map((x) => (
          <GRow key={x.from} tile={<ToolTile from={x.from} />} title={x.from} line={t(x.more ? "mem.tools.more" : "mem.tools.count", String(x.count))} />
        ))}
        <GFoot note={t("mem.tools.note", A.settings!.name)} />
      </Group>
    </section>
  );
}

/** Where the memories are kept, in the person's words. */
function memWhere(b: BridgeView | undefined): string {
  const home = homeOf(b);
  if (b?.where === "cloud") return t("mem.app.kept.cloud");
  if (b?.where === "local" || b?.state === "local_mem") return t("mem.app.kept.local", home);
  if (b?.where === "server") return t("mem.app.kept.server");
  return home ? t("mem.app.where", home) : "";
}

/** The literal facts for support, behind 详情. */
function MemFacts({ b }: { b: BridgeView }) {
  const rows: [string, string | undefined][] = [
    ["mem.details.home", homeOf(b)],
    ["mem.details.version", b.version],
    ["mem.details.identity", b.identity],
    ["mem.details.space", b.space?.label],
    ["mem.details.spaceid", b.space?.id],
  ];
  return (
    <dl class="mem-facts">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd class="mono">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

/** A drawn arrow up: a newer Mem (never a font's arrow). */
const UpMark = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 13V3.5M4 7.5 8 3.5l4 4" />
  </svg>
);

/** The one thing about Mem's own version worth saying, as a row. */
function MemUpdateRow({ u, b }: { u: MemUpdate; b: BridgeView }) {
  const home = homeOf(b);
  const retry = (def: string) => ("detail" in u && u.detail ? t("bridge.retry") : def);
  let title = "";
  let line = "";
  let go: preact.ComponentChildren = null;
  if (u.kind === "updating") title = u.move ? t("bridge.mem.moving", home) : t("bridge.mem.updating", home);
  else if (u.kind === "done") title = t(`bridge.mem.done.${u.done}`, home);
  else if (u.kind === "needed") {
    title = t("mem.update.needed");
    line = u.canRun ? t(u.move ? "bridge.mem.update.move" : "bridge.mem.update", home, u.version ?? "", MEM_MIN) : u.app ? t("bridge.update", home) : t("bridge.mem.update.other", home, u.version ?? "", MEM_MIN);
    if (u.canRun) go = <Btn kind="primary" size="sm" label={retry(t("bridge.mem.update.go"))} about={home} onClick={() => A.installBridgeMem()} />;
  } else if (u.kind === "move") {
    title = t("bridge.mem.upkeep.move", home);
    line = t("bridge.mem.upkeep.move.how");
    go = <Btn kind="secondary" size="sm" label={retry(t("bridge.mem.upkeep.move.go"))} about={home} onClick={() => A.installBridgeMem()} />;
  } else {
    title = u.newer ? t("mem.update.newer", u.newer) : t("mem.update.newer.any");
    line = u.kind === "app" ? t("mem.update.app.body", home) : u.version ? t("mem.update.newer.body", home, u.version) : t("mem.update.newer.body.any");
    if (u.kind === "newer") go = <Btn kind="primary" size="sm" label={retry(t("bridge.mem.update.go"))} about={home} onClick={() => A.installBridgeMem()} />;
  }
  return (
    <>
      <GRow tile={<Tile>{u.kind === "done" ? <span class="mem-glyph done"><Check /></span> : <span class="mem-glyph"><UpMark /></span>}</Tile>} title={title} line={line}>
        {go}
      </GRow>
      {"detail" in u && u.detail && (
        <GBlock>
          <MemFailed detail={u.detail} kept={"kept" in u ? u.kept : undefined} install={false} />
        </GBlock>
      )}
    </>
  );
}

/** The agents as words: "Claude Code 和 Codex" / "Claude Code and Codex". */
const agentWords = (ids: string[]) => {
  const names = ids.map(harnessName);
  return names.length <= 1 ? (names[0] ?? "") : t("wmem.and", names.slice(0, -1).join(t("wmem.comma")), names.at(-1)!);
};

/**
 * D375: Nowledge Mem's head, with what Mem's own doctor on the home says: one calm line when all is
 * well, else the one thing wrong in the failed ink and its one action (Update, Check again, Sign in
 * again with the link field in place, Connect by Mem's own command). Read in the background: until
 * the first answer it says "Connected" as before, and never holds the page.
 */
function MemHealthHead({ b }: { b: BridgeView | undefined }) {
  const [signing, setSigning] = useState(false);
  const [link, setLink] = useState("");
  const homeDv = A.devices?.find((d) => d.home);
  const h = memHealthLook(A.mem?.health, b, homeDv?.harnesses ?? []);
  const home = homeOf(b);
  let line = t("mem.app.on");
  let tone: "done" | "bad" | undefined = "done";
  let act: ComponentChildren = null;
  if (h.look === "ok") line = t("mem.health.ok");
  else if (h.look === "old") {
    (line = t("mem.health.old")), (tone = "bad");
    if (h.canUpdate) act = <Btn kind="secondary" size="sm" label={t("mem.health.old.go")} about="Nowledge Mem" onClick={() => A.installBridgeMem()} />;
  } else if (h.look === "unreachable") {
    (line = t("mem.health.unreachable", home)), (tone = "bad");
    act = <Btn kind="secondary" size="sm" label={t("mem.health.again")} about="Nowledge Mem" onClick={() => A.checkMemHealth()} />;
  } else if (h.look === "signed_out") {
    (line = t("mem.health.signed_out")), (tone = "bad");
    if (!signing) act = <Btn kind="primary" size="sm" label={t("mem.health.signin")} about="Nowledge Mem" onClick={() => setSigning(true)} />;
  }
  // D554: an agent without Mem's plugin is an offer under the head, never Mem itself in the failed ink.
  const p = h.look === "ok" ? h.plugin : undefined;
  const who = p ? agentWords(p.agents) : "";
  const why = b?.signIn === "used" ? t("bridge.mem.signin.used") : b?.signIn === "bad" ? t("bridge.mem.signin.bad") : b?.signIn === "failed" ? t("bridge.mem.signin.failed", b.detail ?? "") : "";
  const go = () => {
    if (!link.trim()) return;
    A.signInBridgeMem(link.trim());
    setLink("");
  };
  return (
    <>
      <GHead tile={<MemTile faded={tone === "bad"} />} name="Nowledge Mem" line={line} tone={tone}>
        {act}
      </GHead>
      {p && (
        <GRow title={t("mem.health.plugin", who)} line={p.busy ? t("mem.health.plugin.busy", who) : keepClauses(t(p.agents.length === 1 ? "mem.health.plugin.why.one" : "mem.health.plugin.why"))}>
          {p.busy ? <Btn kind="secondary" size="sm" busy label={t("mem.health.plugin.going")} about={spoken(A.L, who, "Nowledge Mem")} onClick={() => {}} /> : homeDv && <Btn kind="secondary" size="sm" label={t("mem.health.plugin.go")} about={spoken(A.L, who, "Nowledge Mem")} onClick={() => p.agents.forEach((a) => A.installMem(homeDv.id, a))} />}
        </GRow>
      )}
      {h.look === "signed_out" && signing && (
        <GBlock>
          <small class="mem-health-why">{t("mem.health.resign.how")}</small>
          {why && <small class="mem-why">{why}</small>}
          <label class="acct-field">
            <span class="small">{t("bridge.mem.signin.link")}</span>
            <textarea class="wmem-paste" rows={3} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellcheck={false} enterkeyhint="go" placeholder={t("bridge.mem.signin.ph")} value={link} onInput={(e) => setLink((e.target as HTMLTextAreaElement).value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) (e.preventDefault(), go()); }} />
          </label>
          <span class="mem-health-acts">
            <Btn kind="primary" size="sm" disabled={!link.trim()} label={t("bridge.mem.signin.go")} about={home} onClick={go} />
            <Btn kind="text" size="sm" label={t("memp.cancel")} about="Nowledge Mem" onClick={() => (setSigning(false), setLink(""))} />
          </span>
        </GBlock>
      )}
    </>
  );
}

/** Nowledge Mem itself: connected, where it's kept, its name there, the one update worth a tap, the raw facts behind 详情. */
function MemLink({ b }: { b: BridgeView | undefined }) {
  const [more, setMore] = useState(false);
  const mem = A.mem;
  const u = memUpdate(b);
  const where = memWhere(b);
  return (
    <Group class="mem-g" label="Nowledge Mem">
      <MemHealthHead b={b} />
      {where && <GRow title={t("mem.app.kept.title")} line={where} />}
      {mem?.keptUnder && <GRow title={t("mem.app.name.title")} line={t("mem.app.name.line", mem.keptUnder)} />}
      <GRow title={mem?.glance?.total ? t("mem.all.count", thousands(mem.glance.total)) : t("mem.all.note")}>
        <LinkBtn kind="text" size="sm" href={MEM_SITE} label={t("mem.all.open")} />
      </GRow>
      <MemFilesRow />
      {/* D459: one story with Agent messaging: the same Mem is how the person's other agents reach it. */}
      {peersPageShown() && (
        <GRow title={t("mem.peers.row", A.settings!.name)}>
          <Btn kind="text" size="sm" chev label={t("mem.peers.go")} onClick={() => A.openSettings("peers")} />
        </GRow>
      )}
      {u && b && <MemUpdateRow u={u} b={b} />}
      {/* D466: an agent's Nowledge Mem with a newer version out, or in more than once: one row each, asked in place. */}
      <MemPluginRows />
      {more && b && (
        <GBlock>
          <MemFacts b={b} />
        </GBlock>
      )}
      <GFoot note={b?.version ? t("mem.app.version", b.version) : ""}>
        <Btn kind="text" size="sm" label={t("mem.details")} about="Nowledge Mem" expanded={more} onClick={() => setMore(!more)} />
      </GFoot>
    </Group>
  );
}

/**
 * D566: 做好的文件也存进 Nowledge Mem / Also keep files I make in Nowledge Mem (off by default): a
 * finished task's reports and documents go to Mem's 「Ducter」 folder by themselves. The last one
 * that didn't go says so here once, in Mem's words, until the next one is kept.
 */
function MemFilesRow() {
  const s = A.settings!;
  const tr = A.mem?.fileTrouble;
  const on = !!s.memFiles;
  return (
    <>
      <GRow cls={tr && on ? "mem-files bad" : "mem-files"} title={t("memfile.row")} line={tr && on ? t("memfile.trouble", tr.name, keepWhy(tr.why)) : t("memfile.row.line")}>
        <Switch label={t("memfile.row")} on={on} onChange={(v) => (A.setSettings({ memFiles: v }), say("memfiles", t(v ? "said.memfiles.on" : "said.memfiles.off")))} />
      </GRow>
      <Said k="memfiles" />
    </>
  );
}

const FACE = { missing: "idle", install: "idle", installing: "working", sign_in: "waiting", signing_in: "working" } as const;

/**
 * Nowledge Mem's two steps on the home, each one tap in place (D225): put it in, then sign in with a
 * one-time link. Memory's first page and 和你的其他 agent 通信's (D332) walk the same steps.
 */
export function MemSteps({ phase, b }: { phase: "install" | "installing" | "sign_in" | "signing_in"; b: BridgeView | undefined }) {
  const [link, setLink] = useState("");
  const [tried, setTried] = useState(false);
  const home = homeOf(b);
  const installed = phase === "sign_in" || phase === "signing_in";
  const busyIn = phase === "installing";
  const busySign = phase === "signing_in";
  const why = b?.signIn === "used" ? t("bridge.mem.signin.used") : b?.signIn === "bad" ? t("bridge.mem.signin.bad") : b?.signIn === "failed" ? t("bridge.mem.signin.failed", b.detail ?? "") : "";
  const go = () => {
    if (!link.trim() || busySign) return;
    A.signInBridgeMem(link.trim());
    setLink("");
  };
  return (
    <ol class="chat-steps">
      <li class="chat-step">
        <span class="chat-mark" aria-hidden="true">1</span>
        <span class="grow">
          <p>{installed ? t("mem.step.done") : t("mem.step.install")}</p>
          {!installed && (
            <>
              <small>{busyIn ? t("bridge.mem.installing", home) : b?.canRun ? t("bridge.mem.install", home) : t(b?.cmd ? "bridge.mem.install.need.run" : "bridge.mem.install.need", home)}</small>
              {b?.detail && !busyIn && <MemFailed detail={b.detail} kept={b.kept} install />}
              {/* D432: the one line to run on the home, to copy, in place of a fold to open. */}
              {!b?.canRun && !busyIn && (b?.cmd ? <CopyLine text={b.cmd} kind="line" /> : <MemMore label={t("bridge.mem.how")} text={t("bridge.mem.install.need.how")} />)}
              {/* D404: a retry that meets the same missing tool says so, instead of the same words coming back. */}
              {tried && !b?.canRun && !busyIn && <small class="mem-tried">{t("mem.retry.same")}</small>}
              {!busyIn && <Btn kind={b?.canRun ? "primary" : "secondary"} size="sm" label={b?.canRun ? t("bridge.mem.install.go") : t("bridge.retry")} about={home} onClick={() => (setTried(!b?.canRun), A.installBridgeMem())} />}
            </>
          )}
        </span>
      </li>
      <li class="chat-step">
        <span class="chat-mark" aria-hidden="true">2</span>
        <span class="grow">
          <p>{t("mem.step.signin")}</p>
          {/* D554: a fresh user learns here, before anything else, that this needs a Nowledge Mem account. */}
          {!busySign && (
            <>
              <small>{t("mem.step.account")}</small>
              <LinkBtn kind="text" size="sm" href={MEM_SITE} label={t("mem.step.account.go")} />
            </>
          )}
          {installed && (
            <>
              {b?.done && <small class="mem-done">{t(`bridge.mem.done.${b.done}`, home)}</small>}
              <small>{t("bridge.mem.signin", home)}</small>
              {why && <small class="mem-why">{why}</small>}
              <label class="acct-field">
                <span class="small">{t("bridge.mem.signin.link")}</span>
                <textarea class="wmem-paste" rows={3} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellcheck={false} enterkeyhint="go" placeholder={t("bridge.mem.signin.ph")} value={link} disabled={busySign} onInput={(e) => setLink((e.target as HTMLTextAreaElement).value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) (e.preventDefault(), go()); }} />
              </label>
              <Btn kind="primary" size="sm" disabled={busySign || !link.trim()} label={busySign ? t("bridge.mem.signin.busy") : t("bridge.mem.signin.go")} about={home} onClick={go} />
            </>
          )}
        </span>
      </li>
    </ol>
  );
}

/** Memory before Mem is there: a small empty state, then the setup as one group of steps. */
function MemFirst({ phase, b }: { phase: Exclude<MemPhase, "on" | "off" | "closed">; b: BridgeView | undefined }) {
  const home = homeOf(b);
  const line = { missing: t("mem.setup.missing"), install: t("mem.setup.install", home), installing: t("mem.setup.installing"), sign_in: t("mem.setup.signin"), signing_in: t("mem.setup.signing") }[phase];
  return (
    <>
      {/* D469: the page's head says it in the partner's voice (say.memory.first); no second hero. */}
      <Group class="mem-g" label="Nowledge Mem">
        <GHead tile={<MemTile faded />} name="Nowledge Mem" line={line} />
        {/* D552: what Nowledge Mem is, before any step, in every phase (a fresh user meets the steps cold). */}
        <GRow title={t("mem.app.learn")} line={t("mem.app.what")}>
          <LinkBtn kind="secondary" size="sm" href={MEM_SITE} label={t("mem.app.open")} />
        </GRow>
        {phase !== "missing" && <MemSteps phase={phase} b={b} />}
        <GFoot note={t("mem.setup.local", home || t("mem.setup.local.here"))} />
      </Group>
    </>
  );
}

/** D329: what the closed app means, and the one way to open it, under the head (never squeezed beside it on a phone). */
function MemClosedWords({ b }: { b: BridgeView }) {
  const home = homeOf(b);
  return (
    <GBlock>
      <small class="mem-closed-line">{b.canOpen ? t("bridge.mem.closed.open", home) : t("bridge.mem.closed.there", home)}</small>
      {b.canOpen && (
        <span class="mem-closed-act">
          <Btn kind="primary" size="sm" label={t("bridge.mem.open")} about={home} onClick={() => A.openBridgeMem()} />
        </span>
      )}
    </GBlock>
  );
}

/**
 * D329: the Nowledge Mem app on the home is closed: one line in place of the Nowledge Mem group, and
 * the way to open it when the home can (a Mac with the app); else where to open it.
 */
export function MemClosed({ b }: { b: BridgeView }) {
  return (
    <Group class="mem-g" label="Nowledge Mem">
      <GHead tile={<MemTile faded />} name={t("bridge.mem.closed")} />
      <MemClosedWords b={b} />
    </Group>
  );
}

export function MemoryPage() {
  const s = A.settings;
  if (!s) return null;
  const b = A.bridge;
  const phase = memPhase(s.memory, A.mem, b);
  if (phase === "off") return <MemHead />;
  if (phase === "closed")
    return (
      <>
        <MemHead />
        {b && <MemClosed b={b} />}
      </>
    );
  if (phase !== "on") return <MemFirst phase={phase} b={b} />;
  // D563: Mem's own trouble is fixed right under the line that says it, never a page below.
  const trouble = memTrouble(A.mem, b, A.devices?.find((d) => d.home)?.harnesses ?? []);
  return (
    <>
      {trouble && <MemLink b={b} />}
      <MemHead />
      <MemAbout />
      <MemCheckSec />
      <MemRules />
      <MemTools />
      {!trouble && <MemLink b={b} />}
    </>
  );
}

// ---------- 和你的其他 agent 通信 / Talk with your other agents (D332; D295: on the settings grid) ----------

/** Two of the person's agents' coins, overlapping: this page's mark; faded, grey as the Mac's (D374). */
const CoinsTile = ({ faded }: { faded?: boolean }) => (
  <Tile faded={faded}>
    <span class="mem-coins">
      <Coin harness="claude-code" size={24} />
      <Coin harness="codex" size={24} />
    </span>
  </Tile>
);

/** D324: the other home(s) that also answer, in the person's words: its name, or another computer. */
export const otherWhere = (b: BridgeView) => {
  const o = b.others ?? [];
  return o.length > 1 ? t("peers.where.many", o.length) : (o[0]?.home ?? t("peers.where.other"));
};

/** A drawn arrow for the picture (never a font's glyph): left to right, or back. */
const Way = ({ back }: { back?: boolean }) => (
  <svg class={`pp-arrow${back ? " back" : ""}`} viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {back ? <path d="M118 7H4m6-5-6 5 6 5" /> : <path d="M2 7h114m-6-5 6 5-6 5" />}
  </svg>
);

/**
 * D332: the page's picture, literal (D321 (6): no metaphor): the person's own agents' coins on one side,
 * the partner on the other, and the two ways between them, each said in words: they hand it work, it
 * asks them for you.
 */
function PeersPicture({ name }: { name: string }) {
  return (
    <figure class="peers-pic" aria-label={`${t("peers.pic.to", name)} ${t("peers.pic.back", name)}`}>
      <span class="pp-end">
        <span class="mem-coins">
          <Coin harness="claude-code" size={44} />
          <Coin harness="codex" size={44} />
        </span>
        <small>{t("peers.pic.them")}</small>
      </span>
      <span class="pp-ways">
        <span class="pp-way">
          <small>{t("peers.pic.to", name)}</small>
          <Way />
        </span>
        <span class="pp-way">
          <Way back />
          <small>{t("peers.pic.back", name)}</small>
        </span>
      </span>
      <span class="pp-end">
        <Avatar size={56} />
        <small>{name}</small>
      </span>
    </figure>
  );
}

/** Two overlapping rounded sheets, drawn: copy. */
const CopyMark = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
    <path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" />
  </svg>
);

/**
 * D332: one example exchange, as a tiny conversation: who you say it to, the sentence in your own
 * bubble (a small copy button on it, 复制这句 → 已复制), a small arrow, and what the partner does.
 */
function Exchange({ to, words, then }: { to: string; words: string; then: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="ex">
      <small class="ex-to">{to}</small>
      <div class="ex-line">
        <span class="ex-say" dir="auto">{words}</span>
        <button type="button" class={`ex-copy${copied ? " done" : ""}`} aria-label={copied ? t("peers.try.copied") : t("peers.try.copy")} title={copied ? t("peers.try.copied") : t("peers.try.copy")} onClick={() => void copy(words).then((ok) => ok && (setCopied(true), setTimeout(() => setCopied(false), 1600)))}>
          {copied ? <Check /> : <CopyMark />}
        </button>
      </div>
      <svg class="ex-arrow" viewBox="0 0 12 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 1v13m-4-4 4 4 4-4" />
      </svg>
      <div class="ex-then">
        <Avatar size={22} />
        <span dir="auto">{then}</span>
      </div>
    </div>
  );
}

/** "an unnamed agent asked …" starts a line capitalised; names stay as they are. */
const capWho = (s: string) => (/^(an unnamed agent|an agent in |your |one of your own )/.test(s) ? s[0]!.toUpperCase() + s.slice(1) : s);
const peerTool = (agent: string) => (/claude/i.test(agent) ? "Claude Code" : /codex/i.test(agent) ? "Codex" : /\bpi\b/i.test(agent) ? "pi" : agent);
/** Who an agent is (D332): its name, else the tool it runs in, else unnamed (mem-view.ts peerCalled). */
// D418: one of the person's own agents named by its own words reads as theirs; one with no name at all, still theirs.
const whoOf = (h: { agent: string; host?: string; mine?: boolean; role?: string; selfNamed?: boolean }) =>
  h.mine && h.selfNamed && h.agent ? (h.role ? t("peer.yours.role", h.agent, h.role) : t("peer.yours", h.agent)) : h.agent || (h.host ? t("peer.in.host", h.host) : h.mine ? t("peer.own.someone") : t("peer.someone"));

/** D470: where an exchange leads: the task it became or came from, else its message in the conversation. */
function openExchange(x: PeerExchange) {
  A.sheet = null;
  const task = x.outcome.kind === "task" ? x.outcome.taskId : x.taskId;
  if (task) return A.go({ name: "task", id: task });
  A.go({ name: "conv" });
  setTimeout(() => A.jumpTo(x.seq), 350);
}

/** D448: the conversation's exchanges and a task's own (which never show there), in order. */
function peerFeed() {
  if (!A.S.taskPeers.length) return A.S.channel;
  const seen = new Set<number>();
  return [...A.S.channel, ...A.S.taskPeers].filter((e) => !seen.has(e.ev.seq) && (seen.add(e.ev.seq), true)).sort((a, b) => a.ev.seq - b.ev.seq);
}

/** A task's title, clipped (D448, D470). */
function taskTitle(taskId: string | undefined): string {
  const task = taskId ? A.S.tasks.get(taskId) : undefined;
  const s = task ? title(task).trim() : "";
  return s.length > 30 ? s.slice(0, 29) + "…" : s;
}

const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** D433, D470: each agent the person runs and how it reaches the partner, from what this window holds. */
export const peersReachRows = (): ReachRow[] => reachRows(A.devices ?? [], A.ownAgents, recentHandoffs(peerFeed(), 50), A.bridge?.mailboxes);

/** D470: the partner's sentence at the head of Agent messaging: who and it reach each other now. */
export function peersSay(): string {
  const s = A.settings;
  if (!s?.peers) return t("say.peers");
  const on = peersSwitchOn(s.peers.reach, A.bridge);
  if (!on) return t("say.peers.off");
  if (peersPhase(A.bridge, on) !== "on") return t("say.peers");
  const split = reachSplit(peersReachRows());
  const { oneWay, notYet } = split;
  // D489: both ways only where Mem said so; an agent whose way back Mem hasn't told is said as what it does.
  const both = split.both.filter((r) => standing(r) === "both");
  const next = split.both.filter((r) => standing(r) === "next");
  const to = split.both.filter((r) => standing(r) === "to");
  const tools = (rs: ReachRow[]) => rs.map((r) => r.tool).join(t("acct.sep"));
  // D489: an agent a step from hearing back (its plugin's update) is said as the step it is, beside the ones that work.
  if (both.length && oneWay.length) return t("say.peers.mixed", tools(both), tools(oneWay));
  if (oneWay.length) return t("say.peers.oneway", tools(oneWay));
  // D560: one whose next session will hear back needs nothing from the person: said once, as what will happen.
  if (both.length && next.length) return t("say.peers.mixed.next", tools(both), tools(next));
  if (next.length) return t("say.peers.next", tools(next));
  if (both.length) return t("say.peers.both", tools(both));
  if (to.length) return t("say.peers.to", tools(to));
  if (notYet.length) return t("say.peers.notyet");
  return t("say.peers");
}

/** D470: the agents that reach the partner, for Overview's 也能找我 / Also in. */
export function peersReaching(): string[] {
  const s = A.settings;
  if (!s?.peers || peersPhase(A.bridge, peersSwitchOn(s.peers.reach, A.bridge)) !== "on") return [];
  const { both, oneWay } = reachSplit(peersReachRows());
  return [...both, ...oneWay].map((r) => r.tool);
}

/**
 * D489: 你的 agent / Your agents, one literal row per agent: its coin, its name, what it can do with the
 * partner said as what the person gets (never a diagram), and when it last came. D560: what the row says is
 * Mem's facts now (agentBack): one whose next session will hear back says so and offers nothing; one whose
 * plugin is older than that carries its one button, the plugin's update (while it runs, the row says so).
 * pi, whose own Mem plugin carries no Bridge (Mem's to add), keeps one quiet row, never drawn as a fault.
 */
function AgentRow({ r }: { r: ReachRow }) {
  const st = standing(r);
  const updating = st === "old" && !!r.busy;
  const line = updating ? t("peers.st.updating") : t(`peers.st.${st}`);
  const last = r.last && st !== "install" && st !== "unknown" ? t("peers.last", ago(A.L, r.last)) : "";
  const hear = st === "old" && r.update && r.device && !updating;
  return (
    <GRow cls={`agent-row${hear ? " act-under" : ""}`} tile={<ToolTile from={r.tool} />} title={r.tool} line={line}>
      {st === "install" && r.device ? (
        <Btn kind="secondary" size="sm" label={t("peers.try.plugin.go")} about={r.deviceName ?? r.device} onClick={() => A.installMem(r.device!, r.harness)} />
      ) : hear ? (
        <Btn kind="secondary" size="sm" label={t("peers.fix.hear")} about={r.tool} onClick={() => A.installMem(r.device!, r.harness)} />
      ) : last ? (
        <small class="g-state">{last}</small>
      ) : null}
    </GRow>
  );
}

/** D489: the agents whose own Mem plugins carry no Bridge, as one quiet row: what Ducter's tasks on them can do. */
function NoBridgeRow({ rows, name }: { rows: ReachRow[]; name: string }) {
  const relay = rows.some((r) => r.can === "relay");
  const k = `peers.st.${relay ? "relay" : "none"}${rows.length > 1 ? "" : ".one"}`;
  return (
    <GRow
      cls="agent-row"
      tile={
        <Tile>
          <span class="mem-coins">
            {rows.map((r) => (
              <Coin key={r.harness} harness={r.harness} size={rows.length > 1 ? 28 : 36} />
            ))}
          </span>
        </Tile>
      }
      title={rows.map((r) => r.tool).join(t("acct.sep"))}
      line={relay ? t(k, name) : t(k)}
    />
  );
}

/**
 * D489: 你的 agent / Your agents: the agents whose Mem plugin carries Bridge, a row each; then the ones
 * whose plugin doesn't, together.
 */
function PeersAgents({ name }: { name: string }) {
  const rows = peersReachRows();
  const bridged = rows.filter((r) => r.can !== "relay" && r.can !== "none");
  const rest = rows.filter((r) => r.can === "relay" || r.can === "none");
  if (!rows.length) return null;
  return (
    <section class="set mem-sec">
      <h3>{t("peers.agents.title")}</h3>
      <Group class="mem-g peers-agents" label={t("peers.agents.title")}>
        {bridged.map((r) => (
          <AgentRow key={r.harness} r={r} />
        ))}
        {rest.length > 0 && <NoBridgeRow rows={rest} name={name} />}
      </Group>
    </section>
  );
}

/**
 * D494: 你的帮手 / Your helpers, while there are any: each one's name (what the person's agents find it by
 * in Nowledge Mem), what it takes in the person's words, where its address stands, the work on hand and
 * this week's, each its own element; 停下 / Stop (its address closes; work on hand keeps going) and
 * 接着收 / Take work again. Its tile is its first letter on the sunken pebble: no metaphor.
 */
export function PeersHelpers() {
  const hs = A.helpers;
  if (!hs.length) return null;
  const state = (h: (typeof hs)[number]) => (h.state === "stopped" ? "stopped" : h.mem);
  return (
    <section class="set mem-sec">
      <h3>{t("peers.helpers.title")}</h3>
      <Group class="mem-g peers-helpers" label={t("peers.helpers.title")}>
        {hs.map((h) => (
          <div key={h.id} class="chat-row tiled helper-row">
            <Tile>
              <span class="mem-tool-letter">{[...h.name][0]?.toUpperCase()}</span>
            </Tile>
            <span class="grow">
              <b>{h.name}</b>
              {h.about && <small class="helper-about">{t("peers.helper.takes", h.about)}</small>}
              <small class={`helper-state ${state(h)}`} title={h.detail}>
                {t(`peers.helper.${state(h)}`)}
              </small>
              {(h.open > 0 || h.week > 0) && (
                <span class="helper-counts">
                  {h.open > 0 && <small>{t("peers.helper.open", h.open)}</small>}
                  {h.week > 0 && <small>{t("peers.helper.week", h.week)}</small>}
                </span>
              )}
            </span>
            {/* D511: a helper is a Keep with an address: its home is the Keep's page; this row only links to it. */}
            {((k) =>
              k ? (
                <Btn kind="text" size="sm" label={t("keep.card.open")} about={h.name} onClick={() => ((A.sheet = null), openKeep(k.id))} />
              ) : (
                <Btn kind="text" size="sm" label={t(h.state === "stopped" ? "peers.helper.resume" : "peers.helper.stop")} about={h.name} onClick={() => A.stopHelper(h.id, h.state === "stopped")} />
              ))((A.S.onHand?.keeps ?? []).find((k) => k.address?.name === h.name))}
          </div>
        ))}
        <GFoot note={t("peers.helpers.foot")} />
      </Group>
    </section>
  );
}

/** D470: what came of an exchange, in the partner's words, and the ink it is said in. */
function exLine(x: PeerExchange): { text: string; tone?: "needs" | "bad" } {
  const o = x.outcome;
  if (x.way === "in") {
    switch (o.kind) {
      case "task":
        return { text: t("peers.ex.in.task", taskTitle(o.taskId) || "…") };
      case "replied":
        return { text: t("peers.ex.in.replied", clip(o.words)), ...(o.state === "failed" || o.state === "unconfirmed" ? { tone: "bad" as const } : {}) };
      case "card":
      case "told":
        return { text: t(`peers.ex.in.${o.kind}`), tone: "needs" };
      default:
        return { text: t(`peers.ex.in.${o.kind}`) };
    }
  }
  const head = x.way === "taskasked" ? "peers.ex.task." : "peers.ex.asked.";
  const tt = taskTitle(x.taskId) || "…";
  const args = x.way === "taskasked" ? [tt] : [];
  if (o.kind === "answered") return { text: t(head + "answered", ...args, clip(o.words)) };
  if (o.kind === "notsent") return { text: t(head + "notsent", ...args), tone: "bad" };
  return { text: t(head + "waiting", ...args) };
}

/** D470: an exchange's right edge: a send that hasn't plainly gone says so, else when. */
function exWhen(x: PeerExchange): { text: string; bad?: boolean } {
  const o = x.outcome;
  const st = o.kind === "replied" ? o.state : o.kind === "notsent" ? o.state : undefined;
  if (st) return { text: t(`peers.out.${st}`), bad: st === "failed" || st === "unconfirmed" };
  return { text: ago(A.L, x.at) };
}

/** D470: one agent's exchanges with the partner, its trust in its head (what it may ask), newest first. */
function PeersThread({ th, p }: { th: Thread; p: PeersSettings }) {
  const trust = trustOf(th, p);
  const line = trust === "trusted" ? t("peers.trust.trusted", TRUSTED_DAILY) : trust === "own" ? t("peers.trust.own") : trust === "team" ? t("peers.trust.team") : t("peers.muted", th.agent);
  const who = capWho(whoOf(th));
  return (
    <Group class="mem-g peer-thread" label={who}>
      <GHead tile={<PeerTile agent={th.agent} host={th.host} />} name={who} line={line}>
        {trust === "trusted" && <Btn kind="text" size="sm" label={t("peers.trust.ask")} about={th.agent} onClick={() => A.setSettings({ peers: { ...p, trusted: p.trusted.filter((x) => x !== th.agent) } })} />}
        {trust === "team" && <Btn kind="text" size="sm" label={t("peers.trust.mute")} about={th.agent} onClick={() => A.setSettings({ peers: { ...p, muted: [...p.muted, th.agent], allowed: (p.allowed ?? []).filter((x) => x !== th.agent) } })} />}
      </GHead>
      {th.items.map((x) => {
        const l = exLine(x);
        const w = exWhen(x);
        return (
          <button type="button" key={x.seq} class="chat-row mem-item ex-item" onClick={() => openExchange(x)}>
            <span class="grow">
              <b dir="auto">{x.words}</b>
              <small class={l.tone ? `tone-${l.tone}` : undefined} dir="auto">
                {l.text}
              </small>
            </span>
            <span class={`g-state${w.bad ? " tone-bad" : ""}`}>{w.text}</span>
          </button>
        );
      })}
    </Group>
  );
}

/**
 * D470: 来往 / Back and forth: a thread per agent, each exchange with what was asked and what came of it.
 * Before the first one, an invitation: the partner says no agent has come yet, and the two examples.
 */
function PeersThreads({ name, threads, p }: { name: string; threads: Thread[]; p: PeersSettings }) {
  return (
    <section class="set mem-sec">
      <h3>{t("peers.ex.title")}</h3>
      {threads.length === 0 ? (
        <Group class="mem-g ex-invite" label={t("peers.ex.title")}>
          <div class="ex-empty">
            <Avatar size={40} state="idle" />
            <p>{t("peers.ex.empty")}</p>
          </div>
          <GBlock>
            <TryPair name={name} />
          </GBlock>
        </Group>
      ) : (
        <div class="peer-threads">
          {threads.map((th) => (
            <PeersThread key={th.key} th={th} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

/** D321, D332: the two example exchanges, one each way, as a tiny conversation in the clay style. */
const TryPair = ({ name }: { name: string }) => (
  <div class="ex-pair">
    <Exchange to={t("peers.try.work.to")} words={t("peers.try.work", name)} then={t("peers.try.work.then", name)} />
    <Exchange to={t("peers.try.here.to", name)} words={t("peers.try.here")} then={t("peers.try.here.then", name)} />
  </div>
);

/** D321, D332: 试试看 / Try it, once something came and went (before that, the invitation holds the examples). */
function PeersTry({ name }: { name: string }) {
  return (
    <section class="set mem-sec">
      <h3>{t("peers.try.title")}</h3>
      <Group class="mem-g" label={t("peers.try.title")}>
        <GBlock>
          <TryPair name={name} />
        </GBlock>
      </Group>
    </section>
  );
}

/**
 * D470: 谁能让我做什么 / Who may ask me what, by the rules in code (bridge.md X1–X3): the person's own
 * agents (work after a Go, or straight ahead for one they trusted, SENDER_DAILY a day), teammates' agents
 * (ignored by default; asked once per sender; questions only), and the ones the person stopped hearing.
 */
function PeersRules({ p }: { p: PeersSettings }) {
  return (
    <section class="set mem-sec">
      <h3>{t("peers.rules.title")}</h3>
      <Group class="mem-g" label={t("peers.rules.title")}>
        <GRow tile={<CoinsTile />} title={t("peers.rules.own.title")} line={t("peers.rules.own.line", SENDER_DAILY)} />
        <GRow
          tile={
            <Tile>
              <span class="mem-tool-letter mem-agent">
                <AgentMark />
              </span>
            </Tile>
          }
          title={t("peers.rules.team.title")}
          line={t("peers.rules.team.line")}
        />
        {p.muted.map((a) => (
          <GRow key={`m-${a}`} tile={<ToolTile from={peerTool(a)} />} title={t("peers.muted", a)}>
            <Btn kind="text" size="sm" label={t("peers.muted.undo")} about={a} onClick={() => A.setSettings({ peers: { ...p, muted: p.muted.filter((x) => x !== a) } })} />
          </GRow>
        ))}
      </Group>
    </section>
  );
}

/**
 * D332: the one problem worth a row, each with its one fix: two homes reading (只留这台), another home
 * answering (改由这台收), Mem's refusal or failure (its step, 再试一次), Mem on this computer offering no
 * place, the Nowledge Mem app closed (D329: 打开 Nowledge Mem when the home can, else where to open it).
 * Undefined when nothing is wrong.
 */
function PeersProblem({ b, name }: { b: BridgeView; name: string }) {
  const toMemory = <Btn kind="secondary" size="sm" label={t("peers.mem.go")} onClick={() => A.openSettings("memory")} />;
  if (b.state === "connected") {
    if (b.pinned || !b.others?.length) return null;
    const where = otherWhere(b);
    const stuck = b.others.some((o) => o.stuck);
    if (A.bridgeHere) return <GConfirm ask={t("peers.twice.ask", where, name)} keep={t("bridge.undo.keep")} go={t("peers.twice.go")} about={b.identity} onKeep={() => ((A.bridgeHere = false), A.changed())} onGo={() => A.onlyHereBridge()} />;
    return (
      <GRow cls="act-under" title={t("peers.twice.title", name, where)} line={stuck ? t("peers.twice.stuck", where) : t("peers.twice.line")}>
        {!stuck && <Btn kind="secondary" size="sm" label={t("peers.twice.go")} about={b.identity} onClick={() => A.onlyHereBridge()} />}
      </GRow>
    );
  }
  if (b.state === "elsewhere") {
    if (A.bridgeHere) return <GConfirm ask={t("peers.elsewhere.ask", otherWhere(b), name)} keep={t("bridge.undo.keep")} go={t("peers.elsewhere.go")} about={b.identity} onKeep={() => ((A.bridgeHere = false), A.changed())} onGo={() => A.onlyHereBridge()} />;
    // D433: the other home Mem hasn't seen for over a day: its messages wait there, said plainly.
    const away = b.others?.length === 1 && awayFor(b.others[0]!.seenAt) ? b.others[0]! : undefined;
    return (
      <GRow cls="act-under" tile={<CoinsTile faded />} title={away ? t("peers.elsewhere.away", name, otherWhere(b)) : t("peers.elsewhere", name, otherWhere(b))} line={away ? t("peers.away", otherWhere(b), ago(A.L, new Date(away.seenAt!).toISOString())) : undefined}>
        <Btn kind="secondary" size="sm" label={t("peers.elsewhere.go")} about={b.identity} onClick={() => A.onlyHereBridge()} />
      </GRow>
    );
  }
  if (b.state === "local_mem") return <GRow tile={<CoinsTile faded />} title={t("bridge.mem.local", homeOf(b))} />;
  // D329: the Nowledge Mem app on the home is closed: the agents can't reach it until it's open.
  if (b.state === "mem_closed")
    return (
      <>
        <GRow tile={<CoinsTile faded />} title={t("bridge.mem.closed")} />
        <MemClosedWords b={b} />
      </>
    );
  if (b.state === "no_space") return <GRow tile={<CoinsTile faded />} title={t("bridge.no_space")} />;
  const note = b.state === "refused" ? t(`bridge.refused.${b.reason ?? "control_denied"}`, b.identity) : b.state === "unconfirmed" ? t("bridge.unconfirmed", b.identity) : failedLine(b.detail);
  const tryNewer = b.newer !== undefined;
  return (
    <GRow cls="act-under" tile={<CoinsTile faded />} title={tryNewer ? `${note}\n${t("peers.mem.newer")}` : note}>
      {tryNewer && toMemory}
      <Btn kind="secondary" size="sm" label={t("bridge.retry")} about={b.identity} onClick={() => A.connectBridge()} />
    </GRow>
  );
}

/** D404: the home's own words for a failed connect (bridge-link.ts), said in the person's language, never raw. */
export const FAILED_DETAILS: Record<string, string> = { "Mem answered with another identity or place": "bridge.failed.identity", "nmem didn't start": "bridge.failed.nostart" };
export const failedLine = (d?: string): string => (d && FAILED_DETAILS[d] ? t(FAILED_DETAILS[d]!) : t("bridge.failed", d ?? ""));

/** Whether 和你的其他 agent 通信 has anything to show yet (D332: by who; J6). */
export const peersPageShown = () => A.peersAsked || peersShown(A.settings?.peers, A.bridge, A.S.channel.some((e) => e.peer), ownsAgents(A.ownAgents, A.devices ?? []));

/**
 * D332, D470: 和你的其他 agent 通信 / Talk with your other agents, in Settings' voice (D469). The head is the
 * partner saying who reaches it (PaneSays; D489: in its plain ink, the row carries the offer). On: the one switch
 * first, any problem with its fix, 你的 agent / Your agents as a literal row per agent (D489; the one-way
 * agent's offer under its row), 来往 / Back and forth as a thread per agent (what was asked, what came of it), who
 * may ask what, then 试试看. Before the first exchange the threads are an invitation with the examples.
 * Before Mem is ready: the picture, one sentence of what Nowledge Mem is, its steps in place; once it is,
 * the home connects by itself (no tap). Off: the picture and the switch. Identity, place, labels and ids
 * are never shown.
 */
export function PeersPage() {
  const s = A.settings;
  const p = s?.peers;
  const b = A.bridge;
  const on = peersSwitchOn(p?.reach, b);
  const phase = peersPhase(b, on);
  // Opening the page while Mem is ready is the ask: the home connects (the same call as at start).
  useEffect(() => {
    if (phase === "joining" && b?.state === "ready") A.connectBridge();
  }, [phase, b?.state]);
  if (!s || !p) return null;
  const name = s.name;
  const flip = (v: boolean) => {
    // D340: on a home that waits to be asked the switch already reads on in settings: flipping it is the ask.
    if (v && p.reach !== "off") A.connectBridge();
    else A.setSettings({ peers: { ...p, reach: v ? "own" : "off" } });
    say("peers", t(v ? "said.peers.on" : "said.peers.off", name));
  };
  const mem = b ? memPhase(true, A.mem, b) : "missing";
  const upd = memUpdate(b);
  // D470: the switch is the page's first group (the partner's sentence above says how things stand).
  const head = phase !== "getting" && phase !== "none" && (
    <section class="set mem-sec">
      <Group class="mem-g" label={t("settings.tab.peers")}>
        <GHead tile={<CoinsTile faded={!on} />} name={t("peers.switch", name)} line={on ? undefined : t("peers.switch.off", name)}>
          <Switch label={t("peers.switch", name)} on={on} onChange={flip} />
        </GHead>
        <GFoot note={on ? t("peers.switch.on", name) : t("peers.off.kept")} />
      </Group>
      <Said k="peers" />
    </section>
  );
  const threads = phase === "on" ? exchangeThreads(peerFeed(), A.S.outOps, A.S.decisions.values()) : [];
  return (
    <>
      {phase === "on" ? (
        <>
          {head}
          {b && <PeersProblemGroup b={b} name={name} />}
          {b && <PeersNames b={b} name={name} />}
          {b?.stuck && <PeersStuck code={b.stuck.code} name={name} />}
          {b?.state === "connected" && b.notices && <PeersNotices name={name} />}
          <PeersAgents name={name} />
          <PeersHelpers />
          <PeersThreads name={name} threads={threads} p={p} />
          <PeersRules p={p} />
          {threads.length > 0 && <PeersTry name={name} />}
        </>
      ) : (
        <>
          <PeersPicture name={name} />
          {head}
        </>
      )}
      {phase === "getting" && b && (
        <Group class="mem-g" label="Nowledge Mem">
          <GHead tile={<MemTile faded />} name="Nowledge Mem" line={t("peers.mem.what")} />
          {upd?.kind === "needed" || upd?.kind === "updating" ? <MemUpdateRow u={upd} b={b} /> : (mem === "install" || mem === "installing" || mem === "sign_in" || mem === "signing_in") && <MemSteps phase={mem} b={b} />}
          <GFoot note={t("peers.mem.then")} />
        </Group>
      )}
      {phase === "joining" && (
        <Group class="mem-g" label={t("settings.tab.peers")}>
          <GRow tile={<Avatar size={40} state="working" />} title={t("peers.joining", name)} />
        </Group>
      )}
      {phase === "problem" && b && (
        <Group class="mem-g" label={t("settings.tab.peers")}>
          <PeersProblem b={b} name={name} />
        </Group>
      )}
      {phase === "none" && (
        <Group class="mem-g" label={t("settings.tab.peers")}>
          <GRow title={t("peers.none", name)}>
            <Btn kind="secondary" size="sm" label={t("peers.mem.go")} onClick={() => A.openSettings("memory")} />
          </GRow>
        </Group>
      )}
      {phase !== "on" && p.muted.length > 0 && (
        <section class="set mem-sec">
          <Group class="mem-g" label={t("peers.muted.title")}>
            {p.muted.map((a) => (
              <GRow key={`m-${a}`} tile={<ToolTile from={peerTool(a)} />} title={t("peers.muted", a)}>
                <Btn kind="text" size="sm" label={t("peers.muted.undo")} about={a} onClick={() => A.setSettings({ peers: { ...p, muted: p.muted.filter((x) => x !== a) } })} />
              </GRow>
            ))}
          </Group>
        </section>
      )}
    </>
  );
}

/**
 * D364: an nmem too old to say who wrote (before 0.10.120) while a newer one is out: Mem's update as one
 * quiet row, said by what it gives here. The Nowledge Mem app's own copy is updated in the app.
 */
function PeersNames({ b, name }: { b: BridgeView; name: string }) {
  const u = peersNamesUpdate(b);
  if (!u) return null;
  const home = homeOf(b);
  const failed = u.kind === "newer" ? u.detail : undefined;
  return (
    <Group class="mem-g" label={t("peers.names.title", name)}>
      <GRow tile={<Tile><span class="mem-glyph"><UpMark /></span></Tile>} title={t("peers.names.title", name)} line={u.kind === "app" ? t("mem.update.app.body", home) : t("peers.names.line")}>
        {u.kind === "newer" && <Btn kind="secondary" size="sm" label={failed ? t("bridge.retry") : t("bridge.mem.update.go")} about={home} onClick={() => A.installBridgeMem()} />}
      </GRow>
      {u.kind === "newer" && failed && (
        <GBlock>
          <MemFailed detail={failed} kept={u.kept} install={false} />
        </GBlock>
      )}
    </Group>
  );
}

/**
 * D369: Mem said the partner's mailbox can't be read until Mem sorts it out on its side: one quiet line,
 * Mem's own code beside it, nothing to tap. Gone once a read works again.
 */
function PeersStuck({ code, name }: { code: string; name: string }) {
  return (
    <Group class="mem-g" label={t("peers.stuck.title", name)}>
      <GRow title={t("peers.stuck.title", name)} line={t("peers.stuck.line", name, code)} />
    </Group>
  );
}

/**
 * D400: Nowledge Mem itself also tells the person about mail to the partner's identity: one quiet line
 * that a message may announce itself twice, nothing to tap (Mem's settings are Mem's).
 */
function PeersNotices({ name }: { name: string }) {
  return (
    <Group class="mem-g" label={t("peers.notices.title", name)}>
      <GRow title={t("peers.notices.title", name)} line={t("peers.notices.line", name)} />
    </Group>
  );
}

/** The connected page's problem, if any, as its own group at the top. */
function PeersProblemGroup({ b, name }: { b: BridgeView; name: string }) {
  if (b.state !== "connected" || b.pinned || !b.others?.length) return null;
  return (
    <Group class="mem-g" label={t("settings.tab.peers")}>
      <PeersProblem b={b} name={name} />
    </Group>
  );
}

/** D332: the Partner page's one quiet line for someone Ducter hasn't seen run AI agents of their own. */
export function PeersInvite() {
  if (peersPageShown() || !A.settings) return null;
  const name = A.settings.name;
  return (
    <section class="set">
      <div class="set-invite">
        <small class="grow">{t("peers.invite")}</small>
        <Btn kind="text" size="sm" chev label={t("peers.invite.go")} onClick={() => ((A.peersAsked = true), (A.sheet = { kind: "settings", page: "peers" }), A.changed())} />
      </div>
    </section>
  );
}
