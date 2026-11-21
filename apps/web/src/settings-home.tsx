// D469: Settings in On hand's language (D467), the same as the Mac's
// (apps/desktop/internal/views/settings_home.go). The partner reports on its own world in its own
// voice: the Settings list opens with its brief (the figure in its pose, one lead line, labelled lines
// that each open their page, and what needs you with the way to the fix), then where things live
// (each computer in its clay, what it is to the partner, and on the home what lives there). Every
// pushed page's head is the partner saying that page's state, never a description of the page.
import type { ConnectionView, DeviceView } from "@ducter/protocol";
import { A, type SettingsPage } from "./app.ts";
import { tilesOf, tileWords } from "./accounts.tsx";
import { BrandMark, brandOf } from "./brand.tsx";
import { linkedChats } from "./channels.tsx";
import { Btn } from "./controls.tsx";
import { deviceArt } from "./devcard.tsx";
import { harnessName, modelName } from "./format.ts";
import { memPluginRows } from "./mem-plugin.tsx";
import { groupNoted, memPhase } from "./mem-view.ts";
import { Notebook } from "./memory.tsx";
import { noBrain } from "./partner-story.tsx";
import { Avatar } from "./views.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** One thing on Settings that needs the person: the partner's sentence, and where its fix is. */
export type SetNeed = { key: string; text: string; go: string; page: Exclude<SettingsPage, "">; about?: string };

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
  const asks = A.mem?.check?.asks.length ?? 0;
  if (asks > 0 && A.settings?.memory) out.push({ key: "memask", text: asks > 1 ? t("need.memask", asks) : t("need.memask.one"), go: t("need.go.look"), page: "memory" });
  for (const { dv, h } of memPluginRows(A.devices)) {
    if (h.mem?.state === "update") out.push({ key: `memp:${dv.id}:${h.harness}`, text: t("need.memplug", harnessName(h.harness)), go: t("need.go.update"), page: "memory" });
  }
  const u = updatesWaiting();
  if (u.n > 0 && !u.running) out.push({ key: "update", text: u.n > 1 ? t("need.update", u.n) : t("need.update.one"), go: t("need.go.update"), page: "devices" });
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

/** The partner's sentence at the head of a page: what is true there now, in its voice. "" for none. */
export function paneSay(page: SettingsPage): string {
  switch (page) {
    case "accounts": {
      const { total, watched } = watchedAccounts();
      if (!total) return t("say.accounts.none");
      return watched ? t("say.accounts", watched) : t("say.accounts.ask", total);
    }
    case "devices":
      // The web is always a window on the home.
      return homeName() ? t("say.run.remote", homeName()) : "";
    case "memory": {
      if (!A.settings) return "";
      const ph = memPhase(!!A.settings.memory, A.mem, A.bridge);
      return ph === "on" ? t("say.memory.on") : ph === "off" ? t("say.memory.off") : ph === "closed" ? t("say.memory.closed") : t("say.memory.first");
    }
    case "notify":
      return t("say.notify");
    case "todos":
      return t("say.todos");
    case "chats":
      return t("say.chats");
    case "autofill":
      return t("say.autofill");
    case "peers":
      return t("say.peers");
    case "phone":
      return t("say.phone");
  }
  return "";
}

/** A pushed page's head under its title (D469): the partner, in the pose for this page, says what is true here; what needs you here follows. */
export function PaneSays({ page }: { page: SettingsPage }) {
  const say = paneSay(page);
  const needs = needsOf(page);
  if (!say && !needs.length) return null;
  return (
    <div class={`pane-says${needs.length ? " needs" : ""}`}>
      <Avatar size={36} state={needs.length ? "needsyou" : "idle"} />
      <div class="ps-words">
        {say && <p class="ps-say">{say}</p>}
        {needs.map((n) => (
          <p key={n.key} class="ps-need">
            {n.text}
          </p>
        ))}
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

function homeThinks(): string {
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
    const n = groupNoted(A.mem?.noted ?? []).filter((g) => g.when !== "earlier").reduce((k, g) => k + g.items.length, 0);
    return n > 0 ? t("home.mem.week", n) : t("home.mem.on");
  }
  return ph === "off" ? t("home.mem.off") : t("home.mem.none");
}

function homeReach(): string {
  const names = linkedChats();
  return names.length ? t("home.reach", names.join(t("acct.sep"))) : "";
}

/** The labelled lines of the brief, each opening its page. */
export function homeLines(): { key: string; label: string; text: string; page: Exclude<SettingsPage, ""> }[] {
  const out: { key: string; label: string; text: string; page: Exclude<SettingsPage, ""> }[] = [];
  const lives = homeLives();
  if (lives) out.push({ key: "lives", label: t("home.l.lives"), text: lives, page: "devices" });
  if (A.settings && !noBrain()) {
    const th = homeThinks();
    if (th) out.push({ key: "thinks", label: t("home.l.thinks"), text: th, page: "partner" });
  }
  out.push({ key: "reads", label: t("home.l.reads"), text: homeReads(), page: "accounts" });
  const mem = homeMem();
  if (mem) out.push({ key: "mem", label: t("home.l.mem"), text: mem, page: "memory" });
  const reach = homeReach();
  if (reach) out.push({ key: "reach", label: t("home.l.reach"), text: reach, page: "chats" });
  return out;
}

/** The Settings list's head (D469): the partner's brief on its own world. */
export function SetBrief({ go }: { go: (p: SettingsPage) => void }) {
  const needs = setNeeds();
  const lines = homeLines();
  const pose = needs.length ? "needsyou" : A.status === "offline" ? "napping" : "done";
  const wide = typeof matchMedia === "function" ? !matchMedia("(max-width: 599px)").matches : true;
  return (
    <div class={`set-brief${needs.length ? " needs" : ""}`}>
      <span class="sb-face">
        <Avatar size={wide ? 88 : 56} state={pose} />
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
                  <span key={n.key} class="sb-need">
                    <span class="sb-words">{n.text}</span>
                    <Btn kind="secondary" size="sm" label={n.go} about={n.text} onClick={() => go(n.page)} />
                  </span>
                ))}
              </span>
            </div>
          )}
          {lines.map((l) => (
            <div key={l.key} class="sb-line">
              <span class="sb-label">{l.label}</span>
              <button class="sb-text" onClick={() => go(l.page)}>
                {l.text}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** What a computer is to the partner, in a few words. */
export function placeRole(dv: DeviceView): string {
  const name = A.S.personaName;
  if (dv.state === "unreachable") return t("home.role.away");
  if (dv.home) return t("home.role.home", name);
  if (dv.kind === "phone") return t("home.role.phone", name);
  if ((dv.harnesses ?? []).some((h) => h.installed)) return t("home.role.worker", name);
  return t("home.role.window", name);
}

/** Where things live (motivation: "you should always see where your accounts live"): each computer in its clay; the home carries the partner, its memory and the accounts it reads. */
export function PlacesMap({ go }: { go: (p: SettingsPage) => void }) {
  const devs = [...(A.devices ?? [])].sort((a, b) => Number(b.home) - Number(a.home));
  if (!devs.length) return null;
  const marks: string[] = [];
  for (const c of sources()) for (const w of tilesOf(c)) if (!w.excluded && brandOf(w.service) && !marks.includes(brandOf(w.service))) marks.push(brandOf(w.service));
  const memOn = !!A.settings && memPhase(!!A.settings.memory, A.mem, A.bridge) === "on";
  return (
    <section class="set-map" aria-label={t("home.map")}>
      <h3 class="map-label">{t("home.map")}</h3>
      <div class="map-row">
        {devs.map((dv) => (
          <button key={dv.id} class={`map-card${dv.state === "unreachable" ? " away" : ""}`} onClick={() => go("devices")}>
            <img src={deviceArt(dv)} alt="" width={56} height={56} />
            <b>{dv.name}</b>
            <small>{placeRole(dv)}</small>
            {dv.home && (
              <span class="map-here" aria-hidden="true">
                <Avatar size={30} state="idle" still />
                {memOn && <Notebook size={24} />}
                {marks.slice(0, 4).map((m) => (
                  <span key={m} class="map-mark">
                    <BrandMark name={m} size={18} />
                  </span>
                ))}
                {marks.length > 4 && <span class="map-more">+{marks.length - 4}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
