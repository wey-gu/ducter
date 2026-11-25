// 设置 › 聊天软件 / Settings › Chat apps (D276, design/channels.md §6): connect the person's own
// Telegram bot and Slack app, link their account with a one-time code, see who is linked, unlink.
// A token goes to the home once, in channel_connect, and never comes back.
//
// D283: D273's grid. Each chat app is one raised group whose first row is the app itself (its letter
// pebble, its name, how it stands), never a title repeated above it; a setup is a short guided path,
// a step mark in the tile column and one sentence beside it; Connect is the group's one primary at
// the right edge of its last line, its privacy note on the left. iMessage is the third group: it
// goes through a Mac, so here it only says where to set it up.
//
// D301: WeChat, through WeChat's own ClawBot. Connect puts up a QR; the person scans it with their
// own WeChat and confirms on the phone, and that scan is the link (no code). Its group says plainly
// what WeChat allows: it answers inside a day of their words, a few messages, no buttons.
import type { ChannelKind, ChannelServerFrame, ChannelView } from "@ducter/protocol";
import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandTile } from "./brand.tsx";
import { Btn, DangerButton, How, LinkBtn } from "./controls.tsx";
import { keepClauses } from "./format.ts";
import { Qr } from "./phone.tsx";
import { GConfirm, Said, say, Waiting } from "./set-grid.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Frame = Extract<ChannelServerFrame, { t: "channels" }>;
type Result = Extract<ChannelServerFrame, { t: "channel_result" }>;

/** What this page knows; the home's frames keep it current. */
const S: { frame?: Frame; busy: Partial<Record<ChannelKind, boolean>>; bad: Partial<Record<ChannelKind, Result["reason"]>>; code: Partial<Record<ChannelKind, Result>>; open: Partial<Record<ChannelKind, boolean>> } = { busy: {}, bad: {}, code: {}, open: {} };

/**
 * D404: a chat app's state as last seen on this page, so the moment it becomes linked is answered once,
 * in the partner's voice (the first connection is the moment that earns it), and never on opening the page.
 */
const was: Partial<Record<ChannelKind, ChannelView["state"]>> = {};
export function chatLinkedNow(prev: ChannelView["state"] | undefined, next: ChannelView["state"]): boolean {
  return prev !== undefined && prev !== "linked" && next === "linked";
}

/**
 * D365 (as D337's own number): an app never connected rests as its first row with 设置 / Set up and
 * its one note, until the person opens its steps. A refused key or a connect on its way keeps them.
 */
const resting = (v: ChannelView) => v.state === "off" && !v.reason && !S.open[v.kind] && !S.bad[v.kind] && !S.busy[v.kind];

function Resting(p: { v: ChannelView; name: string; line: string; tone?: string; note: string }) {
  return (
    <section class="set-card chat-app" aria-label={p.name}>
      <Head kind={p.v.kind} name={p.name} line={p.line} tone={p.tone}>
        <Btn kind="secondary" size="sm" label={t("own.setup")} about={p.name} onClick={() => ((S.open[p.v.kind] = true), A.changed())} />
      </Head>
      <Foot note={p.note} />
    </section>
  );
}

A.onChannelFrame = (f) => {
  if (f.t === "channels") {
    S.frame = f;
    // A linked account needs no code any more.
    for (const v of f.channels) if (v.state !== "unlinked") delete S.code[v.kind];
    for (const v of f.channels) {
      if (chatLinkedNow(was[v.kind], v.state)) say(`chat:${v.kind}`, t("said.chats.linked", nameOf(v.kind)));
      was[v.kind] = v.state;
    }
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

/** A chat app's name: Telegram and Slack are theirs in every language; WeChat's is 微信 in Chinese. */
const nameOf = (kind: ChannelKind) => (kind === "wechat" ? t("chats.wechat") : kind === "slack" ? "Slack" : "Telegram");
const BOTFATHER = "https://t.me/BotFather";
const SLACK_APPS = "https://api.slack.com/apps?new_app=1";
/** D531: the partner's face, as Slack shows it per message; the same PNG to upload as the app's icon. */
const faceOf = () => `https://ducter.ai/faces/${A.partners?.find((p) => p.id === "default")?.look ?? "sand"}.png`;

export function ChatAppsSettings() {
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "channels" });
  }, [A.S.welcomed]);
  const f = S.frame;
  // D500: the apps in use first, then those resting until chosen; the order is set when the page
  // opens, so an app being set up never jumps under the person.
  const order = useRef<string[]>([]);
  if (!f) return <Waiting text={t("conn.connecting")} />;
  const apps = chatOrder(f.channels, order.current);
  order.current = apps.map((v) => v.kind);
  return (
    <>
      <p class="small lede-note">{t("chats.goes")}</p>
      <How about={t("chats.goes")} detail={t("chats.goes.how")} />
      {apps.map((v) => (
        <Fragment key={v.kind}>
          {v.kind === "wechat" ? <WechatCard v={v} /> : <ChannelCard v={v} manifest={f.slackManifest} />}
          <Said k={`chat:${v.kind}`} />
        </Fragment>
      ))}
      <IMessageCard frame={f} />
    </>
  );
}

/** D500: the apps in the order held (an app new to the list re-orders all), else in use first. */
export function chatOrder(vs: ChannelView[], held: readonly string[]): ChannelView[] {
  const has = (k: string) => vs.some((v) => v.kind === k);
  if (held.length === vs.length && held.every(has)) return held.map((k) => vs.find((v) => v.kind === k)!);
  return [...vs.filter((v) => v.state !== "off"), ...vs.filter((v) => v.state === "off")];
}

/**
 * iMessage goes through a Mac. D323: the home says which Mac carries it now; then it is on there,
 * else this page only says where to set it up (the steps and their checks are on the Mac).
 */
export function IMessageCard(p: { frame: Frame }) {
  const at = p.frame.imessage?.find((m) => m.state === "on");
  const mac = at ? at.computer || t("chats.im.another") : "";
  return (
    <section class="set-card chat-app" aria-label="iMessage">
      <Head kind="imessage" name="iMessage" line={at ? t("chats.im.on", mac) : t("chats.im.mac")} tone={at ? "done" : undefined} />
      <Foot note={at ? t("chats.im.on.note", mac) : t("chats.im.mac.note")} />
    </section>
  );
}

export function stateLine(v: ChannelView): [string, string] {
  if (v.state === "linked") return [t("chats.state.linked", botLine(v)), "done"];
  if (v.state === "cant_connect") {
    const r = v.reason ?? "network";
    if (r === "token") return [t("chats.cant.key", nameOf(v.kind)), "bad"];
    return [r === "network" ? t("chats.cant.network", nameOf(v.kind)) : t(`chats.cant.${r}`), "bad"];
  }
  if (v.state === "unlinked") return [t("chats.state.unlinked"), "ink"];
  return [t(v.state === "starting" ? "chats.state.starting" : "chats.state.off"), ""];
}

/** The partner's own bot there: @handle on Telegram, the workspace on Slack, else its name. */
function botLine(v: ChannelView): string {
  if (!v.bot) return nameOf(v.kind);
  return v.bot.handle ? `@${v.bot.handle}` : v.bot.team || v.bot.name;
}

/** A chat app's first row: the app's own mark on the small white clay tile (D314), its name, how it stands. */
function Head(p: { kind: string; name: string; line: string; tone?: string; children?: ComponentChildren }) {
  return (
    <div class="chat-head">
      <BrandTile name={p.kind} />
      <span class="grow">
        <b>{p.name}</b>
        <small class={p.tone ? `tone-${p.tone}` : undefined}>{p.line}</small>
      </span>
      {p.children}
    </div>
  );
}

/** A row on the text column: a title, one muted line, its control at the right edge. */
function Row(p: { title: string; line?: string; how?: string; children?: ComponentChildren }) {
  return (
    <div class="chat-row">
      <span class="grow">
        <b>{p.title}</b>
        {p.line && <small>{p.line}</small>}
        {p.how && <How about={p.title} detail={p.how} />}
      </span>
      {p.children}
    </div>
  );
}

/** A group's last line: its one quiet note, its button at the right edge. */
function Foot(p: { note: string; children?: ComponentChildren }) {
  return (
    <div class="chat-foot">
      {/* D583: kept as GRow's lines are (keepClauses): at 390 Slack's 「。」 stood alone on a line. */}
      <small class="grow">{keepClauses(p.note)}</small>
      {p.children}
    </div>
  );
}

/**
 * D399: 断开 asks in place, as on the Mac (D289): a disconnect throws the key away, and getting it
 * back means the steps again.
 */
function ForgetFoot(p: { kind: ChannelKind; name: string; note: string; label: string; children?: ComponentChildren }) {
  const [asking, setAsking] = useState(false);
  if (asking)
    return <GConfirm ask={t("chats.forget.ask", p.name)} keep={t("card.stop.keep")} go={p.label} about={p.name} onKeep={() => setAsking(false)} onGo={() => (setAsking(false), A.send({ t: "channel_forget", kind: p.kind }), say(`chat:${p.kind}`, t("said.chats.off", p.name)))} />;
  // D583: the link's quiet actions are one group, as a connection's on Accounts (看看我读了什么 and
  // 停用 OOMOL): they share a line when they fit, on a phone too, the destructive one last.
  return (
    <Foot note={p.note}>
      <span class="g-acts">
        {p.children}
        <DangerButton label={p.label} about={p.name} quiet onClick={() => setAsking(true)} />
      </span>
    </Foot>
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
  const name = nameOf(v.kind);
  const needsTokens = v.state === "off" || (v.state === "cant_connect" && v.reason === "token");
  const stranger = v.strangerAt && Date.now() - Date.parse(v.strangerAt) < 24 * 3600_000;
  const [line, tone] = stateLine(v);
  const who = t(v.kind === "telegram" ? "chats.tg.who" : "chats.sl.who");
  if (resting(v)) return <Resting v={v} name={name} line={line} tone={tone} note={who} />;
  return (
    <section class="set-card chat-app" aria-label={name}>
      <Head kind={v.kind} name={name} line={line} tone={tone} />
      {stranger && <Row title={t("chats.stranger", name, A.S.personaName)} />}
      {needsTokens ? (
        <Connect kind={v.kind} manifest={manifest} who={who} />
      ) : (
        <>
          {v.reinstall && <Reinstall manifest={manifest} />}
          {v.state === "unlinked" && <Link v={v} />}
          {v.state === "linked" && (
            <Row title={t("chats.linked.who", v.linked?.name ?? "")} line={v.kind === "slack" ? t("chats.sl.linked.goes") : t("chats.linked.goes", name)} />
          )}
          <ForgetFoot kind={v.kind} name={name} note={who} label={t("chats.forget", name)}>
            {v.state === "linked" && <Btn kind="text" size="sm" label={t("chats.unlink")} about={name} onClick={() => A.send({ t: "channel_unlink", kind: v.kind })} />}
          </ForgetFoot>
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
              <small class="chat-have">{t("chats.tg.step1.have")}</small>
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
                <LinkBtn kind="text" size="sm" href={faceOf()} label={t("chats.sl.face")} />
              </span>
              <small class="chat-have">{t("chats.sl.step2.face")}</small>
            </Step>
            <Step n={3} text={t("chats.sl.step3")}>
              <Field id="ch-slack-a" label={t("chats.sl.bot")} placeholder="xoxb-…" value={token} onInput={setToken} wrong={bad === "token"} />
              <small class="chat-have">{t("chats.sl.step3.skip")}</small>
            </Step>
            <Step n={4} text={t("chats.sl.step4")}>
              <Field id="ch-slack-b" label={t("chats.sl.app")} placeholder="xapp-…" value={app} onInput={setApp} wrong={bad === "token"} />
            </Step>
          </>
        )}
        {bad && <li class="chat-bad">{t(bad === "token" ? "chats.bad.key" : "chats.bad.network")}</li>}
      </ol>
      <Foot note={who}>
        <Btn kind="primary" label={t(busy ? "chats.connecting" : "chats.connect")} about={nameOf(kind)} disabled={busy || !ready} onClick={go} />
      </Foot>
    </>
  );
}

function Link({ v }: { v: ChannelView }) {
  const c = S.code[v.kind];
  const live = c?.expiresAt && Date.parse(c.expiresAt) > Date.now();
  const name = nameOf(v.kind);
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
            <p>{t(c.link ? "chats.tg.code" : "chats.tg.code.only")}</p>
            <code class="chat-chip">/start {c.code}</code>
          </>
        ) : (
          <>
            <p>{t("chats.sl.code", v.bot?.name || A.S.personaName)}</p>
            <b class="chats-code">{c.code}</b>
            <small>{t("chats.sl.find", v.bot?.name || A.S.personaName)}</small>
          </>
        )}
        <small>{t("chats.code.ttl")}</small>
      </span>
      {c.link && <LinkBtn kind="primary" href={c.link} label={t(v.kind === "telegram" ? "chats.tg.open" : "chats.sl.open.dm")} />}
    </div>
  );
}

/** D531: an app made before the current manifest: one plain line, the new manifest one press away. */
function Reinstall({ manifest }: { manifest: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Row title={t("chats.sl.re.title")} line={t("chats.sl.re.how")}>
      <Btn kind="secondary" size="sm" label={t(copied ? "chats.sl.copied" : "chats.sl.copy")} about="Slack" onClick={() => void navigator.clipboard?.writeText(manifest).then(() => setCopied(true))} />
    </Row>
  );
}

// ---------- D301: WeChat, through WeChat's own ClawBot ----------

function wechatLine(v: ChannelView): [string, string] {
  if (v.state === "scan") return [t(v.scan?.step === "scanned" ? "chats.wx.state.scanned" : v.scan?.step === "verify" ? "chats.wx.state.verify" : "chats.wx.state.scan"), "ink"];
  if (v.state === "linked") return [t("chats.wx.state.linked"), "done"];
  if (v.state === "starting") return [t("chats.state.starting"), ""];
  if (v.state === "cant_connect") return [v.reason === "token" ? t("chats.wx.cant.key") : t("chats.cant.network", t("chats.wechat")), "bad"];
  if (v.reason === "expired" || v.reason === "unavailable") return [t(`chats.wx.${v.reason}`), "bad"];
  return [t("chats.wx.off"), ""];
}

function WechatCard({ v }: { v: ChannelView }) {
  const name = t("chats.wechat");
  const [line, tone] = wechatLine(v);
  const busy = S.busy.wechat;
  const again = v.state === "off" || (v.state === "cant_connect" && v.reason === "token");
  const connect = () => {
    S.busy.wechat = true;
    A.send({ t: "channel_connect", kind: "wechat" });
    A.changed();
  };
  const open = v.openUntil ? Date.parse(v.openUntil) > Date.now() : false;
  if (resting(v)) return <Resting v={v} name={name} line={line} tone={tone} note={t("chats.wx.who")} />;
  return (
    <section class="set-card chat-app" aria-label={name}>
      <Head kind="wechat" name={name} line={line} tone={tone} />
      {again && (
        <>
          <ol class="chat-steps">
            <Step n={1} text={t("chats.wx.step1")} />
            <Step n={2} text={t("chats.wx.step2")} />
            {S.bad.wechat === "network" && <li class="chat-bad">{t("chats.bad.network")}</li>}
          </ol>
          <Foot note={t("chats.wx.who")}>
            <Btn kind="primary" label={t(busy ? "chats.connecting" : "chats.connect")} about={name} disabled={busy} onClick={connect} />
          </Foot>
        </>
      )}
      {v.state === "scan" && v.scan && <WechatScan v={v} />}
      {(v.state === "linked" || v.state === "starting" || (v.state === "cant_connect" && v.reason !== "token")) && (
        <>
          {v.state === "linked" && <Row title={t("chats.wx.linked")} line={t("chats.linked.goes", name)} />}
          {v.state === "linked" && <Row title={t(open ? "chats.wx.open" : "chats.wx.closed")} line={t("chats.wx.rule")} how={t("chats.wx.rule.how")} />}
          <ForgetFoot kind="wechat" name={name} note={t("chats.wx.who")} label={t("chats.wx.forget")} />
        </>
      )}
    </section>
  );
}

function WechatScan({ v }: { v: ChannelView }) {
  const s = v.scan!;
  const [code, setCode] = useState("");
  return (
    <>
      <div class="chat-row chat-scan">
        <span class="grow">
          <p>{t("chats.wx.scan")}</p>
          <small>{t("chats.wx.scan.phone")}</small>
          {s.step === "verify" && (
            <span class="chat-verify">
              <label class="acct-field chat-field" for="ch-wechat-verify">
                <span>{t("chats.wx.verify")}</span>
                <input id="ch-wechat-verify" inputMode="numeric" autocomplete="one-time-code" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
              </label>
              <Btn kind="primary" size="sm" label={t("chats.wx.verify.go")} disabled={!code.trim()} onClick={() => (A.send({ t: "channel_connect", kind: "wechat", verifyCode: code.trim() }), setCode(""))} />
            </span>
          )}
        </span>
        <span class={`chat-qr${s.step === "scanned" ? " scanned" : ""}`}>
          <Qr rows={s.qr} label={t("chats.wx.scan")} />
        </span>
      </div>
      <Foot note={t("chats.wx.who")}>
        <Btn kind="text" size="sm" label={t("chats.wx.cancel")} about={t("chats.wechat")} onClick={() => A.send({ t: "channel_forget", kind: "wechat" })} />
      </Foot>
    </>
  );
}

/** D469: the chat apps the partner can be found in now (Settings' brief), asked for once. */
let chatsAsked = false;
export function linkedChats(): string[] {
  if (!S.frame) {
    if (!chatsAsked && A.S.welcomed) (chatsAsked = true), A.send({ t: "channels" });
    return [];
  }
  return S.frame.channels.filter((v) => v.state === "linked").map((v) => nameOf(v.kind));
}
