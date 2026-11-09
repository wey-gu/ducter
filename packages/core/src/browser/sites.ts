// 已登录的网站 / Signed-in sites in Ducter's browser (D144). The list is the sites the user signed
// in to through a live view (kept beside the profile in <profile>.sites.json), with how many
// cookies the browser still holds for each. Cookie values never leave the browser: only counts.
// 退出 / Sign out clears one site's cookies and stored data; 全部清掉 / Clear all clears every
// site's (the profile itself stays).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { profileRoot } from "@ducter/protocol/src/browser-profile.ts";
import type { SiteView } from "@ducter/protocol";
import type { BrowserHost } from "./host.ts";

// Second-level suffixes where the site is three labels (a short list, not the public suffix list).
const TWO_LEVEL = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.cn", "net.cn", "org.cn", "com.au", "co.jp", "ne.jp", "com.hk", "com.tw", "com.br", "co.kr", "co.in", "com.sg", "co.nz"]);

/** The site a host belongs to ("accounts.google.com" → "google.com", "bbc.co.uk" stays). */
export function siteOf(host: string): string {
  const h = host.replace(/^\.+/, "").replace(/^www\./, "").toLowerCase();
  if (/^[\d.]+$/.test(h) || !h.includes(".")) return h;
  const parts = h.split(".");
  const two = parts.slice(-2).join(".");
  return TWO_LEVEL.has(two) && parts.length >= 3 ? parts.slice(-3).join(".") : two;
}

const fileFor = (dataDir: string, profile: string) => join(profileRoot(dataDir), `${profile}.sites.json`);

export function readSites(dataDir: string, profile: string): { site: string; signedInAt: string }[] {
  const p = fileFor(dataDir, profile);
  if (!existsSync(p)) return [];
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(j) ? j.filter((x) => typeof x?.site === "string" && typeof x?.signedInAt === "string") : [];
  } catch {
    return [];
  }
}

function writeSites(dataDir: string, profile: string, rows: { site: string; signedInAt: string }[]) {
  const p = fileFor(dataDir, profile);
  if (!rows.length) return rmSync(p, { force: true });
  mkdirSync(profileRoot(dataDir), { recursive: true, mode: 0o700 });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(rows, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, p);
}

/** The user signed in to a site in a live view (好了 / Done). */
export function rememberSite(dataDir: string, profile: string, host: string, at = new Date()): void {
  const site = siteOf(host);
  const rows = readSites(dataDir, profile).filter((r) => r.site !== site);
  rows.unshift({ site, signedInAt: at.toISOString() });
  writeSites(dataDir, profile, rows);
}

type Cookie = { name: string; domain: string; path: string };

async function cookies(host: BrowserHost, profile: string): Promise<Cookie[]> {
  const b = await host.ensure(profile);
  const r = await b.cdp.send("Storage.getCookies", {});
  return Array.isArray(r?.cookies) ? r.cookies : [];
}

export interface Sites {
  list(profile: string): Promise<SiteView[]>;
  signOut(profile: string, site: string): Promise<number>;
  clearAll(profile: string): Promise<void>;
}

export function createSites(host: BrowserHost): Sites {
  const dataDir = host.dataDir;
  return {
    async list(profile) {
      const rows = readSites(dataDir, profile);
      if (!rows.length) return [];
      const all = await cookies(host, profile).catch(() => [] as Cookie[]);
      return rows.map((r) => ({ ...r, cookies: all.filter((c) => siteOf(c.domain) === r.site).length }));
    },
    async signOut(profile, site) {
      const s = siteOf(site);
      const b = await host.ensure(profile);
      const all = await cookies(host, profile);
      const mine = all.filter((c) => siteOf(c.domain) === s);
      // Network.deleteCookies needs a page: a throwaway blank one.
      const { targetId } = await b.cdp.send("Target.createTarget", { url: "about:blank" });
      try {
        const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId, flatten: true });
        for (const c of mine) await b.cdp.send("Network.deleteCookies", { name: c.name, domain: c.domain, path: c.path }, sessionId).catch(() => {});
      } finally {
        await b.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
      }
      for (const origin of [`https://${s}`, `https://www.${s}`])
        await b.cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" }).catch(() => {});
      writeSites(dataDir, profile, readSites(dataDir, profile).filter((r) => r.site !== s));
      return mine.length;
    },
    async clearAll(profile) {
      const b = await host.ensure(profile);
      await b.cdp.send("Storage.clearCookies", {});
      for (const r of readSites(dataDir, profile))
        for (const origin of [`https://${r.site}`, `https://www.${r.site}`])
          await b.cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" }).catch(() => {});
      writeSites(dataDir, profile, []);
    },
  };
}
