// D169: Nowledge Mem in the user's AI agents, per computer (design/memory.md "Mem and tasks").
// A task runs with the user's own Nowledge Mem plugin for its agent, as the persona's identity
// (D168), so where the plugin is matters: this keeps one line per agent per device from Mem's own
// local, read-only check (`nmem --json plugins inspect`): on the home here, on a worker through
// its `mem_plugins` op. The check runs when a device comes online, once a day, after an agent
// update or a sign-in, and after a setup task ends; the runner asks `present` to know whether a
// task there has the plugin in any form (else Ducter's own read-only memory stands in).
//
// Installing is never silent (D17: the agents' setup is the user's): 装上 / Install opens one task
// on that computer, with that agent, that follows Mem's official setup guide and reads the check
// again. Where a signed-in agent lacks it, Ducter recommends it once per computer and agent: one
// card, Go 装上 suggested, nothing happens until the user taps.
// Memory off (Settings › 记得什么): no checks shown, no cards, no installs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { harnessName, type Bodies, type DeviceHarness, type LogEvent, type MemPluginReason, type MemPluginView } from "@ducter/protocol";
import type { LogStore, Runner, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { MEM_HOSTS } from "@ducter/protocol/src/mem-plugins.ts";

type Plugins = Record<string, MemPluginView>;

export interface MemPluginsDeps {
  dataDir: string;
  log: LogStore;
  tasks: TaskRegistry;
  persona: { id: string };
  runner: () => Runner | undefined;
  /** Memory on (Settings › 记得什么 and the run). */
  on: () => boolean;
  zh: () => boolean;
  /** The check on the home; undefined when nmem isn't here or can't tell. */
  inspectLocal: () => Promise<Plugins | undefined>;
  /** The check on a worker (its `mem_plugins` op); undefined when it is away or too old to have it. */
  inspectWorker: (deviceId: string) => Promise<Plugins | undefined>;
  /** The devices now: id, name, home, awake, and which agents are installed and signed in. */
  devices: () => Promise<{ id: string; name: string; home: boolean; awake: boolean; harnesses: { harness: string; installed: boolean; loggedIn: boolean }[] }[]>;
  now?: () => number;
  /** How often every awake device is checked again (default a day; 0 = only on events). */
  everyMs?: number;
}

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
  /** 装上 / Install: opens the setup task on that device with that agent. */
  install(device: string, harness: string): Promise<{ ok: true; taskId: string } | { ok: false; reason: MemPluginReason }>;
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
  /** Open setup tasks: taskId -> device, harness. */
  setups: Record<string, { device: string; harness: string }>;
}

const DAY = 24 * 60 * 60 * 1000;
const FINISHED = new Set(["done_claimed", "done", "failed", "dropped", "blocked"]);

/** D169: the brief of the task that puts Nowledge Mem into one of the user's own agents on a computer. */
export function memSetupBrief(o: { agent: string; host: string; device: string; zh: boolean }): string {
  const lang = o.zh ? "Write your report in Chinese (简体中文)." : "Write your report in English.";
  return `Set up Nowledge Mem for ${o.agent} on this computer (${o.device}), for the user's own use of ${o.agent} outside Ducter. The user tapped Install for this.

1. Read Nowledge Mem's official setup guide at https://mem.nowledge.co/SKILL.md and follow it for the host "${o.host}". It is the only source of the steps; don't improvise others.
2. It changes only ${o.agent}'s own plugin or MCP setup and Nowledge Mem's own config on this computer. Nothing of Ducter's. Back up a file before editing it by hand, as the guide says.
3. Never guess a server address, an API key or a workspace, and never print a key. If Nowledge Mem isn't connected on this computer (\`nmem doctor\` fails), stop and ask the user for a connect link (report_to_main, state "needs_input", with no default).
4. When it is in, run \`nmem --json plugins inspect --host ${o.host}\` and report what it says. Say plainly that ${o.agent} has to be restarted (a new session) before it uses it.
5. If a step fails, try its fix once, then stop and report the exact error.

${lang} Done means: installed and the check says so, or a clear reason why not.`;
}

export function createMemPlugins(d: MemPluginsDeps): MemPlugins {
  const now = d.now ?? (() => Date.now());
  const file = join(d.dataDir, "mem-plugins.json");
  const load = (): Saved => {
    try {
      if (existsSync(file)) {
        const j = JSON.parse(readFileSync(file, "utf8"));
        return { since: Number(j.since) || now(), known: j.known ?? {}, offered: Array.isArray(j.offered) ? j.offered : [], setups: j.setups ?? {} };
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
  const fns = new Set<() => void>();
  const changed = () => {
    for (const fn of fns) fn();
  };

  async function checkOne(id: string, home: boolean): Promise<void> {
    if (!d.on()) return;
    const got = await (home ? d.inspectLocal() : d.inspectWorker(id)).catch(() => undefined);
    if (!got) return;
    seen.set(id, got);
    await offers(id, got);
    changed();
  }

  async function check(deviceId?: string): Promise<void> {
    if (!d.on()) return;
    const list = await d.devices().catch(() => []);
    for (const x of list) names.set(x.name, x.id);
    const todo = list.filter((x) => (deviceId ? x.id === deviceId || x.name === deviceId : x.awake));
    await Promise.all(
      todo.map((x) => {
        const busy = running.get(x.id);
        if (busy) return busy;
        const p = checkOne(x.id, x.home).finally(() => running.delete(x.id));
        running.set(x.id, p);
        return p;
      }),
    );
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
      if (got[h]?.state !== "absent" || saved.offered.includes(key) || setupOf(id, h)) continue;
      saved.offered.push(key);
      offer(id, dev.name, h);
    }
    save();
  }

  function offer(device: string, deviceName: string, harness: string) {
    const zh = d.zh();
    const agent = harnessName(harness);
    const body: Bodies["decision"] = {
      decisionId: "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10),
      question: zh
        ? `${deviceName} 上的 ${agent} 还没装 Nowledge Mem。装上以后，我在那儿做事和你自己用 ${agent} 时都记得你；会改 ${agent} 自己的设置。`
        : `${agent} on ${deviceName} doesn't have Nowledge Mem. With it, my work there and your own ${agent} sessions both remember you; it changes ${agent}'s own settings.`,
      goLabel: zh ? "装上" : "Install",
      // Recommended, never applied by itself: Go is the suggestion, and it waits for the tap (no timer).
      defaultOption: "go",
      reversible: true,
      memPlugin: { device, deviceName, harness },
    };
    d.log.append({ stream: "channel", origin: "system", kind: "decision", body });
  }

  const setupOf = (device: string, harness: string) => Object.entries(saved.setups).find(([, s]) => s.device === device && s.harness === harness)?.[0];

  async function install(device: string, harness: string): Promise<{ ok: true; taskId: string } | { ok: false; reason: MemPluginReason }> {
    if (!d.on()) return { ok: false, reason: "off" };
    const host = MEM_HOSTS[harness];
    const dev = (await d.devices().catch(() => [])).find((x) => x.id === device || x.name === device);
    if (!host || !dev) return { ok: false, reason: "unknown" };
    if (!dev.awake) return { ok: false, reason: "offline" };
    const open = setupOf(dev.id, harness);
    if (open) return { ok: false, reason: "running" };
    // The agent itself does it when it is signed in there; else any agent signed in there can.
    const signed = dev.harnesses.filter((h) => h.installed && h.loggedIn);
    const body = signed.find((h) => h.harness === harness) ?? signed[0];
    const runner = d.runner();
    if (!body || !runner) return { ok: false, reason: "no_agent" };
    const zh = d.zh();
    const agent = harnessName(harness);
    try {
      const card = await runner.openTask({
        persona: d.persona.id,
        title: zh ? `给 ${dev.name} 上的 ${agent} 装上 Nowledge Mem` : `Install Nowledge Mem for ${agent} on ${dev.name}`,
        brief: memSetupBrief({ agent, host, device: dev.name, zh }),
        place: dev.home ? { kind: "none" } : { kind: "none", device: dev.id },
        harness: body.harness,
        language: zh ? "zh" : "en",
        origin: "you",
      });
      saved.setups[card.taskId] = { device: dev.id, harness };
      save();
      changed();
      return { ok: true, taskId: card.taskId };
    } catch {
      return { ok: false, reason: "failed" };
    }
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
    if (e.kind !== "task_state") return;
    const b = e.body as Bodies["task_state"];
    const s = saved.setups[b.taskId];
    if (!s || !FINISHED.has(b.attention)) return;
    if (b.attention !== "blocked") {
      delete saved.setups[b.taskId];
      save();
    }
    changed();
    void check(s.device);
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
        const m = got[h.harness];
        if (!m || !h.installed) return h;
        const task = setupOf(deviceId, h.harness);
        return { ...h, mem: { ...m, ...(task ? { taskId: task } : {}) } };
      });
    },
    check,
    install,
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
