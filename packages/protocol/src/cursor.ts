// Cursor's SDK is not a command line and is not bundled into Ducter's single binary (research/239):
// it is ~38 MB with a native companion, so it is installed on demand into Ducter's own tools folder
// (the same `npm install -g --prefix <data>/tools/node` the other agents' command lines use) and
// handed to OAR's cursor runtime as `sdkModule` in subprocess mode (docs/runtimes/cursor.md at
// v0.137.0, CursorSubprocessOptions.sdkModule + childProcess + runCursorChild). This module owns
// that one location and the exact version OAR pins; the probe, the installer, the runner and the
// child entrypoint all read it here.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The optional peer OAR hands to its cursor runtime. */
export const CURSOR_SDK_PACKAGE = "@cursor/sdk";
/** OAR's exact pin (`@botiverse/oar` runtimes/cursor/sdk-version.js at 0.137.0). */
export const CURSOR_SDK_VERSION = "1.4.1";
/** The SDK's own `engines.node` (OAR's CURSOR_MIN_NODE_VERSION). */
export const CURSOR_MIN_NODE_VERSION = "22.13.0";

/** Where npm puts a package under Ducter's tools prefix: Unix `lib/node_modules`, Windows `node_modules`. */
export function cursorSdkDir(dataDir: string): string | undefined {
  const node = join(resolve(dataDir), "tools", "node");
  for (const dir of [join(node, "lib", "node_modules", ...CURSOR_SDK_PACKAGE.split("/")), join(node, "node_modules", ...CURSOR_SDK_PACKAGE.split("/"))]) {
    if (existsSync(join(dir, "package.json"))) return dir;
  }
  return undefined;
}

/** The installed SDK's own version, when there is one there. Never reads a credential. */
export function cursorSdkVersion(dataDir: string): string | undefined {
  const dir = cursorSdkDir(dataDir);
  if (!dir) return undefined;
  try {
    const v = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))?.version;
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The `sdkModule` a cursor child passes to `import()`: OAR pins the SDK exactly, so a copy with
 * another version is not handed over (the card offers the pinned install instead). A file URL is
 * what OAR's docs name; the child and `createRequire` both take it.
 */
export function cursorSdkModule(dataDir: string): string | undefined {
  const dir = cursorSdkDir(dataDir);
  if (!dir || cursorSdkVersion(dataDir) !== CURSOR_SDK_VERSION) return undefined;
  const pkg = join(dir, "package.json");
  try {
    // Bun's resolver honours the SDK's own `bun` export condition (dist/bundled/index.js); fall
    // back to Node's require conditions when Bun is absent (the type-check runner).
    const bun = (globalThis as { Bun?: { resolveSync?: (id: string, from: string) => string } }).Bun;
    const entry = bun?.resolveSync?.(CURSOR_SDK_PACKAGE, pkg) ?? createRequire(pkg).resolve(CURSOR_SDK_PACKAGE);
    return entry.startsWith("file:") ? entry : pathToFileURL(entry).href;
  } catch {
    return undefined;
  }
}

/** True when this copy is the exact SDK OAR pins, whichever package version sits beside it. */
export function cursorSdkReady(dataDir: string): boolean {
  return cursorSdkModule(dataDir) !== undefined;
}
