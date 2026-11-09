// The partner's connection tools (D96): reads run in turn; a write makes a Go / Hold card and
// runs once, only after Go, when the partner calls again with the decisionId.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { openConnections, ooSource } from "../../core/src/connections.ts";
import { fakeOpenConnector } from "../../core/test/fake-mcp.ts";
import { createPartner } from "../src/index.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

const TOKEN = "oct_partner_test";
const oc = fakeOpenConnector(
  [
    { id: "gmail.search_threads", operationType: "read", run: () => ({ threads: [{ id: "t1", subject: "Your domain renews soon" }] }) },
    { id: "gmail.send_email", operationType: "write", run: () => ({ id: "m1" }) },
  ],
  TOKEN,
);
afterEach(() => {});

async function setup() {
  const clock = new FakeClock();
  const dir = mkdtempSync(join(tmpdir(), "ducter-conn-partner-"));
  const fc = fakeCore(clock, dir);
  const conns = openConnections({ dataDir: dir, log: fc.core.log, oo: ooSource({ env: {}, dir: join(dir, "no-oo"), which: () => null }) });
  fc.core.connections = conns;
  const fr = fakeRunner(async (_i, s) => s.end());
  fr.bindCards(fc.cards);
  createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: fakeMemory([]).memory });
  expect((await conns.add({ url: oc.url, token: TOKEN })).ok).toBe(true);
  return { fc, conns };
}

describe("partner connection tools", () => {
  test("registered, and the prompt-facing list never shows a token", async () => {
    const { fc } = await setup();
    for (const n of ["connections_list", "connection_search", "connection_guide", "connection_call", "connection_share"]) expect(fc.tools.has(`partner:${n}`)).toBe(true);
    const list = await fc.callTool("connections_list", {});
    expect(JSON.stringify(list)).not.toContain(TOKEN);
    expect(list).toMatchObject({ connections: [{ name: "OpenConnector", source: "self" }] });
  });
  test("a read runs at once", async () => {
    const { fc } = await setup();
    const r = (await fc.callTool("connection_call", { connection: "OpenConnector", action: "gmail.search_threads", input: { query: "renew" } })) as { ok: boolean; result: unknown };
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.result)).toContain("Your domain renews soon");
  });
  test("a write asks first, makes one card, runs only after Go, and only once", async () => {
    const { fc } = await setup();
    const before = oc.executed.filter((e) => e.name === "execute_action").length;
    const bare = (await fc.callTool("connection_call", { connection: "OpenConnector", action: "gmail.send_email", input: { to: "lina@example.com" } })) as { ok: boolean; error: string };
    expect(bare.ok).toBe(false);
    expect(bare.error).toContain("question");
    const asked = (await fc.callTool("connection_call", {
      connection: "OpenConnector",
      action: "gmail.send_email",
      input: { to: "lina@example.com", body: "Looks good" },
      question: "把这封回复发给 Lina 吗？",
      goLabel: "发给 Lina",
    })) as { ok: boolean; needsGo: boolean; decisionId: string };
    expect(asked).toMatchObject({ ok: true, needsGo: true });
    const card = fc.events.find((e) => e.kind === "decision")!.body as Bodies["decision"];
    expect(card).toMatchObject({ decisionId: asked.decisionId, goLabel: "发给 Lina", defaultOption: "hold", reversible: false });
    expect(oc.executed.filter((e) => e.name === "execute_action").length).toBe(before);
    fc.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: asked.decisionId, option: "go", by: "user" } });
    const ran = (await fc.callTool("connection_call", { decisionId: asked.decisionId })) as { ok: boolean };
    expect(ran.ok).toBe(true);
    expect(oc.executed.filter((e) => e.name === "execute_action").length).toBe(before + 1);
    expect(((await fc.callTool("connection_call", { decisionId: asked.decisionId })) as { ok: boolean }).ok).toBe(false);
    expect(oc.executed.filter((e) => e.name === "execute_action").length).toBe(before + 1);
  });
});
