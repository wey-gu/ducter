// D557: the live trial of 2026-11-25 (nmem 0.10.123, Mem Cloud, research/226 §4) passed every check.
// Its raw answers fixed the shapes the tolerant reading waited on (research/37 B8): an identity-inbox
// entry and an `open` carry `sender: {actor_id, member, agent, agent_id, host?}`, `in_reply_to` (null on
// an original), `created_at_us`. A stub nmem replays those shapes (ids and bodies made up; no account
// data), so what the client reads from them is pinned. Nothing here reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNmemBridge, linksReplies } from "../src/bridge.ts";
import { followCandidates } from "../src/bridge-out.ts";
import type { LogEvent } from "../../protocol/src/index.ts";

const SPACE = "personal-m-weyl";
const AT_US = Date.parse("2026-11-25T00:23:40Z") * 1000;
const sender = (agent: string, host?: string) => ({ actor_id: "a-1", member: "Member m-weyl", agent, agent_id: "bridge-9e18", ...(host ? { host } : {}) });
const argv = (verb: "open" | "reply", ref: string) => ["nmem", "--api-url=https://cloud.example/remote-api", "--agent-context=ducter", "bridge", verb, ref];
const entry = (id: string, ref: string, inReplyTo: string | null) => ({
  message: id,
  reference: ref,
  sequence: 7,
  space_id: SPACE,
  state: "pending",
  eligible: true,
  mine: true,
  read: false,
  in_reply_to: inReplyTo,
  created_at_us: AT_US,
  expires_at_ms: Math.floor(AT_US / 1000) + 7 * 86_400_000,
  open_args: argv("open", ref),
  reply_args_prefix: argv("reply", ref),
  sender: sender("Bridge agent", "claude-code"),
});
const opened = (id: string, body: string, inReplyTo: string | null) => ({
  message: id,
  body,
  reply_to: id,
  in_reply_to: inReplyTo,
  sender: sender("Bridge agent", "claude-code"),
  space_id: SPACE,
  created_at_us: AT_US,
  outgoing: [],
  status_observed_at_us: AT_US,
  outcome_unknown: false,
});

/** A stub nmem answering as 0.10.123 did live: an identity inbox, Mem's open argv, the open shape. */
function stub(version: string, o: { omitNull?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ducter-bridge-0123-"));
  const strip = (j: Record<string, unknown>) => (o.omitNull ? Object.fromEntries(Object.entries(j).filter(([, v]) => v !== null)) : j);
  const inbox = {
    identity: "ducter",
    order: "unread_first",
    coverage_scope: "observed_spaces",
    spaces: [{ space_id: SPACE, status: "observed", next_cursor: null, outgoing: [] }],
    messages: [strip(entry("m-orig", "bm1:orig", null)), strip(entry("m-ans", "bm1:ans", "out-1"))],
    next: null,
  };
  const opens: Record<string, unknown> = {
    "bm1:orig": strip(opened("m-orig", "Task (from Weyl, repo ~/dev/ducter): fix the Linux CI failure in the runner tests.", null)),
    "bm1:ans": strip(opened("m-ans", "进度：contacts 和 send 两个命令已经加上，今晚 22:00 左右提 PR。", "out-1")),
  };
  const data = join(dir, "data.json");
  writeFileSync(data, JSON.stringify({ version, inbox, opens }));
  const bin = join(dir, "nmem");
  writeFileSync(
    bin,
    `#!/usr/bin/env bun
const d = JSON.parse(require("node:fs").readFileSync(${JSON.stringify(data)}, "utf8"));
const a = process.argv.slice(2);
if (a.includes("--version")) { console.log("nmem " + d.version); process.exit(0); }
if (a.includes("--help")) { console.log("List incoming identity mail across currently authorized Spaces\\n  --wait <SECONDS>  Wait up to five seconds"); process.exit(0); }
const v = a.indexOf("bridge");
const verb = v >= 0 ? a.slice(v + 1).find((x) => !x.startsWith("-")) : undefined;
if (verb === "inbox") { console.log(JSON.stringify(d.inbox)); process.exit(0); }
if (verb === "open") { const r = d.opens[a[a.length - 1]]; if (!r) process.exit(1); console.log(JSON.stringify(r)); process.exit(0); }
console.log("{}");
`,
  );
  chmodSync(bin, 0o755);
  return createNmemBridge({ context: "ducter", places: [{ context: "ducter", spaceId: SPACE, spaceLabel: "Only me", kind: "personal" }], bin, me: "m-weyl", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" }, retryDelaysMs: [] });
}

describe("D557: the shapes of the 2026-11-25 live pass, read as Mem gave them", () => {
  test("an original and an answer: own, by the tool Mem names, linked, timed by created_at_us", async () => {
    const r = await stub("0.10.123").check(new Set());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [orig, ans] = [r.messages.find((m) => m.messageId === "m-orig")!, r.messages.find((m) => m.messageId === "m-ans")!];
    // A native session's agent is the generic "Bridge agent": it is named by its tool instead.
    expect(orig).toMatchObject({ mine: true, host: "Claude Code", linked: true, space: SPACE });
    expect(orig.agent).toBeUndefined();
    expect(orig.inReplyTo).toBeUndefined();
    expect(orig.sentAt).toBe("2026-11-25T00:23:40.000Z");
    expect(ans).toMatchObject({ mine: true, inReplyTo: "out-1" });
    expect(ans.linked).toBeUndefined();
  }, 20_000);

  test("D249 (5) only for nmem before 0.10.120: a 0.10.120+ CLI's message is linked even without the key", async () => {
    const r = await stub("0.10.123", { omitNull: true }).check(new Set());
    expect(r.ok && r.messages.find((m) => m.messageId === "m-orig")?.linked).toBe(true);
    const old = await stub("0.10.119", { omitNull: true }).check(new Set());
    expect(old.ok && old.messages.find((m) => m.messageId === "m-orig")?.linked).toBeUndefined();
  }, 20_000);

  test("which nmem asks for the linked shape", () => {
    expect(linksReplies("nmem 0.10.123")).toBe(true);
    expect(linksReplies("0.10.120")).toBe(true);
    expect(linksReplies("nmem 0.10.120-rc1")).toBe(true);
    expect(linksReplies("nmem 0.11.0")).toBe(true);
    expect(linksReplies("nmem 0.10.119")).toBe(false);
    expect(linksReplies("nmem 0.10.118")).toBe(false);
    expect(linksReplies("")).toBe(false);
  });

  test("follow-through: a linked original from an unnamed own agent leaves the question open (one nudge due)", () => {
    const t0 = Date.parse("2026-11-25T00:25:00Z");
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    const ev = (seq: number, ts: string, body: Record<string, unknown>) => ({ seq, ts, stream: "channel", origin: "partner", kind: "bridge_msg", body }) as unknown as LogEvent;
    const sent = ev(1, at(0), { direction: "out", opId: "bo-1", messageId: "bm-o1", to: "another agent", mine: true, text: "昨晚 CI 那个红是不是 flaky？", decisionId: "d-1", state: "sent" });
    const other = ev(2, at(10), { direction: "in", messageId: "bm-x", from: "another agent", host: "Claude Code", mine: true, text: "Task: tidy the README.", linked: true });
    expect(followCandidates([sent, other], t0 + 2 * 3_600_000 + 5 * 60_000).map((o) => o.opId)).toEqual(["bo-1"]);
  });
});
