// Settings › 账号 / Accounts on D273's grid (D289; after D166's character sheets,
// design/connectors.md §12): 发现了就说 as a section of its own (D165 §5), then each source as one
// raised group whose first row is the connection (its clay mailbox small in the tile column, its
// name, how it stands in that state's ink), a row per app and account it can read (whether Ducter
// reads it, its switch; its detail in place), the add row, and its last line: where what it reads
// passes, and its quiet actions; a destructive one asks in place. Then 打电话 / Phone calls. The
// Mac's accounts.go. Only shared controls (controls.tsx; test/controls.test.ts).
import type { AppWatch, ConnectionView, ProactiveMode } from "@ducter/protocol";
import { PROACTIVE_MODES } from "@ducter/protocol";
import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandTile, brandOf } from "./brand.tsx";
import { AddRow, Btn, DangerButton, OpenRow, Seg, Toggle } from "./controls.tsx";
import { GBlock, GConfirm, GFoot, GHead, GRow, Group, Said, say, Tile } from "./set-grid.tsx";
import { ago } from "./format.ts";
import { OwnPhoneCard } from "./own-phone.tsx";
import { PhoneCard, PhoneOffer, SignInPanel } from "./phone.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const OOMOL_ACCOUNTS = "https://console.oomol.com/app-connections";

/** 发现了就说: the choice and its note; never answered shows none chosen. In Settings (D289) a
 *  section of its own: its header on the text edge, one group holding the choice and the note, and
 *  on Notifications 今天看了什么 (QuietDay) as the group's next row. */
export function ProactiveChips(p: { inNote?: boolean; children?: preact.ComponentChildren }) {
  const st = A.settings;
  useEffect(() => {
    // In the conversation (the first-add question) the settings may not be asked for yet.
    if (!A.settings && A.S.welcomed) A.send({ t: "settings" });
  }, []);
  if (!st) return null;
  const v = st.proactive;
  const body = (
    <>
      <Seg<ProactiveMode> label={t("proactive.title")} value={v} options={PROACTIVE_MODES.map((m) => ({ v: m, label: t(`proactive.${m}`) }))} onPick={(m) => A.setSettings({ proactive: m })} />
      {/* D250: never chosen is the default, and says so. */}
      <div class="small sub">{t(!v ? "proactive.note.never" : st.proactiveBy === "default" ? "proactive.note.default" : `proactive.note.${v}`)}</div>
    </>
  );
  if (p.inNote) return <div class="proactive">{body}</div>;
  return (
    <section class="set proactive-sec">
      <h3>{t("proactive.title")}</h3>
      <div class="set-card chat-app g-group">
        <div class="proactive g-block first">{body}</div>
        {p.children}
      </div>
    </section>
  );
}

/**
 * D226: 今天看了什么 / What it looked at today, under the switch: counts only, and each thing it
 * held back under its reason. A reading problem shows without opening (a silent watcher that reads
 * nothing is the one silence that isn't success); the rest waits behind the button.
 */
export function QuietDay() {
  const [open, setOpen] = useState(false);
  const mode = A.settings?.proactive;
  useEffect(() => {
    if (mode && mode !== "off") A.askDay();
  }, [mode]);
  if (!mode || mode === "off") return null;
  const d = A.proactiveDay;
  const p = d?.problem;
  return (
    <div class="quiet-day g-block first">
      {p && <div class="small warn">{t(`day.problem.${p.why}`, p.agent ?? t("day.agent"))}</div>}
      <Btn kind="text" size="sm" chev label={t("day.title")} expanded={open} onClick={() => (setOpen(!open), !open && A.askDay())} />
      {open && d && (
        <div class="reads day">
          {dayGroups(d).map((g, i) => (
            <div class="day-group" key={i}>
              {g.map((x, j) => (
                <div class={x.soft ? "read soft" : "read"} key={j}>
                  {x.text}
                </div>
              ))}
            </div>
          ))}
          <div class="small sub honest">{t("day.honest")}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The day in four short groups, so it reads as a story rather than a column of equal lines: what
 * came in (and what rules left, softer), what it read and said, what it held and why, and how it
 * stands (catching up, no notifications). The Mac draws the same groups (accounts.go dayGroups).
 */
export function dayGroups(d: import("@ducter/protocol").ProactiveDay): { text: string; soft?: boolean }[][] {
  const l = d.looked;
  const came: { text: string; soft?: boolean }[] = [{ text: l.mail || l.events || l.mentions ? t("day.looked", [l.mail && t("day.mail", l.mail), l.events && t("day.events", l.events), l.mentions && t("day.mentions", l.mentions)].filter(Boolean).join(t("day.sep"))) : t("day.none") }];
  if (d.skipped.notices) came.push({ text: t("day.notices", d.skipped.notices), soft: true });
  if (d.skipped.promo) came.push({ text: t("day.promo", d.skipped.promo), soft: true });
  if (d.skipped.muted) came.push({ text: t("day.muted_senders", d.skipped.muted), soft: true });
  const did = [...(d.read || d.noted ? [{ text: t("day.read", d.read, d.noted) }] : []), { text: t("day.said", d.said) }];
  const held = d.held.map((h) => ({ text: h.reason === "for_morning" && d.nextNote ? t("day.held.for_morning_at", h.n, new Date(d.nextNote).toTimeString().slice(0, 5)) : t(`day.held.${h.reason}`, h.n) }));
  const now = [...(d.catchingUp ? [{ text: t("day.catching_up"), soft: true }] : []), ...(d.pushOff ? [{ text: t("day.push_off"), soft: true }] : [])];
  return [came, did, held, now].filter((g) => g.length);
}

const down = (c: ConnectionView) => c.state === "unreachable" || c.state === "unauthorized";

function status(c: ConnectionView): { line: string; warn: boolean } {
  if (c.state === "unauthorized") return { line: t(c.source === "oo" ? "card.oo_out" : "card.key_bad"), warn: true };
  if (c.state === "unreachable") return { line: t("card.unreachable"), warn: true };
  if (c.source !== "mcp" && c.apps && !c.apps.length) return { line: t("card.empty"), warn: false };
  const l = c.look;
  if (!l?.watching) return { line: t("card.status.asked"), warn: false };
  // D173: the plain state, never how much it read (that is under ⋯ 看了哪些).
  return { line: t(l.paused ? "card.status.paused" : "card.status.watching"), warn: false };
}

export function tilesOf(c: ConnectionView): AppWatch[] {
  if (c.look?.apps.length) return c.look.apps;
  return (c.apps ?? []).flatMap((a) => (a.accounts.length ? a.accounts.map((acc) => ({ service: a.service, title: a.title, account: acc, watch: true, excluded: false })) : [{ service: a.service, title: a.title, watch: true, excluded: false }]));
}

export function kindOf(service: string): "mail" | "calendar" | "github" | "chat" | "other" {
  if (service === "gmail" || service === "outlook") return "mail";
  if (service.includes("calendar")) return "calendar";
  if (service === "github") return "github";
  if (/^(discord|slack|telegram|feishu|lark)/.test(service)) return "chat";
  return "other";
}

/** A tile's two lines: the app (日历 for any calendar) and, when the app has more than one account here, the account's short form. */
export function tileWords(w: AppWatch, siblings: string[] = []): [string, string] {
  const title = w.service.includes("calendar") ? t("tile.calendar") : w.title;
  if (siblings.length < 2 || !w.account) return [title, ""];
  return [title, shortAccount(w.account, siblings)];
}

/** Mail domains anyone can sign up at: there the name before @ says whose it is; anywhere else the domain does (D192). */
const PUBLIC_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "yahoo.com", "aol.com", "proton.me", "protonmail.com", "qq.com", "foxmail.com", "163.com", "126.com", "yeah.net", "sina.com"]);
const mailLocal = (a: string) => (a.lastIndexOf("@") > 0 ? a.slice(0, a.lastIndexOf("@")) : a);
const mailShort = (a: string) => {
  const at = a.lastIndexOf("@");
  if (at <= 0) return a;
  const dom = a.slice(at + 1).toLowerCase();
  return PUBLIC_MAIL.has(dom) ? a.slice(0, at) : dom.split(".")[0] || dom;
};

/**
 * An account's short form on its tile (D192, as the Mac): an address at a mail provider by its name
 * (weyl.gu), one at a company by its domain (nowledge-labs); when two of the app's accounts would
 * read the same, the name before @; still the same, the whole address. A workspace or handle is itself.
 */
export function shortAccount(acc: string, siblings: string[]): string {
  const clash = (f: (a: string) => string) => siblings.some((o) => o !== acc && f(o) === f(acc));
  if (!clash(mailShort)) return mailShort(acc);
  if (!clash(mailLocal)) return mailLocal(acc);
  return acc;
}

/** What passes through a hosted source, by the apps it holds: 邮件和消息, never mail for a card that also holds chats. */
function flows(c: ConnectionView): string {
  const has = new Set(tilesOf(c).filter((w) => !w.excluded).map((w) => kindOf(w.service)));
  const words = (["mail", "calendar", "chat", "github", "other"] as const).filter((k) => has.has(k)).map((k) => t(`flow.${k}`));
  if (!words.length) return t("flow.other");
  return words.length === 1 ? words[0]! : words.slice(0, -1).join(t("acct.sep")) + t("flow.and") + words[words.length - 1];
}
const connLine = (c: ConnectionView) => (c.source === "oo" || c.source === "oomol" ? t(`card.conn.${c.source}`, flows(c)) : t(`card.conn.${c.source}`));

/** The app's mark: simple printed shapes in its own colours (the clay art and official marks are owed). */
export function AppMark({ service }: { service: string }) {
  const k = kindOf(service);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      {k === "mail" && (
        <>
          <path d="M4 23 V8 l11 9 11 -9 V23" fill="none" stroke="#EA4335" stroke-width="3.2" stroke-linejoin="round" />
          <rect x="2.4" y="9" width="3.2" height="14" rx="1" fill="#4285F4" />
          <rect x="24.4" y="9" width="3.2" height="14" rx="1" fill="#34A853" />
        </>
      )}
      {k === "calendar" && (
        <>
          <rect x="4" y="5" width="22" height="21" rx="4" fill="#fff" stroke="#d9d2c4" />
          <rect x="4" y="5" width="22" height="6" rx="3" fill="#4285F4" />
          {[0, 1, 2].flatMap((i) => [0, 1].map((j) => <rect key={`${i}${j}`} x={8 + i * 5.5} y={14 + j * 5.5} width="3.4" height="3.4" rx="1" fill="#4285F4" opacity=".7" />))}
        </>
      )}
      {k === "github" && (
        <>
          <circle cx="15" cy="15" r="12" fill="#24292F" />
          <ellipse cx="15" cy="16" rx="5.5" ry="5" fill="#fff" />
          <ellipse cx="11.4" cy="10" rx="2.2" ry="3" fill="#fff" />
          <ellipse cx="18.6" cy="10" rx="2.2" ry="3" fill="#fff" />
        </>
      )}
      {k === "chat" && service.startsWith("slack") && (
        <>
          <rect x="5" y="8.5" width="20" height="5" rx="2.5" fill="#36C5F0" />
          <rect x="16.5" y="5" width="5" height="20" rx="2.5" fill="#2EB67D" />
          <rect x="5" y="16.5" width="20" height="5" rx="2.5" fill="#ECB22E" />
          <rect x="8.5" y="5" width="5" height="20" rx="2.5" fill="#E01E5A" />
        </>
      )}
      {k === "chat" && !service.startsWith("slack") && (
        <>
          <rect x="2" y="6" width="26" height="18" rx="8" fill="#5865F2" />
          <ellipse cx="10.5" cy="15" rx="2.4" ry="2.8" fill="#fff" />
          <ellipse cx="19.5" cy="15" rx="2.4" ry="2.8" fill="#fff" />
        </>
      )}
      {k === "other" && [0, 1].flatMap((i) => [0, 1].map((j) => <rect key={`${i}${j}`} x={6 + i * 10} y={6 + j * 10} width="8" height="8" rx="2.5" fill="var(--ink-soft)" />))}
    </svg>
  );
}

/** The source's clay mailbox, small in the tile column (D289); grey when signed out or refused. */
function Mailbox({ source, off }: { source: ConnectionView["source"]; off: boolean }) {
  const body = off ? "var(--ink-muted)" : source === "oomol" || source === "oo" ? "var(--accent)" : source === "self" ? "var(--working-dot)" : "var(--ink-muted)";
  return (
    <svg width="22" height="34" viewBox="0 0 52 84" aria-hidden="true">
      <rect x="22" y="44" width="8" height="37" rx="3" fill="var(--line-2)" />
      <path d="M6 46 V26 a20 18 0 0 1 40 0 V46 Z" fill={body} />
      <path d="M10 44 V28 a16 14 0 0 1 32 0 V44 Z" fill="var(--surface)" opacity=".92" />
      <rect x="15" y="27" width="22" height="15" rx="2.5" fill={body} />
      <path d="M15.5 28l10.5 8 10.5-8" fill="none" stroke="var(--surface)" stroke-width="1.6" stroke-linejoin="round" />
    </svg>
  );
}

/**
 * A service's detail, in place under its row on the text column (D289; D192's bands): what it may
 * read and what it asks first, why it isn't looking now, the calendars it reads, and the one quiet
 * choice 不让 Ducter 看这个. A service it doesn't read says only that.
 */
function TileDetail({ c, w }: { c: ConnectionView; w: AppWatch }) {
  const k = kindOf(w.service);
  const [title] = tileWords(w);
  const mode = A.settings?.proactive;
  const held = w.watch && (!mode || mode === "off") ? t(`tile.watch.held.${mode ? "off" : "never"}`) : "";
  const budget = !held && c.look?.watching && w.watch && k !== "other" ? t("card.budget", c.look.budgetPct) : "";
  const last = w.lastReadAt && !w.excluded ? t("tile.last", ago(A.L, w.lastReadAt)) : "";
  // D402: an app it stopped looking at by itself says why, first, in words.
  const via = c.source === "oo" ? "oo" : "OOMOL";
  const trouble = w.trouble === "unsupported" ? t(`tile.trouble.unsupported.${k === "chat" ? "chat" : "other"}`) : w.trouble === "reconnect" ? t("tile.trouble.reconnect.note", via) : "";
  const notes = [trouble, k === "chat" && !w.trouble ? t("tile.mentions") : "", w.trouble ? "" : held, w.trouble ? "" : budget, last].filter(Boolean); // D291: each its own line
  return (
    <GBlock>
      {w.excluded ? (
        <div class="small sub">{t("tile.excluded.note")}</div>
      ) : (
        <>
          <dl class="td-facts">
            <dt>{t("tile.reads.label")}</dt>
            <dd>{t(`tile.reads.${k}`)}</dd>
            <dt>{t("tile.asks.label")}</dt>
            <dd>{t(`tile.asks.${k}`)}</dd>
          </dl>
          {notes.map((n) => (
            <div class="small sub" key={n}>
              {n}
            </div>
          ))}
          {w.trouble === "reconnect" && (c.source === "oomol" || c.source === "oo") && <Btn kind="text" size="sm" chev label={t("tile.trouble.reconnect.go", via)} onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />}
          {k === "calendar" && <CalendarsBand c={c} w={w} />}
        </>
      )}
      <div class="td-foot">
        <Btn kind="text" size="sm" label={t(w.excluded ? "tile.include" : "tile.exclude")} about={title} onClick={() => A.setApp(c.id, w.service, w.account, { excluded: !w.excluded })} />
        {c.source === "oo" && <span class="small sub">{t("tile.signout_oo")}</span>}
      </div>
    </GBlock>
  );
}

function ReadsList({ c }: { c: ConnectionView }) {
  const reads = A.connReads.get(c.id) ?? [];
  const tiles = tilesOf(c);
  return (
    <div class="reads">
      {!reads.length && <div class="small sub">{t("card.read.none")}</div>}
      {reads.slice(0, 8).map((r, i) => {
        const w = tiles.find((x) => x.service === r.service);
        const app = w ? tileWords(w)[0] : r.service;
        const sibs = tiles.filter((x) => x.service === r.service).map((x) => x.account ?? "");
        const acct = r.account && sibs.length > 1 ? shortAccount(r.account, sibs) : ""; // D291: its own muted element
        return (
          <div class="read" key={i}>
            <span class="at">{new Date(r.at).toTimeString().slice(0, 5)}</span>
            <span>{t(`read.${r.what}`, app, r.items)}</span>
            {acct && <span class="sub">{acct}</span>}
          </div>
        );
      })}
      <div class="small sub honest">{t("acct.honest")}</div>
    </div>
  );
}

/** D222: 看哪些日历 / Calendars it reads: each calendar in the account, its colour as a dot, and a switch. */
function CalendarsBand({ c, w }: { c: ConnectionView; w: AppWatch }) {
  const rows = w.calendars;
  return (
    <div class="td-cals">
      <div class="td-k">{t("cal.list.title")}</div>
      {!rows ? (
        <div class="small sub">{t("cal.list.loading")}</div>
      ) : (
        rows.map((r) => {
          const name = r.kind === "main" || !r.name ? t("cal.main") : r.name;
          const note = r.kind === "holidays" || r.kind === "birthdays" || r.kind === "shared" ? t(`cal.kind.${r.kind}`) : undefined;
          return (
            <Toggle
              key={r.id}
              lead={<span class="cal-dot" style={r.color && /^#[0-9a-f]{3,8}$/i.test(r.color) ? { background: r.color } : undefined} aria-hidden="true" />}
              label={name}
              help={note}
              checked={r.seen}
              onChange={(v) => A.pickCalendar(c.id, w.service, w.account, r.id, v)}
            />
          );
        })
      )}
    </div>
  );
}

/** Client-local memory for the calendar lines (D222 §4): when each calendar tile was first seen here,
 *  whether the first-time line was retired, and a dismissed Gmail nudge. Never synced. */
const CAL_MEM = "ducter.cal.local";
type CalMem = { seen?: Record<string, number>; done?: string[]; later?: string[] };
function calMem(): CalMem {
  try {
    return (JSON.parse(localStorage.getItem(CAL_MEM) ?? "{}") as CalMem) || {};
  } catch {
    return {};
  }
}
function saveCalMem(m: CalMem) {
  try {
    localStorage.setItem(CAL_MEM, JSON.stringify(m));
  } catch {
    /* private mode: the line simply shows again next time */
  }
}
const WEEK = 7 * 86_400_000;
const calKey = (c: ConnectionView, w: AppWatch) => `${c.id}:${w.service}:${w.account ?? ""}`;
/** Retires the first-time line for these tiles (opened, or Try it). */
function retireFirst(keys: string[]) {
  const m = calMem();
  m.done = [...new Set([...(m.done ?? []), ...keys])];
  saveCalMem(m);
}
/** The calendar tiles of a card still new to this client: first seen here in the last 7 days, never opened. */
function newCalendars(c: ConnectionView, tiles: AppWatch[]): string[] {
  const cal = tiles.filter((w) => kindOf(w.service) === "calendar" && !w.excluded && !w.unreachable);
  if (!cal.length || down(c)) return [];
  const m = calMem();
  const seen = { ...(m.seen ?? {}) };
  let wrote = false;
  for (const w of cal) if (!seen[calKey(c, w)]) (seen[calKey(c, w)] = Date.now()), (wrote = true);
  if (wrote) saveCalMem({ ...m, seen });
  return cal.map((w) => calKey(c, w)).filter((k) => !(m.done ?? []).includes(k) && Date.now() - seen[k]! < WEEK);
}

/** Rows of the source's group (D289): the first-time line with Try it, or, for a source with Gmail and no calendar, the nudge to add one. */
function CalLines({ c, tiles }: { c: ConnectionView; tiles: AppWatch[] }) {
  const [, bump] = useState(0);
  const fresh = newCalendars(c, tiles);
  const cal = (
    <Tile>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="2.5" y="3.5" width="13" height="12" rx="2.5" fill="none" stroke="var(--ink-soft)" stroke-width="1.6" />
        <path d="M2.5 7.5h13M6 2v3M12 2v3" stroke="var(--ink-soft)" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </Tile>
  );
  if (fresh.length)
    return (
      <GRow tile={cal} line={t("cal.first")}>
        <Btn kind="text" size="sm" label={t("cal.first.try")} onClick={() => (retireFirst(fresh), A.fillComposer(t("cal.first.ask")))} />
      </GRow>
    );
  const hosted = c.source === "oo" || c.source === "oomol";
  const mail = tiles.some((w) => w.service === "gmail");
  const hasCal = tiles.some((w) => kindOf(w.service) === "calendar");
  if (!hosted || !mail || hasCal || down(c) || (calMem().later ?? []).includes(c.id)) return null;
  return (
    <GRow tile={cal} line={t("cal.nudge")}>
      <Btn kind="text" size="sm" label={t("cal.nudge.later")} onClick={() => {
        const m = calMem();
        saveCalMem({ ...m, later: [...(m.later ?? []), c.id] });
        bump((n) => n + 1);
      }} />
      <Btn kind="secondary" size="sm" label={t(c.source === "oo" ? "cal.nudge.oo" : "cal.nudge.oomol")} onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />
    </GRow>
  );
}

export function SourceCard({ c }: { c: ConnectionView }) {
  const [open, setOpen] = useState("");
  const [reads, setReads] = useState(false);
  const [stopping, setStopping] = useState(false);
  const name = c.source === "oo" ? t("acct.oo.name") : c.name;
  const s = status(c);
  const tiles = tilesOf(c);
  const accts = new Map<string, string[]>();
  for (const w of tiles) accts.set(w.service, [...(accts.get(w.service) ?? []), w.account ?? ""]);
  const key = (w: AppWatch) => `${w.service}:${w.account ?? ""}`;
  const watching = !!c.look?.watching && !c.look.paused;
  const srcWatching = watching;
  // D289: one raised group: the connection, a row per app and account (whether Ducter reads it, its
  // switch; its detail in place), the add row, then the last line with its quiet actions.
  return (
    <>
    <Group label={name}>
      <GHead tile={c.source === "oomol" || c.source === "oo" ? <BrandTile name="oomol" faded={down(c)} /> : <Tile mark><Mailbox source={c.source} off={down(c)} /></Tile>} name={name} line={s.line} tone={s.warn ? "bad" : watching ? "done" : undefined}>
        {c.source === "oomol" && c.apps && !c.apps.length && !down(c) && <Btn kind="text" size="sm" chev label={t("acct.connect.oomol")} onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />}
      </GHead>
      {tiles.map((w) => {
        const [title] = tileWords(w, accts.get(w.service));
        const k = kindOf(w.service);
        // D291: whether Ducter reads it is a state word of its own, never joined to the account.
        // D296: and only where the row differs from what the group's first row says (its switch says the rest).
        const bad = !w.excluded && (!!w.unreachable || down(c) || !!w.trouble);
        const watching = !w.excluded && !bad && k !== "other" && w.watch;
        // D402: a watch that stopped by itself says so on the row, never a silent "watching".
        const state = w.excluded ? t("svc.excluded") : w.trouble && !w.unreachable && !down(c) ? t(`tile.trouble.${w.trouble}`) : bad ? t("card.unreachable") : watching ? (srcWatching ? "" : t("svc.watching")) : srcWatching ? t("svc.asked") : "";
        const isOpen = open === key(w);
        return (
          <Fragment key={key(w)}>
            <OpenRow
              tile={brandOf(w.service) ? <BrandTile name={brandOf(w.service)} /> : <Tile mark><AppMark service={w.service} /></Tile>}
              title={title}
              line={w.account}
              state={state ? { text: state, tone: bad ? "bad" : watching ? "done" : undefined } : undefined}
              open={isOpen}
              onClick={() => (k === "calendar" && retireFirst(tiles.filter((x) => kindOf(x.service) === "calendar").map((x) => `${c.id}:${key(x)}`)), setOpen(isOpen ? "" : key(w)))}
              sw={k !== "other" && !w.excluded && !down(c) ? { label: `${title}, ${t("tile.watch")}`, on: w.watch, onChange: (v) => (A.setApp(c.id, w.service, w.account, { watch: v }), say(`watch:${c.id}`, t(v ? "said.watch.on" : "said.watch.off", w.account || title))) } : undefined}
            />
            {isOpen && <TileDetail c={c} w={w} />}
          </Fragment>
        );
      })}
      <CalLines c={c} tiles={tiles} />
      {(c.source === "oo" || c.source === "oomol") && <AddRow label={t(`tile.more.${c.source}`)} help={t("acct.more.line")} onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />}
      {reads && (
        <GBlock>
          <ReadsList c={c} />
        </GBlock>
      )}
      {!stopping ? (
        <GFoot note={connLine(c)}>
          <Btn kind="text" size="sm" chev label={t("card.read_list")} about={name} expanded={reads} onClick={() => (setReads(!reads), !reads && A.askReads(c.id))} />
          <DangerButton quiet label={t("card.stop", name)} onClick={() => setStopping(true)} />
        </GFoot>
      ) : (
        <GConfirm ask={t("card.stop.ask")} keep={t("card.stop.keep")} go={t("card.stop.go")} about={name} onKeep={() => setStopping(false)} onGo={() => (setStopping(false), A.removeConnection(c.id))} />
      )}
    </Group>
    <Said k={`watch:${c.id}`} />
    </>
  );
}

/** D289: 发现了就说 as a section, the sources one group each under 它能看的, then 打电话 with the calls. */
export function SourceCards({ list, add }: { list: ConnectionView[]; add?: preact.ComponentChildren }) {
  const sources = list.filter((c) => !c.phone);
  return (
    <>
      <ProactiveChips />
      {sources.length > 0 && (
        <section class="set src-cards">
          <h3>{t("acct.sec.read")}</h3>
          {sources.map((c) => (
            <SourceCard key={c.id} c={c} />
          ))}
          {add}
        </section>
      )}
      {!sources.length && add}
      <CallsSection list={list} />
    </>
  );
}

/** 打电话 / Phone calls: Tuwa (or its offer, or its sign-in) and calls from your own number. */
export function CallsSection({ list }: { list: ConnectionView[] }) {
  const phones = list.filter((c) => c.phone);
  return (
    <section class="set calls-sec">
      <h3>{t("acct.sec.calls")}</h3>
      {phones.length ? phones.map((c) => <PhoneCard key={c.id} c={c} />) : <PhoneOffer />}
      {phones.length > 0 && A.signIn && !A.signIn.reconnect && <SignInPanel s={A.signIn} />}
      <OwnPhoneCard />
    </section>
  );
}
