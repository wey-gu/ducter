// Which machine the main runs on, as a hash a client on the same machine can compute too
// (apps/desktop/internal/remote/machine.go does the same). A desktop connected through an SSH
// tunnel sees a loopback address but a different machine: the server's paths are not its own.
//   macOS: IOPlatformUUID (ioreg) · Linux: /etc/machine-id · else: none (clients treat as remote)
// Only sha256("ducter-machine:" + id), first 32 hex, ever leaves the process.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function rawMachineId(platform: NodeJS.Platform = process.platform): string | undefined {
  try {
    if (platform === "darwin") {
      const r = Bun.spawnSync(["/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice"], { stdout: "pipe", stderr: "ignore" });
      return /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(r.stdout.toString())?.[1];
    }
    if (platform === "linux") {
      for (const f of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        try {
          const s = readFileSync(f, "utf8").trim();
          if (s) return s;
        } catch {}
      }
    }
  } catch {}
  return undefined;
}

export function machineHash(raw: string | undefined): string | undefined {
  return raw ? createHash("sha256").update(`ducter-machine:${raw}`).digest("hex").slice(0, 32) : undefined;
}

let cached: string | null | undefined;
/** This machine's id hash (computed once), or undefined when the platform has none. */
export function machineId(): string | undefined {
  if (cached === undefined) cached = machineHash(rawMachineId()) ?? null;
  return cached ?? undefined;
}
