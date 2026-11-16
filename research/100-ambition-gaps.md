# 100 · Ambition gaps: what Ducter promises and has not done yet

Date: 2026-11-17. A read of Ducter's own promises (`motivation.md`, `design/principles.md`,
`design/product-model.md` §6, `design/roadmap.md`, `design/scenarios.md`, `design/todo.md`,
`design/decisions.md` D250–D290, `docs/faq.md`) against the bar that current open-source and
consumer personal-AI products set for the first hour. Outside products are described only as
general lessons. Tags: VERIFIED = read in Ducter's docs or code; INFERRED = judgment.

## 1. Where Ducter already leads

- Proactive life help: accounts read quietly, the morning note, aha finds, what you said coming
  back (K6–K16, D243, D281; replayed days 7/7 and 8/8 with fakes). VERIFIED (docs), with fakes only.
- One memory across every tool (Nowledge Mem), a sessionless partner, attention as the scarce
  resource (principles 1–7). VERIFIED.
- Real-world errands behind Go: computer use, phone use, phone calls, Autofill, calendar writes
  (B6–B13, G6, K12). VERIFIED (docs), mostly with fakes.

## 2. Gaps, by the moment they hurt

| # | Gap | The moment | Evidence in Ducter | Lesson from the field |
|---|---|---|---|---|
| 1 | The partner's first words are an empty state | Minute one, every user | `todo.md` "Mac app and first run": "the greeting is the client's empty state today, not a Log message, and the partner knows no repos at first run"; `onboarding.md` step 4 promises context-rich first words | The first screen should already know something true about you |
| 2 | No way in without a Claude or ChatGPT plan, short of a terminal | Minute one, the consumer | `docs/faq.md`: "Typing a DeepSeek key into Devices is coming soon; until then it goes in the key file"; `onboarding.md` "An API key is the fallback path" | Accept any key, recognize the provider from it, check it with one cheap call |
| 3 | A usage limit stops a task and nothing happens | Overnight, the heavy developer | `scenarios.md` A4 "quota —"; D288 shows limits but doesn't act; principle 13 promises handoff "when quota … demands it"; `product-model.md` §5 "the reserve and limit-based picking are on the roadmap" | Wait for the reset and continue by itself, with "continues at {time} · Cancel" |
| 4 | Earlier sessions in the person's own AI agents don't come along | First hour, the heavy developer | `motivation.md` reason 1 (the old workbench is closing); `onboarding.md` "Conductor import" idea; D45 "adopt running sessions: not in v1"; roadmap "Not planned: taking over sessions you started outside" | Import finished sessions read-only, off by default, and continue them on request |
| 5 | Answers are text only | Daily, the consumer | `motivation.md` "world-class generative UI", "You can make your own apps"; roadmap "Your own small apps: Later" | A small block vocabulary (table, chart, checklist, choices) the model lays out and the theme colours |
| 6 | No voice with the partner | Daily, the consumer | `scenarios.md` H2 "—"; roadmap "Voice: Later"; a realtime voice loop exists for phone calls (D218) | Hold to talk and read aloud first; a full call later |
| 7 | No chat window for Chinese users | Daily, the consumer in China | D276 ships two chat apps, one blocked in mainland China (research/79); research/79 names the one safe official route | Meet people in the chat app they already live in |
| 8 | No record of what Ducter did | When trust is tested | `scenarios.md` G5 "What did Ducter do today" "—", G6, G7 "—"; principle 18 "effects are logged as intents" | One calm page: sent, paid, changed, read, with undo where it exists |
| 9 | Ambient presence ends at the menu bar | Away from the screen | K4 menu bar extra; `todo.md` "for iPhone a notification / Live Activity" | Show "working · needs you" where the eye already is, without a ping |
| 10 | Most recent work is unproven live | Every first install | D259–D290: "built with fakes, not yet on a real …"; `todo.md` "Walk a real Claude Code sign-in and a Codex sign-in from the app to the end" | Prove the first hour end to end before adding surface |

## 3. What not to copy

A hosted model service or a cloud account contradicts "no hosted Ducter" (roadmap). The
self-hosted equivalent is a pasted key, local models and the person's own plans. INFERRED.

## Implications for Ducter

Close the first-hour gaps (1, 2, 4) and make limits a non-event (3) before widening surface;
then the delight surfaces (5, 6, 7, 8, 9). Each goes through the change loop: 4 supersedes part of
D45, 5 is a partner-persona change and needs D175's eval, 7 builds on D276's channel client.
Item 10 is the author's step for anything that needs his accounts or devices.

**Summary:** Ducter's lead is proactive help, one memory and attention design. Its gaps are the
first hour (empty first words, no key-only start, past sessions left behind), limits that stop
work, text-only answers, no voice, no chat window for China, no record of what it did, and work
proven only with fakes.
