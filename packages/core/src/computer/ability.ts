// D235: 用电脑 / Use the computer on one computer's card, the same on the home and on a worker Mac.
import type { ComputerPerms, DeviceAbility } from "@ducter/protocol";
import { readAbilitySettings } from "@ducter/protocol/src/abilities.ts";

/**
 * Macs only (cua-driver drives macOS apps here; Linux and Windows stay 以后会有). Off until the
 * person adds it; cua-driver must be on that Mac; added but without macOS's two switches it says
 * so (computer_permissions, with perms) until they are on.
 */
export function computerAbilityOf(p: { platform: string; dataDir: string; cua: { version: string } | { missing: string }; perms: ComputerPerms | undefined }): DeviceAbility {
  if (p.platform !== "darwin") return { id: "computer", state: "later" };
  if ("missing" in p.cua && /not installed|does not run/.test(p.cua.missing)) return { id: "computer", state: "unavailable", reason: "cua_missing", detail: p.cua.missing };
  const perms = p.perms ? { perms: p.perms } : {};
  if (readAbilitySettings(p.dataDir).computer !== true) return { id: "computer", state: "off", ...perms };
  if (p.perms && (!p.perms.accessibility || !p.perms.screen)) return { id: "computer", state: "unavailable", reason: "computer_permissions", ...perms };
  return { id: "computer", state: "on", ...perms };
}

/** On, with both switches (or switches it couldn't read, which the first action then finds). */
export const computerReady = (a: DeviceAbility | undefined) => a?.id === "computer" && a.state === "on";
