// D469: Settings in On hand's language (D467), the same as the Mac's
// (apps/desktop/internal/views/settings_home.go). The partner reports on its own world in its own
// voice: the Settings list opens with its brief (the figure in its pose, one lead line, labelled lines
// that each open their page, and what needs you with the way to the fix), then where things live
// (each computer in its clay, what it is to the partner, and on the home what lives there). Every
// pushed page's head is the partner saying that page's state, never a description of the page.
import type { ConnectionView, DeviceHarness, DeviceView } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A, type SettingsPage } from "./app.ts";
import { Mailbox, status, tilesOf, tileWords } from "./accounts.tsx";
import { BrandMark, BrandTile, brandOf } from "./brand.tsx";
import { linkedChats } from "./channels.tsx";
import { Btn, Chev } from "./controls.tsx";
import { clientArt, deviceArt, foldClients, runningOn } from "./devcard.tsx";
import { ago, harnessName, keepClauses, memWords, modelName, shownDeviceName } from "./format.ts";
import { MemAsk, memCant, memLine, memPluginRows } from "./mem-plugin.tsx";
import { groupNoted, memPhase } from "./mem-view.ts";
import { Notebook, peersReaching, peersSay } from "./memory.tsx";
import { noBrain } from "./partner-story.tsx";
import { savedPaper } from "./settings-more.tsx";
import { TS } from "./todos.tsx";
import { UsageWeek } from "./usage-week.tsx";
import { Avatar } from "./views.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** One thing on Settings that needs the person: the partner's sentence, and where its fix is. */
export type SetNeed = {
  key: string;
  text: string;
  go: string;
  page: Exclude<SettingsPage, "">;
  about?: string;
  /** D552: its fix is under way (更新中…): the button says so and takes no tap. */
  busy?: boolean;
  /** D469 round 2: a fix that can happen right here, the same one the page's button does. */
  fix?: { kind: "memp"; dv: DeviceView; h: DeviceHarness } | { kind: "update"; label: string };
};

const down = (c: ConnectionView) => c.state === "unreachable" || c.state === "unauthorized";
const sources = () => (A.connections ?? []).filter((c) => !c.phone);

/** How many updates wait, and whether Update all is under way (views.tsx's updatesWaiting, as a number). */
function updatesWaiting(): { n: number; running: boolean } {
  const v = A.updateAll;
  if (v?.plan && !v.plan.finishedAt) return { n: 0, running: true };
  return { n: v?.offer.length ?? 0, running: false };
}

/** Everything on Settings that needs the person, most blocking first (the Mac's setNeeds). */
export function setNeeds(): SetNeed[] {
  const out: SetNeed[] = [];
  if (A.settings && noBrain()) out.push({ key: "brain", text: t("need.brain"), go: t("need.go.signin"), page: "partner" });
  for (const c of sources()) if (down(c)) out.push({ key: `src:${c.id}`, text: t("need.source", c.name), go: t("need.go.look"), page: "accounts" });
  // D552: Mem itself down or signed out, while memory is on: said here too, never only in the pane's head
  // (the Overview read 「我都记在 Nowledge Mem 里」 over a Mem that kept nothing).
  const issue = A.settings?.memory ? A.mem?.health?.issue : undefined;
  if (issue === "signed_out") out.push({ key: "memhealth", text: t("need.mem.signed_out"), go: t("need.go.signin"), page: "memory" });
  if (issue === "unreachable") out.push({ key: "memhealth", text: t("need.mem.unreachable", A.bridge?.home || homeName() || "Ducter"), go: t("need.go.look"), page: "memory" });
  // D569: what Nowledge Mem couldn't settle by itself is its own bookkeeping, never a need: it waits,
  // one quiet row on Memory, the partner's suggestions in it.
  // D552: one per agent per computer, each saying which computer when there is more than one, so two
  // never read the same; one being updated stays, its fix the busy button, until the check clears it.
  // D569: only one that can run from here (the computer awake, any AI signed in there): its fix is the
  // pane's own Update, right here, never a 去更新 to a row with no button. One that can't is no need;
  // its row on Memory says why.
  const memp = memPluginRows(A.devices).filter(({ dv, h }) => h.mem?.state === "update" && !memCant(dv));
  const several = new Set(memp.map(({ dv }) => dv.id)).size > 1;
  for (const { dv, h } of memp) {
    const w = memWords(A.L, memLine(dv, h), harnessName(h.harness), h.harness);
    if (!w.action && !w.busy) continue;
    // D569: a computer not the home is always named (haswell, not hel).
    const text = several || !dv.home ? t("need.memplug.on", harnessName(h.harness), shownDeviceName(dv.name)) : t("need.memplug", harnessName(h.harness));
    out.push({ key: `memp:${dv.id}:${h.harness}`, text, go: w.busy ?? w.action!, page: "memory", ...(w.busy ? { busy: true } : {}), fix: { kind: "memp" as const, dv, h } });
  }
  const u = updatesWaiting();
  if (u.n > 0 && !u.running) {
    // Devices' own one tap (Update all), which asks nothing more there either.
    const label = t(u.n === 1 ? "upall.button.one" : "upall.button");
    out.push({ key: "update", text: u.n > 1 ? t("need.update", u.n) : t("need.update.one"), go: label, page: "devices", fix: { kind: "update", label } });
  }
  return out;
}

export const needsOf = (page: SettingsPage) => setNeeds().filter((n) => n.page === page);

/** The accounts it reads, how many it keeps an eye on by itself, and the first apps' names, each once. */
export function watchedAccounts(): { total: number; watched: number; titles: string[] } {
  let total = 0;
  let watched = 0;
  const titles: string[] = [];
  for (const c of sources()) {
    for (const w of tilesOf(c)) {
      if (w.excluded) continue; // left out by the person: not read
      total++;
      if (w.watch) watched++;
      const [title] = tileWords(w);
      if (!titles.includes(title)) titles.push(title);
    }
  }
  return { total, watched, titles };
}

const homeName = () => A.devices?.find((d) => d.home)?.name || A.homeName || "";

// D475: each page's head is what is true there now, never what the page is for (the Mac's twins in
// settings_home.go: notifySay, todosSay, chatsSay, autofillSay).
function notifySay(): string {
  const s = A.settings;
  if (!s) return t("say.notify");
  if (!s.notify) return t("say.notify.off");
  return s.quiet ? t("say.notify.quiet") : t("say.notify.on");
}

function todosSay(): string {
  const items = (TS.frame?.sources ?? [])
    .filter((s) => s.state === "ok" && s.checkedAt && (s.open ?? 0) > 0)
    .map((s) => t("say.todos.item", (s.kind === "github" ? "GitHub" : s.kind === "obsidian" ? "Obsidian" : "Jira"), `${s.open}${s.openAtLeast ? "+" : ""}`));
  return items.length ? t("say.todos.n", items.join(t("say.todos.sep"))) : t("say.todos");
}

function chatsSay(): string {
  const names = linkedChats();
  return names.length ? t("say.chats.n", names.join(t("acct.sep"))) : t("say.chats");
}

function autofillSay(): string {
  const f = A.saved;
  if (!f) return t("say.autofill");
  const signins = f.items.filter((x) => x.kind === "signin").length;
  const cards = f.items.length - signins;
  const items: string[] = [];
  const count = (n: number, key: string) => n && items.push(n === 1 ? t(`${key}.one`) : t(key, n));
  count(signins, "say.af.signins");
  count(cards, "say.af.cards");
  count(f.keys?.length ?? 0, "say.af.keys");
  return items.length ? t("say.autofill.n", items.join(t("acct.sep"))) : t("say.autofill");
}

/** The partner's sentence at the head of a page: what is true there now, in its voice. "" for none. */
export function paneSay(page: SettingsPage): string {
  switch (page) {
    case "accounts": {
      // D475: a source down is said by its need alone, never a count it can't keep.
      if (needsOf("accounts").length) return "";
      const { total, watched } = watchedAccounts();
      if (!total) return t("say.accounts.none");
      return watched ? t("say.accounts", watched) : t("say.accounts.ask", total);
    }
    case "devices":
      // The web is always a window on the home.
      return homeName() ? t("say.run.remote", homeName()) : "";
    case "memory": {
      if (!A.settings) return "";
      // D552: Mem down or signed out is said by its need alone, never 「我都记在 Nowledge Mem 里」.
      if (needsOf("memory").some((n) => n.key === "memhealth")) return "";
      const ph = memPhase(!!A.settings.memory, A.mem, A.bridge);
      return ph === "on" ? t("say.memory.on") : ph === "off" ? t("say.memory.off") : ph === "closed" ? t("say.memory.closed") : t("say.memory.first");
    }
    case "notify":
      return notifySay();
    case "todos":
      return todosSay();
    case "chats":
      return chatsSay();
    case "autofill":
      return autofillSay();
    case "peers":
      return peersSay();
    case "phone": {
      // D501: the theme, the light and these screens' language, read back.
      const paper = savedPaper(), lang = A.uiLang;
      if (paper === "system" && lang === "auto") return t("say.phone.auto", "Pebble");
      return t("say.phone", "Pebble", t(`say.look.paper.${paper}`), t(`say.look.lang.${lang}`));
    }
  }
  return "";
}

/** A pushed page's head under its title (D469): the partner, in the pose for this page, says what is true here; what needs you here follows. */
export function PaneSays({ page }: { page: SettingsPage }) {
  const say = paneSay(page);
  // D489: on Agent messaging the agent's own row carries its offer; the head says it once, as the partner.
  const needs = page === "peers" ? [] : needsOf(page);
  if (!say && !needs.length) return null;
  return (
    <div class={`pane-says${needs.length ? " needs" : ""}`}>
      <Avatar size={36} state={needs.length ? "needsyou" : "idle"} />
      <div class="ps-words">
        {say && <p class="ps-say">{keepClauses(say)}</p>}
        {needs.map((n) =>
          // D569: a plugin's update is done from the head, where the need is said, never a page below.
          n.fix?.kind === "memp" ? (
            <p key={n.key} class="ps-need ps-fix">
              <NeedLine n={n} go={() => {}} />
            </p>
          ) : (
            <p key={n.key} class="ps-need">
              {n.text}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

/** The lead line of the brief. */
export function homeLead(needs: SetNeed[]): string {
  if (A.settings && noBrain()) return t("home.lead.first");
  if (needs.length === 1) return t("home.lead.one");
  if (needs.length > 1) return t("home.lead.many", needs.length);
  return t("home.lead.ok");
}

function homeLives(): string {
  const h = A.devices?.find((d) => d.home);
  const name = homeName();
  if (!name) return "";
  return h && !(h.alwaysOn || h.kind === "server") ? name : t("home.lives.on", name);
}

/** D568: what the partner you are talking with thinks with: its own agent when it has one, else the default's. */
export function speakerThinks(): string {
  const own = A.speakerBrain(A.speakerFor());
  if (!own) return homeThinks();
  const agent = harnessName(own.harness);
  if (!own.model) return agent;
  const m = (A.brainOptions?.find((o) => o.harness === own.harness)?.models ?? (A.brainNow?.harness === own.harness ? A.brainNow.models : [])).find((x) => x.id === own.model);
  return t("home.thinks", agent, m?.label || modelName(own.model));
}

export function homeThinks(): string {
  const b = A.brainNow ?? A.settings?.brain;
  if (!b) return "";
  const agent = harnessName(b.harness);
  const models = A.brainNow?.harness === b.harness ? A.brainNow.models : [];
  const m = models.find((x) => x.id === b.model) ?? models.find((x) => x.default);
  return m ? t("home.thinks", agent, m.label || modelName(m.id)) : agent;
}

function homeReads(): string {
  const { total, titles } = watchedAccounts();
  if (!total) return t("home.reads.none");
  return t("home.reads", titles.slice(0, 3).join(t("acct.sep")), total);
}

function homeMem(): string {
  if (!A.settings) return "";
  const ph = memPhase(!!A.settings.memory, A.mem, A.bridge);
  if (ph === "on") {
    // D552: Mem signed out or out of reach is never 「你说过的都在 Nowledge Mem 里」.
    if (needsOf("memory").some((n) => n.key === "memhealth")) return t("home.mem.down");
    const n = groupNoted(A.mem?.noted ?? []).filter((g) => g.when !== "earlier").reduce((k, g) => k + g.items.length, 0);
    return n > 0 ? t("home.mem.week", n) : t("home.mem.on");
  }
  return ph === "off" ? t("home.mem.off") : t("home.mem.none");
}

function homeReach(): string {
  const names = linkedChats();
  return names.length ? t("home.reach", names.join(t("acct.sep"))) : "";
}

/** D470: the person's own agents that reach the partner, after the chat apps (or alone). */
function homeReachAgents(chats: boolean): string {
  const names = peersReaching();
  if (!names.length) return "";
  return t(chats ? "home.reach.and" : "home.reach.agents", names.join(t("acct.sep")));
}

/** The labelled lines of the brief, each opening its page. */
type HomeLine = { key: string; label: string; text: string; page: Exclude<SettingsPage, "">; more?: { text: string; page: Exclude<SettingsPage, ""> } };
export function homeLines(): HomeLine[] {
  const out: HomeLine[] = [];
  const lives = homeLives();
  if (lives) out.push({ key: "lives", label: t("home.l.lives"), text: lives, page: "devices" });
  if (A.settings && !noBrain()) {
    const th = speakerThinks(); // D568: the brief speaks as the partner you are talking with
    if (th) out.push({ key: "thinks", label: t("home.l.thinks"), text: th, page: "partner" });
  }
  // D582: not said before the accounts are known (never 还没有 over accounts still on their way).
  if (A.connections) out.push({ key: "reads", label: t("home.l.reads"), text: homeReads(), page: "accounts" });
  const mem = homeMem();
  if (mem) out.push({ key: "mem", label: t("home.l.mem"), text: mem, page: "memory" });
  const reach = homeReach();
  const agents = homeReachAgents(!!reach);
  // D470: the agents that reach it are said after the chat apps, each part opening its own page.
  if (reach) out.push({ key: "reach", label: t("home.l.reach"), text: reach, page: "chats", ...(agents ? { more: { text: agents, page: "peers" as const } } : {}) });
  else if (agents) out.push({ key: "reach", label: t("home.l.reach"), text: agents, page: "peers" });
  return out;
}

/** The Settings list's head (D469): the partner's brief on its own world. */
export function SetBrief({ go }: { go: (p: SettingsPage) => void }) {
  const needs = setNeeds();
  const lines = homeLines();
  const pose = needs.length ? "needsyou" : A.status === "offline" ? "napping" : "done";
  if (phoneWidth()) return <PhoneBrief needs={needs} lines={lines} pose={pose} go={go} />;
  return (
    <div class={`set-brief${needs.length ? " needs" : ""}`}>
      <span class="sb-face">
        <Avatar size={88} state={pose} />
      </span>
      <div class="sb-says">
        <p class="sb-lead" aria-live="polite">
          {homeLead(needs)}
        </p>
        <div class="sb-lines">
          {needs.length > 0 && (
            <div class="sb-line need">
              <span class="sb-label">{t("lane.needs_you")}</span>
              <span class="sb-body">
                {needs.map((n) => (
                  <NeedLine key={n.key} n={n} go={go} />
                ))}
              </span>
            </div>
          )}
          {lines.map((l) => (
            <div key={l.key} class="sb-line">
              <span class="sb-label">{l.label}</span>
              <span class="sb-body">
                <button class="sb-text" onClick={() => go(l.page)}>
                  {l.text}
                </button>
                {l.more && (
                  <button class="sb-text" onClick={() => go(l.more!.page)}>
                    {l.more.text}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** D547: Overview on a phone: one column for a thumb. */
const phoneWidth = () => typeof matchMedia === "function" && matchMedia("(max-width: 599px)").matches;

/**
 * D547: the brief on a phone, one column for a thumb, the most important first: the partner and its
 * lead on one line, then what needs you (each sentence with its fix, a full 44 button) on the
 * needs tint, then the labelled lines as the Settings list's own rows (the label small over what is
 * true, the chevron, the whole row a target). Never the wide brief's two columns squeezed.
 */
function PhoneBrief({ needs, lines, pose, go }: { needs: SetNeed[]; lines: HomeLine[]; pose: "needsyou" | "napping" | "done"; go: (p: SettingsPage) => void }) {
  return (
    <div class={`set-brief phone${needs.length ? " needs" : ""}`}>
      <div class="sb-top">
        <span class="sb-face">
          <Avatar size={48} state={pose} />
        </span>
        <p class="sb-lead" aria-live="polite">
          {homeLead(needs)}
        </p>
      </div>
      {needs.length > 0 && (
        <div class="set-card sb-needs" role="group" aria-label={t("lane.needs_you")}>
          {needs.map((n) => (
            <NeedLine key={n.key} n={n} go={go} phone />
          ))}
        </div>
      )}
      <div class="set-card set-list sb-rows">
        {lines.flatMap((l) => {
          const rows = [{ key: l.key, label: l.label, text: l.text, page: l.page }];
          if (l.more) rows.push({ key: `${l.key}-more`, label: "", text: l.more.text, page: l.more.page });
          return rows.map((r) => (
            <button key={r.key} class="set-row sb-row" onClick={() => go(r.page)}>
              <span class="grow">
                {r.label && <small class="sb-k">{r.label}</small>}
                <b>{r.text}</b>
              </span>
              <Chev />
            </button>
          ));
        })}
      </div>
    </div>
  );
}

/** One thing that needs you, and its fix: in place when the page's own action can run here (the D466 ask, Update all), else the way to the page. */
function NeedLine({ n, go, phone }: { n: SetNeed; go: (p: SettingsPage) => void; phone?: boolean }) {
  const [asking, setAsking] = useState(false);
  const f = n.fix;
  const press = () => {
    if (!f) return go(n.page);
    if (f.kind === "update") return A.startUpdateAll();
    // D480: the Space is chosen in place, on Agent messaging, under that agent's row.
    setAsking(true);
  };
  return (
    <span class={`sb-need${asking ? " asking" : ""}`}>
      <span class="sb-words">{n.text}</span>
      {!asking && <Btn kind="secondary" {...(phone ? {} : { size: "sm" as const })} label={n.go} about={n.text} busy={n.busy} onClick={press} />}
      {asking && f?.kind === "memp" && (
        <span class="sb-ask">
          <MemAsk dv={f.dv} h={f.h} onDone={() => setAsking(false)} />
        </span>
      )}
    </span>
  );
}

/** What a computer is to the partner, in a few words. */
export function placeRole(dv: DeviceView): string {
  const name = A.speakerFor().name;
  if (dv.state === "unreachable") return t("home.role.away");
  if (dv.home) return t("home.role.home");
  if (dv.kind === "phone") return t("home.role.phone");
  if ((dv.harnesses ?? []).some((h) => h.installed)) return t("home.role.worker");
  return t("home.role.window", name);
}

/** One place on the map: a computer or a handheld, what it is to the partner, and what it is doing now (only when true). */
export type MapPlace = { key: string; art: string; name: string; role: string; now: string; away: boolean; home: boolean };

/** The person's computers (home first, then the ones that do tasks) and the handhelds that reach the home. */
export function mapPlaces(): MapPlace[] {
  const devs = [...(A.devices ?? [])].sort((a, b) => Number(b.home) - Number(a.home));
  const out: MapPlace[] = devs.map((dv) => {
    const n = runningOn(dv);
    const now = dv.state === "unreachable" ? "" : n > 0 ? (n === 1 ? t("home.now.tasks.one") : t("home.now.tasks", n)) : dv.state === "asleep" ? t("home.now.asleep") : "";
    return { key: `dev:${dv.id}`, art: deviceArt(dv), name: dv.name, role: placeRole(dv), now, away: dv.state === "unreachable", home: !!dv.home };
  });
  const clients = A.reach?.clients ?? [];
  const hidden = foldClients(A.devices ?? [], clients).hidden;
  for (const cl of clients) {
    if (hidden.has(cl.id) || cl.form === "cli") continue;
    const hand = /ios|iphone|android/i.test(cl.platform) || !/^(darwin|linux|win)/i.test(cl.platform);
    // D551, as the Mac: a browser window on a computer the home doesn't know as one is not a place of its own.
    if (!hand) continue;
    const role = cl.handset?.added ? t("home.role.lent") : t("home.role.phone");
    const now = cl.connected ? t("home.now.on") : cl.lastSeen ? t("home.now.seen", ago(A.L, cl.lastSeen)) : "";
    out.push({ key: `cl:${cl.id}`, art: clientArt(cl), name: cl.name, role, now, away: false, home: false });
  }
  return out;
}

/** Where each account lives (motivation: "always see where your accounts live and what Ducter may do with them"): one place per source, its accounts' marks on it. */
export type AcctPlace = { key: string; name: string; calls: boolean; down: string; marks: string[]; source: ConnectionView["source"] };
export function accountPlaces(): AcctPlace[] {
  return (A.connections ?? []).map((c) => {
    const marks: string[] = [];
    for (const w of tilesOf(c)) if (!w.excluded && brandOf(w.service) && !marks.includes(brandOf(w.service))) marks.push(brandOf(w.service));
    const st = status(c);
    return { key: c.id, name: c.source === "oo" ? t("acct.oo.name") : c.name, calls: !!c.phone, down: st.warn ? st.line : "", marks, source: c.source };
  });
}

/** Where things are (D469 round 2): the computers and phones, the accounts at their real place, and the partner's calm last word. */
export function PlacesMap({ go }: { go: (p: SettingsPage) => void }) {
  const places = mapPlaces();
  const accts = accountPlaces();
  const memOn = !!A.settings && memPhase(!!A.settings.memory, A.mem, A.bridge) === "on";
  if (phoneWidth()) return <PhonePlaces places={places} accts={accts} memOn={memOn} go={go} />;
  return (
    <>
      {places.length > 0 && (
        <section class="set-map" aria-label={t("home.map")}>
          <h3 class="map-label">{t("home.map")}</h3>
          <div class="map-row">
            {places.map((p) => (
              <button key={p.key} class={`map-card${p.away ? " away" : ""}${p.home ? " home" : ""}`} onClick={() => go("devices")}>
                <img src={p.art} alt="" width={64} height={64} />
                <b>{p.name}</b>
                <small class="map-role">{p.role}</small>
                {p.now && <small class="map-now">{p.now}</small>}
                {p.home && (
                  <span class="map-here">
                    <span class="map-here-marks" aria-hidden="true">
                      <Avatar size={30} state="idle" still />
                      {memOn && <Notebook size={24} />}
                    </span>
                    <small>{t(memOn ? "home.here" : "home.here.conv")}</small>
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {accts.length > 0 && (
        <section class="set-map acct-map" aria-label={t("home.accts")}>
          <h3 class="map-label">{t("home.accts")}</h3>
          <div class="map-row accts">
            {accts.map((a) => (
              <button key={a.key} class={`acct-place${a.down ? " down" : ""}`} onClick={() => go("accounts")}>
                <span class="ap-head">
                  {a.calls && /tuwa/i.test(a.name) ? <BrandTile name="tuwa" faded={!!a.down} /> : a.calls ? <img src="app/art/ab_call.webp" alt="" width={40} height={40} /> : a.source === "oomol" || a.source === "oo" ? <BrandTile name="oomol" faded={!!a.down} /> : <span class="g-tile mark"><Mailbox source={a.source} off={!!a.down} /></span>}
                  <b>{a.name}</b>
                </span>
                {a.down ? <small class="ap-down">{a.down}</small> : <small>{t(a.calls ? "home.acct.calls" : "home.acct.via")}</small>}
                {!a.calls && a.marks.length > 0 && (
                  <span class="ap-marks" aria-hidden="true">
                    {a.marks.slice(0, 5).map((m) => (
                      <span key={m} class="map-mark">
                        <BrandMark name={m} size={18} />
                      </span>
                    ))}
                    {a.marks.length > 5 && <span class="map-more">+{a.marks.length - 5}</span>}
                  </span>
                )}
                {!a.calls && !a.down && <small class="ap-may">{t("home.acct.may")}</small>}
              </button>
            ))}
          </div>
        </section>
      )}
      <UsageWeek />
      <p class="set-foot">
        <Avatar size={28} state="idle" still />
        <span>{t("home.foot")}</span>
      </p>
    </>
  );
}

/** The mark of a place where accounts live (a source's tile, the calling service, or the mailbox). */
function AcctMark({ a }: { a: AcctPlace }) {
  if (a.calls && /tuwa/i.test(a.name)) return <BrandTile name="tuwa" faded={!!a.down} />;
  if (a.calls) return <img src="app/art/ab_call.webp" alt="" width={40} height={40} />;
  if (a.source === "oomol" || a.source === "oo") return <BrandTile name="oomol" faded={!!a.down} />;
  return (
    <span class="g-tile mark">
      <Mailbox source={a.source} off={!!a.down} />
    </span>
  );
}

/**
 * D547: where things live, on a phone: the computers and phones, then the accounts' places, each a
 * row of the Settings list (its clay at 40, its name, what it is to the partner and what it does now,
 * the chevron), under the list's own heads; never a column of tall cards a thumb scrolls past.
 */
function PhonePlaces({ places, accts, memOn, go }: { places: MapPlace[]; accts: AcctPlace[]; memOn: boolean; go: (p: SettingsPage) => void }) {
  return (
    <>
      {places.length > 0 && (
        <section class="set-map phone" aria-label={t("home.map")}>
          <h3 class="map-label">{t("home.map")}</h3>
          <div class="set-card set-list">
            {places.map((p) => (
              <button key={p.key} class={`set-row map-line${p.away ? " away" : ""}`} onClick={() => go("devices")}>
                <img src={p.art} alt="" width={40} height={40} />
                <span class="grow">
                  <b>{p.name}</b>
                  <small class="map-role">{p.role}</small>
                  {p.now && <small class="map-now">{p.now}</small>}
                  {p.home && <small class="map-here">{t(memOn ? "home.here" : "home.here.conv")}</small>}
                </span>
                <Chev />
              </button>
            ))}
          </div>
        </section>
      )}
      {accts.length > 0 && (
        <section class="set-map phone" aria-label={t("home.accts")}>
          <h3 class="map-label">{t("home.accts")}</h3>
          <div class="set-card set-list">
            {accts.map((a) => (
              <button key={a.key} class={`set-row acct-line${a.down ? " down" : ""}`} onClick={() => go("accounts")}>
                <AcctMark a={a} />
                <span class="grow">
                  <b>{a.name}</b>
                  {a.down ? <small class="ap-down">{a.down}</small> : <small>{t(a.calls ? "home.acct.calls" : "home.acct.via")}</small>}
                  {!a.calls && a.marks.length > 0 && (
                    <span class="ap-marks" aria-hidden="true">
                      {a.marks.slice(0, 5).map((m) => (
                        <span key={m} class="map-mark">
                          <BrandMark name={m} size={14} />
                        </span>
                      ))}
                      {a.marks.length > 5 && <span class="map-more">+{a.marks.length - 5}</span>}
                    </span>
                  )}
                </span>
                <Chev />
              </button>
            ))}
          </div>
        </section>
      )}
      <UsageWeek />
      <p class="set-foot">
        <Avatar size={28} state="idle" still />
        <span>{t("home.foot")}</span>
      </p>
    </>
  );
}
