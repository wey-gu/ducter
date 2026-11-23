# A second partner (伙伴们 / Your partners)

D309, D312, D486, D497. Scenario A5. How more than one partner lives on one home: who wants it, what is shared and
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
tool, D486), and the reply says it is beside the name. Or Settings › 伙伴, one row: **再加一个
伙伴 / Add a partner**, with one line of help (one for work and one for home, or one per person). The
form asks three things: a name, **它管什么 / What it looks after** (optional, the person's words) and a
colour (D24: creating one is light). Settings' foot, with one partner, says it can be asked for in
words. Afterwards the bar shows the new partner beside the name (its face in its own clay and its name); one click shows its
conversation.

## Shared and isolated

| Thing | Shared by every partner | Each partner's own |
|---|---|---|
| Log | one database | its conversation: the default's is `channel`, another's `channel:<id>` (task streams are the tasks') |
| Conversation | | yes: its words, questions, replies; another partner never reads them (isolated by default, D24) |
| Memory (Mem) | the person's own profile in the one Mem (every partner's L1 reads it) | its own Mem identity (D18, D141); a second partner's is `ducter-<id>`, bound once Mem answers (D312), its bundle (profile and its own rules) read into its L1 at its session's start (D486) |
| Tasks, routines | listed together in On hand | owned by the partner that opened them (D31: `card.persona`) |
| Devices, projects, places | yes (D31) | |
| Accounts (connections), keys, subscriptions | yes: they are the person's | which accounts a partner may use: later (below) |
| Settings | notifications, quiet hours, look and sound, devices | its name, look, what it looks after (D486); later its own talk and memory switches |
| Chat apps (Telegram, Slack, iMessage) | | the default partner only, for now |
| Notifications | one stream, one quiet hours | each says whose it is |

**Privacy between partners.** A partner sees only its own conversation and its own memories. No
partner can read another's Log stream: core never wakes one partner for another's words, and a
client socket receives only the conversation it shows (the other partners arrive as counts, never
words). Linking two partners (one may ask the other) stays a later, explicit act (product-model
§8). Honest limit: the person who owns the home can open any partner; partners are not accounts.
A family that needs privacy from each other needs separate homes.

## Attention is the person's

- **One count, where the person is counted (D497).** The Dock badge, the menu bar's mark and On
  hand say one number across partners: On hand's needs-you cards (every partner's tasks) plus every
  partner's own questions (`needsAcross`, protocol). **The bar says it by whose.** The counts line
  sits under a partner's name, so it speaks for that partner (its own tasks and its conversation's
  questions); each other partner's face beside it carries the number of what of its own waits on
  the person. The bar's numbers add up to the person's one count. (D309 put the one count under
  the shown partner's name: every naive rater read it as that partner's.)
- **One On hand.** On hand stays one board for the person, never one per partner (D24). Each
  row and card carries its partner's small face in its own clay once there is more than one, and another
  partner's own questions are listed under 等你 / Needs you as **{name} 问你 / {name} asks you**
  with the question; a click shows that partner, where it is answered (D312).
- **Whose it is, said where it matters.** A push names the partner when there is more than one:
  a task's title reads **小家：约牙医 / Home: Book the dentist**; a partner's own question carries
  its name as the title. The menu bar lists each other partner with something waiting:
  **换到小家，有 1 个等你 / Switch to Home, 1 need you**, a click shows its conversation. The Mac's
  needs-you notice names the partner whose questions wait.

## Switching (zero concepts, D497)

- **Every other partner is in view, by face and name.** With a second partner, the bar's left keeps
  the shown partner (its figure in its own clay, its name, its counts line); right after it sit the
  others, each a small pill: its face in its own clay, its name, and, when something of its own
  waits on the person, that number in the needs-you colours. Hover (the title on the web) says
  **换到{name}，有 {n} 个等你 / Switch to {name}, {n} need you** and **管：{about} / Looks after:
  {about}**. A click shows its conversation. On a phone the pill keeps the face and the number; the
  name is its accessible label (room for four in 390).
- **Keys and words.** ⌥⌘1–⌥⌘4 show the first to fourth partner in Settings' order (the default
  first), on the Mac and the web; 键盘 / Keyboard lists them (**第 1 到第 4 个伙伴 / The first to
  fourth partner**). ⌘K 找什么都行 / Find anything lists each other partner as a place to go,
  **换到{name} / Switch to {name}**, found by its name.
- **Mostly you never switch.** Words meant for another partner are passed on (D486); On hand lists
  every partner's asks with its face; a notification about another partner's own question opens
  that partner's conversation (web push `#p=<id>/d=<id>`, the Mac's notice by its id).
- A switch is per device: this Mac can show the home partner while the phone shows the work one.
  It is remembered on the device, survives a reconnect and a relaunch.
- Underneath: a switch is a new hello with `persona`; the socket then shows that conversation
  (as its `channel`), and the client starts over on it (no glance of another partner is painted).

## Meeting a partner (D497)

A partner's empty conversation is its first meeting with the person (a partner the person made but
never talked to). It greets as **晚上好，我是{name}。/ Good evening, I'm {name}.**, says what it looks
after in the person's own words and that it never sees the others' conversations: **我管{about}。跟
{default}说的我看不到，你跟我说的只在这儿。/ I look after {about}. I can't see what you tell
{default}; what you tell me stays here.** (without an about: **跟{default}说的我看不到，你跟我说的只在
这儿。说一句就行。/ I can't see what you tell {default}; what you tell me stays here. Just say the
word.**). Its starters come from its own part: **{about}这边，你能帮我做些什么？/ What can you do for
me with {about}?**, its own task in progress, then everyday examples that fit any part of life
(never the default's code or mail starters). Built on the home from names only, no model
(`partnerScreen`, core/src/first-screen.ts); the person's words are placed as they are, never parsed.

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
| A sidebar list of partners (a chat app's contact list) | familiar, scales | a whole column for two to four partners, on every screen, for something rarely done; the conversation loses width on the 13" Mac and is impossible on the phone | no |
| Switch only by intent (say "ask 小家…", never a switch) | zero chrome | the person can't see or read the other conversation; passing on (D486) already covers intent | kept as the main path, not the only one |
| Faces in the bar (chosen) | always in view, costs one line already there, legible by face and name, carries each one's own number | grows with the count: capped at four partners | yes |
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
  shown partner's; a mark elsewhere (the bar's pills, On hand's cards and asks, passed words,
  Settings) is its partner's. Words for the colours: **陶土 / Clay**, **青苔 / Sage**, **天蓝 / Sky**,
  **梅子 / Plum**, **珊瑚 / Coral**; the picker shows the figure in each. D309's stone (the face on a
  pale disc) is retired. A clay character per partner stays the later upgrade, owed through the
  metaphor process with real art (todo).
- Looks are tokens, never colours. A new partner gets the first look nobody has.
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
- Web (wide and phone) and Mac: D497's recoloured figure, the other partners' pills in the bar
  (face, name, their own number), ⌥⌘1–⌥⌘4 and Find anything, the bar's line by whose, the first
  meeting, Settings › 伙伴's 伙伴们 (list, look, add, change, remove).
  The Mac's menu bar lists the other partners with something waiting; its notice names whose.

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
  question; triggers wake the partner they belong to. Proactive notes, the first words, chat apps,
  Bridge and the home's own questions stay the default's.
- **Tasks and routines carry their partner** from creation (a New task or a routine made in its
  conversation too); a routine's runs are its tasks; a task's brief names its partner, its
  `memory_search` is its partner's, and it runs as its partner's Mem identity.
- **One MCP hub, a partner role per partner** (`partner:<id>` token); log and task reads keep to
  the caller's own.
- **Its own Mem identity** (`ducter-<id>`), bound once Mem answers with memory on, in its own
  folder; until then it neither recalls nor saves.
- **On hand** shows whose (above).

## What's left

1. **Bridge per partner.** Bridge stays the default's connection. D494: a standing address other agents
   hand work to is a helper (`bridge.md` "Helpers"), not a partner; a helper made in another partner's
   conversation keeps that partner (its tasks are its), its mail still read by the one home.
2. **Forgetting and correcting** a second partner's memories from Settings (today the default's).
3. **Per-partner settings.** How it talks, memory on or off, which accounts it may use.
4. **Chat apps per partner.** A Telegram bot or Slack app bound to a chosen partner.
5. **The CLI** talks to the default partner only.
6. **iPhone and Android shells** show the web client, so they inherit it; not checked on a device.
7. **Human raters** for D497's recoloured figure (the LLM proxies are done, research/215); the
   clay-character upgrade (a new figure per partner) through the metaphor process.
8. **A live run** with two real partner sessions on one home.
