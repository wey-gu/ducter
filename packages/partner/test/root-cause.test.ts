// D549: hel, 2026-11-24. Claude Code refused to run as root, and the partner opened the same work on
// Claude Code again three times. What it reads now: the agent that can't run there, said as such in
// [devices]; a rethink that says the cause won't change; and task_open refusing the same agent there.
import { expect, test } from "bun:test";
import type { Bodies, CantStart } from "../../protocol/src/index.ts";
import { renderDevices, sameComputerAs } from "../src/partner.ts";
import { renderMend } from "../src/render.ts";

const cant: CantStart = { why: "refuses_root", computer: "Hetzner Server", what: "Claude Code", harness: "claude-code", device: "local", detail: "Claude Code exited as it started: --dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons" };

test("the rethink says what failed and that the same agent there fails the same way", () => {
  const m: Bodies["mend"] = { taskId: "kwhtu5a7", cls: "start", rung: "rethink", attempt: 1, tried: [], why: "refuses_root", state: "ok", same: true };
  const s = renderMend(m, "更新 Claude Code 的 Mem 插件", cant);
  expect(s).toContain("refuses to run as root, and Ducter runs as root on that computer");
  expect(s).toContain("Claude Code on Hetzner Server will fail the same way, so open it on another agent there");
  // A cause that may pass (a start that went wrong once) says nothing of the kind.
  expect(renderMend({ ...m, why: "other", same: undefined }, "x", { ...cant, why: "other" })).not.toContain("fail the same way");
});

test("[devices]: an agent that refuses root where Ducter is root is neither signed in nor idle there", () => {
  const line = renderDevices([{ id: "d1", name: "MacBook", online: true, harnesses: [{ id: "codex", loggedIn: true }] }], { name: "hel", harnesses: [{ id: "claude-code", installed: true, loggedIn: true, trouble: { kind: "root" } }, { id: "codex", installed: true, loggedIn: true }] });
  expect(line).toContain("signed in: codex");
  expect(line).not.toContain("signed in: claude-code");
  expect(line).toContain("can't run here (Ducter runs as root on this computer and it refuses root): claude-code");
});

test("the same computer, as the partner may name it again", () => {
  expect(sameComputerAs(cant, undefined)).toBe(true);
  expect(sameComputerAs(cant, "local")).toBe(true);
  expect(sameComputerAs(cant, "hetzner server")).toBe(true);
  expect(sameComputerAs(cant, "MacBook")).toBe(false);
  expect(sameComputerAs({ device: "w1", computer: "hel" }, "hel")).toBe(true);
  expect(sameComputerAs({ device: "w1", computer: "hel" }, "local")).toBe(false);
});
