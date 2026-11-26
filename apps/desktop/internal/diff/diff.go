// Package diff reads the changes of a task's worktree with git: tracked
// changes against the fork point with the base (the newer of the merge bases
// with the local base branch and with origin/<base>, when it is known; else
// HEAD) plus untracked files, as one unified patch.
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
	// D415: a read never takes an optional lock (a diff refreshes the index
	// otherwise): it can't hold index.lock while the task's worktree is made.
	cmd.Env = append(os.Environ(), "GIT_OPTIONAL_LOCKS=0")
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

// forkPoint is where the task's work starts (D471): the merge base with the
// task's base branch, or with origin/<base> when that is newer. A task that
// pulled the remote's main into its branch shares the remote's history with
// it; against a local main left weeks behind, the old merge base counted every
// upstream change as the task's own. The newer of the two is a descendant of
// the other, so --is-ancestor tells them apart. Empty when neither can be
// read.
func forkPoint(ctx context.Context, dir, base string) string {
	local, lerr := run(ctx, dir, "merge-base", base, "HEAD")
	remote, rerr := run(ctx, dir, "merge-base", "origin/"+base, "HEAD")
	l, r := strings.TrimSpace(local), strings.TrimSpace(remote)
	if lerr != nil {
		l = ""
	}
	if rerr != nil {
		r = ""
	}
	if l == "" {
		return r
	}
	if r == "" || l == r {
		return l
	}
	if _, err := run(ctx, dir, "merge-base", "--is-ancestor", l, r); err == nil {
		return r
	}
	return l
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
		if fp := forkPoint(ctx, worktree, baseBranch); fp != "" {
			base = fp
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
