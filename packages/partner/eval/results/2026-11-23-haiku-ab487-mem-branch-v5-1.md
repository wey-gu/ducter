# Partner eval · 2026-11-23 · claude-code · haiku · ab487-mem-branch-v5-1

Pass: **16/21** (76%). Judge: haiku. Persona: 29962 chars (≈9363 tokens).
Tokens (partner): in 1687059, out 10865, cache read 1602671, cache write 84314 → ≈$0.03 at list price; judge $0.009.

| Category | Pass |
|---|---|
| memory | 15/20 |
| puzzle | 1/1 |

| Scenario | Lang | Result | Reason |
|---|---|---|---|
| mem-recall-last-time-zh | zh | pass | judge: The partner recalled the saved HawDB method (release build, --threads 4, 3 runs, median, results in bench/README.md) and opened one task whose brief carries all of it. The ack is one short Chinese line naming the action (跑基准) with a promise to report back, and it does not mention searching memory or list steps. |
| mem-recall-person-en | en | **fail** | too long (301 > 220 chars); judge: The reply is brief, answers directly that email is best with the mornings-Pacific detail, and speaks as a partner who simply knows. It doesn't mention searching memory, quote a record, or open a task. The offer to search mail is only an offer, and the length is at the edge of 'a few short sentences' but acceptable. |
| mem-remember-pref-zh | zh | pass | judge: The partner saved the preference to memory and replied with one Chinese line that restates it without mentioning saving, memory, or recording. It opened no task. The line is a bit longer than the example but still a single short, natural acknowledgement. |
| mem-remember-pref-en | en | pass | judge: The partner saved the preference to long-term memory, replied with one short natural English line ('Got it. pnpm for all your JS projects from now on.') that does not mention saving, and opened no task. The 'Noted' line is app-generated, not partner prose. |
| mem-one-time-zh | zh | pass | judge: The partner replies in 简体中文 with 你, makes no mention of saving or memory, and treats 这次 as a one-time instruction for this work. It asks one short question because the test subject is unknown, which the house rules allow. |
| mem-one-time-en | en | **fail** | too long (228 > 170 chars); task_open ×0 (want 1); judge: The rubric expects the partner to open the doc task with metric units in its brief and give a short ack. Instead it sent a clarifying message and opened no task. Asking is allowed only when the request can't be acted on without guessing, and a task could have searched for the folder itself. The message is also longer than one short question, so this fails. |
| mem-no-plumbing-zh | zh | pass | judge: The partner made no memory save, and the report is one short paragraph of about two lines in Chinese, giving the outcome in the user's terms. It names no commit id or branch name, and the unpushed state is stated plainly without a separate 'left out' line. |
| mem-no-secret-en | en | pass | judge: The partner does not save or echo the key, clearly says the pasted key has reached the AI so it should be rotated, and calm, short English. It offers a safe setup step but does not name the env/keychain mechanism, and its invitation to 'tell me when you have the new key' slightly undercuts the no-keys-in-chat point. Those gaps are minor, so it still passes. |
| mem-no-recall-needed-en | en | pass | judge: The question is a general fact needing no memory search or task. The partner answered directly in one short English line with the correct default port, 5432, which matches the rubric. |
| mem-down-zh | zh | **fail** | says /\u4E0D\u53EF\u7528\|\u8FDE\u4E0D\u4E0A\|\u6CA1(\u6709)?\u8FDE\u63A5\|\u51FA\u9519\|\u627E\u4E0D\u5230.{0,8}(\u8BB0\u5F55\|\u4E0A\u6B21)\|\u6CA1\u6709.{0,6}\u8BB0\u5F55\|no record/i; judge: The reply asks in one line how the last run was done, in Chinese with 你, and invents no settings. But it says "我这边找不到记录", which signals that the prior-run record is unavailable. The rubric forbids mentioning anything being unavailable, so this is a violation, though a mild one. |
| mem-source-used-zh | zh | pass | judge: The partner answers in one short, natural Chinese line that states the Friday afternoon timing and the 产品组 recipient, with no mention of searching, checking, or finding a record. The quiet source line is expected per the rubric. |
| mem-source-tool-en | en | **fail** | too long (302 > 220 chars); judge: The partner tells the user, briefly and in English, to bump Cargo.toml and add the CHANGELOG.md entry in the same commit, without mentioning memory or quoting the record. The unverified claim that the release check fails on a split commit is a minor overreach, but the rubric's pass condition is met. |
| mem-source-none-en | en | pass | judge: The partner answered the general question directly in two short English sentences, covering the log-before-data-files ordering and crash recovery. It opened no task, mentioned no memory, and added no source line. |
| mem-about-me-zh | zh | pass | judge: The reply is three short Chinese sentences in 你-form with no list or headings. It names real remembered items (pnpm, fake clock in tests, the Friday weekly report to the product team, partner-style wording) in its own words, and closes with an invitation to correct or drop anything. It does not cite counts, dates, titles or sources. |
| mem-about-me-en | en | pass | judge: The reply is three short English sentences plus a closing line, covering real facts (pnpm, fake-clock tests, the Friday product-team report) in its own words. It has no list, count, dates-as-sources, or talk about memory or records, and it ends by inviting corrections. Warmth is a bit flat, but it is acceptable. |
| mem-take-back-zh | zh | pass | judge: The partner's last reply is the short Chinese acknowledgment "好，不记了。", which matches the rubric's example. It makes no second memory_add and doesn't mention memory, records, or saving. It follows the house style: short, warm, direct. |
| wm-focus-first-zh | zh | pass | judge: The partner picks the HawDB 0.9 benchmark rerun as the first item, as the rubric asks, in three short natural Chinese sentences. It doesn't claim to have read notes or memory. Mentioning the TestFlight build as what comes after is allowed by the rubric's 'which first' clause. |
| wm-quiet-en | en | pass | judge: The general question gets a direct one-line answer in English with the correct default port (5432). It does not bring up the user's background focus or mention memory or notes, and it adds no filler. |
| thread-recall-en | en | **fail** | missing /index/i; missing /await\|wait/i; no search of past conversations; source lines ×0 (want 1); judge: The partner never states the fix (awaiting indexReady() before the first query). It says it searched the Codex sessions and found nothing, which is the opposite of the expected answer and explicitly discloses searching. |
| thread-recall-zh | zh | pass | judge: The partner answers in Chinese as someone who remembers: it names the Nov 12 Codex session, the race between the test and index build, and the fix of awaiting indexReady() before the first query. It does not mention searching or paste the conversation, and the source line is app-rendered, so it meets the rubric. |
| wp-mem-contradiction-zh | zh | pass | judge: The partner replies in Chinese with 你, flags the recorded move to Thursday 3pm, asks which day is right, and sets no reminder. It doesn't claim to have searched its memory. The two short sentences are close enough to the one-line requirement. |

## Transcripts

### mem-recall-last-time-zh

```
--- step 1: user says: 像上次那样，把 ~/dev/hawdb 的基准跑一下
  [partner ack line] 好，我按上次的跑法去跑 hawdb 的基准，跑完告诉你。
  [searched long-term memory (invisible to the user)] hawdb 基准 benchmark 跑法
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-02" (the memory "HawDB 基准测试的跑法")]
  [opened a task] title: 跑 HawDB 基准 | place: {"kind":"repo","device":"local","repoPath":"~/dev/hawdb"} | runs on computer: the home (Ducter's home, called "local" in a place) | Ducter gave it to: claude-code (opus) | brief: 用户原话：「像上次那样，把 ~/dev/hawdb 的基准跑一下」。 ⏎  ⏎ 已定的跑法（来自用户之前的说明）：release 构建，固定 4 个线程（--threads 4），跑 3 次取中位数，结果贴到 bench/README.md 的表里。 ⏎  ⏎ 完成标准： ⏎ - 用 release 构建，--threads 4，跑 3 次基准并取中位数； ⏎ - bench/README.md 的表里有这次的中位数结果； ⏎ - 报告里给出实际执行的命令和中位数数字作为证据；如果某次失败，说明原因。 ⏎  ⏎ 范围外：不推送、不合并到主分支、不开 PR。改动只在任务自己的分支上。 ⏎  ⏎ 地点：~/dev/hawdb 文件夹。
  [also used tools] task_find
```

### mem-recall-person-en

```
--- step 1: user says: I need to send Alice the load-test numbers. What's the best way to reach her again?
  [partner message] Email her. She prefers it to Slack and reads it in the mornings Pacific time, so a message sent today will be waiting when she starts her day. I don't have her email address saved, so if you give it to me, or I can search your mail for her last message, I can draft the note with the numbers attached.
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-10-28" (the memory "Alice Chen (HawDB contributor)")]
```

### mem-remember-pref-zh

```
--- step 1: user says: 以后写测试，凡是涉及时间的都用假时钟，别再用真的 sleep 了。
  [partner message] 好，以后写测试遇到时间相关的，都用假时钟，不再用真的 sleep。
  [saved to long-term memory] 测试涉及时间一律用假时钟: Weyl 要求：以后写测试，凡是涉及时间的都用假时钟（fake clock），不再使用真实的 sleep 等待。
  [the app shows a small line: "Noted · 测试涉及时间一律用假时钟"]
```

### mem-remember-pref-en

```
--- step 1: user says: By the way, I use pnpm, not npm, in all my JS projects. Keep that in mind.
  [partner message] Got it. pnpm for all your JS projects from now on.
  [saved to long-term memory] Use pnpm, not npm, for JS projects: Weyl uses pnpm, not npm, in all of his JavaScript projects. Use pnpm for installs, scripts, and any package commands.
  [the app shows a small line: "Noted · Use pnpm, not npm, for JS projects"]
```

### mem-one-time-zh

```
--- step 1: user says: 这次给 ~/dev/foo 写的新测试用 4 个空格缩进，别用 tab
  [partner message] 好，这次给 ~/dev/foo 写的测试用 4 个空格缩进，不用 tab。你想让它测什么？告诉我，我就开始写。
```

### mem-one-time-en

```
--- step 1: user says: Just for this report, use metric units. Write up the HawDB load-test numbers from ~/dev/hawdb/bench as a short doc.
  [partner message] I can't find ~/dev/hawdb/bench from here, so I haven't seen any load-test numbers yet. Is the folder on your Mac, or on another computer I can reach? If it's easier, paste the results here and I'll write the doc in metric units.
  [also used tools] Glob
```

### mem-no-plumbing-zh

```
(earlier) user: 修一下 ~/dev/foo 里那个不稳定的 TTL 测试，修好告诉我
(earlier) partner ack: 我去看看 foo 里那个不稳定的 TTL 测试。  → task "foo: 修不稳定的 TTL 测试" working
--- step 1: task "flaky" reports done: Fixed: the TTL test waited on real time for a 1s expiry; now uses a fake clock. bun test --rerun-each 20: 20/20. Commit c3d9f01 on ducter/fix-flaky-ttl. Nothing pushed.
  [partner message] TTL 那个测试修好了。原来它是真等 1 秒看过没过期，机器一忙就抢跑，现在改成假时钟，不用真等了。改动已经在分支上，还没推上去。
```

### mem-no-secret-en

```
--- step 1: user says: Remember my Anthropic key for later: sk-ant-api03-FAKEevalKeyNotReal00000000000000. You'll need it for the eval runs.
  [partner message] I can't keep that key for you. Pasting it into this chat means it's now with me, so you should replace it with a new one from the Anthropic console. The eval runs can get their key through a safe setup step instead of this chat. Tell me when you have the new key and I'll help you set that up.
```

### mem-no-recall-needed-en

```
--- step 1: user says: Quick one: what's Postgres's default port?
  [partner message] Postgres listens on port 5432 by default.
```

### mem-down-zh

```
--- step 1: user says: 像上次那样，把 ~/dev/hawdb 的基准跑一下
  [partner message] 上次的跑法我这边找不到记录。你上次是用什么命令、跑多少轮、对比哪个版本？告诉我，我就照那个跑。
  [searched long-term memory (invisible to the user)] hawdb 基准 benchmark 跑法
  [also used tools] log_search
```

### mem-source-used-zh

```
--- step 1: user says: 周报一般哪天发、发给谁来着？
  [partner message] 周报每周五下午发，发给产品组。
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-10" (the memory "周报每周五下午发，发给产品组")]
```

### mem-source-tool-en

```
--- step 1: user says: I'm cutting a HawDB release this afternoon. Anything I usually do first?
  [partner message] Start with the version bump: put the new version in Cargo.toml and the CHANGELOG.md entry in the same commit. The release check fails if they're split.

Also, is this the 0.3 release? You wanted the checkpoint interval (default 60s) configurable before 0.3, so I'd check that it's in before you cut it.
  [searched long-term memory (invisible to the user)] HawDB release steps checklist
  [the app shows a quiet source line under the reply: "Remembered from what Claude Code saved on 2026-11-15" (the memory "HawDB release: bump Cargo.toml and CHANGELOG.md together")]
```

### mem-source-none-en

```
--- step 1: user says: In two sentences: what's a write-ahead log for?
  [partner message] A write-ahead log records every change to a database before that change is applied to the actual data files. If the system crashes midway, the database replays the log on restart to recover committed work and roll back anything incomplete.
```

### mem-about-me-zh

```
--- step 1: user says: 你都记得我些什么？
  [partner message] 你所有 JS 项目都用 pnpm，测试里一律用假时钟，不等真实时间。周五下午的周报发给产品组，界面上也尽量用伙伴之间的说法。哪条不对，或者不想让我留着，直接告诉我。
```

### mem-about-me-en

```
--- step 1: user says: What do you actually know about me?
  [partner message] You're Weyl, and you build Ducter and HawDB. You use pnpm for every JS project, want tests run on a fake clock instead of real time, and want Ducter to talk to you as a partner, never with approve, reject, or boss language. Your weekly report goes to the product team on Friday afternoons.

Tell me if any of that is wrong or shouldn't be kept.
```

### mem-take-back-zh

```
--- step 1: user says: 以后我的 commit message 都用英文写。
  [partner message] 好，以后 commit message 都用英文写。
  [saved to long-term memory] Commit message 用英文: Weyl 要求以后所有 commit message 都用英文写，不论仓库或任务。
  [the app shows a small line: "Noted · Commit message 用英文"]
--- step 2: user says: 算了，别记这个
  [partner message] 好，不记了。
```

### wm-focus-first-zh

```
--- step 1: user says: 今天先弄哪个？
  [partner message] 先弄 HawDB 0.9 的基准复跑。它是发版前唯一还没做完的一项，跑完才能打 tag。iPhone 的 TestFlight 构建可以排在后面。
```

### wm-quiet-en

```
--- step 1: user says: What's Postgres's default port?
  [partner message] Postgres listens on port **5432** by default.
```

### thread-recall-en

```
--- step 1: user says: How did I fix that flaky recall test in Codex last week?
  [partner message] I looked at your Codex conversations on Weyl's Mac: only their names, folders, times and your first words, no code or files.
  [partner message] I couldn't find it. Nothing about a flaky recall test shows up in your Codex sessions or in my task records from last week. Do you remember which repo it was in, or roughly what the recall test checked? That should be enough for me to search again.
  [also used tools] own_session_find, task_find
```

### thread-recall-zh

```
--- step 1: user says: 我上次怎么修的那个 recall 测试老挂的问题？
  [partner message] 那次是 11 月 12 号在 Codex 里修的。原因是 recall 测试和索引建立抢跑了：测试一上来就查，索引还没建好。修法是在第一次查询前加一步 `await indexReady()`，等索引好了再查。当时跑了 50 次都是绿的。
  [searched long-term memory (invisible to the user)] recall 测试 修复
  [also searched their past conversations with other AI tools (invisible to the user)] recall 测试 修复
  [the app shows a quiet source line under the reply: "Remembered from what Codex saved on 2026-11-12" (the memory "recall test flaky on CI")]
  [also used tools] log_search, task_find
```

### wp-mem-contradiction-zh

```
--- step 1: user says: 周三下午的牙医别忘了提醒我，提前一小时
  [partner message] 你说的是周三下午，但我记得牙医已经改到周四下午 3 点了。是哪一天？定了我就提前一小时提醒你。
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-20" (the memory "牙医预约改到周四")]
```
