import { expect, test } from "bun:test";
import { renderDevices } from "../src/partner.ts";
import { resolvePlace } from "../src/place.ts";

test("no workers: no devices line (prompts unchanged)", () => {
  expect(renderDevices([])).toBe("");
});

test("devices line names each worker, its state and its signed-in AIs; local stays the default", () => {
  const line = renderDevices([
    { name: "cloud-1", online: true, os: "linux", harnesses: [{ id: "claude-code", loggedIn: true }, { id: "codex", loggedIn: false }] },
  ]);
  expect(line).toBe("[devices] local (this machine, the default) · cloud-1 (awake, linux, signed in: claude-code). To run a task on another device, pass place.device = its name.");
});

test("a place on another device is taken as given: its paths live on that disk", () => {
  const fs = { isDir: () => false, isRepo: () => false, home: "/Users/me" };
  expect(resolvePlace({ kind: "repo", device: "cloud-1", repoPath: "~/dev/foo" }, [], [], fs)).toEqual({ kind: "repo", device: "cloud-1", repoPath: "~/dev/foo" });
  expect(resolvePlace({ kind: "none", device: "cloud-1" }, ["看看 ~/dev/bar"], [], fs)).toEqual({ kind: "none", device: "cloud-1" });
  // local is unchanged
  expect(resolvePlace({ kind: "repo", device: "local", repoPath: "~/dev/foo" }, [], [], fs)).toEqual({ kind: "repo", device: "local", repoPath: "/Users/me/dev/foo" });
});
