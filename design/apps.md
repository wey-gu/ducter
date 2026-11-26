# Apps (小应用): small apps the partner makes for the person, kept and reopened

How a person gets their own small app from one sentence ("给我做个小应用，记一下这趟北京出差的花销"),
keeps it on every device, changes it by talking, and lets the partner act inside it when asked.
Decided in D405; the evidence (what the author already does, what others do, what this codebase
allows, the name test) is `research/166-own-apps.md`. Their own place, the kit and apps that open
already filled are D410 (`research/169-apps-home.md`). Words are the glossary's (`product-model.md`);
visuals are Pebble's (`ui.md`). D422 (`research/174-apps-bar.md`) brought them to the bar: a way up for
apps made before the kit, marks drawn for what an app is about, one state line from one truth each,
plain words in the foot, and the flows walked end to end (below). D431 (`research/181-apps-first-state.md`)
closed its follow-ups: an empty app opens on a designed first state, an app's things live in its data and
never in its file, and the loop was walked through a real client. D562 (`research/229-apps-as-real-apps.md`)
lets a kept app open like the rest of the person's apps (the Dock, the Home Screen) and polished the loop.
D603 gave the app its whole window: nothing stands under it at rest, and the composer to change it is one
gesture away (修改, ⌘L, /), below in "Changing one: by talking".

## Who and how it starts

- **The consumer** says "做个记花销的小东西" on the train, the night before a trip. Before: a number
  typed into a note, a total done by hand, the partner's prose answer gone up the scroll. After: a card
  under one line, 打开, and a finished-looking little app with their own costs in it, the same on the
  Mac that evening. 惊喜: it exists in seconds and already looks like Ducter.
- **The heavy developer** gets 309 prose reports a week from one review routine (hel, research/166
  §2). Before: the same shape re-read as paragraphs. After: "make it a little board" and a page they
  keep open, which the routine's partner fills.
- **The fresh user** never meets a concept: they asked for "a little thing", a card says what it is and
  where it stays (**放在「你的小应用」里，随时再打开**), one button opens it. Before their first, the bar's
  小应用 mark opens an empty shelf that offers their own trip first (D410).

**First principles.** An app is something made for the person, but unlike a made file it is lived
with: reopened, written into, changed again, filled by a routine every round. So it has a place of its
own, **你的小应用 / Your apps** (D410, superseding D405's "a lens of Made for you"; Made for you still
lists apps). An app opens finished: drawn with Ducter's kit, its total or state first, and already
filled with what Ducter knows about its subject. The file stays on the home, not in a message (a message carries its card),
so every device opens the same app and the same numbers. The sandbox is the default, not a setting:
the app can't reach anything but its own storage and the partner, and the partner treats the app's
words as data.

**D422, the same three, after living with apps a while:**

- **The consumer** (the author's own case): before, the expense app from last week still a grey form
  with a placeholder mark, 「6 小时前更新」 and a sentence about the internet; they feel it was a demo.
  After, its tile says **它还是旧样子** with **换成新样子**; one tap, the partner remakes it from what it
  knows (the booked train and hotel in it), and the tile now leads with 「2 笔，合计 ¥1,698」 under a
  suitcase. 惊喜: old things come up to the new bar. First time: the tile itself offers it.
- **The heavy developer**: before, the board and the fare check looked the same as a dead app; a
  failed round was silent. After, the board's tile says when it updates next; the fare check's says its
  round failed with **现在再试一次**; a change they asked for shows **Ducter 正在弄你说的…** until it lands.
  放心: one line, one truth, one button.
- **The fresh user**: never sees a state word until something is true; their first app's tile shows
  what it says and a mark that means it (a bottle for feeds). 好用 with zero concepts.

## What an app is

| | |
|---|---|
| **Is** | one HTML file the partner wrote (markup, `<style>`, `<script>`), at most 200,000 characters |
| **Belongs to** | one partner (persona); a second partner (preview) has none yet |
| **Lives** | on the home: `apps/<id>/` in the data folder: `meta.json`, `index.html`, `data.json`, the last ten versions `v<n>.html` |
| **Found** | **你的小应用 / Your apps** (the bar's 小应用 mark, ⌘K, the Mac's menu, `#apps`, the partner's card); its card under the partner's words; pinned, at the top of the conversation; Made for you (**小应用 / Apps** chip); the partner's `[apps]` line |
| **Looks** | its mark, drawn for what it is about (D422: 28 in `app-glyphs.ts`, shared with the Mac; the partner's pick, else the one its name or sentence points to, so 出差花销 is a suitcase; never an emoji), pressed into one of the person's six muted clays (from its id); the one line it says of itself (`ducter.summary`), big |
| **Is doing** | D422: one state, worked out by the home on every list (`AppMeta.live`, `appState`): kept current, being changed, broke, the old look (below, "What it is doing") |
| **Opens** | the web and the phone: a sheet (the whole screen on a phone) with the app in a frame; the Mac: its own window |
| **Keeps** | what it writes through `ducter.set`, on the home (at most 500,000 characters of JSON per app) |
| **Can't** | load anything from outside the file, reach the network, keep browser storage, open windows or links, show alert/confirm/prompt, navigate the page around it |

## Making one: one sentence

1. The person asks for an app, a tracker or a tool to keep ("做个小应用", "a habit tracker", "a little
   board for my PRs"). A one-off answer (a comparison, a list this once) stays a D303 block.
2. The partner writes the file itself with the **app** tool, now, in the turn (never a task: an app
   should be seconds, not a harness's minutes). The tool's description carries the rules: inline CSS
   and JS only, nothing from the internet, `ducter.get/set` for data, `ducter.ask` only on the person's
   tap, `ducter.summary` for its shelf line, **Ducter's kit** (below), 360 px wide first, the person's
   language.
3. **What Ducter knows goes in (D410).** An app about something Ducter knows (a trip on the calendar,
   what the partner booked or paid for, a task's numbers) is named for it (**北京出差 11/20–21**, never
   the generic 出差花销) and made with its `data`: each item with `from` (「你的预订」), shown as a small
   tag and editable like any other. Its `note` says in a few words what it filled in. An empty make is
   answered: if you already know things for it, put them in now and name it for them. Nothing known:
   it opens on its **first state** (D431, below), never invented numbers.
4. The home keeps it and **lints** it (a CDN script, `fetch`, `localStorage`, `alert`, `window.open`;
   D410: a native `<select>` (D421: `select.k-select` passes), `type=number`, no `k-app`; D422: a date or
   time picker, no mark, no shelf line; D431: two or more rows written into the markup); anything found goes back to the partner as "fix these", said
   as what to use instead, before it says it's ready.
   **D422, answer first:** the `k-sum` on top holds the one thing they'd open it for (the total, what's
   left, the streak, how long since the last feed), `k-sum-next` the next thing; then their items;
   adding last and folded (`details.k-add`); one empty line for the whole app; each fact its own
   element (D291); no delete on every row. What the person just said goes into its data too (「今天
   6:10 喝了 120ml」 opens with today's 210ml).
5. One short line that says what it filled in (「做好了，就叫「北京出差 11/20–21」。高铁和两晚酒店已经从你的
   预订里填进去了。」), then the card: the app's clay tile, its name, **{name}给你做的小应用，放在「你的小
   应用」里，随时再打开。 / An app {name} made for you. It stays in Your apps; open it any time.**,
   **打开 / Open**. Never the code, never a feature list.
6. **The first time it opens**, a line over it: **{name}先填好了 / {name} filled in** and the note
   (「高铁和两晚酒店，来自你的预订」). Once, one slim line; it goes after 8 s or at the first touch
   inside the app (D603).

### The kit (D410)

Every app's document carries `APP_KIT_CSS` before the app's own file (the app may restyle anything),
so a small model draws a finished app without inventing a design, and never the system's grey controls:

| Class | What |
|---|---|
| `k-app` | the page: 560 px at most, a 14 px rhythm |
| `k-sum` > `k-sum-label`, `k-sum-value`, `k-sum-sub` | **first**: the total or the state, big and tabular, on a raised clay card |
| `k-card`, `k-h` | a card; a quiet section head |
| `k-list` > `k-row` > `k-row-main` (`k-row-sub`), `k-row-value` | rows with a value at the end |
| `k-chips` > `button.k-chip[aria-pressed]` | a choice (never a `<select>`) |
| `input.k-num` (`inputmode=decimal`) | a big number (never `type=number`) |
| `k-field` > `label` + `input.k-input` | a field |
| `k-btn`, `k-btn primary`, `k-btn quiet` | clay buttons on a ledge |
| `select.k-select` | D421: a longer choice, the kit's clay select |
| `k-from` | where a prefilled item came from: a quiet word (D422: never a dotted pill) |
| `k-empty` | once in the whole app: one calm line of what will list there (D431: over two drawn ghost rows while the app keeps nothing) |
| `k-sum-value k-none` | D431: the answer while nothing is kept: a word (「还没记」 / "Nothing yet"), muted, never a 0 |
| (the first state) | D431: while the app keeps nothing yet, the bridge marks the page (`data-empty`): the answer muted, k-empty's ghost rows, and the first `details.k-add` opened by itself as a card (`data-first`) right under them; it folds back once the first thing is kept |
| (empty shells) | D431: `[hidden]` always hides (a kit class can't show what the app hid); a card round an empty list, an empty `k-sum-sub` or `k-sum-next` fold away; a `k-row-sub` beside `k-row-main` shares the row |
| `details.k-add` > `summary` | D422: adding, last and folded; the summary is the accent button (「记一笔」) |
| `k-sum-next` | D422: the next thing, under the total |
| (a floor) | D422: any input, select, textarea or bare button the app left unstyled is drawn in clay (`:where()`, below anything the app says), so even an app from before the kit stops showing the system's grey |
| `k-bar` > `i` | a bar |

## 你的小应用 / Your apps: the shelf (D410)

**Who:** anyone with more than one app, and the routine owner whose board updates itself. **Felt:**
every app and its state in one glance; care (rename, pin, undo, delete) one 「⋯」 away. The name:
research/169 §4 (空间 / Space read as Nowledge Mem's Spaces by every rater; the possessive read clearest).

- **Where:** a drawn mark (four rounded tiles) in every bar's places, beside On hand, named **小应用 /
  Apps**, its place **你的小应用 / Your apps**; ⌘K; the Mac's menu; `#apps`; "我的小应用在哪" puts its card
  under one line (the app tool's `shelf`).
- **A tile (D422):** its mark on its clay; its name, smaller; **its own line, big** (`ducter.summary`:
  「2 笔，合计 ¥1,698」), else **还没打开过 / Not opened yet** for one never opened; **置顶 / Pinned**; its
  state line (below), else **{time} 更新 / Updated {time}**; when the state asks for something, its
  one button at the tile's foot. Pinned first, then the most recently
  changed or opened. Wide: as many columns as fit; a phone: two, the whole screen. A tap opens it.
- **「⋯」** (on the tile and in the app's head): **改名 / Rename** (in place), **让{name}改… / Ask {name}
  to change it…** (opens it, its line focused), **改回去 / Undo the change** (when there is one),
  **置顶 / Pin to the top** · **取消置顶 / Unpin**, D562's **放到程序坞 / Keep in the Dock** · **从程序坞拿掉 /
  Remove from the Dock** (the Mac) or **添加到主屏幕 / Add to Home Screen** (a phone's or computer's browser),
  **不再让「{task}」更新它 / Stop “{task}” updating it**, **删掉 / Delete**.
- **Delete** asks first: **删掉「{name}」？ / Delete “{name}”?**, **它记下的东西会一起删掉。 / What it keeps
  goes with it.**, **不删 / Keep it**, **删掉 / Delete**; then **删掉了「{name}」 / Deleted “{name}”** with
  **撤销 / Undo**. The home keeps a deleted app and its data 30 days (`apps/.removed/<id>/`), then it is
  gone. The partner deletes one only on the person's own words; its card says **删掉了，连同它记下的东西。
  / Deleted, with what it kept.** with **撤销 / Undo**.
- **Pinned** apps also sit as small chips at the top of the conversation, beside D381's pins: the tile,
  the name, its line on a wide screen.
- **Empty:** three ghost tiles, **这里放{name}给你做的小应用 / Apps {name} makes for you live here**,
  **说一句想记什么、看什么，它就做一个，一直放在这里，每台设备上都一样。**, **可以这样说 / Try saying** and up
  to three ideas from the home (`AppIdea`): a trip in the next three weeks from the noted bookings first
  (**做个小应用，记一下这趟北京出差的花销**, **你 11/20 去北京**), then everyday ones (this month's spending,
  a habit tracker, a shopping list). A tap says it as the person's words and goes to the conversation.

## What it is doing: one state, one truth each (D422)

**Who:** all three. **Felt:** before, a tile said only when it changed, and a routine's board, a
change asked for, a page that threw, a round that failed all looked the same; after, one line says
what is happening and the one button fixes what's wrong. **First time:** the first app with
something to say says it on its tile; nothing to learn.

The home works it out on every list, never stores it (`AppMeta.live`; `appState` and the Mac's
`StateOf` order it the same, the most urgent first):

| State | From (the one truth) | Line | Its button |
|---|---|---|---|
| being changed | the person's words about it are in (`user_msg.app`, not an app's own ask) and the partner hasn't answered (its next message clears it; 10 minutes at most) | **{name}正在弄你说的… / {name} is on it…**, a calm track sliding (never a blink; still under reduced motion) | none |
| broke | its page's own error on this version (the bridge's `error` → `app_error`; the next version clears it) | **它打开时出了点问题 / Something went wrong in it** | **让{name}修好它 / Ask {name} to fix it**: the person's words about it, the error in them |
| its round failed | the Ongoing card of its task: the last run failed | **「{task}」上一轮没更新成 / “{task}” couldn't update it last round** | **现在再试一次 / Try again now** (Ongoing's run now) |
| paused | the Ongoing card: paused | **「{task}」暂停了，先不会更新它 / “{task}” is paused, so it won't update for now** | **恢复 / Resume** |
| updating | the Ongoing card: running | **「{task}」正在更新它 / “{task}” is updating it** | none |
| the old look | its file fails the kit's look rules (`appKitIssues`) | **它还是旧样子 / It still has the old look** | **换成新样子 / Give it the new look**: **把「{app}」换成新样子，能填的先帮我填好** as the person's words about it |
| next round | the Ongoing card: resting | **「{task}」{time} 会再更新它 / “{task}” updates it again {time}** and when it last did | none |
| plain | nothing to say | **{time} 更新 / Updated {time}** | none |

The tile says it under its own line; the open app says it in a strip over the app when it has a
button or is being changed (a change asked from inside the app is said under it, D603), else in
「⋯」. **只有你看得到，每台设备上都一样。 / Only you can see it, and it's the same on every device.**
(D422, in place of D405's sandbox sentence) with **{time} 更新** is 「⋯」's last line and the
name's tooltip on the Mac, never a footer (D603). The partner's `[apps]` line carries the old look, a broken page and a failed round, so
"fix it" and 换成新样子 have what they need.

## The first state (D431)

**Who:** the fresh user and the consumer who asked for "a little app to keep track of what I spend"
with nothing Ducter knows about it. **Felt:** before, a grey ¥0, a sunken 「还没有花销，点下面「记一笔」开始。」
and a folded button (0.1.1's own apps also showed an empty white bar where the list would go and a
「Remove this one」 the app had hidden); the app looked unfinished and asked them to find the start.
After, 好用 it opens on what it will be: the answer's label with **还没记 / Nothing yet** and one line of
what shows there, two ghost rows where the items will list, and the form to add the first one already
open under them; 顺滑 the first save turns the answer into the number and folds the form back into
**记一笔**; 赏心悦目 nothing empty or broken shows; 放心 no number it doesn't have; 惊喜 even apps made
before this open this way, with nothing to redo. **First time:** it is the app's own first open.

- **The kit does it, so every app gets it**, old ones too: the bridge knows the data the app opened
  with; while none of it is the person's (a number other than 0, a list with an item, a map with
  one; the app's own settings, words and day lists don't count, and what the app writes while it
  starts doesn't either), the page carries `data-empty`.
- **The partner writes it** for a new app (the app tool's description): the k-sum still says what it
  will show (its label, `k-none` in place of a number, a sub line of what shows there); k-empty one line
  of what will list there.
- Rated by the eval: `app-generic-en` must use `k-none` and never draw a bare 0 as the answer.

## Its things live in its data (D431)

**Who:** the heavy developer whose PR page (`app-prs-known-en`) the partner drew with the four PRs
written into the file, and everyone whose app is changed later by talking. **Felt:** before, ticking
worked but the PRs themselves were code: the partner couldn't read them back or fill them, a routine
couldn't keep them, every change by talking rewrote them; after, the same page with its items in its
data, on every device, readable and fillable. **First time:** nothing to see; it is how apps are kept.

- **Lifted, where nothing they see changes** (`appLiftItems`, `packages/protocol/src/app-lift.ts`): a
  list of two or more objects in a pure literal (`const PRS = [{…}, {…}]`, no names, calls or templates
  with values), not one of the app's own settings (categories, colours, words, choices), under a key the
  file doesn't name and the data doesn't have, goes into the data under the list's name and the file
  reads it back (`const PRS = ducter.get("prs") || []`). A list given as the fallback of a key the data
  lacks (`ducter.get("feeds") || […]`) goes into the data; the file stays.
- **When:** as the partner makes it and as it changes it (the tool says which keys, so it fills them
  with `data` from then on); and **on open** for an app made before (a version of its own, so
  **改回去** brings the file back exactly; its place on the shelf doesn't move). Never a rewrite of
  anything else; never a model's turn the person didn't ask for.
- **Not liftable:** rows written into the markup itself. The lint says so as the partner writes it
  ("writes N rows into the markup: keep the items in data…"), and the `[apps]` line carries it for an
  existing app (`AppLive.inFile`: "N of its rows are written into its markup: when you next change it,
  move them into data"), with no line of its own for the person.

## The flows, walked (D422)

Walked in writing here. Shot (research/174, `.shots/apps-bar/`): 1 and 2 as haiku made them through the
real tool, 4's strip, 5, 10 and 11 on the web wide and phone (headless Chrome, the iPhone Simulator)
and the Mac (its test renderer), against `demo-apps-home.ts` (`DEMO_STAGE=states`); 3, 6, 8 and 9 are
D410's, unchanged, with its shots. Not walked: 4 end to end with a real partner, 5's attach by words.

1. **Made from a sentence.** "做个小应用记宝宝喝奶。今天 6:10 喝了 120ml，9:05 喝了 90ml": the partner
   writes it now (the app tool), with both feeds in its data, a bottle for its mark, 「今天 210ml，上次
   9:05」 for its line; one line and its card under it.
2. **First open.** It opens on what it is for (today's 210ml), the feeds under it, 记一笔 folded last;
   **{name}先填好了** with its note once, when it filled in something the person didn't type (D603: one
   slim line with a small **关闭 / Close**, gone after 8 s or at the first touch inside the app).
3. **Use.** A tap adds a feed; `ducter.set` keeps it on the home; every device with it open hears it;
   its line on the tile follows (`ducter.summary`).
4. **Change by talking**, from 修改 over the app (D603) or the conversation: the line under the app (or,
   asked elsewhere, the strip over it) says **{name}正在弄你说的…** at once; the partner changes it (edits or a new file); the open app runs again with **改好了** and the
   partner's few words; **改回去** brings the version before back (ten kept). The conversation shows the
   partner's line and the card, never the code.
5. **A routine keeps it current** ("每天早上看一眼机票，放进这个小应用"): the partner gives it to the task
   (`task`); its tile says when it updates next; a failed round says so with **现在再试一次**; **不再让
   「{task}」更新它** in 「⋯」 lets go (D410).
6. **Pin:** 「⋯」 → **置顶**: first on the shelf and a chip at the top of the conversation (D410).
7. **On the phone:** nothing to share: every app lives on the home, so the phone's 你的小应用 already
   has it, the same data, the same state (the bar's mark, `#apps`, `#app=<id>`). Sharing with another
   person stays "Not in v1".
8. **Rename** in place from 「⋯」 (D410).
9. **Delete** from 「⋯」 or by asking: asked first, **撤销** after, kept 30 days (D410).
10. **It broke:** its tile and window say so; **让{name}修好它** sends the error as the person's words
    about it; **改回去** is in 「⋯」 when there was a change.
11. **An app from before the kit** (the author's case): **换成新样子** remakes it with the kit, filled
    from what Ducter knows, its keys kept; **改回去** undoes it.

**D431, walked through a real client** (headless Chrome against `apps/web/demo-apps-walk.ts`, a
stand-in partner doing what the app tool does; web 1400 and 390, zh and en, light and dark; shots
`.shots/apps-2/walk-*`): made from a sentence (the card under one line), opened on its first state,
two costs added from inside (the answer, the rows, the form folded back), the app's ask answered back
into it, changed by talking from its line (**正在弄你说的…**, then **改好了** with the note and
**改回去**), "where are my apps" (the shelf's card, the tile with its line), deleted by asking, and
**撤销**. Fixed on the way: the line **发给 Ducter 了，改好会在这里刷新。** stayed after the change landed
(web and Mac now clear it when the change lands or the partner answers); the first-state form stayed
open as a card after the first save (it folds back).

## Changing one: by talking

- In the conversation: "加个合计", "改成绿色". The partner sees the person's apps in an **[apps]** line
  every turn while there are any (id, name, version, when changed and opened, its data's keys; the
  newest eight); "change it" with none named means the one opened or changed last.
- From the app itself (D603: the composer is one gesture away, never a bar under every app). At rest
  nothing stands under the app; the head holds **修改 / Edit** (the family's text button, D592's word)
  beside 「⋯」. 修改, **⌘L** (the Mac's File › **修改这个小应用… / Edit This App…**), **/** outside a
  field, 「⋯」 › **让{name}改…**, or / and ⌘L pressed inside the app's page outside its own fields (the
  bridge posts `compose`) bring up the conversation's composer from the bottom edge, with the keys:
  **让{name}改这个小应用… / Ask {name} to change it…**. The room opens as it rises 6 and fades in over
  `EnterDur` (a fade alone under reduced motion); **Esc**, the focus leaving it empty, or 修改 again
  put it away. The words go to the conversation as the person's own, with a small line over them:
  **关于「北京出差花销」 / About “Beijing trip expenses”**, and the composer goes down into one line
  under the app: the track and **{name}正在弄你说的…**; then **改好了** with the note and **改回去**, or
  **{name}在对话里回你了 / {name} answered in your conversation** with **查看 / View** when the partner
  answered in words; each goes by itself after 8 s (held while the pointer or the keys are on it).
  A change asked elsewhere is said over the app, in D422's strip.
- The partner changes it with edits (find and replace, each matching once) or a whole new file; the
  card says **改好了 / Changed**; an app open on any device runs again as it is now, with a green line
  **改好了** and the partner's few words of what changed, and **改回去** beside them (D562).
- **改回去 / Undo the change** on that line and in 「⋯」 (the web, the phone and the Mac's window; D562 took it
  out of the head, where it cut a long name) brings the version before back (as a new version), as far as ten
  back. When it lands in the open app, the line says **改回去了 / Changed back** (D562: it said 改好了).
- The partner can also **fill** an app ("把我今天的打车记进去"): it writes keys into its data; the card
  says **填好了 / Filled in**.

## Inside an app: the bridge

```js
ducter.get(key)            // the value, at once (the data comes with the app)
ducter.set(key, value)     // kept on the home; every device with it open hears it
ducter.all()
ducter.onChange((key, value, by) => …)   // by: "app" (another device) | "partner"
ducter.ask(text)           // → Promise<string>: the partner's answer
ducter.lang, ducter.dark   // the theme follows Ducter's while it is open (the Mac's window too, D446)
ducter.open({ draft: "owner/repo#n" })   // D407: that PR's draft sheet opens over the app; nothing is sent
ducter.summary(text)       // D410: its shelf line ("2 笔，合计 ¥1,698"), said on every change, sent once it settles
```

The bridge also tells the window around it two things the app never calls (D603): the person's first
touch in the page (`touch`, once per page: the first-open line has been seen), and / or ⌘L pressed
outside the app's own fields (`compose`: the composer comes up), since the page has the keys while it
is focused.

**An app's ask** goes into the conversation as the person's message *from that app* (they tapped in
it), in a neutral bubble on the left (sunken, never the person's orange: the words are the app's), with
**「北京出差花销」问 / “Beijing trip expenses” asks** over it; the partner sees it fenced as
the app's words (data, not the person's instructions or approval); its first words after it answer it
and go back into the app. One waits at a time (**它上一个问题还在等回答。**), at most 20 an hour
(**这个小应用这一小时问得太多了，过会儿再试。**). **An app's ask can fill an app, never rewrite one:** only
the person's own words change an app. **Anything outward** an app asks for (send, pay, post, book) is
never done on its word, whatever it claims ("already approved"): it goes on an ask card for the
person's own Go, and the app is told it waits for their Go.

## A routine fills an app (D407)

A task that repeats can keep one of the person's apps current instead of writing the same report
each round. **Who:** the heavy developer whose review routine wrote 309 same-format reports in four
days (research/166 §2); the consumer whose morning fare check says the same thing every day; the
fresh user, who meets it only when a routine of theirs repeats. **Felt:** before, the same paragraphs
re-read; after, one page always current on every device and a quiet conversation between rounds.

- **Data only.** An app can name the task that keeps it current (`AppMeta.task`) or the Keep whose
  rounds fill it (`AppMeta.keep`; every task a Keep's rounds run in may write it). That task gets the
  **`app_data`** tool: `{ app, set: {key: whole JSON value, null removes} }`, at most 40 keys a call,
  the app's 500,000 characters in all, 60 writes an hour. It never touches the file; the look is the
  person's (they change it by talking, as any app). It hears once, when given the app, which keys the
  app reads and to write once a round (a Keep's rounds hear it in their wake).
- **The review board reuses the review report.** **审查看板 / Review board** is Ducter's own template
  (`core/src/review-board.ts`): its one key `board` is written by the home from D394's `review_report`
  (which now also carries each PR's `title` and `ci`) and from the drafts' state, after every round,
  every Go on the round card and every draft sent from its sheet. The review task never writes it;
  the Ongoing card's line and the board read the same state. **It shows only its own work:** the
  rows are the `review_report`s of the task(s) that board follows, never the global review pile.
- **Only a review task is offered a review board.** The partner decides once, at `task_open`, by
  reading the brief, and records it as `needs.reviews`; code never counts `review_report` calls or
  matches words. A task whose job is fixing code (its own PR goes to the Babysitter or the hand-off)
  never gets `review_report`, the reviews offer or a board. Code guards it: a task that opens a PR of
  its own (`gh pr create`, read by the command's grammar) is never a review task. An existing task in
  rounds that already has a review board keeps its review work, so a running review Keep is not cut
  off mid-life.
- **A board is for work that comes back in rounds.** The offer, both kinds, needs the task to belong
  to a Keep, a loop or a routine, read from the home's own facts (its `task_loop` events, the Keep
  that holds it, a routine run), never from a report count. A one-off task (a dev fix: its page, its
  PR and the hand-off) is never offered one, however many reports it writes. The partner itself never
  proposes or makes a dashboard/board app for a one-off task unless the person asks in words; if
  asked, it may make one, saying plainly it is a snapshot (D612 rule 4). An offer that no longer
  qualifies is withdrawn: on start and whenever the rule is read, it settles with
  `decision_resolved` hold, by `"withdrawn"`, so an older version's card cannot be answered into an
  app.
- **The offer, once, per purpose.** After a review task's third round, or another repeating task's
  third done report, with no app yet and the task still in rounds, one card: **要不要把这些做成一个看板？ / Keep these on a board?**,
  **做成看板 / Make a board**, **不用了 / No thanks** (the default, no countdown), with what goes in it.
  Go on reviews makes the board at once (**做好了。每一轮都会更新它，不用再读一遍报告。**, its card); Go on
  other reports wakes the partner, who makes the app with the `app` tool and `task` (the board's one
  path, never another app standing in). If the offer can't be honoured, nothing is made and the
  partner says one plain line why. Never asked again.
  Asked in words ("把这些做成看板"), the partner does the same; a review task with no file gets the board.
  **One board per purpose:** with a review board already there, the offer is nothing and a second is
  never made; asking for another review task's board adds that task's work to the one board
  (`AppMeta.tasks`), never a second 「审查看板」. For partner-made apps, the `[apps]` line carries each
  app's `kind`, its task/Keep and its line, and the partner judges whether the ask duplicates one:
  it then changes or extends that app instead of making another. Code dedupes the exact kind + task.
- **A snapshot says so.** An app about a task's or a Keep's work that is not given to it is a
  snapshot: `AppMeta.snapshot`, the app says **截至 {time}**, and the partner's line says plainly it
  is a snapshot, not kept current. It never promises an update nothing will make.
- **A stopped app says so.** When the task or Keep an app follows ends, the app says **已停止更新**
  and **截至 {time}** as two separate elements (D291, never joined), on its tile and in its window,
  and the `[apps]` line says so to the partner.
- **Silent rounds.** A done report with no question from a task that keeps an app wakes nobody; a
  question, a block or a failure does. D394's round card stays the one thing that asks.
- **Where it shows.** The Ongoing card: **打开「{name}」 / Open “{name}”**. The app's sheet: **「{task}」每一轮都会更新它
  / “{task}” updates it each round**. The partner's `[apps]` line names the task.
- **The board.** How many wait and when the last round was; filters **全部 / All**, **有草稿 /
  Drafts**, **CI 没过 / CI failing**, each with its count; one card per PR, drafts first: repo and
  number, a CI pill (**CI 通过 / 没过 / 在跑**), the title, **有新提交 / New commits**, findings by
  severity (**2 个问题 / 2 problems**, **1 条建议 / 1 suggestion**, **没发现问题 / No problems
  found**), **看的是 {sha} / Looked at {sha}**, **等你说好 / Waits for your Go** or **已发到 GitHub /
  Posted to GitHub**, and **看草稿 / Read draft**, which opens the person's own draft sheet (web: over the
  app, back to it on close; Mac: the main window, in front). Under it: **草稿要你说好才会发到 GitHub。 /
  A draft goes to GitHub only after your Go.** One column on a phone, two from 760 px.

## The sandbox

| Where | How |
|---|---|
| The policy (all clients) | `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'` (the Mac: `'self'`, its own scheme); `form-action`, `base-uri`, `frame-src`, `worker-src`, `object-src` none. In the document before anything else, and as a header. |
| The web and the phone | the page's own policy forbids inline scripts in a `srcdoc` frame, so the home serves the app at `/app-frame/<token>` (a one-app capability, 30 minutes, minted on each open) with the policy and `sandbox allow-scripts allow-forms`: an opaque origin (no cookies, no storage, no reading the page around it), no popups, no top navigation, no modals. The page frames only its own origin (`frame-src 'self'`). The frame talks by `postMessage`; the page takes only messages from that frame, for that app. |
| The Mac | its own window, 600 wide (D410: a native head with its tile, its name and 「⋯」 (D603: and 修改), the first-open line, and a foot, empty at rest (D603), where the conversation's composer comes up and the change's line is said; the app between them): a web view whose page is someone else's (MyGo's `Untrusted`: no Go methods, no other origin, no window, no download) on `ducter-app://<id>/`, served from Go: `/` the document, `POST /bridge` what it writes or asks, `GET /events` a long poll for what changed elsewhere. |
| The home | keys are short and printable, data is capped, asks are rate-limited, a frame token is one app's and expires; an app of another partner is never opened. |

## Open like the rest of your apps (D562)

**Who:** the consumer opening the trip app every evening of the trip; the developer keeping the review
board up all day; the fresh user, who meets this only as one more line in an app's 「⋯」. **Felt:** before,
an app they live with sat a click inside Ducter away; after, it is in the Dock or on the Home Screen with its
own mark and opens straight into itself, as it is now (好用; 惊喜: it looks like their app). **First time:**
the 「⋯」 they already use. The evidence and Anthropic's "Install as app" are `research/229`.

- **The Mac: 放到程序坞 / Keep in the Dock** (then **从程序坞拿掉 / Remove from the Dock**), on the tile and in the
  window. It writes `~/Applications/Ducter Apps/<name>.app` (`appdock`; `DUCTER_APP_STUBS_DIR` elsewhere, and
  then the person's Dock is never edited): a two-line script, `open -b <Ducter's bundle id> ducter://app/<id>`,
  `LSUIElement` (no Dock icon of its own while it runs), its icon an `.icns` of the home's PNGs; and keeps it
  in the Dock (`persistent-apps` through `defaults` and PlistBuddy; the Dock restarts a moment). Then
  **「{name}」在程序坞里了，在聚焦搜索里也找得到。/ “{name}” is in the Dock, and in Spotlight.** (else **没放成：{why} /
  Couldn't add it: {why}**). A rename renames the bundle in its Dock place; a new mark redraws it; deleting the
  app on this Mac takes it out. `ducter://app/<id>` (Ducter's URL scheme) opens its window once the home is
  there. The window is Ducter's: ⌘Tab and the running dot say Ducter.
- **The phone and the web: 添加到主屏幕 / Add to Home Screen** (never inside Ducter's own iPhone or Android
  app, which can't add one). While an app is open the page is that app: its manifest
  (`/app-icon/<id>/<key>/manifest.webmanifest`: its own `id`, `start_url` `/app?app=<id>`, standalone), its
  180 px icon, its name, the address `/app?app=<id>`. The item shows the icon at 60 points with the name
  under it, **把「{name}」放到主屏幕 / Put “{name}” on your Home Screen**, the one step this browser takes
  (**在 Safari 里点「分享」，再点「添加到主屏幕」。/ In Safari, tap Share, then Add to Home Screen.**; Chrome's own
  **添加 / Add** with **点「添加」，它就在主屏幕上了。/ Tap Add and it's on your Home Screen.**; else **在浏览器的菜单里选
  「安装」或「添加到主屏幕」。/ In your browser's menu, choose Install or Add to Home Screen.**), **点它直接打开这个小应用，
  铺满整个屏幕；你让{name}改过的，它也跟着变。/ It opens straight into this app, full screen, and keeps every change
  you ask {name} for.** and **好 / Done**.
- **The icon** is the app's mark pressed into its clay (D422's glyph a touch bolder, so it reads at 16), drawn by
  the home (`packages/core/src/app-icon.ts`): `icon-<size>.png`, the whole square, which every system masks
  itself (a Home Screen; macOS 27 puts it in its own squircle at every size, where an icon on the old macOS
  grid got a grey plate at 128; research/229 §4). Served at `AppMeta.home` without the device token
  (a Home Screen and the Dock send none) under a key, an HMAC of the id with the home's own secret
  (`apps/.icon-key`); it says the name, mark and clay, nothing the app keeps.
- **Updates** follow as before: both open the app as it is now on the home. With the home away, the Home
  Screen app shows Ducter's offline page, as `#app=` does (`offline.md`).
- **Permissions stay one** (the sandbox below). An app's own notifications or menu-bar item, always-on-top
  or shortcuts, permission tiers and asking again per version are `todo.md`'s, behind D61 and Go.

## Not in v1

D422 owes (`todo.md`): a generated clay object as an app's mark, made once in the background where an image
harness is signed in, the drawn mark until then; people as raters.

Sharing an app with someone (a link, their own data or a shared copy, viewer-pays, a first-use
consent); an app calling a connected account or the web by itself (only through the partner, behind
Go); pointing at part of an app to change it; an app made by a coding task (several files, a build);
offline on the phone (the frame needs the home); an app's own notification, menu-bar item or schedule
(a routine filling it is the way, D407; D562's todo); reordering the shelf by hand, folders; a list of deleted apps to bring
back after the toast or card is gone (the home keeps them 30 days); ideas from the calendar and
routines on the empty shelf (only noted bookings so far); the Android and iPhone shells' native
bridges (the web's frame serves them). `todo.md`.
