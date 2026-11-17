// D257: Settings › 记忆 / Memory and › 连上的 AI agent / Connected AI agents, each its own page;
// D295: both on the settings grid (D289). Memory shows the value first: the partner remembers you
// (what's new this week, the switch), what it noted this week and earlier (each forgettable, asking
// in place), what your other AI tools saved to Mem, then Nowledge Mem in human words (where it's
// kept, its name there, the raw ids behind 详情). Before Mem: a small empty state and the setup as
// steps. Connected AI agents is the persona's link with the person's other agents (D205) and who
// may reach it (D170); it shows once Mem is in (peersShown). The Mac's: memory_pane.go, peers_pane.go.
// D321: Memory is "what it knows about you": Mem's own kinds as living groups (how you like things,
// what you decided, what it knows), each row fixable or forgettable in place with its source as a
// quiet line, a search, the week's check one tap away; other tools' working notes only as a count.
// Connected AI agents teaches its first use: 试试看 with the exact words for the terminal (copyable),
// whether each agent has Mem's plugin, and a live row that waits for the first hand-off and says it worked.
import type { BridgeView, MemItem } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { copy } from "./conv-copy.ts";
import { Btn, DangerButton, LinkBtn, Seg, Switch } from "./controls.tsx";
import { ago } from "./format.ts";
import { aboutGroups, bySource, groupNoted, handoffPhase, MEM_MIN, memPhase, memUpdate, peersShown, tryAgents, type MemPhase, type MemUpdate } from "./mem-view.ts";
import { GBlock, GConfirm, GFoot, GHead, GRow, Group, Tile } from "./set-grid.tsx";
import { Avatar, Check, peerName } from "./views.tsx";

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

/** Nowledge Mem's mark: its letter on a clay pebble in the notebook's blue (literal, never its logo). */
const MemTile = ({ faded }: { faded?: boolean }) => (
  <Tile>
    <span class={`mem-letter${faded ? " faded" : ""}`}>N</span>
  </Tile>
);

const TOOL_COINS: Record<string, string> = { "Claude Code": "claude-code", Codex: "codex", pi: "pi" };

/** Another AI tool's mark: its clay coin when Ducter has one, else its first letter on a sunken pebble. */
const ToolTile = ({ from }: { from: string }) => {
  const h = TOOL_COINS[from];
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

/** Memory before Mem is there: a small empty state, then the setup as one group of steps. */
function MemFirst({ phase, b }: { phase: Exclude<MemPhase, "on" | "off">; b: BridgeView | undefined }) {
  const [link, setLink] = useState("");
  const name = A.settings!.name;
  const home = homeOf(b);
  const line = { missing: t("mem.setup.missing"), install: t("mem.setup.install", home), installing: t("mem.setup.installing"), sign_in: t("mem.setup.signin"), signing_in: t("mem.setup.signing") }[phase];
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
        )}
        <GFoot note={t("mem.setup.local", name)} />
      </Group>
    </>
  );
}

export function MemoryPage() {
  const s = A.settings;
  if (!s) return null;
  const b = A.bridge;
  const phase = memPhase(s.memory, A.mem, b);
  if (phase === "off") return <MemHead />;
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

// ---------- 连上的 AI agent / Connected AI agents (D295: on the settings grid) ----------

/** Two of the person's agents' coins, overlapping: this page's mark. */
const CoinsTile = ({ faded }: { faded?: boolean }) => (
  <Tile>
    <span class="mem-coins">
      <Coin harness="claude-code" size={24} off={faded} />
      <Coin harness="codex" size={24} off={faded} />
    </span>
  </Tile>
);

/** The place it receives in, in the person's words. */
const spaceWords = (b: BridgeView) => (!b.space?.label || b.space.label === "Only me" ? t("peers.space.own") : t("peers.space.named", b.space.label));

/** The link's first row in its state (D205; Nowledge Bridge underneath, never named). */
function PeersHead({ b, name }: { b: BridgeView; name: string }) {
  const toMemory = <Btn kind="secondary" size="sm" label={t("peers.mem.go")} onClick={() => A.openSettings("memory")} />;
  const home = homeOf(b);
  const title = t("bridge.title", name);
  if (b.state === "install_mem" || b.state === "installing" || b.state === "sign_in" || b.state === "signing_in")
    return (
      <GHead tile={<CoinsTile faded />} name={title} line={t("peers.mem.first", home, name)}>
        {toMemory}
      </GHead>
    );
  if (b.state === "update_mem") return <GHead tile={<CoinsTile faded />} name={title} line={t("peers.mem.update", home, MEM_MIN)}>{toMemory}</GHead>;
  if (b.state === "updating") return <GHead tile={<CoinsTile faded />} name={title} line={t("bridge.mem.updating", home)} />;
  if (b.state === "local_mem") return <GHead tile={<CoinsTile faded />} name={title} line={t("bridge.mem.local", home)} />;
  if (b.state === "connected") return <GHead tile={<CoinsTile />} name={t("peers.head.on", name)} line={b.pinned ? t("bridge.pinned") : t("mem.app.on")} tone="done" />;
  if (b.state === "ready")
    return (
      <GHead tile={<CoinsTile faded />} name={title} line={t("peers.head.ready")}>
        <Btn kind="primary" size="sm" label={t("bridge.connect")} about={b.identity} onClick={() => A.connectBridge()} />
      </GHead>
    );
  if (b.state === "connecting" || b.state === "disconnecting") return <GHead tile={<CoinsTile faded />} name={title} line={t(b.state === "connecting" ? "bridge.connecting" : "bridge.disconnecting")} />;
  const note = b.state === "no_space" ? t("bridge.no_space") : b.state === "refused" ? t(`bridge.refused.${b.reason ?? "control_denied"}`, b.identity) : b.state === "unconfirmed" ? t("bridge.unconfirmed", b.identity) : t("bridge.failed", b.detail ?? "");
  const tryNewer = b.newer !== undefined && (b.state === "refused" || b.state === "failed" || b.state === "unconfirmed");
  return (
    <GHead tile={<CoinsTile faded />} name={title} line={tryNewer ? `${note}\n${t("peers.mem.newer")}` : note} tone={b.state === "no_space" ? undefined : "bad"}>
      {tryNewer && toMemory}
      {b.state === "unconfirmed" && <DangerButton quiet label={t("bridge.undo")} about={b.identity} onClick={() => ((A.bridgeConfirm = true), A.disconnectBridge())} />}
      {b.state !== "no_space" && <Btn kind="secondary" size="sm" label={t("bridge.retry")} about={b.identity} onClick={() => A.connectBridge()} />}
    </GHead>
  );
}

/** A drawn terminal prompt (never a font's glyph): the words go there. */
const PromptMark = () => (
  <svg class="say-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m4 4.5 4 3.5-4 3.5M9.5 12h3" />
  </svg>
);

/** One thing to say, exactly: what it does, the words (copyable), and where they go (the prompt mark: a terminal; none: here). */
function Say({ what, words, terminal }: { what: string; words: string; terminal: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="say">
      <small class="say-what">{what}</small>
      <div class={`say-words${terminal ? " term" : ""}`}>
        {terminal && <PromptMark />}
        <span class="grow" dir="auto">{words}</span>
        <Btn kind="text" size="sm" label={t(copied ? "peers.try.copied" : "peers.try.copy")} about={words} onClick={() => void copy(words).then((ok) => ok && (setCopied(true), setTimeout(() => setCopied(false), 2000)))} />
      </div>
    </div>
  );
}

/** When the first of the person's other agents came through (its first message in the conversation). */
const firstHandoffAt = () => A.S.channel.find((e) => e.peer?.direction === "in")?.ev.ts;

/**
 * D321: 试试看 / Try it, once the link is on: the exact words for the terminal (J1, X1) and for here (S2),
 * whether each agent can hear them (Mem's plugin in it), and a live row: waiting for the first one,
 * then that it worked (with the way to it), then nothing.
 */
function PeersTry({ name }: { name: string }) {
  const agents = tryAgents(A.devices ?? []);
  const first = firstHandoffAt();
  const phase = handoffPhase(first);
  const from = first ? peerName(A.S.channel.find((e) => e.peer?.direction === "in")!.peer!) : "";
  // The live row checks again when the first one's moment passes.
  const [, tick] = useState(0);
  useEffect(() => {
    if (phase !== "first") return;
    const id = setTimeout(() => tick((n) => n + 1), Math.max(1000, Date.parse(first!) + 15 * 60_000 - Date.now()));
    return () => clearTimeout(id);
  }, [phase, first]);
  return (
    <section class="set mem-sec">
      <h3>{t("peers.try.title")}</h3>
      <p class="g-note">{t("peers.try.note")}</p>
      <Group class="mem-g" label={t("peers.try.title")}>
        <GBlock>
          <Say what={t("peers.try.work.what")} words={t("peers.try.work", name)} terminal />
          <Say what={t("peers.try.ask.what")} words={t("peers.try.ask", name)} terminal />
        </GBlock>
        {agents.map((x) => (
          <GRow key={x.harness} tile={<Tile><Coin harness={x.harness} size={36} /></Tile>} title={x.harness === "codex" ? "Codex" : "Claude Code"} line={x.plugin === "on" ? t("peers.try.plugin.on") : x.plugin === "off" ? t("peers.try.plugin.off", name) : t("peers.try.plugin.unknown")}>
            {x.plugin === "off" && x.device && <Btn kind="secondary" size="sm" label={t("peers.try.plugin.go")} about={x.device} onClick={() => A.installMem(x.device!, x.harness)} />}
          </GRow>
        ))}
        {phase === "waiting" && <GRow tile={<Tile><span class="handoff-wait" /></Tile>} title={t("peers.wait.title")} line={t("peers.wait.line")} />}
        {phase === "first" && (
          <GRow tile={<Tile><span class="mem-glyph done handoff-done"><Check /></span></Tile>} title={t("peers.first.title", from, name)} line={t("peers.first.line")}>
            <Btn kind="secondary" size="sm" label={t("peers.first.open")} onClick={() => ((A.sheet = null), A.go({ name: "conv" }))} />
          </GRow>
        )}
        <GBlock>
          <Say what={t("peers.try.here.what", name)} words={t("peers.try.here")} terminal={false} />
        </GBlock>
      </Group>
    </section>
  );
}

/** Whether 连上的 AI agent has anything to show yet (J6). */
export const peersPageShown = () => peersShown(A.settings?.peers, A.bridge, A.S.channel.some((e) => e.peer));

const peerTool = (agent: string) => (/claude/i.test(agent) ? "Claude Code" : /codex/i.test(agent) ? "Codex" : /\bpi\b/i.test(agent) ? "pi" : agent);

/**
 * D170, D205, D295: the link as one group (its state, its identity and place in human words, who may
 * reach it, the raw ids behind 详情, a quiet 断开 that asks in place), then what it learned.
 */
export function PeersPage() {
  const [more, setMore] = useState(false);
  const s = A.settings;
  const p = s?.peers;
  if (!s || !p) return null;
  const b = A.bridge;
  const name = s.name;
  const set = (patch: Partial<typeof p>) => A.setSettings({ peers: { ...p, ...patch } });
  const setup = !b || ["install_mem", "installing", "sign_in", "signing_in", "update_mem", "updating", "local_mem"].includes(b.state);
  const reachShown = A.S.channel.some((e) => e.peer) || !!p.trusted.length || !!p.muted.length || !setup;
  const connected = b?.state === "connected";
  return (
    <>
      <p class="set-lede">{t("settings.lede.peers", name)}</p>
      <Group class="mem-g" label={t("settings.tab.peers")}>
        {b && <PeersHead b={b} name={name} />}
        {connected && b && <GRow title={t("peers.as.title")} line={t("peers.as.line", b.identity)} />}
        {connected && b && <GRow title={t("peers.space.title")} line={spaceWords(b)} />}
        {reachShown && (
          <GBlock>
            <span class="mem-reach">
              <b>{t("peers.reach", name)}</b>
              <small>{p.reach === "off" ? t("peers.reach.off.note", name) : t("peers.reach.note")}</small>
            </span>
            <Seg label={t("peers.reach", name)} value={p.reach} options={(["own", "team", "off"] as const).map((v) => ({ v, label: t(`peers.reach.${v}`) }))} onPick={(reach) => set({ reach })} />
          </GBlock>
        )}
        {connected && b && more && (
          <GBlock>
            <MemFacts b={b} />
          </GBlock>
        )}
        {connected && b && !b.pinned && A.bridgeConfirm ? (
          <GConfirm ask={t("peers.undo.ask")} keep={t("bridge.undo.keep")} go={t("bridge.undo")} about={b.identity} onKeep={() => ((A.bridgeConfirm = false), A.changed())} onGo={() => A.disconnectBridge()} />
        ) : (
          connected &&
          b && (
            <GFoot note={b.detail ? t("bridge.undo.failed", b.detail) : t("peers.foot")}>
              <Btn kind="text" size="sm" label={t("mem.details")} about={b.identity} expanded={more} onClick={() => setMore(!more)} />
              {!b.pinned && <DangerButton quiet label={t("bridge.undo")} about={b.identity} onClick={() => A.disconnectBridge()} />}
            </GFoot>
          )
        )}
      </Group>
      {connected && <PeersTry name={name} />}
      {(p.trusted.length > 0 || p.muted.length > 0) && (
        <section class="set mem-sec">
          <h3>{t("peers.rules.title")}</h3>
          <Group class="mem-g" label={t("peers.rules.title")}>
            {p.trusted.map((a) => (
              <GRow key={`t-${a}`} tile={<ToolTile from={peerTool(a)} />} title={t("peers.trusted", a)} line={t("peers.trusted.why")}>
                <Btn kind="text" size="sm" label={t("peers.trusted.stop")} about={a} onClick={() => set({ trusted: p.trusted.filter((x) => x !== a) })} />
              </GRow>
            ))}
            {p.muted.map((a) => (
              <GRow key={`m-${a}`} tile={<ToolTile from={peerTool(a)} />} title={t("peers.muted", a)}>
                <Btn kind="text" size="sm" label={t("peers.muted.undo")} about={a} onClick={() => set({ muted: p.muted.filter((x) => x !== a) })} />
              </GRow>
            ))}
          </Group>
        </section>
      )}
    </>
  );
}
