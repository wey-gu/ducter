// D432: Settings polished pane by pane. A choice of a few is a row; the missing Mem tool is one line to
// copy; 发现了就说 lives on Notifications only; a waiting pane keeps its shape; This phone doesn't say its
// title again. Source checks, as settings-trim.test.ts does, plus the core's command for each system.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { pipxCmd } from "../../../packages/core/src/bridge-link.ts";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the missing tool's line says the same on both clients, and names one command per system", () => {
  const mac = src("../../desktop/internal/i18n/i18n.go");
  for (const lang of ["zh", "en"] as const) {
    const w = strings(lang).t("bridge.mem.install.need.run", "hel");
    expect(w).toContain("hel");
    expect(mac).toContain(JSON.stringify(strings(lang).t("bridge.mem.install.need.run", "%s")));
  }
  expect(pipxCmd("darwin")).toBe("brew install pipx");
  expect(pipxCmd("linux")).toBe("sudo apt install pipx");
  // Shown to copy, never two systems in one sentence.
  expect(src("../src/memory.tsx")).toContain("<CopyLine text={b.cmd}");
  expect(src("../../desktop/internal/views/memory_pane.go")).toContain(`a.lendCopy(c, "mem-cmd", b.Cmd, true)`);
});

test("发现了就说 is on Notifications only", () => {
  const acct = src("../src/accounts.tsx");
  const cards = acct.slice(acct.indexOf("export function SourceCards"));
  expect(cards.slice(0, cards.indexOf("\n}\n"))).not.toContain("<ProactiveChips");
  expect(src("../src/views.tsx")).toContain("<ProactiveChips>");
  expect(src("../../desktop/internal/views/partner.go")).not.toContain(`proactiveSection(c, "acct"`);
});

test("a pane still reading keeps its shape, on both clients", () => {
  for (const f of ["todos.tsx", "channels.tsx", "autofill.tsx"]) expect(src(`../src/${f}`), f).not.toContain(`<div class="small">{t("conn.connecting")}</div>`);
  expect(src("../src/set-grid.tsx")).toContain("export function Waiting");
  for (const f of ["todos.go", "autofill.go", "partner.go"]) expect(src(`../../desktop/internal/views/${f}`), f).toContain("a.paneWait(c,");
});

test("a choice of a few is a row, and fills the text column on a phone", () => {
  expect(src("../../desktop/internal/views/todos.go")).toContain(`a.tileRow(c, key+":"+s.ID, nil, title, standing,`);
  const css = src("../static/app.css");
  expect(css).toContain(".chat-row > .seg { flex: 1 1 100%; }");
  expect(css).toContain(".set-page.pushed .lede-note + .how { padding: 0 var(--set-in); }");
});

test("This phone doesn't say its title again under its card", () => {
  expect(src("../src/views.tsx")).not.toContain("settings.phone.note");
  expect(src("../src/voice.tsx")).not.toContain(`<b>{t("voice.settings")}</b>`);
});
