// The demos' oo: none. A demo core must never read this machine's own oo, whose accounts are the
// user's; a demo that shows accounts brings its own fake (demo-accounts.ts, demo-oomol.ts).
import type { OoSource } from "../../packages/core/src/connections.ts";

export const noOo: OoSource = { detect: () => ({ installed: false, account: false }), read: () => undefined };
