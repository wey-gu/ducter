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

/** A drawn ✓ in muted ink (D73: marks are glyphs, never tiles). */
const Check = () => (
  <svg class="call-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2.5 7.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** The call's art: the clay phone; grey while it isn't connected. */
export const CallArt = ({ off, size = 72 }: { off?: boolean; size?: number }) => <img class="call-art" src={`app/art/${off ? "ab_call_locked" : "ab_call"}.webp`} width={size} height={size} alt="" draggable={false} />;

// ---------- the Go card ----------

/** D208: why it isn't now, in plain words (the callee's clock, or the owner's quiet hours). */
export const waitWords = (p: CallPlan) => (p.wait ? (p.wait.why === "quiet" ? t("call.wait.quiet") : t(`call.wait.${p.wait.why}`, p.wait.their, p.wait.then)) : "");

function PlanRows({ p, now }: { p: CallPlan; now?: () => void }) {
  const rows: [string, string][] = [
    [t("call.row.number"), prettyNumber(p.to)],
    [t("call.row.goal"), p.goal],
    ...(p.say.length ? [[t("call.row.say"), p.say.join(t("acct.sep"))] as [string, string]] : []),
    ...(p.keep ? [[t("call.row.keep"), p.keep] as [string, string]] : []),
    ...(p.mustNot.length ? [[t("call.row.mustnot"), p.mustNot.join(t("acct.sep"))] as [string, string]] : []),
    [t("call.row.voice"), t(p.voice === "owner" ? "call.voice.owner" : "call.voice.ducter")],
    [t("call.row.from"), t("call.from.provider", p.provider)],
    [t("call.row.about"), t("call.about", p.minutes, money(p.costUsd))],
  ];
  return (
    <dl class="call-plan">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      <div class="when">
        <dt>{t("call.row.when")}</dt>
        <dd>
          <span class="v">{p.at ? t("call.when.at", when(p.at)) : t("call.when.now")}</span>
          {p.wait && <span class="why">{waitWords(p)}</span>}
          {p.canNow && now && <Btn kind="secondary" size="sm" label={t("call.now")} about={p.name} onClick={now} />}
        </dd>
      </div>
    </dl>
  );
}

const SUMMARY_KEYS: [RegExp, string][] = [
  [/^to$/i, "call.row.number"],
  [/^goal$/i, "call.row.goal"],
  [/^may (tell( them)?|share|say)$/i, "call.row.say"],
  [/^private$/i, "call.row.keep"],
  [/^scope$/i, "call.row.scope"],
  [/^must ?not$/i, "call.row.mustnot"],
  [/^when\b/i, "call.row.when"],
  [/^(calling )?from$/i, "call.row.from"],
  [/^voice$/i, "call.row.voice"],
];

/** The provider's own approval text as label / value lines (labels in the owner's words, values as written), or undefined when it isn't such lines. */
export function summaryRows(s: string): [string, string][] | undefined {
  const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => /^([A-Za-z][A-Za-z ()]{1,30}):\s*(.+)$/.exec(l));
  if (lines.length < 2 || rows.some((m) => !m)) return undefined;
  return rows.map((m) => {
    const key = m![1]!.trim();
    const hit = SUMMARY_KEYS.find(([re]) => re.test(key));
    const utc = /utc/i.test(key) && hit?.[1] === "call.row.when" ? " (UTC)" : "";
    return [hit ? `${t(hit[1])}${utc}` : key, m![2]!.trim()];
  });
}

function Summary({ p }: { p: CallPlan }) {
  const rows = summaryRows(p.summary ?? "");
  return rows ? (
    <dl class="call-summary small" lang="en">
      {rows.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <div class="call-summary small" lang="en">
      {p.summary}
    </div>
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
      {p && <PlanRows p={p} now={open ? () => A.callNow(d.decisionId, d.call!.callId) : undefined} />}
      <div class="small sub call-open">{t("call.opens", A.S.personaName)}</div>
      {p?.note && <div class="small warn">{p.note}</div>}
      {p?.summary && (
        <>
          <Btn kind="text" size="sm" expanded={fold} label={`${t("call.summary", p.provider)} ${fold ? "‹" : "›"}`} onClick={() => setFold(!fold)} />
          {fold && <Summary p={p} />}
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
          {d.resolved?.option === "go" ? t(d.resolved.now ? "call.went.now" : p?.at ? "call.went.then" : "call.went") : d.resolved?.option === "hold" ? t("call.held") : t("call.replied")}
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

/** The provider's own words for a failure, when it gave any (Ducter's stand-ins for "none" aren't words). */
const providerWords = (c: CallView) => (c.error && !/^the provider (gave|answered)|^no reason/i.test(c.error) ? c.error : "");

/** D208: why it failed, in the owner's words; the provider's own words after a colon when it gave them. */
export function failWords(c: CallView): string {
  const r = c.reason ?? "provider";
  const said = providerWords(c);
  if (r === "provider" || r === "call_failed") return said ? t(`call.fail.${r}.said`, said) : t(`call.fail.${r}`);
  return t(`call.fail.${r}`, c.plan.provider);
}

/** The row's second line: why it waits, what answered, why it failed, or the outcome as reported. */
export function callSub(c: CallView): { text: string; warn?: boolean } | undefined {
  const hint = c.hint === "screening" ? t("call.hint.screening") : "";
  switch (c.state) {
    case "waiting":
      return c.plan.wait ? { text: c.plan.wait.why === "quiet" ? t("call.waits.quiet") : t("call.waits.callee", c.plan.wait.then) } : undefined;
    case "automated":
      return { text: hint || t("call.automated") };
    case "no_answer":
      return hint ? { text: hint } : undefined;
    case "failed":
      return { text: [failWords(c), hint].filter(Boolean).join(" "), warn: true };
    case "done":
    case "uncertain":
      return c.outcome ? { text: c.outcome } : undefined;
    case "cancelled":
      return c.reason === "too_long" ? { text: t("call.fail.too_long") } : undefined;
    case "calling":
    case "talking":
    case "question":
      return { text: prettyNumber(c.plan.to) };
    default:
      return undefined;
  }
}

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
    case "failed":
      return t(c.reason === "call_failed" ? "call.st.failed_line" : "call.st.failed", n);
    default:
      return t(`call.st.${c.state}`, n);
  }
}

function Result({ c }: { c: CallView }) {
  const [lines, setLines] = useState(false);
  return (
    <div class="call-result">
      {c.state === "automated" && c.outcome && <p class="small">{c.outcome}</p>}
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
      {(c.durationSec !== undefined || c.costUsd !== undefined) && <div class="small sub">{[c.durationSec !== undefined ? (c.durationSec < 60 ? t("call.length.s", Math.round(c.durationSec)) : t("call.length", Math.floor(c.durationSec / 60), Math.round(c.durationSec % 60))) : "", c.costUsd !== undefined ? money(c.costUsd) : ""].filter(Boolean).join(" · ")}</div>}
    </div>
  );
}

export function CallRow({ c }: { c: CallView }) {
  const [open, setOpen] = useState(false);
  const ended = callEnded(c.state);
  const live = ["calling", "talking", "question"].includes(c.state);
  const sub = callSub(c);
  const more = ended && !!(c.summary || c.agreed?.length || c.transcript?.length || c.durationSec !== undefined || c.costUsd !== undefined || (c.state === "automated" && c.outcome));
  return (
    <div class={`bcard call-row ${c.state}`}>
      <button class="call-row-top" disabled={!more} aria-expanded={more ? open : undefined} onClick={() => setOpen(!open)}>
        <CallArt size={36} off={ended} />
        <span class="grow">
          <span class="t">{callLine(c)}</span>
          {sub && <span class={`s${sub.warn ? " warn" : ""}`}>{sub.text}</span>}
        </span>
        {more && <span class="chev" aria-hidden="true">{open ? "‹" : "›"}</span>}
      </button>
      {c.state === "failed" && c.payUrl && <Btn kind="text" size="sm" label={t("call.pay", c.plan.provider)} onClick={() => window.open(c.payUrl, "_blank", "noopener")} />}
      {(live || c.state === "waiting") && <Btn kind="text" size="sm" label={t(live ? "call.hangup" : "call.cancel")} about={c.plan.name} onClick={() => A.callCancel(c.callId)} />}
      {more && open && <Result c={c} />}
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
      <div class="phone-day small">{p.calls === 0 ? t("call.card.today.none") : p.calls === 1 ? t("call.card.today.one", money(p.spentTodayUsd)) : t("call.card.today", p.calls, money(p.spentTodayUsd))}</div>
      <div class="small sub">{t("call.card.rails")}</div>
      <div class="phone-cap">
        <h4>{t("call.card.cap")}</h4>
        <Seg<number> label={t("call.card.cap")} value={[5, 10, 20, 50].includes(p.capUsd) ? p.capUsd : undefined} options={[5, 10, 20, 50].map((n) => ({ v: n, label: `$${n}` }))} onPick={(n) => A.phoneCap(n)} />
        <div class="small sub">{t("call.card.cap.help")}</div>
      </div>
      {p.rails && (p.rails.sampling || p.rails.shared) && (
        <div class="phone-rails">
          <h4>{t("call.card.off", p.provider)}</h4>
          {p.rails.sampling && (
            <div class="small">
              <Check />
              {t("call.card.sampling", p.provider)}
            </div>
          )}
          {p.rails.shared && (
            <div class="small">
              <Check />
              {t("call.card.shared", p.provider)}
            </div>
          )}
          {p.doNotCall > 0 && <div class="small sub">{t("call.card.dnc", p.doNotCall)}</div>}
        </div>
      )}
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
