package views

import (
	"math"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D362: a running AI agent update in words that move: 正在下载（12 / 98 MB）
// while Ducter fetches the new copy, 正在装好… while its own updater puts
// it in place, the elapsed time where the bytes can't be seen, and whether
// it is slower than usual there. The web says the same
// (apps/web/src/agent-progress.ts).

// mb is whole MB (decimal, as Finder counts), at least 1 once anything came.
func mb(b int64) int {
	n := int(math.Round(float64(b) / 1e6))
	if b > 0 && n < 1 {
		return 1
	}
	return n
}

func (a *App) elapsedWords(d time.Duration) string {
	s := int(d / time.Second)
	if s < 0 {
		s = 0
	}
	if s < 60 {
		return a.L.T("upall.elapsed.s", s)
	}
	return a.L.T("upall.elapsed.m", s/60, s%60)
}

func (a *App) agentElapsed(p *protocol.AgentProgress) time.Duration {
	if p.Since == "" {
		return 0
	}
	t, err := time.Parse(time.RFC3339Nano, p.Since)
	if err != nil {
		return 0
	}
	if d := a.Now().Sub(t); d > 0 {
		return d
	}
	return 0
}

// agentUpdatingWords is the running update's line (phase "updating"); ""
// when it is not one these words know (the plain 正在更新到 x… then).
func (a *App) agentUpdatingWords(p *protocol.AgentProgress, to string) string {
	el := a.agentElapsed(p)
	switch p.Step {
	case "downloading":
		if p.Got > 0 && p.Size > 0 {
			return a.L.T("upall.step.download", mb(p.Got), mb(p.Size))
		}
		if p.Got > 0 {
			return a.L.T("upall.step.download.got", mb(p.Got))
		}
		return a.L.T("upall.step.download.time", a.elapsedWords(el))
	case "installing":
		return a.L.T("upall.step.install")
	}
	if p.Since != "" && el >= 10*time.Second {
		return a.L.T("upall.step.updating.time", to, a.elapsedWords(el))
	}
	return ""
}

// agentWaited is 再等等: per step, the elapsed time at the tap; the slow
// line comes back after another slow stretch.
var agentWaited = map[string]time.Duration{}

func (a *App) agentSlow(key string, p *protocol.AgentProgress) bool {
	if p.Since == "" || p.SlowMs <= 0 {
		return false
	}
	el := a.agentElapsed(p)
	slow := time.Duration(p.SlowMs) * time.Millisecond
	w, ok := agentWaited[key+"@"+p.Since]
	return el > slow && (!ok || el > w+slow)
}

func (a *App) agentKeepWaiting(key string, p *protocol.AgentProgress) {
	if p.Since != "" {
		agentWaited[key+"@"+p.Since] = a.agentElapsed(p)
	}
}
