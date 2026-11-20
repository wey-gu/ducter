// D412: the second live trial on real Mem (2026-11-20 02:58 UTC, nmem 0.10.121, research/161 §10)
// went from 1/15 to 10/17. What still failed, from its raw output:
// (1) the terminal never opened Ducter's mail: the trial's guard knew Ducter's mail by message id,
//     the peer opened it the way Mem's own `open_args` say, by its `bm1:` reference, and every open
//     was refused (5 refusals; no peer `open` reached Mem). S2's missing answer followed from it.
// (2) S1's card named the person to himself (「Weyl 那边的 Claude Code」): Mem names no member, and
//     the name came from the body's first line, "Task (from Weyl, via Claude Code in ~/dev/ducter)".
// (3) S3: two questions to the same silent terminal got two follow-through lines an hour apart.
// The shapes below are the run's own (ids and references shortened). Stubs and fakes only.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPartner, type Bodies, type BridgeClient, type BridgeMessage } from "../src/index.ts";
import { followCandidates, followGroup, followLine, namesForUser, type OutOp } from "../src/bridge-out.ts";
import { refMessage } from "../eval/bridge-trial.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner, type Script } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-bridge-real2-test-"));
const HOUR = 3_600_000;
const GUARD = resolve(import.meta.dir, "../eval/bridge-peer-guard.ts");
const PEER = "bridge-b80321d7-46b7-4f80-bfc5-b96fba5bc563";
const OURS = "9157e81f-42cb-49e3-93b4-8abd353a966e"; // Ducter's claim, as its `reply` returned it (raw 020)
const OLDER = "0aa3c2b1-77d0-4b8e-9f00-3c2d1e4f5a6b"; // older mail in the person's own mailbox
// A `bm1:` reference as the peer's inbox gives it (raw 022): base64url JSON, the message id last.
const bm1 = (message: string) =>
  "bm1:" +
  Buffer.from(
    JSON.stringify({
      destination: "2067c06e6278ba49",
      selection: { scope: { store_id: "7330654c", store_incarnation: "fb8b5ccc", workspace_id: "7330654c", space_id: "default" }, address: { custodian_id: "4e742092", agent_id: "bridge-9e186121", identity_birth: "2428d832", attachment_id: "34f1994d", attachment_generation: 1 } },
      message,
    }),
  ).toString("base64url");
// Mem's own argv for that entry (raw 022's `open_args`, `reply_args_prefix`).
const openArgs = (m: string) => ["--json", "--api-url=https://cloud.nowledge.co/remote-api", `--agent-context=${PEER}`, "bridge", "open", bm1(m)];
const replyArgs = (m: string) => ["--json", "--api-url=https://cloud.nowledge.co/remote-api", `--agent-context=${PEER}`, "bridge", "reply", bm1(m), "--body", "写到 send 了，今晚 10 点提 PR。"];

function guarded() {
  const dir = tmp();
  const log = join(dir, "calls.log");
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\necho '{"message":"m","body":"ok"}'\n`);
  chmodSync(bin, 0o755);
  writeFileSync(join(dir, "allow.txt"), OURS + "\n"); // what the trial writes: the ids Ducter's sends returned
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["bun", GUARD, ...args], { env: { PATH: process.env.PATH ?? "", BRIDGE_GUARD_REAL: bin, BRIDGE_GUARD_ALLOW: join(dir, "allow.txt"), BRIDGE_GUARD_LOG: join(dir, "guard.log") } });
    return { code: p.exitCode, out: p.stdout.toString() };
  };
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
  return { run, calls };
}

describe("D412 (1): the trial's guard and Mem's own open/reply argv", () => {
  test("a reference names its message; anything else is itself", () => {
    expect(refMessage(bm1(OURS))).toBe(OURS);
    expect(refMessage(OURS)).toBe(OURS);
    expect(refMessage("bm1:not-json")).toBe("bm1:not-json");
    expect(refMessage(undefined)).toBeUndefined();
  });

  test("the peer opens and answers Ducter's mail by its reference, as Mem's argv says", () => {
    const g = guarded();
    expect(g.run(openArgs(OURS)).code).toBe(0);
    expect(g.run(replyArgs(OURS)).code).toBe(0);
    expect(g.calls().filter((c) => c.includes(" bridge open ") || c.includes(" bridge reply "))).toHaveLength(2);
  });

  test("older mail in the person's own mailbox stays unopened, by reference or by id", () => {
    const g = guarded();
    const r = g.run(openArgs(OLDER));
    expect(r.code).toBe(1);
    expect(r.out).toContain("trial_guard_refused");
    expect(g.run(["--json", "--agent-context", PEER, "bridge", "open", OLDER]).code).toBe(1);
    expect(g.calls()).toHaveLength(0);
  });
});

describe("D412 (2): the card never names the person, though Mem doesn't say who they are", () => {
  const BODY = "Task (from Weyl, via Claude Code in ~/dev/ducter): make the Linux CI test pass.\n\nBackground: packages/runner/test/live.test.ts calls the macOS `open` command.";
  test("the names an own agent's first line gives the person", () => {
    expect(namesForUser([BODY])).toEqual(["Weyl"]);
    expect(namesForUser(["Decision needed from Weyl (he is at lunch and asked me to send this to you): push now?"])).toEqual(["Weyl"]);
    expect(namesForUser(["Weyl 说：先别推"])).toEqual(["Weyl"]);
    expect(namesForUser([], "You are Ducter, Weyl's personal AI partner.")).toEqual(["Weyl"]);
    // Tools and agents are not people; a name further down may be someone else's.
    expect(namesForUser(["Task from Claude Code: fix it.\nAlex asked for this in review."])).toEqual([]);
    expect(namesForUser(["Task (from Bridge agent): x"], "", ["Bridge agent"])).toEqual([]);
  });

  const REAL: BridgeMessage = { messageId: "5ac0f022", from: "another agent", mine: true, linked: true, text: BODY };
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: [REAL].filter((m) => !known.has(m.messageId)), reads: {} };
    },
    async reply() {
      return { ok: true, messageId: "r" };
    },
    async contacts() {
      return { ok: true, contacts: [], more: false };
    },
    async send() {
      return { ok: true, messageId: "s" };
    },
  } as unknown as BridgeClient;

  test("a card that says 「Weyl 那边的 Claude Code」 is sent back; one that says 你 goes up", async () => {
    const clock = new FakeClock();
    const fc = fakeCore(clock, tmp());
    (fc.core as any).persona = { id: "default", name: "Ducter", identity: "You are Ducter, the user's personal AI partner." };
    const r: any[] = [];
    const script: Script = async (_i, s) => {
      r.push(await fc.callTool("ask", { question: "你的另一个 AI（Weyl 那边的 Claude Code）请你帮忙修好 runner 测试在 Linux CI 上挂掉的问题，要接吗？", goLabel: "接下来做" }));
      r.push(await fc.callTool("ask", { question: "你终端里的 Claude Code 请你修好 runner 测试在 Linux CI 上挂掉的问题，只改测试文件，不推送，要接吗？", goLabel: "接下来做" }));
      s.end();
    };
    const fr = fakeRunner(script);
    fr.bindCards(fc.cards);
    // The user wrote Chinese before, so the card's language is known (D109).
    fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "好的，帮我盯着 CI" } });
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: (e: unknown) => console.error(e), memory: fakeMemory([]).memory, bridge, bridgeIntervalMs: 0, bridgeRecoverMs: 0 });
    await partner.checkBridge();
    await partner.idle();
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toContain("This card is for Weyl, the user");
    expect(r[1].ok).toBe(true);
    const cards = fc.events.filter((e) => e.kind === "decision").map((e) => (e.body as Bodies["decision"]).question);
    expect(cards).toHaveLength(1);
    expect(cards[0]).not.toContain("Weyl");
  });
});

describe("D412 (3): one follow-through line per silent agent", () => {
  const sentTs = "2026-11-20T03:05:00.000Z";
  const op = (n: number, text: string, to = "another agent", at = sentTs): OutOp => ({ opId: `o${n}`, state: "sent", seq: n, first: n, ts: at, sentTs: at, last: { direction: "out", messageId: `m${n}`, to, mine: true, text, decisionId: `d${n}` } });
  const S2 = op(10, "Weyl 问：bridge 那块写到哪了？今晚能不能提 PR？");
  const S3 = op(20, "Weyl 问：昨晚 CI 那个红是不是 flaky？", "another agent", "2026-11-20T03:08:00.000Z");
  const at = Date.parse(sentTs) + 125 * 60_000;

  test("both questions to the terminal in one line, the newest first, in the user's own words", () => {
    expect(followGroup([S2, S3, op(30, "x", "codex-mem")]).map((o) => o.opId)).toEqual(["o10", "o20"]);
    const items = [
      { op: S2, asked: "问一下我终端里那个 Claude，bridge 那块它写到哪了，今晚能不能提 PR？" },
      { op: S3, asked: "再问一下我终端里那个 Claude：昨晚 CI 那个红是不是 flaky？" },
    ];
    expect(followLine(items, at, "zh")).toBe("一个没留名字的 agent 还没回你 2 小时前问的「昨晚 CI 那个红是不是 flaky？」和「bridge 那块它写到哪了，今晚能不能提 PR？」，它可能停了。回了我马上告诉你。");
    expect(followLine(items, at, "en")).toBe('An unnamed agent hasn\'t answered what you asked 2 hours ago ("昨晚 CI 那个红是不是 flaky？" and "bridge 那块它写到哪了，今晚能不能提 PR？"); it may have stopped. I\'ll tell you as soon as it does.');
    expect(followLine([...items, { op: op(25, "Weyl 问：发版了吗？"), asked: undefined }], at, "zh")).toContain("问的「发版了吗？」等 3 件事，");
    // One alone reads as before; "问问我那个 Codex bridge 写到哪了，…" keeps its question.
    expect(followLine(S2, at, "zh", false, "问问我那个 Codex bridge 写到哪了，今晚能不能提 PR")).toContain("「问问我那个 Codex bridge 写到哪了，今晚能不能提 PR」");
  });

  test("a line that covered several leaves none of them due", () => {
    const log = (seq: number, body: Bodies["bridge_msg"], ts = sentTs) => ({ seq, ts, stream: "channel", origin: "partner", kind: "bridge_msg", body }) as any;
    const events = [log(10, S2.last), log(20, S3.last, S3.sentTs)];
    expect(followCandidates(events, at).map((o) => o.opId)).toEqual(["seq:10", "seq:20"]);
    const followed = log(30, { ...S3.last, state: "followed", text: "…", alsoFollowed: ["m10"] }, new Date(at).toISOString());
    expect(followCandidates([...events, followed], at + HOUR)).toEqual([]);
  });
});
