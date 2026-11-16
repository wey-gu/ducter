# 99. Languages beyond Chinese and English: detection, the three layers, the guard

Date: 2026-11-16. Feeds **D292**. Trigger: GitHub issue #5 (a Korean user on v0.0.60: with
**Replies in → Follow me**, `안녕하세요. 오늘 어떤 일을 도와줄 수 있나요?` got an English reply,
because the partner injected `[language] The user wrote this in English (not Chinese)` for any
message without a Han character). The author: "我们不能假设除了中文就是英文". Measured before the
change: about 190 hard-coded zh/en branches in 38 TypeScript and 10 Go files, and 240 hits of the
guard pattern below outside tests, demos and the promo video.

## 1. What the code conflated (VERIFIED, from the v0.0.60 source)

One boolean, "is it Chinese", stood for three different things:

| Thing | Who sets it | Before | What it must be |
|---|---|---|---|
| **Conversation language**: what the person writes in and wants replies in | the person's messages, or the reply-language setting | `isChinese(text)` (any Han) else English; the setting `auto \| zh \| en` | any language, a BCP 47 tag; kept through messages that have none |
| **Task/report language**: what a task writes its report, questions and labels in | the partner, from the conversation language | `language?: "zh" \| "en"` on the task, the brief, the result check, cards, pushes | the same tag, end to end |
| **Interface locale**: the app's own words | each client (system language, or the person's first words, D262) | `Lang = "zh" \| "en"`, inline `zh ? … : …` | any tag, resolved to a table through a fallback chain |

The issue's last point is a fourth conflation (VERIFIED in `apps/web/src/onhand.tsx`,
`views.tsx`): the web checked a task's summary against the **interface** language, so a correct
Korean summary under an English interface would be hidden as "not in your language".

## 2. Detection (built: `packages/protocol/src/lang.ts`, Go port `apps/desktop/internal/lang`)

Options considered:

| Option | Accuracy on chat text | Cost | Verdict |
|---|---|---|---|
| Unicode script ranges | exact for scripts that belong to one language (Hangul → ko, kana → ja, Thai, Hebrew, Greek, Georgian…) | none | **first** |
| A tiny stopword + diacritic score inside a script | good for 12 Latin languages on a sentence; weak on 1–2 words | a few hundred words | **second, only inside Latin, Cyrillic, Arabic** |
| Trigram models (CLD3, franc, fastText lid) | better on short Latin text | 1–100 MB, a native or WASM dependency, a Go twin to keep in step | rejected: the conversation already has a memory (the last known language), which covers short text better than any model |
| Ask the model | best | a call per message, and the model already follows the message | rejected for detection; the model is the last line (it reads the message itself) |

The rules, in order (INFERRED design, VERIFIED by `fixtures/lang.json`):

1. **Strip what isn't language**: fenced and inline code, links, e-mail addresses, paths,
   `snake_case`, `camelCase`, dotted names, words with digits, `--flags`. ASCII-only patterns, so a
   Korean or Chinese word beside a path stays.
2. **Count by script.** Han, Hangul and kana by character; alphabets by word.
   Hangul present → Korean (Han in it is Hanja). Kana present → Japanese (Han in it is kanji).
   Han alone → Chinese: Traditional when characters only Traditional writes (們這說對還過麼為…,
   none of them Japanese shinjitai) outnumber Simplified-only ones, else Simplified.
3. **The larger part wins.** A Han/Hangul/kana character counts as one word. `이 PR 리뷰해줘
   please` is Korean; `what does 你好 mean?` is English. A tie goes to the non-Latin part: people
   put English terms into their own language far more often than the reverse.
4. **Inside a script, say how sure.** Hangul and kana are sure. Han alone is sure with a
   Simplified/Traditional marker, two Chinese function characters, or one in four or more
   characters; `好的` and `了解` are not (`了解` is also Japanese). Cyrillic is sure for uk/sr by
   their letters and for ru by ы/э/ё. Arabic is sure for ur/fa by their letters, for ar by ة/ى/ال.
   Latin is sure when the stopword score has a clear leader (two hits, or one in three words or
   fewer: `hola`, `thanks`).
5. **Neutral input has no language**: fewer than three letters (`OK`, `ok!`), numbers, emoji,
   punctuation, a code block, a link.
6. **Resolve against the last known language** (`resolveLanguage`): no language → keep it; sure →
   switch; not sure and the same script → keep it (`好的` after 繁體 stays zh-Hant, `了解` after
   Japanese stays ja, `так` after Ukrainian stays uk); unsure Latin never moves the conversation
   off another script (`npm run build`, `okay` after Korean stay Korean); otherwise switch
   (`好的` after English becomes Chinese).
7. **After a restart** the language is folded again from the Log's last 40 user messages
   (`languageOfTexts`). Nothing extra is stored, so it can't drift from what was said.

**Result check** (`inLanguage`, used by D154's hold-back, the decision card check, and the clients'
`sayable`/`proofLabel`): by script where scripts tell (Chinese = Han without Hangul or kana; Korean =
Hangul; Japanese = kana or Han without Hangul; another alphabet = its own words). A Latin target
needs no CJK and fewer other-alphabet words than Latin ones, and is turned down only when the score
is sure it is **another Latin language the detector knows** (four or more words). An unknown Latin
language (Esperanto, Swahili) is never turned down: skip rather than wrongly hold back.

## 3. The matrix (VERIFIED by tests; `fixtures/lang.json` runs in TypeScript and Go)

| Input | Detected | Then | Where tested |
|---|---|---|---|
| `안녕하세요. 오늘 어떤 일을 도와줄 수 있나요?` | ko, sure | `[language] … Korean (한국어)` | lang.json, partner `languages.test.ts`, eval `greet-ko` |
| `이 PR 리뷰해줘 please` (mixed) | ko | | lang.json, partner |
| `회의록(會議錄) 정리해 줘` (Hanja) | ko | | lang.json |
| `今日の会議のメモをまとめてください` (kana + kanji) | ja | | lang.json, partner, eval `direct-ja` |
| `幫我看一下這個測試為什麼掛了` | zh-Hant | brief: Traditional Chinese (繁體中文) | lang.json, partner, runner |
| `帮我 review 一下这个 PR` | zh | | lang.json |
| `what does 你好 mean?` | en | | lang.json |
| `¿Puedes revisar el informe de hoy?`, `hola` | es | | lang.json, partner, eval `direct-es` |
| French, German, Portuguese, Vietnamese sentences | fr, de, pt, vi | | lang.json |
| `Привет, можешь проверить отчёт?` / Ukrainian with і | ru / uk | | lang.json, partner |
| `مرحبا، هل يمكنك مساعدتي اليوم؟` / Persian / Hebrew / Thai | ar / fa / he / th | web bubble `dir="auto"` | lang.json, partner, web `languages.test.ts` |
| `OK`, `ok!`, `123`, `👍🎉`, a code block, `` `npm run build` ``, a URL, empty | none | keeps the last known | lang.json, partner (incl. after restart), eval `ok-keeps-ko` |
| `deploy now`, `okay` | en, unsure | keeps Spanish/Korean before it | lang.json |

Result check cases include: the task's English sentence is not Korean, not Chinese and not
Spanish; a Korean summary is Korean and not Chinese; Japanese is not Chinese; Russian and Arabic
are not English; an English sentence for an Esperanto reader is let through.

## 4. The interface locale

Tables exist for zh and en only, and only those are offered as the interface language. The engine
no longer cares: a tag resolves through `fallbackChain` (`zh-TW` → zh-Hant → zh → en; `pt-BR` → pt
→ en; `ko` → en), `negotiate(preferred, available)` picks the first preferred language with a
table before English (`["ko", "zh-CN"]` → zh), plurals come from CLDR categories (Intl.PluralRules
on the web, a small CLDR table in Go) with `key.one` / `key.other` keys, numbers and dates through
Intl on the web. Code-made sentences use `{name}` placeholders (`fill`) instead of concatenation;
the existing zh/en tables keep their printf verbs, with positions (`%[2]d`) where word order
differs (the web's `until.lights`).

## 5. What the model needs (INFERRED; checked by the eval)

The partner's system prompt now says "the language of the user's latest message, whatever it is"
and every user turn carries one line naming the language by name and autonym
(`[language] The user wrote this in Korean (한국어): reply in Korean (한국어), including the first
line.`). Before, Chinese got no line and everything else got "English". A line for every language is
needed because the identity or Mem may say the user prefers Chinese (the reason the English line
existed); naming the detected language costs one line and removes the asymmetry. A message with no
language of its own gets "the user writes in X" from the conversation; a first message with none
gets no line (the model reads it). The fixed setting takes any tag: "always reply in Japanese
(日本語)".

## 6. The guard and what is left

`packages/protocol/test/lang-guard.test.ts` scans packages, apps/web/src and apps/desktop (not
tests, demos, eval, fixtures, mock data, the promo video or scripts) for
`[!=]==? ?"(zh|en)"`, `zh ?`, `isZh ?`, `isChinese(`, `userZh(`, `== ZH/EN`, `pick(zh`, `if zh {`,
`zh := `, and fails when a file has more than `lang-guard.allow.json` allows. The allowlist is a
ceiling that only shrinks. See §7 for what is left and why.

## 7. Remaining branches

Guard hits in its scope (non-test product code in `packages/`, `apps/web/src`, `apps/desktop`):
**239 in 67 files before, 4 in 3 files after** (VERIFIED by `git grep` at v0.0.60 and the guard).
What is left, the allowlist:

| File | Hits | Why it stays |
|---|---|---|
| `packages/protocol/src/lang.ts` | 2 | the language core itself: `zh` region → script mapping in `normalizeTag`, and `negotiate` treating English as the last resort |
| `packages/partner/src/words.ts` | 1 | typography of the zh table (zhJoin at placeholders, D78), not a language decision |
| `apps/desktop/internal/views/accounts.go` | 1 | a label column width; the file belonged to the parallel Settings change, left for it |

Outside the guard's scope on purpose: demo seeds (`apps/web/demo*.ts`, the Mac's `internal/mock`),
the promo video (`apps/promo`), scripts and tests: they are fixture data in two languages, not
product logic. `{ zh, en }` records picked with `words()` (calendar change words, proactive drafts,
phone-use package labels) are tables, not branches, and read through the fallback chain.

Two engineering choices made while converting (VERIFIED in tests):

- Web: plurals and number/date formatting follow the **table** that answers, not the requested
  tag, so a Korean interface reading English words says "1 task", not a Korean plural over English
  words; a regional tag of a table language (en-GB, zh-Hant) keeps its own formats.
- Mac: the window's own language seeds detection when it follows the person's first words, so
  `准备 App Store Connect` (unsure Latin outnumbering two Han characters) never flips a Chinese
  window to English. It is the same `resolveLanguage` rule, started from what the window shows.

## 8. The partner eval (haiku, 2026-11-17)

Full run: **82/116** (`packages/partner/eval/results/2026-11-17-haiku-d292.md`) against the previous
LATEST **84/112** (2026-11-13, D251). Four new scenarios: `greet-ko`, `ok-keeps-ko`, `direct-ja`,
`direct-es`. In that run `direct-es` came back in **Dutch**: the stopword score counted `de` and
`en` for Dutch and knew none of `dos`, `debo`, `hacer`, `vez`, `cuándo`; the line told the model
"Dutch". Fixed (Spanish words added, `de`/`en`/`is` dropped from Dutch, the sentence is a fixture
case) and rerun (`2026-11-17-haiku-d292-langs.md`): all four replies in the right language
(Korean, Korean after a bare OK, Japanese, Spanish); greet-ko and direct-ja then failed only the
rubric's two-sentence limit. On the 112 old scenarios, 13 went pass→fail and 9 fail→pass; none of
the 13 failed the language check (the one judge note on language, `call-sheet-done-en`, read the
eval's own two-language button legend as the card's labels). Lesson: a confident-but-wrong
detection is worse than none; Latin words that several languages share must not score.

## Implications for Ducter

- One shared core (`lang.ts` + its Go twin, one fixture file) decides languages everywhere; no
  module tests for Han to choose a language again.
- The task's `language` is the reader's language for its report on every client; the interface
  locale only picks the app's own words.
- New interface languages are a table, not code: add the table, flip `hasUI` in
  `languages.json`.
- Code-made sentences for languages without a table are English (the end of every chain). That is
  honest but not ideal for a Korean user's acks and card buttons; the partner's own words are
  always in the user's language. Translating the tables is the next step, not more branches.

**Summary.** Scripts first, a tiny stopword score inside Latin/Cyrillic/Arabic, and the last known
language for anything without one; the conversation language, the report language and the
interface locale are three tags, and an allowlist guard keeps inline zh/en branches from growing
back.
