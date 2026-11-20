// D363: where one AI agent stands on a device, as its row shows it (the card, the lend sheet).
// Pure, so tests drive it; the Mac's views/agentsetup.go reads the same order.
import type { DeviceHarness } from "@ducter/protocol";

export type AgentRowLook =
  | "ready" // installed and signed in
  | "login" // its sign-in is running there (or just ended): the login panel
  | "signin" // installed, not signed in: 登录
  | "installing"
  | "queued"
  | "failed" // the last install didn't: one line, 再试一次
  | "install" // not there, Ducter can put it there: 安装
  | "missing"; // not there, and Ducter can't (an older Ducter there, an agent it doesn't install)

export function agentRowLook(h: Pick<DeviceHarness, "installed" | "loggedIn" | "installable" | "setup" | "login" | "trouble">): AgentRowLook {
  if (h.setup?.phase === "installing") return "installing";
  if (h.setup?.phase === "queued") return "queued";
  if (h.installed && h.loggedIn && (!h.login || h.login.state !== "done")) return "ready";
  if (h.installed && h.login) return "login";
  if (h.installed) return h.loggedIn ? "ready" : "signin";
  if (h.setup?.phase === "failed") return "failed";
  return h.installable ? "install" : "missing";
}

/**
 * D409: what the row says of an agent partly there (its command line too old, broken, or only its
 * desktop app), and what its one button does then: 更新 (its own updater) or 重新安装.
 */
export function troubleWords(h: Pick<DeviceHarness, "trouble" | "version">): { word: string; args: string[]; button: "install" | "update" | "reinstall" } | undefined {
  const tr = h.trouble;
  if (!tr) return undefined;
  if (tr.kind === "too_old") return { word: "ag.trouble.too_old", args: [h.version ?? "?", tr.need], button: "update" };
  if (tr.kind === "broken") return { word: "ag.trouble.broken", args: [], button: "reinstall" };
  return { word: "ag.trouble.app_only", args: [tr.app], button: "install" };
}

/** The agents the lend sheet offers to install, and which start checked (Codex and Claude Code; D371: DeepSeek Harness offered, not checked; D409: Antigravity last, not checked). */
export function offerable(hs: readonly DeviceHarness[]): { harness: string; checked: boolean }[] {
  const order = ["codex", "claude-code", "deepseek-harness", "pi", "antigravity"];
  return order
    .map((id) => hs.find((h) => h.harness === id))
    .filter((h): h is DeviceHarness => !!h && !h.installed && !!h.installable)
    .map((h) => ({ harness: h.harness, checked: h.harness === "codex" || h.harness === "claude-code" }));
}

/** Is any agent signed in there (the computer can take tasks)? */
export const anyReady = (hs: readonly DeviceHarness[]) => hs.some((h) => h.installed && h.loggedIn);
/** Is anything being put there now? */
export const anyInstalling = (hs: readonly DeviceHarness[]) => hs.some((h) => h.setup?.phase === "installing" || h.setup?.phase === "queued");
