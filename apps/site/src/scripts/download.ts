// The download page (D319): the visitor's own option first, and the newest release if one came out
// after this page was built. Everything works without this script: the page then reads Mac first.
import { copyButtons, navLine } from "./common";
import { detect, type OS } from "../lib/platform";

navLine();
copyButtons();

const card: Record<OS, string> = { mac: "mac", linux: "server", ios: "iphone", android: "android", other: "server" };

(() => {
  const pick = document.getElementById("dl-pick");
  if (!pick) return;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const { os, ipad } = detect(navigator.userAgent, nav.userAgentData?.platform ?? navigator.platform ?? "", navigator.maxTouchPoints ?? 0);
  pick.dataset.os = os;
  pick.querySelectorAll<HTMLElement>(".dl-pick-body").forEach((b) => (b.hidden = b.dataset.for !== os));
  if (ipad) {
    const f = pick.querySelector<HTMLElement>('.dl-pick-body[data-for="ios"] [data-ipad]');
    if (f) f.textContent = f.dataset.ipad!;
  }
  // The matching card leads its group and says it's for this device; nothing is hidden.
  const mine = document.getElementById(card[os]);
  if (mine && os !== "other") {
    mine.classList.add("is-you");
    mine.parentElement?.prepend(mine);
  }
})();

/* A release newer than this page: GitHub's API, from the visitor's browser (no key, 60 calls an
   hour per address). Any failure leaves the build's links, which are a real release. */
(async () => {
  const rel = document.getElementById("dl-rel");
  const built = document.querySelector<HTMLElement>('[data-rel="version"]')?.textContent?.trim();
  if (!rel || !built) return;
  let r: any;
  try {
    const res = await fetch("https://api.github.com/repos/wey-gu/ducter/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;
    r = await res.json();
  } catch {
    return;
  }
  const v = String(r?.tag_name ?? "").replace(/^v/, "");
  if (!v || v === built || !Array.isArray(r.assets)) return;
  const by = (test: (n: string) => boolean) => r.assets.find((x: any) => typeof x?.name === "string" && test(x.name));
  const found: Record<string, any> = {
    dmg: by((n) => n.endsWith(".dmg")),
    linuxX64: by((n) => n.endsWith("-linux-x64.tar.gz")),
    linuxArm64: by((n) => n.endsWith("-linux-arm64.tar.gz")),
    apk: by((n) => n.endsWith("-android.apk")),
    sums: by((n) => n === "SHA256SUMS.txt"),
  };
  // Only move when the new release has what this page offers, so a half-uploaded one never breaks a link.
  if (!found.dmg || !found.sums) return;
  const size = (b: number) => { const mb = b / 1048576; return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`; };
  for (const [k, a] of Object.entries(found)) {
    if (!a) continue;
    document.querySelectorAll<HTMLAnchorElement>(`[data-asset="${k}"]`).forEach((el) => (el.href = a.browser_download_url));
    document.querySelectorAll<HTMLElement>(`[data-meta="${k}"]`).forEach((el) => (el.textContent = size(a.size)));
  }
  document.querySelectorAll<HTMLElement>('[data-rel="version"]').forEach((el) => (el.textContent = v));
  const date = document.querySelector<HTMLTimeElement>('[data-rel="date"]');
  if (date && r.published_at) {
    date.dateTime = r.published_at;
    date.textContent = new Date(r.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }
  document.querySelectorAll<HTMLAnchorElement>('[data-rel="notes"]').forEach((el) => r.html_url && (el.href = r.html_url));
  // The files line names each file by who it's for, so only its link and size move (above).
})();
