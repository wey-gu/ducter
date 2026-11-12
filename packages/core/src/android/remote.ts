// D234: Ducter's phone on a worker Mac. The phone (its SDK, its data, the emulator) lives on that
// Mac; the phone tools, the gate and the live view stay on the home, which drives the phone over
// the worker's own socket. Two halves:
//   - workerPhoneOps: the worker's side, its ops on its own phone (install, erase, and one method
//     of the device at a time: a small fixed set, never a shell or adb from the home);
//   - remotePhoneDevice: the home's side, a PhoneDevice that asks the worker.
import type { WorkerLink } from "@ducter/protocol/src/internal.ts";
import type { PhoneDevice, Raw, RunState } from "./device.ts";
import type { PhoneHost } from "./host.ts";
import type { Screen } from "./screen.ts";

/** The device methods the home may call on a worker's phone. */
const METHODS = new Set(["state", "ensure", "touch", "hold", "release", "stop", "jpeg", "screen", "tap", "swipe", "key", "text", "front", "apps", "launch", "size"]);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export interface WorkerPhoneOps {
  ops: Record<string, (a: any) => Promise<unknown>>;
  /** The home's socket went: let go of everything it held (the phone then stops when idle). */
  releaseAll(): void;
}

export function workerPhoneOps(host: PhoneHost): WorkerPhoneOps {
  const holds = new Map<string, () => void>();
  let seq = 0;
  const dev = host.device;
  return {
    ops: {
      phone_terms: () => host.terms(),
      // It takes minutes: the answer says only whether it started; the card follows the abilities.
      async phone_install(a: { accepted?: unknown }) {
        const accepted = Array.isArray(a.accepted) ? a.accepted.filter((x: any) => x && typeof x.id === "string" && typeof x.sha256 === "string").map((x: any) => ({ id: x.id, sha256: x.sha256 })) : [];
        const started = host.install(accepted);
        const quick = await Promise.race([started, Bun.sleep(300).then(() => undefined)]);
        return quick && !quick.ok ? { ok: false, reason: quick.reason, message: quick.message } : { ok: true };
      },
      async phone_erase(a: { keepSdk?: unknown }) {
        for (const r of holds.values()) r();
        holds.clear();
        await host.erase(a.keepSdk === true);
        return { ok: true };
      },
      async phone_dev(a: { m?: unknown; a?: any }) {
        const m = String(a.m ?? "");
        const x = a.a ?? {};
        if (!METHODS.has(m)) throw new Error(`no such phone method: ${m}`);
        if (host.setup().state !== "ready" && m !== "state" && m !== "release" && m !== "stop") throw new Error("Ducter's phone isn't installed on this computer");
        switch (m) {
          case "state":
            return { state: dev.state() };
          case "ensure":
            await dev.ensure();
            return { state: dev.state() };
          case "touch":
            dev.touch();
            return {};
          case "hold": {
            const id = `h${++seq}`;
            holds.set(id, dev.hold(`home: ${String(x.why ?? "")}`.slice(0, 80)));
            return { id };
          }
          case "release":
            holds.get(String(x.id ?? ""))?.();
            holds.delete(String(x.id ?? ""));
            return {};
          case "stop":
            await dev.stop();
            return {};
          case "jpeg":
            return { data: Buffer.from(await dev.jpeg()).toString("base64") };
          case "screen":
            return { screen: (await dev.screen()) ?? null };
          case "tap":
            await dev.tap(num(x.x), num(x.y));
            return {};
          case "swipe":
            await dev.swipe(num(x.x1), num(x.y1), num(x.x2), num(x.y2), x.ms == null ? undefined : num(x.ms));
            return {};
          case "key":
            if (!/^KEYCODE_[A-Z0-9_]+$/.test(String(x.code ?? ""))) throw new Error("not a key code");
            await dev.key(String(x.code));
            return {};
          case "text":
            await dev.text(String(x.s ?? "").slice(0, 2000));
            return {};
          case "front":
            return { app: await dev.front() };
          case "apps":
            return { apps: await dev.apps() };
          case "launch":
            if (!/^[A-Za-z][\w]*(\.[\w]+)+$/.test(String(x.pkg ?? ""))) throw new Error("not an app id");
            await dev.launch(String(x.pkg));
            return {};
          case "size":
            return await dev.size();
        }
        return {};
      },
    },
    releaseAll() {
      for (const r of holds.values()) r();
      holds.clear();
    },
  };
}

/**
 * The home's handle on a worker's phone. state() is what the worker last said (its card's
 * running flag, or the last call); every other method is one request over the worker's socket.
 */
export function remotePhoneDevice(link: Pick<WorkerLink, "call" | "online">, o: { running?: () => boolean; timeoutMs?: number } = {}): PhoneDevice {
  let last: RunState = "stopped";
  const call = async <T>(m: string, a: object = {}, ms = o.timeoutMs ?? 30_000): Promise<T> => {
    if (!link.online()) throw new Error("that computer can't be reached right now, so its phone can't be used");
    return link.call<T>("phone_dev", { m, a }, ms);
  };
  const noShell = (): Promise<never> => Promise.reject(new Error("not on a phone on another computer"));
  return {
    state: () => (o.running?.() ? "running" : last),
    async ensure() {
      last = "starting";
      try {
        const r = await call<{ state: RunState }>("ensure", {}, 200_000);
        last = r?.state ?? "running";
      } catch (e) {
        last = "stopped";
        throw e;
      }
    },
    touch: () => void call("touch").catch(() => {}),
    hold(why) {
      const id = call<{ id: string }>("hold", { why }).catch(() => undefined);
      return () => void id.then((r) => r && call("release", { id: r.id }).catch(() => {}));
    },
    async stop() {
      await call("stop").catch(() => {});
      last = "stopped";
    },
    adb: noShell as (args: string[]) => Promise<Raw>,
    shell: noShell as (cmd: string[]) => Promise<string>,
    async jpeg() {
      const r = await call<{ data: string }>("jpeg");
      return new Uint8Array(Buffer.from(r?.data ?? "", "base64"));
    },
    async screen() {
      const r = await call<{ screen: Screen | null }>("screen");
      return r?.screen ?? undefined;
    },
    tap: async (x, y) => void (await call("tap", { x, y })),
    swipe: async (x1, y1, x2, y2, ms) => void (await call("swipe", { x1, y1, x2, y2, ...(ms != null ? { ms } : {}) })),
    key: async (code) => void (await call("key", { code })),
    text: async (s) => void (await call("text", { s })),
    front: async () => (await call<{ app: string }>("front"))?.app ?? "",
    apps: async () => (await call<{ apps: { pkg: string; label?: string }[] }>("apps"))?.apps ?? [],
    launch: async (pkg) => void (await call("launch", { pkg })),
    size: async () => (await call<{ width: number; height: number }>("size")) ?? { width: 0, height: 0 },
  };
}
