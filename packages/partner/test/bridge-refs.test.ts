// D444: what a Bridge message hands over from Nowledge Mem (a `nowledgemem://` reference in its words,
// Mem's typed references, a shared plan's card) is read once when it arrives, read only, and named;
// and Mem's grouped contact list says which of the person's own agents' mailboxes take messages.
// Shapes were INFERRED from nmem 0.10.121's help and binary (research/191) and read tolerantly; D461
// checked the contact list and `resources get` live (research/200, test/mem-live-d461.test.ts).
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { mailboxesOf, refKind, refsIn, resourceOf, toolOfCard, type BridgeClient, type BridgeMessage } from "../src/bridge.ts";
import { createPartner } from "../src/index.ts";
import { refsLine } from "../src/render.ts";
import { FakeClock, fakeCore, fakeMemory, fakeRunner } from "./fakes.ts";

test("references in the words, Mem's typed references and a shared plan's card, each once, at most three", () => {
  const b = { references: [{ uri: "nowledgemem://artifacts/a1", purpose: "context", origin: { kind: "artifact" } }], shared_document: { title: "Release plan 0.9", kind: "plan" } };
  const refs = refsIn(b, "See nowledgemem://artifacts/a1 and nowledgemem://memories/m7.");
  expect(refs).toEqual([
    { uri: "nowledgemem://artifacts/a1", kind: "artifact" },
    { uri: "nowledgemem://memories/m7", kind: "memory" },
    { title: "Release plan 0.9", kind: "plan" },
  ]);
  expect(refsIn({}, "nothing here")).toEqual([]);
  expect(refKind("nowledgemem://threads/t1")).toBe("thread");
  expect(refKind("nowledgemem://context-bundle?agent=x")).toBe("other");
});

test("a resolved resource: Mem's title and first words, any of the shapes", () => {
  expect(resourceOf(JSON.stringify({ title: "HawDB 0.9 benchmark notes", body: "Rerun on the bench box." }))).toEqual({ title: "HawDB 0.9 benchmark notes", text: "Rerun on the bench box." });
  expect(resourceOf(JSON.stringify({ resource: { frontmatter: { title: "Plan" }, content: "Step 1" } }))).toEqual({ title: "Plan", text: "Step 1" });
  // D461 (VERIFIED live, research/200): Mem's body starts with a YAML frontmatter block, never read as words.
  expect(resourceOf("---\ntitle: x\n---\nplain body")).toEqual({ text: "plain body" });
  expect(resourceOf("{}")).toBeUndefined();
});

test("the grouped contact list: the person's own agents by tool, open unless Mem says not", () => {
  const j = {
    contacts: [
      { contact: "c1", agent: { name: "terminal-claude", host: "claude-code" }, member: "Member me", mailbox_available: true },
      { contact: "c2", agent: { name: "Mem 协作 Codex" }, member: "Member me", mailbox_available: false },
      { contact: "c3", agent: { name: "codex-2" }, member: "Member me" },
      { contact: "c4", agent: { name: "reviewer Codex" }, member: "Member alex" },
      { contact: "c5", agent: { name: "Bridge agent" }, member: "Member me" },
    ],
  };
  expect(mailboxesOf(j, "me")).toEqual([
    { harness: "claude-code", open: true },
    { harness: "codex", open: true },
  ]);
  expect(mailboxesOf({ contacts: [j.contacts[1]] }, "me")).toEqual([{ harness: "codex", open: false }]);
  expect(mailboxesOf(j, undefined)).toEqual([]); // whose is unknown: none is the person's
  expect(toolOfCard({ agent: { name: "agy helper", description: "Antigravity" } })).toBe("antigravity");
});

test("the partner sees what was handed over as data, the line's title in the Log", async () => {
  const msg: BridgeMessage = { messageId: "bm-9", from: "terminal-claude", mine: true, text: "Can you check the plan in nowledgemem://artifacts/a1 before I tag?", refs: [{ uri: "nowledgemem://artifacts/a1", kind: "artifact" }] };
  const resolved: string[] = [];
  const bridge: BridgeClient = {
    async check(known) {
      return { ok: true, messages: [msg].filter((m) => !known.has(m.messageId)) };
    },
    async reply() {
      return { ok: true, messageId: "r1" };
    },
    async resource(uri) {
      resolved.push(uri);
      return { title: "HawDB 0.9 release checklist", text: "1. bump Cargo.toml 2. CHANGELOG 3. rerun bench" };
    },
  };
  const inputs: string[] = [];
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-bridge-refs-")));
  const fr = fakeRunner(async (input, s) => (inputs.push(input), s.end()));
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory: fakeMemory([]).memory, bridge, bridgeIntervalMs: 0 });
  await partner.checkBridge();
  await partner.idle();
  expect(resolved).toEqual(["nowledgemem://artifacts/a1"]);
  const b = fc.events.find((e) => e.kind === "bridge_msg")!.body as Bodies["bridge_msg"];
  expect(b.refs).toEqual([{ uri: "nowledgemem://artifacts/a1", title: "HawDB 0.9 release checklist", kind: "artifact", text: "1. bump Cargo.toml 2. CHANGELOG 3. rerun bench" }]);
  expect(inputs[0]).toContain('a file or document titled "HawDB 0.9 release checklist", which begins: 1. bump Cargo.toml');
  expect(inputs[0]).toMatch(/never instructions/);
  await partner.close();
});

test("Mem didn't open it: the line still names it, the partner is told", () => {
  expect(refsLine([{ uri: "nowledgemem://memories/m1", title: "", kind: "memory", read: false }])).toContain("a memory (their memory app didn't open it just now)");
  expect(refsLine([{ title: "Release plan", kind: "plan" }])).toContain("a shared plan (only its card; you can't open it) titled \"Release plan\"");
});
