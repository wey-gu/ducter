// D310: the name this computer goes by when the person gave Ducter none. On a Mac it is the
// Computer Name the person set in System Settings ("Wey’s MacBook Pro"); elsewhere, or when that
// can't be read, the host name without its DNS domain ("Mac.lan" → "Mac"). Every place that names
// this computer (the home, a worker, the command line, the app) asks here, so they agree.
import { hostname as osHostname } from "node:os";
import { computerName } from "@ducter/protocol";

type Read = () => string | undefined;

/** The macOS Computer Name, or undefined (another system, or scutil said nothing). */
export function macComputerName(platform = process.platform): string | undefined {
  if (platform !== "darwin") return undefined;
  try {
    const r = Bun.spawnSync(["scutil", "--get", "ComputerName"], { stdout: "pipe", stderr: "ignore", timeout: 2000 });
    if (r.exitCode !== 0) return undefined;
    return clean(r.stdout.toString());
  } catch {
    return undefined;
  }
}

/** Control and format characters out, whitespace collapsed, at most 64 characters. */
const clean = (s: string) => s.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 64) || undefined;

let cached: string | undefined;

/**
 * This computer's name as a person reads it. `given` (a test's or a caller's own name) is read the
 * same way and wins; otherwise the Computer Name on a Mac, else the host name without its domain.
 */
export function thisComputer(given?: string, o: { mac?: Read; hostname?: () => string } = {}): string {
  if (given) return computerName(given);
  if (!o.mac && !o.hostname && cached) return cached;
  const got = (o.mac ?? macComputerName)() || computerName((o.hostname ?? osHostname)()) || "localhost";
  if (!o.mac && !o.hostname) cached = got;
  return got;
}

/** This computer's host name without its domain: what pre-D310 pairings named it by. */
export const thisHost = (given?: string) => computerName(given ?? osHostname());
