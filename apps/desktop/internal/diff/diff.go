// Package diff reads the changes of a task's worktree with git: tracked
// changes against the base (the merge base with the base branch when it
// is known, else HEAD) plus untracked files, as one unified patch.
package diff

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Result is a worktree's patch.
type Result struct {
	Patch string
	Files int
}

func run(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	// git diff --no-index exits 1 when the files differ.
	var ee *exec.ExitError
	if errors.As(err, &ee) && ee.ExitCode() == 1 && args[0] == "diff" {
		err = nil
	}
	if err != nil {
		msg := strings.TrimSpace(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", errors.New(msg)
	}
	return out.String(), nil
}

// Worktree returns the patch of a worktree.
func Worktree(worktree, baseBranch string) (Result, error) {
	if worktree == "" {
		return Result{}, errors.New("no worktree")
	}
	if st, err := os.Stat(worktree); err != nil || !st.IsDir() {
		return Result{}, fmt.Errorf("%s: not found", worktree)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	base := "HEAD"
	if baseBranch != "" {
		if mb, err := run(ctx, worktree, "merge-base", baseBranch, "HEAD"); err == nil && strings.TrimSpace(mb) != "" {
			base = strings.TrimSpace(mb)
		}
	}
	var b strings.Builder
	tracked, err := run(ctx, worktree, "diff", "--no-color", "--no-ext-diff", base)
	if err != nil {
		// A repo with no commit yet has no HEAD: show the untracked alone.
		if !strings.Contains(err.Error(), "unknown revision") && !strings.Contains(err.Error(), "bad revision") {
			return Result{}, err
		}
	}
	b.WriteString(tracked)
	untracked, err := run(ctx, worktree, "ls-files", "--others", "--exclude-standard", "-z")
	if err != nil {
		return Result{}, err
	}
	for _, f := range strings.Split(untracked, "\x00") {
		if f == "" {
			continue
		}
		if st, err := os.Stat(filepath.Join(worktree, f)); err != nil || st.Size() > 1<<20 {
			continue
		}
		p, err := run(ctx, worktree, "diff", "--no-color", "--no-index", "--", "/dev/null", f)
		if err != nil {
			continue
		}
		if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
			b.WriteByte('\n')
		}
		b.WriteString(p)
	}
	patch := b.String()
	return Result{Patch: patch, Files: strings.Count(patch, "diff --git ")}, nil
}
