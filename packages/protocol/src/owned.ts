// D483: a pull request's identity, from what a task declares it owns or what a report's evidence
// names: "owner/repo#123", its URL, or "owner/repo/pull/123". Structure only (never words around it).
export function prIdentity(ref: string): string | undefined {
  const s = String(ref ?? "").trim();
  const url = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i.exec(s);
  if (url) return `${url[1]}/${url[2]}#${url[3]}`.toLowerCase();
  const short = /^([\w.-]+)\/([\w.-]+)(?:#|\/pull\/)(\d+)$/.exec(s);
  return short ? `${short[1]}/${short[2]}#${short[3]}`.toLowerCase() : undefined;
}
