import { expect, test } from "bun:test";
import { parseNeeds, renderDevices, renderLive } from "../src/partner.ts";
import type { TaskCard } from "../../protocol/src/index.ts";
import { resolvePlace } from "../src/place.ts";

test("no workers: no devices line (prompts unchanged)", () => {
  expect(renderDevices([])).toBe("");
});

test("devices line names each worker, its state, how it browses, whether it sleeps, and its signed-in AIs (D157)", () => {
  const line = renderDevices([
    { name: "cloud-1", online: true, os: "linux", alwaysOn: true, web: "ducter", harnesses: [{ id: "claude-code", loggedIn: true }, { id: "codex", loggedIn: false }] },
    { name: "MacBook", online: false, asleep: true, os: "darwin", alwaysOn: false, web: "chrome", harnesses: [{ id: "claude-code", loggedIn: true }] },
  ]);
  expect(line).toBe(
    "[devices] local (Ducter's home) · cloud-1 (awake, linux, never sleeps, browses in Ducter's own browser, signed in: claude-code) · MacBook (asleep, darwin, sleeps when its lid closes, browses in the user's own Chrome (their sign-ins), signed in: claude-code). True now: which agents are set up where, their usage limits, and which code is where, is only what this line says. Put work where the user's words and these facts point (place.device; their words about computers in where); with neither, say what it needs and Ducter picks. Code not on that computer yet is cloned there first (place.remote).",
  );
});

// D477 (hel, 2026-11-22): the home by name with its own agents, and the code on each computer with its origin.
test("the world line: the home's agents and the code on each computer, as facts", () => {
  const line = renderDevices(
    [{ id: "d1", name: "Weyl's MacBook Pro", online: true, harnesses: [{ id: "codex", loggedIn: true }, { id: "antigravity", installed: true, loggedIn: false }] }],
    { name: "hel", harnesses: [{ id: "antigravity", installed: true, loggedIn: true }] },
    [{ device: "d1", name: "nowledge-mem", remote: "nowledge-co/mem" }, { device: "d1", name: "ducter", remote: "wey-gu/ducter" }],
  );
  expect(line).toContain("local (Ducter's home: hel, signed in: antigravity, code: none known)");
  expect(line).toContain("signed in: codex, installed but not signed in: antigravity, code: nowledge-mem (nowledge-co/mem), wey-gu/ducter)");
});

// D478: each agent's limit per computer, and what is running where, as facts (never a choice).
test("the world line shows each agent's limit on its computer: used up until when, or room left", () => {
  const now = new Date(2026, 10, 22, 21, 0);
  const until = new Date(2026, 10, 22, 23, 0).toISOString();
  const limits = [
    { device: "local", harness: "claude-code", state: "used_up" as const, until },
    { device: "local", harness: "codex", state: "room" as const },
    { device: "w1", harness: "codex", state: "used_up" as const },
  ];
  const line = renderDevices(
    [{ id: "w1", name: "hel", online: true, harnesses: [{ id: "codex", loggedIn: true }] }],
    { name: "Weyl's MacBook Pro", harnesses: [{ id: "claude-code", loggedIn: true }, { id: "codex", loggedIn: true }] },
    undefined,
    limits,
    now,
  );
  expect(line).toContain("signed in: claude-code (used up until 23:00), codex (room left)");
  expect(line).toContain("hel (awake, signed in: codex (used up, reset not known))");
  // A home alone: no line, unless an agent there is used up.
  expect(renderDevices([], { name: "Mac", harnesses: [{ id: "codex", loggedIn: true }] }, undefined, [{ device: "local", harness: "codex", state: "room" }], now)).toBe("");
  expect(renderDevices([], { name: "Mac", harnesses: [{ id: "claude-code", loggedIn: true }] }, undefined, limits, now)).toContain("claude-code (used up until 23:00)");
});

test("the live line: each live task's agent, computer and what it waits on", () => {
  const now = new Date(2026, 10, 22, 21, 0);
  const card = (taskId: string, attention: string, device: string, harness: string, updatedAt: string) =>
    ({ taskId, title: `task ${taskId}`, attention, harness, place: { kind: "repo", device, repoPath: "/x" }, updatedAt, openedAt: updatedAt }) as unknown as TaskCard;
  const cards = [card("a1", "working", "local", "claude-code", "2026-11-22T10:00:00Z"), card("b2", "needs_you", "w1", "codex", "2026-11-22T11:00:00Z"), card("c3", "done", "local", "codex", "2026-11-22T12:00:00Z")];
  const line = renderLive(cards, [{ device: "local", harness: "claude-code", state: "used_up", until: new Date(2026, 10, 22, 23, 0).toISOString(), waiting: ["a1"] }], (d) => (d === "local" ? "Mac" : "hel"), now);
  expect(line).toBe('[live] b2 "task b2" codex on hel, waiting on the user · a1 "task a1" claude-code on Mac, resting until claude-code\'s limit resets (23:00). True now.');
  expect(renderLive([cards[2]!], undefined, () => "Mac", now)).toBe("");
  // A home alone names no computer.
  expect(renderLive([cards[0]!], undefined, undefined, now)).toBe('[live] a1 "task a1" claude-code, working. True now.');
});

test("needs from the model: only the known fields, a site as its host", () => {
  expect(parseNeeds(undefined)).toBeUndefined();
  expect(parseNeeds({})).toBeUndefined();
  expect(parseNeeds({ browse: true, signedIn: true, site: "https://www.Taobao.com/orders", long: "yes", extra: 1 })).toEqual({ browse: true, signedIn: true, site: "taobao.com" });
  expect(parseNeeds({ app: " Keynote ", long: true })).toEqual({ app: "Keynote", long: true });
  // D436: buying or booking is web work in Ducter's own browser.
  expect(parseNeeds({ buy: true, signedIn: true, site: "taobao.com" })).toEqual({ buy: true, browse: true, signedIn: true, site: "taobao.com" });
  expect(parseNeeds({ buy: "yes" })).toBeUndefined();
  // D251: which phone; "any" and the old true are either; anything else is dropped.
  expect(parseNeeds({ phone: "mine" })).toEqual({ phone: "mine" });
  expect(parseNeeds({ phone: "ducter" })).toEqual({ phone: "ducter" });
  expect(parseNeeds({ phone: "any" })).toEqual({ phone: true });
  expect(parseNeeds({ phone: true })).toEqual({ phone: true });
  expect(parseNeeds({ phone: "theirs" })).toBeUndefined();
});

test("a place on another device is taken as given: its paths live on that disk", () => {
  const fs = { isDir: () => false, isRepo: () => false, home: "/Users/me" };
  expect(resolvePlace({ kind: "repo", device: "cloud-1", repoPath: "~/dev/foo" }, [], [], fs)).toEqual({ kind: "repo", device: "cloud-1", repoPath: "~/dev/foo" });
  expect(resolvePlace({ kind: "none", device: "cloud-1" }, ["看看 ~/dev/bar"], [], fs)).toEqual({ kind: "none", device: "cloud-1" });
  // local is unchanged
  expect(resolvePlace({ kind: "repo", device: "local", repoPath: "~/dev/foo" }, [], [], fs)).toEqual({ kind: "repo", device: "local", repoPath: "/Users/me/dev/foo" });
});
