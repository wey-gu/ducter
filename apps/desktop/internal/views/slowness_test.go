package views

import (
	"os"
	"sort"
	"sync"
	"testing"
	"time"
)

// overBudget says whether took missed a timing budget that is a quiet Mac's,
// stretched by how slow this machine is right now: a fixed piece of CPU work,
// timed in the same process once a run, and again at the moment a
// measurement would miss (load comes and goes while a suite runs). Other
// suites, an e2e VM or a shared CI runner stretch every budget the same way,
// so a real regression still fails while load alone doesn't. Never under 1x
// (2x on CI), never over 4x. apps/web/test/slowness.ts is the web's twin.
func overBudget(t *testing.T, took, budget time.Duration) bool {
	t.Helper()
	slowMu.Lock()
	defer slowMu.Unlock()
	if slowness == 0 {
		slowness = measureSlowness()
	}
	if float64(took) > float64(budget)*slowness {
		if now := measureSlowness(); now > slowness {
			t.Logf("machine slowness %.2fx -> %.2fx", slowness, now)
			slowness = now
		}
	}
	return float64(took) > float64(budget)*slowness
}

func measureSlowness() float64 {
	const quiet = 25 * time.Millisecond // this loop on a quiet Apple-silicon Mac (28 ms at best under load ~50)
	runs := make([]time.Duration, 0, 5)
	for r := 0; r < 5; r++ {
		start := time.Now()
		a := make([]int, 0, 400_000)
		for i := 0; i < 400_000; i++ {
			a = append(a, (i*2654435761)%1000003)
		}
		sort.Ints(a)
		runs = append(runs, time.Since(start))
	}
	sort.Slice(runs, func(i, j int) bool { return runs[i] < runs[j] })
	floor := 1.0
	if os.Getenv("CI") != "" {
		floor = 2
	}
	return min(4, max(floor, float64(runs[2])/float64(quiet)))
}

var (
	slowMu   sync.Mutex
	slowness float64
)
