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
// D332: 和你的其他 agent 通信 shows what came and went lately (both ways), 试试看 with the exact words, and one switch.
import type { BridgeView, MemCheckAnswer, MemCheckItem, MemItem } from "@ducter/protocol";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandTile, toolBrand } from "./brand.tsx";
import { Coin } from "./coin.tsx";
import { copy } from "./conv-copy.ts";
import { Btn, DangerButton, LinkBtn, Switch } from "./controls.tsx";
import { ago, harnessName, spoken } from "./format.ts";
import { aboutGroups, bySource, groupNoted, MEM_MIN, memHealthLook, memPhase, memUpdate, ownsAgents, peersNamesUpdate, peersPhase, peersShown, peersSwitchOn, awayFor, reachRows, recentHandoffs, type Handoff, type ReachRow, type MemPhase, type MemUpdate } from "./mem-view.ts";
import { CopyLine } from "./lend.tsx";
import { GBlock, GConfirm, GFoot, GHead, GRow, Group, Said, say, Tile } from "./set-grid.tsx";
import { MemPluginRows } from "./mem-plugin.tsx";
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
const TOOL_COINS: Record<string, string> = { "Claude Code": "claude-code", Claude: "claude-code", Codex: "codex", ChatGPT: "codex", pi: "pi" };

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
      <GHead tile={<NotebookTile />} name={on ? t("mem.hero.on", s.name) : t("mem.hero.off", s.name)} line={!on ? t("mem.off.line") : n ? t("mem.week.count", String(n)) : t("mem.week.none")} tone={on && n ? "done" : undefined}>
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

/** D465: an answer's words: the one Mem suggests is the primary, the others quiet. */
const ANSWER_KEY: Record<MemCheckAnswer, string> = { newer: "mem.check.newer", older: "mem.check.older", both: "mem.check.both", use: "mem.check.use", not: "mem.check.not" };

function CheckAnswers({ it }: { it: MemCheckItem }) {
  const about = it.title ?? it.pair?.map((p) => p.title).join(" / ") ?? "";
  return (
    <span class="g-acts mem-check-acts">
      {it.answers.map((a) => (
        <Btn key={a} kind={a === it.suggest ? "primary" : "text"} size="sm" label={t(ANSWER_KEY[a])} about={about} onClick={() => (A.memSettle(it.id, a), say("mem-check", t(`said.mem.check.${a}`)))} />
      ))}
    </span>
  );
}

/** D465: two memories Mem found may disagree: both titles, earlier first, Mem's suggestion the default. */
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

/**
 * D465: what Nowledge Mem would like the person to settle (two memories that disagree, a rule it
 * learned), each with Mem's own suggestion as the default; the rest stays in Mem, said once, never
 * counted. Nothing waiting: no section at all.
 */
function MemCheckSec() {
  const c = A.mem?.check;
  if (!c || (!c.asks.length && !c.more)) return null;
  return (
    <section class="set mem-sec mem-check-sec">
      <h3>{t("mem.check.title")}</h3>
      <p class="g-note">{t("mem.check.note")}</p>
      <Group class="mem-g" label={t("mem.check.title")}>
        {c.asks.map((it) => (it.kind === "rule" ? <CheckRule key={it.id} it={it} /> : <CheckContra key={it.id} it={it} />))}
        {!c.asks.length && <GRow tile={<PebbleTile />} title={t("mem.check.clear")} />}
        {c.more && (
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
  } else if (h.look === "plugin") {
    const who = agentWords(h.agents);
    if (h.busy) (line = t("mem.health.plugin.busy", who)), (tone = undefined);
    else {
      (line = t("mem.health.plugin", who)), (tone = "bad");
      if (homeDv) act = <Btn kind="primary" size="sm" label={t("mem.health.plugin.go")} about={spoken(A.L, who, "Nowledge Mem")} onClick={() => h.agents.forEach((a) => A.installMem(homeDv.id, a))} />;
    }
  }
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
      {h.look === "plugin" && !h.busy && <GBlock><small class="mem-health-why">{t("mem.health.plugin.why")}</small></GBlock>}
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
  const name = A.settings!.name;
  const home = homeOf(b);
  const line = { missing: t("mem.setup.missing"), install: t("mem.setup.install", home), installing: t("mem.setup.installing"), sign_in: t("mem.setup.signin"), signing_in: t("mem.setup.signing") }[phase];
  return (
    <>
      <div class="mem-first">
        <Avatar size={84} state={FACE[phase]} />
        <h3>{t("mem.first.title", name)}</h3>
        <p>{t("mem.first.body")}</p>
      </div>
      <Group class="mem-g" label="Nowledge Mem">
        <GHead tile={<MemTile faded />} name="Nowledge Mem" line={line} />
        {phase === "missing" ? (
          <GRow title={t("mem.app.learn")} line={t("mem.app.what")}>
            <LinkBtn kind="secondary" size="sm" href={MEM_SITE} label={t("mem.app.open")} />
          </GRow>
        ) : (
          <MemSteps phase={phase} b={b} />
        )}
        <GFoot note={t("mem.setup.local", name)} />
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
  return (
    <>
      <MemHead />
      <MemAbout />
      <MemCheckSec />
      <MemRules />
      <MemTools />
      <MemLink b={b} />
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
/** 最近's who (D332): its name, else the tool it runs in, else unnamed (mem-view.ts peerCalled). */
// D418: one of the person's own agents named by its own words reads as theirs; one with no name at all, still theirs.
const whoOf = (h: Pick<Handoff, "agent" | "host" | "mine" | "role" | "selfNamed">) =>
  h.mine && h.selfNamed && h.agent ? (h.role ? t("peer.yours.role", h.agent, h.role) : t("peer.yours", h.agent)) : h.agent || (h.host ? t("peer.in.host", h.host) : h.mine ? t("peer.own.someone") : t("peer.someone"));

/** D332: where an exchange leads: its task, else the message in the conversation. */
function openHandoff(h: Handoff) {
  A.sheet = null;
  if (h.taskId) return A.go({ name: "task", id: h.taskId });
  A.go({ name: "conv" });
  setTimeout(() => A.jumpTo(h.seq), 350);
}

/** D448: the conversation's exchanges and a task's own (which never show there), in order. */
function peerFeed() {
  if (!A.S.taskPeers.length) return A.S.channel;
  const seen = new Set<number>();
  return [...A.S.channel, ...A.S.taskPeers].filter((e) => !seen.has(e.ev.seq) && (seen.add(e.ev.seq), true)).sort((a, b) => a.ev.seq - b.ev.seq);
}

/** D448: a task as Recently names it: its title in quotes. */
function taskName(taskId: string | undefined): string {
  const task = taskId ? A.S.tasks.get(taskId) : undefined;
  const s = task ? title(task).trim() : "";
  return s ? t("peers.recent.task", s.length > 30 ? s.slice(0, 29) + "…" : s) : "";
}

/**
 * D332: 最近 / Recently: the latest exchanges both ways, newest first, each opening its task or its
 * message; before the first one, a calm row that waits for it.
 */
function PeersRecent({ name }: { name: string }) {
  const list = recentHandoffs(peerFeed(), 5, A.S.outOps);
  return (
    <section class="set mem-sec">
      <h3>{t("peers.recent.title")}</h3>
      <Group class="mem-g" label={t("peers.recent.title")}>
        {list.length === 0 && <GRow tile={<Tile><span class="handoff-wait" /></Tile>} title={t("peers.wait.title")} line={t("peers.wait.line")} />}
        {list.map((h) => (
          <button type="button" key={h.seq} class="chat-row tiled mem-item" onClick={() => openHandoff(h)}>
            <PeerTile agent={h.agent} host={h.host} />
            <span class="grow">
              <b dir="auto">{h.words}</b>
              <small>{capWho(t(`peers.recent.${h.way}`, whoOf(h), h.way === "tasksent" || h.way === "taskin" ? taskName(h.taskId) || name : name))}</small>
            </span>
            {h.state ? <span class={`g-state${h.state === "failed" || h.state === "unconfirmed" ? " tone-bad" : ""}`}>{t(`peers.out.${h.state}`)}</span> : <span class="g-state">{ago(A.L, h.at)}</span>}
          </button>
        ))}
      </Group>
    </section>
  );
}

/**
 * D433: 能找到{name}的 / Who can reach {name}: each AI tool the person runs, whether it can reach the
 * partner through Nowledge Mem, the one fix when there is one (装上), and when it last came.
 */
/** D444: a row's line, with what Mem's own contact list says of its mailbox when it says. */
export function reachLine(r: ReachRow, name: string): string {
  if (r.can === "none") return t("peers.reach.none");
  // D448: the tasks Ducter runs on it pass messages through Ducter; the person's own sessions of it still can't.
  if (r.can === "relay") return t("peers.reach.relay", name, r.tool);
  if (r.can === "yes" && r.box) return t(`peers.reach.yes.${r.box}`, name);
  return t(`peers.reach.${r.can}`, name);
}

function PeersReach({ name }: { name: string }) {
  const rows = reachRows(A.devices ?? [], A.ownAgents, recentHandoffs(peerFeed(), 50), A.bridge?.mailboxes);
  if (!rows.length) return null;
  return (
    <section class="set mem-sec">
      <h3>{t("peers.reach.title", name)}</h3>
      <Group class="mem-g" label={t("peers.reach.title", name)}>
        {rows.map((r) => (
          <GRow key={r.harness} tile={<Tile faded={r.can === "none"}><Coin harness={r.harness} size={36} /></Tile>} title={r.tool} line={reachLine(r, name)}>
            {r.can === "install" && r.device ? <Btn kind="secondary" size="sm" label={t("peers.try.plugin.go")} about={r.deviceName ?? r.device} onClick={() => A.installMem(r.device!, r.harness)} /> : r.last && r.can === "yes" ? <span class="g-state">{ago(A.L, r.last)}</span> : null}
          </GRow>
        ))}
      </Group>
    </section>
  );
}

/**
 * D321, D332: 试试看 / Try it: two example exchanges, one each way, as a tiny conversation in the clay
 * style (D433: the agents missing Mem's plugin are under 能找到{name}的 now).
 */
function PeersTry({ name }: { name: string }) {
  return (
    <section class="set mem-sec">
      <h3>{t("peers.try.title")}</h3>
      <Group class="mem-g" label={t("peers.try.title")}>
        <GBlock>
          <div class="ex-pair">
            <Exchange to={t("peers.try.work.to")} words={t("peers.try.work", name)} then={t("peers.try.work.then", name)} />
            <Exchange to={t("peers.try.here.to", name)} words={t("peers.try.here")} then={t("peers.try.here.then", name)} />
          </div>
        </GBlock>
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
 * D332: 和你的其他 agent 通信 / Talk with your other agents. On: any problem as one row with its fix, what came and went
 * lately (both ways), what to say, the one switch. Before Mem is ready: the picture, one sentence of
 * what Nowledge Mem is, its steps in place; once it is, the home connects by itself (no tap). Off: the
 * picture and the switch. Identity, place, labels and ids are never shown. Agents the person stopped
 * listening to are the only rules shown, each with 恢复.
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
  // D459: the pane's one switch is its first group's head row, as Memory's is: who it is about, what came
  // and went this week, the switch, and where it all shows up as the group's last line.
  const week = recentHandoffs(peerFeed(), 50).filter((h) => h.at && Date.now() - Date.parse(h.at) < 7 * 864e5).length;
  const head = phase !== "getting" && phase !== "none" && (
    <section class="set mem-sec">
      <Group class="mem-g" label={t("settings.tab.peers")}>
        <GHead tile={<CoinsTile faded={!on} />} name={on ? t("peers.head.on", name) : t("peers.head.off", name)} line={!on ? t("peers.switch.off", name) : week ? t("peers.week.count", String(week)) : t("peers.week.none")} tone={on && week ? "done" : undefined}>
          <Switch label={t("peers.switch", name)} on={on} onChange={flip} />
        </GHead>
        <GFoot note={on ? t("peers.switch.on") : t("peers.off.kept")} />
      </Group>
      <Said k="peers" />
    </section>
  );
  return (
    <>
      {phase === "on" ? (
        <>
          {head}
          {b && <PeersProblemGroup b={b} name={name} />}
          {b && <PeersNames b={b} name={name} />}
          {b?.stuck && <PeersStuck code={b.stuck.code} name={name} />}
          {b?.state === "connected" && b.notices && <PeersNotices name={name} />}
          <PeersReach name={name} />
          <PeersRecent name={name} />
          <PeersTry name={name} />
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
          <GFoot note={t("peers.mem.then", name)} />
        </Group>
      )}
      {phase === "joining" && (
        <Group class="mem-g" label={t("settings.tab.peers")}>
          <GRow tile={<Tile><span class="handoff-wait" /></Tile>} title={t("peers.joining", name)} />
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
      {p.muted.length > 0 && (
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
        <small class="grow">{t("peers.invite", name)}</small>
        <Btn kind="text" size="sm" label={t("peers.invite.go")} onClick={() => ((A.peersAsked = true), (A.sheet = { kind: "settings", page: "peers" }), A.changed())} />
      </div>
    </section>
  );
}
