// D257: Settings › 记忆 / Memory and › 你的其他 AI / Your other AI agents, each its own page.
// Memory is what the partner remembers about the person, first, in their words: the partner with
// its notebook and one sentence, then what it noted grouped by when (each one forgettable), then
// Nowledge Mem itself (where it is, its version, a newer one, putting it in, signing in). Your
// other AI agents is the persona's connection with the person's other agents (D205) and who may
// reach it (D170); it shows once Mem is in (peersShown), and points to Memory for Mem's own steps.
import type { BridgeView } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn, LinkBtn, Seg, Toggle } from "./controls.tsx";
import { ago } from "./format.ts";
import { groupNoted, MEM_MIN, memPhase, memUpdate, peersShown, type MemPhase, type MemUpdate } from "./mem-view.ts";
import { Avatar } from "./views.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const MEM_SITE = "https://mem.nowledge.co";

const homeOf = (b: BridgeView | undefined) => b?.home || A.homeName || "";

/** The partner's face for where its memory stands: hugging its notebook when it remembers. */
const FACE = { on: "done", off: "napping", missing: "idle", install: "idle", installing: "working", sign_in: "waiting", signing_in: "working" } as const;

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
export function MemMore({ label, text }: { label: string; text: string }) {
  return (
    <details class="mem-more">
      <summary>{label}</summary>
      <small>{text}</small>
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

// ---------- 记忆 / Memory ----------

function heroWords(phase: MemPhase, name: string, noted: number): [string, string] {
  switch (phase) {
    case "on":
      return [t("mem.hero.on", name), noted ? t("mem.hero.on.body") : t("mem.hero.empty.body")];
    case "off":
      return [t("mem.hero.off", name), t("partner.memory.off")];
    case "sign_in":
      return [t("mem.hero.signin"), t("mem.hero.signin.body")];
    case "installing":
    case "signing_in":
      return [t("mem.hero.busy"), t("mem.hero.missing.body")];
    default:
      return [t("mem.hero.missing", name), t("mem.hero.missing.body")];
  }
}

/** The partner with its notebook, one sentence of what it remembers, and the switch. */
function MemHero({ phase }: { phase: MemPhase }) {
  const s = A.settings!;
  const noted = A.mem?.noted.length ?? 0;
  const [title, body] = heroWords(phase, s.name, noted);
  const switchable = phase === "on" || phase === "off";
  return (
    <section class={`mem-hero ${phase}`} aria-label={t("settings.tab.memory")}>
      <div class="mem-hero-top">
        <Avatar size={84} state={FACE[phase]} />
        <div class="grow">
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      </div>
      {switchable && <Toggle label={t("partner.memory.switch")} help={s.memory ? t("mem.switch.note") : undefined} checked={s.memory} onChange={(memory) => A.setSettings({ memory })} />}
    </section>
  );
}

/** The update worth the person's tap, in the highlight (D213, D224): Bridge needs it, or Mem says a newer one is out. */
function MemUpdateCard({ u, b }: { u: MemUpdate; b: BridgeView }) {
  const home = homeOf(b);
  if (u.kind === "updating")
    return (
      <div class="mem-update busy" role="status">
        <div class="grow">
          <b>{u.move ? t("bridge.mem.moving", home) : t("bridge.mem.updating", home)}</b>
        </div>
        <Btn kind="secondary" size="sm" disabled label={t(u.move ? "bridge.mem.busy.move" : "bridge.mem.busy.update")} onClick={() => {}} />
      </div>
    );
  if (u.kind === "needed") {
    const line = u.canRun
      ? t(u.move ? "bridge.mem.update.move" : "bridge.mem.update", home, u.version ?? "", MEM_MIN)
      : u.app
        ? t("bridge.update", home)
        : t("bridge.mem.update.other", home, u.version ?? "", MEM_MIN);
    return (
      <div class="mem-update">
        <div class="grow">
          <b>{t("mem.update.needed")}</b>
          <small>{line}</small>
          {u.detail && <MemFailed detail={u.detail} kept={u.kept} install={false} />}
        </div>
        {u.canRun && <Btn kind="primary" size="sm" label={u.detail ? t("bridge.retry") : t("bridge.mem.update.go")} about={home} onClick={() => A.installBridgeMem()} />}
      </div>
    );
  }
  if (u.kind === "newer" || u.kind === "app")
    return (
      <div class="mem-update">
        <div class="grow">
          <b>{u.newer ? t("mem.update.newer", u.newer) : t("mem.update.newer.any")}</b>
          <small>{u.kind === "app" ? t("mem.update.app.body", home) : u.version ? t("mem.update.newer.body", home, u.version) : t("mem.update.newer.body.any")}</small>
          {u.kind === "newer" && u.detail && <MemFailed detail={u.detail} kept={u.kept} install={false} />}
        </div>
        {u.kind === "newer" && <Btn kind="primary" size="sm" label={u.detail ? t("bridge.retry") : t("bridge.mem.update.go")} about={home} onClick={() => A.installBridgeMem()} />}
      </div>
    );
  return null;
}

/** What it noted, by when; each line can be forgotten (in Mem when it has the id, D150). */
function MemNotes() {
  const noted = A.mem?.noted ?? [];
  if (!noted.length) return null;
  return (
    <section class="set">
      <h3>{t("mem.notes.title")}</h3>
      <div class="set-card mem-notes">
        {groupNoted(noted).map((g) => (
          <div class="mem-group" key={g.when}>
            <h4>{t(`mem.when.${g.when}`)}</h4>
            {g.items.map((n) => (
              <div class="mem-note" key={n.seq}>
                <span class="mem-dot" aria-hidden="true" />
                <span class="grow">
                  <span class="mem-title">{n.title}</span>
                  <small>{ago(A.L, n.at)}</small>
                </span>
                <Btn kind="text" size="sm" label={t("partner.memory.forget")} about={n.title} onClick={() => A.forget(n.seq)} />
              </div>
            ))}
          </div>
        ))}
        <a class="mem-door" href={MEM_SITE} target="_blank" rel="noopener noreferrer">
          <span>{t("mem.notes.all")}</span>
          <OutMark />
        </a>
      </div>
    </section>
  );
}

const OutMark = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3.5H3.5v9h9V10" />
    <path d="M9 3h4v4M13 3 7.5 8.5" />
  </svg>
);

/** Nowledge Mem itself: where it is and its version, putting it in, signing in, a move worth making. */
function MemApp({ phase, b }: { phase: MemPhase; b: BridgeView | undefined }) {
  const [link, setLink] = useState("");
  const mem = A.mem;
  const home = homeOf(b);
  const u = memUpdate(b);
  const pill = phase === "on" ? <span class="mem-pill on">{t("mem.app.on")}</span> : null;
  let body: preact.ComponentChildren;
  if (phase === "off") body = <small>{t("mem.app.off")}</small>;
  else if (phase === "install" || phase === "installing") {
    const busy = phase === "installing";
    body = (
      <>
        <small>{busy ? t("bridge.mem.installing", home) : b?.canRun ? t("bridge.mem.install", home) : t("bridge.mem.install.need", home)}</small>
        {b?.detail && !busy && <MemFailed detail={b.detail} kept={b.kept} install />}
        {!b?.canRun && !busy && <MemMore label={t("bridge.mem.how")} text={t("bridge.mem.install.need.how")} />}
        <div class="mem-acts">
          {busy ? <Btn kind="secondary" size="sm" disabled label={t("bridge.mem.busy.install")} onClick={() => {}} /> : <Btn kind={b?.canRun ? "primary" : "secondary"} size="sm" label={b?.canRun ? t("bridge.mem.install.go") : t("bridge.retry")} about={home} onClick={() => A.installBridgeMem()} />}
        </div>
      </>
    );
  } else if (phase === "sign_in" || phase === "signing_in") {
    const busy = phase === "signing_in";
    const why = b?.signIn === "used" ? t("bridge.mem.signin.used") : b?.signIn === "bad" ? t("bridge.mem.signin.bad") : b?.signIn === "failed" ? t("bridge.mem.signin.failed", b.detail ?? "") : "";
    const go = () => {
      if (!link.trim() || busy) return;
      A.signInBridgeMem(link.trim());
      setLink("");
    };
    body = (
      <>
        {b?.done && <small class="mem-done">{t(`bridge.mem.done.${b.done}`, home)}</small>}
        <small>{t("bridge.mem.signin", home)}</small>
        {why && <small class="mem-why">{why}</small>}
        <label class="acct-field">
          <span class="small">{t("bridge.mem.signin.link")}</span>
          <input type="url" inputMode="url" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellcheck={false} enterKeyHint="go" placeholder="https://…?nmem_connect=…" value={link} disabled={busy} onInput={(e) => setLink((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        </label>
        <div class="mem-acts">
          <Btn kind="primary" size="sm" disabled={busy || !link.trim()} label={busy ? t("bridge.mem.signin.busy") : t("bridge.mem.signin.go")} about={home} onClick={go} />
        </div>
      </>
    );
  } else if (phase === "missing")
    body = (
      <>
        <small>{home ? t("mem.app.missing", home) : t("mem.app.missing.here")}</small>
        <small>{t("mem.app.what")}</small>
        <div class="mem-acts">
          <LinkBtn kind="secondary" size="sm" href={MEM_SITE} label={t("mem.app.learn")} />
        </div>
      </>
    );
  else {
    const where = b?.state === "local_mem" ? t("mem.app.local", home) : home ? t("mem.app.where", home) : "";
    body = (
      <>
        <div class="mem-app-head">
          <small class="mem-meta">
            {where}
            {where && b?.version && " · "}
            {b?.version && <span class="mono">{b.version}</span>}
          </small>
          {pill}
        </div>
        {mem?.keptUnder && <small>{t("mem.app.name", mem.keptUnder)}</small>}
        {u?.kind === "done" && <small class="mem-done">{t(`bridge.mem.done.${u.done}`, home)}</small>}
        {u?.kind === "move" && (
          <div class="mem-upkeep">
            <small>{t("bridge.mem.upkeep.move", home)}</small>
            {u.detail && <MemFailed detail={u.detail} kept={u.kept} install={false} />}
            <div class="mem-acts split">
              {u.detail ? <span /> : <MemMore label={t("bridge.mem.more")} text={t("bridge.mem.upkeep.move.how")} />}
              <Btn kind="secondary" size="sm" label={u.detail ? t("bridge.retry") : t("bridge.mem.upkeep.move.go")} about={home} onClick={() => A.installBridgeMem()} />
            </div>
          </div>
        )}
      </>
    );
  }
  return (
    <section class="set">
      <h3>Nowledge Mem</h3>
      <div class="set-card mem-app">
        <div class="set-item">
          {body}
        </div>
      </div>
    </section>
  );
}

export function MemoryPage() {
  const s = A.settings;
  if (!s) return null;
  const b = A.bridge;
  const phase = memPhase(s.memory, A.mem, b);
  const u = memUpdate(b);
  const loud = u && (u.kind === "updating" || u.kind === "needed" || u.kind === "newer" || u.kind === "app");
  return (
    <>
      <MemHero phase={phase} />
      {loud && b && phase === "on" && <MemUpdateCard u={u} b={b} />}
      {s.memory && <MemNotes />}
      <MemApp phase={phase} b={b} />
    </>
  );
}

// ---------- 你的其他 AI / Your other AI agents ----------

/** The persona's own connection (D205; Nowledge Bridge underneath, never named). Mem's own steps live in Memory. */
function BridgeRow() {
  const b = A.bridge;
  const s = A.settings;
  if (!b || !s) return null;
  const name = s.name;
  const space = b.space?.label ?? "Only me";
  const home = homeOf(b);
  const toMemory = <Btn kind="secondary" size="sm" label={t("peers.mem.go")} onClick={() => A.openSettings("memory")} />;
  if (b.state === "install_mem" || b.state === "installing" || b.state === "sign_in" || b.state === "signing_in")
    return (
      <div class="set-item">
        <b>{t("bridge.title", name)}</b>
        <small>{t("peers.mem.first", home, name)}</small>
        <div class="mem-acts">{toMemory}</div>
      </div>
    );
  if (b.state === "update_mem" || b.state === "updating")
    return (
      <div class="set-item">
        <b>{t("bridge.title", name)}</b>
        <small>{b.state === "updating" ? t("bridge.mem.updating", home) : t("peers.mem.update", home, MEM_MIN)}</small>
        {b.state === "update_mem" && <div class="mem-acts">{toMemory}</div>}
      </div>
    );
  if (b.state === "local_mem")
    return (
      <div class="set-item">
        <b>{t("bridge.title", name)}</b>
        <small>{t("bridge.mem.local", home)}</small>
      </div>
    );
  const note =
    b.state === "ready" ? t("bridge.ready", b.identity, space)
    : b.state === "connecting" ? t("bridge.connecting")
    : b.state === "disconnecting" ? t("bridge.disconnecting")
    : b.state === "connected" ? (b.pinned ? t("bridge.pinned") : t("bridge.connected", b.identity, space))
    : b.state === "no_space" ? t("bridge.no_space")
    : b.state === "refused" ? t(`bridge.refused.${b.reason ?? "control_denied"}`, b.identity)
    : b.state === "unconfirmed" ? t("bridge.unconfirmed", b.identity)
    : t("bridge.failed", b.detail ?? "");
  const busy = b.state === "connecting" || b.state === "disconnecting";
  const canUndo = (b.state === "connected" && !b.pinned) || b.state === "unconfirmed";
  const canTry = b.state === "ready" || b.state === "refused" || b.state === "failed" || b.state === "unconfirmed";
  // When it doesn't connect and Mem says a newer one is out, that's the first thing to try (D257).
  const tryNewer = b.newer !== undefined && (b.state === "refused" || b.state === "failed" || b.state === "unconfirmed");
  // The exact identity, place and id it uses, said literally but behind 细节 (D205's line, D257).
  const ids = b.space && (b.state === "ready" || b.state === "connected") ? `${b.identity} · ${space} · ${b.space.id}` : "";
  return (
    <div class="set-item">
      <b>{t("bridge.title", name)}</b>
      <small>{note}</small>
      {b.state === "connected" && b.detail && <small>{t("bridge.undo.failed", b.detail)}</small>}
      {tryNewer && <small class="mem-why">{t("peers.mem.newer")}</small>}
      {canUndo && A.bridgeConfirm && <small>{t("bridge.undo.ask")}</small>}
      {(canTry || canUndo || busy || tryNewer || ids) && (
        <div class="mem-acts split">
          {ids ? <MemMore label={t("bridge.mem.more")} text={ids} /> : <span />}
          <span class="mem-acts">
          {tryNewer && toMemory}
          {canUndo && A.bridgeConfirm && <Btn kind="text" size="sm" label={t("bridge.undo.keep")} onClick={() => ((A.bridgeConfirm = false), A.changed())} />}
          {canUndo && <Btn kind="secondary" size="sm" label={t("bridge.undo")} about={b.identity} onClick={() => A.disconnectBridge()} />}
          {canTry && <Btn kind={b.state === "ready" ? "primary" : "secondary"} size="sm" label={b.state === "ready" ? t("bridge.connect") : t("bridge.retry")} about={b.identity} onClick={() => A.connectBridge()} />}
          {busy && <Btn kind="secondary" size="sm" disabled label={b.state === "connecting" ? t("bridge.connecting") : t("bridge.disconnecting")} onClick={() => {}} />}
          </span>
        </div>
      )}
    </div>
  );
}

/** Whether 你的其他 AI has anything to show yet (J6). */
export const peersPageShown = () => peersShown(A.settings?.peers, A.bridge, A.S.channel.some((e) => e.peer));

/**
 * D170: who of the person's other AI agents may reach the partner, what it learned about them, and
 * whom they stopped listening to; D205's connection on top. Two levels: 断开 ends it all;
 * 谁都不行 lets no other agent reach the partner, while what the person sends on a card still goes.
 */
export function PeersPage() {
  const s = A.settings;
  const p = s?.peers;
  if (!s || !p) return null;
  const b = A.bridge;
  const name = s.name;
  const set = (patch: Partial<typeof p>) => A.setSettings({ peers: { ...p, ...patch } });
  const setup = !b || ["install_mem", "installing", "sign_in", "signing_in", "update_mem", "updating"].includes(b.state);
  const reachShown = A.S.channel.some((e) => e.peer) || !!p.trusted.length || !!p.muted.length || !setup;
  return (
    <>
      <div class="peers-hero">
        <span class="peers-coins" aria-hidden="true">
          <Coin harness="claude-code" size={44} />
          <Coin harness="codex" size={44} />
        </span>
        <p>{t("settings.lede.peers", name)}</p>
      </div>
      <section class="set">
        <div class="set-card">
          <BridgeRow />
          {reachShown && (
            <div class="set-item">
              <b>{t("peers.reach", name)}</b>
              <small>{p.reach === "off" ? t("peers.reach.off.note", name) : t("peers.reach.note")}</small>
              <Seg label={t("peers.reach", name)} value={p.reach} options={(["own", "team", "off"] as const).map((v) => ({ v, label: t(`peers.reach.${v}`) }))} onPick={(reach) => set({ reach })} />
            </div>
          )}
        </div>
      </section>
      {(p.trusted.length > 0 || p.muted.length > 0) && (
        <section class="set">
          <div class="set-card">
            {p.trusted.map((a) => (
              <div class="set-item peer-rule" key={`t-${a}`}>
                <b>{t("peers.trusted", a)}</b>
                <small>{t("peers.trusted.why")}</small>
                <div class="mem-acts">
                  <Btn kind="text" size="sm" label={t("peers.trusted.stop")} about={a} onClick={() => set({ trusted: p.trusted.filter((x) => x !== a) })} />
                </div>
              </div>
            ))}
            {p.muted.map((a) => (
              <div class="set-item peer-rule" key={`m-${a}`}>
                <b>{t("peers.muted", a)}</b>
                <div class="mem-acts">
                  <Btn kind="text" size="sm" label={t("peers.muted.undo")} about={a} onClick={() => set({ muted: p.muted.filter((x) => x !== a) })} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
