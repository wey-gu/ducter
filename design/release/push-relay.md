# The notification relay: turning it on (D159)

The public iPhone app gets its notifications through a small relay Nowledge runs next to the
website: `https://ducter.ai/api/push`, the Vercel function `apps/site/api/push/[op].ts`. A home
encrypts each notification with the phone's own key and sends it there. The relay adds Apple's
signature and forwards it. It never sees the words. Why and how: D159, research/45,
`design/system.md` (Clients).

Everything is built and tested with fakes. Nothing is deployed, and no key exists yet. The steps
below are the author's: they need the Apple account and the Vercel project. Never put a key in
git or paste it into a chat.

## 1. Make the APNs key (Apple developer portal; about 2 minutes)

The App Store Connect API can't create APNs keys (research/45 §5), so this is done by hand.

1. Open developer.apple.com → Account → **Certificates, IDs & Profiles** → **Keys** → **+**.
2. Key name: `Ducter notification relay`. Tick **Apple Push Notifications service (APNs)**, then
   **Configure**: environment **Sandbox & Production**, key restriction **Team Scoped (All
   Topics)**. Save, **Continue**, **Register**.
3. **Download** `AuthKey_<KEYID>.p8` (Apple lets you download it only once) and note the
   **Key ID**. Keep the file in your password manager, not in the repo.

The App Store Connect API key you already use for CI (Users and Access → Integrations) is a
different kind of key and won't work here.

## 2. Give the relay its settings (Vercel; about 5 minutes)

In the Vercel project that serves ducter.ai:

1. **Storage** → **Create Database** (or Marketplace) → **Upstash for Redis**, free plan, region
   near the function. **Connect** it to the project for Production. Vercel then adds
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` itself. The relay reads only those two, or
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
2. Add four environment variables for **Production**, from a terminal in a folder linked to the
   project (`vercel link` once). Each command reads the value from stdin, so it never lands in
   your shell history:
   ```sh
   base64 -i ~/path/to/AuthKey_<KEYID>.p8 | tr -d '\n' | vercel env add APNS_KEY_P8 production
   printf '%s' '<KEYID>'                               | vercel env add APNS_KEY_ID production
   printf '%s' 'JMU55RJW2K'                            | vercel env add APNS_TEAM_ID production
   openssl rand -base64 32 | tr -d '\n'                | vercel env add RELAY_HANDLE_KEY production
   ```
   The dashboard (Settings → Environment Variables, marked **Sensitive**) works too.
   `RELAY_TOPICS` is optional. It defaults to `co.nowledge.ducter.ios`, and other bundle ids are
   refused.
3. **Never change `RELAY_HANDLE_KEY` once phones have registered.** It is the key the relay
   encrypts handles with, so a new key makes every handle unreadable and every phone stops
   getting notifications until it turns them off and on. Rotating it safely needs a key id and
   is in `design/todo.md`. The APNs key can be replaced at any time; set both `APNS_KEY_*`
   values together.

## 3. Deploy and check (about 2 minutes)

Merge to `main` (the site deploys as usual), then:

```sh
curl -s https://ducter.ai/api/push/health
# {"ok":true,"apns":true,"store":"kv"}
```

- `404`: Vercel didn't build `apps/site/api/` next to the Astro site. That was inferred from
  Vercel's docs, not seen (research/45 §4). Check the deployment's **Functions** tab. The fallback
  is `@astrojs/vercel` with this file moved to an Astro endpoint, which is a small change.
- `"apns":false`: one of `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8` is missing, or the base64
  isn't of the `.p8` file.
- `"store":"memory"`: the Upstash variables aren't set for Production. Notifications still work,
  but limits and revocations only hold per function instance.

Nothing is logged except Apple's status and reason on a refusal.

## 4. The iPhone app with its extension (the next tag)

The app now carries a Notification Service Extension, `DucterNotify`, with bundle id
`co.nowledge.ducter.ios.notify`. CI signs it the same way it signs the app: automatic signing
with the Admin App Store Connect key (`scripts/ci/testflight.sh`, `-allowProvisioningUpdates`)
registers the App ID and makes its App Store profile. Keychain sharing needs no capability.
Nothing in CI had to change. The unsigned Release archive (`DUCTER_TESTFLIGHT_DRY_RUN=1`)
builds with the extension embedded.

1. Tag a release as usual (`design/release/README.md`). Watch the `ios` job.
2. **Only if** it fails with "No profiles for 'co.nowledge.ducter.ios.notify'": open Identifiers
   → **+** → App IDs → App, Description `Ducter notifications`, Bundle ID (Explicit)
   `co.nowledge.ducter.ios.notify`, no capabilities, **Register**. Then re-run the job.
3. Check that **Push Notifications** is on for `co.nowledge.ducter.ios` (Identifiers → the App
   ID), as `design/release/ios.md` step 1 already asks. The archive's entitlement says
   `aps-environment = development`; distribution signing turns it into `production` from the App
   Store profile. That is how Xcode exports work, but it has not been seen on this app yet. If a
   TestFlight build never gets a token, check this first.

## 5. Try it on the phone

1. Install the TestFlight build. Connect it to your Ducter. In **Settings › Notifications**, tap
   **Yes, notify me**, then **Send a test**.
2. Expected: "Notifications work…" in your partner's name. Briefly, or with the phone locked
   and the extension slow, **Ducter needs you** may show instead. That's the line Apple carries.
3. Make a decision wait (any task that asks), leave the app, and wait 30 seconds. The
   notification shows the question, with **Go**, **Hold** and **Reply…** on a long press.
4. In Settings, **Your devices**, disconnect the phone. Then **Send a test** from another
   device: nothing reaches the phone (its handle was revoked).

The phone shows **The notification relay can't be reached right now…** if the home or the phone
couldn't reach the relay. It shows **Update this app to get notifications** for an app from before
the relay.

## Opting out (self-deployers)

- **No relay at all:** set `DUCTER_PUSH_RELAY=off` for the home. To notify an iPhone app, build it
  under your own team (`Local.xcconfig`) and give the home your own APNs key (`apns.json`,
  `design/release/ios.md` step 4). A home with its own key sends straight to Apple, encrypted the
  same way.
- **Your own relay:** deploy `apps/site/api/push/[op].ts` with your key and point both sides
  at it: `DUCTER_PUSH_RELAY=https://…/api/push` on the home, `DUCTER_PUSH_RELAY` in the app's
  `Local.xcconfig`.
- **No app:** the phone web client's Web Push (Safari's Add to Home Screen) never touches the relay.

## What the relay sees and keeps

| | Sees | Keeps |
|---|---|---|
| Device token | yes, inside the handle (encrypted under `RELAY_HANDLE_KEY`) | no |
| Words of a notification | no (encrypted for the phone; Apple sees "Ducter needs you") | no |
| When a push goes, its padded size, whether it's a decision | yes | no (only counters) |
| Caller's IP address | yes | as an HMAC in a rate counter, 1 hour |
| Revoked handles | n/a | a random handle id, 400 days |

Limits: 30 sends an hour and 200 a day per handle, 600 calls an hour and 30 registrations an hour
per address (`LIMITS` in the function).

## Before the App Store (not TestFlight)

The app now sends its device token to ducter.ai. App Store Connect's **App Privacy** answers need
to say so: Identifiers → Device ID, used for App Functionality, not linked to identity, not used
for tracking. TestFlight doesn't ask.

## The address relay (D228)

The same Vercel project serves `apps/site/api/addr/[op].ts`: where a paired device finds its
home again after **From anywhere**'s free tunnel got a new address. It shares the store
(`KV_REST_API_URL` + `KV_REST_API_TOKEN`) and needs one more variable, `ADDR_HASH_KEY` (base64 of
32 random bytes: `openssl rand -base64 32`), under which callers' addresses are hashed for rate
limits. Deploy, then check `GET https://ducter.ai/api/addr/health` → `{"ok":true,"store":"kv"}`.
Until it is deployed, homes' notes fail quietly and devices pair again after a home restarts.

| | Sees | Keeps |
|---|---|---|
| A home's address | no (AES-256-GCM under a key only the home and its devices hold) | no |
| The note's id | yes (16 random bytes, nothing about the home) | 30 days after the last write |
| The home's write secret | yes | its SHA-256, 30 days |
| When an address changes | yes | no |
| Caller's IP address | yes | as a keyed hash in a rate counter, 1 minute or 1 hour |

Limits: 30 writes an hour per id, 120 an hour and 60 reads a minute per address
(`ADDR_LIMITS`).
