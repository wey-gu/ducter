// D538: 关于这台 / About this computer on a device card: what Ducter measured there, in plain words,
// and the person's own rules about it. One source of facts for both clients (web devcard.tsx, Mac
// views/aboutcomputer.go words the same keys from the same numbers).
import type { DeviceResources, DeviceView } from "./index.ts";
import type { RuleView } from "./loadout.ts";
import { HEAVY_FREE, heavySlots } from "./room.ts";

const GiB = 2 ** 30;

/** Bytes as a person reads them: "7.6 GB", "64 GB" (whole above 10 GB), "512 MB" under one. */
export function sizeWords(n: number): string {
  if (n < GiB) return `${Math.max(1, Math.round(n / 2 ** 20))} MB`;
  return n < 10 * GiB ? `${(Math.round((n / GiB) * 10) / 10).toFixed(1)} GB` : `${Math.round(n / GiB)} GB`;
}

/** How busy, from the 1-minute load per core: calm under half, some under one, else busy. */
export function busyWord(r: Pick<DeviceResources, "load" | "cores">): "calm" | "some" | "busy" | undefined {
  if (r.load === undefined || !r.cores) return undefined;
  const per = r.load / r.cores;
  return per < 0.5 ? "calm" : per < 1 ? "some" : "busy";
}

/** One fact on the card: an i18n key (about.*) and its arguments. */
export interface AboutFact {
  key: string;
  args: (string | number)[];
}

/** The measured facts, in order (memory first: it is what placement reads). */
export function aboutFacts(dv: Pick<DeviceView, "resources" | "alwaysOn" | "kind">): AboutFact[] {
  const r = dv.resources;
  const out: AboutFact[] = [];
  if (r) {
    out.push({ key: "about.mem", args: [sizeWords(r.memTotal), sizeWords(r.memFree)] });
    out.push(r.memFree >= HEAVY_FREE ? { key: "about.heavy", args: [heavySlots(r.memTotal)] } : { key: "about.heavy.none", args: [] });
    const busy = busyWord(r);
    out.push({ key: busy ? `about.cores.${busy}` : "about.cores", args: [r.cores] });
    if (r.diskFree !== undefined) out.push({ key: "about.disk", args: [sizeWords(r.diskFree)] });
    if (r.gpu) out.push({ key: "about.gpu", args: [r.gpu] });
    if (r.oom?.length) out.push({ key: "about.oom", args: [r.oom.length] });
  }
  if (dv.alwaysOn !== undefined) out.push({ key: dv.alwaysOn ? "about.on" : "about.sleeps", args: [] });
  return out;
}

/** The fold's one-line summary: "64 GB 内存，空着 41 GB" (absent before the computer measured itself). */
export function aboutSummary(dv: Pick<DeviceView, "resources">): AboutFact | undefined {
  return dv.resources ? { key: "about.sum", args: [sizeWords(dv.resources.memTotal), sizeWords(dv.resources.memFree)] } : undefined;
}

/** A computer's placement rules, oldest first (the names match as the rule store keeps them: the computer's name). */
export function rulesAbout(rules: RuleView[], dv: Pick<DeviceView, "id" | "name" | "home">): RuleView[] {
  const n = dv.name.toLowerCase();
  return rules.filter((r) => r.where && r.device && (r.device.toLowerCase() === n || r.device === dv.id || (dv.home && r.device === "local")));
}

/** Which work a placement rule is for: heavy, web or all. */
export const ruleWork = (r: RuleView): "heavy" | "web" | "all" => (r.where?.heavy ? "heavy" : r.where?.web ? "web" : "all");
