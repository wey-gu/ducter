// D347: 借一台电脑来干活 / Lend a computer. The home mints a one-time code and the one line the
// other computer pastes (it installs Ducter, joins with the code and keeps the worker running);
// then it says when that computer joined and when it is here, so the clients can wait for it
// in place instead of leaving the person to look. Pure but for the network interfaces it reads.
import { networkInterfaces } from "node:os";
import type { LendFrame } from "@ducter/protocol";
import { normalizeCode, type Device, type DeviceAuth } from "./auth.ts";
import { publicAddress } from "./devices.ts";

/** Where the install script lives (the site serves apps/site/public/install.sh there). */
export const INSTALL_URL = "https://ducter.ai/install.sh";

/** The one line for the other computer: install, join with the code, keep it running. */
export function lendLine(address: string, code: string): string {
  return `curl -fsSL ${INSTALL_URL} | sh -s -- worker ${address} --code ${code}`;
}

/** A one-liner the other computer runs to see whether it reaches the home at all. */
export function lendCheck(address: string): string {
  return `curl -sS -m 10 ${address}/health`;
}

const LOOP = /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * The home's address on its own network, when it listens there (bound to 0.0.0.0 or to a private
 * address): http://<private IPv4>:<port>. A home that listens only to itself (the Mac app's
 * default, 127.0.0.1) has none: nothing on the network can dial it.
 */
export function lanAddress(bind: string, port: number, ifaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): string | undefined {
  if (!bind || LOOP.test(bind)) return undefined;
  if (bind !== "0.0.0.0" && bind !== "::" && PRIVATE.test(bind)) return `http://${bind}:${port}`;
  if (bind !== "0.0.0.0" && bind !== "::") return undefined;
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal && PRIVATE.test(i.address)) return `http://${i.address}:${port}`;
    }
  }
  return undefined;
}

export interface Lend {
  /** A fresh code and the line to paste; state waiting. */
  mint(): LendFrame;
  /** The /pair endpoint traded a code for a device (any code; only a lend's is followed). */
  redeemed(code: string, device: Device): void;
  /** A worker said hello: when it came from a lend's code, it is here. */
  hello(deviceId: string): void;
}

export function createLend(o: {
  auth: Pick<DeviceAuth, "createCode">;
  dataDir: string;
  env?: Record<string, string | undefined>;
  /** The interface the home listens on (DUCTER_HOST, default 127.0.0.1). */
  bind: string;
  port: () => number;
  ifaces?: () => ReturnType<typeof networkInterfaces>;
  /** Every client hears a lend's progress (the window that asked may have moved to another). */
  broadcast: (f: LendFrame) => void;
  now?: () => number;
}): Lend {
  const now = o.now ?? Date.now;
  // code (normalized) → the frame as last said. Kept for an hour: a slow install still lands.
  const open = new Map<string, LendFrame & { at: number }>();
  const byDevice = new Map<string, string>();
  const sweep = () => {
    for (const [k, f] of open) if (now() - f.at > 60 * 60_000) open.delete(k), f.device && byDevice.delete(f.device);
  };
  return {
    mint() {
      sweep();
      const { code, expiresAt } = o.auth.createCode();
      const pub = publicAddress(o.dataDir, o.env ?? process.env);
      const lan = pub ? undefined : lanAddress(o.bind, o.port(), o.ifaces?.());
      const address = pub ?? lan;
      const f: LendFrame = {
        t: "lend",
        code,
        expiresAt: new Date(expiresAt).toISOString(),
        state: "waiting",
        ...(address ? { address, line: lendLine(address, code), check: lendCheck(address) } : {}),
        ...(lan ? { sameNetwork: true } : {}),
      };
      open.set(normalizeCode(code), { ...f, at: now() });
      return f;
    },
    redeemed(code, device) {
      const k = normalizeCode(code);
      const f = open.get(k);
      if (!f) return;
      const next = { ...f, state: "joined" as const, device: device.id, name: device.name };
      open.set(k, next);
      byDevice.set(device.id, k);
      const { at: _, line: _l, ...frame } = next;
      o.broadcast(frame);
    },
    hello(deviceId) {
      const k = byDevice.get(deviceId);
      const f = k ? open.get(k) : undefined;
      if (!k || !f || f.state === "here") return;
      const next = { ...f, state: "here" as const };
      open.set(k, next);
      const { at: _, line: _l, ...frame } = next;
      o.broadcast(frame);
    },
  };
}
