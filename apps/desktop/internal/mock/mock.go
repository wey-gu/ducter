// Package mock serves Ducter's client WebSocket protocol with a scripted
// scenario, so the desktop client can be developed without the real
// backend:
//
//	user msg → ack → task opened → task events → report needs_input →
//	decision → (decide go) → task events → report done with evidence →
//	ai_msg result
//
// Each message the user sends starts the scenario again as a new task, in
// a fresh temporary git repo whose worktree diff the client shows.
//
//	go run ./cmd/mockserver            # listens on 127.0.0.1:${DUCTER_PORT:-7777}
//	MOCK_SPEED=3 go run ./cmd/mockserver   # three times as fast
package mock

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"golang.org/x/net/websocket"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

const persona = "ducter"

type conn struct {
	ws *websocket.Conn
	mu sync.Mutex
}

func (c *conn) send(v any) {
	data, _ := json.Marshal(v)
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = websocket.Message.Send(c.ws, string(data))
}

type hub struct {
	mu       sync.Mutex
	seq      int64
	log      []protocol.LogEvent
	clients  map[*conn]bool
	cards    map[string]*protocol.TaskCard
	waiters  map[string]protocol.Waiter
	order    []string
	pending  map[string]*run // decision id → scenario run
	living   int64           // seq of the open (unread) living message
	livingIt []protocol.LivingItem
	readUpTo int64
	en       bool
	runs     int
	speed    float64
}

func newHub() *hub {
	speed := 1.0
	if s, err := strconv.ParseFloat(os.Getenv("MOCK_SPEED"), 64); err == nil && s > 0 {
		speed = s
	}
	h := &hub{clients: map[*conn]bool{}, cards: map[string]*protocol.TaskCard{}, waiters: map[string]protocol.Waiter{}, pending: map[string]*run{}, speed: speed}
	h.seed()
	return h
}

func (h *hub) l(zh, en string) string {
	if h.en {
		return en
	}
	return zh
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// emit appends an event and broadcasts it. Callers hold no lock.
func (h *hub) emit(stream string, origin protocol.Origin, kind string, body any, supersedes int64) protocol.LogEvent {
	return h.emitAt(time.Now(), stream, origin, kind, body, supersedes)
}

func (h *hub) emitAt(at time.Time, stream string, origin protocol.Origin, kind string, body any, supersedes int64) protocol.LogEvent {
	h.mu.Lock()
	h.seq++
	ev := protocol.NewEvent(h.seq, at.UTC().Format(time.RFC3339Nano), persona, stream, origin, kind, body)
	ev.Supersedes = supersedes
	h.log = append(h.log, ev)
	h.applyCard(ev)
	clients := h.clientList()
	h.mu.Unlock()
	for _, c := range clients {
		c.send(map[string]any{"t": "events", "events": []protocol.LogEvent{ev}})
	}
	return ev
}

func (h *hub) clientList() []*conn {
	out := make([]*conn, 0, len(h.clients))
	for c := range h.clients {
		out = append(out, c)
	}
	return out
}

// applyCard keeps the On hand cards from task events (lock held).
func (h *hub) applyCard(ev protocol.LogEvent) {
	body, _ := ev.Typed()
	switch b := body.(type) {
	case *protocol.TaskOpen:
		h.cards[b.TaskID] = &protocol.TaskCard{TaskID: b.TaskID, Persona: persona, Title: b.Title, Project: b.Project, Place: b.Place,
			Harness: b.Harness, Model: b.Model, BodyReason: b.BodyReason, Attention: protocol.Queued, Residency: protocol.Provisioning, OpenedAt: ev.TS, UpdatedAt: ev.TS}
		h.order = append([]string{b.TaskID}, h.order...)
	case *protocol.TaskState:
		if c := h.cards[b.TaskID]; c != nil {
			c.Attention, c.Residency, c.Reason, c.UpdatedAt = b.Attention, b.Residency, b.Reason, ev.TS
			if b.Attention != protocol.NeedsYou {
				c.PendingDecisionID, c.PendingDecision = "", nil
			}
		}
	case *protocol.Report:
		if c := h.cards[b.TaskID]; c != nil {
			r := *b
			c.LastReport, c.UpdatedAt = &r, ev.TS
		}
	case *protocol.Decision:
		if c := h.cards[b.TaskID]; c != nil {
			c.PendingDecisionID = b.DecisionID
			c.PendingDecision = &protocol.PendingDecision{Decision: *b, AskedAt: ev.TS}
		}
	case *protocol.DecisionResolved:
		for _, c := range h.cards {
			if c.PendingDecisionID == b.DecisionID {
				c.PendingDecisionID, c.PendingDecision = "", nil
			}
		}
	case *protocol.Waiter:
		if b.State == protocol.WaiterArmed {
			h.waiters[b.WaiterID] = *b
		} else {
			delete(h.waiters, b.WaiterID)
		}
	}
}

func (h *hub) onHand() protocol.OnHand {
	h.mu.Lock()
	defer h.mu.Unlock()
	var o protocol.OnHand
	o.Tasks = []protocol.TaskCard{}
	o.Waiters = []protocol.Waiter{}
	for _, w := range h.waiters {
		o.Waiters = append(o.Waiters, w)
	}
	for _, id := range h.order {
		c := *h.cards[id]
		o.Tasks = append(o.Tasks, c)
		switch c.Attention {
		case protocol.NeedsYou:
			o.Counts.NeedsYou++
		case protocol.Working, protocol.Queued:
			o.Counts.Working++
		case protocol.Blocked:
			o.Counts.Waiting++
		case protocol.Done, protocol.DoneClaimed:
			o.Counts.DoneToday++
		}
	}
	return o
}

func (h *hub) broadcastOnHand() {
	o := h.onHand()
	h.mu.Lock()
	clients := h.clientList()
	h.mu.Unlock()
	for _, c := range clients {
		c.send(map[string]any{"t": "on_hand", "onHand": o})
	}
}

// living revises the open living message in place while it is unread, or
// starts a new one.
func (h *hub) setLiving(items []protocol.LivingItem) {
	h.mu.Lock()
	sup := h.living
	if sup != 0 && h.readUpTo >= sup {
		sup = 0 // seen: frozen; start a fresh one
	}
	h.mu.Unlock()
	ev := h.emit("channel", protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: items}, sup)
	h.mu.Lock()
	h.living, h.livingIt = ev.Seq, items
	h.mu.Unlock()
}

func (h *hub) sleep(d time.Duration) { time.Sleep(time.Duration(float64(d) / h.speed)) }

// ---------- seed ----------

func (h *hub) seed() {
	past := func(m int) time.Time { return time.Now().Add(-time.Duration(m) * time.Minute) }
	ch := "channel"
	h.emitAt(past(90), ch, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "晚上好。手头有三件事在转：**原则英译**在写，**周报草稿**在等数据，**Mem #8762** 已经确认恢复了。有事直接说就行。"}, 0)

	open := func(at time.Time, id, title, project, harness, model, reason string, place protocol.Place) {
		h.emitAt(at, protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Project: project, Place: place,
			Harness: harness, Model: model, Brief: title, BodyReason: reason}, 0)
	}
	state := func(at time.Time, id string, a protocol.Attention, r protocol.Residency, reason string) {
		h.emitAt(at, protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: a, Residency: r, Reason: reason}, 0)
	}
	report := func(at time.Time, id, st, summary string, ev []protocol.EvidenceRef) {
		h.emitAt(at, protocol.TaskStream(id), protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: st, Summary: summary, Questions: []protocol.Question{}, Evidence: ev}, 0)
	}
	say := func(at time.Time, id, text string) {
		h.emitAt(at, protocol.TaskStream(id), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: text}, 0)
	}

	open(past(80), "t-mem", "Mem #8762 恢复确认", "Nowledge Mem", "claude-code", "sonnet", "只读检查，用便宜的模型", protocol.Place{Kind: "none"})
	state(past(80), "t-mem", protocol.Working, protocol.Hot, "")
	say(past(70), "t-mem", "连续 3 次生产健康检查都通过了。")
	report(past(60), "t-mem", "done", "生产健康检查连续 3 次通过，issue 可以关了", []protocol.EvidenceRef{{Kind: "url", Label: "健康检查记录", Ref: "https://example.com/health/8762"}})
	state(past(60), "t-mem", protocol.Done, protocol.Parked, "")

	open(past(50), "t-trans", "原则英译", "Ducter", "claude-code", "opus", "长文写作，你的规则「文档用 Claude」", protocol.Place{Kind: "folder", Device: "MacBook", Path: "~/dev/ducter/docs"})
	state(past(50), "t-trans", protocol.Working, protocol.Hot, "")
	say(past(30), "t-trans", "术语表对齐了，按原则顺序在译。")
	h.emitAt(past(25), protocol.TaskStream("t-trans"), protocol.OriginTask, protocol.KindCheckpoint, protocol.Checkpoint{TaskID: "t-trans", Text: "术语表定稿"}, 0)
	report(past(3), "t-trans", "progress", "写到第 14 条，术语表已对齐", nil)

	open(past(40), "t-weekly", "周报草稿", "", "claude-code", "sonnet", "", protocol.Place{Kind: "none"})
	state(past(40), "t-weekly", protocol.Blocked, protocol.Parked, "周日 20:00 的数据")
	report(past(39), "t-weekly", "blocked", "到点自己接着写，不占机器", nil)
	sunday := time.Now().Add(time.Duration((7-int(time.Now().Weekday()))%7) * 24 * time.Hour)
	sunday = time.Date(sunday.Year(), sunday.Month(), sunday.Day(), 20, 0, 0, 0, time.Local)
	h.emitAt(past(39), ch, protocol.OriginWaiter, protocol.KindWaiter, protocol.Waiter{WaiterID: "w-weekly", TaskID: "t-weekly", At: sunday.UTC().Format(time.RFC3339), Reason: "这周的数据到齐", State: protocol.WaiterArmed}, 0)

	// A waiter of no task: a compact row on On hand.
	morning := time.Now().Add(24 * time.Hour)
	morning = time.Date(morning.Year(), morning.Month(), morning.Day(), 9, 0, 0, 0, time.Local)
	h.emitAt(past(20), ch, protocol.OriginWaiter, protocol.KindWaiter, protocol.Waiter{WaiterID: "w-pr", At: morning.UTC().Format(time.RFC3339), Reason: "提醒你回 HawDB #1601 的评论", State: protocol.WaiterArmed}, 0)

	// A second open decision, so "Go on all defaults" has two to take.
	open(past(35), "t-deps", "升级 bun 到 1.3", "Ducter", "claude-code", "sonnet", "改动小，用便宜的模型", protocol.Place{Kind: "repo", Device: "MacBook", RepoPath: "~/dev/ducter", Branch: "ducter/bun-1.3", BaseBranch: "main"})
	state(past(35), "t-deps", protocol.Working, protocol.Hot, "")
	say(past(30), "t-deps", "升级完了，测试全过。lockfile 变了 41 行。")
	report(past(12), "t-deps", "needs_input", "bun 升到 1.3.2，bun test 全过；lockfile 变化 41 行", []protocol.EvidenceRef{{Kind: "test", Label: "bun test · 212 通过", Ref: "212 pass, 0 fail"}})
	h.emitAt(past(12), ch, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d-deps", TaskID: "t-deps", Question: "lockfile 一起提交吗？",
		GoLabel: "提交", DefaultOption: "go", DefaultAt: time.Now().Add(48 * time.Minute).UTC().Format(time.RFC3339), Reversible: true}, 0)
	state(past(12), "t-deps", protocol.NeedsYou, protocol.Warm, "")
}

// seededDecided answers the seeded decision.
func (h *hub) seededDecided(id, option string) {
	h.emit("channel", protocol.OriginSystem, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: id, Option: option, By: "user"}, 0)
	r := &run{h: h, task: "t-deps"}
	if option == "hold" {
		r.state(protocol.Blocked, protocol.Warm, h.l("你说先等等", "you said hold"))
		return
	}
	r.state(protocol.Working, protocol.Hot, "")
	h.sleep(800 * time.Millisecond)
	h.emit(r.stream(), protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: "t-deps", State: "done", Summary: h.l("lockfile 一起提交了", "Committed with the lockfile"), Questions: []protocol.Question{}, Evidence: []protocol.EvidenceRef{}}, 0)
	r.state(protocol.Done, protocol.Parked, "")
}

// ---------- the scenario ----------

type run struct {
	h        *hub
	task     string
	job      string
	userSeq  int64
	repo     string
	decision string
	n        int
}

func (h *hub) startRun(text string, clientID string) {
	userEv := h.emit("channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: text, ClientID: clientID}, 0)
	h.mu.Lock()
	h.runs++
	n := h.runs
	h.mu.Unlock()
	r := &run{h: h, task: fmt.Sprintf("t-ci-%d", n), job: fmt.Sprintf("j-%d", n), userSeq: userEv.Seq, n: n}
	go r.first(text)
}

func (r *run) stream() string { return protocol.TaskStream(r.task) }

func (r *run) say(text string) {
	r.h.emit(r.stream(), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: r.task, Role: "assistant", Text: text,
		Usage: &protocol.Usage{InputTokens: 3200, OutputTokens: 240, CacheRead: 18000}}, 0)
}

func (r *run) tool(name string, input any, output string, ok bool) {
	in, _ := json.Marshal(input)
	r.h.emit(r.stream(), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: r.task, Role: "tool",
		Tool: &protocol.ToolCall{Name: name, Input: in, Output: output, OK: &ok}}, 0)
}

func (r *run) state(a protocol.Attention, res protocol.Residency, reason string) {
	r.h.emit(r.stream(), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: r.task, Attention: a, Residency: res, Reason: reason}, 0)
	r.h.broadcastOnHand()
}

func (r *run) status(text, state string) {
	r.h.emit("channel", protocol.OriginSystem, protocol.KindJobStatus, protocol.JobStatus{JobID: r.job, Text: text, State: state, TaskID: r.task}, 0)
}

func (r *run) first(brief string) {
	h := r.h
	h.sleep(700 * time.Millisecond)
	h.emit("channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: r.job, ReplyTo: r.userSeq,
		Text: h.l("好，我去看 CI 为什么挂了。这件事单独开一件来做，好了告诉你。", "On it: I'll find out why CI fails. I'm giving it its own task and will tell you when it's done.")}, 0)
	r.repo = makeRepo(r.n)
	place := protocol.Place{Kind: "none"}
	if r.repo != "" {
		place = protocol.Place{Kind: "repo", Device: "MacBook", RepoPath: r.repo, Worktree: r.repo, Branch: "ducter/fix-ci", BaseBranch: "main"}
	}
	h.sleep(500 * time.Millisecond)
	h.emit(r.stream(), protocol.OriginSystem, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: r.task, Title: h.l("修 CI · #1592", "Fix CI · #1592"), Project: "HawDB",
		Place: place, Harness: "codex", Model: "gpt-5", Brief: brief,
		BodyReason: h.l("你的规则「后端用 Codex」，额度剩 64%，这台 Mac 上已有 hawdb 的缓存。", "Your rule \"backend goes to Codex\"; 64% quota left; this Mac has hawdb cached.")}, 0)
	r.status(h.l("在做", "working"), "running")
	r.state(protocol.Working, protocol.Hot, "")

	h.sleep(1200 * time.Millisecond)
	r.say(h.l("先拉最近 3 次失败的 run，看是不是同一个测试。", "First, the last 3 failed runs: is it the same test?"))
	h.sleep(900 * time.Millisecond)
	r.tool("Bash", map[string]string{"command": "gh run view --log-failed 48211 48212 48213"}, "FAIL storage::checkpoint_recovery (3/3 runs)\n", true)
	h.sleep(900 * time.Millisecond)
	r.say(h.l("三次都挂在 `checkpoint_recovery`，本地重跑看是不是 flaky。", "All three fail in `checkpoint_recovery`; rerunning locally to see if it's flaky."))
	h.sleep(900 * time.Millisecond)
	r.tool("Bash", map[string]string{"command": "cargo test checkpoint_recovery -- --test-threads=1 (×20)"}, "test result: FAILED. 18 passed; 2 failed\n", false)
	h.sleep(800 * time.Millisecond)
	r.say(h.l("找到了：测试里用固定的 `sleep(50ms)` 等落盘，机器忙时不够。改成等 flusher 确认。", "Found it: the test sleeps a fixed 50 ms for the flush, which is too short on a busy machine. Waiting for the flusher instead."))
	writeFix(r.repo)
	r.tool("Edit", map[string]string{"file_path": "crates/storage/tests/checkpoint_recovery.rs"}, "", true)
	h.emit(r.stream(), protocol.OriginTask, protocol.KindCheckpoint, protocol.Checkpoint{TaskID: r.task, Text: h.l("确认 flaky，改成等待落盘", "Confirmed flaky; wait for durability")}, 0)
	h.sleep(1000 * time.Millisecond)

	q := h.l("重跑通过了。但分支落后 main 23 个提交，要先 rebase 再合吗？", "The rerun passes. But the branch is 23 commits behind main: rebase before merging?")
	h.emit(r.stream(), protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: r.task, State: "needs_input",
		Summary:   h.l("CI 挂在 flaky 的 checkpoint_recovery，已修好并重跑通过；rebase 后会再跑一遍全量。", "CI failed on a flaky checkpoint_recovery; fixed, and the rerun passes. After a rebase the full suite runs again."),
		Questions: []protocol.Question{{ID: "q1", Text: q, Blocking: true, Default: "rebase", Reversible: true}},
		Evidence:  []protocol.EvidenceRef{{Kind: "log", Label: h.l("20 次本地重跑日志", "20 local reruns"), Ref: "/tmp/ducter-mock-reruns.log"}}}, 0)
	r.decision = fmt.Sprintf("d-%d", r.n)
	h.mu.Lock()
	h.pending[r.decision] = r
	h.mu.Unlock()
	h.emit("channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: r.decision, TaskID: r.task, Question: q,
		GoLabel: "rebase", DefaultOption: "go", DefaultAt: time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339), Reversible: true}, 0)
	r.state(protocol.NeedsYou, protocol.Warm, "")
	r.status(h.l("等你决定要不要 rebase", "waiting for you: rebase?"), "running")
	h.setLiving([]protocol.LivingItem{
		{TaskID: r.task, Kind: "decision", Title: h.l("修 CI", "Fix CI"), Text: q, DecisionID: r.decision},
		{TaskID: "t-mem", Kind: "done", Title: "Mem #8762", Text: h.l("生产健康检查连续 3 次通过，issue 可以关了", "health checks passed 3 times in a row; the issue can close"),
			Evidence: []protocol.EvidenceRef{{Kind: "url", Label: h.l("健康检查记录", "Health checks"), Ref: "https://example.com/health/8762"}}},
		{TaskID: "t-weekly", Kind: "blocked", Title: h.l("周报草稿", "Weekly report"), Text: h.l("在等周日 20:00 的数据，到点自动接着写", "waiting for Sunday 20:00's data; resumes on its own")},
	})
}

func (r *run) decided(option, text string) {
	h := r.h
	h.emit("channel", protocol.OriginSystem, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: r.decision, Option: option, Text: text, By: "user"}, 0)
	rest := func() []protocol.LivingItem {
		h.mu.Lock()
		defer h.mu.Unlock()
		var out []protocol.LivingItem
		for _, it := range h.livingIt {
			if it.TaskID != r.task {
				out = append(out, it)
			}
		}
		return out
	}
	if option == "hold" {
		r.state(protocol.Blocked, protocol.Warm, h.l("你说先等等", "you said hold"))
		r.status(h.l("先等等了", "on hold"), "running")
		h.setLiving(append([]protocol.LivingItem{{TaskID: r.task, Kind: "blocked", Title: h.l("修 CI", "Fix CI"), Text: h.l("先不 rebase，等你说", "not rebasing until you say so")}}, rest()...))
		return
	}
	if option == "reply" && text != "" {
		h.emit(r.stream(), protocol.OriginUser, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: r.task, Role: "user", Text: text}, 0)
	}
	r.state(protocol.Working, protocol.Hot, "")
	r.status(h.l("在 rebase", "rebasing"), "running")
	h.setLiving(append([]protocol.LivingItem{{TaskID: r.task, Kind: "progress", Title: h.l("修 CI", "Fix CI"), Text: h.l("在 rebase，完了跑全量测试", "rebasing, then the full suite")}}, rest()...))
	h.sleep(1000 * time.Millisecond)
	r.tool("Bash", map[string]string{"command": "git fetch origin && git rebase origin/main"}, "Successfully rebased and updated refs/heads/ducter/fix-ci.\n", true)
	commitAndExtend(r.repo)
	h.sleep(1000 * time.Millisecond)
	r.tool("Bash", map[string]string{"command": "cargo test --workspace"}, "test result: ok. 412 passed; 0 failed\n", true)
	h.emit(r.stream(), protocol.OriginTask, protocol.KindCheckpoint, protocol.Checkpoint{TaskID: r.task, Text: h.l("rebase 完成，全量测试通过", "Rebased; full suite green"), GitRef: "ducter/fix-ci"}, 0)
	h.sleep(900 * time.Millisecond)
	ev := []protocol.EvidenceRef{
		{Kind: "ci", Label: h.l("CI run #48219 · 绿", "CI run #48219 · green"), Ref: "https://example.com/ci/48219"},
		{Kind: "diff", Label: h.l("改动 · 2 个文件", "Diff · 2 files"), Ref: r.repo},
	}
	h.emit(r.stream(), protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: r.task, State: "done",
		Summary:   h.l("rebase 完了，全量测试 412 个都过，CI 绿了。根因是测试里固定的 sleep，已改成等待落盘。", "Rebased; all 412 tests pass and CI is green. The cause was a fixed sleep in the test, now a wait for durability."),
		Questions: []protocol.Question{}, Evidence: ev}, 0)
	r.state(protocol.Done, protocol.Parked, "")
	r.status(h.l("做完了", "done"), "done")
	h.setLiving(append([]protocol.LivingItem{{TaskID: r.task, Kind: "done", Title: h.l("修 CI", "Fix CI"), Text: h.l("CI 绿了，根因是测试里固定的 sleep", "CI is green; the cause was a fixed sleep"), Evidence: ev[:1]}}, rest()...))
	h.sleep(600 * time.Millisecond)
	h.emit("channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{ReplyTo: r.userSeq, Text: h.l(
		"CI 修好了。\n\n- **根因**：`checkpoint_recovery` 用固定的 `sleep(50ms)` 等落盘，机器忙时不够\n- **改法**：换成 `wal.wait_durable(seq)`，并加了测试专用的等待接口\n- **验证**：rebase 到最新 main 后全量 412 个测试通过，CI #48219 绿\n\n改动在 `ducter/fix-ci`，要推送的话说一声。",
		"CI is fixed.\n\n- **Cause**: `checkpoint_recovery` slept a fixed 50 ms for the flush, too short on a busy machine\n- **Fix**: wait with `wal.wait_durable(seq)`, through a new test-only hook\n- **Checked**: rebased on the latest main; all 412 tests pass; CI #48219 is green\n\nThe change is on `ducter/fix-ci`. Say the word and I'll push it.")}, 0)
}

// taskSend logs the user's text into the task (as the runner does), acks
// how it was delivered, and answers: steered while the task works, queued
// while it waits for a decision, prompted otherwise.
func (r *run) taskSend(c *conn, text string) {
	h := r.h
	h.mu.Lock()
	att := protocol.Attention("")
	if card := h.cards[r.task]; card != nil {
		att = card.Attention
	}
	h.mu.Unlock()
	delivered := protocol.DeliveryPrompted
	switch att {
	case protocol.Working:
		delivered = protocol.DeliverySteered
	case protocol.NeedsYou:
		delivered = protocol.DeliveryQueued
	}
	h.emit(r.stream(), protocol.OriginUser, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: r.task, Role: "user", From: "user", Text: text}, 0)
	c.send(map[string]any{"t": "sent", "taskId": r.task, "delivered": delivered})
	h.sleep(800 * time.Millisecond)
	h.emit(r.stream(), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: r.task, Role: "assistant",
		Text: h.l("收到，按你说的来。", "Got it; doing it your way."), Usage: &protocol.Usage{InputTokens: 1840, OutputTokens: 96, CacheRead: 22100}}, 0)
}

// ---------- git fixtures ----------

func git(dir string, args ...string) error {
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=Ducter", "GIT_AUTHOR_EMAIL=ducter@example.com", "GIT_COMMITTER_NAME=Ducter", "GIT_COMMITTER_EMAIL=ducter@example.com")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %v: %v: %s", args, err, out)
	}
	return nil
}

const testBefore = `use storage::{Wal, WalOptions};
use std::time::Duration;

#[test]
fn recovers_after_crash() -> anyhow::Result<()> {
    let dir = tempdir()?;
    let wal = Wal::open(&dir, Default::default())?;
    let seq = wal.append(b"hello")?;
    std::thread::sleep(Duration::from_millis(50));
    crash_and_reopen(&dir)?;
    let recovered = Wal::open(&dir, Default::default())?;
    assert_eq!(recovered.last_seq(), seq);
    Ok(())
}
`

const testAfter = `use storage::{Wal, WalOptions};

#[test]
fn recovers_after_crash() -> anyhow::Result<()> {
    let dir = tempdir()?;
    let wal = Wal::open(&dir, WalOptions::fsync_each())?;
    let seq = wal.append(b"hello")?;
    // wait for the flusher instead of a fixed sleep
    wal.wait_durable(seq)?;
    crash_and_reopen(&dir)?;
    let recovered = Wal::open(&dir, Default::default())?;
    assert_eq!(recovered.last_seq(), seq);
    Ok(())
}
`

const walHook = `//! Test-only hooks into the write-ahead log.

impl Wal {
    /// Blocks until every entry up to seq is on disk.
    #[cfg(any(test, feature = "test-hooks"))]
    pub fn wait_durable(&self, seq: u64) -> std::io::Result<()> {
        let mut flushed = self.flushed.lock().unwrap();
        while *flushed < seq {
            flushed = self.flushed_cv.wait(flushed).unwrap();
        }
        Ok(())
    }
}
`

func makeRepo(n int) string {
	if _, err := exec.LookPath("git"); err != nil {
		return ""
	}
	tmp, err := os.MkdirTemp("", fmt.Sprintf("ducter-mock-%d-", n))
	if err != nil {
		return ""
	}
	dir := filepath.Join(tmp, "hawdb")
	path := filepath.Join(dir, "crates/storage/tests/checkpoint_recovery.rs")
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	_ = os.WriteFile(path, []byte(testBefore), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "README.md"), []byte("# hawdb (mock)\n"), 0o644)
	for _, args := range [][]string{{"init", "-q", "-b", "main"}, {"add", "."}, {"commit", "-q", "-m", "init"}, {"checkout", "-q", "-b", "ducter/fix-ci"}} {
		if err := git(dir, args...); err != nil {
			log.Printf("mock repo: %v", err)
			return ""
		}
	}
	return dir
}

func writeFix(dir string) {
	if dir == "" {
		return
	}
	_ = os.WriteFile(filepath.Join(dir, "crates/storage/tests/checkpoint_recovery.rs"), []byte(testAfter), 0o644)
}

func commitAndExtend(dir string) {
	if dir == "" {
		return
	}
	_ = git(dir, "commit", "-q", "-am", "test: wait for durability instead of sleeping")
	p := filepath.Join(dir, "crates/storage/src/wal_test_hooks.rs")
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	_ = os.WriteFile(p, []byte(walHook), 0o644)
}

// ---------- the socket ----------

func (h *hub) serve(ws *websocket.Conn) {
	c := &conn{ws: ws}
	defer ws.Close()
	for {
		var msg string
		if err := websocket.Message.Receive(ws, &msg); err != nil {
			h.mu.Lock()
			delete(h.clients, c)
			h.mu.Unlock()
			return
		}
		var f protocol.ClientFrame
		if err := json.Unmarshal([]byte(msg), &f); err != nil {
			c.send(map[string]any{"t": "error", "message": "bad frame: " + err.Error()})
			continue
		}
		h.handle(c, f)
	}
}

func (h *hub) handle(c *conn, f protocol.ClientFrame) {
	switch f.T {
	case "hello":
		h.mu.Lock()
		h.en = f.Locale == "en"
		var events []protocol.LogEvent
		for _, ev := range h.log {
			if ev.Stream != "channel" && ev.Kind != protocol.KindTaskOpen && ev.Kind != protocol.KindTaskState {
				continue // task streams come with task_history
			}
			if f.Cursor == nil || ev.Seq > *f.Cursor {
				events = append(events, ev)
			}
		}
		if f.Cursor == nil && len(events) > 200 {
			events = events[len(events)-200:] // cursor omitted: the last 200
		}
		head := h.seq
		h.clients[c] = true
		h.mu.Unlock()
		c.send(map[string]any{"t": "welcome", "persona": persona, "personaName": "Ducter", "headSeq": head})
		if events == nil {
			events = []protocol.LogEvent{}
		}
		c.send(map[string]any{"t": "events", "events": events})
		c.send(map[string]any{"t": "on_hand", "onHand": h.onHand()})
	case "send":
		h.startRun(f.Text, f.ClientID)
	case "decide":
		if f.DecisionID == "d-deps" {
			go h.seededDecided(f.DecisionID, f.Option)
			return
		}
		h.mu.Lock()
		r := h.pending[f.DecisionID]
		delete(h.pending, f.DecisionID)
		h.mu.Unlock()
		if r == nil {
			c.send(map[string]any{"t": "error", "message": "no such decision: " + f.DecisionID})
			return
		}
		if f.Option == "hold" {
			// A held decision can still be answered later.
			h.mu.Lock()
			h.pending[f.DecisionID] = r
			h.mu.Unlock()
		}
		go r.decided(f.Option, f.Text)
	case "task_send":
		h.mu.Lock()
		var r *run
		for _, p := range h.pending {
			if p.task == f.TaskID {
				r = p
			}
		}
		h.mu.Unlock()
		if r == nil {
			r = &run{h: h, task: f.TaskID}
		}
		go r.taskSend(c, f.Text)
	case "task_action":
		r := &run{h: h, task: f.TaskID}
		switch f.Action {
		case "interrupt":
			r.state(protocol.Blocked, protocol.Warm, h.l("你打断了", "interrupted"))
		case "drop":
			r.state(protocol.Dropped, protocol.Archived, "")
		case "reopen":
			r.state(protocol.Working, protocol.Hot, "")
		}
	case "read":
		h.mu.Lock()
		if f.UpToSeq <= h.readUpTo {
			h.mu.Unlock()
			return
		}
		h.readUpTo = f.UpToSeq
		h.mu.Unlock()
		h.emit("channel", protocol.OriginUser, protocol.KindReadReceipt, protocol.ReadReceipt{UpToSeq: f.UpToSeq}, 0)
	case "task_history":
		h.mu.Lock()
		events := []protocol.LogEvent{}
		for _, ev := range h.log {
			if ev.Stream == protocol.TaskStream(f.TaskID) && (f.BeforeSeq == 0 || ev.Seq < f.BeforeSeq) {
				events = append(events, ev)
			}
		}
		h.mu.Unlock()
		if f.Limit > 0 && len(events) > f.Limit {
			events = events[len(events)-f.Limit:]
		}
		c.send(map[string]any{"t": "task_history", "taskId": f.TaskID, "events": events})
	default:
		c.send(map[string]any{"t": "error", "message": "unknown frame: " + f.T})
	}
}

// Hub is a scripted Ducter main process.
type Hub = hub

// NewHub makes a hub; speed > 1 runs the scenario faster (0 reads
// MOCK_SPEED, default 1).
func NewHub(speed float64) *Hub {
	h := newHub()
	if speed > 0 {
		h.speed = speed
	}
	return h
}

// Speed is how fast the scenario runs.
func (h *hub) Speed() float64 { return h.speed }

// Handler serves the protocol's WebSocket (mount it at /ws).
func (h *hub) Handler() http.Handler {
	return websocket.Server{Handler: h.serve, Handshake: func(*websocket.Config, *http.Request) error { return nil }}
}
