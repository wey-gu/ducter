// D307: the Settings rows the last lanes left on their own surfaces, the same as the Mac's
// (apps/desktop/internal/views/settings_more.go): a pasted key (D298) in Settings › Partner and on
// the home's card in Devices; 额度用完的时候 / When a limit runs out (D297); what the person's own
// AI agents keep, the first words' looking and Past tasks' hidden agents (D298, D299); and this
// device's light and dark (D302).
import type { OutsideAgent } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Seg, Toggle } from "./controls.tsx";
import { KeyCard } from "./first-words.tsx";
import { Said, say } from "./set-grid.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const AGENT_NAMES: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", pi: "pi" };
const agentName = (a: string) => AGENT_NAMES[a] ?? a;

/** 贴一个 API 密钥 / Paste an API key: one row, its button opening the D298 card in place. */
export function KeyRow({ open: start = false, instead = false }: { open?: boolean; instead?: boolean }) {
  const [open, setOpen] = useState(start);
  const title = t(instead ? "key.paste.instead" : "key.settings.row");
  return (
    <div class="set-card key-set">
      {!open ? (
        <div class="set-row">
          <span class="grow">
            <b>{title}</b>
            <small>{t("key.paste.instead.note")}</small>
          </span>
          <Btn kind="secondary" size="sm" label={t("key.paste.check.open")} onClick={() => setOpen(true)} />
        </div>
      ) : (
        <div class="set-item key-open">
          <b>{title}</b>
          <KeyCard inSettings />
          <Btn kind="text" size="sm" class="set-go" label={t("key.paste.back")} onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** 额度用完的时候 / When a limit runs out: the D297 choice, also reachable from a task's card. */
export function HandoffSettings() {
  const s = A.settings;
  if (!s) return null;
  // D322: nothing does tasks yet, no limit to run out; one agent, it says what happens then.
  const agents = A.agents ?? [];
  const ready = agents.filter((h) => h.installed && h.loggedIn).length;
  if (agents.length && !ready) return null;
  return (
    <section class="set">
      <h3>{t("handoff.title")}</h3>
      {agents.length > 0 && ready === 1 && <p class="g-note">{t("handoff.one")}</p>}
      <div class="set-card">
        <Toggle
          label={t("handoff.row")}
          help={t("handoff.help")}
          checked={!!s.limitHandoff}
          onChange={(v) => (A.setSettings({ limitHandoff: v }), say("handoff", t(v ? "said.handoff.on" : "said.handoff.off")))}
        />
      </div>
      <Said k="handoff" />
    </section>
  );
}

/** 你的 AI agent 留下的记录 / What your AI agents keep: one switch for reading them at all (D327: Past
 *  tasks, and a look the person asked for), the agents Past tasks hides (D299), the folders left out (D327). */
export function RecordsSettings() {
  const f = A.S.first;
  if (!f) return null;
  const looks = f.looks !== false;
  const hidden = (f.outsideHidden ?? []) as OutsideAgent[];
  const folders = f.outsideFolders ?? [];
  const computer = f.computer ?? t("first.here");
  const setLooks = (on: boolean) => {
    A.send({ t: "local_agents", on });
    f.looks = on;
    say("records", t(on ? "said.records.on" : "said.records.off"));
    A.changed();
  };
  const show = (agent: OutsideAgent) => {
    A.send({ t: "outside_hide", agent, hidden: false });
    f.outsideHidden = hidden.filter((x) => x !== agent);
    say("records", t("said.records.shown", agentName(agent)));
    A.changed();
  };
  const showFolder = (path: string) => {
    A.send({ t: "outside_folder", path, hidden: false });
    f.outsideFolders = folders.filter((x) => x !== path);
    say("records", t("said.records.folder", path));
    A.changed();
  };
  return (
    <section class="set">
      <h3>{t("records.title")}</h3>
      {/* D364: the note under the heading, as every group's. */}
      {looks && !hidden.length && !folders.length && <p class="g-note">{t("records.past.note")}</p>}
      <div class="set-card">
        <Toggle label={t("records.look")} help={t("records.look.help", computer)} checked={looks} onChange={setLooks} />
        {looks &&
          hidden.map((a) => (
            <div class="set-row" key={a}>
              <span class="grow">
                <b>{t("records.hidden", agentName(a))}</b>
              </span>
              <Btn kind="secondary" size="sm" label={t("records.show")} about={agentName(a)} onClick={() => show(a)} />
            </div>
          ))}
        {looks &&
          folders.map((p) => (
            <div class="set-row" key={p}>
              <span class="grow">
                <b>{t("records.folder")}</b>
                <small>
                  <code>{p}</code>
                </small>
              </span>
              <Btn kind="secondary" size="sm" label={t("records.show")} about={p} onClick={() => showFolder(p)} />
            </div>
          ))}
      </div>
      <Said k="records" />
    </section>
  );
}

// ---------- D302 on the web: this device's light and dark ----------

export type Paper = "system" | "light" | "dark";
const PAPER = "ducter.paper";

export function savedPaper(): Paper {
  try {
    const v = localStorage.getItem(PAPER);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Puts the paper on the page: the CSS reads `data-theme` over the system's choice; the bar's colour follows. */
export function applyPaper(p: Paper = savedPaper()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (p === "system") delete root.dataset.theme;
  else root.dataset.theme = p;
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = m.dataset.media ?? m.getAttribute("media") ?? "";
    if (!m.dataset.media) m.dataset.media = own;
    if (p === "system") m.setAttribute("media", own);
    else if (own.includes(p)) m.removeAttribute("media");
    else m.setAttribute("media", "not all");
  }
}

export function setPaper(p: Paper) {
  try {
    if (p === "system") localStorage.removeItem(PAPER);
    else localStorage.setItem(PAPER, p);
  } catch {}
  // The Mac's 360 ms from one paper to the other (D302), a room's light changing; at once when still.
  const root = document.documentElement;
  root.classList.add("paper-turning");
  setTimeout(() => root.classList.remove("paper-turning"), 420);
  applyPaper(p);
  A.changed();
}

/** 浅色和深色 / Light and dark, the Mac's row (D302), for this device only. */
export function PaperRow() {
  const cur = savedPaper();
  return (
    <div class="set-item">
      <b>{t("settings.look.mode")}</b>
      <small>{t("settings.look.mode.help")}</small>
      <Seg label={t("settings.look.mode")} value={cur} options={(["system", "light", "dark"] as const).map((v) => ({ v, label: t(`settings.look.mode.${v}`) }))} onPick={(v) => setPaper(v)} />
    </div>
  );
}
