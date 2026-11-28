// research/248 phase 1 (D673): the example theme installs through the host from the local
// official repository. The repository's index lists it as a theme (no app); the host checks out the
// pinned commit, verifies the content hash, and the official index's exact version+hash is what
// makes the consent card say "Ducter 查过这个版本".
import { expect, test } from "bun:test";
import { join } from "node:path";
import { createRepositories } from "../src/imports/repos.ts";
import { createPluginRuntime } from "../src/imports/plugins.ts";
import { createThemeRuntime } from "../src/plugins/theme.ts";
import { tempDir } from "./helpers.ts";

const repo = join(import.meta.dir, "..", "..", "..", ".plugins-repo", "repo");

test("the Midnight theme installs from the local official repository, reviewed", async () => {
  const t = tempDir();
  const plugins = createPluginRuntime({ dataDir: t.dir });
  const themes = createThemeRuntime({ dataDir: t.dir });
  const repos = createRepositories({ dataDir: t.dir, plugins, theme: themes, officialUrl: repo });

  const view = await repos.look(true);
  expect(view.repositories.find((r) => r.official)?.state).toBe("ready");

  const a = await repos.installTheme("official", "midnight");
  expect(a.ok).toBe(true);
  expect(a.reviewed).toBe(true);
  expect(a.needsConsent).toBe(true);

  themes.consent("midnight");
  themes.activate("midnight");
  const tv = themes.view();
  expect(tv.active).toBe("midnight");
  expect(tv.themes[0]).toMatchObject({ id: "midnight", consented: true, active: true, reviewed: true });
  // The dark paper's ink is the theme's own, not Pebble's.
  expect(themes.activeTokens()?.dark.ink).toBe("#E8EDF5");
  t.cleanup();
});
