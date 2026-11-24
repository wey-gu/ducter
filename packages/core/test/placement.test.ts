// D538: where work goes, from what each computer measured of itself and what the person said once.
// The fake fleet: hel is the home (7.6 GB, no swap, 1.0 GB free: hel at 07:26 on 2026-11-24) and
// haswell does tasks for it (64 GB, 41 GB free). Heavy verification goes to haswell; a light,
// chat-sized task stays on hel; the person's 少放 rule wins over Ducter's own heuristics; a pin in
// the moment wins over it. All fakes: no git, no network, no Mem.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeviceHarness, DeviceView, RuleView } from "@ducter/protocol";
import type { ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import { createResourceProbe, heavySlots, meminfo, oomKills, ownCgroup, parseResources, resourcesMoved, roomFor, vmStatFree, type ResourceSys } from "@ducter/protocol/src/resources.ts";
import { chooseBody, computersOf, type BodyPick, type Computer } from "../src/candidates.ts";
import { createPlaces, createRepoWhere, type WhereComputer } from "../src/repo-where.ts";
import { openRules, placeRulesFor, placeRuleText } from "../src/rules.ts";
import { createPlacementMem, memIdFor, PLACEMENT_LABEL, type PlacementMemClient } from "../src/placement-mem.ts";

const GB = 2 ** 30;
const h = (harness: string, o: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness, installed: true, loggedIn: true, canBePartner: true, ...o });
const settings = { brain: { harness: "claude-code" as const }, taskAccounts: {} } as any;

function fleet(o: { helFree?: number; haswellFree?: number; heavyOnHaswell?: number } = {}): Computer[] {
  return [
    { id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [h("codex")], web: { on: true, where: "ducter" }, mem: { total: 7.6 * GB, free: (o.helFree ?? 1.0) * GB } },
    { id: "dev_haswell", name: "haswell", home: false, state: "awake", alwaysOn: true, mac: false, harnesses: [h("codex")], web: { on: true, where: "ducter" }, mem: { total: 64 * GB, free: (o.haswellFree ?? 41) * GB }, ...(o.heavyOnHaswell ? { heavyNow: o.heavyOnHaswell } : {}) },
  ];
}
const choose = (computers: Computer[], extra: Partial<Parameters<typeof chooseBody>[0]> = {}) => chooseBody({ work: { title: "x" }, computers, settings, rules: [], ...extra }) as BodyPick;
const placeRule = (o: Partial<RuleView> & { device: string; where: RuleView["where"] }): RuleView => ({ id: `rule_${o.device}`, text: o.text ?? "", harness: "", match: [], createdAt: "2026-11-24T08:00:00.000Z", ...o });

describe("the ranking (candidates.ts)", () => {
  test("heavy verification goes to haswell, and says hel hasn't the memory", () => {
    const p = choose(fleet(), { work: { title: "跑全部测试和 typecheck，再用 Playwright 过一遍", kind: "code" }, needs: { heavy: true } });
    expect(p).toMatchObject({ device: "haswell", deviceId: "dev_haswell" });
    expect(p.waits).toBeUndefined();
    expect(p.why.where).toMatchObject({ device: "haswell", kind: "room", other: "hel" });
  });

  test("a light, chat-sized task stays on the home", () => {
    const p = choose(fleet(), { work: { title: "查一下今天的天气" } });
    expect(p).toMatchObject({ device: "local", home: true });
    expect(p.waits).toBeUndefined();
  });

  test("the person's 少放 rule wins over Ducter's own heuristics (the home, one hop fewer)", () => {
    const rules = [placeRule({ device: "hel", text: "活少放 hel", where: { avoid: true } })];
    const p = choose(fleet({ helFree: 6 }), { work: { title: "查一下今天的天气" }, rules });
    expect(p).toMatchObject({ device: "haswell" });
    expect(p.why.where).toMatchObject({ kind: "you", ruleId: "rule_hel", text: "活少放 hel" });
  });

  test("a 少放 rule for web work leaves other work alone; a pin in the moment passes it", () => {
    const rules = [placeRule({ device: "hel", text: "hel 别跑浏览器", where: { avoid: true, web: true } })];
    expect(choose(fleet({ helFree: 6 }), { work: { title: "查一下天气" }, rules })).toMatchObject({ device: "local" });
    expect(choose(fleet({ helFree: 6 }), { work: { title: "看一下这个网页" }, needs: { browse: true }, rules })).toMatchObject({ device: "haswell" });
    expect(choose(fleet({ helFree: 6 }), { work: { title: "看一下这个网页" }, needs: { browse: true }, rules, pinDevice: "hel" })).toMatchObject({ device: "local" });
  });

  test("a 多放 rule for heavy work sends it there and says the person's words", () => {
    const rules = [placeRule({ device: "haswell", text: "验证的活多放 haswell", where: { heavy: true } })];
    const p = choose(fleet({ helFree: 6 }), { work: { title: "跑测试" }, needs: { heavy: true }, rules });
    expect(p).toMatchObject({ device: "haswell" });
    expect(p.why.where).toMatchObject({ kind: "you", text: "验证的活多放 haswell" });
  });

  test("no computer has room: heavy work waits for room where it fits best, never starts", () => {
    const p = choose(fleet({ haswellFree: 2 }), { work: { title: "跑测试" }, needs: { heavy: true } });
    expect(p.waits).toBe("room");
  });

  test("the concurrency guard: hel's 7.6 GB takes one heavy task, haswell's 64 GB eight", () => {
    expect(heavySlots(7.6 * GB)).toBe(1);
    expect(heavySlots(64 * GB)).toBe(8);
    expect(roomFor({ mem: { total: 7.6 * GB, free: 5 * GB }, heavyNow: 1 })).toBe(false);
    expect(roomFor({ mem: { total: 64 * GB, free: 30 * GB }, heavyNow: 7 })).toBe(true);
    expect(roomFor({ mem: { total: 64 * GB, free: 30 * GB }, heavyNow: 8 })).toBe(false);
    expect(roomFor({})).toBe(true); // a worker before D538: no opinion
    // haswell full of heavy work: the next waits rather than crowding it.
    expect(choose(fleet({ heavyOnHaswell: 8 }), { work: { title: "x" }, needs: { heavy: true } }).waits).toBe("room");
  });

  test("computersOf reads a computer's own look only while it is awake", () => {
    const dv = (state: DeviceView["state"]): DeviceView => ({ id: "w1", name: "haswell", kind: "server", home: false, state, harnesses: [], abilities: [], resources: { at: "", memTotal: 64 * GB, memFree: 41 * GB, cores: 16 } });
    expect(computersOf([dv("awake")])[0]!.mem).toEqual({ total: 64 * GB, free: 41 * GB });
    expect(computersOf([dv("asleep")])[0]!.mem).toBeUndefined();
  });
});

describe("repositories (repo-where.ts)", () => {
  const HEL: WhereComputer = { id: "local", name: "hel", home: true, online: true, build: 0 };
  const HASWELL: WhereComputer = { id: "dev_haswell", name: "haswell", home: false, online: true, build: 0 };
  const repoWorld = (disk: Record<string, { clones: string[]; canRead?: boolean }>, o: { noRoom?: string[]; rules?: RuleView[] } = {}) =>
    createRepoWhere({
      computers: () => [HEL, HASWELL],
      async clones(dev, remote, probe) {
        const d = disk[dev]!;
        const a: ClonesAnswer = { clones: d.clones.map((p) => ({ name: "ducter", path: p, touchedAt: "2026-11-18T10:00:00.000Z", remote: `github.com/${remote}` })) };
        return probe && !a.clones.length && d.canRead !== undefined ? { ...a, canRead: d.canRead } : a;
      },
      async folder() {
        return { exists: false };
      },
      rules: () => o.rules ?? [],
      noRoom: async () => o.noRoom ?? [],
    });

  test("heavy work: hel's copy has no room, so the code is cloned on haswell; light work keeps hel's copy", async () => {
    const disk = { local: { clones: ["/root/dev/ducter"] }, dev_haswell: { clones: [], canRead: true } };
    const heavy = await repoWorld(disk, { noRoom: ["local"] }).resolve({ remote: "wey-gu/ducter", needs: { heavy: true }, texts: ["跑全部测试"] });
    expect(heavy).toMatchObject({ ok: true, how: "clone", computer: "haswell", placed: { roomless: ["hel"] } });
    const light = await repoWorld(disk, { noRoom: ["local"] }).resolve({ remote: "wey-gu/ducter", texts: ["改一个错字"] });
    expect(light).toMatchObject({ ok: true, how: "found", computer: "hel" });
  });

  test("copies on both: heavy work takes haswell's; the person's 多放 rule names it with their words", async () => {
    const disk = { local: { clones: ["/root/dev/ducter"] }, dev_haswell: { clones: ["/home/wey/dev/ducter"] } };
    expect(await repoWorld(disk, { noRoom: ["local"] }).resolve({ remote: "wey-gu/ducter", needs: { heavy: true } })).toMatchObject({ computer: "haswell" });
    const rules = [placeRule({ device: "haswell", text: "验证的活多放 haswell", where: { heavy: true } })];
    expect(await repoWorld(disk, { rules }).resolve({ remote: "wey-gu/ducter", needs: { heavy: true } })).toMatchObject({ computer: "haswell", placed: { rule: { text: "验证的活多放 haswell" } } });
  });

  test("a 少放 rule keeps the work off that computer's copy when another has one", async () => {
    const disk = { local: { clones: ["/root/dev/ducter"] }, dev_haswell: { clones: ["/home/wey/dev/ducter"] } };
    const rules = [placeRule({ device: "haswell", text: "活少放 haswell", where: { avoid: true } })];
    expect(await repoWorld(disk, { rules }).resolve({ remote: "wey-gu/ducter" })).toMatchObject({ computer: "hel" });
  });

  test("pre-flight: the partner's own pick of a computer with no room goes back with the facts; the person's word holds", async () => {
    const disk = { local: { clones: ["/root/dev/ducter"] }, dev_haswell: { clones: ["/home/wey/dev/ducter"] } };
    const places = createPlaces({
      where: repoWorld(disk, { noRoom: ["local"] }),
      computers: () => [HEL, HASWELL],
      tasks: { get: () => undefined },
      opened: () => undefined,
      lang: () => "zh",
      rules: () => [],
      noRoom: async () => [{ id: "local", free: 1.0 * GB }],
    });
    const back = await places.preflight({ place: { kind: "repo", device: "hel", repoPath: "/root/dev/ducter" }, remote: "wey-gu/ducter", texts: ["跑全部测试"], userTexts: [], needs: { heavy: true } });
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.error).toContain("hel has 1.0 GB free");
    const theirs = await places.preflight({ place: { kind: "repo", device: "hel", repoPath: "/root/dev/ducter" }, remote: "wey-gu/ducter", texts: ["跑全部测试"], userTexts: [], needs: { heavy: true }, where: { on: "hel" } });
    expect(theirs).toMatchObject({ ok: true, computer: "hel" });
  });
});

describe("the rules store (rules.ts)", () => {
  let dir = "";
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  test("a computer rule: kept, changed in place, replaced by the same work said again, matched by shape", () => {
    dir = mkdtempSync(join(tmpdir(), "ducter-place-rules-"));
    const rules = openRules(dir);
    const a = rules.addWhere({ text: "haswell 内存大，验证的活多放它", device: "haswell", heavy: true });
    expect(a).toMatchObject({ harness: "", device: "haswell", where: { heavy: true } });
    // Changed from its card: the same id, 少放 now.
    const b = rules.addWhere({ id: a.id, text: placeRuleText("zh", "haswell", true, "heavy"), device: "haswell", avoid: true, heavy: true });
    expect(b.id).toBe(a.id);
    expect(rules.list()).toHaveLength(1);
    expect(b.text).toBe("构建、测试这类重活少放 haswell");
    // Said again for the same work: the newer replaces it.
    rules.addWhere({ text: "重活多放 haswell", device: "haswell", heavy: true });
    expect(rules.list()).toHaveLength(1);
    expect(rules.list()[0]!.where?.avoid).toBeUndefined();
    rules.addWhere({ text: "hel 别跑浏览器", device: "hel", avoid: true, web: true });
    const list = rules.list();
    expect(placeRulesFor(list, { title: "跑测试" }, { heavy: true }).map((r) => r.device)).toEqual(["haswell"]);
    expect(placeRulesFor(list, { title: "看网页" }, { browse: true }).map((r) => r.device)).toEqual(["hel"]);
    expect(placeRulesFor(list, { title: "回一句话" }, undefined)).toEqual([]);
    // Kept across a restart; an agent rule for the same words is a different rule.
    expect(openRules(dir).list()).toHaveLength(2);
    rules.add({ text: "后端的事 → Codex", harness: "codex", match: ["后端"] });
    expect(openRules(dir).list()).toHaveLength(3);
    expect(placeRuleText("en", "hel", true, "web")).toBe("Less web work on hel");
  });
});

describe("the Mem mirror (placement-mem.ts)", () => {
  let dir = "";
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const fakeMem = () => {
    const added: { id: string; title: string; content: string; labels: string[]; unitType: string }[] = [];
    const archived: string[] = [];
    let labeled: { id: string; title: string; content: string }[] = [];
    const client: PlacementMemClient = {
      add: async (m) => (added.push(m), { ok: true, id: m.id }),
      archive: async (id) => (archived.push(id), true),
      labeled: async () => ({ ok: true, hits: labeled }),
    };
    return { client, added, archived, setLabeled: (l: typeof labeled) => (labeled = l) };
  };

  test("while Mem is on, each computer rule is the person's labelled preference; removed here, archived there", async () => {
    dir = mkdtempSync(join(tmpdir(), "ducter-place-mem-"));
    const rules = openRules(dir);
    const m = fakeMem();
    let on = false;
    const mirror = createPlacementMem({ dataDir: dir, rules, on: () => on, client: () => m.client, persona: () => "default" });
    const r = rules.addWhere({ text: "验证的活多放 haswell", device: "haswell", heavy: true });
    await mirror.sync();
    expect(m.added).toHaveLength(0); // Mem off: nothing leaves
    on = true;
    await mirror.sync();
    expect(m.added).toEqual([expect.objectContaining({ id: memIdFor(r.id), title: "验证的活多放 haswell", labels: [PLACEMENT_LABEL], unitType: "preference" })]);
    expect(m.added[0]!.content).toStartWith("Prefers heavy work");
    expect(rules.list()[0]!.where?.mem).toBe(memIdFor(r.id));
    await mirror.sync();
    expect(m.added).toHaveLength(1); // unchanged: not written again
    rules.remove(r.id);
    await mirror.sync();
    expect(m.archived).toEqual([memIdFor(r.id)]);
  });

  test("Mem's own labelled memories are hints, each offered once; Ducter's own mirror never is", async () => {
    dir = mkdtempSync(join(tmpdir(), "ducter-place-hints-"));
    const rules = openRules(dir);
    const m = fakeMem();
    const mirror = createPlacementMem({ dataDir: dir, rules, on: () => true, client: () => m.client, persona: () => "default" });
    const r = rules.addWhere({ text: "重活多放 haswell", device: "haswell", heavy: true });
    await mirror.sync();
    m.setLabeled([
      { id: memIdFor(r.id), title: "重活多放 haswell", content: "Prefers heavy work…" },
      { id: "mem_from_claude", title: "GPU jobs", content: "Prefers GPU training jobs on the box called tower." },
    ]);
    await mirror.refreshHints(true);
    expect(mirror.takeHints()).toEqual([{ text: "Prefers GPU training jobs on the box called tower." }]);
    expect(mirror.takeHints()).toEqual([]);
  });
});

describe("the probe (protocol/src/resources.ts)", () => {
  test("Linux: MemAvailable, swap, the cgroup's out-of-memory stops dated from the second look", async () => {
    let kills = 3;
    const files: Record<string, () => string> = {
      "/proc/meminfo": () => "MemTotal:        7969876 kB\nMemFree:          200000 kB\nMemAvailable:    1048576 kB\nSwapTotal:             0 kB\n",
      "/proc/self/cgroup": () => "0::/user.slice/user-0.slice/user@0.service/app.slice/ducter.service\n",
      "/sys/fs/cgroup/user.slice/user-0.slice/user@0.service/app.slice/ducter.service/memory.events": () => `low 0\nhigh 0\nmax 4\noom 4\noom_kill ${kills}\n`,
    };
    let t = Date.parse("2026-11-24T07:26:00Z");
    const sys: ResourceSys = { platform: "linux", now: () => t, totalmem: () => 7969876 * 1024, freemem: () => 0, cores: () => 4, cpu: () => "AMD EPYC", load: () => 3.2, read: (p) => files[p]?.(), statfs: () => ({ free: 40 * GB, total: 75 * GB }), run: async () => undefined };
    const probe = createResourceProbe({ dir: "/root/.ducter", sys });
    const a = await probe.look();
    expect(a).toMatchObject({ memFree: 1 * GB, swapTotal: 0, cores: 4, diskFree: 40 * GB });
    expect(a.oom).toBeUndefined(); // the stops before this process aren't dated
    kills = 5;
    t += 60_000;
    expect((await probe.look()).oom).toHaveLength(2);
    t += 25 * 3600_000;
    expect((await probe.look()).oom).toBeUndefined(); // a day later they've aged out
  });

  test("macOS vm_stat, the parsers, the wire, and when a look is news", () => {
    expect(vmStatFree("Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:  1000.\nPages active: 5.\nPages inactive: 2000.\nPages speculative: 100.\nPages purgeable: 50.\n")).toBe(3150 * 16384);
    expect(meminfo("MemAvailable: 4 kB", "MemAvailable")).toBe(4096);
    expect(ownCgroup("0::/\n")).toBe("/sys/fs/cgroup");
    expect(oomKills("oom_kill 7")).toBe(7);
    expect(parseResources({ memTotal: 8, memFree: 99, cores: 2, oom: ["nope", "2026-11-24T07:26:01Z"] })).toMatchObject({ memFree: 8, oom: ["2026-11-24T07:26:01Z"] });
    expect(parseResources({ memTotal: 0, memFree: 1, cores: 1 })).toBeUndefined();
    const base = { at: "", memTotal: 64 * GB, memFree: 41 * GB, cores: 16 };
    expect(resourcesMoved(base, { ...base, memFree: 40 * GB })).toBe(false);
    expect(resourcesMoved(base, { ...base, memFree: 30 * GB })).toBe(true);
  });
});
