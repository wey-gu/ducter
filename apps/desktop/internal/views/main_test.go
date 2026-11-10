package views

import (
	"fmt"
	"os"
	"sort"
	"sync"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// TestMain runs every view test with the empty-placeholder guard on: a
// sentence drawn with an empty name in it ("这是  上的浏览器看到的网页")
// fails the run, whichever test drew it.
func TestMain(m *testing.M) {
	var mu sync.Mutex
	empty := map[string]bool{}
	i18n.OnEmptyArg = func(key string, arg int) {
		mu.Lock()
		empty[fmt.Sprintf("%s (placeholder %d)", key, arg+1)] = true
		mu.Unlock()
	}
	code := m.Run()
	if len(empty) > 0 {
		keys := make([]string, 0, len(empty))
		for k := range empty {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		fmt.Fprintf(os.Stderr, "FAIL: copy drawn with an empty placeholder (fill it, or don't draw the line):\n")
		for _, k := range keys {
			fmt.Fprintf(os.Stderr, "  %s\n", k)
		}
		if code == 0 {
			code = 1
		}
	}
	os.Exit(code)
}
