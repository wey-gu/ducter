// D621: a Keep's doorbell. A CI job, a GitHub webhook, a cron on another server or a phone
// shortcut says "something changed, look now" by POSTing to a secret URL off this home. The event
// is only a doorbell (research/235 §1, the reference app's rule): its body is never read, never
// stored, never reaches the model or the round. At most the caller's own "about" header (a short
// label) is kept on the ring's round for the person, marked untrusted.
//
// The URL is a bearer secret: anyone holding it can ring (a wake, never a read or an act). It is
// stored as a SHA-256 hash in <dataDir>/doorbells.json (0600), never in the Log (a task can read
// the Log), and a page reveals the plaintext at most once. A wrong token and a path that doesn't
// exist answer the same 404, with the same work done, so the URL can't be probed.
//
// This is not a device: it needs no pairing, and it cannot read anything. Remote access is whatever
// the home already has (D228, D265): the URL is built from the address the person already uses; no
// tunnel is opened for it.
import { bellAbout, type Keeps } from "./keeps.ts";

export const DOORBELL_PREFIX = "/doorbell/";
/** A token is `db1_` + 43 base64url characters (32 random bytes); anything far longer isn't one. */
const TOKEN_MAX = 200;

const noStore = { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } as const;
/** The same answer a path that isn't there gets: status, body and headers (the content type is
 *  Response's own, so a wrong token is indistinguishable from a route that doesn't exist). */
const notFound = () => new Response("not found", { status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });

/** The path a home serves a doorbell at (no leading slash in the token: the whole path). */
export const doorbellPath = (token: string) => `${DOORBELL_PREFIX}${token}`;

/**
 * The doorbell route, before the device gate (a CI job has no device token): undefined when the
 * request isn't for one. It never touches the body.
 */
export async function handleDoorbell(req: Request, keeps: Keeps | undefined): Promise<Response | undefined> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(DOORBELL_PREFIX)) return undefined;
  if (req.method !== "POST") return notFound();
  const token = url.pathname.slice(DOORBELL_PREFIX.length);
  if (!token || token.length > TOKEN_MAX || token.includes("/")) return notFound();
  const r = await (keeps?.ring(token, bellAbout(req.headers.get("x-ducter-about"))) ?? "notfound");
  if (r === "limited") return new Response("too many rings", { status: 429, headers: { ...noStore, "retry-after": "60" } });
  if (r === "held") return new Response("moving", { status: 503, headers: { ...noStore, "retry-after": "60" } });
  if (r === "notfound") return notFound();
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
