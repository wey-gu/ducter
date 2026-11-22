import { expect, test } from "bun:test";
import { parseNeeds, renderDevices } from "../src/partner.ts";
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
    "[devices] local (Ducter's home) · cloud-1 (awake, linux, never sleeps, browses in Ducter's own browser, signed in: claude-code) · MacBook (asleep, darwin, sleeps when its lid closes, browses in the user's own Chrome (their sign-ins), signed in: claude-code). True now: which agents are set up where, and which code is where, is only what this line says. Put work where the user's words and these facts point (place.device; their words about computers in where); with neither, say what it needs and Ducter picks. Code not on that computer yet is cloned there first (place.remote).",
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
