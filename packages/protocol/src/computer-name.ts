// D310: how a computer's name reads to a person, and when two names are the same computer.
// Shared with the Go twin (apps/desktop/internal/computer) through fixtures/computer-name.json.

/** A bare DNS host name with at least one dot and a last label that is not all digits (so an IPv4
 *  address, a version "v1.2" or a sentence stays as it is). */
const DNS = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z0-9-]*[A-Za-z][A-Za-z0-9-]*\.?$/;

/**
 * A computer's name as a person reads it. A host name loses its DNS domain, whatever the network
 * gave it: "Mac.lan" → "Mac", "weys-mbp.local" → "weys-mbp", "hel.example.com" → "hel". Anything
 * that is not a bare host name (a name the person chose, "Wey's MacBook Pro"; an IP address) is
 * kept as it is, trimmed.
 */
export function computerName(name: string): string {
  const s = (name ?? "").trim();
  if (!DNS.test(s)) return s;
  return s.slice(0, s.indexOf("."));
}

/** What two names of one computer share: its name as read, case and punctuation folded away, so
 *  the macOS Computer Name "Wey’s MacBook Pro" and its host name "Weys-MacBook-Pro.local" agree. */
export function computerKey(name: string): string {
  return computerName(name).normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Whether two names are the same computer (never for an empty name). */
export function sameComputer(a: string | undefined, b: string | undefined): boolean {
  const k = computerKey(a ?? "");
  return k !== "" && k === computerKey(b ?? "");
}

/** A device's paired name without a DNS domain: a computer paired before D310 by its host name
 *  ("Mac.lan" → "Mac", "CLI on Mac.lan" → "CLI on Mac"). Any other name is kept. */
export function undomainedName(name: string): string {
  const cli = /^CLI on (.+)$/.exec(name);
  return cli ? `CLI on ${computerName(cli[1]!)}` : computerName(name);
}
