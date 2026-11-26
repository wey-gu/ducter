import type { Bodies, OwnedSeen, PrLetGo } from "./index.ts";
import type { LogStore } from "./internal.ts";

// D483: a pull request's identity, from what a task declares it owns or what a report's evidence
// names: "owner/repo#123", its URL, or "owner/repo/pull/123". Structure only (never words around it).
export function prIdentity(ref: string): string | undefined {
  const s = String(ref ?? "").trim();
  const url = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i.exec(s);
  if (url) return `${url[1]}/${url[2]}#${url[3]}`.toLowerCase();
  const short = /^([\w.-]+)\/([\w.-]+)(?:#|\/pull\/)(\d+)$/.exec(s);
  return short ? `${short[1]}/${short[2]}#${short[3]}`.toLowerCase() : undefined;
}

type LogLike = Pick<LogStore, "read" | "append">;

/**
 * D600: a task lets one of its PRs go: it is not where the task's work goes on (a duplicate of work
 * that landed elsewhere, no longer needed, or the person ended the task). Written as the PR's next
 * `owned_news` (no news, the same cursor, `letGo` set), so the card, its Keep and Ducter's looks all
 * read it from one place. Only a PR the task owns and that is still open is let go: "let go" when it
 * was let go before, "not open" when it was merged or closed, "not owned" when Ducter never watched it.
 */
export function letGoPr(log: LogLike, taskId: string, ref: string, why: PrLetGo["why"], at: string, persona?: string): "let go" | "not open" | "not owned" {
  const pr = prIdentity(ref);
  if (!pr) return "not owned";
  let seen: OwnedSeen | undefined;
  for (const e of log.read({ stream: `task:${taskId}`, kinds: ["owned_news"], limit: 5000 })) {
    const b = e.body as Bodies["owned_news"];
    if (b.pr === pr) seen = b.seen;
  }
  if (!seen || seen.state === "not_ours") return "not owned";
  if (seen.state && seen.state !== "open") return "not open";
  if (seen.letGo) return "let go";
  log.append({ ...(persona ? { persona } : {}), stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr, news: [], seen: { ...seen, letGo: { why, at } } } });
  return "let go";
}
