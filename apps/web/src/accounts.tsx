// Settings › 账号 as character sheets (D166, design/connectors.md §12), the phone's one column:
// the proactive chips once above the cards (D165 §5), then one card per source: its clay mailbox
// on the sunken oval, its name, one status line, a tray of app tiles (tap one: its detail in
// place), the connection line with ⋯ (看了哪些 and the honest line, in place), and one destructive
// confirmed in place. Only shared controls (controls.tsx; test/controls.test.ts).
import type { AppWatch, ConnectionView, ProactiveMode } from "@ducter/protocol";
import { PROACTIVE_MODES } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { AppTile, Btn, DangerButton, Seg, Toggle } from "./controls.tsx";
import { ago } from "./format.ts";
import { OwnPhoneCard } from "./own-phone.tsx";
import { PhoneCard, PhoneOffer, SignInPanel } from "./phone.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const OOMOL_ACCOUNTS = "https://console.oomol.com/app-connections";

/** 发现了就说: one row, single choice; never answered shows none chosen. */
export function ProactiveChips(p: { inNote?: boolean }) {
  const st = A.settings;
  useEffect(() => {
    // In the conversation (the first-add question) the settings may not be asked for yet.
    if (!A.settings && A.S.welcomed) A.send({ t: "settings" });
  }, []);
  if (!st) return null;
  const v = st.proactive;
  return (
    <div class="proactive">
      {!p.inNote && <h4>{t("proactive.title")}</h4>}
      <Seg<ProactiveMode> label={t("proactive.title")} value={v} options={PROACTIVE_MODES.map((m) => ({ v: m, label: t(`proactive.${m}`) }))} onPick={(m) => A.setSettings({ proactive: m })} />
      {/* D250: never chosen is the default, and says so. */}
      <div class="small sub">{t(!v ? "proactive.note.never" : st.proactiveBy === "default" ? "proactive.note.default" : `proactive.note.${v}`)}</div>
    </div>
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
    <div class="quiet-day">
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

/** The source's clay mailbox at 104 on its sunken oval; grey when signed out or refused. */
function MailboxHero({ source, off }: { source: ConnectionView["source"]; off: boolean }) {
  const body = off ? "var(--ink-muted)" : source === "oomol" || source === "oo" ? "var(--accent)" : source === "self" ? "var(--working-dot)" : "var(--ink-muted)";
  return (
    <svg class="mailbox-hero" width="200" height="112" viewBox="0 0 200 112" aria-hidden="true">
      <ellipse cx="100" cy="98" rx="84" ry="12" fill="var(--surface-sunken)" />
      <ellipse cx="100" cy="97" rx="60" ry="8" fill="var(--line)" opacity=".5" />
      <g transform="translate(66 0) scale(1.3)">
        <rect x="22" y="44" width="8" height="37" rx="3" fill="var(--line-2)" />
        <path d="M6 46 V26 a20 18 0 0 1 40 0 V46 Z" fill={body} />
        <path d="M10 44 V28 a16 14 0 0 1 32 0 V44 Z" fill="var(--surface)" opacity=".92" />
        <rect x="15" y="27" width="22" height="15" rx="2.5" fill={body} />
        <path d="M15.5 28l10.5 8 10.5-8" fill="none" stroke="var(--surface)" stroke-width="1.6" stroke-linejoin="round" />
        <path d="M12 12 q6 -5 14 -5" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round" fill="none" />
      </g>
    </svg>
  );
}

/**
 * A tile's detail, in place under the tray, in three bands (D192): who (the app, the whole account,
 * when it last looked); what it may do (会看 and 先问你 as a label column and the words); the person's
 * two choices: 自己留意 and, quiet at the foot, 不让 Ducter 看这个. A tile it doesn't read says only that.
 */
function TileDetail({ c, w }: { c: ConnectionView; w: AppWatch }) {
  const k = kindOf(w.service);
  const [title] = tileWords(w);
  const mode = A.settings?.proactive;
  const held = w.watch && (!mode || mode === "off") ? t(`tile.watch.held.${mode ? "off" : "never"}`) : "";
  const budget = !held && c.look?.watching && w.watch ? t("card.budget", c.look.budgetPct) : "";
  const note = [k === "chat" ? t("tile.mentions") : "", budget].filter(Boolean).join(" · ");
  const sub = [w.account, w.lastReadAt && !w.excluded ? t("tile.last", ago(A.L, w.lastReadAt)) : ""].filter(Boolean).join(" · ");
  return (
    <div class="tile-detail">
      <div class="td-name">
        <span class="sq" aria-hidden="true">
          <AppMark service={w.service} />
        </span>
        <div>
          <b>{title}</b>
          {sub && <div class="small sub">{sub}</div>}
        </div>
      </div>
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
          {k !== "other" && (
            <div class="td-watch">
              <Toggle label={t("tile.watch")} help={[note, held].filter(Boolean).join("\n") || undefined} checked={w.watch} onChange={(v) => A.setApp(c.id, w.service, w.account, { watch: v })} />
            </div>
          )}
          {k === "calendar" && <CalendarsBand c={c} w={w} />}
        </>
      )}
      <div class="td-foot">
        <Btn kind="text" size="sm" label={t(w.excluded ? "tile.include" : "tile.exclude")} about={title} onClick={() => A.setApp(c.id, w.service, w.account, { excluded: !w.excluded })} />
        {c.source === "oo" && <span class="small sub">{t("tile.signout_oo")}</span>}
      </div>
    </div>
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
        let app = w ? tileWords(w)[0] : r.service;
        const sibs = tiles.filter((x) => x.service === r.service).map((x) => x.account ?? "");
        if (r.account && sibs.length > 1) app += ` · ${shortAccount(r.account, sibs)}`;
        return (
          <div class="read" key={i}>
            <span class="at">{new Date(r.at).toTimeString().slice(0, 5)}</span>
            <span>{t(`read.${r.what}`, app, r.items)}</span>
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

/** Under the tray: the first-time line with Try it, or, for a card with Gmail and no calendar, the nudge to add one. */
function CalLines({ c, tiles }: { c: ConnectionView; tiles: AppWatch[] }) {
  const [, bump] = useState(0);
  const fresh = newCalendars(c, tiles);
  if (fresh.length)
    return (
      <div class="cal-line">
        <span class="small soft">{t("cal.first")}</span>
        <Btn kind="text" size="sm" label={t("cal.first.try")} onClick={() => (retireFirst(fresh), A.fillComposer(t("cal.first.ask")))} />
      </div>
    );
  const hosted = c.source === "oo" || c.source === "oomol";
  const mail = tiles.some((w) => w.service === "gmail");
  const cal = tiles.some((w) => kindOf(w.service) === "calendar");
  if (!hosted || !mail || cal || down(c) || (calMem().later ?? []).includes(c.id)) return null;
  return (
    <div class="cal-line nudge">
      <span class="small soft">{t("cal.nudge")}</span>
      <span class="acts">
        <Btn kind="text" size="sm" label={t("cal.nudge.later")} onClick={() => {
          const m = calMem();
          saveCalMem({ ...m, later: [...(m.later ?? []), c.id] });
          bump((n) => n + 1);
        }} />
        <Btn kind="secondary" size="sm" label={t(c.source === "oo" ? "cal.nudge.oo" : "cal.nudge.oomol")} onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />
      </span>
    </div>
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
  const sel = tiles.find((w) => key(w) === open);
  return (
    <section class="src-card" aria-label={name}>
      <div class="src-who">
        <MailboxHero source={c.source} off={down(c)} />
        <h3>{name}</h3>
        <div class={`small ${s.warn ? "warn" : "sub"}`}>{s.line}</div>
        {c.source === "oomol" && c.apps && !c.apps.length && !down(c) && <Btn kind="text" size="sm" chev label={t("acct.connect.oomol")} onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />}
      </div>
      <div class="tray">
        {tiles.map((w) => {
          const [label, short] = tileWords(w, accts.get(w.service));
          // Not read: the tile says so in words, not only in grey (D192).
          const sub = w.excluded ? t("tile.excluded") : short;
          const full = [label, w.account, w.excluded ? sub : ""].filter(Boolean).join(" · ");
          return (
            <AppTile key={key(w)} label={label} sub={sub || undefined} about={full} sel={open === key(w)} off={!w.watch} grey={w.excluded || !!w.unreachable || down(c)} onClick={() => (kindOf(w.service) === "calendar" && retireFirst(tiles.filter((x) => kindOf(x.service) === "calendar").map((x) => `${c.id}:${key(x)}`)), setOpen(open === key(w) ? "" : key(w)))}>
              <AppMark service={w.service} />
            </AppTile>
          );
        })}
        {(c.source === "oo" || c.source === "oomol") && <AppTile label={t("tile.more")} about={t(`tile.more.${c.source}`)} add onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />}
      </div>
      {!sel && <CalLines c={c} tiles={tiles} />}
      {sel && <TileDetail c={c} w={sel} />}
      {/* The connection itself, last and quiet (D192): where what it reads passes, then one row of its two actions. */}
      <div class="src-foot">
        <div class="small soft">{connLine(c)}</div>
        {reads && <ReadsList c={c} />}
        {!stopping ? (
          <div class="src-acts">
            <Btn kind="text" size="sm" chev label={t("card.read_list")} expanded={reads} onClick={() => (setReads(!reads), !reads && A.askReads(c.id))} />
            <DangerButton label={t("card.stop", name)} onClick={() => setStopping(true)} />
          </div>
        ) : (
          <div class="stop-ask" role="group">
            <div class="small">{t("card.stop.ask")}</div>
            <div class="acts">
              <Btn kind="text" size="sm" label={t("card.stop.keep")} about={name} onClick={() => setStopping(false)} />
              <DangerButton label={t("card.stop.go")} about={name} onClick={() => (setStopping(false), A.removeConnection(c.id))} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** The cards with the chips above them. */
export function SourceCards({ list }: { list: ConnectionView[] }) {
  return (
    <div class="src-cards">
      <ProactiveChips />
      {list.map((c) => (c.phone ? <PhoneCard key={c.id} c={c} /> : <SourceCard key={c.id} c={c} />))}
      {!list.some((c) => c.phone) ? <PhoneOffer /> : A.signIn && !A.signIn.reconnect && <SignInPanel s={A.signIn} />}
      <OwnPhoneCard />
    </div>
  );
}
