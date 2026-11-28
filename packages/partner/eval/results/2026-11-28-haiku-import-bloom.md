# Partner eval · 2026-11-28 · claude-code · haiku · import-bloom

Pass: **0/1** (0%). Judge: haiku. Persona: 33022 chars (≈10319 tokens).
Tokens (partner): in 155429, out 644, cache read 150270, cache write 5153 → ≈$0.00 at list price; judge $0.001.

## Against 2026-11-28-haiku-import.md

0 scenarios disagreed with it on the first attempt and ran 2 more times.

- Regressions (passed there, failed every attempt here): none
- Fixes (failed there, passed every attempt here): none
- Went both ways (noise, no conclusion): none
- New and failing every attempt: none

| Category | Pass |
|---|---|
| past | 0/1 |

| Scenario | Lang | Result | Runs | Reason |
|---|---|---|---|---|
| past-vague-bloom-en | en | **fail** | 0/1 | task_send ×1 (want none); judge: The rubric requires the partner to look up the tasks, carry neither on, and ask which one the user means, naming both. Instead it picked the hawdb bloom filter task on its own, sent it instructions to continue, and never asked the user to choose between the two. |

## Transcripts

### past-vague-bloom-en

```
--- step 1: user says: pick the bloom filter one from last week back up
  [partner ack line] I'm picking up the hawdb bloom filter task from Nov 22 and trying the blocked bloom variant against the same false-positive baseline. I'll tell you what the numbers show.
  [sent to task bloom_hawdb] The user said: "pick the bloom filter one from last week back up". Carry on the bloom filter false-positive work from where it stopped: the 10 bits per key change took false positives from 2.1% to 0.8%, and the remaining step is the blocked bloom variant. Try it, measure false positives against the same baseline, and report the numbers with evidence. Stay on your own branch; do not merge, push or 
  [also used tools] task_find
```
