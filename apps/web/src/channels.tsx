// 设置 › 聊天软件 / Settings › Chat apps (D276, design/channels.md §6): connect the person's own
// Telegram bot and Slack app, link their account with a one-time code, see who is linked, unlink.
// A token goes to the home once, in channel_connect, and never comes back.
import type { ChannelKind, ChannelServerFrame, ChannelView } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, DangerButton, LinkBtn } from "./controls.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Frame = Extract<ChannelServerFrame, { t: "channels" }>;
type Result = Extract<ChannelServerFrame, { t: "channel_result" }>;

/** What this page knows; the home's frames keep it current. */
const S: { frame?: Frame; busy: Partial<Record<ChannelKind, boolean>>; bad: Partial<Record<ChannelKind, Result["reason"]>>; code: Partial<Record<ChannelKind, Result>> } = { busy: {}, bad: {}, code: {} };

A.onChannelFrame = (f) => {
  if (f.t === "channels") {
    S.frame = f;
    // A linked account needs no code any more.
    for (const v of f.channels) if (v.state !== "unlinked") delete S.code[v.kind];
  } else {
    if (f.op === "connect") {
      S.busy[f.kind] = false;
      if (f.ok) delete S.bad[f.kind];
      else S.bad[f.kind] = f.reason;
    }
    if (f.op === "code" && f.ok) S.code[f.kind] = f;
  }
  A.changed();
};

const NAMES: Record<ChannelKind, string> = { telegram: "Telegram", slack: "Slack" };

/** The section's art: two clay speech bubbles, drawn (no emoji, no service marks). */
export function ChatsArt({ size }: { size: number }) {
  return (
    <svg class="chats-art" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M6 9.5C6 7 8 5 10.5 5h13C26 5 28 7 28 9.5v7c0 2.5-2 4.5-4.5 4.5H14l-5 4v-4.2C7.3 20.3 6 18.6 6 16.5z" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M16 20.5c0-2.5 2-4.5 4.5-4.5h9c2.5 0 4.5 2 4.5 4.5v6c0 2-1.3 3.7-3 4.3V35l-4.5-4h-6C18 31 16 29 16 26.5z" fill="var(--surface-sunken)" stroke="var(--ink-soft)" stroke-width="1.6" stroke-linejoin="round" />
      <circle cx="21.5" cy="23.5" r="1.3" fill="var(--ink-soft)" />
      <circle cx="25.5" cy="23.5" r="1.3" fill="var(--ink-soft)" />
      <circle cx="29.5" cy="23.5" r="1.3" fill="var(--ink-soft)" />
    </svg>
  );
}

export function ChatAppsSettings() {
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "channels" });
  }, [A.S.welcomed]);
  const f = S.frame;
  if (!f) return <div class="small">{t("conn.connecting")}</div>;
  return (
    <>
      <p class="af-lede">{t("chats.lede", A.S.personaName)}</p>
      {f.channels.map((v) => (
        <ChannelCard key={v.kind} v={v} manifest={f.slackManifest} />
      ))}
      <p class="small chats-goes">{t("chats.goes")}</p>
    </>
  );
}

function stateLine(v: ChannelView): string {
  if (v.state === "linked") return t("chats.state.linked", v.linked?.name ?? "");
  if (v.state === "cant_connect") {
    const r = v.reason ?? "network";
    if (r === "token") return t("chats.cant.key", NAMES[v.kind]);
    return r === "network" ? t("chats.cant.network", NAMES[v.kind]) : t(`chats.cant.${r}`);
  }
  return t(v.state === "unlinked" ? "chats.state.unlinked" : v.state === "starting" ? "chats.state.starting" : "chats.state.off");
}

function ChannelCard({ v, manifest }: { v: ChannelView; manifest: string }) {
  const name = NAMES[v.kind];
  const needsTokens = v.state === "off" || (v.state === "cant_connect" && v.reason === "token");
  const stranger = v.strangerAt && Date.now() - Date.parse(v.strangerAt) < 24 * 3600_000;
  return (
    <section class="set">
      <h3>{name}</h3>
      <div class="set-card">
        <div class="set-item">
          <b>{v.bot ? (v.bot.handle ? `${v.bot.name} · @${v.bot.handle}` : v.bot.team ? `${v.bot.name} · ${v.bot.team}` : v.bot.name) : name}</b>
          <small class={v.state === "cant_connect" ? "chats-bad" : undefined}>{stateLine(v)}</small>
          {stranger && <small>{t("chats.stranger", name, A.S.personaName)}</small>}
        </div>
        {needsTokens && <Connect kind={v.kind} manifest={manifest} />}
        {v.state === "unlinked" && <Link v={v} />}
        {v.state !== "off" && (
          <div class="set-item chats-end">
            <small>{t(v.kind === "telegram" ? "chats.tg.who" : "chats.sl.who")}</small>
            <span class="chats-row">
              {v.state === "linked" && <Btn kind="secondary" size="sm" label={t("chats.unlink")} onClick={() => A.send({ t: "channel_unlink", kind: v.kind })} />}
              <DangerButton label={t("chats.forget", name)} onClick={() => A.send({ t: "channel_forget", kind: v.kind })} />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function Field(p: { id: string; label: string; value: string; onInput: (v: string) => void; wrong?: boolean }) {
  return (
    <label class="acct-field" for={p.id}>
      <span class="small">{p.label}</span>
      <input id={p.id} class={p.wrong ? "wrong" : undefined} type="password" autocomplete="off" spellcheck={false} value={p.value} onInput={(e) => p.onInput((e.target as HTMLInputElement).value)} />
    </label>
  );
}

function Connect({ kind, manifest }: { kind: ChannelKind; manifest: string }) {
  const [token, setToken] = useState("");
  const [app, setApp] = useState("");
  const [copied, setCopied] = useState(false);
  const busy = S.busy[kind];
  const bad = S.bad[kind];
  const go = () => {
    S.busy[kind] = true;
    delete S.bad[kind];
    A.send(kind === "telegram" ? { t: "channel_connect", kind, token: token.trim() } : { t: "channel_connect", kind, botToken: token.trim(), appToken: app.trim() });
    setToken("");
    setApp("");
    A.changed();
  };
  const ready = kind === "telegram" ? !!token.trim() : !!token.trim() && !!app.trim();
  return (
    <div class="set-item chats-connect">
      {kind === "telegram" ? (
        <ol class="chats-steps">
          <li>{t("chats.tg.step1", A.S.personaName)}</li>
          <li>{t("chats.tg.step2")}</li>
        </ol>
      ) : (
        <>
          <ol class="chats-steps">
            <li>{t("chats.sl.step1")}</li>
            <li>{t("chats.sl.step2")}</li>
          </ol>
          <pre class="chats-manifest">{manifest}</pre>
          <span class="chats-row">
            <Btn kind="secondary" size="sm" label={t(copied ? "chats.sl.copied" : "chats.sl.copy")} onClick={() => void navigator.clipboard?.writeText(manifest).then(() => setCopied(true))} />
          </span>
          <ol class="chats-steps" start={3}>
            <li>{t("chats.sl.step3")}</li>
          </ol>
        </>
      )}
      <Field id={`ch-${kind}-a`} label={t(kind === "telegram" ? "chats.tg.key" : "chats.sl.bot")} value={token} onInput={setToken} wrong={bad === "token"} />
      {kind === "slack" && <Field id={`ch-${kind}-b`} label={t("chats.sl.app")} value={app} onInput={setApp} wrong={bad === "token"} />}
      {bad && <small class="chats-bad">{t(bad === "token" ? "chats.bad.key" : "chats.bad.network")}</small>}
      <span class="chats-row end">
        <Btn kind="primary" label={t(busy ? "chats.connecting" : "chats.connect")} disabled={busy || !ready} onClick={go} />
      </span>
    </div>
  );
}

function Link({ v }: { v: ChannelView }) {
  const c = S.code[v.kind];
  const live = c?.expiresAt && Date.parse(c.expiresAt) > Date.now();
  return (
    <div class="set-item chats-link">
      {live && c.code ? (
        <>
          {v.kind === "telegram" && c.link && (
            <span class="chats-row">
              <LinkBtn kind="primary" href={c.link} label={t("chats.tg.open")} />
            </span>
          )}
          <small>{v.kind === "telegram" ? t("chats.tg.code", `/start ${c.code}`) : t("chats.sl.code", v.bot?.name ?? "", c.code)}</small>
          <b class="chats-code">{c.code}</b>
          <small>{t("chats.code.ttl", A.S.personaName)}</small>
        </>
      ) : (
        <span class="chats-row">
          <Btn kind="primary" label={t("chats.code.get")} onClick={() => A.send({ t: "channel_code", kind: v.kind })} />
        </span>
      )}
    </div>
  );
}
