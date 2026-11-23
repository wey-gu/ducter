// D494: the names of Settings' panes as the person sees them in the rail, zh and en, for the words
// Ducter's code and the partner use to point somewhere ("在 设置 › Agent 通信 里关掉"). The partner
// once pointed the author to 「设置 → 与其他 AI 对话」, a pane that never existed: the line it read
// named the pane in English and the model made up the Chinese. The partner now gets the real name in
// the person's language, from this one table; apps/web/test/settings-panes.test.ts checks it against
// the web's own (the Mac app's Go table carries the same words).
import { pickTag, type LangTag } from "./lang.ts";

export type PaneKey = "home" | "partner" | "memory" | "peers" | "notify" | "accounts" | "todos" | "chats" | "autofill" | "devices";

export const PANE_NAMES: Record<"zh" | "en", { settings: string; panes: Record<PaneKey, string> }> = {
  zh: { settings: "设置", panes: { home: "概览", partner: "伙伴", memory: "记忆", peers: "Agent 通信", notify: "通知", accounts: "账号", todos: "待办来源", chats: "聊天软件", autofill: "密码和银行卡", devices: "你的设备" } },
  en: { settings: "Settings", panes: { home: "Overview", partner: "Partner", memory: "Memory", peers: "Agent messaging", notify: "Notifications", accounts: "Accounts", todos: "To-do sources", chats: "Chat apps", autofill: "Passwords & cards", devices: "Your devices" } },
};

/** "设置 › Agent 通信" / "Settings › Agent messaging": the pane, by its name in the rail, in that language. */
export function paneName(pane: PaneKey, lang: LangTag | string = "en"): string {
  const w = PANE_NAMES[pickTag(lang as LangTag, ["zh", "en"] as LangTag[]) === "zh" ? "zh" : "en"];
  return `${w.settings} › ${w.panes[pane]}`;
}
