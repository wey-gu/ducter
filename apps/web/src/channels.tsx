// 设置 › 聊天软件 / Settings › Chat apps (D276, design/channels.md §6): connect the person's own
// Telegram bot and Slack app, link their account with a one-time code, see who is linked, unlink.
// A token goes to the home once, in channel_connect, and never comes back.
//
// D283: D273's grid. Each chat app is one raised group whose first row is the app itself (its letter
// pebble, its name, how it stands), never a title repeated above it; a setup is a short guided path,
// a step mark in the tile column and one sentence beside it; Connect is the group's one primary at
// the right edge of its last line, its privacy note on the left. iMessage is the third group: it
// goes through a Mac, so here it only says where to set it up.
import type { ChannelKind, ChannelServerFrame, ChannelView } from "@ducter/protocol";
import type { ComponentChildren } from "preact";
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
const BOTFATHER = "https://t.me/BotFather";
const SLACK_APPS = "https://api.slack.com/apps?new_app=1";

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
      <section class="set-card chat-app" aria-label="iMessage">
        <Head kind="imessage" name="iMessage" line={t("chats.im.mac")} />
        <Foot note={t("chats.im.mac.note")} />
      </section>
      <p class="small chats-goes">{t("chats.goes")}</p>
    </>
  );
}

function stateLine(v: ChannelView): [string, string] {
  if (v.state === "linked") return [t("chats.state.linked", botLine(v)), "done"];
  if (v.state === "cant_connect") {
    const r = v.reason ?? "network";
    if (r === "token") return [t("chats.cant.key", NAMES[v.kind]), "bad"];
    return [r === "network" ? t("chats.cant.network", NAMES[v.kind]) : t(`chats.cant.${r}`), "bad"];
  }
  if (v.state === "unlinked") return [t("chats.state.unlinked"), "ink"];
  return [t(v.state === "starting" ? "chats.state.starting" : "chats.state.off"), ""];
}

/** The partner's own bot there: @handle on Telegram, the workspace on Slack, else its name. */
function botLine(v: ChannelView): string {
  if (!v.bot) return NAMES[v.kind];
  return v.bot.handle ? `@${v.bot.handle}` : v.bot.team || v.bot.name;
}

const LETTER: Record<string, string> = { telegram: "T", slack: "S", imessage: "M" };

/** A chat app's first row: its letter pebble (never the service's logo), its name, how it stands. */
function Head(p: { kind: string; name: string; line: string; tone?: string }) {
  return (
    <div class="chat-head">
      <span class={`chat-tile ${p.kind}`} aria-hidden="true">
        {LETTER[p.kind]}
      </span>
      <span class="grow">
        <b>{p.name}</b>
        <small class={p.tone ? `tone-${p.tone}` : undefined}>{p.line}</small>
      </span>
    </div>
  );
}

/** A row on the text column: a title, one muted line, its control at the right edge. */
function Row(p: { title: string; line?: string; children?: ComponentChildren }) {
  return (
    <div class="chat-row">
      <span class="grow">
        <b>{p.title}</b>
        {p.line && <small>{p.line}</small>}
      </span>
      {p.children}
    </div>
  );
}

/** A group's last line: its one quiet note, its button at the right edge. */
function Foot(p: { note: string; children?: ComponentChildren }) {
  return (
    <div class="chat-foot">
      <small class="grow">{p.note}</small>
      {p.children}
    </div>
  );
}

/** One step: its mark in the tile column, one sentence, and what the step needs under it. */
function Step(p: { n: number; text: string; children?: ComponentChildren }) {
  return (
    <li class="chat-step">
      <span class="chat-mark" aria-hidden="true">
        {p.n}
      </span>
      <div class="grow">
        <p>{p.text}</p>
        {p.children}
      </div>
    </li>
  );
}

function ChannelCard({ v, manifest }: { v: ChannelView; manifest: string }) {
  const name = NAMES[v.kind];
  const needsTokens = v.state === "off" || (v.state === "cant_connect" && v.reason === "token");
  const stranger = v.strangerAt && Date.now() - Date.parse(v.strangerAt) < 24 * 3600_000;
  const [line, tone] = stateLine(v);
  const who = t(v.kind === "telegram" ? "chats.tg.who" : "chats.sl.who");
  return (
    <section class="set-card chat-app" aria-label={name}>
      <Head kind={v.kind} name={name} line={line} tone={tone} />
      {stranger && <Row title={t("chats.stranger", name, A.S.personaName)} />}
      {needsTokens ? (
        <Connect kind={v.kind} manifest={manifest} who={who} />
      ) : (
        <>
          {v.state === "unlinked" && <Link v={v} />}
          {v.state === "linked" && (
            <Row title={t("chats.linked.who", v.linked?.name ?? "")} line={t("chats.linked.goes", name)}>
              <Btn kind="text" size="sm" label={t("chats.unlink")} about={name} onClick={() => A.send({ t: "channel_unlink", kind: v.kind })} />
            </Row>
          )}
          <Foot note={who}>
            <DangerButton label={t("chats.forget", name)} about={name} onClick={() => A.send({ t: "channel_forget", kind: v.kind })} />
          </Foot>
        </>
      )}
    </section>
  );
}

function Field(p: { id: string; label: string; value: string; placeholder: string; onInput: (v: string) => void; wrong?: boolean }) {
  return (
    <label class="acct-field chat-field" for={p.id}>
      <span>{p.label}</span>
      <input id={p.id} class={p.wrong ? "wrong" : undefined} type="password" autocomplete="off" spellcheck={false} placeholder={p.placeholder} value={p.value} onInput={(e) => p.onInput((e.target as HTMLInputElement).value)} />
    </label>
  );
}

function Connect({ kind, manifest, who }: { kind: ChannelKind; manifest: string; who: string }) {
  const [token, setToken] = useState("");
  const [app, setApp] = useState("");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState(false);
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
    <>
      <ol class="chat-steps">
        {kind === "telegram" ? (
          <>
            <Step n={1} text={t("chats.tg.step1")}>
              <span class="chat-aside">
                <code class="chat-chip">/newbot</code>
                <LinkBtn kind="text" size="sm" href={BOTFATHER} label={t("chats.tg.botfather")} />
              </span>
            </Step>
            <Step n={2} text={t("chats.tg.step2", A.S.personaName)} />
            <Step n={3} text={t("chats.tg.step3")}>
              <Field id="ch-telegram-a" label={t("chats.tg.key")} placeholder="123456789:AA…" value={token} onInput={setToken} wrong={bad === "token"} />
            </Step>
          </>
        ) : (
          <>
            <Step n={1} text={t("chats.sl.step1")}>
              <span class="chat-aside">
                <Btn kind="secondary" size="sm" label={t(copied ? "chats.sl.copied" : "chats.sl.copy")} onClick={() => void navigator.clipboard?.writeText(manifest).then(() => setCopied(true))} />
                <Btn kind="text" size="sm" chev expanded={view} label={t(view ? "chats.sl.hide" : "chats.sl.view")} about={t("chats.sl.copy")} onClick={() => setView(!view)} />
              </span>
              {view && <pre class="chats-manifest">{manifest}</pre>}
            </Step>
            <Step n={2} text={t("chats.sl.step2")}>
              <span class="chat-aside">
                <LinkBtn kind="text" size="sm" href={SLACK_APPS} label={t("chats.sl.open")} />
              </span>
            </Step>
            <Step n={3} text={t("chats.sl.step3")} />
            <Step n={4} text={t("chats.sl.step4")}>
              <Field id="ch-slack-b" label={t("chats.sl.app")} placeholder="xapp-…" value={app} onInput={setApp} wrong={bad === "token"} />
            </Step>
            <Step n={5} text={t("chats.sl.step5")}>
              <Field id="ch-slack-a" label={t("chats.sl.bot")} placeholder="xoxb-…" value={token} onInput={setToken} wrong={bad === "token"} />
            </Step>
          </>
        )}
        {bad && <li class="chat-bad">{t(bad === "token" ? "chats.bad.key" : "chats.bad.network")}</li>}
      </ol>
      <Foot note={who}>
        <Btn kind="primary" label={t(busy ? "chats.connecting" : "chats.connect")} about={NAMES[kind]} disabled={busy || !ready} onClick={go} />
      </Foot>
    </>
  );
}

function Link({ v }: { v: ChannelView }) {
  const c = S.code[v.kind];
  const live = c?.expiresAt && Date.parse(c.expiresAt) > Date.now();
  const name = NAMES[v.kind];
  if (!live || !c.code)
    return (
      <Row title={t("chats.link.title")} line={t("chats.link.note", A.S.personaName)}>
        <Btn kind="primary" label={t("chats.code.get")} about={name} onClick={() => A.send({ t: "channel_code", kind: v.kind })} />
      </Row>
    );
  return (
    <div class="chat-row chat-code">
      <span class="grow">
        {v.kind === "telegram" ? (
          <>
            <p>{t("chats.tg.code")}</p>
            <code class="chat-chip">/start {c.code}</code>
          </>
        ) : (
          <>
            <p>{t("chats.sl.code", v.bot?.name || A.S.personaName)}</p>
            <b class="chats-code">{c.code}</b>
          </>
        )}
        <small>{t("chats.code.ttl")}</small>
      </span>
      {v.kind === "telegram" && c.link && <LinkBtn kind="primary" href={c.link} label={t("chats.tg.open")} />}
    </div>
  );
}
