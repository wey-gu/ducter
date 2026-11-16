// D257: Settings › 记忆 / Memory and › 连上的 AI agent / Connected AI agents, each its own page;
// D295: both on the settings grid (D289). Memory shows the value first: the partner remembers you
// (what's new this week, the switch), what it noted this week and earlier (each forgettable, asking
// in place), what your other AI tools saved to Mem, then Nowledge Mem in human words (where it's
// kept, its name there, the raw ids behind 详情). Before Mem: a small empty state and the setup as
// steps. Connected AI agents is the persona's link with the person's other agents (D205) and who
// may reach it (D170); it shows once Mem is in (peersShown). The Mac's: memory_pane.go, peers_pane.go.
import type { BridgeView } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn, DangerButton, Facts, LinkBtn, Seg, Switch } from "./controls.tsx";
import { ago } from "./format.ts";
import { groupNoted, MEM_MIN, memPhase, memUpdate, peersShown, type MemPhase, type MemUpdate } from "./mem-view.ts";
import { GBlock, GConfirm, GFoot, GHead, GRow, Group, Tile } from "./set-grid.tsx";
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

/** The first group: the partner remembers you, what's new this week, the switch. */
function MemHead() {
  const s = A.settings!;
  const n = weekCount(A.mem?.noted ?? []);
  const on = s.memory;
  return (
    <Group class="mem-g" label={t("settings.tab.memory")}>
      <GHead tile={<NotebookTile />} name={on ? t("mem.hero.on", s.name) : t("mem.hero.off", s.name)} line={!on ? t("mem.off.line") : n ? t("mem.week.count", String(n)) : t("mem.week.none")} tone={on && n ? "done" : undefined}>
        <Switch label={t("partner.memory.switch")} on={on} onChange={(memory) => A.setSettings({ memory })} />
      </GHead>
      <GFoot note={on ? t("mem.switch.note") : t("partner.memory.off")} />
    </Group>
  );
}

type Noted = NonNullable<typeof A.mem>["noted"][number];

/** What it noted, this week and earlier; 忘掉 asks in place; the last group's foot is the door to Mem. */
function MemNoted() {
  const [ask, setAsk] = useState(0);
  const noted = A.mem?.noted ?? [];
  const groups = groupNoted(noted);
  const week = groups.filter((g) => g.when !== "earlier").flatMap((g) => g.items);
  const earlier = groups.filter((g) => g.when === "earlier").flatMap((g) => g.items);
  const total = A.mem?.glance?.total;
  const foot = (
    <GFoot note={total ? t("mem.all.count", thousands(total)) : t("mem.all.note")}>
      <LinkBtn kind="text" size="sm" href={MEM_SITE} label={t("mem.all.open")} />
    </GFoot>
  );
  const row = (n: Noted) =>
    ask === n.seq ? (
      <GConfirm key={n.seq} ask={n.memoryId ? t("mem.forget.ask", n.title) : t("mem.forget.ask.hide", n.title)} keep={t("mem.forget.keep")} go={t("partner.memory.forget")} about={n.title} onKeep={() => setAsk(0)} onGo={() => (setAsk(0), A.forget(n.seq))} />
    ) : (
      <GRow key={n.seq} tile={<PebbleTile />} title={n.title} line={ago(A.L, n.at)}>
        <DangerButton quiet label={t("partner.memory.forget")} about={n.title} onClick={() => setAsk(n.seq)} />
      </GRow>
    );
  if (!noted.length)
    return (
      <section class="set mem-sec">
        <h3>{t("mem.sec.week")}</h3>
        <Group class="mem-g" label={t("mem.sec.week")}>
          <GRow tile={<PebbleTile />} title={t("mem.empty.title")} line={t("mem.hero.empty.body")} />
          {foot}
        </Group>
      </section>
    );
  return (
    <>
      {week.length > 0 && (
        <section class="set mem-sec">
          <h3>{t("mem.sec.week")}</h3>
          <Group class="mem-g" label={t("mem.sec.week")}>
            {week.map(row)}
            {!earlier.length && foot}
          </Group>
        </section>
      )}
      {earlier.length > 0 && (
        <section class="set mem-sec">
          <h3>{t("mem.sec.earlier")}</h3>
          <Group class="mem-g" label={t("mem.sec.earlier")}>
            {earlier.map(row)}
            {foot}
          </Group>
        </section>
      )}
    </>
  );
}

/** What the person's other AI tools saved to Mem lately: the memory is shared. Read-only here. */
function MemOthers() {
  const others = A.mem?.glance?.others ?? [];
  if (!others.length) return null;
  return (
    <section class="set mem-sec">
      <h3>{t("mem.others.title")}</h3>
      <p class="g-note">{t("mem.others.note", A.settings!.name)}</p>
      <Group class="mem-g" label={t("mem.others.title")}>
        {others.map((o) => (
          <GRow key={o.id} tile={<ToolTile from={o.from} />} title={o.title} line={t("mem.others.by", o.from)}>
            {o.at && <span class="g-state">{ago(A.L, o.at)}</span>}
          </GRow>
        ))}
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
      <MemNoted />
      <MemOthers />
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
