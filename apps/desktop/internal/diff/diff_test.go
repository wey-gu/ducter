package diff

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t",
		"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// D471/D214: a task branch that pulled origin/main lists only its own files
// against a local main left behind, and an upstream-only file has no diff.
func TestWorktreeUsesTheForkPointWithTheRemoteBase(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "app")
	remote := filepath.Join(dir, "origin.git")
	git(t, dir, "init", "-q", "--bare", remote)
	git(t, dir, "init", "-q", "-b", "main", root)
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("keep.txt", "base\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-qm", "base")
	git(t, root, "remote", "add", "origin", remote)
	git(t, root, "push", "-q", "-u", "origin", "main")
	at := git(t, root, "rev-parse", "HEAD")
	for _, n := range []string{"00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"} {
		write("up-"+n+".txt", "up "+n+"\n")
		git(t, root, "add", ".")
		git(t, root, "commit", "-qm", "upstream "+n)
	}
	git(t, root, "push", "-q", "origin", "main")
	git(t, root, "reset", "-q", "--hard", at)
	git(t, root, "switch", "-qc", "ducter/t1")
	git(t, root, "merge", "-q", "--no-edit", "origin/main")
	write("mine-a.txt", "a\n")
	write("mine-b.txt", "b\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-qm", "task work")

	res, err := Worktree(root, "main")
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(res.Patch, "diff --git "); got != 2 {
		t.Fatalf("patch lists %d files, want the task's 2:\n%s", got, res.Patch)
	}
	if strings.Contains(res.Patch, "up-00.txt") {
		t.Fatalf("upstream-only change counted as the task's:\n%s", res.Patch)
	}
	if !strings.Contains(res.Patch, "mine-a.txt") || !strings.Contains(res.Patch, "mine-b.txt") {
		t.Fatalf("the task's own files missing from the patch:\n%s", res.Patch)
	}
}
