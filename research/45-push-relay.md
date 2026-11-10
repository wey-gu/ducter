# 45. A notification relay for a self-hosted app with a publisher-owned push channel

**Question.** The public iPhone app (TestFlight, signed by Nowledge's team) can't be notified by
anyone's own Ducter: today each home sends straight to Apple with an APNs key it holds
(`packages/core/src/apns.ts`, D131), and only the app publisher has that key. What do other
self-hosted products with a store app do, what must the relay learn, and where can Ducter run
one with what it already deploys? Feeds D159.

Date: 2026-11-10. Sources are web pages read on that day; no third-party code was run.

## 1. Why a relay is unavoidable

- APNs accepts a push only when the provider token (an ES256 JWT) is signed by a key of the
  team that signs the app, for that app's bundle id (topic). **DOCUMENTED** (Apple,
  "Establishing a token-based connection to APNs"; already relied on in research/32).
- So a store-distributed app can be notified only by servers holding the publisher's key. A
  self-hosted server either gets the publisher's key (impossible to hand out safely: one key
  signs pushes for every user) or sends through something the publisher runs. **INFERRED**
  from the above; every product below runs such a piece.
- Web Push (D58) is the one path without a publisher piece: Apple runs the push service for
  Home Screen web apps and the server signs with its own VAPID key. **DOCUMENTED** (Apple,
  "Sending web push notifications in web apps and browsers"). It stays as Ducter's no-app path.

## 2. How others do it

| Product | Relay run by | What the relay sees | Content to the phone | Limits |
|---|---|---|---|---|
| Home Assistant Companion | Nabu Casa (`mobile-apps.home-assistant.io`, a cloud function) | push token, the message text | in the push, plain (the relay sees it) | 500 per device per day, resets 00:00 UTC; errors don't count; 429 once over **DOCUMENTED** (companion.home-assistant.io notification docs; developers.home-assistant.io "Push notifications") |
| ntfy (iOS) | ntfy.sh as `upstream-base-url` | a "poll request": the message id and a hash of the topic URL | none; the app wakes and fetches the message from the self-hosted server | ntfy.sh's shared quota (429s reported) **DOCUMENTED** (docs.ntfy.sh known issues and config; ntfy issues #1191, #1265) |
| Matrix (Element iOS) | the app publisher's push gateway (Sygnal) | with `event_id_only`: room and event ids, counts | none; the NSE fetches and decrypts the event from the homeserver | gateway's own **DOCUMENTED** (matrix-org/sygnal docs/applications.md) |
| Mastodon apps (toot-relay, mastodon/webpush-apn-relay) | each app's publisher | the device token in the endpoint URL, an RFC 8291 ciphertext | the encrypted payload in the push (`p`), decrypted by a Notification Service Extension | none built in **DOCUMENTED** (github.com/DagAgren/toot-relay README; github.com/mastodon/webpush-apn-relay) |
| Signal | Signal (the server is the publisher's) | a content-free "you have messages" | none; the app fetches | n/a **INFERRED** from Signal's public architecture; not re-read for this report |

Two patterns, both keeping content out of the relay:

1. **Wake and fetch** (ntfy, Matrix, Signal): the push carries an id; the app, or its Notification
   Service Extension (NSE), fetches the content from the server.
2. **Encrypted in the push** (Mastodon relays): the server encrypts to a key the phone gave it;
   the NSE decrypts.

Home Assistant is the counterexample: simplest, but the publisher's relay reads every message.

## 3. Which pattern for Ducter

- **Wake and fetch** needs the NSE to reach the home within the extension's time budget (about
  30 seconds, **DOCUMENTED**, Apple "Modifying content in newly delivered notifications"). A
  Ducter home is often behind a tunnel, on a LAN address or asleep; a phone on cellular may not
  reach it. A failed fetch leaves a contentless alert. It also needs the bearer token in the
  extension and one more round trip per push.
- **Encrypted in the push** needs nothing from the home at delivery time. The phone's key is
  handed over once, over the paired, authenticated API, the same way the device token is today.
  APNs' 4 KB payload is enough: a notification is a title and two sentences (trimmed already by
  `fitMessage`). **Chosen.**
- The NSE runs only when the payload has `mutable-content: 1` and a visible alert; otherwise the
  alert shows as sent. **DOCUMENTED** (Apple, same page). So the alert Apple carries must be
  neutral and still make sense alone: "Ducter needs you", localized on the phone through
  `loc-key` (no locale leaks to the relay). If the NSE fails or has no key, that line shows and a
  tap opens the app.
- The NSE may set `categoryIdentifier` and `threadIdentifier` on the content it returns, so
  Go / Hold / Reply can be decided after decryption. **DOCUMENTED** (UNMutableNotificationContent
  properties are writable in the extension). The relay also forwards an allowlisted category, so
  the buttons appear even when an older extension doesn't set it.

## 4. What the relay must hold, and where it can run

- **No token database.** A handle can be the device token encrypted (AES-GCM) under a key only
  the relay has: the relay needs no lookup, a leaked store holds no tokens, and only the home that
  was given the handle can use it. Revocation and rate limits need a little state keyed by a
  random handle id: a revoked-id set and counters, all with TTLs. **INFERRED** design; the
  Mastodon relays carry the token in the URL in the clear, which is the weaker version of this.
- **Abuse:** a handle is useful only with the relay, only for one app topic, rate-limited per
  handle and per caller address (Home Assistant's 500 a day per device is the reference point;
  Ducter's pusher sends at most one per 15 minutes plus tests, so 30 an hour and 200 a day per
  handle are generous). Registration needs a real device token (a 32-byte secret Apple issues).
  App Attest would prove the genuine app registered; not needed for a first version.
- **Vercel (where ducter.ai already deploys, `apps/site/vercel.json`):** a file in the project's
  root `api/` directory becomes a Node.js function; Web-standard `fetch` handlers are supported,
  as is every Node API, so `node:http2` (APNs speaks only HTTP/2) works. **DOCUMENTED** (Vercel,
  "Using the Node.js Runtime with Vercel Functions", updated 2026-08-11). That `api/` functions
  build next to the Astro preset is **INFERRED** from the same page ("Vercel creates a separate
  function for each supported source file in the root api/ directory"); it must be checked on
  the first preview deploy (`GET /api/push/health`).
- **State on Vercel:** Vercel KV is now the Upstash Redis marketplace integration; its REST API
  takes a pipeline of commands over HTTPS, so no client library is needed. **DOCUMENTED**
  (Upstash REST API docs). Without it, limits hold per function instance only.
- **Cloudflare Workers** were the alternative. Workers' `fetch` does not expose HTTP/2 to
  the code, and the Workers-specific APNs client found (`@fivesheepco/cloudflare-apns2`) states a
  Node requirement; whether Workers can reach APNs at all was not verified. **INFERRED**, thin.
  Using it would also add a new account and deploy to the project. Not chosen.

## 5. The Apple side

- **APNs auth keys can't be created through the App Store Connect API.** Its provisioning
  resources are bundle ids, bundle id capabilities, certificates, devices and profiles; keys are
  made in the developer portal (Certificates, Identifiers & Profiles → Keys). **DOCUMENTED** by an
  Apple Developer Forums answer (thread 125026) and the API's resource list; not an official
  statement.
- **A Notification Service Extension needs its own App ID** (`<app id>.notify`) and profile.
  Xcode's automatic signing with `-allowProvisioningUpdates` and an App Store Connect API key
  registers it, as it does the app's (what `scripts/ci/testflight.sh` already relies on).
  **DOCUMENTED** for the app (research/32, the working TestFlight pipeline); for the extension
  **INFERRED** from the same mechanism, to be confirmed by the first tagged release.
- **Keychain sharing** between the app and the extension needs only the `keychain-access-groups`
  entitlement with a `<team id>.` prefix, which every team profile allows. **DOCUMENTED** (Apple,
  "Sharing access to keychain items among a collection of apps"). No App Group is needed.

## Implications for Ducter

- Run a small relay at `https://ducter.ai/api/push` as a Vercel Node function in `apps/site/api/`,
  with the APNs key, a handle encryption key and an Upstash store as Vercel environment settings.
- End to end encryption in the push: the phone makes a 32-byte key, gives it to its home at
  subscribe time, the home encrypts (AES-256-GCM), the NSE decrypts. The relay and Apple see a
  neutral localized alert, the device token, timing and a padded size.
- The app registers with the relay itself and gets an opaque handle; the home only ever holds the
  handle. Disconnecting a device revokes its handle.
- Keep a home's own APNs key as the power-user path (same encryption), and Web Push as the
  no-app path.
- What only the author can do: make the APNs key in the portal, set the relay's environment, and
  confirm the extension signs in the first release.

## Summary

Every self-hosted product with a store app runs a publisher relay; the good ones keep content out
of it, by waking the app to fetch (ntfy, Matrix, Signal) or by encrypting to a key the phone gave
the server (Mastodon relays). A Ducter home may be unreachable from the phone at delivery time, so
encrypting in the push fits better. Vercel, which already serves ducter.ai, runs Node functions
with `node:http2`, so the relay needs no new provider; an Upstash store holds only revocations and
counters. The APNs key itself has to be made by hand in the developer portal.
