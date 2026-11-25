# A second partner (伙伴们 / Your partners)

D309, D312, D486, D497, D513, D516, D536, D565. Scenario A5. How more than one partner lives on one home: who wants it, what is shared and
what is kept apart, how attention adds up, how the person switches, and what the first slice
built. Builds on D18 (a persona is one Mem identity), D24 (attention aggregates per person,
conversations separate), D31 (projects and devices are the user's) and principle 17.

## Who, and why (User first)

- **The heavy multi-agent developer.** Work and life in one stream blur: a release ask sits under
  a dentist booking. Before: one conversation that is both. After: a work partner and a home
  partner, each with its own thread, and still one place (On hand) where everything that needs
  them adds up. Value: 放心, nothing of one leaks into the other's context or memory.
- **The consumer personal-AI user** (Grok bot, Muse). Wants a partner per person in the family,
  or a partner with a different character for a different part of life. Before: sharing one
  partner means sharing one memory. After: each family member's partner remembers them. Value:
  惊喜, a second friend in the same app, made in ten seconds.
- **The fresh user.** Never needs this. With one partner nothing about partners shows: no word,
  no switch, no coloured figure. The second partner appears only after the person makes one. Value: 好用,
  zero concepts until wanted.

**How it starts.** By talking: 「再给我做一个管家里事的伙伴，叫它小家」 makes it at once (the partner
tool, D486), and the reply says it is beside the name. Or Settings › 伙伴 (with one partner its last group, D500), one row: **再加一个
伙伴 / Add a partner**, with one line of help (one for work and one for home, or one per person). The
form asks three things: a name, **它管什么 / What it looks after** (optional, the person's words) and a
colour (D24: creating one is light). Settings' foot, with one partner, says it can be asked for in
words. Afterwards the list of partners appears (D513): on a computer a column at the conversation's
left with both, on a phone **‹** in the bar; the partner's reply says where. One tap shows the new
one's conversation.

## Shared and isolated

| Thing | Shared by every partner | Each partner's own |
|---|---|---|
| Log | one database | its conversation: the default's is `channel`, another's `channel:<id>` (task streams are the tasks') |
| Conversation | | yes: its words, questions, replies; another partner never reads them (isolated by default, D24) |
| Memory (Mem) | the person's own profile in the one Mem (every partner's L1 reads it) | its own Mem identity (D18, D141); a second partner's is `ducter-<id>`, bound once Mem answers (D312), its bundle (profile and its own rules) read into its L1 at its session's start (D486) |
| Tasks, routines, Keeps, groups, waits | listed together in On hand (every partner's, D546) | owned by the partner that opened them (D31: `card.persona`; a Keep's, a group's, a routine's and a wait's `persona`, D546) |
| Devices, projects, places | yes (D31) | |
| Accounts (connections), keys, subscriptions | yes: they are the person's | which accounts a partner may use: later (below) |
| Settings | notifications, quiet hours, look and sound, devices; **默认用什么想事情 / What partners think with by default** (D536) | its name, look, what it looks after (D486); what it thinks with when the person gives it its own (D536); later its own talk and memory switches |
| Chat apps (Telegram, Slack, WeChat, iMessage) | one thread per chat app, the default's contact (D516) | who the person's words are for (a reply, its name first, the one they are talking with); its words there lead with its name |
| Notifications | one stream, one quiet hours | each says whose it is |

**Privacy between partners.** A partner sees only its own conversation and its own memories. No
partner can read another's Log stream: core never wakes one partner for another's words, and a
client socket receives only the conversation it shows (the other partners arrive as counts and,
for the person's list, each one's last line, D513; never a partner's turn). Linking two partners (one may ask the other) stays a later, explicit act (product-model
§8). Honest limit: the person who owns the home can open any partner; partners are not accounts.
A family that needs privacy from each other needs separate homes.

## Attention is the person's

- **One count, where the person is counted (D497).** The Dock badge, the menu bar's mark and On
  hand say one number across partners: On hand's needs-you cards (every partner's tasks) plus every
  partner's own questions (`needsAcross`, protocol). **The list says it by whose (D513).** The
  counts line sits under the shown partner's name, so it speaks for that partner (its own tasks and
  its conversation's questions); each row of the list of partners carries the number of what of its
  own waits on the person, and the phone's **‹** the sum of the others'. The rows' numbers add up to
  the person's one count. (D309 put the one count under
  the shown partner's name: every naive rater read it as that partner's.)
- **One On hand.** On hand stays one board for the person, never one per partner (D24): every
  partner's tasks, Keeps, groups, routines and waits, whichever partner is shown. Each row and card
  (a task's row and card, an ask's card, a Keep's sheet, a group's card, a routine) carries its
  partner's small face in its own clay once there is more than one, and another partner's own
  questions are listed under 等你 / Needs you as **{name} 问你 / {name} asks you** with the
  question; a click shows that partner, where it is answered (D312).
- **Whose it is, never who is shown (D546).** Everything a partner owns is drawn and named as its
  owner's: a task's state face (its row, the rail, the opened task's mark at 28), a wait's and a
  goal's figure, its words **{name} 交给它的事 / What {name} asked**, **{name} 对它说 / {name} told
  it**, **告诉{name} / Told {name}**, **{name} 提醒了它一句 / {name} gave it a note**, a Keep's
  **{name} 看守中 / {name} is looking after**, a routine's **已暂停：{name} 停下的**. The owner is
  the object's `persona` (absent, or a partner since removed: the default). With one partner
  nothing changes: the art as drawn, and the name the default partner's own (which may not be
  Ducter). The shown partner's clay is only for the page's own figure (the bar, On hand's head, an
  empty page) and its own conversation's questions. No 只看{name}的 filter on On hand: the marks
  already say whose, and the bar's count opens the shown partner's own (D546, todo).
- **Whose it is, said where it matters.** A push names the partner when there is more than one:
  a task's title reads **小家：约牙医 / Home: Book the dentist**; a partner's own question carries
  its name as the title. The menu bar lists each other partner with something waiting:
  **换到小家，有 1 个等你 / Switch to Home, 1 need you**, a click shows its conversation. The Mac's
  needs-you notice names the partner whose things wait (D546: one owner, that one's name, a task of
  Ducter's included while another is shown; things of several, the shown one's).

## Switching: the list of partners (zero concepts, D513)

- **Every partner in one list, as a messaging app lists its chats.** With a second partner, a
  computer (the Mac, the web from 700; D541: from 700 to 999 the slim list) shows **伙伴们 / Your partners** as a column at the
  conversation's left. Each row: the partner's figure in its own clay; its name; the last thing said
  in its conversation (the person's own words as **你：{text} / You: {text}**; nothing said yet:
  **管：{about} / Looks after: {about}**, else **还没聊过 / Nothing said yet**); and on the figure's
  shoulder, when something of its own waits on the person, that number in the needs-you colours.
  The one shown sits on the surface (the clay card's ledge). A click shows its conversation. D517:
  names and last lines from 1200 points on the Mac and 1360 on the web (On hand stands beside
  there); under that each figure keeps its name under it (88 points), never a bare face, and no row
  has a tooltip. On the Mac the column holds the window's traffic lights; it is the conversation's
  only (On hand and an opened task are the person's, not a partner's).
- **Alive and still (D517).** The list never moves on a switch (its numbers are held until the new
  welcome): the chosen pebble glides to the row picked on a spring and the chosen figure stands a
  touch taller; the conversation changes in place, at once (D541). Each figure breathes and blinks in its own clay, out
  of step with the others, and hops once when something new comes from it (never the one shown).
  The number is a clay pebble in the needs-you colours on its ledge. Reduce Motion stills it all.
- **The number is the person's one count's (D517).** A row's number is that partner's part of what
  On hand lists under 等你: its questions, and its tasks that ask, stopped, didn't work out or have
  a PR ready to merge (until opened on that device). The rows add up to the Dock badge and On
  hand's head; each item is under 等你 with its fix.
- **Thin or hidden (D545).** Beside the conversation (not on a phone), the bar's first control
  narrows the list to its faces and their numbers, hides it, and brings it back; each device
  remembers it. Hidden, the other partners' faces stay in the bar with what waits in them, and a
  press brings the list back; nothing waiting is lost.
- **On a phone the list is the level above the conversation.** The app opens on the conversation
  last shown. The bar's left has **‹** and the other partners' own figures, a small stack in their
  clays (D541: a lone ‹ read as "back"), with the number of what waits in them (label
  **所有伙伴，别处有 {n} 个等你 / All your partners, {n} need you elsewhere**); a tap or the
  leading-edge swipe goes up to the list, a row goes back down into that partner's conversation.
  Rows are a thumb tall (76); the list's bar has the places; with fewer than four, **再加一个伙伴 /
  Add a partner** sits at its foot. `#partners` opens it.
- **The bar speaks for the shown partner only**: its figure, name and counts line; no other partner
  sits in it.
- **Keys and words.** ⌥⌘1–⌥⌘4 show the first to fourth partner in Settings' order (the default
  first), on the Mac and the web; 键盘 / Keyboard lists them (**第 1 到第 4 个伙伴 / The first to
  fourth partner**). ⌘K 找什么都行 / Find anything lists each other partner as a place to go,
  **换到{name} / Switch to {name}**, found by its name.
- **Mostly you still never switch.** Words meant for another partner are passed on (D486); On hand lists
  every partner's asks with its face; a notification about another partner's own question opens
  that partner's conversation (web push `#p=<id>/d=<id>`, the Mac's notice by its id).
- A switch is per device: this Mac can show the home partner while the phone shows the work one.
  It is remembered on the device, survives a reconnect and a relaunch.
- **Instant, as a messaging app switches chats (D541).** The other partner's conversation is there in
  the frame the click lands in, where it was left: its place in the list, its draft, its unsent
  messages. No fade, no rise; the bar's face and name change where they stand; the bar and the
  composer never move and keep the keyboard. Nothing blank, nothing "connecting", On hand untouched.
- Underneath (D541): each conversation a window or page has shown stays held; once connected, each
  other partner's newest 50 events are asked for (`partner_peek`), so one never shown draws at once
  too. A switch is a new hello with `persona` and the cursor of what is held: the home sends only
  what is newer, and frames of the conversation left still on the way are dropped until its welcome.
  What is the person's (On hand, tasks, devices, settings) is never swapped. A partner never shown
  on a home before D541 waits for its welcome, with nothing of another's painted.

## Meeting a partner (D497)

A partner's empty conversation is its first meeting with the person (a partner the person made but
never talked to). It greets as **晚上好，我是{name}。/ Good evening, I'm {name}.**, says what it looks
after in the person's own words and that it never sees the others' conversations: **我管{about}。跟
{default}说的我看不到，你跟我说的只在这儿。/ I look after {about}. I can't see what you tell
{default}; what you tell me stays here.** (without an about: **跟{default}说的我看不到，你跟我说的只在
这儿。说一句就行。/ I can't see what you tell {default}; what you tell me stays here. Just say the
word.**). Its starters come from real things only: its own task in progress, then everyday examples
that fit any part of life, and **你能帮我做些什么？举三个例子 / What can you do for me? Give me three
examples** (never the default's code or mail starters, never a sentence made by pasting the person's
words into a frame, principle 21). Built on the home from names only, no model (`partnerScreen`,
core/src/first-screen.ts). Starters the partner writes itself when it is made or changed are owed
(todo).

## Switching between partners: the analysis behind D513

**Who, in this moment.** The heavy developer with four (Ducter for work, 小家 for home, 多比 for
reading and running, 小新 for bills) at the Mac at night: which of them wants something, and what
was each last about? The consumer with two, one-handed on the phone on the way home. The fresh user
with one, who must see nothing new.

**Before (D497's pills).** The bar held the shown partner and a pill per other one. With four, the
three pills crowded the counts line; on a phone they shrank to faces and slid under the update
button, their numbers clipped. Who needed the person was a row of small numbers beside the one they
were talking to, and nothing said what each was last about.

**After.** 好用: every partner in one glance, with its own number and its last line, the shape every
messaging app has taught. 放心: nothing waits unseen behind a tap; the numbers add up to the one count
on the badge. 顺滑: a tap in; ‹ or the edge swipe back on a phone. With one partner: nothing at all.

**How it starts.** The moment a second partner is made (by words, or Settings' form), the list
appears with both: on a computer the column slides in at the conversation's left; on a phone ‹
appears in the bar. The partner's one line says where it is. No hint card, no tour.

**Shapes weighed** (each scored 1 to 5 on the five tests; 25 is best):

| Shape | Scale 1–4 | Who needs you, at a glance | One hand on a phone | Nothing new with one | The per-person aggregate | Total |
|---|---|---|---|---|---|---|
| **A list, as a messaging app's chats (chosen):** a column on a computer, the level above the conversation on a phone | 5: four rows, room for more | 5: each row its number, its last line | 4: ‹ and the edge swipe; rows a thumb tall in the top half | 5: no column, no ‹ | 5: rows add up to the one count; On hand stays one board | 24 |
| Bottom tabs on a phone, one per partner (and tabs on a computer) | 3: four tabs leave names cut | 4: a number per tab | 5: under the thumb | 4: the bar appears with the second partner and takes 56 points from every conversation forever | 4 | 20 |
| A menu under the shown name, with one dot for the others | 4 | 2: behind a tap; the dot says "someone", not who | 2: at the top | 5 | 4 | 17 |
| Pills in the bar (D497) | 2: three pills crowd the counts; faces only on a phone | 3: small numbers beside the shown one | 2: at the top, 32-point targets | 5 | 3: the bar's numbers sum, but split across two places | 15 |
| Swipe between conversations (pages with dots) | 3 | 1: invisible until swiped | 4 | 4 | 3 | 12 |

The list costs width on a computer (80 to 272 points; below 1360 it keeps only the figures and the
numbers) and puts the others one tap away on a phone instead of in view. **Not taken:** the list as
the phone's first screen on every open (WhatsApp's): an extra tap each time for the person who is
mostly in one conversation; the app opens where they were, as iMessage does. A single group
conversation stays out for D497's reason (it breaks isolation).

## Several partners: the analysis behind D497

**Who, in this moment.** The heavy developer with a work partner and a home partner opens the Mac
at night: they want to know at a glance who they are talking to and whether the other one needs
them. The consumer who made 多比 for the kids' things wants it to feel like a second friend, not a
second tab. The fresh user never sees any of it.

**Before (D309's switch).** Both partners were the same orange figure; the only difference was a
pale disc behind the face (sand and apricot nearly the same). The others were 28-point faces after
the counts line, their names only in a tooltip. The counts under the shown name were the person's
total, so 「2 个等你」 under 多比 were Ducter's. Naive raters: the stone read as "the same helper,
maybe another instance" (2 of 3), nobody could say whose the waiting things were.

**What they feel after.** 放心: who they are talking to is obvious from across the room (the figure's
own clay), and every partner's asks are visible without switching. 惊喜: a new partner meets them as
itself, in its own colour, says what it looks after and that it keeps their words to itself. 好用:
a click, a key or a word; mostly none, since asks come to them (On hand, notifications, passing on).

**Shapes considered** (first principles: one person, several partners, attention is the person's):

| Shape | For | Against | Verdict |
|---|---|---|---|
| A single group conversation with every partner in it | one place to read | breaks isolation (D24, each partner's context and memory its own); who answers becomes a routing puzzle in front of the person; a chief by another name | no |
| A sidebar list of partners (a chat app's contact list) | familiar, scales | a whole column for two to four partners, on every screen, for something rarely done; the conversation loses width on the 13" Mac and is impossible on the phone | no (D497); taken by D513 once there are several |
| Switch only by intent (say "ask 小家…", never a switch) | zero chrome | the person can't see or read the other conversation; passing on (D486) already covers intent | kept as the main path, not the only one |
| Faces in the bar (chosen) | always in view, costs one line already there, legible by face and name, carries each one's own number | grows with the count: capped at four partners | yes (D497); superseded by D513 |
| Swipe between conversations on the phone | quick | collides with the system back swipe and the bubbles' own swipe to reply; invisible | no (later only if asked) |

**Distinctness.** Run through the metaphor process (research/215): six candidates and "no
metaphor", mapping tables with their false implications, a rubric, and naive-rater LLM proxies on
rendered bars. The same clay figure in its own clay colour plus its name won: raters read the
recoloured figures as different helpers 3 of 3 (the stone 1 of 3, the name alone 0 of 3, an
initial on a pebble 0 of 3, an accessory 0 of 3: read as one helper in two roles).

## Naming and look

- A name is the partner's only label: trimmed, at most 24 characters, unique among the home's
  partners (case-insensitive). The default partner keeps its name in persona.json (Settings ›
  伙伴's rename); the others in partners.json.
- **Look (D497, research/215).** Each partner is the same clay figure in its own clay: a look
  recolours the art (a hue turn then a saturation, `LOOK_CLAY` in protocol/partners.ts, CSS
  `--clay` on the web, `theme.LookClay` on the Mac: the same sRGB matrices). The default's `sand` is
  the art as drawn (the orange Pebble clay); `sage` green, `sky` blue, `plum` purple, `apricot` a
  coral (its id kept). Every state of the figure (idle, working, waiting, needs you, done, napping,
  the blink) is recoloured alike, so the figure keeps its life (D77). The page's own figure is the
  shown partner's; a mark elsewhere (the list of partners, On hand's rows, cards and asks, an opened
  task's mark and its rail, a wait's figure, passed words, Settings) is its partner's (D546). Words for the colours: **陶土 / Clay**, **青苔 / Sage**, **天蓝 / Sky**,
  **梅子 / Plum**, **珊瑚 / Coral**, and (D565) **奶黄 / Butter**; the picker shows the partner's
  own figure in each. D309's stone (the face on a pale disc) is retired.
- Looks are tokens, never colours. A new partner gets its figure's own colour, else the first look
  nobody has.

## Figures (D565, research/228, research/230)

**Who, and what they feel.** The consumer making a second partner for the family: before, "the new
one is my partner in green", a skin; after, "this is 小云, the soft one", a someone, and at a 24-point
task mark, "that one's 小云's". The heavy developer with a work and a home partner tells them apart
across the room. The fresh user never meets any of it: one partner is the pebble, as always.
Value: 惊喜 at the meeting, 赏心悦目 in the lineup, 放心 because a shape never changes what a partner
can do or what its states mean.

- **Six figures, one clay family.** **小石子 / Pebble** (the default's, the figure Ducter always had),
  **包子 / Bun**, **芽芽 / Sprout**, **云朵 / Cloud**, **方糖 / Cube**, **豆豆 / Bean**. One construction
  (the clay, the top-left light, the blush, the small smile, the nubby feet and stubby arms, the
  sky-blue notebook); the outline is each one's own, the eyes second, the colour third. Our
  signature is clay, not plush: the material and its craft are what set the cast apart.
- **The states are everyone's, drawn to one face spec** (Pebble's): idle looks out; working glances
  at the open notebook; waiting sits on the bench shading its eyes; needs you raises **small, level,
  arched brows** (never slanted) and holds the flag still; done is **^ ^** hugging the notebook;
  napping is a **closed arc** under the knitted wrap; the blink closes the eyes. Generated faces
  drift, so every figure's six poses were checked against this spec and re-rendered until they held.
- **How each carries itself** (a manner, never a skill): 稳稳的，暖暖的 / Steady and warm; 软乎乎，
  热乎乎 / Soft and cosy; 好奇，有朝气 / Curious and fresh; 慢悠悠，不慌不忙 / Easy and unhurried; 方方
  正正，有条不紊 / Neat and orderly; 安安静静，好脾气 / Quiet and easygoing. Every figure can do the
  same things, and the meeting says so.
- **Shape and colour are chosen apart.** A partner has a `figure` beside its `look` (partners.json,
  `PartnerInfo.figure`; absent is the pebble). Each figure has a suggested colour (`FIGURE_LOOK`:
  pebble sand, bun butter, sprout coral, cloud sky, cube plum, bean sage). A new partner arrives as
  the first figure nobody has, in its own colour unless another partner has it, by words or by the
  form. The default and every partner made before D565 stay the pebble. A client that doesn't know a
  figure draws the pebble, in the partner's colour. With one partner the figure is the art as drawn,
  as its colour is (D497).
- **Where it shows:** everywhere the partner's figure showed (D497, D546): the list of partners, the
  bar, the page's own figure, the opened task's mark and its rail, On hand's rows and cards, a
  wait's figure, a goal's worker, passed words, Settings. Each in the pose its state asks for, on the
  Mac and the web alike. The sprout's leaves stay green in every colour: on the Mac a second layer
  laid back over after the colour turn, on the web frames ready in each colour.
- **The meeting** (Settings' 再加一个伙伴 / Add a partner): the form opens on the six standing on the
  paper, breathing and blinking out of step, the suggested one raised; a tap hops it forward, its name
  and its manner beneath. Picking a figure brings its colour along until the person picks a colour
  themselves. On 加上 / Add the one met walks into its own conversation, in from the side with two
  small steps, and greets the person there by the name they gave it (its first screen, D497). Reduce
  Motion: no breath, blink, hop or walk; the chosen one still stands raised.
- **Changing later:** Settings › 伙伴, each partner's row, a 3 × 2 picker above its colours, each
  figure shown in that partner's colour; free, at once, any time. The partner answers in its new
  shape: its small figure where the said line's pebble pops, and **好，我现在是{figure}了，还是我。/
  There: I'm {figure} now. Still me.** (settings.md, D296).
- **Not taken** (research/230): the star (reads as a rating, and its big eyes turn every state into
  alarm), the drop (a tear or a flame, and the pebble's eyes), any animal (a species and a pet).
  Chat apps' icons (Slack's face, D531) stay the pebble in the partner's colour (todo).
- At most four partners on a home (the default and three).

## Partners know each other, and hand over (D486)

- **What it looks after.** Each partner has one line in the person's words (at most 120 characters):
  asked when it is made, shown under its name in Settings (**管：{about} / Looks after: {about}**),
  changed there (**改一下 / Change**) or by talking. It is in that partner's own L1.
- **The `[partners]` line.** While there is more than one partner, every partner's turn carries who
  it is and the others: their names, what each looks after, how many of their own questions wait.
  Never their conversations, tasks or memory. So a partner can say "that's 小家's, want me to pass
  it on?" without having seen anything of 小家's.
- **The partner tool.** `make` (the person asked for one), `pass` (words the person means for another
  partner, by name or by asking to tell it), `set` (rename one, change what it looks after). The
  model judges whose a request is; code guards four at most, unique names, never to itself.
  Removing is Settings' only (two taps).
- **Passed words** land in the other partner's conversation as the person's (`user_msg.passed`),
  with a small line over the bubble: **{name} 转过来的 / Passed on by {name}** (a tap shows that
  partner). That partner wakes and answers there; the one that passed them says one line and never
  claims the answer.
- **Removing.** **移除 / Remove** on its row asks **移除{name}？ / Remove {name}?**, with **它的对话会
  留着，它的任务交给{default}。/ Its conversation is kept, and {default} takes over its tasks.** Its
  session ends; its conversation stays in the Log; its tasks and routines are the default's; a
  device showing it shows the default's; its id is never given again. The default can't be removed.
- **The same world.** A second partner's `[devices]` line has the home's agents, the code on each
  computer and the agents' limits, as the default's does.

## What's built

On every home (`DUCTER_PARTNERS=off` turns it off; `startCore({ partners })` in tests,
`DEMO_PARTNERS=1` in the demo). Built:

- Protocol: `partners.ts` (looks, `channelOf`, `partnerOfStream`, names, `needsAcross`), frames
  `partners`, `partner_add`, `partner_set`; `hello.persona` picks the conversation.
- Core: `partners.ts` (partners.json, add, rename, look, each conversation's own open questions);
  ws shows each socket one conversation and sends another's never; a user message to a second
  partner lands in its own stream; the default partner is never woken by another's conversation;
  push names whose with more than one partner.
- Web (wide and phone) and Mac: D497's recoloured figure; D513's list of partners (a column at the
  conversation's left, slim from 1000 to 1359; on a phone the level above the conversation with ‹),
  each row's last line from the partners frame (`PartnerInfo.last`); ⌥⌘1–⌥⌘4 and Find anything, the
  bar's line by whose, the first meeting, Settings › 伙伴's 伙伴们 (list, look, add, change, remove;
  D513: each row three lines, so a phone never squeezes the words).
  The Mac's menu bar lists the other partners with something waiting; its notice names whose.

## What each thinks with (D536)

**Who, in this moment.** The heavy developer whose work partner is on Codex and who wants the growth
partner, 小玛, on Claude Code Opus: another strength and another account's limit. The consumer who
wants the kids' partner on a faster, cheaper model. The fresh user with one partner, who sees nothing new.

**One default, an optional own.** Settings › 伙伴's card titled **默认用什么想事情 / What partners
think with by default** (with one partner it stays **想事情用 / What I think with**) is Settings.brain:
the default partner's and every partner's that has none of its own. Under each partner's name in
伙伴们 a line says what it thinks with: its agent's coin, **想事情用 {agent} / Thinks with {agent}**,
its model and **思考：{level} / Effort: {level}**, each its own fact; the default's row adds **默认 /
The default**; one that follows says **想事情跟 {default} 一样 / Thinks with the same as {default}**.
**改一下 / Change** on another partner shows **想事情用 / Thinks with** (**跟 {default} 一样 / Same as
{default}**, or each agent the home can think with), **用哪个模型 / Which model** and **思考深度 /
Effort** (**默认 / Default** first), applied at once as a colour is. Kept in partners.json
(`PartnerInfo.brain`); the default's own is never there.

**What runs on it.** Its conversation, its memory digests and its holds (D435, seen from its own agent:
another agent answers while its own is held). Core's own work for the person (triage, the bar, quick
web looks) stays on the default's. D503's reserve keeps every agent a partner thinks with. Its tasks
still start by New tasks start (D510) and the rules, never by its own brain.

**By words.** 「小玛用 Opus」 said to any partner is `brain_switch` with that partner's name; said to
itself, its own; 「跟 Ducter 一样就行」 is `same`. The `[partners]` line says what this partner thinks
with and whose setting it is, and what the others think with of their own.

## A second partner answers (D312)

Built:

- **Its own session.** The same partner code on its own view of core (`core/src/partner-view.ts`):
  `channel` and `partner` are its `channel:<id>` and `partner:<id>`; it sees only its own tasks,
  conversation, waits and routines; its session state is in `<dataDir>/partners/<id>`; its digests
  are in the one spine table under ids of its own; its activity shows only where it is shown. It
  starts on its first message (at boot when it ran before) and parks itself when idle.
- **Its own words.** Its L1 identity says its name and that the person has other partners whose
  conversations it never sees (`otherIdentity`, core/src/persona.ts).
- **Routing.** Core keeps writing to `channel`; with more than one partner the Log's append sends a
  write that belongs to another partner to its conversation: by the task it is about (its card's
  persona), by a question, wait, call, routine or note first seen in that partner's conversation,
  or because core is handling that partner's tool call (`actAs`). An answer lands beside its
  question; triggers wake the partner they belong to. Proactive notes, the first words, Bridge and
  the home's own questions stay the default's. Chat apps carry every partner in one thread (D516,
  below).
- **Tasks and routines carry their partner** from creation (a New task or a routine made in its
  conversation too); a routine's runs are its tasks; a task's brief names its partner, its
  `memory_search` is its partner's, and it runs as its partner's Mem identity.
- **One MCP hub, a partner role per partner** (`partner:<id>` token); log and task reads keep to
  the caller's own.
- **Its own Mem identity** (`ducter-<id>`), bound once Mem answers with memory on, in its own
  folder; until then it neither recalls nor saves.
- **On hand** shows whose (above).

## In chat apps (D516)

One thread per chat app carries every partner (`channels.md` §10). The bot, WeChat's ClawBot and
the partner's own Apple ID are the default's; another partner's words there lead with its name,
**小家：… / Home: …**. The person's words go to the partner whose message they reply to, else the one
named at their start (**小家，…**), else the one they are talking with there now (15 minutes),
else the default; the first time another partner speaks in a chat app, one line says how to talk
to it there. Every partner's asks and results reach the person's one place, with whose they are;
the needs-you count stays the person's. iMessage, for now, speaks for the partner the Mac shows,
with its name when it isn't the default. Why one thread and not a bot per partner: WeChat and
iMessage have one identity, and a bot per partner on Telegram is an upgrade for the few (owed).

## What's left

1. **Bridge per partner.** Bridge stays the default's connection. D494: a standing address other agents
   hand work to is a helper (`bridge.md` "Helpers"), not a partner; a helper made in another partner's
   conversation keeps that partner (its tasks are its), its mail still read by the one home.
2. **Forgetting and correcting** a second partner's memories from Settings (today the default's).
3. **Per-partner settings.** How it talks, memory on or off, which accounts it may use (what it thinks
   with is its own since D536). A task default per partner (its tasks on its own agent): later, when asked.
4. **A bot of its own per partner** (D516 (7)): a Telegram bot or Slack app bound to a chosen
   partner, its own contact in the chat app's list; and iMessage on its own connection, so it
   follows the one-thread rules instead of the partner the Mac shows.
5. **The CLI** talks to the default partner only.
6. **iPhone and Android shells** show the web client, so they inherit it; not checked on a device.
7. **Human raters** for D497's recoloured figure and D565's six figures (the LLM proxies are done,
   research/215, research/230), and a person's copyright check of the cast.
8. **A live run** with two real partner sessions on one home.
