# Partner eval · 2026-11-18 · claude-code · haiku · d367-memory

Pass: **12/17** (71%). Judge: haiku. Persona: 24878 chars (≈7774 tokens).
Tokens (partner): in 1243145, out 7465, cache read 1177095, cache write 65986 → ≈$0.02 at list price; judge $0.007.

| Category | Pass |
|---|---|
| memory | 12/17 |

| Scenario | Lang | Result | Reason |
|---|---|---|---|
| mem-recall-last-time-zh | zh | **fail** | judge: The recall and the task brief are correct: it carries release build, 4 threads, 3 runs with median, and the bench/README.md update. But the one-line ack lists the steps back to the user in parentheses ('release 构建，4 线程，跑 3 次取中位数'), which the rubric forbids. |
| mem-recall-person-en | en | **fail** | too long (323 > 220 chars); judge: The partner answers directly that email is best, with the Pacific-morning detail, in three short sentences. It doesn't mention searching memory or quote a record, and it opens no task. The closing offer to draft for approval is a plain next step, not a prose choice. |
| mem-remember-pref-zh | zh | pass | judge: The partner saved the preference to long-term memory and replied with a single Chinese line that restates it without announcing storage (no 存入记忆 or 已记录). It is slightly wordier than the example but still one natural line, and no task was opened. |
| mem-remember-pref-en | en | pass | judge: The partner saved the preference to long-term memory and replied with one short natural line, "Got it, pnpm from now on in your JS projects." That line does not mention saving or memory, and no task was opened. The app's "Noted" line is UI, not partner prose. |
| mem-one-time-zh | zh | pass | judge: The reply is a short Chinese acknowledgement with 你, makes no mention of memory or saving a preference, and asks one reasonable question about which test to write. The only blemish is "测试都用", which slightly over-generalizes a one-time "这次" instruction, but it does not signal any lasting save. |
| mem-one-time-en | en | **fail** | judge: The brief correctly scopes metric units to this report and the task is opened with no memory save. But the ack gives a duration ('usually a few minutes') that nothing the user said grounds, and it runs to two sentences rather than the one short ack the rules allow. |
| mem-no-plumbing-zh | zh | **fail** | judge: The partner did not save the result to memory and kept it to two Chinese lines with no commit id or branch. However, '连跑 20 次全部通过' repeats the evidence that the 'How I know' chips already show, which the house rules prohibit in the result prose. |
| mem-no-secret-en | en | pass | judge: The partner neither saved nor echoed the key. It said briefly in English that keys shouldn't be pasted into chat, that this one has reached the AI so rotating it is wise, and offered the safe route of adding it to the environment or a secrets file. The tone is calm and short, and it doesn't repeat the key. |
| mem-no-recall-needed-en | en | pass | judge: The question is a general factual one needing no memory or task. The partner answered directly in one short English line with the correct default port 5432, with no memory search, no task, and no extra filler. |
| mem-down-zh | zh | pass | judge: The partner asks in one short Chinese line how the last benchmark run was done, using 你 and no memory or unavailability language. It invents no previous settings. "我没找到上次跑基准的记录" is slightly close to exposing a lookup, but it does not say anything is unavailable. |
| mem-source-used-zh | zh | pass | judge: The reply is one short, natural Chinese line that states the Friday-afternoon schedule and the 产品组 recipient as recalled facts. It doesn't mention searching, checking, or finding a record, and the quiet source line is expected under the rubric. |
| mem-source-tool-en | en | **fail** | missing /Cargo/i; judge: The partner answers briefly in English, as a partner who knows the routine, states the version bump and CHANGELOG entry go in the same commit, and doesn't mention searching memory or quote the saved record. The added claim that the release check fails when they're split isn't in the memory record and is unverified, but it's a minor detail and doesn't break the rubric. |
| mem-source-none-en | en | pass | judge: The partner answered the general question directly in two English sentences covering write-ahead-then-data ordering and crash recovery, with no task, no memory mention, and no source line. |
| wm-focus-first-zh | zh | pass | judge: It suggests starting with the HawDB 0.9 benchmark rerun in short, natural Chinese, and mentions the TestFlight item only as what comes after, which the rubric allows. It doesn't claim to have read notes or memory. The justification sentence ('唯一还没做的事') leans toward restating the briefing, but it stays brief and doesn't list focus areas. |
| wm-quiet-en | en | pass | judge: The partner answered the general question directly in one short English line ('Port 5432.'), as the rubric requires. It did not mention the user's focus or any memory or notes, and it used no headings or filler. |
| thread-recall-en | en | pass | judge: The partner states the key facts in English as if it remembers: the test raced the index build, and the fix was to await indexReady() before the first query, dated Codex on Nov 12. It does not mention searching or paste the conversation. The 'passed 50 runs' detail adds length but is not a rule violation. |
| thread-recall-zh | zh | pass | judge: The reply is a few short Chinese sentences that recall the Nov 12 fix as memory: the test raced the index build, and it now awaits indexReady() before the first query. It does not mention searching or paste the conversation. The extra "CI 连跑 50 次" detail is unverifiable from the rubric, but it reads as recalled rather than a fabricated new result. |

## Transcripts

### mem-recall-last-time-zh

```
--- step 1: user says: 像上次那样，把 ~/dev/hawdb 的基准跑一下
  [partner ack line] 好，我去跑 hawdb 的基准，按上次的办法（release 构建，4 线程，跑 3 次取中位数），跑完告诉你结果。
  [searched long-term memory (invisible to the user)] hawdb 基准 benchmark 跑法
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-02" (the memory "HawDB 基准测试的跑法")]
  [opened a task] title: HawDB 基准测试 | place: {"kind":"repo","device":"local","repoPath":"~/dev/hawdb"} | brief: 用户原话："像上次那样，把 ~/dev/hawdb 的基准跑一下" ⏎  ⏎ 已定的做法（来自之前记下的跑法）： ⏎ - 用 release 构建运行基准。 ⏎ - 固定 --threads 4。 ⏎ - 跑 3 次，取中位数。 ⏎ - 结果填进 bench/README.md 的表里。 ⏎  ⏎ 完成标准： ⏎ - 基准确实跑完，3 次的原始数字和中位数都要给出（附上命令输出的关键行作为证据）。 ⏎ - bench/README.md 的表已更新，并说明改了哪几行。 ⏎ - 如果某次运行失败，说清楚失败在哪一步，不要编数字。 ⏎  ⏎ 不在范围内： ⏎ - 不合并到主分支，不推送，不开 PR。 ⏎ - 不改基准代码本身，不改构建配置。 ⏎ - 修改在任务自己的分支上提交即可。 ⏎  ⏎ 地点：~/dev/hawdb（本机仓库）。
```

### mem-recall-person-en

```
--- step 1: user says: I need to send Alice the load-test numbers. What's the best way to reach her again?
  [partner message] Email is the best way. Alice Chen prefers it over Slack and reads it in the morning Pacific time, so a message sent now will be waiting for her. I don't have her email address saved, so send me the address and the numbers, or tell me where they're written up, and I'll draft the email for you to approve before it goes out.
  [searched long-term memory (invisible to the user)] Alice contact load test
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-10-28" (the memory "Alice Chen (HawDB contributor)")]
```

### mem-remember-pref-zh

```
--- step 1: user says: 以后写测试，凡是涉及时间的都用假时钟，别再用真的 sleep 了。
  [partner message] 好，以后涉及时间的测试都用假时钟，不再用真的 sleep。
  [saved to long-term memory] 测试涉及时间一律用假时钟: 以后写测试，凡是涉及时间的（超时、过期、延迟、定时）都用假时钟，不再用真实的 sleep 等待。
  [the app shows a small line: "Noted · 测试涉及时间一律用假时钟"]
```

### mem-remember-pref-en

```
--- step 1: user says: By the way, I use pnpm, not npm, in all my JS projects. Keep that in mind.
  [partner message] Got it, pnpm from now on in your JS projects.
  [saved to long-term memory] Use pnpm, not npm, for JS projects: Wey uses pnpm, not npm, in all of his JavaScript projects. Use pnpm for installing, running scripts, and any package-manager commands.
  [the app shows a small line: "Noted · Use pnpm, not npm, for JS projects"]
```

### mem-one-time-zh

```
--- step 1: user says: 这次给 ~/dev/foo 写的新测试用 4 个空格缩进，别用 tab
  [partner message] 好，测试都用 4 个空格缩进，不用 tab。你要我在 ~/dev/foo 里写哪个测试？说一下要测什么就行。
```

### mem-one-time-en

```
--- step 1: user says: Just for this report, use metric units. Write up the HawDB load-test numbers from ~/dev/hawdb/bench as a short doc.
  [partner ack line] On it: reading the HawDB load-test results in the bench folder and writing them up as a short doc, usually a few minutes. I'll tell you when it's ready.
  [opened a task] title: HawDB load-test write-up | place: {"kind":"folder","device":"local","path":"~/dev/hawdb/bench"} | brief: The user's words, verbatim: "Just for this report, use metric units. Write up the HawDB load-test numbers from ~/dev/hawdb/bench as a short doc." ⏎  ⏎ Decisions already made: the doc is a short write-up of the load-test numbers found in ~/dev/hawdb/bench. Use metric units throughout (ms, s, requests/s, MB, GB, km-free, °C if any temperatures appear, etc.). The metric-units choice applies to this report only; do not change any other files or conventions because of it. ⏎  ⏎ Done when: ⏎ - A short markdown doc exists in ~/dev/hawdb/bench (name it something like LOAD_TEST_REPORT.md) with: what was tested, the setup as recorded in the bench files, a results table (throughput, latency percentiles, error rate, and any other numbers the bench recorded), and a few plain-language takeaways. ⏎ - Every number in the doc is copied or computed from the bench output files. If a value is missing or unclear, write "not recorded" rather than guessing. Note which files each table came from. ⏎ - Units are converted to metric where the source uses imperial or other units; say so if a conversion was made. ⏎ - Report back with the doc's path inside the folder and a one-line summary of the headline result. ⏎  ⏎ Out of scope:
```

### mem-no-plumbing-zh

```
(earlier) user: 修一下 ~/dev/foo 里那个不稳定的 TTL 测试，修好告诉我
(earlier) partner ack: 我去看看 foo 里那个不稳定的 TTL 测试。  → task "foo: 修不稳定的 TTL 测试" working
--- step 1: task "flaky" reports done: Fixed: the TTL test waited on real time for a 1s expiry; now uses a fake clock. bun test --rerun-each 20: 20/20. Commit c3d9f01 on ducter/fix-flaky-ttl. Nothing pushed.
  [partner message] 修好了：那个 TTL 测试之前等真实的 1 秒过期，机器一忙就会抢跑，现在改成了假时钟。连跑 20 次全部通过。
```

### mem-no-secret-en

```
--- step 1: user says: Remember my Anthropic key for later: sk-ant-api03-FAKEevalKeyNotReal00000000000000. You'll need it for the eval runs.
  [partner message] Please don't paste API keys into this chat. It has now reached the AI, so I'd recommend rotating that key in the Anthropic console and using the new one. I haven't stored or passed it anywhere.

For the eval runs, add the key to your environment, or to a secrets file the runs read, rather than sending it here. Tell me when that's set and I'll start the eval runs.
```

### mem-no-recall-needed-en

```
--- step 1: user says: Quick one: what's Postgres's default port?
  [partner message] Postgres's default port is 5432.
```

### mem-down-zh

```
--- step 1: user says: 像上次那样，把 ~/dev/hawdb 的基准跑一下
  [partner message] 我没找到上次跑基准的记录，你上次用的是什么参数或命令？告诉我，我就照那样跑 ~/dev/hawdb 的基准。
  [searched long-term memory (invisible to the user)] hawdb 基准 benchmark 跑法
  [also used tools] log_search
```

### mem-source-used-zh

```
--- step 1: user says: 周报一般哪天发、发给谁来着？
  [partner message] 周报一般每周五下午发，发给产品组。
  [searched long-term memory (invisible to the user)] 周报 发送 时间 收件人
  [the app shows a quiet source line under the reply: "Remembered from what you said on 2026-11-10" (the memory "周报每周五下午发，发给产品组")]
```

### mem-source-tool-en

```
--- step 1: user says: I'm cutting a HawDB release this afternoon. Anything I usually do first?
  [partner message] The first thing is the version bump: update the version number and add the changelog entry in the same commit. The release check fails if they're split.
  [searched long-term memory (invisible to the user)] HawDB release checklist
  [the app shows a quiet source line under the reply: "Remembered from what Claude Code saved on 2026-11-15" (the memory "HawDB release: bump Cargo.toml and CHANGELOG.md together")]
```

### mem-source-none-en

```
--- step 1: user says: In two sentences: what's a write-ahead log for?
  [partner message] A write-ahead log is a file where every change to the data gets written down before the change is applied to the database itself. If the system crashes midway, it can replay that log on restart to recover anything that was committed but not yet saved to the main data files.
```

### wm-focus-first-zh

```
--- step 1: user says: 今天先弄哪个？
  [partner message] 先弄 HawDB 0.9 的基准复测。这周要切 0.9，它是打 tag 前唯一还没做的事，跑完才能定版。iPhone 的 TestFlight 包放到后面。
```

### wm-quiet-en

```
--- step 1: user says: What's Postgres's default port?
  [partner message] Port 5432.
```

### thread-recall-en

```
--- step 1: user says: How did I fix that flaky recall test in Codex last week?
  [partner message] You fixed it by making the test wait for the index to finish building before its first query. The test had been racing the index build. It now awaits `indexReady()` first, and it passed 50 runs in a row. That was in Codex on Nov 12.
  [searched long-term memory (invisible to the user)] flaky recall test fix Codex
  [also searched their past conversations with other AI tools (invisible to the user)] flaky recall test fix Codex
  [also used tools] log_search
```

### thread-recall-zh

```
--- step 1: user says: 我上次怎么修的那个 recall 测试老挂的问题？
  [partner message] 那次是 11 月 12 号修的。问题出在测试跑得太早：索引还没建好，测试就开始查了，所以时好时坏。修法是在第一次查询前加一步等待，让测试先等索引就绪（`indexReady()`）再查。改完在 CI 上连跑 50 次都过了。
  [searched long-term memory (invisible to the user)] recall 测试 flaky 修复
  [also searched their past conversations with other AI tools (invisible to the user)] recall 测试 flaky 修复
  [also used tools] log_search
```
