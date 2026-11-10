# Releasing Ducter

Push a `v*` tag and `.github/workflows/release.yml` ships everything: the signed, notarized Mac
app (DMG), the Linux server bundles, a GitHub Release with checksums and notes, and the iPhone
app to TestFlight. Pull requests and `main` run `.github/workflows/ci.yml`.

## Author's checklist (one time, in this order)

1. **Check the App Store Connect API key's role.** Open App Store Connect > Users and Access >
   Integrations > App Store Connect API > Team Keys, and find the key in `~/ios_build.rc`
   (`APPLE_API_KEY`). Notarization works with any role. TestFlight signing in CI needs **Admin**,
   because CI uses cloud-managed distribution certificates. If the key isn't Admin, generate an
   Admin key, save the `.p8` to `~/.appstoreconnect/private_keys/`, and write a small rc file
   (say `~/asc_admin.rc`) with `APPLE_API_KEY`, `APPLE_API_ISSUER` and `APPLE_API_KEY_PATH`. In
   step 4 you pass it as `ASC_RC`.
2. **Register the iPhone app's bundle id.** At developer.apple.com > Identifiers > +, add App ID
   `co.nowledge.ducter.ios` with the **Push Notifications** capability. This is the id in
   `apps/ios/Config.xcconfig` (`DUCTER_BUNDLE_ID`).
3. **Create the app record.** In App Store Connect > Apps > + > New App, choose iOS, name it
   Ducter, pick bundle id `co.nowledge.ducter.ios`, and give it any SKU (e.g. `ducter-ios`). Then
   go to TestFlight > Internal Testing, add a group, and add yourself. Export compliance is
   already answered by `ITSAppUsesNonExemptEncryption = NO` in `Info.plist`.
4. **Upload the secrets.** On this Mac, run:
   ```sh
   scripts/ci/setup-github-secrets.sh --dry-run          # the plan; sets nothing
   scripts/ci/setup-github-secrets.sh                    # macOS asks once for the keychain password
   ASC_RC=~/asc_admin.rc scripts/ci/setup-github-secrets.sh   # only if step 1 made a new key
   gh secret list --repo wey-gu/ducter
   ```
5. **Push `main`** (it carries the workflows). Then make a trial release with a pre-release
   version. The tag must equal `packages/cli/package.json`'s `version`:
   ```sh
   # set "version": "0.1.0-rc.1" in packages/cli/package.json, commit
   git tag v0.1.0-rc.1 && git push origin main v0.1.0-rc.1
   gh run watch
   ```
   The GitHub Release comes out marked pre-release. TestFlight gets build `0.1.0 (<run>.1)`.
6. **The Android release key (D181), once:** create it, store it, upload four secrets and one
   variable, register the package for Android developer verification: the exact steps are in
   [android.md](android.md#the-release-key-once). Until then a release ships without the APK and
   the `android` job says so.
7. **Install from TestFlight** on your iPhone and confirm that pushes arrive. A TestFlight build
   is a Release build, so it subscribes with `env: production`, and the core then sends through
   the notification relay to `api.push.apple.com`. The relay needs its APNs key and settings
   first: `design/release/push-relay.md` (D159). No home needs a key of its own.

After this, every release is: write its `CHANGELOG.md` section with its what's-new lines (below),
bump the version, rebuild the web bundle (`sh scripts/build-web.sh`: it embeds the version, and CI
fails a stale one), run the pre-release gate (below), commit, `git tag vX.Y.Z`, push the tag. An rc
tag is no exception: bump `packages/cli/package.json` to the rc version (`0.1.0-rc.2`) and commit
before tagging `v0.1.0-rc.2`, or `meta` fails on the mismatch.

### What's new, in both languages (D172)

A device card that offers an update shows what's new in the reader's own language, at most two
short whole lines, and nothing when the release has none in that language (never the English body,
never cut mid-sentence). Each `## X.Y.Z` section of `CHANGELOG.md` carries them as an HTML comment,
which GitHub's release page doesn't render:

```md
## 0.0.8

<!-- whats-new
zh: 每件事都说清楚在哪台电脑上做
en: Each task says which computer it runs on
-->

**…the full notes, in English, as before…**
```

At most two lines per language, each at most 40 characters in zh and 80 in en (a longer line is
dropped, not cut). `packages/core/test/changelog.test.ts` fails a section after 0.0.7 without both
languages or with a line too long.

### The pre-release gate: `bun run e2e:linux`

Before tagging, run the near-real E2E rig on this Mac (`scripts/e2e/linux.ts`, about 15 minutes,
needs colima, Go and network for Bun, apt and Chrome for Testing). It builds three Linux bundles
of the checkout with made-up versions (9.0.1 < 9.0.2 < 9.0.3) the way the `linux` job does,
starts a colima VM of its own (profile `ducter-e2e`, Ubuntu with systemd, mounting only a scratch
folder, `--activate=false` so this Mac's Docker context stays), and then, from a headless client
that is the Mac app's own client and frame decoder (`apps/desktop/cmd/e2eclient`):

1. installs 9.0.1 from its tarball with its `install.sh --service` (the systemd user service, as
   on a server), and pairs the client with a code;
2. updates in place twice, 9.0.1 → 9.0.2 → 9.0.3, from 更新, against a local feed and mirror
   (`DUCTER_UPDATE_FEED`, `DUCTER_UPDATE_MIRROR`: loopback only), checking the card offers the
   release's own zh line and never says 没更新成 once the home runs the target;
3. adds 上网 (running each line Ducter says, as a person would: Chrome's system libraries, and on
   Ubuntu 23.10+ the AppArmor profile that lets its Chrome keep its sandbox) and runs 试一下:
   real JPEG frames must arrive and decode in the Mac app's own decoder (a still page paints once,
   so the client taps 刷新 for the next);
4. updates pi (a fake package on a local npm registry, `DUCTER_NPM_REGISTRY`, loopback only)
   1.5.0 → 1.5.1, then asks a worker whose pi was updated behind the home's back to update
   again: "nothing newer" must not show as a failure.

It deletes the VM and the builds at the end (`--keep` leaves them; the log stays in the scratch
folder). On an IPv6-only network with 464XLAT (macOS shows CLAT46) the VM's own IPv4 is dead and
apt fails at the first fetch: run it as `DUCTER_E2E_PROXY=1 bun run e2e:linux`, which sends the
VM out through a proxy on this Mac's loopback for that run (`scripts/e2e/proxy.ts`). The home in the VM listens on 47777, never 7777 (lima forwards the VM's ports to this
Mac's loopback). What it can't stand in for: a real network hop and TLS between the Mac and the
server, the auth gate seen from a non-loopback peer, an x64 server, and the signed Mac app's own
update; those still need hel and a real Mac before a release.

## What a tag does

| Job | Runner | What |
|---|---|---|
| `meta` | ubuntu | Fails unless tag `vX` equals `packages/cli/package.json` `version` (the app and DMG name read it there). Tags with a `-` are pre-releases. |
| `macos` | macos-15 (arm64) | Imports the Developer ID `.p12` into a throwaway keychain (`scripts/ci/import-certificate.sh`), writes the API key `.p8`, runs `scripts/make-app.sh` with `DUCTER_REQUIRE_NOTARIZATION=1`. That script signs inside out with the hardened runtime, notarizes the app and the DMG with the API key, staples both, and checks them with `spctl`. The job checks the DMG again and uploads `Ducter-X-arm64.dmg`. |
| `linux` | ubuntu | `scripts/install.sh --linux` builds `bun-linux-arm64` and `bun-linux-x64` with build.sh's pinned Bun 1.4.4. It smoke-runs the x64 binary, then packs `ducter-X-linux-{arm64,x64}.tar.gz`. Each tarball unpacks to one folder holding `ducter` and `install.sh`. |
| `android` | ubuntu | `apps/android`: unit tests, then `./gradlew assembleRelease` signed with the release key from secrets (D181); `aapt2` checks package and versionName, `apksigner` that the certificate is not a debug key and equals the `ANDROID_CERT_SHA256` variable. Uploads `Ducter-X-android.apk`, which the app's updater looks for by that name. Skips with a warning while `ANDROID_KEYSTORE_BASE64` isn't set. [android.md](android.md) |
| `ios` | macos-26 (Xcode 26) | `scripts/ci/testflight.sh`: xcodegen (unless the project is committed), `xcodebuild archive`, then `-exportArchive` with `destination=upload`. Marketing version is the tag without its suffix; the build number is `run_number.run_attempt`. It skips with a notice when `apps/ios` isn't on the tagged commit or no key is set, and it never blocks the GitHub Release. |
| `release` | ubuntu | Writes `SHA256SUMS.txt`. Notes come from the `## X` section of `CHANGELOG.md` if there is one (its whats-new block is what the cards show; a section without one gets a warning), otherwise from the commit subjects since the previous `v*` tag (`scripts/ci/release-notes.sh`). The release is created as a draft, the files are uploaded, then it is published. |

Only Apple silicon gets a DMG for now. An Intel build would add a `macos-15-intel` job running
the same steps.

## The one-line installer (`curl -fsSL https://ducter.ai/install.sh | sh`)

`apps/site/public/install.sh`, served from the site's root (`apps/site/vercel.json` sends it as
`text/plain` with a 5-minute cache). It reads the newest published release (the API's
`releases/latest`, else the `releases/latest` redirect; `DUCTER_VERSION` pins one), downloads
`Ducter-<v>-arm64.dmg` or `ducter-<v>-linux-<arch>.tar.gz` plus `SHA256SUMS.txt` from
`releases/download/v<v>/`, and checks the SHA-256. On a Mac it also requires `spctl` to say
"Notarized Developer ID" before it copies the app into `/Applications` (sudo only when that
isn't writable), then restarts the background LaunchAgent if it runs from there, links the CLI,
and opens the app. The link is `~/.local/bin/ducter` → `<app>/Contents/Helpers/ducter`, with the
rules of the app's own LinkCLI (`apps/desktop/internal/local/shell.go`), slightly stricter: it is
made when nothing is there and replaced only when it is a symlink into a `Ducter.app`; a regular
file (a from-source `scripts/install.sh`) or another tool's link is left alone and the script says
so. Off `PATH`, it prints the zsh line to add `$HOME/.local/bin`. `--no-cli` (`sh -s -- --no-cli`)
skips the link; other options are ignored on a Mac. Since the link exists, the app's "Use ducter
in Terminal too?" offer doesn't appear. On Linux it runs the tarball's own `install.sh` with the arguments after `sh -s --`.

**It downloads files by the names this workflow gives them.** Rename an asset here and the
installer must follow in the same change; `scripts/install-sh.test.ts` (part of `bun test`)
fails when the two drift, and CI parses the script. To test it without touching
`/Applications`, `~/.local/bin` or a running Ducter, point it at temp folders
(`DUCTER_BIN_DIR` moves the link), against the live release or a mirror of one:

```sh
DUCTER_APP_DIR=/tmp/apps DUCTER_BIN_DIR=/tmp/bin DUCTER_NO_OPEN=1 sh apps/site/public/install.sh

gh release download v0.0.1 -R wey-gu/ducter -D /tmp/mirror
DUCTER_VERSION=0.0.1 DUCTER_DOWNLOAD_BASE=file:///tmp/mirror \
  DUCTER_APP_DIR=/tmp/apps DUCTER_BIN_DIR=/tmp/bin DUCTER_NO_OPEN=1 sh apps/site/public/install.sh
```

## How the app updates itself (D72)

`apps/desktop/internal/update`, a small Go updater (not Sparkle; why in D72). Nothing extra is
published for it: it reads this repo's newest published release through
`https://api.github.com/repos/wey-gu/ducter/releases/latest`, unauthenticated, and needs exactly
two assets, `Ducter-<version>-arm64.dmg` and `SHA256SUMS.txt` listing it. The `release` job checks
that the sums list the DMG. Drafts and pre-releases are never offered. While the repo is private
the API answers 404 to an anonymous caller, and the app treats that as "no releases yet": silent.

| Step | What is checked |
|---|---|
| Feed | Tag `vX` parses as a version and is newer than the running `CFBundleShortVersionString`; a version once rolled back from is skipped |
| Download | Into `~/Library/Application Support/Ducter/updates/<v>/`, size as listed, SHA-256 as in `SHA256SUMS.txt`; the DMG is deleted once the app is out |
| Copy | `hdiutil attach -nobrowse -readonly`, `ditto` to `.Ducter.app.update-<v>` next to the running app (same volume, so the swap is a rename) |
| The copy | Same bundle id; version equals the tag; `codesign --verify --deep --strict`; the requirement `anchor apple generic` + Developer ID CA + Developer ID Application leaf + `subject.OU` = the running app's own team, on the app and on `Contents/Helpers/ducter`; `spctl --assess --type execute` |
| Swap | At the next quit (default; off in Settings) or Restart Now: the copy is checked again (Restart Now: before the quit, while the window says **Putting the new version in**; D160), then a detached `sh` waits for the app to exit, moves the running app to `updates/previous/`, moves the copy in (or puts the old one back), `launchctl kickstart -k` the background LaunchAgent when it is installed, and reopens the app on Restart Now |

The app is never replaced while it runs (the Dock tile would follow the moved bundle). A copy on
the disk image, a translocated copy, or an ad-hoc signed build only says "Version X is out ·
Download" (opens the release page). `RollBackOnQuit` puts `updates/previous/` back; there is no
UI for it yet.

### Testing an update locally

Two signed builds with a scratch bundle id (its own LaunchAgent label, dev.env and updates folder;
the real app is never touched) and a feed served from this Mac. Notarization isn't needed:

```sh
S=$(mktemp -d)
for v in 0.0.1 0.0.2; do DUCTER_BUNDLE_ID=co.nowledge.ducter.scratch DUCTER_VERSION=$v scripts/make-app.sh $S/$v; done
# feed: $S/feed/repos/wey-gu/ducter/releases/latest (GitHub's JSON shape) and $S/feed/dl/{dmg,SHA256SUMS.txt}
python3 -m http.server 8799 --bind 127.0.0.1 --directory $S/feed &
# ~/Library/Application Support/co.nowledge.ducter.scratch/dev.env:
#   DUCTER_DATA_DIR=$S/data  DUCTER_PORT=7798
#   DUCTER_UPDATE_FEED=http://127.0.0.1:8799/repos/wey-gu/ducter/releases/latest
#   DUCTER_UPDATE_SKIP_GATEKEEPER=1   (signed, not notarized; the team check still runs)
ditto $S/0.0.1/Ducter.app $S/Apps/Ducter.app && $S/Apps/Ducter.app/Contents/MacOS/Ducter
```

Afterwards: `DUCTER_AGENT_LABEL=co.nowledge.ducter.scratch.agent <helper> uninstall`, and remove
the scratch Application Support folder. Done on 2026-11-09: 0.0.1 → 0.0.2 by Restart Now and
0.0.2 → 0.0.3 by a plain quit; both swapped, kept the previous version, restarted the scratch
agent on the new helper, and a bad checksum was refused with its message.

## Secrets

`scripts/ci/setup-github-secrets.sh` sets all of these. The names are con's, so one Apple setup
serves both repos. Values never appear in logs.

| Secret | Used by | What it is |
|---|---|---|
| `APPLE_CERTIFICATE_P12_BASE64` | macos | Base64 of a `.p12` holding the **Developer ID Application: Nowledge Labs, LLC (JMU55RJW2K)** certificate and its private key, and nothing else. The script narrows `security export` (which exports every identity in the keychain) down to that one identity. |
| `APPLE_CERTIFICATE_PASSWORD` | macos | The `.p12`'s password. The script makes a fresh random one. |
| `APPLE_SIGNING_IDENTITY` | macos | SHA-1 of that identity, passed to `codesign` as `DUCTER_SIGN_IDENTITY`. A SHA, because the keychain holds several certificates with the same name. |
| `APPLE_KEYCHAIN_PASSWORD` | macos | Password for CI's throwaway keychain (random). Optional: a random one is made if it's unset. |
| `APPLE_NOTARY_KEY_ID` | macos, ios | App Store Connect API key id (10 characters). |
| `APPLE_NOTARY_ISSUER_ID` | macos, ios | The issuer UUID shown above the key list. |
| `APPLE_NOTARY_API_KEY_BASE64` | macos, ios | Base64 of `AuthKey_<id>.p8`. |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_BASE64` | ios | Optional: a separate **Admin** key for TestFlight. When unset, the `APPLE_NOTARY_*` key is used. |
| `ANDROID_KEYSTORE_BASE64` | android | Base64 of the Android release keystore (PKCS12), set by hand ([android.md](android.md#the-release-key-once)); not in `setup-github-secrets.sh`. |
| `ANDROID_KEYSTORE_PASSWORD` | android | The keystore's password. |
| `ANDROID_KEY_ALIAS` | android | The key's alias in it (`ducter`). |
| `ANDROID_KEY_PASSWORD` | android | The key's password; optional when it equals the keystore's (PKCS12 keys usually do). |

One **repository variable** (not a secret): `ANDROID_CERT_SHA256`, the release certificate's
SHA-256. The `android` job fails an APK signed by anything else.

The team id `JMU55RJW2K` is not secret. It is set in the workflow and in `apps/ios/Config.xcconfig`.

**Creating an App Store Connect API key:** go to App Store Connect > Users and Access >
Integrations > App Store Connect API > Team Keys > Generate API Key. Name it (e.g. "Ducter
CI") and pick the role **Admin**. Download the `.p8`; Apple lets you download it once only.
Note the Key ID and the Issuer ID. Roles: Developer is enough to notarize, App Manager is enough
to upload a build signed elsewhere, and CI's automatic signing creates a cloud-managed Apple
Distribution certificate, which needs Admin. If an iOS run fails with a "Cloud signing
permission error", the key is not Admin.

## Why TestFlight goes through `xcodebuild -exportArchive`

CI signs with Xcode's automatic signing, authenticated by the API key
(`-allowProvisioningUpdates -authenticationKeyPath/ID/IssuerID`), and exports with
`method=app-store-connect` and `destination=upload`. That one command does the App Store
signing and the upload, the same path as Organizer's "Distribute App > TestFlight". No
distribution `.p12`, no `.mobileprovision`, and no fastlane match repo live in secrets, so
nothing in CI expires or needs rotating except the key itself. Apple's tooling points uploads at
Xcode, Transporter, or the App Store Connect API (altool's notarization was retired in 2023).
`xcodebuild` is the one already on the runner.

- *Tradeoff:* it needs an Admin key.
- *Fallback (Mem's path):* export with `destination=export`, then run
  `xcrun altool --upload-app --type ios --file X.ipa --apiKey … --apiIssuer …`. Signing then
  needs an Apple Distribution `.p12` and an App Store profile in secrets.

## Ducter CI (`ci.yml`)

These jobs run in parallel (ts and android on Linux, go on macOS), and take a few minutes. macOS minutes cost 10x on a
private repo.

- **ts:** `bun install --frozen-lockfile`, `bun run typecheck` (both tsconfigs), rebuilds
  `apps/web/static` and fails if it differs from what is committed, `bun test`, the Markdown
  link check, the binaries check (D75), and `bash -n` on scripts. `bun test` includes the eval
  freshness check (D175): the persona and the partner's tools must hash to what the last full
  partner eval judged (`packages/partner/eval/results/LATEST.json`). CI never calls a model;
  whoever changes the persona or a partner tool runs `bun run eval:partner --model haiku`
  (about $1) and commits the results with the change.
- **go** (`apps/desktop`): `gofmt -l`, `go vet` for darwin and linux, a darwin/arm64 build, and
  `go test`. MyGo calls AppKit through purego, not cgo, so all of it runs on Linux.
- **android** (`apps/android`): its JVM unit tests and a debug APK, signed with Gradle's debug
  key (D178).
- **`ios.yml`:** an unsigned Release archive on macos-26, only when `apps/ios/**` changes.

**One Bun.** CI, the web bundle and the compiled CLI all use Bun **1.4.4**. `bun run build:web`
and `packages/cli/build.sh` use the `bun` on PATH when it is 1.4.4 and otherwise fetch it with
`npx -y bun@1.4.4`, so the committed bundle matches CI's rebuild byte for byte whatever Bun the
Mac has. Another Bun minifies differently and fails the bundle-freshness test.

**Tests are hermetic.** A CI runner has no git identity, no `claude`, `codex`, `gh` or `oo`, and
an empty home. Tests that run git commits through the product set the test repo's own
`user.name`/`user.email`; tests that open tasks pass `deviceProbes` with fake harnesses. To
check a change the way CI sees it, on the Mac:

```sh
env -i HOME="$(mktemp -d)" TMPDIR=/tmp PATH="/usr/bin:/bin:$(dirname "$(command -v bun)")" \
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.useConfigOnly GIT_CONFIG_VALUE_0=true \
  bun test
```

`user.useConfigOnly` stops git from guessing a name from the Mac account, which is what Linux
does when there is none.

## Locally

The same scripts run on the Mac:

```sh
scripts/make-app.sh                                    # see its header for credentials
sh scripts/install.sh --linux dist/linux
MARKETING_VERSION=0.1.0 BUILD_NUMBER=1 DUCTER_TESTFLIGHT_DRY_RUN=1 scripts/ci/testflight.sh
scripts/ci/release-notes.sh v0.1.0
```
