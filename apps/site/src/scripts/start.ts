// Get started (D326): which path this device starts on. The page works without this script (the
// Mac path is checked, and CSS shows the checked path); this only picks a better default, follows
// #path-… links, and says so when the page is open on a phone.
import { copyButtons, navLine } from "./common";
import { detect } from "../lib/platform";

navLine();
copyButtons();

const pick = (v: string) => {
  const r = document.getElementById(`live-${v}`) as HTMLInputElement | null;
  if (r) r.checked = true;
};

const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
const { os } = detect(navigator.userAgent, nav.userAgentData?.platform ?? navigator.platform ?? "", navigator.maxTouchPoints ?? 0);
const fromHash = /^#path-(mac|server|unsure)$/.exec(location.hash)?.[1];
if (fromHash) pick(fromHash);
else if (os === "linux") pick("server");
else if (os !== "mac") pick("unsure");
if (os === "ios" || os === "android") document.getElementById("on-phone")?.removeAttribute("hidden");

// "this Mac" / "a server" in the Not sure path, and any #path-… link: choose that path.
document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#path-"]');
  if (!a) return;
  const v = a.dataset.pick ?? a.getAttribute("href")!.slice(6);
  pick(v);
  e.preventDefault();
  history.replaceState(null, "", `#path-${v}`);
  document.getElementById("where-q")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  document.getElementById(`live-${v}`)?.focus();
});
document.querySelectorAll<HTMLInputElement>('input[name="live"]').forEach((r) =>
  r.addEventListener("change", () => r.checked && history.replaceState(null, "", `#path-${r.value}`)),
);
