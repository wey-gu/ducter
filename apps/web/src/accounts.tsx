// Settings › 账号 as character sheets (D166, design/connectors.md §12), the phone's one column:
// the proactive chips once above the cards (D165 §5), then one card per source: its clay mailbox
// on the sunken oval, its name, one status line, a tray of app tiles (tap one: its detail in
// place), the connection line with ⋯ (看了哪些 and the honest line, in place), and one destructive
// confirmed in place. Only shared controls (controls.tsx; test/controls.test.ts).
import type { AppWatch, ConnectionView, ProactiveMode } from "@ducter/protocol";
import { PROACTIVE_MODES } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { AppTile, Btn, DangerButton, MoreButton, Seg, Toggle } from "./controls.tsx";
import { ago } from "./format.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const OOMOL_ACCOUNTS = "https://console.oomol.com/app-connections";

/** 自己发现了事，怎么告诉你: one row, single choice; never answered shows none chosen. */
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
      <div class="small sub">{t(v ? `proactive.note.${v}` : "proactive.note.never")}</div>
    </div>
  );
}

const down = (c: ConnectionView) => c.state === "unreachable" || c.state === "unauthorized";

function status(c: ConnectionView): { line: string; warn: boolean } {
  if (c.state === "unauthorized") return { line: t(c.source === "oo" ? "card.oo_out" : "card.key_bad"), warn: true };
  if (c.state === "unreachable") return { line: t("card.unreachable"), warn: true };
  if (c.source !== "mcp" && c.apps && !c.apps.length) return { line: t("card.empty"), warn: false };
  const l = c.look;
  if (!l?.watching) return { line: t("card.status.asked"), warn: false };
  return { line: l.worthToday ? t("card.status.read", l.readToday, l.worthToday) : t("card.status.calm", l.readToday), warn: false };
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

/** A tile's two lines: the app (日历 for any calendar) and the account's short form. */
export function tileWords(w: AppWatch, siblings: string[] = []): [string, string] {
  const title = w.service.includes("calendar") ? t("tile.calendar") : w.title;
  if (siblings.length < 2 || !w.account) return [title, ""];
  const at = w.account.indexOf("@");
  if (at <= 0) return [title, w.account];
  const local = w.account.slice(0, at);
  if (siblings.filter((s) => s.startsWith(`${local}@`)).length < 2) return [title, local];
  return [title, w.account.slice(at + 1).split(".")[0]!];
}

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
      {k === "chat" && (
        <>
          <rect x="2" y="6" width="26" height="18" rx="8" fill={service.startsWith("slack") ? "#4A154B" : "#5865F2"} />
          <ellipse cx="10.5" cy="15" rx="2.4" ry="2.8" fill="#fff" />
          <ellipse cx="19.5" cy="15" rx="2.4" ry="2.8" fill="#fff" />
        </>
      )}
      {k === "other" && <circle cx="15" cy="15" r="10" fill="var(--ink-muted)" opacity=".6" />}
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

function TileDetail({ c, w }: { c: ConnectionView; w: AppWatch }) {
  const k = kindOf(w.service);
  const [title] = tileWords(w);
  const budget = c.look?.watching && w.watch ? t("card.budget", c.look.budgetPct) : "";
  const note = [k === "chat" ? t("tile.mentions") : "", budget].filter(Boolean).join(" · ");
  return (
    <div class="tile-detail">
      <div class="td-name">
        <b>{title}</b>
        {w.account && <span class="small sub">{w.account}</span>}
      </div>
      <div class="small">{t("tile.reads", t(`tile.reads.${k}`))}</div>
      <div class="small">{t("tile.asks", t(`tile.asks.${k}`))}</div>
      <div class="small">{w.lastReadAt ? t("tile.last", ago(A.L, w.lastReadAt)) : t("tile.last.never")}</div>
      {!w.excluded && k !== "other" && <Toggle label={t("tile.watch")} help={note || undefined} checked={w.watch} onChange={(v) => A.setApp(c.id, w.service, w.account, { watch: v })} />}
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
        if (r.account && kindOf(r.service) === "mail") app += ` · ${r.account.split("@")[0]}`;
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
        {c.source === "oomol" && c.apps && !c.apps.length && !down(c) && <Btn kind="text" size="sm" label={`${t("acct.connect.oomol")} ›`} onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />}
      </div>
      <div class="tray">
        {tiles.map((w) => {
          const [label, sub] = tileWords(w, accts.get(w.service));
          return (
            <AppTile key={key(w)} label={label} sub={sub || undefined} about={w.excluded ? t("tile.excluded") : undefined} sel={open === key(w)} off={!w.watch} grey={w.excluded || !!w.unreachable || down(c)} onClick={() => setOpen(open === key(w) ? "" : key(w))}>
              <AppMark service={w.service} />
            </AppTile>
          );
        })}
        {(c.source === "oo" || c.source === "oomol") && <AppTile label={t("tile.more")} about={t(`tile.more.${c.source}`)} add onClick={() => window.open(OOMOL_ACCOUNTS, "_blank", "noopener")} />}
      </div>
      {sel && <TileDetail c={c} w={sel} />}
      <div class="src-conn">
        <span class="small sub">{t(`card.conn.${c.source}`)}</span>
        <MoreButton label={t("card.read_list")} open={reads} onClick={() => (setReads(!reads), !reads && A.askReads(c.id))} />
      </div>
      {reads && <ReadsList c={c} />}
      <div class="src-foot">
        {!stopping ? (
          <DangerButton label={t("card.stop", name)} onClick={() => setStopping(true)} />
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
      {list.map((c) => (
        <SourceCard key={c.id} c={c} />
      ))}
    </div>
  );
}
