// The panes of Settings, in the list's order (D150): each its page, its clay and its title key. One
// list for the Settings sheet (views.tsx) and 找设置 / Find a setting (setfind.ts, D663), so a pane
// added here without findable settings fails apps/web/test/setfind.test.ts.
import { HANDHELD, type SettingsPage } from "./app.ts";

export type SetSection = { page: Exclude<SettingsPage, "">; art: string; title: string };

export const SECTIONS: SetSection[] = [
  { page: "partner", art: "idle", title: "settings.tab.partner" },
  // D257: the partner's own notebook (the one it always carries), and two of the person's agents' coins.
  { page: "memory", art: "notebook", title: "settings.tab.memory" },
  { page: "peers", art: "coins", title: "settings.tab.peers" },
  { page: "notify", art: "wait_clock", title: "settings.tab.notify" },
  { page: "accounts", art: "wait_mail", title: "settings.tab.accounts" },
  // D341: 待办来源 / To-do sources (todos.tsx); D348: its own clay, a note page with a ticked box.
  { page: "todos", art: "set_todos", title: "settings.tab.todos" },
  // D655: 导入 / Import (imports.tsx): a page of lines, things carried in.
  { page: "import", art: "wait_file", title: "settings.tab.import" },
  // D276: 聊天软件 / Chat apps (channels.tsx); D283: two clay speech bubbles.
  { page: "chats", art: "set_chats", title: "settings.tab.chats" },
  { page: "autofill", art: "set_autofill", title: "settings.tab.autofill" },
  { page: "devices", art: "mini_awake", title: "settings.tab.devices" },
  // D330: in a browser on a computer it is 这台电脑 / This computer, with the clay laptop.
  { page: "phone", art: HANDHELD === "computer" ? "dev_laptop_awake" : "phone", title: "settings.phone" },
  // D673 (research/248 phase 1): 插件 / Plugins, the pane where a look is managed as code.
  { page: "plugins", art: "set_todos", title: "settings.tab.plugins" },
];

/** The name a pane goes by in the list (Agent messaging's short one, D332). */
export const sectionKey = (s: SetSection) => (s.page === "peers" ? "settings.short.peers" : s.title);
