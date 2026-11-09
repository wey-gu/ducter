// D154: one look at Ducter's own browser, with no task: start it on the persona's profile, load a
// harmless page in a tab of its own, read the page's title, close the tab, and quit the browser
// again when nothing else holds it. What `ducter browser check`, the partner's browser_check and
// the 上网 block's 试一下 / Try it all stand on, so "is it working, and is it really Ducter's
// browser" has one answer: which browser, on which machine, which profile, how long.
import type { BrowserCheck } from "@ducter/protocol";
import type { BrowserHost } from "./host.ts";
import { aboutLine, pageUrl, settle } from "./tools.ts";

/** The page a check (and Try it) opens: harmless, tiny, and the same for everyone. */
export const CHECK_URL = "https://example.com/";

export type CheckSetup =
  | { state: "ready" }
  | { state: "missing" }
  | { state: "installing" }
  | { state: "deps"; command: string }
  | { state: "failed"; message: string };

export async function checkBrowser(host: BrowserHost, setup: CheckSetup, profile: string, url = CHECK_URL, now: () => number = Date.now): Promise<BrowserCheck> {
  const t0 = now();
  let target: string;
  try {
    target = pageUrl(url);
  } catch (e) {
    return { ok: false, reason: "failed", message: (e as Error).message, url, ms: 0 };
  }
  if (setup.state !== "ready") {
    const message = setup.state === "deps" ? setup.command : setup.state === "failed" ? setup.message : undefined;
    return { ok: false, reason: setup.state, ...(message ? { message } : {}), url: target, ms: 0 };
  }
  const wasRunning = !!host.running(profile);
  let targetId: string | undefined;
  let b: Awaited<ReturnType<BrowserHost["ensure"]>> | undefined;
  try {
    b = await host.ensure(profile);
    targetId = (await b.cdp.send("Target.createTarget", { url: "about:blank" }))?.targetId;
    if (!targetId) throw new Error("couldn't open a tab");
    const sessionId = await host.session(b, targetId);
    const send = (m: string, p: object = {}) => b!.cdp.send(m, p, sessionId);
    const nav = await send("Page.navigate", { url: target });
    if (nav?.errorText) throw new Error(`couldn't open ${target}: ${nav.errorText}`);
    await settle(send);
    const r = await send("Runtime.evaluate", { expression: "({ title: document.title, url: location.href })", returnByValue: true });
    const v = r?.result?.value ?? {};
    return { ok: true, browser: host.about(profile), url: String(v.url || target), ...(v.title ? { title: String(v.title) } : {}), ms: now() - t0 };
  } catch (e) {
    return { ok: false, reason: "failed", message: (e as Error).message, ...(b ? { browser: host.about(profile) } : {}), url: target, ms: now() - t0 };
  } finally {
    if (b && targetId) await b.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
    // It started for this look only: quit it again (sign-ins saved), unless a task or a view holds it.
    if (b && !wasRunning && !host.inUse(profile)) await host.close(profile).catch(() => false);
  }
}

/** The check, in one line for a model (the partner says it to the user in their words). */
export function checkLine(c: BrowserCheck): string {
  const secs = (c.ms / 1000).toFixed(1);
  if (c.ok)
    return `Works: opened ${c.url}${c.title ? ` ("${c.title}")` : ""} in ${secs} s, then closed the tab. It is ${aboutLine(c.browser!)}. No task was needed.`;
  switch (c.reason) {
    case "missing":
      return "Ducter's own browser isn't installed on this machine. The user adds it in Devices › 上网 / Browse the web (one tap), or `ducter ability add browser`.";
    case "installing":
      return "Ducter's own browser is being installed on this machine right now; check again in a minute.";
    case "deps":
      return `Ducter's own browser is installed but needs system libraries first; the user runs this once: ${c.message}`;
    default:
      return `Doesn't work yet: ${c.browser ? aboutLine(c.browser) : "Ducter's own browser"} failed: ${c.message ?? "no reason given"}.`;
  }
}
