// D300: one realistic day (and the day before) of things Ducter did for the person, as core logs
// them: a mail sent after its Go, a hotel paid with the saved card, a call placed on a Tuwa line,
// a saved sign-in filled, a calendar event added, a merge, a folder task's files, a message to the
// person's own Claude Code over Bridge, and a routine reading Gmail. Used by the core tests, the
// partner eval (`did-today-*`) and the web demo (DEMO_DID=1). Content is the author's kind of day.
import type { Bodies, Place } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { SavedUse } from "@ducter/protocol";

export interface DidDayCore {
  log: LogStore;
  autofill?: { store: { record(use: Omit<SavedUse, "at"> & { at?: string }): void } };
}

export interface DidDayOpts {
  zh: boolean;
  /** Moves the Log's clock by ms (negative: earlier) while an event is appended; absent: everything is now. */
  setSkew?: (ms: number) => void;
  /** Also the day before (needs setSkew to land there). */
  yesterday?: boolean;
  /** The home's time now (default Date.now()). */
  now?: number;
  /** Moves the whole day by ms (-1 day: everything lands yesterday and before, today stays empty). */
  shift?: number;
}

type W = [string, string];

export function seedDidDay(core: DidDayCore, o: DidDayOpts) {
  const { log } = core;
  const now = o.now ?? Date.now();
  const L = (w: W) => (o.zh ? w[0] : w[1]);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  /** A local time today (or `day` days ago), never later than a minute ago. */
  const at = (hm: string, day = 0) => {
    const [h, m] = hm.split(":").map(Number) as [number, number];
    const t = midnight.getTime() - day * 24 * 3600_000 + (h * 60 + m) * 60_000;
    return Math.min(t, now - 60_000 * (day ? 1 : 2)) + (o.shift ?? 0);
  };
  const when = (t: number) => {
    o.setSkew?.(t - now);
    return new Date(o.setSkew ? t : now).toISOString();
  };
  const done = () => o.setSkew?.(0);

  const mac: Place = { kind: "folder", device: "local", path: "~/Documents/Invoices" };
  const repo: Place = { kind: "repo", device: "local", repoPath: "~/dev/hawdb", branch: "ducter/fix-flaky-ci", baseBranch: "main" };
  const open = (taskId: string, title: W, place: Place = { kind: "none" }, t = at("08:30")) => {
    when(t);
    log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: L(title), project: place.kind === "repo" ? "hawdb" : "", place, harness: "claude-code", brief: L(title) } });
  };
  const decide = (decisionId: string, body: Partial<Bodies["decision"]>, t: number, by: "user" | "default" = "user") => {
    when(t - 60_000);
    log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId, question: "", goLabel: "Go", defaultOption: "hold", reversible: false, ...body } as Bodies["decision"] });
    when(t);
    log.append({ stream: "channel", origin: by === "user" ? "user" : "system", kind: "decision_resolved", body: { decisionId, option: "go", by } });
  };

  // The routine that reads the inbox each morning.
  when(at("07:00"));
  log.append({ stream: "channel", origin: "partner", kind: "routine", body: { routineId: "r_inbox", name: L(["早上的邮件", "Morning inbox"]), trigger: { kind: "time", every: "day", time: "07:30", tz: "Asia/Shanghai" }, triggerWords: L(["每天 7:30", "Every day at 7:30"]), brief: "Read the inbox", reports: "every", effect: "read_only", budget: { monthTokens: 400000 }, state: "active", createdAt: new Date(at("07:00")).toISOString() } as unknown as Bodies["routine"] });
  log.append({ stream: "channel", origin: "system", kind: "routine_run", body: { routineId: "r_inbox", runId: "run1", scheduledFor: new Date(at("07:30")).toISOString(), state: "started", taskId: "t_inbox" } });
  open("t_inbox", ["早上的邮件", "Morning inbox"], { kind: "none" }, at("07:30"));
  for (let i = 0; i < 23; i++) {
    when(at("07:31") + i * 20_000);
    log.append({ stream: "task:t_inbox", origin: "task", kind: "connection_call", body: { callId: `rd${i}`, connectionId: "c_gmail", connection: "Gmail", action: "gmail.search_threads", op: "read", state: "done", taskId: "t_inbox", summary: "12 threads" } });
  }
  for (let i = 0; i < 4; i++) {
    when(at("08:05") + i * 60_000);
    log.append({ stream: "channel", origin: "partner", kind: "connection_call", body: { callId: `rc${i}`, connectionId: "c_gcal", connection: "Google Calendar", action: "calendar.list_events", op: "read", state: "done", summary: "6 events" } });
  }

  // 09:12 a mail to Zhang Wei, after its Go.
  open("t_budget", ["准备 Q4 预算", "Prepare the Q4 budget"], { kind: "none" }, at("08:40"));
  decide("d_mail", { taskId: "t_budget", question: L(["把 Q4 预算草稿发给 Zhang Wei？", "Send the Q4 budget draft to Zhang Wei?"]), goLabel: L(["发出去", "Send"]) }, at("09:11"));
  when(at("09:12"));
  log.append({ stream: "task:t_budget", origin: "task", kind: "connection_call", body: { callId: "w_mail", connectionId: "c_gmail", connection: "Gmail", action: "gmail.send_message", op: "write", state: "done", taskId: "t_budget", decisionId: "d_mail", input: { to: "zhang.wei@hawdb.io", subject: "Q4 budget" }, summary: L(["Q4 预算草稿，附表格", "Q4 budget draft, sheet attached"]) } });

  // 10:41 the hotel, paid with the saved card after Pay.
  open("t_hotel", ["订东京的酒店", "Book a hotel in Tokyo"], { kind: "browser", device: "local", profile: "ducter" }, at("10:05"));
  decide("d_pay", { taskId: "t_hotel", question: L(["付款", "Pay"]), goLabel: L(["付款", "Pay"]), pay: { site: "hotelokura.co.jp", amount: "312.00", currency: "USD", what: L(["Okura 东京，12 月 5 日一晚", "Okura Tokyo, one night, Dec 5"]), handle: "card:visa-4242", card: "Visa ••4242", last4: "4242", needsCvc: true, firstHere: true } }, at("10:41"));
  core.autofill?.store.record({ at: new Date(at("10:20")).toISOString(), handle: "signin:hotelokura.co.jp", label: "Okura (wey@…)", site: "hotelokura.co.jp", what: "ok", taskId: "t_hotel", task: L(["订东京的酒店", "Book a hotel in Tokyo"]) });
  core.autofill?.store.record({ at: new Date(at("10:21")).toISOString(), handle: "signin:hotelokura.co.jp", label: "Okura (wey@…)", site: "hotelokura.co.jp", what: "filled", taskId: "t_hotel", task: L(["订东京的酒店", "Book a hotel in Tokyo"]) });

  // 11:05 a saved GitHub sign-in, allowed there before.
  open("t_review", ["review mem 的 PR 482", "Review mem PR 482"], { kind: "browser", device: "local", profile: "ducter" }, at("11:00"));
  core.autofill?.store.record({ at: new Date(at("11:05")).toISOString(), handle: "signin:github.com", label: "GitHub (wey-gu)", site: "github.com", what: "filled", taskId: "t_review", task: L(["review mem 的 PR 482", "Review mem PR 482"]) });

  // 11:20 a call to Sushi Saito on a Tuwa line.
  open("t_sushi", ["订周六的寿司", "Book sushi for Saturday"], { kind: "none" }, at("11:10"));
  decide("d_call", { taskId: "t_sushi", question: L(["打给 Sushi Saito？", "Call Sushi Saito?"]), goLabel: L(["打", "Call"]), call: { callId: "call_saito", kind: "go" } }, at("11:19"));
  const plan = { to: "+81335890110", name: "Sushi Saito", goal: L(["订周六晚上 7 点两位", "Book Saturday 7 pm for two"]), say: [], mustNot: [], voice: "ducter" as const, from: "provider" as const, provider: "Tuwa", minutes: 4, costUsd: 1.6, perMinUsd: 0.4, calleeZone: "Asia/Tokyo" };
  when(at("11:24"));
  log.append({ stream: "channel", origin: "system", kind: "phone_call", body: { callId: "call_saito", connectionId: "c_tuwa", state: "done", plan, taskId: "t_sushi", decisionId: "d_call", placedAt: new Date(at("11:20")).toISOString(), endedAt: new Date(at("11:24")).toISOString(), outcome: "booked", durationSec: 212 } as unknown as Bodies["phone_call"] });

  // 13:30 an event added to the calendar, after its Go.
  decide("d_cal", { question: L(["加到日历：看牙", "Add to the calendar: Dentist"]), goLabel: L(["加上", "Add"]), cal: { kind: "create", title: L(["看牙", "Dentist"]), calendar: L(["个人", "Personal"]), account: "wey@gmail.com", start: new Date(at("13:00") + 2 * 24 * 3600_000).toISOString(), end: new Date(at("14:00") + 2 * 24 * 3600_000).toISOString(), notify: [] } as never }, at("13:29"));
  when(at("13:30"));
  log.append({ stream: "channel", origin: "partner", kind: "connection_call", body: { callId: "w_cal", connectionId: "c_gcal", connection: "Google Calendar", action: "calendar.create_event", op: "write", state: "done", decisionId: "d_cal", link: "https://calendar.google.com/calendar/event?eid=demo" } });

  // 14:02 the person merged the flaky-CI fix.
  open("t_ci", ["修 hawdb 不稳定的 CI", "Fix hawdb's flaky CI"], repo, at("12:10"));
  when(at("14:02"));
  log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: "act_t_ci_merge", taskId: "t_ci", state: "done", text: "the user merged this task's branch", act: "merge", ref: "a1c9e07" } });

  // 15:10 a folder task sorted the invoices: 14 files, undoable for a week.
  open("t_invoices", ["整理发票文件夹", "Sort the invoices folder"], mac, at("14:40"));
  when(at("15:10"));
  log.append({ stream: "task:t_invoices", origin: "task", kind: "report", body: { taskId: "t_invoices", state: "done", summary: L(["按月份分好了，重复的 3 张删了。", "Sorted by month; removed 3 duplicates."]), questions: [], evidence: [], folder: { added: 2, changed: 0, removed: 3, moved: 9, renamed: 0, folders: 4, undo: "open", undoUntil: new Date(at("15:10") + 7 * 24 * 3600_000).toISOString(), at: new Date(at("15:10")).toISOString() } } });

  // 16:40 a message to the person's own Claude Code, over Bridge.
  for (const state of ["sending", "sent"] as const) {
    when(at("16:40"));
    log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m_bench", to: "Claude Code", agent: "Claude Code", mine: true, text: L(["HawDB 压缩的基准结果在 bench/README.md，第三列是新的。", "HawDB's compaction benchmarks are in bench/README.md; the third column is new."]), state, opId: "op_bench" } });
  }

  if (o.yesterday && o.setSkew) {
    open("t_mom", ["跟妈妈说周六见", "Tell Mom see you Saturday"], { kind: "none" }, at("19:00", 1));
    decide("d_mom", { taskId: "t_mom", question: L(["发给妈妈：周六见", "To Mom: see you Saturday"]), goLabel: L(["发送", "Send"]), phone: { kind: "go", app: "com.google.android.apps.messaging", name: L(["信息", "Messages"]), label: L(["发送", "Send"]), effect: "send" } }, at("19:06", 1));
    open("t_notion", ["清理旧的路线图", "Clean up the old roadmap"], { kind: "none" }, at("16:00", 1));
    decide("d_notion", { taskId: "t_notion", question: L(["删掉 Notion 里的「旧路线图草稿」？", "Delete \"Old roadmap draft\" in Notion?"]), goLabel: L(["删掉", "Delete"]) }, at("16:12", 1));
    when(at("16:12", 1));
    log.append({ stream: "task:t_notion", origin: "task", kind: "connection_call", body: { callId: "w_notion", connectionId: "c_notion", connection: "Notion", action: "notion.delete_page", op: "write", state: "done", taskId: "t_notion", decisionId: "d_notion", summary: L(["旧路线图草稿", "Old roadmap draft"]) } });
    open("t_dentist", ["给牙医打电话改约", "Call the dentist to move the appointment"], { kind: "none" }, at("10:00", 1));
    decide("d_dent", { taskId: "t_dentist", question: L(["打给 Bright Smile 牙科？", "Call Bright Smile Dental?"]), goLabel: L(["打", "Call"]), call: { callId: "call_dent", kind: "go" } }, at("10:02", 1));
    when(at("10:04", 1));
    log.append({ stream: "channel", origin: "system", kind: "phone_call", body: { callId: "call_dent", connectionId: "c_tuwa", state: "no_answer", plan: { ...plan, to: "+14155550123", name: "Bright Smile Dental", goal: L(["把周四的预约改到下周", "Move Thursday's appointment to next week"]), provider: "own", from: "own" }, taskId: "t_dentist", decisionId: "d_dent", placedAt: new Date(at("10:03", 1)).toISOString(), endedAt: new Date(at("10:04", 1)).toISOString() } as unknown as Bodies["phone_call"] });
    open("t_mail_mac", ["回复 Lina 的邮件", "Reply to Lina's mail"], { kind: "none", device: "local" }, at("09:00", 1));
    decide("d_mac", { taskId: "t_mail_mac", question: L(["在邮件里把回复发给 Lina Chen", "Send the reply to Lina Chen in Mail"]), goLabel: L(["发送", "Send"]), computer: { kind: "go", app: L(["邮件", "Mail"]), label: L(["发送", "Send"]), effect: "send" } }, at("09:20", 1));
  }
  done();
}
