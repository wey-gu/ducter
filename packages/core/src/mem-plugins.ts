// D169: Nowledge Mem in the user's AI agents, per computer (design/memory.md "Mem and tasks").
// A task runs with the user's own Nowledge Mem plugin for its agent, as the persona's identity
// (D168), so where the plugin is matters: this keeps one line per agent per device from Mem's own
// local, read-only check (`nmem --json plugins inspect`): on the home here, on a worker through
// its `mem_plugins` op. The check runs when a device comes online, once a day, after an agent
// update or a sign-in, and after a setup task ends; the runner asks `present` to know whether a
// task there has the plugin in any form (else Ducter's own read-only memory stands in).
//
// Installing is never silent (D17: the agents' setup is the user's): 装上 / Install runs Mem's own
// `nmem connect --tool <id>` on that computer when Mem has one for that agent (Claude Code, Codex)
// and its plugin is absent (D375: no tokens, no signed-in agent, seconds); else, or when that didn't
// put it in, it opens one task there, with that agent, that follows Mem's official setup guide.
// Either way the check is read again after. Where a signed-in agent lacks it, Ducter recommends it once per computer and agent: one
// card, Go 装上 suggested, nothing happens until the user taps.
// Memory off (Settings › 记得什么): no checks shown, no cards, no installs.
//
// D466: a newer plugin. Mem's own `nmem --json plugins check` (read-only, Mem's published list) runs
// on the home at most once a day, beside the daily check; its answer (the newest version per agent)
// is kept in mem-plugins.json and laid over every computer's inspect, so an installed plugin below
// it reads "update" from that version to the newer one. Offline, or an answer it can't read: the
// last good answer stands, and nothing is said about the failure. 更新 / Update (and 理成一份 / Keep
// one for several copies) open the same kind of task as 装上, its brief saying which: Mem's guide is
// how to update too. Never a card, never Update all, never by itself.
//
// D552: one task per agent per computer, whatever the taps. A second 更新 / Update (a double tap, a
// second window, the Overview's fix beside the pane's) while one is opening or open answers with that
// same task, never another; the line reads busy from the tap (正在更新到 0.7.38…). The work a setup
// task hands on (the mend's task_open `replaces`, D479/D549) stays that setup, so the check runs when
// the work really ends, and the notices clear then. An update that took says so on its line
// (已更新到 0.7.38) until the next check.
//
// D597: 更新 / Update is no longer a task first. Where the agent's own plugin commands are known
// (Claude Code, Codex, pi: harness-facts memUpdate), Ducter runs them on that computer itself
// (mem-plugin-update.ts; a worker's `mem_plugin_update` op), reads the version back with Mem's
// inspect, and the line says 已更新到 0.7.39. Only when a command failed or the version didn't move
// does a task open, handed every command that ran and its output, and the line says so. A worker
// from before D597 (no op) gets the task as before. No doctor is read on the way: an update needs
// no Mem credential, and another agent's doctor line is never this one's blocker.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MEM_BRIDGE_SKILL, MEM_CONNECT_TOOLS, fill, harnessName, langName, mailboxChoice, words, type Bodies, type LangTag, type DeviceHarness, type LogEvent, type MailboxLook, type MemPluginReason, type MemPluginView } from "@ducter/protocol";
import type { LogStore, Runner, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { MEM_HOSTS, MEM_PLUGIN_UPDATE, withAvailable, type MemBridgeLook, type MemUpdateRun, type MemUpdateStep } from "@ducter/protocol/src/mem-plugins.ts";
import { updateTook } from "./mem-plugin-update.ts";

type Plugins = Record<string, MemPluginView>;

export interface MemPluginsDeps {
  dataDir: string;
  log: LogStore;
  tasks: TaskRegistry;
  persona: { id: string };
  runner: () => Runner | undefined;
  /** Memory on (Settings › 记得什么 and the run). */
  on: () => boolean;
  /** The conversation's language (D292): the task's reports, the card's words through the fallback chain. */
  lang: () => LangTag;
  /** The check on the home; undefined when nmem isn't here or can't tell. */
  inspectLocal: () => Promise<Plugins | undefined>;
  /** The check on a worker (its `mem_plugins` op); undefined when it is away or too old to have it. */
  inspectWorker: (deviceId: string) => Promise<Plugins | undefined>;
  /** The devices now: id, name, home, awake, and which agents are installed and signed in. */
  devices: () => Promise<{ id: string; name: string; home: boolean; awake: boolean; harnesses: { harness: string; installed: boolean; loggedIn: boolean }[] }[]>;
  /**
   * D375: Mem's own `nmem connect --tool` for these agents on that device, answered when it ended;
   * undefined when it can't run there (no nmem, a Ducter there from before D375). Without it, a task.
   */
  connectTools?: (deviceId: string, home: boolean, harnesses: string[]) => Promise<{ ok: boolean; detail?: string } | undefined>;
  /**
   * D466: Mem's own `plugins check` on the home: the newest version out per agent; undefined when
   * offline or unreadable (the last good answer then stands). Absent: no update is ever said.
   */
  checkUpdates?: () => Promise<Record<string, string> | undefined>;
  /**
   * D480: that computer's own Mem, read only (`nmem --json status` and the passive `bridge setup`):
   * on the home here, on a worker its `mem_bridge_look` op. "old": a worker from before D480;
   * undefined: away, or no nmem there.
   */
  bridgeLook?: (deviceId: string, home: boolean) => Promise<MemBridgeLook | "old" | undefined>;
  /**
   * D597: the agent's own plugin update commands, run on that computer (mem-plugin-update.ts): on
   * the home here, on a worker its `mem_plugin_update` op. "old": a worker from before D597;
   * undefined: away, or no commands for this agent. Absent: every update is a task (D466).
   */
  updateDirect?: (deviceId: string, home: boolean, harness: string) => Promise<MemUpdateRun | "old" | undefined>;
  now?: () => number;
  /** How often every awake device is checked again (default a day; 0 = only on events). */
  everyMs?: number;
}

/** D466: the newest versions out are asked for again only after this long (a day, a little early so the daily check finds it stale). */
export const CATALOG_STALE_MS = 20 * 60 * 60 * 1000;

export interface MemPlugins {
  /** A device's agents with their Mem line (none when memory is off or the check can't tell). */
  view(deviceId: string, list: DeviceHarness[]): DeviceHarness[];
  /**
   * D168, research/48 M1: Mem's check last saw this agent's plugin on that device in any form
   * (installed, review, update: anything but absent), so a task there gets the plugin's own
   * context and no recall from Ducter. Id or name; undefined = the home.
   */
  present(device: string | undefined, harness: string): boolean;
  /** Runs the check on one device (or every awake one) now. */
  check(deviceId?: string): Promise<void>;
  /** D560: this agent's Mem line on every device the check has read (none when memory is off). */
  lines(harness: string): { device: string; line: MemPluginView }[];
  /** 装上 / Install: Mem's own command there (D375), else the setup task on that device with that agent. */
  install(device: string, harness: string, what?: "mailbox", space?: { id: string; label: string }): Promise<{ ok: true; taskId?: string } | { ok: false; reason: MemPluginReason }>;
  /**
   * D480: the in-place choice for opening this agent's mailbox: the Spaces Mem lists on that
   * computer with Ducter's recommendation. Read only: nothing is chosen or written.
   */
  mailboxLook(device: string, harness: string, partner: { space?: string }): Promise<MailboxLook>;
  onChange(fn: () => void): () => void;
  stop(): void;
}

interface Saved {
  /** When this Ducter first ran the check: devices already here then were never "new". */
  since: number;
  /** Per device: the agents signed in there at its last check. */
  known: Record<string, string[]>;
  /** device:harness pairs Ducter already offered (once, ever). */
  offered: string[];
  /** Open setup tasks: taskId -> device, harness (D552: and the version it was asked to leave). */
  setups: Record<string, { device: string; harness: string; from?: string }>;
  /** D466: Mem's newest version per agent (`plugins check`), and when it was asked; absent until the first answer. */
  catalog?: { at: number; versions: Record<string, string> };
}

const DAY = 24 * 60 * 60 * 1000;
/** D552: how long a setup task that ended still owns the work it hands on (the mend opens it again within minutes). */
const ENDED_MS = 30 * 60 * 1000;

/**
 * D466: what the task is for. install: absent; update: a newer version is out (from, to);
 * tidy: several copies (their versions); review: an install Mem's check can't call set up.
 * D560: D470's mailbox task is gone: it enabled the login's own mailbox, which an agent's sessions don't
 * read; the agent's plugin (Claude Code 0.7.35+, Codex 0.1.50+) gets each session ready by itself.
 */
export type MemSetupKind = { kind: "install" } | { kind: "update"; from?: string; to?: string; ran?: { steps: MemUpdateStep[]; version?: string } } | { kind: "tidy"; versions?: string[] } | { kind: "review" };

// The card's and the task's own words (D292: zh and en; any other language falls back, ko → en).
const W = {
  zh: {
    offer: "{device} 上的 {agent} 还没装 Nowledge Mem。装上以后，我在那儿做事和你自己用 {agent} 时都记得你；会改 {agent} 自己的设置。",
    install: "安装",
    title: "为 {device} 上的 {agent} 安装 Nowledge Mem",
    "title.update": "为 {device} 上的 {agent} 更新 Nowledge Mem",
    "title.tidy": "把 {device} 上 {agent} 里的 Nowledge Mem 理成一份",
    "title.review": "检查 {device} 上 {agent} 的 Nowledge Mem",
  },
  en: {
    offer: "{agent} on {device} doesn't have Nowledge Mem. With it, my work there and your own {agent} sessions both remember you; it changes {agent}'s own settings.",
    install: "Install",
    title: "Install Nowledge Mem for {agent} on {device}",
    "title.update": "Update Nowledge Mem for {agent} on {device}",
    "title.tidy": "Keep one Nowledge Mem in {agent} on {device}",
    "title.review": "Look at Nowledge Mem in {agent} on {device}",
  },
};
const FINISHED = new Set(["done_claimed", "done", "failed", "dropped", "blocked"]);

/** D169: the brief of the task that puts Nowledge Mem into one of the user's own agents on a computer (D466: or updates it, or leaves one copy). */
export function memSetupBrief(o: { agent: string; host: string; device: string; lang: LangTag; harness?: string; tried?: { tool: string; said?: string }; what?: MemSetupKind }): string {
  const lang = `Write your report in ${langName(o.lang)}.`;
  const what = o.what ?? { kind: "install" };
  // D375: Mem's own command went first and didn't put it in: say so, so the guide's other route is taken.
  const tried = o.tried ? `\nNowledge Mem's own \`nmem connect --tool ${o.tried.tool} --on-conflict abort\` ran first and didn't put it in${o.tried.said ? ` (its last line: ${o.tried.said})` : ""}. If ${o.agent} already has another memory integration, say which and ask the user before changing anything.\n` : "";
  // D597: Ducter ran the agent's own update commands first and they didn't take: every one, as it ran.
  const ran =
    what.kind === "update" && what.ran
      ? `\nDucter already ran ${o.agent}'s own update commands on this computer, in this order, and the update didn't take:\n${what.ran.steps.map((s) => `- \`${s.cmd}\` exited ${s.code}${s.tail ? `:\n${s.tail.split("\n").map((l) => `    ${l}`).join("\n")}` : ""}`).join("\n")}\nAfter them Nowledge Mem's \`plugins inspect\` reads ${what.ran.version ?? "no version"}. Take over from there: find why from this output, fix that one thing, and finish the update. Don't start over from the guide's install steps.\n`
      : "";
  const own = what.kind === "update" && MEM_PLUGIN_UPDATE[o.harness ?? ""]?.length ? `\n   ${o.agent}'s own plugin update commands are the ones Mem's community repo documents: ${MEM_PLUGIN_UPDATE[o.harness!]!.map((a) => `\`${a.join(" ")}\``).join(", then ")}.` : "";
  const head =
    what.kind === "update"
      ? `Update the Nowledge Mem plugin for ${o.agent} on this computer (${o.device})${what.from && what.to ? `, from ${what.from} to ${what.to}` : ""}, for the user's own use of ${o.agent} outside Ducter. The user tapped Update for this. ${MEM_BRIDGE_SKILL[o.host] ? `Its version ${MEM_BRIDGE_SKILL[o.host]} or newer is published (Nowledge Mem's \`plugins check\` doesn't list ${o.agent}; the guide's update step for it is the way).` : "Nowledge Mem's own `nmem --json plugins check` says a newer one is out."}${ran}`
      : what.kind === "tidy"
        ? `Nowledge Mem's own check finds the Nowledge Mem plugin in ${o.agent} on this computer (${o.device}) more than once${what.versions?.length ? ` (versions ${what.versions.join(", ")})` : ""}, so which one ${o.agent} loads is unclear. Leave exactly one: the current one, set up the way the guide installs it. The user tapped Keep one for this.`
        : what.kind === "review"
          ? `Nowledge Mem's own check can't tell whether the Nowledge Mem plugin in ${o.agent} on this computer (${o.device}) is set up and enabled. Make it set up the way the guide says, for the user's own use of ${o.agent} outside Ducter. The user tapped Sort it out for this.`
          : `Set up Nowledge Mem for ${o.agent} on this computer (${o.device}), for the user's own use of ${o.agent} outside Ducter. The user tapped Install for this.`;
  // Several copies: only the host's own plugin commands remove one, and nothing is deleted by hand.
  const tidy = what.kind === "tidy" ? `\n   To remove an older copy, use only ${o.agent}'s own plugin or marketplace commands, as the guide names them; never delete its files by hand. If the guide or ${o.agent} has no command for it, stop and report each copy (version, where it is registered) instead.` : "";
  const done = what.kind === "update" ?"updated and the check says the newer version" : what.kind === "tidy" ? "one copy left and the check says so" : what.kind === "review" ? "set up and the check says so" : "installed and the check says so";
  return `${head}
${tried}
1. Read Nowledge Mem's official setup guide at https://mem.nowledge.co/SKILL.md (it is for installing and updating) and follow it for the host "${o.host}". It is the only source of the steps; don't improvise others.${own}${tidy}
2. It changes only ${o.agent}'s own plugin or MCP setup and Nowledge Mem's own config on this computer. Nothing of Ducter's. Back up a file before editing it by hand, as the guide says.
3. Only ${o.agent} on this computer is this task's. Of \`nmem doctor\`'s lines, only \`credential home\`, \`server reachable\`, \`api key\` and ${o.agent}'s own row are about it; another tool's row failing (another agent's MCP address, say) is not: don't fix it, don't stop for it, name it in one line at the end of your report. Inside this task nmem may reach Nowledge Mem through Ducter's relay, so the address it shows can differ from the one a tool's config names: that is the same Mem, not a mismatch.${what.kind === "update" ? " Updating a plugin needs no Mem credential at all." : ""}
4. Never ask the user for a connect link, a server address, an API key or a workspace, in any state, and never print one: Ducter supplies its own Nowledge Mem connection. If what you need truly can't be done without signing Nowledge Mem in on this computer, stop with state "failed" and say in one line that Settings › Memory signs it in. If the user pastes one anyway, don't use it.
5. When it is done, run \`nmem --json plugins inspect --host ${o.host}\` and report what it says. Say plainly that ${o.agent} has to be restarted (a new session) before it uses it.
6. If a step fails, try its fix once, then stop and report the exact error.

${lang} Done means: ${done}, or a clear reason why not.`;
}

export function createMemPlugins(d: MemPluginsDeps): MemPlugins {
  const now = d.now ?? (() => Date.now());
  const file = join(d.dataDir, "mem-plugins.json");
  const load = (): Saved => {
    try {
      if (existsSync(file)) {
        const j = JSON.parse(readFileSync(file, "utf8"));
        const cat = j.catalog && typeof j.catalog === "object" && Number(j.catalog.at) && j.catalog.versions && typeof j.catalog.versions === "object" ? { at: Number(j.catalog.at), versions: j.catalog.versions as Record<string, string> } : undefined;
        return { since: Number(j.since) || now(), known: j.known ?? {}, offered: Array.isArray(j.offered) ? j.offered : [], setups: j.setups ?? {}, ...(cat ? { catalog: cat } : {}) };
      }
    } catch {
      /* a broken file starts over */
    }
    return { since: now(), known: {}, offered: [], setups: {} };
  };
  const saved = load();
  const save = () => {
    try {
      writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
    } catch {
      /* best effort: at worst a card could be offered again */
    }
  };
  const seen = new Map<string, Plugins>(); // device -> its last check
  const names = new Map<string, string>(); // a device's name -> its id, from the last list
  const running = new Map<string, Promise<void>>();
  // D375: device:harness pairs Mem's own command is putting in now; ones it just put in (restart the
  // agent to use it, said until the next check); ones it didn't, so the next tap goes to a task.
  const direct = new Set<string>();
  const fresh = new Set<string>();
  const triedDirect = new Set<string>();
  // D552: device:harness pairs whose setup task is being opened now (before the runner answers), with
  // that answer, so a second tap in the meantime gets the same task; a setup task that ended, kept a
  // while so the work it hands on (task_open replaces) is still this setup; ones that just updated
  // (the version they reached, said until the next check).
  const opening = new Map<string, Promise<{ ok: true; taskId?: string } | { ok: false; reason: MemPluginReason }>>();
  const ended = new Map<string, { device: string; harness: string; from?: string; at: number }>();
  const updated = new Map<string, string>();
  // D597: pairs whose direct update didn't take: a task took over (said while it runs), or none could.
  const handed = new Set<string>();
  const stuck = new Set<string>();
  // One Mem command at a time per computer: two would write Mem's config side by side.
  const queue = new Map<string, Promise<unknown>>();
  const inTurn = <T>(id: string, fn: () => Promise<T>): Promise<T> => {
    const p = (queue.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
    queue.set(id, p);
    return p;
  };
  const fns = new Set<() => void>();
  const changed = () => {
    for (const fn of fns) fn();
  };

  async function checkOne(id: string, home: boolean, keepFresh = false): Promise<void> {
    if (!d.on()) return;
    const got = await (home ? d.inspectLocal() : d.inspectWorker(id)).catch(() => undefined);
    if (!got) return;
    seen.set(id, got);
    if (!keepFresh) {
      for (const k of [...fresh]) if (k.startsWith(`${id}:`)) fresh.delete(k);
      for (const k of [...updated.keys()]) if (k.startsWith(`${id}:`)) updated.delete(k);
    }
    settleOffers(id, got);
    await offers(id, got);
    changed();
  }

  /**
   * D466: one agent's line on one device: inspect's answer, with the newest version out laid over
   * it (installed below it reads update). The view, present() and install() all read it this way.
   */
  const lineOf = (id: string, harness: string): MemPluginView | undefined => {
    const m = seen.get(id)?.[harness];
    // D576: an agent Mem's check doesn't list (pi) has a newer one out when it is older than the plugin
    // that carries Bridge (MEM_BRIDGE_SKILL: published, read on npm), so its Update works the same way.
    const out = saved.catalog?.versions[harness] ?? MEM_BRIDGE_SKILL[harness];
    return m ? withAvailable(m, out) : undefined;
  };

  // D466: Mem's newest versions, asked at most once in CATALOG_STALE_MS, one ask at a time. Offline or
  // unreadable: the last good answer stands and nothing is said (never a scary line for a quiet network).
  let asking: Promise<void> | undefined;
  function refreshCatalog(): Promise<void> {
    if (!d.checkUpdates || !d.on()) return Promise.resolve();
    if (saved.catalog && now() - saved.catalog.at < CATALOG_STALE_MS) return Promise.resolve();
    if (asking) return asking;
    asking = (async () => {
      const got = await d.checkUpdates!().catch(() => undefined);
      if (!got) return;
      const before = JSON.stringify(saved.catalog?.versions ?? {});
      saved.catalog = { at: now(), versions: got };
      save();
      if (JSON.stringify(got) !== before) changed();
    })().finally(() => (asking = undefined));
    return asking;
  }

  async function check(deviceId?: string): Promise<void> {
    if (!d.on()) return;
    // Beside every device's inspect, never in front of it: an offline ask waits out its own timeout alone.
    const cat = refreshCatalog();
    const list = await d.devices().catch(() => []);
    for (const x of list) names.set(x.name, x.id);
    const todo = list.filter((x) => (deviceId ? x.id === deviceId || x.name === deviceId : x.awake));
    await Promise.all([
      cat,
      ...todo.map((x) => {
        const busy = running.get(x.id);
        if (busy) return busy;
        const p = checkOne(x.id, x.home).finally(() => running.delete(x.id));
        running.set(x.id, p);
        return p;
      }),
    ]);
  }

  /** One card per device and agent, ever: a signed-in agent there, and the check says the plugin isn't there. */
  async function offers(id: string, got: Plugins): Promise<void> {
    const dev = (await d.devices().catch(() => [])).find((x) => x.id === id);
    if (!dev) return;
    const signedIn = dev.harnesses.filter((h) => h.installed && h.loggedIn && MEM_HOSTS[h.harness]).map((h) => h.harness);
    saved.known[id] = signedIn;
    // Tasks there use it (D168), so every signed-in agent without it gets its one card.
    for (const h of signedIn) {
      const key = `${id}:${h}`;
      if (got[h]?.state !== "absent" || saved.offered.includes(key) || setupOf(id, h) || direct.has(key)) continue;
      saved.offered.push(key);
      offer(id, dev.name, h);
    }
    save();
  }

  /**
   * D375: an offer still open whose plugin Mem's check now sees there (put in by Mem's own command,
   * a task, or by hand) closes itself and reads as done, never as a default taken: hold, so nothing runs.
   */
  function settleOffers(id: string, got: Plugins) {
    const cards = d.log.read({ stream: "channel", kinds: ["decision", "decision_resolved"], limit: 500 });
    const closed = new Set(cards.filter((e) => e.kind === "decision_resolved").map((e) => (e.body as Bodies["decision_resolved"]).decisionId));
    for (const e of cards) {
      if (e.kind !== "decision") continue;
      const b = e.body as Bodies["decision"];
      const ask = b.memPlugin;
      if (!ask || ask.device !== id || closed.has(b.decisionId)) continue;
      const s = got[ask.harness]?.state;
      if (s === undefined || s === "absent") continue;
      d.log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId: b.decisionId, option: "hold", by: "default", settled: true } });
    }
  }

  function offer(device: string, deviceName: string, harness: string) {
    const w = words(W, d.lang());
    const agent = harnessName(harness);
    const body: Bodies["decision"] = {
      decisionId: "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10),
      question: fill(w.offer, { device: deviceName, agent }),
      goLabel: w.install,
      // Recommended, never applied by itself: Go is the suggestion, and it waits for the tap (no timer).
      defaultOption: "go",
      reversible: true,
      memPlugin: { device, deviceName, harness },
    };
    d.log.append({ stream: "channel", origin: "system", kind: "decision", body });
  }

  const setupOf = (device: string, harness: string) => Object.entries(saved.setups).find(([, s]) => s.device === device && s.harness === harness)?.[0];

  /**
   * D552: one at a time per agent per computer, at the source. A tap while that pair's setup is being
   * opened, or is open, answers with the same task (ok, never "running" and never a second task).
   */
  function install(device: string, harness: string, what?: "mailbox", space?: { id: string; label: string }): Promise<{ ok: true; taskId?: string } | { ok: false; reason: MemPluginReason }> {
    const id = device === "local" || !names.has(device) ? device : names.get(device)!;
    const key = `${id}:${harness}${what ? `:${what}` : ""}`;
    const busy = opening.get(key);
    if (busy) return busy;
    const p = installNow(device, harness, what, space).finally(() => opening.delete(key));
    opening.set(key, p);
    changed();
    return p;
  }

  async function installNow(device: string, harness: string, what?: "mailbox", space?: { id: string; label: string }): Promise<{ ok: true; taskId?: string } | { ok: false; reason: MemPluginReason }> {
    if (!d.on()) return { ok: false, reason: "off" };
    const host = MEM_HOSTS[harness];
    const dev = (await d.devices().catch(() => [])).find((x) => x.id === device || x.name === device);
    if (!host || !dev) return { ok: false, reason: "unknown" };
    if (!dev.awake) return { ok: false, reason: "offline" };
    const key = `${dev.id}:${harness}`;
    const open = setupOf(dev.id, harness);
    if (open) return { ok: true, taskId: open };
    if (direct.has(key)) return { ok: true };
    // D560: no task opens a mailbox any more (an older app's 让它收到回话): the plugin's own update is the one fix there is.
    if (what === "mailbox") return lineOf(dev.id, harness)?.state === "update" ? openSetup(dev, harness, host, undefined, setupKind(lineOf(dev.id, harness))) : { ok: false, reason: "unknown" };
    // D375: Mem's own command first, where Mem has one for this agent and its plugin isn't there at all
    // (an update or a review is the guide's, by a task). It needs no agent signed in and no tokens.
    const tool = MEM_CONNECT_TOOLS[harness];
    const was = seen.get(dev.id)?.[harness]?.state;
    if (tool && d.connectTools && (was === undefined || was === "absent") && !triedDirect.has(key)) {
      direct.add(key);
      changed();
      void (async () => {
        const r = await inTurn(dev.id, async () => {
          const r = await d.connectTools!(dev.id, dev.home, [harness]).catch(() => undefined);
          await checkOne(dev.id, dev.home, true).catch(() => {});
          return r;
        });
        direct.delete(key);
        const now = seen.get(dev.id)?.[harness]?.state;
        if (r?.ok && now !== undefined && now !== "absent") {
          fresh.add(key);
          return changed();
        }
        // Not in: the task that follows Mem's guide, told what the command said.
        triedDirect.add(key);
        changed();
        if (r) await openSetup(dev, harness, host, { tool, ...(r.detail ? { said: r.detail } : {}) }).catch(() => undefined);
        else await openSetup(dev, harness, host).catch(() => undefined);
      })();
      return { ok: true };
    }
    const kind = setupKind(lineOf(dev.id, harness));
    // D597: an update by the agent's own commands first, run there by Ducter; a task only when it didn't take.
    if (kind.kind === "update" && d.updateDirect && MEM_PLUGIN_UPDATE[harness]?.length) {
      direct.add(key);
      stuck.delete(key);
      changed();
      void (async () => {
        const r = await inTurn(dev.id, async () => {
          const r = await d.updateDirect!(dev.id, dev.home, harness).catch(() => undefined);
          await checkOne(dev.id, dev.home, true).catch(() => {});
          return r;
        });
        const now = seen.get(dev.id)?.[harness]?.version;
        direct.delete(key);
        if (r && r !== "old" && updateTook(kind.from, now, kind.to)) {
          updated.set(key, now!);
          return changed();
        }
        // Didn't take (a command failed, or the version didn't move): a task, told every command and what it said.
        // A worker from before D597 ("old") or one that went away: the task as before, nothing to tell.
        const what: MemSetupKind = r && r !== "old" ? { ...kind, ran: { steps: r.steps, ...(now ? { version: now } : {}) } } : kind;
        const got = await openSetup(dev, harness, host, undefined, what).catch(() => undefined);
        if (got?.ok) {
          if (r && r !== "old") handed.add(key);
        } else stuck.add(key);
        changed();
      })();
      return { ok: true };
    }
    return openSetup(dev, harness, host, undefined, kind);
  }

  /** D466: what the tap asks for, from the line the person saw. */
  function setupKind(m: MemPluginView | undefined): MemSetupKind {
    if (m?.state === "update") return { kind: "update", ...(m.version ? { from: m.version } : {}), ...(m.available ? { to: m.available } : {}) };
    if (m?.state === "review") return m.why === "multiple" ? { kind: "tidy", ...(m.versions ? { versions: m.versions } : {}) } : { kind: "review" };
    return { kind: "install" };
  }

  async function openSetup(dev: { id: string; name: string; home: boolean; harnesses: { harness: string; installed: boolean; loggedIn: boolean }[] }, harness: string, host: string, tried?: { tool: string; said?: string }, what: MemSetupKind = { kind: "install" }): Promise<{ ok: true; taskId: string } | { ok: false; reason: MemPluginReason }> {
    // The agent itself does it when it is signed in there; else any agent signed in there can.
    const signed = dev.harnesses.filter((h) => h.installed && h.loggedIn);
    const body = signed.find((h) => h.harness === harness) ?? signed[0];
    const runner = d.runner();
    if (!body || !runner) return { ok: false, reason: "no_agent" };
    const lang = d.lang();
    const agent = harnessName(harness);
    const w = words(W, lang);
    const title = what.kind === "install" ? w.title : w[`title.${what.kind}`];
    try {
      const card = await runner.openTask({
        persona: d.persona.id,
        title: fill(title, { device: dev.name, agent }),
        brief: memSetupBrief({ agent, host, device: dev.name, lang, harness, what, ...(tried ? { tried } : {}) }),
        place: dev.home ? { kind: "none" } : { kind: "none", device: dev.id },
        harness: body.harness,
        language: lang,
        origin: "you",
      });
      saved.setups[card.taskId] = { device: dev.id, harness, ...(what.kind === "update" && what.from ? { from: what.from } : {}) };
      save();
      changed();
      return { ok: true, taskId: card.taskId };
    } catch {
      return { ok: false, reason: "failed" };
    }
  }

  /** D480: what the in-place choice shows (read only; see MemPlugins.mailboxLook). */
  async function mailboxLook(device: string, harness: string, partner: { space?: string }): Promise<MailboxLook> {
    if (!d.on() || !MEM_HOSTS[harness]) return { state: "failed" };
    const dev = (await d.devices().catch(() => [])).find((x) => x.id === device || x.name === device);
    if (!dev) return { state: "failed" };
    if (!dev.awake) return { state: "away" };
    if (!d.bridgeLook) return { state: "old" };
    const got = await d.bridgeLook(dev.id, dev.home).catch(() => undefined);
    if (got === "old") return { state: "old" };
    if (!got) return { state: "away" };
    if (!got.signedIn) return { state: "no_mem" };
    const { spaces, recommend } = mailboxChoice(got.setup, partner.space);
    if (!spaces.length) return { state: "failed" };
    return { state: "choose", spaces, ...(recommend ? { recommend } : {}) };
  }

  // A setup task that finished (or stopped to ask): read the check again on its computer.
  const off = d.log.subscribe((e: LogEvent) => {
    if (e.kind === "decision_resolved") {
      const r = e.body as Bodies["decision_resolved"];
      if (r.option !== "go") return;
      const card = d.log.read({ stream: "channel", kinds: ["decision"], limit: 200 }).find((x) => (x.body as Bodies["decision"]).decisionId === r.decisionId);
      const ask = (card?.body as Bodies["decision"] | undefined)?.memPlugin;
      if (ask) void install(ask.device, ask.harness);
      return;
    }
    if (e.kind === "task_open") {
      // D552: the work a setup task hands on (the mend, or the partner, opening it again elsewhere) is
      // the same setup: its line stays busy, and the check runs when that one ends.
      const o = e.body as Bodies["task_open"];
      const from = o.replaces ? (saved.setups[o.replaces] ?? ended.get(o.replaces)) : undefined;
      if (!o.replaces || !from || saved.setups[o.taskId]) return;
      ended.delete(o.replaces);
      saved.setups[o.taskId] = { device: from.device, harness: from.harness, ...(from.from ? { from: from.from } : {}) };
      delete saved.setups[o.replaces];
      save();
      return changed();
    }
    if (e.kind !== "task_state") return;
    const b = e.body as Bodies["task_state"];
    const s = saved.setups[b.taskId];
    if (!s || !FINISHED.has(b.attention)) return;
    if (b.attention !== "blocked") {
      handed.delete(`${s.device}:${s.harness}`);
      delete saved.setups[b.taskId];
      save();
      const t = now();
      for (const [k, v] of ended) if (t - v.at > ENDED_MS) ended.delete(k);
      ended.set(b.taskId, { ...s, at: t });
    }
    changed();
    void check(s.device).then(() => {
      // D552: an update that took: its line says the version it reached until the next check.
      const m = lineOf(s.device, s.harness);
      if (s.from && m?.state === "installed" && m.version && m.version !== s.from) {
        updated.set(`${s.device}:${s.harness}`, m.version);
        changed();
      }
    });
  });

  const every = d.everyMs ?? DAY;
  const timer = every > 0 ? setInterval(() => void check(), every) : undefined;
  (timer as { unref?: () => void } | undefined)?.unref?.();

  return {
    present(device, harness) {
      if (!d.on()) return false;
      const id = !device || device === "local" ? "local" : seen.has(device) ? device : (names.get(device) ?? device);
      const s = seen.get(id)?.[harness]?.state;
      // A review (two registrations, an install it can't call enabled) or an update still loads
      // the plugin's SessionStart bundle: counting only "installed" injected both (the author's Codex).
      return s !== undefined && s !== "absent";
    },
    view(deviceId, list) {
      if (!d.on()) return list;
      const got = seen.get(deviceId);
      if (!got) return list;
      return list.map((h) => {
        const m = lineOf(deviceId, h.harness);
        if (!m || !h.installed) return h;
        const task = setupOf(deviceId, h.harness);
        const key = `${deviceId}:${h.harness}`;
        // D552: busy from the tap: Mem's own command running, or the setup task still being opened.
        const busy = direct.has(key) || (!task && opening.has(key));
        const done = updated.get(key);
        // D597: the direct update handed to a task (said while it runs), or stuck with no task to take it.
        return { ...h, mem: { ...m, ...(task ? { taskId: task } : {}), ...(busy ? { busy: true as const } : {}), ...(fresh.has(key) ? { fresh: true as const } : {}), ...(done && !task && !busy ? { updated: true as const } : {}), ...(task && handed.has(key) ? { handed: true as const } : {}), ...(stuck.has(key) && m.state === "update" && !task && !busy ? { stuck: true as const } : {}) } };
      });
    },
    check,
    lines(harness) {
      if (!d.on()) return [];
      const out: { device: string; line: MemPluginView }[] = [];
      for (const id of seen.keys()) {
        const m = lineOf(id, harness);
        if (m) out.push({ device: id, line: m });
      }
      return out;
    },
    install,
    mailboxLook,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stop() {
      off();
      if (timer) clearInterval(timer);
    },
  };
}
