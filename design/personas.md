# A second partner (伙伴们 / Your partners)

D309, D312, D486. Scenario A5. How more than one partner lives on one home: who wants it, what is shared and
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
  no switch, no stone. The second partner appears only after the person makes one. Value: 好用,
  zero concepts until wanted.

**How it starts.** By talking: 「再给我做一个管家里事的伙伴，叫它小家」 makes it at once (the partner
tool, D486), and the reply says its stone is beside the name. Or Settings › 伙伴, one row: **再加一个
伙伴 / Add a partner**, with one line of help (one for work and one for home, or one per person). The
form asks three things: a name, **它管什么 / What it looks after** (optional, the person's words) and a
colour (D24: creating one is light). Settings' foot, with one partner, says it can be asked for in
words. Afterwards the bar shows the new partner's stone beside the name; one click shows its
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

- **One count.** The bar's 等你 / Needs you is one number across partners: On hand's needs-you
  cards (already every partner's tasks) plus the shown conversation's questions plus every other
  partner's own questions (`needsAcross`, protocol). The Dock badge and the menu bar's mark use
  the same number.
- **One On hand.** On hand stays one board for the person, never one per partner (D24). Each
  row and card carries its partner's small stone once there is more than one, and another
  partner's own questions are listed under 等你 / Needs you as **{name} 问你 / {name} asks you**
  with the question; a click shows that partner, where it is answered (D312).
- **Whose it is, said where it matters.** A push names the partner when there is more than one:
  a task's title reads **小家：约牙医 / Home: Book the dentist**; a partner's own question carries
  its name as the title. The menu bar lists each other partner with something waiting:
  **换到小家，有 1 个等你 / Switch to Home, 1 need you**, a click shows its conversation. The Mac's
  needs-you notice names the partner whose questions wait.

## Switching (zero concepts)

- The conversation bar's face sits on its partner's own **stone** (a clay disc in its colour)
  once there is a second partner. The others sit beside the name as small stones; one with its own
  question waiting carries the accent dot. A click on a stone shows that partner's conversation
  (label: **换到{name} / Switch to {name}**). The same on the Mac, the web wide and the phone.
- A switch is per device: this Mac can show the home partner while the phone shows the work one.
  It is remembered on the device, survives a reconnect and a relaunch.
- Underneath: a switch is a new hello with `persona`; the socket then shows that conversation
  (as its `channel`), and the client starts over on it (no glance of another partner is painted).

## Naming and look

- A name is the partner's only label: trimmed, at most 24 characters, unique among the home's
  partners (case-insensitive). The default partner keeps its name in persona.json (Settings ›
  伙伴's rename); the others in partners.json.
- **Look (metaphor review).** Candidates: (1) no metaphor, the name alone; (2) a recoloured clay
  face; (3) the same face on its own clay **stone**; (4) a different clay character per partner;
  (5) a coloured ring round the face; (6) a per-partner theme. Mapping and false implications:
  (1) none false, but fails "recognisable at a glance" at 28 points; (2) implies a different
  being with different powers, and needs a re-render of every face state per colour; (4) the best
  emotional fit but needs a full art set per character (later); (5) reads as a status ring
  (needs-you, working), a false state; (6) implies another app. Rubric (legibility without labels,
  fidelity, scale to 4, state expressiveness kept, emotional fit, distinctiveness, feasibility):
  the stone wins today: the face keeps every state it has (D77), the colour is a calm token per
  theme, it reads at 28 points, and it is the same clay world. Decided: (3), with (4) as the
  later upgrade. Comprehension testing with naive raters is still owed (below).
- Looks are tokens, never colours: `sand` (the default's Pebble clay), `sage`, `sky`, `plum`,
  `apricot`, each light and dark (web `--look-*`, Mac `Tokens.Looks`). A new partner gets the
  first look nobody has.
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
- Web (wide and phone) and Mac: the stone in the bar, the other partners' stones with the dot,
  the switch, the combined count, Settings › 伙伴's 伙伴们 (list, look, add; rename on the web).
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

1. **Bridge per partner.** Bridge stays the default's connection.
2. **Forgetting and correcting** a second partner's memories from Settings (today the default's).
3. **Per-partner settings.** How it talks, memory on or off, which accounts it may use.
4. **Chat apps per partner.** A Telegram bot or Slack app bound to a chosen partner.
5. **The CLI** talks to the default partner only.
6. **iPhone and Android shells** show the web client, so they inherit it; not checked on a device.
7. **Comprehension test of the stone** with naive raters; the clay-character upgrade.
8. **A live run** with two real partner sessions on one home.
