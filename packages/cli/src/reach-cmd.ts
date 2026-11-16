// D293: `ducter reach`: the ways to reach this home, its address book. `ducter domain`, `ducter
// tailscale` and the Cloudflare tunnel add their own; this lists them (each checked from here),
// adds one set up some other way (a reverse proxy of your own), takes one out, or makes one the
// address pairing links lead with. A machine command: it acts on this computer's data folder,
// and the running home picks the change up within seconds and tells every device.
import { homeIdentity } from "@ducter/core/src/home-key.ts";
import { addWay, readWays, removeWay, setPrimary } from "@ducter/core/src/reach-book.ts";
import { kindOfUrl, normalizeBase, WAY_KINDS, type ReachWay, type WayKind } from "@ducter/protocol/src/reach.ts";
import { proveHome } from "@ducter/protocol/src/reach-verify.ts";
import type { Style } from "./doctor.ts";
import type { T } from "./i18n.ts";

export async function cmdReach(o: { t: T; style: Style; dataDir: string; json: boolean; rest: string[]; kind?: string; probe?: (url: string) => Promise<boolean> }): Promise<number> {
  const { t, style } = o;
  const [sub = "list", arg] = o.rest;
  const out = (j: object, line: string) => (o.json ? console.log(JSON.stringify(j)) : console.log(line));
  const url = (s?: string) => {
    if (!s) return undefined;
    const raw = /^[a-z]+:\/\//i.test(s) ? s : `https://${s}`;
    try {
      const u = new URL(raw);
      return u.protocol === "https:" || u.protocol === "http:" ? normalizeBase(`${u.protocol}//${u.host}${u.pathname}`) : undefined;
    } catch {
      return undefined;
    }
  };
  if (sub === "add") {
    const u = url(arg);
    if (!u) return out({ ok: false, error: "address" }, t("reach.usage")), 2;
    const kind = (o.kind ?? kindOfUrl(u)) as WayKind;
    if (!(WAY_KINDS as readonly string[]).includes(kind)) return out({ ok: false, error: "kind" }, t("reach.usage")), 2;
    const r = addWay(o.dataDir, kind, u);
    out({ ok: true, url: u, kind, primary: r.primary }, `  ${style.ok("✓")} ${t("reach.added", { url: u, kind: t(`reach.kind.${kind}`) })}`);
    return 0;
  }
  if (sub === "remove") {
    const u = url(arg);
    if (!u) return out({ ok: false, error: "address" }, t("reach.usage")), 2;
    if (!removeWay(o.dataDir, u)) return out({ ok: false, error: "not_found" }, t("reach.notFound", { url: u })), 1;
    out({ ok: true, url: u }, `  ${style.ok("✓")} ${t("reach.removed", { url: u })}`);
    return 0;
  }
  if (sub === "primary") {
    const u = url(arg);
    if (!u || !setPrimary(o.dataDir, u)) return out({ ok: false, error: "not_found" }, t("reach.notFound", { url: u ?? arg ?? "" })), 1;
    out({ ok: true, url: u }, `  ${style.ok("✓")} ${t("reach.primary", { url: u })}`);
    return 0;
  }
  if (sub !== "list" && sub !== "check") return out({ ok: false, error: "usage" }, t("reach.usage")), 2;
  const ways = readWays(o.dataDir);
  const me = homeIdentity(o.dataDir);
  const probe = o.probe ?? proveHome(me.fp);
  const checked: (ReachWay & { answers: boolean })[] = await Promise.all(ways.map(async (w) => ({ ...w, answers: await probe(w.url).catch(() => false) })));
  if (o.json) return console.log(JSON.stringify({ ok: true, fp: me.fp, ways: checked })), 0;
  if (!checked.length) return console.log(`\n  ${t("reach.none")}\n`), 0;
  const lines = ["", `  ${style.bold(t("reach.title"))}`, ""];
  for (const w of checked)
    lines.push(`  ${w.answers ? style.ok("●") : style.dim("○")} ${style.bold(t(`reach.kind.${w.kind}`))}  ${w.url}${w.primary ? `  ${style.dim(t("reach.isPrimary"))}` : ""}`, `      ${style.dim(w.answers ? t("reach.up") : t(w.kind === "tailnet" ? "reach.downTailnet" : "reach.down"))}${w.kind === "tunnel" ? `  ${style.dim(t("reach.tunnelReads"))}` : ""}`);
  lines.push("", `  ${style.dim(t("reach.fp", { fp: me.fp }))}`, "");
  console.log(lines.join("\n"));
  return 0;
}
