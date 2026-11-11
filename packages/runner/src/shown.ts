// D206: what a task shows the user (report_to_main `show`), read on the computer the task runs on.
// Only files the task could have made for the user count: inside its working place, in Ducter's
// evidence folder for it (browser screenshots), or where Codex saves the pictures it generates
// (<CODEX_HOME>/generated_images, verified against a real Codex session record, research/56).
// Links are resolved before the check, so nothing outside those folders can ride in on one.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { MEDIA_LIMITS } from "@ducter/protocol";

export interface ShownAsk {
  path: string;
  /** The task's working folder on that computer ("" for a place-less task). */
  cwd: string;
  taskId: string;
}

export interface ShownFile {
  name: string;
  bytes: Uint8Array;
}

/** The folders a task's shown files may come from, on this computer. */
export function shownRoots(a: Omit<ShownAsk, "path">, o: { dataDir: string; codexHome?: string }): string[] {
  const codex = o.codexHome || process.env.CODEX_HOME || join(homedir(), ".codex");
  return [a.cwd, join(o.dataDir, "evidence", a.taskId), join(codex, "generated_images")].filter(Boolean);
}

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
};

/** Reads one file a task asked to show; throws a sentence the task can act on when it can't. */
export function readShown(a: ShownAsk, o: { dataDir: string; codexHome?: string }): ShownFile {
  const raw = String(a.path ?? "").trim().replace(/^~(?=\/|$)/, homedir());
  if (!raw) throw new Error("empty path");
  const abs = isAbsolute(raw) ? raw : resolve(a.cwd || o.dataDir, raw);
  if (!existsSync(abs)) throw new Error(`${raw}: no such file`);
  const file = real(abs);
  const inside = shownRoots(a, o)
    .map(real)
    .some((r) => !!r && !!file && (file === r || file.startsWith(r.endsWith(sep) ? r : r + sep)));
  if (!file || !inside) throw new Error(`${raw}: only files in your working folder, your evidence folder or Codex's generated images can be shown`);
  const st = statSync(file);
  if (!st.isFile()) throw new Error(`${raw}: not a file`);
  if (st.size > MEDIA_LIMITS.bytes) throw new Error(`${raw}: too big to show (over ${Math.round(MEDIA_LIMITS.bytes / 1024 / 1024)} MB)`);
  return { name: basename(file), bytes: new Uint8Array(readFileSync(file)) };
}
