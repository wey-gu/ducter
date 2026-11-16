# A second partner (伙伴们 / Your partners)

D309. Scenario A5. How more than one partner lives on one home: who wants it, what is shared and
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

**How it starts.** Settings › 伙伴, one row: **再加一个伙伴 / Add a partner**, with one line of
help (one for work and one for home, or one per person). The form asks two things: a name and
a colour. Nothing else (D24: creating one is light). Afterwards the bar shows the new partner's
stone beside the name; one click shows its conversation.

## Shared and isolated

| Thing | Shared by every partner | Each partner's own |
|---|---|---|
| Log | one database | its conversation: the default's is `channel`, another's `channel:<id>` (task streams are the tasks') |
| Conversation | | yes: its words, questions, replies; another partner never reads them (isolated by default, D24) |
| Memory (Mem) | | its own Mem identity (D18, D141); a second partner binds its own (not built yet, below) |
| Tasks, routines | listed together in On hand | owned by the partner that opened them (D31: `card.persona`) |
| Devices, projects, places | yes (D31) | |
| Accounts (connections), keys, subscriptions | yes: they are the person's | which accounts a partner may use: later (below) |
| Settings | notifications, quiet hours, look and sound, devices | its name, look; later its own talk and memory switches |
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
  card carries its partner's stone once there is more than one (later, below).
- **Whose it is, said where it matters.** A push names the partner when there is more than one:
  a task's title reads **小家：约牙医 / Home: Book the dentist**; a partner's own question carries
  its name as the title. The menu bar lists each other partner with something waiting:
  **换到小家，有 1 件等你 / Switch to Home, 1 need you**, a click shows its conversation. The Mac's
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

## What's built (the first slice, a preview)

Behind `DUCTER_PARTNERS=preview` on the home (off by default; `startCore({ partners })` in tests,
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

## What's left

1. **A second partner answers.** No partner session runs for a second partner yet: its
   conversation is kept and shown, but nobody replies (the Settings section says so). Needs: one
   partner session per persona (createPartner on a persona-scoped core view: its own `channel:<id>`
   and `partner:<id>` streams), the MCP hub's partner role per persona (today one `partner` role,
   one URL), and every core module that writes to `channel` for a task (decisions, living,
   closing, waiters, routines, phone, calendar, connections, about 36 appends) writing to the
   task's own partner's conversation (`channelOf(card.persona)`).
2. **Its own Mem identity.** Bind a Mem identity per partner (D141) and pass it on its tasks
   (NMEM_AGENT_ID); today only the default is bound.
3. **On hand shows whose.** Each card carries its partner's stone with more than one partner;
   another partner's own questions listed in On hand (today only counted).
4. **Per-partner settings.** How it talks, memory on or off, which accounts it may use.
5. **Chat apps per partner.** A Telegram bot or Slack app bound to a chosen partner.
6. **Removing a partner**, and what happens to its conversation and tasks (kept in the Log; its
   tasks move to the default).
7. **The Mac renames another partner** (the web does; the Mac renames only the default).
8. **iPhone and Android shells**: they show the web client, so they inherit it; not checked on a
   device.
9. **Linking partners** (one may ask another): product-model §8.
10. **Comprehension test of the stone** with naive raters; the clay-character upgrade.
11. **Persona text.** A second partner's L1 identity (its own name in DEFAULT_IDENTITY) and the
    partner eval for it (D175) come with item 1.
