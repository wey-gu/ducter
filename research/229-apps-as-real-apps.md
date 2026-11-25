# 229 · Small apps as real apps: Anthropic's "install as app", and the apps walked end to end

Date: 2026-11-25, on main at `ab97fd40` (0.1.61). Feeds D562 (`design/apps.md`). Follows research/166,
169, 174 and 181 (D405, D410, D422, D431).

Tags: **VERIFIED** = read in Ducter's code or run here; **DOCUMENTED** = stated by the source named;
**INFERRED** = judgment. No people rated anything.

Shots (`.shots/apps-polish/`, gitignored, D75): `before/` and `after/`, web `web-{1-conv,1-card-2x,1-pins-2x,
2-first,2-head-2x,3-filled,4-typed,4-changing,5-changed,6-undone,7-shelf,8-shelf-menu,9-broke,10-board,
11-sheet-menu}-{390,1000}-{zh,en}-{light,dark}.png` (after also `12-homescreen` and its 2x crop), Mac (the
test renderer) `mac/mac-{conv,shelf}-{1000,1150,1400}-*.png`, `mac-shelf-menu-1150-*`, `mac-window-{first,changed,
broke,menu}-*`; the icons `after/icons/` (the home's PNGs, macOS's own rendering of the bundles at 256,
a Dock row at 64 pt and a Home Screen row at 60 pt, light and dark). All against `apps/web/demo-apps-polish.ts`
on scratch data (the Beijing trip filled from the bookings, the review board over nowledge-co PRs
#10287, #10473, hawdb#412 …, a habit app that broke, a list never opened), headless Chrome over CDP;
never `~/.ducter`, :7777 or the person's Dock.

## 1. What Anthropic shipped (DOCUMENTED, https://claude.com/resources/articles/install-as-app, 2026-11-24)

- An artifact can be installed as a desktop app from **Share → Install as app**, in Claude for Mac or
  Windows (beta).
- The installed app has its own icon and its own window. It can send notifications and add a menu-bar
  or tray item, subject to permissions. It can use Claude and the person's connectors. It updates
  itself when the artifact is edited.
- Three permission levels: **Default** (what a browser could do); **App permissions** (always-on-top
  windows, global shortcuts, notifications); **Full computer access** (only for apps you made, or made
  inside your organisation). A permission covers the current version only and is asked again after
  every update. Apps aren't reviewed before install.
- It must be online and signed in; its requests count toward the plan's usage.
- Positioned as "open like the rest of your apps", with a meeting-prep page, an order tracker, an
  image editor and a menu-bar monitor as examples.

## 2. Where Ducter's apps stood (VERIFIED)

| | Claude's installed artifact | Ducter's 小应用 before D562 |
|---|---|---|
| Made from | an artifact the person made in a chat | one sentence; the partner writes it in the turn, filled with what Ducter knows (D410) |
| Its own icon | yes | a drawn mark on a clay tile, inside Ducter only (D422) |
| Its own window | yes | the Mac: its own window (D410); web and phone: a sheet over the conversation |
| Opened from | the OS (Dock, Start, Spotlight) | inside Ducter only: the bar's 小应用, ⌘K, pinned chips, `#app=<id>` |
| Updates | follows the artifact's edits | follows every change by talking, on every device (D405) |
| Data | (not stated) | kept on the home, the same on every device (D405, D431) |
| Uses the AI | Claude and connectors | `ducter.ask` → the partner, fenced as data; anything outward behind the person's Go (D405) |
| Permissions | three tiers, asked again per version | one: the sandbox (no network, no storage, no windows; lint-guarded), never a setting (D405) |
| Notifications, menu bar | yes, with permission | no (a routine fills it instead, D407) |
| Needs | online, signed in, plan usage | the home reachable; asks are the person's own harness |

The gap that matters to Ducter's people is the first three rows: an app they live with can't be
reached the way they reach every other app. The permissions row is where Ducter is deliberately
narrower (INFERRED: a single sandbox with nothing to grant is what makes 放心 true for the fresh user;
tiers only pay once an app can do something a browser can't).

## 3. The apps walked (VERIFIED, `before/`)

As the three people (AGENTS.md):

- **The consumer** asks on the phone for the trip app, opens its card, adds a taxi and dinner, asks
  for daily subtotals from the app's own line, then presses 改回去. Before D562 the open app then said
  **改好了 / Changed**, the same green line a change gets: the undo read as one more change.
- **The heavy developer** keeps the review board pinned and opens it from the Mac every morning; the Mac
  window's ask was a grey text field and a dark 发送 button, not the composer every other place uses
  (ui.md "The composer" names a small app's ask, D519); the shelf at 1150 and 1400 drew two tiles a row
  and left a third of the column empty.
- **The fresh user** has never heard of an app; their card's line broke inside a clause
  (「你的小应用」/里), and on a phone the card cut the name mid-word ("Beijing trip, Nov 2…").

The ranked audit (severity × how often it is met; fixed unless marked):

1. **The Mac window's ask is a field and a button of its own**, not the shared composer (a UI-bar
   rule: one composer, D519). Fixed: `composerBox`.
2. **An Undo that landed said 改好了.** Web and Mac. Fixed: **改回去了 / Changed back**.
3. **改回去 in the head cut the app's name**: "Beijing…" (web 390), "Beijing trip, Nov 20…" (Mac 520).
   Fixed: 改回去 moved beside the change it undoes (the 改好了 line) and stays in 「⋯」; the head keeps
   only the name and 「⋯」; the Mac window opens 600 wide (the kit's page is 560 at most, the stage's
   margins round it).
4. **The Mac shelf wrapped after two tiles** at every width (a third of 760 less its gaps rounded a hair
   over, so the row wrapped). Fixed: whole-point tiles; a geometry test at 1000, 1150 and 1400.
5. **No way to open an app like the rest of the person's apps** (§4). D562.
6. **The line over a message about an app** used the generic window mark and the name it had then
   (「北京出差花销」 after a rename). Fixed: its own mark, its name now (web and Mac).
7. **A card's name cut mid-word on a phone**, and its line broke inside a clause. Fixed: two lines
   before the cut; `text-wrap: pretty` (web), `keepClauses` (Mac).
8. **A task keeping an app current was said in bold ink**, louder than the app's own line on the tile.
   Fixed: a quiet fact (muted, regular).
9. Left: the web tile's **置顶** sits between the answer and the state line while the Mac puts it in
   the tile's top row (a consistency nit; the next shelf pass); the Mac window's test renderer draws
   light for "dark" (the harness, not the app).

impeccable / kill-ai-slop / design-review against the after shots: no new colour, gradient, emoji, pill or
callout; the Home Screen sheet is the shared pop-over card (`pmenu`) with the shared `Btn`; the Dock icon
is the tile's own mark and clay, not a new metaphor (§5).

## 4. Making a kept app open like an app

### The Mac (VERIFIED unless marked)

- One process, one Dock icon: Ducter's app windows are its own (mygo windows); a window can't have a
  Dock icon of its own. Chrome's way (an app shim process per app) or Safari's (a whole web-app
  process) would give the app its own ⌘Tab entry, at the cost of a second process holding a second
  socket to the home (INFERRED: weeks, and a second place to get the bridge right).
- **The lightest thing that works**: a bundle in `~/Applications/Ducter Apps/<name>.app` whose
  executable is a two-line shell script, `open -b <Ducter's bundle id> ducter://app/<id>`, with
  `LSUIElement` so it shows no Dock icon of its own while it runs. A script bundle launches through
  LaunchServices on this Mac (macOS 27.2.1): a probe bundle's script ran on `open` (VERIFIED). No
  Mach-O, so nothing to sign and nothing Gatekeeper or the hardened runtime checks (INFERRED from the
  files being made locally with no quarantine attribute; VERIFIED that the probe ran unsigned).
- Its icon: the home draws the app's mark pressed into its clay as PNGs at 16–1024 (`app-icon.ts`); the
  Mac writes them into an `.icns` (PNG members `icp4`…`ic10`). macOS 27 draws the bundle's icon itself
  inside its own squircle with its rim (`NSWorkspace.icon(forFile:)`, VERIFIED, `after/icons/mac-system-rendered-256-light-dark.png`).
- The Dock: `defaults export com.apple.dock`, PlistBuddy adds a `file-tile` to `persistent-apps` (or
  moves a renamed one in place), `defaults import`, `killall Dock` (VERIFIED on a copy with the real
  PlistBuddy in `appdock_test.go`; the live Dock was never touched in this work). The Dock restarts for
  about a second (INFERRED from how every Dock-editing tool works).
- `ducter://` is declared in Ducter's Info.plist (`make-app.sh`) and handled by mygo's `OnOpenURL`
  (mygo `deeplink.go`, VERIFIED); a link that starts Ducter waits for the home, then opens the window.
- Spotlight and the Applications folder find it because it is an application bundle in
  `~/Applications` (INFERRED; Spotlight indexes the home folder). Launchpad became Spotlight's Apps
  list in macOS 26 (INFERRED from Apple's 2025 announcements; not checked here).

### The phone and the web (DOCUMENTED / INFERRED)

- iOS Safari's **Share → Add to Home Screen** takes the page's `apple-touch-icon`, its
  `apple-mobile-web-app-title` and its URL, and the web app manifest where present (INFERRED from
  WebKit's behaviour since iOS 16.4; not run on a device here). Chrome on Android installs from the
  manifest, with `beforeinstallprompt` for an in-page button (DOCUMENTED, web.dev "Installation
  prompt"; the headless Chrome here fired it, VERIFIED).
- So while an app is open the page points those at the app: its manifest (`/app-icon/<id>/<key>/manifest.webmanifest`,
  its own `id` `/app?app=<id>`, `start_url` straight into it, standalone), its 180 px icon and its name,
  and the address `/app?app=<id>` (VERIFIED in the after shots' log). The page's code reads `?app=` and
  `#app=` and opens the app full screen.
- **Risk:** a Home Screen web app on iOS keeps its own storage, apart from Safari's (INFERRED), so an
  app added there may ask to pair once the first time, as Ducter itself does on the Home Screen. Not
  checked on a device: a todo with its trigger.
- The icon and manifest are served without the device token (a Home Screen and a manifest fetch send
  none) but only under a key: an HMAC of the app's id with this home's own secret (`apps/.icon-key`).
  They say the app's name, mark and clay and nothing it keeps (VERIFIED: a wrong key is 404).
- `design/offline.md`: the app shell caches Ducter's page, not an app's frame (an app needs the home,
  "Not in v1"); a kept app opened with the home away shows Ducter's offline page, the same as today's
  `#app=` link (INFERRED from offline.md §the shell; not shot).

## 5. Permissions and the rest of Claude's list

Ducter's apps stay at today's sandbox (no network, storage, windows; lint-guarded; asks fenced as data;
anything outward behind Go). Notifications, menu-bar items, always-on-top and shortcuts from an app, and
permission tiers asked again per version, go to `todo.md` with their triggers (D61's floor and the Go rules
apply to any of them). INFERRED: Claude needs tiers because its apps call connectors directly; Ducter's
reach the world only through the partner, so the one thing a tier would grant already has its own Go.

## Implications for Ducter

1. D562: **放到程序坞 / Keep in the Dock** on the Mac and **添加到主屏幕 / Add to Home Screen** on the phone and web,
   from an app's 「⋯」, built on the lightest native pieces: a script bundle opening `ducter://app/<id>`, and
   a per-app manifest and icon served by the home under a key. The icon is the app's own mark on its clay.
2. Keep one sandbox; defer notifications, menu-bar items and tiers with triggers.
3. Fixed on the way: the shared composer in the Mac window, 改回去了, 改回去 beside its change, the Mac shelf's
   third column, a line about an app in its own mark and current name, two-line card names, a quieter kept line.
4. Owed: Add to Home Screen on a real iPhone (does it keep the pairing?), the live Dock on a Mac with a
   signed build, people as raters for 放到程序坞 against 添加到程序坞.

**Summary.** Claude's "install as app" gives an artifact its own icon and window, OS-level entry and
per-version permissions. Ducter's apps already had their own window (Mac), live updates and one safe
sandbox, but couldn't be opened like an app. D562 adds that from the 「⋯」: a Dock icon (a tiny script
bundle that opens the app in Ducter) and a Home Screen icon (a per-app manifest), the icon drawn from the
app's own mark; and the polish pass fixes eight issues the walk found (the Mac composer, an Undo saying
"Changed", a cut name, a two-column shelf, stale names over messages).
