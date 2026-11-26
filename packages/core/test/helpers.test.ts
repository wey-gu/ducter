// D494: a helper's address, made by the home over the FAKE nmem (never the person's Mem): its identity
// enrolled with its name and card, the home's one connection for it in the person's own place, a
// passive setup to confirm; an nmem without Mem's identity inbox waits, said so; stopping ends the
// connection; a second helper never takes a name already used.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createBridgeLink, nmemCall } from "../src/bridge-link.ts";
import { createHelpers, helperItems, helperSaidWords } from "../src/helpers.ts";
import type { TaskCard } from "@ducter/protocol";
import { tempDir } from "./helpers.ts";

setDefaultTimeout(30_000);
const FAKE = resolve(import.meta.dir, "../../partner/eval/fake-bridge-nmem.ts");
let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function home(extra: Record<string, string> = {}) {
  const t = tempDir();
  stops.push(t.cleanup);
  const bin = join(t.dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(t.dir, "state.json");
  writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
  const argvLog = join(t.dir, "argv.log");
  const env = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog, NMEM_FAKE_VERSION: "0.10.122", ...extra };
  const link = createBridgeLink({ dataDir: t.dir, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin, env }), env });
  const calls = (): string[][] => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const said: string[] = [];
  const helpers = createHelpers({ dataDir: t.dir, link: () => link, partnerName: () => "Ducter", home: () => "hel", say: (x, how) => said.push(`${how}:${x.name}`) });
  return { link, helpers, calls, state, said };
}

describe("D494: a helper's address", () => {
  test("enrolled with its name and card, connected by the home in the person's own place, confirmed", async () => {
    const h = home();
    const made = h.helpers.make({ name: "Nowledge Mem PR babysitter", about: "PRs my agents hand over", brief: "never merge" });
    expect(made.ok).toBe(true);
    await h.helpers.tick();
    const got = h.helpers.list()[0]!;
    expect(got).toMatchObject({ name: "Nowledge Mem PR babysitter", agentId: "ducter-helper-nowledge-mem-pr-babysitter", state: "on", mem: "ready" });
    expect(got.link?.context).toBe("ducter-helper-nowledge-mem-pr-babysitter-on-hel");
    const enroll = h.calls().find((c) => c.includes("enroll"))!;
    expect(enroll.slice(1, 4)).toEqual(["agents", "enroll", "ducter-helper-nowledge-mem-pr-babysitter"]);
    expect(enroll[enroll.indexOf("--name") + 1]).toBe("Nowledge Mem PR babysitter");
    expect(enroll[enroll.indexOf("--description") + 1]).toContain("a helper of Ducter");
    const connect = h.calls().find((c) => c.includes("connections") && c.includes("connect") && !c.includes("--help"))!;
    expect(connect[connect.indexOf("--agent-id") + 1]).toBe("ducter-helper-nowledge-mem-pr-babysitter");
    expect(h.calls().some((c) => c.includes("--enable"))).toBe(false); // never Mem's enable
    expect(h.helpers.listening().map((x) => x.name)).toEqual(["Nowledge Mem PR babysitter"]);
    // Stopped: the connection is ended in Mem, and nothing reads it.
    await h.helpers.stop(got.id);
    expect(h.calls().at(-1)?.slice(1, 4)).toEqual(["bridge", "connections", "revoke"]);
    expect(h.helpers.listening()).toEqual([]);
    expect(h.helpers.make({ name: "nowledge mem pr BABYSITTER", about: "", brief: "" })).toEqual({ ok: false, error: "taken" });
  });

  test("an nmem without Mem's identity inbox: the helper waits, with why", async () => {
    const h = home({ NMEM_FAKE_VERSION: "0.10.120" });
    h.helpers.make({ name: "PR babysitter", about: "PRs", brief: "" });
    await h.helpers.tick();
    expect(h.helpers.list()[0]).toMatchObject({ mem: "waiting", detail: "this nmem has no identity inbox (0.10.121 or later)" });
    expect(h.calls().some((c) => c.includes("enroll") || (c.includes("connect") && !c.includes("--help")))).toBe(false);
  });
});

describe("D507: the partner's word when the address stands, and what a helper keeps", () => {
  test("ready is said once, in the conversation; a wait says nothing (it comes back by itself)", async () => {
    const h = home();
    h.helpers.make({ name: "PR babysitter", about: "PRs", brief: "" });
    await h.helpers.tick();
    expect(h.said).toEqual(["ready:PR babysitter"]);
    expect(h.helpers.list()[0]!.said).toBe("ready");
    // Stopped and taken up again: connected again, never said twice.
    const id = h.helpers.list()[0]!.id;
    await h.helpers.stop(id);
    h.helpers.resume(id);
    await h.helpers.tick();
    expect(h.said).toEqual(["ready:PR babysitter"]);
    const w = home({ NMEM_FAKE_VERSION: "0.10.120" });
    w.helpers.make({ name: "Later", about: "", brief: "" });
    await w.helpers.tick();
    expect(w.said).toEqual([]);
  });

  test("the words name the helper and, for a refusal, what to do and where", () => {
    expect(helperSaidWords("zh", { name: "Nowledge Mem PR Babysitter" }, "ready")).toBe("Nowledge Mem PR Babysitter 好了：你的 agent 在 Nowledge Mem 里按这个名字找到它，就能把活交给它。交给它的每件活都会出现在任务里，挂在它名下。");
    expect(helperSaidWords("en", { name: "B" }, "refused")).toContain("Tell me another name");
    expect(helperSaidWords("zh", { name: "B" }, "refused")).toContain("设置 › Agent 通信");
  });

  test("a helper keeps a task until it ends, and a finished one while its PR is open", () => {
    const card = (taskId: string, attention: TaskCard["attention"], extra: Partial<TaskCard> = {}) => ({ taskId, title: taskId, attention, ...extra }) as TaskCard;
    const cards: Record<string, TaskCard> = {
      a: card("a", "working"),
      b: card("b", "needs_you", { pendingDecision: { question: "Comment /test on #10932?" } as TaskCard["pendingDecision"] }),
      // D508: where each PR stands is the card's (one model): c's is signed off and green, g's waits for a review.
      c: card("c", "done", { prs: [{ pr: "nowledge-co/mem#10847", url: "", state: "open", at: "2026-11-24T08:00:00Z", standing: { at: "2026-11-24T08:00:00Z", approvedBy: ["hawkingrei"], merge: "clean" } }] }),
      d: card("d", "done", { prs: [{ pr: "nowledge-co/mem#10850", url: "", state: "merged", at: "2026-11-24T08:00:00Z" }] }),
      g: card("g", "done", { prs: [{ pr: "nowledge-co/mem#10851", url: "", state: "open", at: "2026-11-24T08:00:00Z", standing: { at: "2026-11-24T08:00:00Z", awaiting: ["hawkingrei"] } }] }),
      e: card("e", "dropped"),
      f: card("f", "working"),
    };
    const index = new Map([["a", "h"], ["b", "h"], ["c", "h"], ["d", "h"], ["e", "h"], ["f", "other"], ["g", "h"]]);
    const got = helperItems("h", { tasksOf: () => index, card: (t) => cards[t] });
    expect(got.map((x) => [x.taskId, x.at])).toEqual([["b", "you"], ["c", "ready"], ["a", "work"], ["g", "work"]]);
    expect(got[0]!.yours).toBe("Comment /test on #10932?");
    expect(got[1]).toMatchObject({ pr: "nowledge-co/mem#10847", said: { phase: "ready", by: ["hawkingrei"] } });
    expect(got[3]).toMatchObject({ pr: "nowledge-co/mem#10851", said: { phase: "review", by: ["hawkingrei"] } });
  });
});
