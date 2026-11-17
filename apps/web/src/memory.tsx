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
import type { BridgeView, MemItem } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandTile, toolBrand } from "./brand.tsx";
import { Coin } from "./coin.tsx";
import { copy } from "./conv-copy.ts";
import { Btn, DangerButton, LinkBtn, Switch } from "./controls.tsx";
import { ago } from "./format.ts";
import { aboutGroups, bySource, groupNoted, MEM_MIN, memPhase, memUpdate, ownsAgents, peersPhase, peersShown, peersSwitchOn, recentHandoffs, tryAgents, type Handoff, type MemPhase, type MemUpdate } from "./mem-view.ts";
import { GBlock, GConfirm, GFoot, GHead, GRow, Group, Said, say, Tile } from "./set-grid.tsx";
import { Avatar, Check } from "./views.tsx";

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

/** The first group: the partner remembers you, what's new this week, the switch; the week's check (D304) one tap away. */
function MemHead() {
  const s = A.settings!;
  const n = weekCount(A.mem?.noted ?? []);
  const on = s.memory;
  return (
    <Group class="mem-g" label={t("settings.tab.memory")}>
      <GHead tile={<NotebookTile />} name={on ? t("mem.hero.on", s.name) : t("mem.hero.off", s.name)} line={!on ? t("mem.off.line") : n ? t("mem.week.count", String(n)) : t("mem.week.none")} tone={on && n ? "done" : undefined}>
        <Switch label={t("partner.memory.switch")} on={on} onChange={(memory) => A.setSettings({ memory })} />
      </GHead>
      <GFoot note={on ? t("mem.switch.note") : t("partner.memory.off")}>{on && n > 0 && <Btn kind="text" size="sm" chev label={t("mem.head.check")} onClick={() => A.openLearned()} />}</GFoot>
    </Group>
  );
}

type Noted = NonNullable<typeof A.mem>["noted"][number];

/** A memory's row, tapped open in place: where it came from and when, 改 (its words, written to Mem), 忘掉 (asks). */
function MemRow({ m, open, onOpen }: { m: MemItem; open: boolean; onOpen: (id: string) => void }) {
  const [mode, setMode] = useState<"" | "fix" | "ask">("");
  const [words, setWords] = useState(m.title);
  const src = bySource(m);
  const tile = m.by === "tool" && m.from ? <ToolTile from={m.from} /> : <PebbleTile />;
  if (open && mode === "ask")
    return <GConfirm ask={t("mem.item.forget.ask", m.title)} keep={t("mem.forget.keep")} go={t("partner.memory.forget")} about={m.title} onKeep={() => setMode("")} onGo={() => (setMode(""), onOpen(""), A.memForget(m.id))} />;
  if (open && mode === "fix") {
    const save = () => words.trim() && (A.memFix(m.id, words), setMode(""), onOpen(""));
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
          <small>{t(src.key, ...src.args)}</small>
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
            <div class="g-cap">{t(`mem.kind.${gr.kind}`)}</div>
            {gr.items.map((m) => <MemRow key={m.id} m={m} open={open === m.id} onOpen={setOpen} />)}
          </Group>
        ))
      )}
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

/** Nowledge Mem itself: connected, where it's kept, its name there, the one update worth a tap, the raw facts behind 详情. */
function MemLink({ b }: { b: BridgeView | undefined }) {
  const [more, setMore] = useState(false);
  const mem = A.mem;
  const u = memUpdate(b);
  const where = memWhere(b);
  return (
    <Group class="mem-g" label="Nowledge Mem">
      <GHead tile={<MemTile />} name="Nowledge Mem" line={t("mem.app.on")} tone="done" />
      {where && <GRow title={t("mem.app.kept.title")} line={where} />}
      {mem?.keptUnder && <GRow title={t("mem.app.name.title")} line={t("mem.app.name.line", mem.keptUnder)} />}
      <GRow title={mem?.glance?.total ? t("mem.all.count", thousands(mem.glance.total)) : t("mem.all.note")}>
        <LinkBtn kind="text" size="sm" href={MEM_SITE} label={t("mem.all.open")} />
      </GRow>
      {u && b && <MemUpdateRow u={u} b={b} />}
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
              <small>{busyIn ? t("bridge.mem.installing", home) : b?.canRun ? t("bridge.mem.install", home) : t("bridge.mem.install.need", home)}</small>
              {b?.detail && !busyIn && <MemFailed detail={b.detail} kept={b.kept} install />}
              {!b?.canRun && !busyIn && <MemMore label={t("bridge.mem.how")} text={t("bridge.mem.install.need.how")} />}
              {!busyIn && <Btn kind={b?.canRun ? "primary" : "secondary"} size="sm" label={b?.canRun ? t("bridge.mem.install.go") : t("bridge.retry")} about={home} onClick={() => A.installBridgeMem()} />}
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
                <input type="url" inputMode="url" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellcheck={false} enterKeyHint="go" placeholder="https://…?nmem_connect=…" value={link} disabled={busySign} onInput={(e) => setLink((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && go()} />
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
      <MemTools />
      <MemLink b={b} />
    </>
  );
}

// ---------- 和你的其他 agent 通信 / Talk with your other agents (D332; D295: on the settings grid) ----------

/** Two of the person's agents' coins, overlapping: this page's mark. */
const CoinsTile = ({ faded }: { faded?: boolean }) => (
  <Tile>
    <span class="mem-coins">
      <Coin harness="claude-code" size={24} off={faded} />
      <Coin harness="codex" size={24} off={faded} />
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

const peerTool = (agent: string) => (/claude/i.test(agent) ? "Claude Code" : /codex/i.test(agent) ? "Codex" : /\bpi\b/i.test(agent) ? "pi" : agent);
const whoOf = (agent: string) => (agent && agent !== "another agent" ? agent : t("peer.someone"));

/** D332: where an exchange leads: its task, else the message in the conversation. */
function openHandoff(h: Handoff) {
  A.sheet = null;
  if (h.taskId) return A.go({ name: "task", id: h.taskId });
  A.go({ name: "conv" });
  setTimeout(() => A.jumpTo(h.seq), 350);
}

/**
 * D332: 最近 / Recently: the latest exchanges both ways, newest first, each opening its task or its
 * message; before the first one, a calm row that waits for it.
 */
function PeersRecent({ name }: { name: string }) {
  const list = recentHandoffs(A.S.channel);
  return (
    <section class="set mem-sec">
      <h3>{t("peers.recent.title")}</h3>
      <Group class="mem-g" label={t("peers.recent.title")}>
        {list.length === 0 && <GRow tile={<Tile><span class="handoff-wait" /></Tile>} title={t("peers.wait.title")} line={t("peers.wait.line")} />}
        {list.map((h) => (
          <button type="button" key={h.seq} class="chat-row tiled mem-item" onClick={() => openHandoff(h)}>
            <ToolTile from={peerTool(h.agent)} />
            <span class="grow">
              <b dir="auto">{h.words}</b>
              <small>{t(`peers.recent.${h.way}`, whoOf(h.agent), name)}</small>
            </span>
            <span class="g-state">{ago(A.L, h.at)}</span>
          </button>
        ))}
      </Group>
    </section>
  );
}

/**
 * D321, D332: 试试看 / Try it: two example exchanges, one each way, as a tiny conversation in the clay
 * style; then each agent missing Mem's plugin, one row with its fix (装上).
 */
function PeersTry({ name }: { name: string }) {
  const missing = tryAgents(A.devices ?? []).filter((x) => x.plugin === "off" && x.device);
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
      {missing.length > 0 && (
        <Group class="mem-g" label={t("peers.try.plugin.title")}>
          {missing.map((x) => (
            <GRow key={x.harness} tile={<Tile><Coin harness={x.harness} size={36} /></Tile>} title={x.harness === "codex" ? "Codex" : "Claude Code"} line={t("peers.try.plugin.off", name)}>
              <Btn kind="secondary" size="sm" label={t("peers.try.plugin.go")} about={x.device} onClick={() => A.installMem(x.device!, x.harness)} />
            </GRow>
          ))}
        </Group>
      )}
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
      <GRow title={t("peers.twice.title", name, where)} line={stuck ? t("peers.twice.stuck", where) : t("peers.twice.line")}>
        {!stuck && <Btn kind="secondary" size="sm" label={t("peers.twice.go")} about={b.identity} onClick={() => A.onlyHereBridge()} />}
      </GRow>
    );
  }
  if (b.state === "elsewhere") {
    if (A.bridgeHere) return <GConfirm ask={t("peers.elsewhere.ask", otherWhere(b), name)} keep={t("bridge.undo.keep")} go={t("peers.elsewhere.go")} about={b.identity} onKeep={() => ((A.bridgeHere = false), A.changed())} onGo={() => A.onlyHereBridge()} />;
    return (
      <GRow tile={<CoinsTile faded />} title={t("peers.elsewhere", name, otherWhere(b))}>
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
  const note = b.state === "refused" ? t(`bridge.refused.${b.reason ?? "control_denied"}`, b.identity) : b.state === "unconfirmed" ? t("bridge.unconfirmed", b.identity) : t("bridge.failed", b.detail ?? "");
  const tryNewer = b.newer !== undefined;
  return (
    <GRow tile={<CoinsTile faded />} title={tryNewer ? `${note}\n${t("peers.mem.newer")}` : note}>
      {tryNewer && toMemory}
      <Btn kind="secondary" size="sm" label={t("bridge.retry")} about={b.identity} onClick={() => A.connectBridge()} />
    </GRow>
  );
}

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
  return (
    <>
      <p class="set-lede">{t("settings.lede.peers", name)}</p>
      {phase === "on" ? (
        <>
          {b && <PeersProblemGroup b={b} name={name} />}
          <PeersRecent name={name} />
          <PeersTry name={name} />
        </>
      ) : (
        <PeersPicture name={name} />
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
      {phase !== "getting" && phase !== "none" && (
        <section class="set mem-sec">
          <Group class="mem-g" label={t("peers.switch", name)}>
            <div class="chat-row">
              <span class="grow">
                <b>{t("peers.switch", name)}</b>
                <small>{on ? t("peers.switch.on") : t("peers.switch.off", name)}</small>
              </span>
              <Switch label={t("peers.switch", name)} on={on} onChange={flip} />
            </div>
          </Group>
          <Said k="peers" />
        </section>
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
