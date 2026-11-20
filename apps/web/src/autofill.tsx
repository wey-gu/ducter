// 设置 › 密码和银行卡 / Settings › Passwords & cards (Autofill in code) (D191, design/autofill.md §6): the owner's saved sign-ins,
// cards and details, and where each was used. A secret goes to the home once, in saved_put, and
// never comes back: a sign-in shows its site and user name, a card its last four, a private detail
// only that it is kept. Edit replaces; there is no reveal. Also the 付款 / Pay card (the security
// code typed on it goes with the Go and nowhere else) and the first-use OK card.
import type { DetailKey, DetailView, FillAsk, KeyView, SavedInput, SavedUse, SavedView } from "@ducter/protocol";
import { DETAIL_CLASS, KEY_ENV } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { title, type DecisionState } from "./store.ts";
import { Btn, DangerButton, Seg, Toggle } from "./controls.tsx";
import { ago } from "./format.ts";
import { TABLES } from "./i18n.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Editing = { kind: "signin"; item?: SavedView } | { kind: "card"; item?: SavedView } | { kind: "key"; item?: KeyView } | { kind: "details" } | null;

/** The details form, in the order a booking asks for them. */
const DETAIL_ORDER: DetailKey[] = ["name", "email", "phone", "birthday", "address", "passport_number", "passport_country", "passport_expiry", "known_traveler", "loyalty", "seat", "meal"];

/**
 * D404: a card's expiry as people type it. A phone's number pad has no "/" (inputmode numeric on
 * iOS), so 0829, 829 and 08 29 are 08/29 too; the month is 1 to 12; a two-digit year is this century.
 */
export function parseExp(s: string): { month: number; year: number } | undefined {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\s*[/\-.\s]\s*(\d{2}|\d{4})$/) ?? t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return undefined;
  const month = Number(m[1]);
  const year = Number(m[2]);
  return month >= 1 && month <= 12 ? { month, year: year < 100 ? 2000 + year : year } : undefined;
}

/**
 * D404, D408: digits typed without a slash read back as MM/YY once they can only mean one month and year:
 * four digits (0829 → 08/29), or three starting 2 to 9, a one-digit month (829 → 08/29). The Mac's shapeExp is the same.
 */
export function shapeExp(s: string): string {
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}/${s.slice(2)}`;
  if (/^[2-9]\d{2}$/.test(s)) return `0${s.slice(0, 1)}/${s.slice(1)}`;
  return s;
}

function Field(p: { id: string; label: string; value: string; onInput: (v: string) => void; type?: string; mode?: "numeric" | "email" | "tel" | "url" | "text"; placeholder?: string; auto?: string; wrong?: boolean; first?: boolean }) {
  return (
    <label class="acct-field" for={p.id}>
      <span class="small">{p.label}</span>
      <input
        id={p.id}
        class={p.wrong ? "wrong" : undefined}
        type={p.type ?? "text"}
        inputMode={p.mode}
        autoComplete={p.auto ?? "off"}
        autoCapitalize="off"
        autoCorrect="off"
        spellcheck={false}
        placeholder={p.placeholder}
        autoFocus={p.first}
        value={p.value}
        onInput={(e) => p.onInput((e.target as HTMLInputElement).value)}
      />
    </label>
  );
}

/** Add or change one sign-in. */
function SignInForm({ item, done }: { item?: SavedView; done: () => void }) {
  const [site, setSite] = useState(item?.site ?? "");
  const [user, setUser] = useState(item?.username ?? "");
  const [pw, setPw] = useState("");
  const [sure, setSure] = useState(false);
  const save = () => A.savedPut({ kind: "signin", ...(item ? { id: item.id } : {}), site, username: user, ...(pw ? { password: pw } : {}) }, done);
  return (
    <div class="acct-form af-form">
      <Field id="af-site" label={t("af.signin.site")} value={site} onInput={setSite} mode="url" placeholder="github.com" first={!item} />
      <Field id="af-user" label={t("af.signin.user")} value={user} onInput={setUser} mode="email" />
      <Field id="af-pw" label={t("af.signin.password")} value={pw} onInput={setPw} type="password" auto="new-password" placeholder={item ? t("af.keep") : ""} />
      <AfError />
      <div class="row">
        {item && (sure ? <DangerButton label={t("af.remove.go")} about={item.label} onClick={() => A.savedRemove(item.id, done)} /> : <Btn kind="text" label={t("af.remove")} about={item.label} onClick={() => setSure(true)} />)}
        <span class="grow" />
        <Btn kind="secondary" label={t("af.cancel")} onClick={done} />
        <Btn kind="primary" label={t("af.save")} disabled={!site.trim() || !user.trim() || (!item && !pw)} onClick={save} />
      </div>
    </div>
  );
}

/** Add or change one card. The security code is never asked for here: each payment's Go asks. */
function CardForm({ item, done }: { item?: SavedView; done: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [num, setNum] = useState("");
  const [exp, setExp] = useState(item?.exp ?? "");
  const [sure, setSure] = useState(false);
  const m = parseExp(exp);
  const save = () => m && A.savedPut({ kind: "card", ...(item ? { id: item.id } : {}), name, ...(num ? { number: num } : {}), expMonth: m.month, expYear: m.year }, done);
  return (
    <div class="acct-form af-form">
      <Field id="af-num" label={t("af.card.number")} value={num} onInput={setNum} mode="numeric" auto="off" placeholder={item ? t("af.keep.with", `•••• ${item.last4}`) : "4242 4242 4242 4242"} first={!item} />
      <div class="af-pair">
        <Field id="af-exp" label={t("af.card.exp")} value={exp} onInput={(v) => setExp(shapeExp(v))} mode="numeric" placeholder="08/29" wrong={exp.trim().length >= 4 && !m} />
        <Field id="af-name" label={t("af.card.name")} value={name} onInput={setName} />
      </div>
      <div class="small sub">{t("af.card.nocvc")}</div>
      <AfError />
      <div class="row">
        {item && (sure ? <DangerButton label={t("af.remove.go")} about={item.label} onClick={() => A.savedRemove(item.id, done)} /> : <Btn kind="text" label={t("af.remove")} about={item.label} onClick={() => setSure(true)} />)}
        <span class="grow" />
        <Btn kind="secondary" label={t("af.cancel")} onClick={done} />
        <Btn kind="primary" label={t("af.save")} disabled={!name.trim() || !m || (!item && !num)} onClick={save} />
      </div>
    </div>
  );
}

/** D233: add or change one key. The value goes once; it is never shown again (a known head at most). */
function KeyForm({ item, done }: { item?: KeyView; done: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [env, setEnv] = useState(item?.env ?? "");
  const [value, setValue] = useState("");
  const [sure, setSure] = useState(false);
  const envOk = KEY_ENV.test(env.trim());
  const save = () => A.savedPut({ kind: "key", ...(item ? { id: item.id } : {}), name, env: env.trim(), ...(value ? { value } : {}) }, done);
  return (
    <div class="acct-form af-form">
      <Field id="af-key-name" label={t("af.key.name")} value={name} onInput={setName} placeholder={t("af.key.name.eg")} first={!item} />
      <Field id="af-key-env" label={t("af.key.env")} value={env} onInput={(v) => setEnv(v.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="DO_TOKEN" wrong={!!env && !envOk} />
      <Field id="af-key-value" label={t("af.key.value")} value={value} onInput={setValue} type="password" auto="off" placeholder={item ? t("af.keep.with", item.hint ?? t("af.key.kept")) : ""} />
      <AfError />
      <div class="row">
        {item && (sure ? <DangerButton label={t("af.remove.go")} about={item.name} onClick={() => A.savedRemove(item.id, done)} /> : <Btn kind="text" label={t("af.remove")} about={item.name} onClick={() => setSure(true)} />)}
        <span class="grow" />
        <Btn kind="secondary" label={t("af.cancel")} onClick={done} />
        <Btn kind="primary" label={t("af.save")} disabled={!envOk || (!item && !value.trim())} onClick={save} />
      </div>
    </div>
  );
}

/** A key drawn, not an emoji: a ring and a bit (16px, currentColor). */
function KeyGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path d="M8 8h6.5M12 8v2.5M14.5 8v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  );
}

/** 你的资料 / Your details: one form; a private field shows only that it is kept, and stays unless typed over. */
function DetailsForm({ details, done }: { details: DetailView[]; done: () => void }) {
  const of = (k: DetailKey) => details.find((d) => d.key === k);
  const [vals, setVals] = useState<Partial<Record<DetailKey, string>>>(() => Object.fromEntries(DETAIL_ORDER.map((k) => [k, of(k)?.value ?? ""])));
  const [cleared, setCleared] = useState<Set<DetailKey>>(new Set());
  const save = () => {
    const values: Partial<Record<DetailKey, string>> = {};
    for (const k of DETAIL_ORDER) {
      const v = (vals[k] ?? "").trim();
      const d = of(k);
      if (DETAIL_CLASS[k] === "read") {
        if (v !== (d?.value ?? "")) values[k] = v;
      } else if (v) values[k] = v;
      else if (cleared.has(k)) values[k] = "";
    }
    A.savedPut({ kind: "detail", values }, done);
  };
  return (
    <div class="acct-form af-form">
      {DETAIL_ORDER.map((k) => {
        const d = of(k);
        const priv = DETAIL_CLASS[k] === "fill";
        return (
          <div key={k}>
            <Field id={`af-${k}`} label={t(`af.d.${k}`)} value={vals[k] ?? ""} onInput={(v) => setVals({ ...vals, [k]: v })} mode={k === "email" ? "email" : k === "phone" ? "tel" : "text"} placeholder={priv && d?.kept && !cleared.has(k) ? t("af.keep.with", d.hint ?? "••••") : t(`af.d.${k}.eg`)} />
            {priv && d?.kept && !cleared.has(k) && (
              <button type="button" class="qlink af-clear" onClick={() => setCleared(new Set([...cleared, k]))}>
                {t("af.d.clear")}
              </button>
            )}
          </div>
        );
      })}
      <AfError />
      <div class="row">
        <span class="grow" />
        <Btn kind="secondary" label={t("af.cancel")} onClick={done} />
        <Btn kind="primary" label={t("af.save")} onClick={save} />
      </div>
    </div>
  );
}

function AfError() {
  const f = A.saved;
  if (!f || f.ok !== false || !A.savedFailed) return null;
  return (
    <div class="small warn" role="alert">
      {t(`af.err.${f.reason ?? "failed"}`)}
      {f.message ? ` (${f.message})` : ""}
    </div>
  );
}

// D399: a row speaks only when it differs: never used is every new row's state, so it says nothing.
const usedLine = (x: { usedAt?: string }) => (x.usedAt ? t("af.used", ago(A.L, x.usedAt)) : "");

/** A use's line and, apart, its site (D291, D296: each fact its own element, as on the Mac). */
function useLine(u: SavedUse): [string, string] {
  // D233: a key has no site; it was given to the task named under it, or refused.
  if (u.what === "given") return [t(u.once ? "af.use.given.once" : "af.use.given", u.label), ""];
  if (u.what === "refused") return [t("af.use.refused", u.label), ""];
  const what = u.what === "approved" ? t("af.use.approved", u.amount ?? "", u.label) : u.what === "declined" ? t("af.use.declined", u.label) : u.what === "ok" ? t("af.use.ok", u.label) : t("af.use.filled", u.label);
  return [what, u.site ?? ""];
}

/** The Autofill page. */
export function AutofillSettings() {
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "saved" });
    // Opened before the socket said welcome (a deep link): ask once it has.
  }, [A.S.welcomed]);
  const [editing, setEditing] = useState<Editing>(null);
  const f = A.saved;
  if (!f) return <div class="small">{t("conn.connecting")}</div>;
  const done = () => setEditing(null);
  const signins = f.items.filter((x) => x.kind === "signin");
  const cards = f.items.filter((x) => x.kind === "card");
  const kept = f.details.filter((d) => d.kept);
  const edit = (e: Editing) => ((A.savedFailed = false), setEditing(e));
  return (
    <>
      <p class="af-lede">{t("af.lede")}</p>
      <p class="small lede-note">{t(f.keptIn === "keychain" ? "af.kept.keychain" : "af.kept.file", A.homeName || "")}</p>
      <section class="set">
        <h3>{t("af.signins")}</h3>
        <div class="set-card">
          {signins.map((x) =>
            editing?.kind === "signin" && editing.item?.id === x.id ? (
              <div class="set-item" key={x.id}>
                <SignInForm item={x} done={done} />
              </div>
            ) : (
              <button class="set-row" key={x.id} onClick={() => edit({ kind: "signin", item: x })} aria-label={`${x.site} ${x.username}`}>
                <span class="af-mark" aria-hidden="true">
                  {(x.site ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span class="grow">
                  <b>{x.label}</b>
                  <small>{x.username}</small>
                </span>
                {x.usedAt && <span class="g-state">{usedLine(x)}</span>}
                <span class="af-dots" aria-hidden="true">
                  ••••••
                </span>
              </button>
            ),
          )}
          {editing?.kind === "signin" && !editing.item ? (
            <div class="set-item">
              <SignInForm done={done} />
            </div>
          ) : (
            <button class="set-row af-add" onClick={() => edit({ kind: "signin" })}>
              <span class="af-plus" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 14 14">
                  <path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </span>
              <span class="grow">
                <b>{t("af.signin.add")}</b>
                {!signins.length && <small>{t("af.signin.why")}</small>}
              </span>
            </button>
          )}
        </div>
      </section>

      <section class="set">
        <h3>{t("af.cards")}</h3>
        <div class="set-card">
          {cards.map((x) =>
            editing?.kind === "card" && editing.item?.id === x.id ? (
              <div class="set-item" key={x.id}>
                <CardForm item={x} done={done} />
              </div>
            ) : (
              <button class="set-row" key={x.id} onClick={() => edit({ kind: "card", item: x })} aria-label={x.label}>
                <span class={`af-card ${x.brand ?? "card"}`} aria-hidden="true">
                  {x.last4}
                </span>
                <span class="grow">
                  <b>{x.label}</b>
                  <small>{t("af.card.line", x.name, x.exp)}</small>
                </span>
                {x.usedAt && <span class="g-state">{usedLine(x)}</span>}
              </button>
            ),
          )}
          {editing?.kind === "card" && !editing.item ? (
            <div class="set-item">
              <CardForm done={done} />
            </div>
          ) : (
            <button class="set-row af-add" onClick={() => edit({ kind: "card" })}>
              <span class="af-plus" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 14 14">
                  <path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </span>
              <span class="grow">
                <b>{t("af.card.add")}</b>
                <small>{t("af.card.why")}</small>
              </span>
            </button>
          )}
        </div>
      </section>

      <section class="set">
        <h3>{t("af.details")}</h3>
        {/* As on the Mac: what it sees and what it only fills, said once under the heading. */}
        <p class="g-note">{t("af.d.note")}</p>
        <div class="set-card">
          {editing?.kind === "details" ? (
            <div class="set-item">
              <DetailsForm details={f.details} done={done} />
            </div>
          ) : (
            <button class="set-row" onClick={() => edit({ kind: "details" })}>
              <span class="af-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <circle cx="9" cy="6.2" r="3" fill="none" stroke="currentColor" stroke-width="1.7" />
                  <path d="M3.4 15.2c.8-3 3-4.4 5.6-4.4s4.8 1.4 5.6 4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                </svg>
              </span>
              <span class="grow">
                {/* D296: a list said as one, never facts joined with " · " (the Mac's afRow). */}
                <b>{kept.length ? kept.filter((d) => d.value).slice(0, 3).map((d) => d.value).join(t("acct.sep")) || t("af.d.kept", kept.length) : t("af.d.add")}</b>
                <small>{kept.length ? (kept.some((d) => !d.value) ? t("af.d.also", kept.filter((d) => !d.value).map((d) => t(`af.d.${d.key}`)).join(t("acct.sep"))) : t("af.d.edit")) : t("af.d.why")}</small>
              </span>
            </button>
          )}
        </div>
      </section>

      <section class="set">
        <h3>{t("af.keys")}</h3>
        <div class="set-card">
          <Toggle label={t("af.keys.ask")} help={t("af.keys.ask.help")} checked={f.askKeys !== false} onChange={(v) => A.setAskKeys(v)} />
          {(f.keys ?? []).map((x) =>
            editing?.kind === "key" && editing.item?.id === x.id ? (
              <div class="set-item" key={x.id}>
                <KeyForm item={x} done={done} />
              </div>
            ) : (
              <button class="set-row" key={x.id} onClick={() => edit({ kind: "key", item: x })} aria-label={`${x.name} ${x.env}`}>
                <span class="af-mark af-key" aria-hidden="true">
                  <KeyGlyph />
                </span>
                <span class="grow">
                  <b>{x.name}</b>
                  <small>
                    <code class="af-env">{x.env}</code>
                  </small>
                </span>
                {x.usedAt && <span class="g-state">{usedLine(x)}</span>}
                <span class="af-dots" aria-hidden="true">
                  {x.hint ?? t("af.key.kept")}
                </span>
              </button>
            ),
          )}
          {editing?.kind === "key" && !editing.item ? (
            <div class="set-item">
              <KeyForm done={done} />
            </div>
          ) : (
            <button class="set-row af-add" onClick={() => edit({ kind: "key" })}>
              <span class="af-plus" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 14 14">
                  <path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </span>
              <span class="grow">
                <b>{t("af.key.add")}</b>
                {!(f.keys ?? []).length && <small>{t("af.key.why")}</small>}
              </span>
            </button>
          )}
        </div>
      </section>

      <section class="set">
        <h3>{t("af.uses")}</h3>
        {f.uses.length ? (
          <ul class="af-uses">
            {f.uses.slice(0, 30).map((u, i) => (
              <li key={i} class={u.what === "declined" ? "no" : undefined}>
                <span class="grow">
                  {useLine(u)[0]}
                  {useLine(u)[1] && <small>{useLine(u)[1]}</small>}
                  {u.task && <small>{t("af.use.task", u.task)}</small>}
                </span>
                <time dateTime={u.at}>{ago(A.L, u.at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <div class="small sub">{t("af.uses.none")}</div>
        )}
      </section>
    </>
  );
}

/** 付款 / Pay: merchant, amount and card, the security code, then Pay or Not now. No default. */
export function PayBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const p = d.pay!;
  const open = !d.resolved && !d.pending;
  const [cvc, setCvc] = useState("");
  const ok = /^\d{3,4}$/.test(cvc);
  return (
    <>
      {!compact && <div class="q">{t("pay.title", p.site)}</div>}
      <dl class="pay-facts">
        <dt>{t("pay.amount")}</dt>
        <dd class="pay-amount">
          {p.currency} {p.amount}
        </dd>
        {p.what && (
          <>
            <dt>{t("pay.what")}</dt>
            <dd>{p.what}</dd>
          </>
        )}
        <dt>{t("pay.where")}</dt>
        <dd>
          {p.site}
          {p.firstHere && <span class="pay-first">{t("pay.first")}</span>}
        </dd>
        <dt>{t("pay.card")}</dt>
        <dd>{p.card}</dd>
      </dl>
      {open ? (
        <>
          {p.needsCvc && (
            <label class="acct-field pay-cvc" for={`cvc-${d.decisionId}`}>
              <span class="small">{t("pay.cvc", p.last4)}</span>
              <input id={`cvc-${d.decisionId}`} type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cvc} onInput={(e) => setCvc((e.target as HTMLInputElement).value.replace(/\D+/g, ""))} />
            </label>
          )}
          <div class="small sub">{t("pay.why")}</div>
          <div class={compact ? "tray" : "btns decide"}>
            <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("pay.hold")} about={p.site} onClick={() => A.decide(d.decisionId, "hold")} />
            {compact && <span class="grow" />}
            <Btn kind="primary" size={compact ? "sm" : undefined} label={t("pay.go", `${p.currency} ${p.amount}`)} about={p.site} disabled={p.needsCvc && !ok} onClick={() => A.pay(d.decisionId, cvc)} />
          </div>
        </>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {d.resolved?.option === "go" || d.pending === "go" ? t("pay.resolved", `${p.currency} ${p.amount}`) : t("pay.resolved.hold")}
        </div>
      )}
    </>
  );
}

/** The first-use question in the reader's words; a detail is named by its own label here. */
export function fillTitle(f: FillAsk): string {
  if (f.kind === "signin") return t("fill.title.signin", f.site);
  const key = f.handle.replace(/^me\./, "");
  const label = `af.d.${key}` in TABLES[A.L.lang] ? t(`af.d.${key}`) : f.label;
  return t("fill.title.detail", f.site, A.L.style.cased ? label.toLowerCase() : label);
}

/** 第一次在 {site} 用 / First use on a site: OK or Not now. */
export function FillBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const f = d.fill!;
  const open = !d.resolved && !d.pending;
  return (
    <>
      {!compact && <div class="q">{fillTitle(f)}</div>}
      <div class="small sub">{t(f.kind === "signin" ? "fill.why.signin" : "fill.why.detail")}</div>
      {open ? (
        <div class={compact ? "tray" : "btns decide"}>
          <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("fill.hold")} about={f.site} onClick={() => A.decide(d.decisionId, "hold")} />
          {compact && <span class="grow" />}
          <Btn kind="primary" size={compact ? "sm" : undefined} label={t("fill.go")} about={f.site} onClick={() => A.decide(d.decisionId, "go")} />
        </div>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {d.resolved?.option === "go" || d.pending === "go" ? t("fill.resolved") : t("fill.resolved.hold")}
        </div>
      )}
    </>
  );
}

/** D233: the task's name on a key card ("Deploy the blog"), or a plain word when it isn't known here. */
export function keyTask(d: DecisionState): string {
  const task = d.taskId ? A.S.tasks.get(d.taskId) : undefined;
  return (task && title(task)) || t("key.task");
}

/** D233: {task} 需要一个密钥 / {task} needs a key: what and why, a masked field, remember or once, then Save and continue or Don't give. No default. */
export function KeyBody({ d, compact }: { d: DecisionState; compact?: boolean }) {
  const k = d.key!;
  const open = !d.resolved && !d.pending;
  const [value, setValue] = useState("");
  const [once, setOnce] = useState(false);
  const task = keyTask(d);
  return (
    <>
      {!compact && <div class="q">{t("key.title", task)}</div>}
      <dl class="pay-facts key-facts">
        <dt>{t("key.what")}</dt>
        <dd>{k.name}</dd>
        <dt>{t("key.env")}</dt>
        <dd>
          <code class="af-env">{k.env}</code>
        </dd>
        {k.why && (
          <>
            <dt>{t("key.why")}</dt>
            <dd class="key-why">{k.why}</dd>
          </>
        )}
      </dl>
      {open ? (
        <>
          <label class="acct-field key-field" for={`key-${d.decisionId}`}>
            <span class="small">{t("key.field")}</span>
            <input
              id={`key-${d.decisionId}`}
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellcheck={false}
              value={value}
              onInput={(e) => setValue((e.target as HTMLInputElement).value)}
            />
          </label>
          {k.saved && <div class="small sub">{t("key.replaces")}</div>}
          <Seg label={t("key.title", task)} value={once ? "once" : "keep"} options={[{ v: "keep", label: t("key.remember") }, { v: "once", label: t("key.once") }]} onPick={(v) => setOnce(v === "once")} />
          <div class="small sub">{t("key.note")}</div>
          <div class={compact ? "tray" : "btns decide"}>
            <Btn kind={compact ? "text" : "secondary"} size={compact ? "sm" : undefined} label={t("key.hold")} about={k.name} onClick={() => A.decide(d.decisionId, "hold")} />
            {compact && <span class="grow" />}
            <Btn kind="primary" size={compact ? "sm" : undefined} label={t(once ? "key.go.once" : "key.go")} about={k.name} disabled={!value.trim()} onClick={() => (A.giveKey(d.decisionId, value, once), setValue(""))} />
          </div>
        </>
      ) : (
        <div class={compact ? "said" : "resolved"} role="status">
          {d.resolved?.option === "go" || d.pending === "go" ? t("key.resolved", task) : t("key.resolved.hold")}
        </div>
      )}
    </>
  );
}

export type { SavedInput };
