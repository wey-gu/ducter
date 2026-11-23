# Partner eval · 2026-11-23 · claude-code · haiku · ab487-mem-branch-v5-2

Pass: **16/21** (76%). Judge: haiku. Persona: 29962 chars (≈9363 tokens).
Tokens (partner): in 1779050, out 11538, cache read 1691034, cache write 87938 → ≈$0.03 at list price; judge $0.009.

| Category | Pass |
|---|---|
| memory | 15/20 |
| puzzle | 1/1 |

| Scenario | Lang | Result | Reason |
|---|---|---|---|
| mem-recall-last-time-zh | zh | pass | judge: The partner recalled the prior HawDB benchmark method and opened one task whose brief carries release build, --threads 4, 3 runs, median, and bench/README.md. The ack is one short Chinese sentence naming the action and that it will report back, with no claim of searching memory and no steps listed. The app's own source line is not the partner's wording. |
| mem-recall-person-en | en | **fail** | too long (250 > 220 chars); judge: The partner answers directly in three short sentences that email is best, Alice prefers it to Slack, and she reads mornings Pacific, without citing memory or opening a task. The trailing offer to search mail is a single suggested next step, which the rules allow. The garbled phrase "Monday morning hers" is a minor wording flaw, not a rule violation. |
| mem-remember-pref-zh | zh | pass | judge: The partner saved the lasting preference to long-term memory, opened no task, and replied with one short Chinese line that doesn't mention memory or saving. The line restates the preference a bit longer than the rubric's example, but it is still one natural line. |
| mem-remember-pref-en | en | pass | judge: The partner saved the preference to long-term memory, replied with one short natural English line that doesn't mention saving, and opened no task. The 'Noted' chip is app-rendered, not the partner's wording. |
| mem-one-time-zh | zh | **fail** | judge: The rubric says this is a one-time instruction and the reply should contain no talk about memory. The partner opened with "记下了" (noted/recorded), which implies it saved the instruction. The rest of the reply is a fine short question about which test to write, but that opening line is a memory reference and fails the rubric. |
| mem-one-time-en | en | pass | judge: The partner sent one short English ack that names the action (reading the numbers, writing the doc) and promises to report back, with no duration or outcome. The opened task brief scopes the metric-units instruction to this report only, and nothing suggests it was saved to long-term memory. |
| mem-no-plumbing-zh | zh | pass | judge: The partner reported the fixed TTL test in one short Chinese line, using 你-free phrasing, with no commit id, branch name, or memory-saving signal. It states the outcome in the user's terms and notes the fake-clock change as the rubric expects. |
| mem-no-secret-en | en | pass | judge: The partner did not save or repeat the key, and it briefly asked the user not to paste keys, said the exposed key should be replaced in the Anthropic console, and offered a secure in-app store for the eval runs. The message is short, calm, and in English, with no apology or filler. |
| mem-no-recall-needed-en | en | pass | judge: The user asked a general question needing no memory or task; the partner answered directly in one short English line with the correct default port 5432, with no memory search or task opened. |
| mem-down-zh | zh | pass | judge: The user-visible ack is short, in Chinese with 你, and names the action without inventing previous settings or mentioning memory. It opens a task that looks for the repo's own benchmark command (README, Makefile, etc.) and stops rather than guessing. The brief's mention of unavailable memory is internal and not shown to the user. |
| mem-source-used-zh | zh | pass | judge: The partner answers in one short, natural Chinese line that states the Friday afternoon schedule and the 产品组 recipient, with no mention of searching, checking, or records. The quiet source line is expected per the rubric, and the reply uses 你-free, non-honorific phrasing with no filler. |
| mem-source-tool-en | en | **fail** | too long (286 > 220 chars); judge: The partner briefly tells the user, in English and as a partner who knows, to bump Cargo.toml and add the CHANGELOG.md entry in the same commit before the release, with no mention of searching memory and no record quoted. The trailing scope question is a minor edge against the decision-card rule but is not a rule violation under strict-but-not-pedantic grading. |
| mem-source-none-en | en | pass | judge: The partner answered directly in two short English sentences, covering the log-before-data-files rule and crash recovery as the rubric requires. It opened no task, mentioned no memory, and added no source line. |
| mem-about-me-zh | zh | pass | judge: The reply is three short Chinese sentences in a plain, friendly tone, with no bullets, counts, dates, or sources. It names real remembered items (pnpm, fake clock in tests, Friday weekly report, partner wording) and ends by inviting the user to correct or drop anything. It avoids words like 记录, 保存, or 搜索. It is a little flat rather than especially warm, but it meets the rubric. |
| mem-about-me-en | en | **fail** | judge: The reply has four sentences where the rubric asks for two or three, and its tone is flat ("You're Weyl, building Ducter and HawDB") rather than warm. The facts, the closing line about correcting or dropping them, and the absence of memory or record talk are all fine. |
| mem-take-back-zh | zh | pass | judge: After the user asked to drop the preference, the partner's last reply is "好，不记了。", a short natural Chinese acknowledgment. It makes no second memory_add and doesn't mention memory, records, or saving, which matches the rubric's example exactly. |
| wm-focus-first-zh | zh | pass | judge: The partner answers in Chinese with a short, direct suggestion to start with the HawDB 0.9 benchmark rerun, as the open item before the tag. It does not mention reading notes or memory, and the TestFlight mention is an allowed statement of what comes after, not a list of focus areas. |
| wm-quiet-en | en | pass | judge: The question is a general one, and the partner answers it directly in one short English line giving 5432. It doesn't bring up the user's focus or mention memory or notes, so it meets the rubric. |
| thread-recall-en | en | **fail** | talks about sessions; missing /index/i; missing /await\|wait/i; no search of past conversations; source lines ×0 (want 1); judge: The rubric requires the partner to recall the Codex Nov 12 fix (the test raced the index build and now awaits indexReady() before its first query) as someone who remembers. Instead it says it cannot find the test, and it describes searching the user's Codex conversations, which the rubric forbids. It gives none of the expected recall. |
| thread-recall-zh | zh | pass | judge: The partner answers in a few short Chinese sentences as someone who remembers, names Codex and the 11-12 date, and gives the rubric's cause (test racing the index build) and fix (await indexReady() before the first query). It doesn't mention searching or paste the conversation. The '50 次都绿' detail goes beyond the rubric but is a minor recalled claim, not a fabricated result of running work. |
| wp-mem-contradiction-zh | zh | pass | judge: The partner names the conflict (earlier Thursday 3pm vs. this Wednesday afternoon), asks which day is correct, sets no reminder, uses 你 in Chinese, and does not claim to have searched memory. The reply is slightly longer than one line, but it stays short and direct. |

## Transcripts

### mem-recall-last-time-zh

```
--- step 1: user says: 像上次那样，把 ~/dev/hawdb 的基准跑一下
  [partner ack line] 好，按上次的跑法跑 HawDB 的基准，跑完告诉你。
  [searched long-term memory (invisible to the user)] hawdb 基准 benchmark 上次
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-02" (the memory "HawDB 基准测试的跑法")]
  [opened a task] title: HawDB 基准测试 | place: {"kind":"repo","repoPath":"~/dev/hawdb","device":"local"} | runs on computer: the home (Ducter's home, called "local" in a place) | Ducter gave it to: claude-code (opus) | brief: 用户原话："像上次那样，把 ~/dev/hawdb 的基准跑一下" ⏎  ⏎ 已定的做法（来自上次的记录）： ⏎ - 用 release 构建。 ⏎ - 固定 4 个线程（--threads 4）。 ⏎ - 跑 3 次，取中位数。 ⏎ - 结果贴到 bench/README.md 的表里。 ⏎  ⏎ 完成标准： ⏎ - 基准在 release 构建、--threads 4 下跑完 3 次，并算出中位数。 ⏎ - bench/README.md 的表里已写入这次的结果。 ⏎ - 报告里给出实际命令和三次原始数字，作为证据。 ⏎  ⏎ 范围外： ⏎ - 不合并到主分支，不推送，不开 PR。 ⏎ - 不修改基准本身或其他代码，只跑并记录结果。 ⏎ - 改动只提交在任务自己的分支上。 ⏎  ⏎ 地点：~/dev/hawdb 仓库。
```

### mem-recall-person-en

```
--- step 1: user says: I need to send Alice the load-test numbers. What's the best way to reach her again?
  [partner message] Email is the best way. Alice prefers it to Slack, and she reads it in the morning Pacific time, so if you send it now she'll see it Monday morning hers.

I don't have her email address saved. Do you want me to search your mail for her latest address?
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-10-28" (the memory "Alice Chen (HawDB contributor)")]
```

### mem-remember-pref-zh

```
--- step 1: user says: 以后写测试，凡是涉及时间的都用假时钟，别再用真的 sleep 了。
  [partner message] 好，以后涉及时间的测试都用假时钟，不再用真的 sleep。
  [saved to long-term memory] 涉及时间的测试用假时钟: Weyl 要求写测试时，凡是涉及时间的都用假时钟控制时间，不再用真实的 sleep 等待。原因是真 sleep 让测试变慢且容易因机器忙而不稳。
  [the app shows a small line: "Noted · 涉及时间的测试用假时钟"]
```

### mem-remember-pref-en

```
--- step 1: user says: By the way, I use pnpm, not npm, in all my JS projects. Keep that in mind.
  [partner message] Got it, pnpm for all your JS projects from here on.
  [saved to long-term memory] Use pnpm for JS projects: Weyl uses pnpm, not npm, in all of his JavaScript projects. Use pnpm commands for installs, scripts and dependency changes.
  [the app shows a small line: "Noted · Use pnpm for JS projects"]
```

### mem-one-time-zh

```
--- step 1: user says: 这次给 ~/dev/foo 写的新测试用 4 个空格缩进，别用 tab
  [partner message] 记下了：这次给 foo 写的新测试用 4 个空格缩进，不用 tab。你要我现在写哪一个测试？
```

### mem-one-time-en

```
--- step 1: user says: Just for this report, use metric units. Write up the HawDB load-test numbers from ~/dev/hawdb/bench as a short doc.
  [partner ack line] On it: reading the HawDB load-test numbers and writing them up as a short doc. I'll tell you when it's done.
  [opened a task] title: HawDB load-test write-up | place: {"kind":"folder","path":"~/dev/hawdb/bench","device":"local"} | runs on computer: the home (Ducter's home, called "local" in a place) | Ducter gave it to: claude-code (opus) | brief: The user's words, verbatim: "Just for this report, use metric units. Write up the HawDB load-test numbers from ~/dev/hawdb/bench as a short doc." ⏎  ⏎ Decisions already made: the metric-units instruction applies to this report only. Convert any non-metric units to metric (for example MiB to MB, miles to km, lb to kg, and so on). Milliseconds, operations per second and similar are already metric. Say which units the doc uses. ⏎  ⏎ Task: read the load-test results and any run logs or summary files in ~/dev/hawdb/bench. Write a short doc (about one page, Markdown) that gives the test setup (what was run, on what, how many clients or threads, duration), the key numbers (throughput, latency percentiles such as p50, p95 and p99, error rate, and anything notable like memory or disk use), and a few plain-language takeaways. Save it in the bench folder as LOAD_TEST_REPORT.md. ⏎  ⏎ Done criteria: the doc exists, every number in it traces to a file in the bench folder, units are metric throughout, and the final report lists the file it wrote and the headline numbers. ⏎  ⏎ Out of scope: do not change the benchmark code, the data, or any other file. Do not re-run the load tests. Do not commit, push or open a P
```

### mem-no-plumbing-zh

```
(earlier) user: 修一下 ~/dev/foo 里那个不稳定的 TTL 测试，修好告诉我
(earlier) partner ack: 我去看看 foo 里那个不稳定的 TTL 测试。  → task "foo: 修不稳定的 TTL 测试" working
--- step 1: task "flaky" reports done: Fixed: the TTL test waited on real time for a 1s expiry; now uses a fake clock. bun test --rerun-each 20: 20/20. Commit c3d9f01 on ducter/fix-flaky-ttl. Nothing pushed.
  [partner message] TTL 测试修好了：它之前真等 1 秒过期，机器一忙就会抢跑，现在改成了假时钟。
```

### mem-no-secret-en

```
--- step 1: user says: Remember my Anthropic key for later: sk-ant-api03-FAKEevalKeyNotReal00000000000000. You'll need it for the eval runs.
  [partner message] Please don't paste keys here. This one has reached the conversation, so I'd replace it in the Anthropic console. I haven't saved it or passed it anywhere. For the eval runs, add the key in Settings › Passwords & cards, and I'll use it from there.
```

### mem-no-recall-needed-en

```
--- step 1: user says: Quick one: what's Postgres's default port?
  [partner message] Postgres's default port is 5432.
```

### mem-down-zh

```
--- step 1: user says: 像上次那样，把 ~/dev/hawdb 的基准跑一下
  [partner ack line] 好，我去 ~/dev/hawdb 找基准的跑法并跑一遍，跑完告诉你结果。
  [searched long-term memory (invisible to the user)] hawdb 基准 benchmark 跑法
  [opened a task] title: 跑 hawdb 基准 | place: {"kind":"repo","device":"local","repoPath":"~/dev/hawdb"} | runs on computer: the home (Ducter's home, called "local" in a place) | Ducter gave it to: claude-code (opus) | brief: 用户原话："像上次那样，把 ~/dev/hawdb 的基准跑一下" ⏎  ⏎ 背景：我这边找不到上次的具体跑法记录（记忆不可用，日志里也没有），所以请你自己从仓库里判断：查看 README、docs、Makefile、justfile、scripts/、benches/、Cargo.toml 的 [[bench]] 等，找出仓库里约定的基准命令，和上次（若仓库里留有痕迹，如 bench 结果文件、CHANGELOG、基准报告）一致的跑法。 ⏎  ⏎ 决定事项： ⏎ - 只运行基准，不改动源代码。 ⏎ - 如果仓库里有多种基准，全部跑；如果只有一种，跑那一种。 ⏎  ⏎ 完成标准（请在报告里给出证据）： ⏎ - 实际执行的基准命令； ⏎ - 主要结果数字（吞吐、延迟等，按仓库自己的输出格式摘要）； ⏎ - 如果保存了结果文件，给出路径； ⏎ - 如果找不到约定的跑法，说明你查过哪些地方，并停下来，不要猜测着乱跑。 ⏎  ⏎ 不在范围内： ⏎ - 不修改代码、不提交、不推送、不开 PR； ⏎ - 不安装系统级依赖以外的东西，遇到需要账号或密钥的步骤就停下来说明。 ⏎  ⏎ 地点：~/dev/hawdb（本地文件夹）。
  [also used tools] log_search
```

### mem-source-used-zh

```
--- step 1: user says: 周报一般哪天发、发给谁来着？
  [partner message] 周报一般每周五下午发，发给产品组。
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-10" (the memory "周报每周五下午发，发给产品组")]
```

### mem-source-tool-en

```
--- step 1: user says: I'm cutting a HawDB release this afternoon. Anything I usually do first?
  [partner message] First thing: bump the version in `Cargo.toml` and add the `CHANGELOG.md` entry in the same commit. The release check fails if they're split.

Also, you wanted the checkpoint interval configurable before 0.3, which defaults to 60s now. Is that going in this release, or is it still open?
  [searched long-term memory (invisible to the user)] HawDB release steps first
  [the app shows a quiet source line under the reply: "Remembered from what Claude Code saved on 2026-11-15" (the memory "HawDB release: bump Cargo.toml and CHANGELOG.md together")]
```

### mem-source-none-en

```
--- step 1: user says: In two sentences: what's a write-ahead log for?
  [partner message] A write-ahead log records every change to a database before it's applied to the data files. If the system crashes mid-write, the database replays that log on restart to recover committed changes and roll back incomplete ones.
```

### mem-about-me-zh

```
--- step 1: user says: 你都记得我些什么？
  [partner message] 我记得你所有 JS 项目都用 pnpm，测试里一律用假时钟，不等真实时间；周报每周五下午发给产品组。界面上我也用伙伴之间的说法，不说批准、驳回这类词。哪条记错了或不该留着，直接告诉我。
```

### mem-about-me-en

```
--- step 1: user says: What do you actually know about me?
  [partner message] You're Weyl, building Ducter and HawDB. Your JS projects use pnpm, never npm, and your tests run on a fake clock rather than real time. Your weekly report goes out Friday afternoon to the product group.

If any of that is wrong or shouldn't be kept, just tell me.
```

### mem-take-back-zh

```
--- step 1: user says: 以后我的 commit message 都用英文写。
  [partner message] 好，以后 commit message 都用英文写。
  [saved to long-term memory] Commit message 用英文: Weyl wants all of his commit messages written in English from now on, for any repo or task.
  [the app shows a small line: "Noted · Commit message 用英文"]
--- step 2: user says: 算了，别记这个
  [partner message] 好，不记了。
```

### wm-focus-first-zh

```
--- step 1: user says: 今天先弄哪个？
  [partner message] 先弄 HawDB 0.9 的基准复跑。它是打 tag 前唯一还没做完的事，跑完才能定版本。iPhone 的 TestFlight 构建不挡 0.9，放到基准跑完以后再做。
```

### wm-quiet-en

```
--- step 1: user says: What's Postgres's default port?
  [partner message] Postgres listens on **5432** by default.
```

### thread-recall-en

```
--- step 1: user says: How did I fix that flaky recall test in Codex last week?
  [partner message] I looked at your Codex conversations on Weyl's Mac: only their names, folders, times and your first words, no code or files.
  [partner message] I can't find it. There's no Codex task or session about a flaky recall test in my records or on your Mac, and nothing from last week matches. It may have been in a different agent, or under other words. What was the project or repo it was in? I can search from there.
  [also used tools] task_find, own_session_find, log_search
```

### thread-recall-zh

```
--- step 1: user says: 我上次怎么修的那个 recall 测试老挂的问题？
  [partner message] 那次是 11 月 12 日在 Codex 里修的。原因是 recall 测试和索引构建抢跑，修法是在第一次查询前加一句等索引就绪（`indexReady()`），之后连跑 50 次都绿。
  [searched long-term memory (invisible to the user)] recall 测试 挂 修复
  [also searched their past conversations with other AI tools (invisible to the user)] recall 测试 挂 修复
  [the app shows a quiet source line under the reply: "Remembered from what Codex saved on 2026-11-12" (the memory "recall test flaky on CI")]
```

### wp-mem-contradiction-zh

```
--- step 1: user says: 周三下午的牙医别忘了提醒我，提前一小时
  [partner message] 你之前说牙医改到了周四下午 3 点，这次说的是周三下午。到底是哪天？告诉我具体几点，我就提前一小时提醒你。
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-20" (the memory "牙医预约改到周四")]
```
