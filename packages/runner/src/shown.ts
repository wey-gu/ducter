// D206: what a task shows the user (report_to_main `show`), read on the computer the task runs on.
// Only files the task could have made for the user count: inside its working place, its own
// scratch folder, in Ducter's evidence folder for it (browser screenshots), or where Codex saves
// the pictures it generates (<CODEX_HOME>/generated_images, verified against a real Codex session
// record, research/56). Links are resolved before the check, so nothing outside those folders can
// ride in on one; and nothing in Ducter's own data folder (D207) but the task's own scratch and
// evidence, even when its place is a folder holding it (a folder task over the home folder).
// D356: the same read opens a link to a file in the task's words, so each refusal carries a code.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { MEDIA_LIMITS, type FileOpenError } from "@ducter/protocol";
import { isDucterData } from "@ducter/protocol/src/ducter-folder.ts";

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

/** A refusal with its reason (D356); its message is a sentence the task can act on. */
export class ShownFail extends Error {
  constructor(
    readonly code: FileOpenError,
    message: string,
  ) {
    super(message);
  }
}

/** The reason in a refusal's sentence (a worker's answer carries only the sentence). */
export function shownCode(message: string): FileOpenError {
  if (/no such file|not a file|empty path/.test(message)) return "missing";
  if (/only files in/.test(message)) return "outside";
  if (/too big/.test(message)) return "too_big";
  return "failed";
}

const ownId = (taskId: string) => /^[A-Za-z0-9_-]{1,64}$/.test(taskId);

/** The task's own folders in Ducter's data folder: its scratch and its evidence. */
const ownData = (taskId: string, dataDir: string) => (ownId(taskId) ? [join(dataDir, "scratch", taskId), join(dataDir, "evidence", taskId)] : []);

/** The folders a task's shown files may come from, on this computer. */
export function shownRoots(a: Omit<ShownAsk, "path">, o: { dataDir: string; codexHome?: string }): string[] {
  const codex = o.codexHome || process.env.CODEX_HOME || join(homedir(), ".codex");
  return [a.cwd, ...ownData(a.taskId, o.dataDir), join(codex, "generated_images")].filter(Boolean);
}

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
};

const within = (root: string, p: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);

/** Reads one file a task asked to show; throws a sentence the task can act on when it can't. */
export function readShown(a: ShownAsk, o: { dataDir: string; codexHome?: string }): ShownFile {
  const raw = String(a.path ?? "").trim().replace(/^~(?=\/|$)/, homedir());
  if (!raw) throw new ShownFail("missing", "empty path");
  const abs = isAbsolute(raw) ? raw : resolve(a.cwd || o.dataDir, raw);
  if (!existsSync(abs)) throw new ShownFail("missing", `${raw}: no such file`);
  const file = real(abs);
  const outside = `${raw}: only files in your working folder, your evidence folder or Codex's generated images can be shown`;
  const inside = shownRoots(a, o)
    .map(real)
    .some((r) => !!r && !!file && within(r, file));
  if (!file || !inside) throw new ShownFail("outside", outside);
  // Ducter's own data (the Log, its keys, other tasks' scratch) never, but the task's own folders there.
  if (isDucterData(file, o.dataDir) && !ownData(a.taskId, o.dataDir).map(real).some((r) => !!r && within(r, file))) throw new ShownFail("outside", outside);
  const st = statSync(file);
  if (!st.isFile()) throw new ShownFail("missing", `${raw}: not a file`);
  if (st.size > MEDIA_LIMITS.bytes) throw new ShownFail("too_big", `${raw}: too big to show (over ${Math.round(MEDIA_LIMITS.bytes / 1024 / 1024)} MB)`);
  return { name: basename(file), bytes: new Uint8Array(readFileSync(file)) };
}
