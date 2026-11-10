// D187: a Mac whose Ducter lives inside Ducter.app updates from any client (the phone's card, the
// app on another Mac, `ducter update --all`) by asking the app on that Mac to do it. The Ducter
// there (the home, or the worker it runs for a home elsewhere) and the app share one data folder,
// so they speak through two small files in <dataDir>/updates/:
//
//   app.json      the app's side: its version and its updater's state, rewritten on every change
//                 and every 15 s while it runs (D72's updater, apps/desktop/internal/update);
//   app-ask.json  this side: get version v (download and check it), then restart into it.
//
// The order is the in-place update's (D148): the app fetches and checks the new version while
// everything keeps working; then this side waits for the safe point (no merge or undo mid-way,
// a turn in flight gets its grace) and only then asks the app to restart, with "Putting the new
// version in" on the Mac's own screen (D160). The swap restarts this Ducter on the new helper,
// and the restarted one says how it went (result.json, judged by D167's rule). An app that is
// closed, or a Mac asleep, is said plainly and nothing is started.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { UpdatePhase, UpdateReason } from "@ducter/protocol";
import { compareVersions, isVersion } from "@ducter/protocol/src/version.ts";
import { updatesDir, writeResult, type Fail } from "./update.ts";

/** The app's updater, as it says it (the Go updater's State values). */
export type AppUpdaterState = "idle" | "checking" | "downloading" | "uptodate" | "ready" | "available" | "failed" | "nofeed" | "restarting";

export interface AppSide {
  pid?: number;
  /** The app's own version. */
  current: string;
  state: AppUpdaterState;
  /** The version found, fetched or ready. */
  version?: string;
  progress?: number;
  /** The updater's Reason (location, checksum, signature, owner, feed, install…). */
  reason?: string;
  detail?: string;
  /** A ready version can go in without anyone at the Mac (no administrator's password). */
  canRestart?: boolean;
  /** The ask (app-ask.json's id) the app has taken: its state answers that ask. */
  asked?: string;
  /** ISO, written at least every 15 s while the app runs. */
  at: string;
}

export interface AppAsk {
  id: string;
  to: string;
  step: "get" | "restart";
  at: string;
}

export const appFile = (dataDir: string) => join(updatesDir(dataDir), "app.json");
export const askFile = (dataDir: string) => join(updatesDir(dataDir), "app-ask.json");
/** An app.json older than this: the app isn't running (closed, or the Mac asleep). */
export const APP_FRESH_MS = 45_000;
/** How long the app may take to download and check a version. */
export const GET_WAIT_MS = 20 * 60_000;
/** After the restart is asked, how long a swap that didn't happen is watched for. */
export const AFTER_WAIT_MS = 3 * 60_000;

export function readApp(dataDir: string): AppSide | undefined {
  try {
    const j = JSON.parse(readFileSync(appFile(dataDir), "utf8"));
    return j && typeof j.state === "string" && typeof j.at === "string" ? (j as AppSide) : undefined;
  } catch {
    return undefined;
  }
}

export function writeAsk(dataDir: string, a: AppAsk) {
  const p = askFile(dataDir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p + ".tmp", JSON.stringify(a, null, 2));
  renameSync(p + ".tmp", p);
}

export const hasAsk = (dataDir: string) => existsSync(askFile(dataDir));

/** The app is running and says so (within APP_FRESH_MS). */
export function appAwake(dataDir: string, now: number): AppSide | undefined {
  const a = readApp(dataDir);
  if (!a) return undefined;
  const at = Date.parse(a.at);
  return Number.isFinite(at) && now - at < APP_FRESH_MS ? a : undefined;
}

/** The app updater's reason, as an update's reason on a card. */
export function appReason(r: string | undefined): UpdateReason {
  switch (r) {
    case "feed":
    case "network":
      return "network";
    case "checksum":
    case "signature":
    case "gatekeeper":
    case "bundle":
      return "checksum";
    case "disk":
      return "disk";
    case "owner":
      return "app_password";
    case "location":
    case "unsigned":
      return "not_writable";
    default:
      return "failed";
  }
}

export interface AskAppInput {
  dataDir: string;
  /** The version this Ducter runs (the app's helper). */
  current: string;
  to: string;
  sys: { now(): number; sleep(ms: number): Promise<void> };
  /** The safe point (D148 (4)); a Fail stops before anything restarts. */
  settle?: () => Promise<Fail | undefined>;
  onPhase?: (phase: UpdatePhase, progress?: number) => void;
  /** Told when a restart that was asked for didn't happen (the app came back on the old version). */
  onAfter?: (f: Fail) => void;
  getWaitMs?: number;
  afterWaitMs?: number;
  pollMs?: number;
}

/**
 * Asks the app on this Mac to update to `to` and restart at the safe point. Resolves once the
 * restart is asked ({ ok: true, restarting: true }) or with why it can't go on; never throws.
 */
export async function askApp(i: AskAppInput): Promise<{ ok: true; restarting: true } | Fail> {
  const poll = i.pollMs ?? 1000;
  const id = `${i.sys.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const at = () => new Date(i.sys.now()).toISOString();
  const first = appAwake(i.dataDir, i.sys.now());
  if (!first) return { ok: false, reason: "app_closed" };
  // The app is there already and this Ducter still runs its old helper (D167): only the restart.
  const there = isVersion(first.current) && compareVersions(first.current, i.to) >= 0;
  if (!there) writeAsk(i.dataDir, { id, to: i.to, step: "get", at: at() });
  if (!there) i.onPhase?.("downloading", 0);
  const end = i.sys.now() + (i.getWaitMs ?? GET_WAIT_MS);
  let checking = false;
  while (!there) {
    await i.sys.sleep(poll);
    const a = appAwake(i.dataDir, i.sys.now());
    if (!a) return { ok: false, reason: "app_closed", detail: "Ducter on this Mac was closed while it downloaded" };
    const got = a.version && isVersion(a.version) && compareVersions(a.version, i.to) >= 0;
    if (a.state === "ready" && got) break;
    if (a.state === "downloading") {
      if ((a.progress ?? 0) >= 1 && !checking) (checking = true), i.onPhase?.("verifying");
      else if (!checking) i.onPhase?.("downloading", a.progress);
    }
    // An answer counts only once the app has taken this ask (its state before it is older news).
    if (a.asked === id) {
      if (a.state === "failed" || a.state === "available") return { ok: false, reason: appReason(a.reason), ...(a.detail ? { detail: a.detail } : {}) };
      if (a.state === "uptodate" || a.state === "nofeed") return { ok: false, reason: "no_release", detail: `the app found nothing newer than ${a.current}` };
    }
    if (i.sys.now() > end) return { ok: false, reason: "failed", detail: "the app took too long to get the new version" };
  }
  const ready = appAwake(i.dataDir, i.sys.now());
  if (!there && ready && ready.canRestart === false) return { ok: false, reason: "app_password" };
  i.onPhase?.("waiting");
  const held = await i.settle?.();
  if (held) return held;
  // The restarted Ducter judges this against what it runs (D167): on `to`, it updated.
  writeResult(i.dataDir, { from: i.current, to: i.to, ok: true, at: at() });
  i.onPhase?.("restarting");
  writeAsk(i.dataDir, { id, to: i.to, step: "restart", at: at() });
  // This process ends with the swap. Still here after a while, and the app back on the old version:
  // the swap didn't happen.
  void (async () => {
    const until = i.sys.now() + (i.afterWaitMs ?? AFTER_WAIT_MS);
    while (i.sys.now() < until) {
      await i.sys.sleep(poll * 3);
      // The app that opens again after a swap that didn't take says so (its updater's "install").
      const a = readApp(i.dataDir);
      if (a && a.pid !== first.pid && a.state === "failed") {
        const f: Fail = { ok: false, reason: a.reason === "install" ? "failed" : appReason(a.reason), detail: a.detail ?? "the app couldn't put the new version in" };
        writeResult(i.dataDir, { from: i.current, to: i.to, ok: false, reason: f.reason, ...(f.detail ? { detail: f.detail } : {}), at: at() });
        i.onAfter?.(f);
        return;
      }
    }
  })();
  return { ok: true, restarting: true };
}
