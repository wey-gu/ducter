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
  | "missing" // not there, and Ducter can't (an older Ducter there, an agent it doesn't install)
  | "cant" // D549: there, but it won't run here (it refuses root, and Ducter runs as root there): why, no button
  | "coming"; // D625: an older home can't run it yet (this build runs Dim; OAR 0.138.0)

export function agentRowLook(h: Pick<DeviceHarness, "installed" | "loggedIn" | "installable" | "setup" | "login" | "trouble">): AgentRowLook {
  // D625: said before installed/installable: an older home has nothing to install or sign in.
  if (h.trouble?.kind === "coming") return "coming";
  if (h.setup?.phase === "installing") return "installing";
  if (h.setup?.phase === "queued") return "queued";
  // D416: a sign-out running (or one that didn't take) opens the panel on a signed-in row.
  if (h.installed && (h.login?.state === "signing_out" || h.login?.reason === "signout_failed")) return "login";
  // D549: signed in or not, it won't run as root there: said once, never 登录 or 可以用.
  if (h.installed && h.trouble?.kind === "root") return "cant";
  // D630: Cursor needs Node 22.13+ wherever the SDK child runs; a build that can't offer it
  // says so instead of a button that changes nothing.
  if (h.trouble?.kind === "node_old") return "cant";
  // D518: done is the agent's own check saying signed in: the row is ready at once (登录好了 its word).
  if (h.installed && h.loggedIn) return "ready";
  if (h.installed && h.login) return "login";
  if (h.installed) return h.loggedIn ? "ready" : "signin";
  if (h.setup?.phase === "failed") return "failed";
  return h.installable ? "install" : "missing";
}

/**
 * D416: what the row says of an agent partly there (its command line too old, broken, or only its
 * desktop app), and what its one button does then: 更新 (its own updater) or 重新安装.
 */
export function troubleWords(h: Pick<DeviceHarness, "trouble" | "version">): { word: string; args: string[]; button: "install" | "update" | "reinstall" } | undefined {
  const tr = h.trouble;
  if (!tr) return undefined;
  if (tr.kind === "too_old") return { word: "ag.trouble.too_old", args: [h.version ?? "?", tr.need], button: "update" };
  if (tr.kind === "broken") return { word: "ag.trouble.broken", args: [], button: "reinstall" };
  if (tr.kind === "root") return undefined; // D549: its own look ("cant"), not an install
  if (tr.kind === "coming") return undefined; // D625: its own look ("coming"), for an older home
  if (tr.kind === "node_old") return undefined; // D630: its own look ("cant"), not an install
  return { word: "ag.trouble.app_only", args: [tr.app], button: "install" };
}

/** The agents the lend sheet offers to install, and which start checked (Codex and Claude Code; D371: DeepSeek Harness offered, not checked; D416: Antigravity last, not checked). */
export function offerable(hs: readonly DeviceHarness[]): { harness: string; checked: boolean }[] {
  const order = ["codex", "claude-code", "deepseek-harness", "pi", "antigravity", "opencode", "devin", "kimi", "cursor", "dim"];
  return order
    .map((id) => hs.find((h) => h.harness === id))
    .filter((h): h is DeviceHarness => !!h && !h.installed && !!h.installable)
    .map((h) => ({ harness: h.harness, checked: h.harness === "codex" || h.harness === "claude-code" }));
}

/** Is any agent signed in there (the computer can take tasks)? */
export const anyReady = (hs: readonly DeviceHarness[]) => hs.some((h) => h.installed && h.loggedIn);
/** Is anything being put there now? */
export const anyInstalling = (hs: readonly DeviceHarness[]) => hs.some((h) => h.setup?.phase === "installing" || h.setup?.phase === "queued");
