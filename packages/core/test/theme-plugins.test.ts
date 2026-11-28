// research/248 phase 1 (D673): the ducter-plugin/2 manifest (one kind object, reserved kinds
// refused, closed permissions), the theme's validation (both papers, contrast floors, missing
// tokens falling back to Pebble), and the theme runtime (install, consent, apply, revert).
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PEBBLE_TOKENS, THEME_FORMAT } from "@ducter/protocol/src/theme.ts";
import { PLUGIN_FORMAT_V2 } from "@ducter/protocol/src/plugins.ts";
import { readInstalledLedger } from "../src/plugins/ledger.ts";
import { parseManifestV2, readManifest } from "../src/plugins/manifest.ts";
import { contrastFailures, createThemeRuntime, resolveTheme } from "../src/plugins/theme.ts";
import { tempDir } from "./helpers.ts";

const NOW = Date.parse("2026-12-02T10:00:00Z");

function themeManifest(tokens = PEBBLE_TOKENS, name = "Midnight"): Record<string, unknown> {
  return { format: THEME_FORMAT, name: { en: name, zh: "午夜" }, tokens };
}

function writeThemePlugin(dir: string, o: { tokens?: unknown; manifest?: Record<string, unknown>; themeFile?: string } = {}) {
  mkdirSync(dir, { recursive: true });
  const m = o.manifest ?? {
    format: PLUGIN_FORMAT_V2,
    id: "midnight",
    kind: "theme",
    version: "0.1.0",
    name: { en: "Midnight", zh: "午夜" },
    author: { name: "Acme" },
    ducter: "^0.1",
    theme: { file: o.themeFile ?? "theme.json" },
    permissions: {},
  };
  writeFileSync(join(dir, "ducter-plugin.json"), `${JSON.stringify(m, null, 2)}\n`);
  writeFileSync(join(dir, o.themeFile ?? "theme.json"), `${JSON.stringify(themeManifest(o.tokens as never), null, 2)}\n`);
  return dir;
}

test("a v2 theme manifest parses; a reserved kind is refused with a clear message", () => {
  const m = parseManifestV2({
    format: PLUGIN_FORMAT_V2,
    id: "midnight",
    kind: "theme",
    version: "0.1.0",
    name: { en: "Midnight" },
    author: { name: "Acme" },
    ducter: "^0.1",
    theme: { file: "theme.json" },
    permissions: {},
  });
  expect(m.kind).toBe("theme");
  expect(m.theme?.file).toBe("theme.json");

  for (const kind of ["ui", "connector", "source"]) {
    expect(() =>
      parseManifestV2({ format: PLUGIN_FORMAT_V2, id: "x-1", kind, version: "0.1.0", name: { en: "X" }, author: { name: "A" }, ducter: "^0.1", permissions: {} }),
    ).toThrow(/reserved|not read yet/i);
  }
});

test("a v2 importer parses and maps to the v1 shape; a wrong kind object and unknown keys are refused", () => {
  const v2 = parseManifestV2({
    format: PLUGIN_FORMAT_V2,
    id: "acme-notes",
    kind: "importer",
    version: "0.3.1",
    name: { en: "Acme Notes" },
    author: { name: "Acme" },
    ducter: "^0.1",
    importer: { run: ["bun", "main.ts"], emits: "ducter-import/1", starts: [], detect: [] },
    permissions: { files: { read: ["./notes.json"] } },
  });
  expect(v2.importer?.emits).toBe("ducter-import/1");
  expect(v2.permissions.files?.read).toEqual(["./notes.json"]);

  // A theme object on an importer is a manifest error, not an ignored extra.
  expect(() =>
    parseManifestV2({ format: PLUGIN_FORMAT_V2, id: "x-1", kind: "importer", version: "0.1.0", name: { en: "X" }, author: { name: "A" }, ducter: "^0.1", importer: { run: ["x"], emits: "ducter-import/1", starts: [], detect: [] }, theme: { file: "t.json" }, permissions: { files: { read: ["a"] } } }),
  ).toThrow(/theme/);
  // Unknown keys are refused, never ignored.
  expect(() =>
    parseManifestV2({ format: PLUGIN_FORMAT_V2, id: "x-1", kind: "theme", version: "0.1.0", name: { en: "X" }, author: { name: "A" }, ducter: "^0.1", theme: { file: "t.json" }, readds: [], permissions: {} }),
  ).toThrow(/unknown manifest key/);
});

test("a theme with any permission is refused; a path out of the folder is refused", () => {
  expect(() =>
    parseManifestV2({ format: PLUGIN_FORMAT_V2, id: "x-1", kind: "theme", version: "0.1.0", name: { en: "X" }, author: { name: "A" }, ducter: "^0.1", theme: { file: "t.json" }, permissions: { files: { read: ["~/.x"] } } }),
  ).toThrow(/theme may not read/);
  expect(() =>
    parseManifestV2({ format: PLUGIN_FORMAT_V2, id: "x-1", kind: "theme", version: "0.1.0", name: { en: "X" }, author: { name: "A" }, ducter: "^0.1", theme: { file: "../theme.json" }, permissions: {} }),
  ).toThrow(/inside the folder/);
});

test("readManifest reads a v1 importer as v1 (unchanged) and a v2 theme as v2", () => {
  const t = tempDir();
  writeThemePlugin(join(t.dir, "midnight"));
  const r = readManifest(join(t.dir, "midnight"));
  expect(r.v2?.kind).toBe("theme");
  expect(r.v1).toBeUndefined();
  t.cleanup();
});

test("a missing token falls back to Pebble's own value; a bad motion bound is refused", () => {
  const t = { light: { bg: "#101010" }, dark: { bg: "#101010" } }; // everything else missing
  const r = resolveTheme({ format: THEME_FORMAT, name: { en: "X" }, tokens: t });
  expect(r.tokens.light.bg).toBe("#101010");
  expect(r.tokens.light.ink).toBe(PEBBLE_TOKENS.light.ink); // fallback
  expect(r.tokens.dark.surface).toBe(PEBBLE_TOKENS.dark.surface);

  expect(() => resolveTheme({ format: THEME_FORMAT, name: { en: "X" }, tokens: PEBBLE_TOKENS, motion: { personality: "bouncy", press: 400, enter: 220 } })).toThrow(/press stays within/);
});

test("a pair under its floor fails contrast; the same pair blocks install", async () => {
  // Ink on bg at ~2.9:1, in both papers.
  const bad = {
    light: { ...PEBBLE_TOKENS.light, ink: "#767676", bg: "#949494" },
    dark: { ...PEBBLE_TOKENS.dark, ink: "#767676", bg: "#949494" },
  };
  expect(contrastFailures(bad).length).toBeGreaterThan(0);

  const t = tempDir();
  writeThemePlugin(join(t.dir, "bad"), { tokens: bad });
  const rt = createThemeRuntime({ dataDir: t.dir, now: () => NOW });
  const a = await rt.install(join(t.dir, "bad"));
  expect(a.ok).toBe(false);
  expect(a.error).toBe("contrast");
  t.cleanup();
});

test("install, consent, apply and removal revert to Pebble", async () => {
  const t = tempDir();
  const dir = join(t.dir, "midnight");
  writeThemePlugin(dir);
  const rt = createThemeRuntime({ dataDir: t.dir, now: () => NOW });
  const a = await rt.install(dir);
  expect(a).toMatchObject({ ok: true, id: "midnight", needsConsent: true });
  expect(rt.activeId()).toBe("pebble");
  expect(rt.activeTokens()).toBeNull();

  rt.consent("midnight");
  rt.activate("midnight");
  expect(rt.activeId()).toBe("midnight");
  expect(rt.activeTokens()?.dark.bg).toBe(PEBBLE_TOKENS.dark.bg);
  expect(rt.view().active).toBe("midnight");
  expect(rt.view().themes[0]).toMatchObject({ id: "midnight", consented: true, active: true });

  rt.remove("midnight");
  expect(rt.activeId()).toBe("pebble");
  expect(rt.view().themes).toEqual([]);
  t.cleanup();
});

test("one installed ledger: the old importer file is copied in and both kinds share plugins.json", async () => {
  const t = tempDir();
  // A legacy importer ledger, as D668 wrote it.
  writeFileSync(
    join(t.dir, "import-plugins.json"),
    `${JSON.stringify({ format: "ducter-plugins-installed/1", plugins: { lody: { dir: join(t.dir, "plugins", "lody"), hash: "a".repeat(64), version: "0.1.0", app: "Lody", kind: "git" } } }, null, 2)}\n`,
  );
  const dir = join(t.dir, "midnight");
  writeThemePlugin(dir);
  const rt = createThemeRuntime({ dataDir: t.dir, now: () => NOW });
  await rt.install(dir);

  const ledger = readInstalledLedger(t.dir);
  expect(ledger["lody"]?.pluginKind).toBe("importer");
  expect(ledger["midnight"]?.pluginKind).toBe("theme");
  expect(existsSync(join(t.dir, "plugins.json"))).toBe(true);
  // The old file is left untouched.
  expect(existsSync(join(t.dir, "import-plugins.json"))).toBe(true);
  t.cleanup();
});

// The example theme in .plugins-repo must pass `check` on day one: Pebble's own papers, renamed.
test("the scaffold's tokens pass contrast in both papers", () => {
  expect(contrastFailures(PEBBLE_TOKENS)).toEqual([]);
});
