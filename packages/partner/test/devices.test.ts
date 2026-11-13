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
    "[devices] local (Ducter's home) · cloud-1 (awake, linux, never sleeps, browses in Ducter's own browser, signed in: claude-code) · MacBook (asleep, darwin, sleeps when its lid closes, browses in the user's own Chrome (their sign-ins), signed in: claude-code). Say what a task needs (task_open needs) and Ducter picks the computer and says where; name one in place.device only when the user named it.",
  );
});

test("needs from the model: only the known fields, a site as its host", () => {
  expect(parseNeeds(undefined)).toBeUndefined();
  expect(parseNeeds({})).toBeUndefined();
  expect(parseNeeds({ browse: true, signedIn: true, site: "https://www.Taobao.com/orders", long: "yes", extra: 1 })).toEqual({ browse: true, signedIn: true, site: "taobao.com" });
  expect(parseNeeds({ app: " Keynote ", long: true })).toEqual({ app: "Keynote", long: true });
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
