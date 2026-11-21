// D461: the Mem and Bridge shapes D433 and D444 read tolerantly, now VERIFIED against a live, read-only
// nmem 0.10.121 (research/200). Each fixture below has the live answer's field names and types;
// every value is a fake that looks fake (no id, name or text from the real Mem).
import { expect, test } from "bun:test";
import { contactsMore, contactsOf, inboxRefused, mailboxesOf, refKind, resourceOf, withoutFrontmatter } from "../src/bridge.ts";

const ME = "00000000-0000-4000-8000-00000000me01";
const TEAMMATE = "00000000-0000-4000-8000-0000000tm002";
const space = (id: string, kind: string) => ({ id, label: `fake-${id}`, kind });

// `bridge contacts --json`, no Space selector: both the per-Space `cards[]` and the grouped `contacts[]`.
const contactsLive = {
  cards: [{ member: `Member ${ME}`, agent: "fake codex box", agent_id: "fake-agent-c1", identity_contact: "bi1:FAKE-c1", member_id: ME, mailbox_available: true, description: "", contact: "bc1:FAKE-card-c1", send_args_prefix: ["nmem", "--json", "bridge", "send", "--to", "bc1:FAKE-card-c1"], space: space("fk-sp1", "default") }],
  spaces: [{ status: "searched", next_cursor: null, next_args: null, space: space("fk-sp1", "default") }],
  coverage_scope: "current_space_batch",
  space_batch: { offset: 0, count: 1, total: 1 },
  spaces_cursor: null,
  spaces_next_args: null,
  spaces_truncated: false,
  next: "Choose an identity and append --body=<your message> to its send arguments.",
  contacts: [
    { contact: "bi1:FAKE-c1", member: `Member ${ME}`, member_id: ME, agent: "fake codex box", agent_id: "fake-agent-c1", description: "", mailbox_available: true, spaces: [space("fk-sp1", "default"), space("fk-sp2", "team")], send_args_prefix: ["nmem", "--json", "bridge", "send", "--to", "bi1:FAKE-c1"] },
    { contact: "bi1:FAKE-c2", member: `Member ${ME}`, member_id: ME, agent: "fake claude code laptop", agent_id: "fake-agent-c2", description: "", mailbox_available: false, spaces: [] },
    { contact: "bi1:FAKE-c3", member: `Member ${ME}`, member_id: ME, agent: "Bridge agent", agent_id: "fake-agent-c3", description: "", mailbox_available: true, spaces: [space("fk-sp1", "default")], send_args_prefix: ["nmem", "--json", "bridge", "send", "--to", "bi1:FAKE-c3"] },
    { contact: "bi1:FAKE-c4", member: `Member ${TEAMMATE}`, member_id: TEAMMATE, agent: "fake teammate codex", agent_id: "fake-agent-c4", description: "", mailbox_available: true, spaces: [space("fk-sp2", "team")], send_args_prefix: ["nmem", "--json", "bridge", "send", "--to", "bi1:FAKE-c4"] },
  ],
};

test("the grouped contact list as Mem returns it: contacts[] wins over cards[], a closed mailbox is never offered", () => {
  const cs = contactsOf(contactsLive, ME);
  expect(cs.map((c) => c.contact)).toEqual(["bi1:FAKE-c1", "bi1:FAKE-c3", "bi1:FAKE-c4"]);
  expect(cs.filter((c) => c.mine).map((c) => c.contact)).toEqual(["bi1:FAKE-c1", "bi1:FAKE-c3"]);
  // A grouped card names no one Space (a send resolves it in the sender's): the caller fills the home's.
  expect(cs.every((c) => c.space === undefined)).toBe(true);
  // "Bridge agent" with an id-only member reads as no one in particular, never as an id.
  expect(cs.find((c) => c.contact === "bi1:FAKE-c3")!.label).toBe("another agent");
});

test("which of the person's own agents' mailboxes take messages, by tool, from the live shape", () => {
  expect(mailboxesOf(contactsLive, ME)).toEqual([
    { harness: "codex", open: true },
    { harness: "claude-code", open: false },
  ]);
});

test("more pages: the Space batch's own fields, never the top-level sentence", () => {
  expect(contactsMore(contactsLive)).toBe(false);
  expect(contactsMore({ ...contactsLive, spaces_truncated: true })).toBe(true);
  expect(contactsMore({ ...contactsLive, spaces_next_args: ["nmem", "bridge", "contacts", "--spaces-cursor", "FAKE"] })).toBe(true);
  expect(contactsMore({ ...contactsLive, space_batch: { offset: 0, count: 8, total: 12 } })).toBe(true);
  expect(contactsMore({ ...contactsLive, spaces_cursor: "FAKE-cursor" })).toBe(true);
});

// `resources get <uri> --json` for a memory (a thread and a source have the same frame).
const resourceLive = {
  requested_uri: "nowledgemem://memory/00000000-fake-0000-0000-000000000001",
  canonical_uri: "nowledgemem://memory/00000000-fake-0000-0000-000000000001",
  kind: "memory",
  path: "/memories/00000000-fake-0000-0000-000000000001.md",
  mime_type: "text/markdown",
  body: '---\nid: "00000000-fake-0000-0000-000000000001"\ntype: "memory"\nunit_type: "decision"\ntitle: "Fake release cadence"\nimportance: 0.8\nspace_id: "fake-space"\n---\n\nShip the fake RC once the fake WAL change is merged.\n',
  frontmatter: { id: "00000000-fake-0000-0000-000000000001", type: "memory", unit_type: "decision", title: "Fake release cadence", created_at: "2026-01-01T00:00:00+00:00", updated_at: "2026-01-01T00:00:00+00:00", labels: [], importance: 0.8, confidence: 1, space_id: "fake-space", source: "cli", claim_status: "fake", source_grounding: "fake", source_derived: false, trust_warnings: [] },
};

test("a resolved resource: the title from its frontmatter, the words without the YAML block Mem puts first", () => {
  expect(resourceOf(JSON.stringify(resourceLive))).toEqual({ title: "Fake release cadence", text: "Ship the fake RC once the fake WAL change is merged." });
  // The plain (non-JSON) answer has the same block.
  expect(resourceOf(resourceLive.body)).toEqual({ text: "Ship the fake RC once the fake WAL change is merged." });
  expect(withoutFrontmatter("no block here")).toBe("no block here");
  expect(withoutFrontmatter("---\na: 1\n---\nbody")).toBe("body");
});

test("Mem's own resource kinds name what a reference is", () => {
  expect(refKind("nowledgemem://memory/x")).toBe("memory");
  expect(refKind("nowledgemem://thread/x")).toBe("thread");
  expect(refKind("nowledgemem://source/x")).toBe("artifact");
  expect(refKind("nowledgemem://collaboration/00000000-0000-4000-8000-000000000000")).toBe("plan");
  expect(refKind("nowledgemem://working-memory/today")).toBe("other");
  expect(refKind("nowledgemem://context/bundle")).toBe("other");
});

test("an identity inbox whose every Space refused is no read; one Space refused among others is", () => {
  const denied = {
    messages: [],
    spaces: ["fk-sp1", "fk-sp2"].map((space_id) => ({ space_id, status: "unavailable", error_code: "cloud_agent_context_authority_denied" })),
    next: null,
    incomplete: true,
    coverage_scope: "current_space_batch",
    outcome_unknown: false,
    identity: "fake-partner",
  };
  expect(inboxRefused(denied)).toBe("cloud_agent_context_authority_denied");
  expect(inboxRefused({ ...denied, spaces: [denied.spaces[0], { space_id: "fk-sp2", status: "observed" }] })).toBeUndefined();
  expect(inboxRefused({ ...denied, messages: [{ message: "bm1:FAKE" }] })).toBeUndefined();
  expect(inboxRefused({ messages: [], spaces: [] })).toBeUndefined();
});
