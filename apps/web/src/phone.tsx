// Phone calls on the phone, iPad and Android client (D189, D193; design/phone.md): the call's Go
// card, a question from the line, the live call row and its result on On hand, and in Settings ›
// Accounts the offer, the device sign-in (code, link, waiting, the end) and the phone card (the
// day's cap, the rails, your voice). Only shared controls (controls.tsx); words from i18n-phone.ts.
import type { CallPlan, CallView, ConnectionView, SignInView } from "@ducter/protocol";
import { callEnded, prettyNumber, TUWA_MCP } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, DangerButton, Seg, Toggle } from "./controls.tsx";
import type { DecisionState } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
export { TUWA_MCP };
const money = (n: number) => `$${n.toFixed(2)}`;

/** The time a call dials, in the owner's own clock (and a word for the day). */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString(A.L.lang === "zh" ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" });
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString() === d.toDateString();
  const today = now.toDateString() === d.toDateString();
  return today ? hm : tomorrow ? t("call.tomorrow", hm) : `${d.toLocaleDateString(A.L.lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })} ${hm}`;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** The call's art: the clay phone; grey while it isn't connected. */
export const CallArt = ({ off, size = 72 }: { off?: boolean; size?: number }) => <img class="call-art" src={`app/art/${off ? "ab_call_locked" : "ab_call"}.webp`} width={size} height={size} alt="" draggable={false} />;

// ---------- the Go card ----------

function PlanRows({ p }: { p: CallPlan }) {
  const rows: [string, string][] = [
    [t("call.row.number"), prettyNumber(p.to)],
    [t("call.row.goal"), p.goal],
    ...(p.say.length ? [[t("call.row.say"), p.say.join(t("acct.sep"))] as [string, string]] : []),
    ...(p.keep ? [[t("call.row.keep"), p.keep] as [string, string]] : []),
    [t("call.row.voice"), t(p.voice === "owner" ? "call.voice.owner" : "call.voice.ducter")],
    [t("call.row.from"), t("call.from.provider", p.provider)],
    [t("call.row.about"), t("call.about", p.minutes, money(p.costUsd))],
    [t("call.row.when"), p.at ? t("call.when.at", when(p.at)) : t("call.when.now")],
  ];
  return (
    <dl class="call-plan">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function GoCard({ d }: { d: DecisionState }) {
  const p = d.call!.plan;
  const [fold, setFold] = useState(false);
  const open = !d.resolved && !d.pending;
  const draft = A.replyDraft.get(d.decisionId) ?? "";
  return (
    <div class="call-card">
      <div class="call-head">
        <CallArt size={56} />
        <div class="q">{d.question}</div>
      </div>
      {p && <PlanRows p={p} />}
      <div class="small sub call-open">{t("call.opens", A.S.personaName)}</div>
      {p?.note && <div class="small warn">{p.note}</div>}
      {p?.summary && (
        <>
          <Btn kind="text" size="sm" expanded={fold} label={`${t("call.summary", p.provider)} ${fold ? "‹" : "›"}`} onClick={() => setFold(!fold)} />
          {fold && <div class="call-summary small">{p.summary}</div>}
        </>
      )}
      {open ? (
        <>
          <div class="btns decide">
            <Btn kind="text" label={t("decision.reply")} about={d.question} onClick={() => (A.replyOpen.has(d.decisionId) ? A.replyOpen.delete(d.decisionId) : A.replyOpen.add(d.decisionId), A.changed())} />
            <span class="pair">
              <Btn kind="secondary" label={t("call.hold")} about={d.question} onClick={() => A.decide(d.decisionId, "hold")} />
              <Btn kind="primary" label={d.goLabel} about={d.question} onClick={() => A.decide(d.decisionId, "go")} />
            </span>
          </div>
          {A.replyOpen.has(d.decisionId) && (
            <form class="call-reply" onSubmit={(e) => (e.preventDefault(), draft.trim() && (A.decide(d.decisionId, "reply", draft.trim()), A.replyDraft.delete(d.decisionId)))}>
              <input type="text" value={draft} placeholder={t("call.reply.change")} aria-label={t("call.reply.change")} onInput={(e) => (A.replyDraft.set(d.decisionId, (e.target as HTMLInputElement).value), A.changed())} />
              <Btn kind="accent" size="sm" label={t("composer.send")} disabled={!draft.trim()} onClick={() => draft.trim() && (A.decide(d.decisionId, "reply", draft.trim()), A.replyDraft.delete(d.decisionId))} />
            </form>
          )}
        </>
      ) : (
        <div class="resolved small" role="status">
          {d.resolved?.option === "go" ? t("call.went") : d.resolved?.option === "hold" ? t("call.held") : t("call.replied")}
        </div>
      )}
    </div>
  );
}

// ---------- a question from the line ----------

function QuestionCard({ d }: { d: DecisionState }) {
  const open = !d.resolved && !d.pending;
  const draft = A.replyDraft.get(d.decisionId) ?? "";
  const send = (text: string) => (A.decide(d.decisionId, "reply", text), A.replyDraft.delete(d.decisionId));
  const c = A.S.onHand?.calls?.find((x) => x.callId === d.call!.callId);
  return (
    <div class={`call-card question${open ? " ringing" : ""}`}>
      <div class="call-q-head">
        <span class="dot" aria-hidden="true" />
        {t("call.asking")}
        {c && <span class="sub"> · {c.plan.name}</span>}
      </div>
      <div class="q">{d.question}</div>
      {open ? (
        <>
          <div class="call-choices">
            {d.call!.yesNo ? (
              <>
                <Btn kind="secondary" label={t("call.no")} about={d.question} onClick={() => send("no")} />
                <Btn kind="primary" label={t("call.yes")} about={d.question} onClick={() => send("yes")} />
              </>
            ) : (
              (d.call!.choices ?? []).map((ch) => <Btn key={ch} kind="secondary" label={ch} about={d.question} onClick={() => send(ch)} />)
            )}
          </div>
          <form class="call-reply" onSubmit={(e) => (e.preventDefault(), draft.trim() && send(draft.trim()))}>
            <input type="text" value={draft} placeholder={t("call.reply.say")} aria-label={t("call.reply.say")} onInput={(e) => (A.replyDraft.set(d.decisionId, (e.target as HTMLInputElement).value), A.changed())} />
            <Btn kind="accent" size="sm" label={t("composer.send")} disabled={!draft.trim()} onClick={() => draft.trim() && send(draft.trim())} />
          </form>
          <div class="small sub">{t("call.waiting.line")}</div>
        </>
      ) : (
        <div class="resolved small" role="status">
          {d.resolved?.by === "default" ? t("call.q.fallback") : t("call.q.passed", d.resolved?.text === "yes" ? t("call.yes") : d.resolved?.text === "no" ? t("call.no") : (d.resolved?.text ?? ""))}
        </div>
      )}
    </div>
  );
}

/** A decision about a call: its Go card, or a question from the line. */
export function CallDecision({ d }: { d: DecisionState }) {
  return d.call?.kind === "question" ? <QuestionCard d={d} /> : <GoCard d={d} />;
}

// ---------- On hand: the live row and the result ----------

const failWords = (c: CallView) => t(`call.fail.${c.reason ?? "provider"}`, c.plan.provider);

export function callLine(c: CallView): string {
  const n = c.plan.name;
  switch (c.state) {
    case "needs_go":
      return t("call.st.needs_go", n);
    case "waiting":
      return t("call.st.waiting", c.plan.at ? when(c.plan.at) : t("call.when.soon"), n);
    case "calling":
      return t("call.st.calling", n);
    case "talking":
      return t("call.st.talking", n, c.talkingSince ? mmss((Date.now() - Date.parse(c.talkingSince)) / 1000) : "");
    case "question":
      return t("call.st.question", n);
    default:
      return t(`call.st.${c.state}`, n);
  }
}

function Result({ c }: { c: CallView }) {
  const [lines, setLines] = useState(false);
  return (
    <div class="call-result">
      {c.summary && <p class="small">{c.summary}</p>}
      {!!c.agreed?.length && (
        <ul class="small">
          {c.agreed.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {!!c.transcript?.length && (
        <>
          <Btn kind="text" size="sm" expanded={lines} label={`${t("call.transcript")} ${lines ? "‹" : "›"}`} onClick={() => setLines(!lines)} />
          {lines && (
            <div class="call-lines small">
              {c.transcript.map((l, i) => (
                <div key={i}>
                  <b>{l.who === "them" ? t("call.them") : A.S.personaName}</b> {l.text}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {(c.durationSec !== undefined || c.costUsd !== undefined) && <div class="small sub">{[c.durationSec !== undefined ? t("call.length", Math.floor(c.durationSec / 60), Math.round(c.durationSec % 60)) : "", c.costUsd !== undefined ? money(c.costUsd) : ""].filter(Boolean).join(" · ")}</div>}
    </div>
  );
}

export function CallRow({ c }: { c: CallView }) {
  const [open, setOpen] = useState(false);
  const ended = callEnded(c.state);
  const live = ["calling", "talking", "question"].includes(c.state);
  return (
    <div class={`bcard call-row ${c.state}`}>
      <button class="call-row-top" disabled={!ended} aria-expanded={ended ? open : undefined} onClick={() => setOpen(!open)}>
        <CallArt size={36} off={c.state === "failed" || c.state === "cancelled"} />
        <span class="grow">
          <span class="t">{callLine(c)}</span>
          {c.state === "done" || c.state === "uncertain" ? c.outcome && <span class="s">{c.outcome}</span> : c.state === "failed" ? <span class="s warn">{failWords(c)}</span> : live && <span class="s">{prettyNumber(c.plan.to)}</span>}
        </span>
        {live && <span class="call-live" aria-hidden="true" />}
      </button>
      {c.state === "failed" && c.payUrl && <Btn kind="text" size="sm" label={t("call.pay", c.plan.provider)} onClick={() => window.open(c.payUrl, "_blank", "noopener")} />}
      {(live || c.state === "waiting") && <Btn kind="text" size="sm" label={t(live ? "call.hangup" : "call.cancel")} about={c.plan.name} onClick={() => A.callCancel(c.callId)} />}
      {ended && open && <Result c={c} />}
    </div>
  );
}

// ---------- Settings › Accounts ----------

/** 打电话 / Make calls: the offer, when no calling connection is there yet. */
export function PhoneOffer() {
  const s = A.signIn;
  if (s && (s.state === "waiting" || s.url === TUWA_MCP)) return <SignInPanel s={s} />;
  return (
    <section id="acct-phone" class="src-card phone-offer" aria-label={t("call.offer.title")}>
      <div class="src-who">
        <CallArt off size={96} />
        <h3>{t("call.offer.title")}</h3>
        <div class="small sub">{t("call.offer.lede")}</div>
      </div>
      <div class="phone-acts">
        <Btn kind="primary" label={A.connecting ? t("acct.checking") : t("call.offer.go")} disabled={A.connecting} onClick={() => A.addConnection(TUWA_MCP, "")} />
      </div>
      <div class="small sub">{t("call.offer.how")}</div>
    </section>
  );
}

function Qr({ rows }: { rows: string[] }) {
  const n = rows.length;
  return (
    <svg class="call-qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} width="168" height="168" role="img" aria-label={t("call.signin.qr")}>
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      {rows.flatMap((r, y) => [...r].map((v, x) => (v === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill="#1d1a16" /> : null)))}
    </svg>
  );
}

/** The device sign-in (RFC 8628): the code and the link, waiting, then how it ended. */
export function SignInPanel({ s }: { s: SignInView }) {
  const waiting = s.state === "waiting";
  const mins = s.expiresAt ? Math.max(1, Math.round((Date.parse(s.expiresAt) - Date.now()) / 60_000)) : undefined;
  return (
    <section id="acct-phone" class="src-card signin-card" aria-label={t("call.signin.title", s.name)} aria-live="polite">
      <div class="src-who">
        <CallArt off={!waiting && s.state !== "done"} size={72} />
        <h3>{t(s.reconnect ? "call.signin.again" : "call.signin.title", s.name)}</h3>
      </div>
      {waiting ? (
        <>
          <div class="small">{t("call.signin.how")}</div>
          <div class="signin-code" aria-label={t("call.signin.code")}>
            {s.userCode}
          </div>
          {s.qr && <Qr rows={s.qr} />}
          <div class="phone-acts">
            <Btn kind="primary" label={t("call.signin.open", s.name)} onClick={() => window.open(s.verifyUrlComplete ?? s.verifyUrl, "_blank", "noopener")} />
          </div>
          <div class="signin-wait small sub">
            <span class="pulse" aria-hidden="true" />
            {t("call.signin.waiting")}
            {mins && ` · ${t("call.signin.valid", mins)}`}
          </div>
          <Btn kind="text" size="sm" label={t("call.signin.cancel")} onClick={() => A.cancelSignIn()} />
        </>
      ) : (
        <>
          <div class={`small ${s.state === "done" ? "" : "warn"}`}>{t(`call.signin.${s.state}`, s.name)}</div>
          {s.state !== "done" && (
            <div class="phone-acts">
              <Btn kind="secondary" label={t("call.signin.retry")} onClick={() => (s.reconnect && s.id ? A.reauth(s.id) : A.addConnection(s.url, ""))} />
              <Btn kind="text" label={t("call.signin.cancel")} onClick={() => ((A.signIn = undefined), A.changed())} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The phone card: a calling connection, its day, its rails, and your voice. */
export function PhoneCard({ c }: { c: ConnectionView }) {
  const p = c.phone!;
  const [stopping, setStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const out = c.state === "unauthorized";
  const v = p.voice;
  const name = t("call.card.title", p.provider);
  if (A.signIn?.reconnect && A.signIn.id === c.id && A.signIn.state === "waiting") return <SignInPanel s={A.signIn} />;
  return (
    <section id="acct-phone" class="src-card phone-card" aria-label={name}>
      <div class="src-who">
        <CallArt off={out} size={96} />
        <h3>{name}</h3>
        <div class={`small ${out ? "warn" : "sub"}`}>{out ? t("call.card.out", p.provider) : t("call.card.ok")}</div>
        {out && <Btn kind="secondary" size="sm" label={t("call.card.signin")} onClick={() => A.reauth(c.id)} />}
      </div>
      <div class="phone-day small">{t("call.card.today", p.calls, money(p.spentTodayUsd))}</div>
      <div class="small sub">{t("call.card.rails")}</div>
      <div class="phone-cap">
        <h4>{t("call.card.cap")}</h4>
        <Seg<number> label={t("call.card.cap")} value={[5, 10, 20, 50].includes(p.capUsd) ? p.capUsd : undefined} options={[5, 10, 20, 50].map((n) => ({ v: n, label: `$${n}` }))} onPick={(n) => A.phoneCap(n)} />
        <div class="small sub">{t("call.card.cap.help")}</div>
      </div>
      {p.rails && <div class="small sub">{[p.rails.sampling ? t("call.card.sampling") : "", p.rails.shared ? t("call.card.shared") : ""].filter(Boolean).join(" · ")}</div>}
      <div class="phone-voice">
        <h4>{t("call.voice.title")}</h4>
        {v?.enrolled ? (
          <>
            <Toggle label={t("call.voice.use")} help={t("call.voice.use.help")} checked={v.on} onChange={(on) => A.phoneVoice(on ? "on" : "off")} />
            {!deleting ? (
              <DangerButton label={t("call.voice.delete")} onClick={() => setDeleting(true)} />
            ) : (
              <div class="stop-ask" role="group">
                <div class="small">{t("call.voice.delete.ask", p.provider)}</div>
                <div class="acts">
                  <Btn kind="text" size="sm" label={t("card.stop.keep")} onClick={() => setDeleting(false)} />
                  <DangerButton label={t("call.voice.delete.go")} onClick={() => (setDeleting(false), A.phoneVoice("delete"))} />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div class="small">{t("call.voice.none")}</div>
            <div class="phone-acts">
              <Btn kind="secondary" size="sm" label={`${t("call.voice.record", p.provider)} ›`} onClick={() => A.phoneVoice("record")} />
              <Btn kind="text" size="sm" label={t("call.voice.done")} onClick={() => A.phoneVoice("refresh")} />
            </div>
          </>
        )}
        <div class="small sub">{t("call.voice.consent", p.provider)}</div>
        {A.voiceAnswer && <div class="small warn">{A.voiceAnswer}</div>}
      </div>
      <div class="src-foot">
        {!stopping ? (
          <DangerButton label={t("call.card.stop", p.provider)} onClick={() => setStopping(true)} />
        ) : (
          <div class="stop-ask" role="group">
            <div class="small">{t("call.card.stop.ask")}</div>
            <div class="acts">
              <Btn kind="text" size="sm" label={t("card.stop.keep")} onClick={() => setStopping(false)} />
              <DangerButton label={t("card.stop.go")} onClick={() => (setStopping(false), A.removeConnection(c.id))} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
