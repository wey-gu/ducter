// D285: 一直在跑的 / Ongoing for the demo (DEMO_PAST=1): four routines with their runs (one paused
// until Monday, one until resumed), and the looks of the demo's review loop (t_loop).
import type { Core } from "@ducter/core";

export async function seedOngoing(core: Core, zh: boolean) {
  const log = core.log;
  const DAY = 24 * 3600_000;
  const ws = new WebSocket(core.url);
  const frames: { t: string; routineId?: string; clientId?: string }[] = [];
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res) => (ws.onopen = () => res()));
  ws.send(JSON.stringify({ t: "hello", client: "cli" }));
  await Bun.sleep(100);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const make = async (cid: string, words: string, when: object): Promise<string> => {
    ws.send(JSON.stringify({ t: "task_new", words, when, clientId: cid }));
    for (let i = 0; i < 100; i++) {
      const f = frames.find((x) => x.t === "task_new_result" && x.clientId === cid);
      if (f?.routineId) return f.routineId;
      await Bun.sleep(20);
    }
    return "";
  };
  const ci = await make("og1", zh ? "每天早上看一眼 hawdb 的 CI，红了告诉我为什么" : "Check hawdb's CI every morning and tell me why when it's red", { kind: "every", every: "day", time: "09:00", tz });
  const weekly = await make("og2", zh ? "每周一整理上周的周报" : "Write last week's report every Monday", { kind: "every", every: "week", days: [1], time: "10:00", tz });
  const mail = await make("og3", zh ? "工作日 8:30 读邮件，挑出要回的" : "Read my mail on weekdays at 8:30 and pick what needs a reply", { kind: "every", every: "weekday", time: "08:30", tz });
  const issues = await make("og4", zh ? "每 4 小时看一次 mem 的新 issue" : "Look at new mem issues every 4 hours", { kind: "every", every: "hours", hours: 4, time: "08:00", tz });
  // Past runs, oldest first: a pebble each.
  const runs = (rid: string, outs: ("done" | "failed" | "skipped")[], every: number, line: [string, string][]) => {
    outs.forEach((o, i) => {
      const at = Date.now() - (outs.length - i) * every;
      const runId = `run_${rid}_${i}`;
      const taskId = `${rid}_t${i}`;
      if (o === "skipped") return void log.append({ stream: `routine:${rid}`, origin: "schedule", kind: "routine_run", body: { routineId: rid, runId, scheduledFor: new Date(at).toISOString(), state: "skipped", reason: zh ? "上一次还没做完" : "the last run was still going" } });
      log.append({ stream: `task:${taskId}`, origin: "schedule", kind: "task_open", body: { taskId, title: zh ? `第 ${i + 1} 次` : `Run ${i + 1}`, project: "", place: { kind: "none" }, harness: "claude-code", brief: "" } });
      log.append({ stream: `routine:${rid}`, origin: "schedule", kind: "routine_run", body: { routineId: rid, runId, scheduledFor: new Date(at).toISOString(), state: "started", taskId } });
      const l = line[o === "failed" ? line.length - 1 : i % Math.max(1, line.length - 1)]!;
      log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: o === "failed" ? "failed" : "done", summary: zh ? l[0] : l[1], questions: [], evidence: [] } as never });
      core.tasks.setState(taskId, o === "failed" ? "failed" : "done", "archived");
    });
  };
  runs(ci, ["done", "done", "failed", "done", "done", "done", "skipped", "done", "done", "failed", "done", "done"], DAY, [["全绿。", "All green."], ["红了：raft 快照测试超时，重跑过了。", "Red: the raft snapshot test timed out; a rerun passed."]]);
  runs(weekly, ["done", "done", "done", "done"], 7 * DAY, [["周报写好了，在 Notes。", "The report is in Notes."]]);
  runs(mail, ["done", "done", "failed", "failed", "failed"], DAY, [["挑出 3 封要回的。", "3 mails need a reply."], ["没能读邮件：Gmail 要重新登录。", "Couldn't read mail: Gmail needs a new sign-in."]]);
  runs(issues, ["done", "done", "done", "done", "done", "done", "done"], 4 * 3600_000, [["2 个新 issue，都是导入的问题。", "2 new issues, both about imports."], ["没有新的。", "Nothing new."], ["没有新的。", "Nothing new."]]);
  // Paused until next Monday 09:00; paused until resumed.
  const monday = new Date();
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  monday.setHours(9, 0, 0, 0);
  ws.send(JSON.stringify({ t: "ongoing_action", kind: "routine", id: weekly, action: "pause", until: monday.toISOString() }));
  ws.send(JSON.stringify({ t: "ongoing_action", kind: "routine", id: mail, action: "pause" }));
  ws.send(JSON.stringify({ t: "past_mark", taskId: ci, patch: { glyph: "ship", tint: "sage" } }));
  // The review loop's looks: eight with nothing, one that came true.
  for (let i = 0; i < 9; i++) log.append({ stream: "task:t_loop", origin: "waiter", kind: "waiter_look", body: { waiterId: "w_loop", taskId: "t_loop", ok: true, met: i === 6, summary: i === 6 ? (zh ? "有 1 个新的 review 请求：mem#512" : "1 new review request: mem#512") : zh ? "没有新的请求" : "No new requests" } });
  void issues;
  await Bun.sleep(200);
  ws.close();
}
