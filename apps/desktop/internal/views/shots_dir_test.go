package views

import (
	"os"
	"path/filepath"
	"testing"
)

// shotsDir is where screenshot tests write: $DUCTER_SHOTS_DIR, or .shots/desktop at the
// repo root. Screenshots are work evidence, not source; .shots/ is gitignored and never
// committed (decisions.md D75).
func shotsDir(t *testing.T) string {
	t.Helper()
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		dir = filepath.Join("..", "..", "..", "..", ".shots", "desktop")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}
