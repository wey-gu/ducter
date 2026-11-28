// D673 (research/248 phase 1): a demo core for the look's shots. It installs the Midnight
// theme (from this worktree's real plugin folder) into a scratch data dir, consents and applies
// it, so the web and the Mac render the app under Midnight, and Look and sound / Plugins list it
// beside Pebble.
//
//   DUCTER_PORT=7551 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-theme.ts
//   # web:  http://127.0.0.1:7551/app#settings=phone  (Look and sound) and #settings=plugins
//   # Mac:  DUCTER_SHELL_URL=ws://127.0.0.1:7551/ws ... go test ./internal/views -run PluginsShots
import { resolve } from "node:path";
import { createThemeRuntime } from "@ducter/core/src/plugins/theme.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dataDir = process.env.DUCTER_DATA_DIR || `${process.env.TMPDIR ?? "/tmp"}/ducter-demo-theme-${Date.now()}`;
const midnight = resolve(new URL("../../.plugins-repo/repo/plugins/midnight", import.meta.url).pathname);

const core = startCore({
  dataDir,
  push: false,
  persona: { id: "default", name: "Ducter", identity: "" },
  ooSource: noOo,
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const themes = createThemeRuntime({ dataDir });
const a = await themes.install(midnight);
if (!a.ok) throw new Error(a.error ?? "install failed");
themes.consent("midnight");
themes.activate("midnight");
console.log(`theme demo on port ${process.env.DUCTER_PORT ?? "7551"}: Midnight installed and active`);
