# Apps (小应用): small apps the partner makes for the person, kept and reopened

How a person gets their own small app from one sentence ("给我做个小应用，记一下这趟北京出差的花销"),
keeps it on every device, changes it by talking, and lets the partner act inside it when asked.
Decided in D405; the evidence (what the author already does, what others do, what this codebase
allows, the name test) is `research/165-own-apps.md`. Words are the glossary's (`product-model.md`);
visuals are Pebble's (`ui.md`).

## Who and how it starts

- **The consumer** says "做个记花销的小东西" on the train, the night before a trip. Before: a number
  typed into a note, a total done by hand, the partner's prose answer gone up the scroll. After: a card
  under one line, 打开, and a finished-looking little app with their own costs in it, the same on the
  Mac that evening. 惊喜: it exists in seconds and already looks like Ducter.
- **The heavy developer** gets 309 prose reports a week from one review routine (hel, research/165
  §2). Before: the same shape re-read as paragraphs. After: "make it a little board" and a page they
  keep open, which the routine's partner fills.
- **The fresh user** never meets a concept: they asked for "a little thing", a card says what it is and
  where it stays (**放在「给你做的」里，随时再打开**), one button opens it.

**First principles.** An app is something made for the person, so it lives where made things live
(D71: Made for you is the lens, D383); a new place would be one more thing to learn for what most
people make once or twice. The file stays on the home, not in a message (a message carries its card),
so every device opens the same app and the same numbers. The sandbox is the default, not a setting:
the app can't reach anything but its own storage and the partner, and the partner treats the app's
words as data.

## What an app is

| | |
|---|---|
| **Is** | one HTML file the partner wrote (markup, `<style>`, `<script>`), at most 200,000 characters |
| **Belongs to** | one partner (persona); a second partner (preview) has none yet |
| **Lives** | on the home: `apps/<id>/` in the data folder: `meta.json`, `index.html`, `data.json`, the last ten versions `v<n>.html` |
| **Found** | its card under the partner's words; Made for you (**小应用 / Apps** chip; the kind word "app", "小应用", "工具", "tracker" in the field); the partner's `[apps]` line |
| **Opens** | the web and the phone: a sheet (the whole screen on a phone) with the app in a frame; the Mac: its own window |
| **Keeps** | what it writes through `ducter.set`, on the home (at most 500,000 characters of JSON per app) |
| **Can't** | load anything from outside the file, reach the network, keep browser storage, open windows or links, show alert/confirm/prompt, navigate the page around it |

## Making one: one sentence

1. The person asks for an app, a tracker or a tool to keep ("做个小应用", "a habit tracker", "a little
   board for my PRs"). A one-off answer (a comparison, a list this once) stays a D303 block.
2. The partner writes the file itself with the **app** tool, now, in the turn (never a task: an app
   should be seconds, not a harness's minutes). The tool's description carries the rules: inline CSS
   and JS only, nothing from the internet, `ducter.get/set` for data, `ducter.ask` only on the person's
   tap, Pebble's `--d-*` variables, 360 px wide first, the person's language.
3. The home keeps it and **lints** it (a CDN script, `fetch`, `localStorage`, `alert`, `window.open`);
   anything found goes back to the partner as "fix these", before it says it's ready.
4. One short line, then the card: the app's clay tile (a small window drawn in the accent clay), its
   name, **{name}给你做的小应用，放在「给你做的」里，随时再打开。 / An app {name} made for you. It stays in
   Made for you; open it any time.**, **打开 / Open**. Never the code, never a feature list.

## Changing one: by talking

- In the conversation: "加个合计", "改成绿色". The partner sees the person's apps in an **[apps]** line
  every turn while there are any (id, name, version, when changed and opened, its data's keys; the
  newest eight); "change it" with none named means the one opened or changed last.
- Under the app, in its sheet: **让{name}改这个小应用… / Ask {name} to change it…**. The words go to
  the conversation as the person's own, with a small line over them: **关于「北京出差花销」 / About
  “Beijing trip expenses”**.
- The partner changes it with edits (find and replace, each matching once) or a whole new file; the
  card says **改好了 / Changed**; an app open on any device runs again as it is now, with a green line
  **改好了** and the partner's few words of what changed.
- **改回去 / Undo the change** in the sheet's head brings the version before back (as a new version),
  as far as ten back.
- The partner can also **fill** an app ("把我今天的打车记进去"): it writes keys into its data; the card
  says **填好了 / Filled in**.

## Inside an app: the bridge

```js
ducter.get(key)            // the value, at once (the data comes with the app)
ducter.set(key, value)     // kept on the home; every device with it open hears it
ducter.all()
ducter.onChange((key, value, by) => …)   // by: "app" (another device) | "partner"
ducter.ask(text)           // → Promise<string>: the partner's answer
ducter.lang, ducter.dark   // the theme follows Ducter's while it is open
```

**An app's ask** goes into the conversation as the person's message *from that app* (they tapped in
it), with **「北京出差花销」问 / “Beijing trip expenses” asks** over it; the partner sees it fenced as
the app's words (data, not the person's instructions or approval); its first words after it answer it
and go back into the app. One waits at a time (**它上一个问题还在等回答。**), at most 20 an hour
(**这个小应用这一小时问得太多了，过会儿再试。**). **An app's ask can fill an app, never rewrite one:** only
the person's own words change an app. **Anything outward** an app asks for (send, pay, post, book) is
never done on its word, whatever it claims ("already approved"): it goes on an ask card for the
person's own Go, and the app is told it waits for their Go.

## The sandbox

| Where | How |
|---|---|
| The policy (all clients) | `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'` (the Mac: `'self'`, its own scheme); `form-action`, `base-uri`, `frame-src`, `worker-src`, `object-src` none. In the document before anything else, and as a header. |
| The web and the phone | the page's own policy forbids inline scripts in a `srcdoc` frame, so the home serves the app at `/app-frame/<token>` (a one-app capability, 30 minutes, minted on each open) with the policy and `sandbox allow-scripts allow-forms`: an opaque origin (no cookies, no storage, no reading the page around it), no popups, no top navigation, no modals. The page frames only its own origin (`frame-src 'self'`). The frame talks by `postMessage`; the page takes only messages from that frame, for that app. |
| The Mac | its own window: a web view whose page is someone else's (MyGo's `Untrusted`: no Go methods, no other origin, no window, no download) on `ducter-app://<id>/`, served from Go: `/` the document, `POST /bridge` what it writes or asks, `GET /events` a long poll for what changed elsewhere. |
| The home | keys are short and printable, data is capped, asks are rate-limited, a frame token is one app's and expires; an app of another partner is never opened. |

## Not in v1

Sharing an app with someone (a link, their own data or a shared copy, viewer-pays, a first-use
consent); an app calling a connected account or the web by itself (only through the partner, behind
Go); pointing at part of an app to change it; an app made by a coding task (several files, a build);
offline on the phone (the frame needs the home); an app's own notification or schedule (a routine
filling it is the way); the Mac window's own "ask to change" line and 改回去 (in the conversation and on
the web for now); deleting from Made for you (`app_remove` exists, no button yet); the Android and
iPhone shells' native bridges (the web's frame serves them). `todo.md`.
