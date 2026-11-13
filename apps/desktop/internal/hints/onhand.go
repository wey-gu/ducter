package hints

import "time"

// SeenSince is when this Mac started keeping track of new results (D244),
// set the first time it is asked: a finish before it is never new.
func (l *Local) SeenSince(now time.Time) string {
	if l == nil {
		return ""
	}
	if l.st.SeenSince == "" {
		l.st.SeenSince = now.UTC().Format(time.RFC3339Nano)
		l.save()
	}
	return l.st.SeenSince
}

// SeenAt is the task's card time when it was last open on this Mac.
func (l *Local) SeenAt(taskID string) string {
	if l == nil {
		return ""
	}
	return l.st.Seen[taskID]
}

// MarkSeen remembers the task's card time as seen; keep says which tasks
// are still around, so the rest are forgotten once there are many.
func (l *Local) MarkSeen(taskID, at string, keep func(string) bool) {
	if l == nil || at == "" || l.st.Seen[taskID] == at {
		return
	}
	if l.st.Seen == nil {
		l.st.Seen = map[string]string{}
	}
	l.st.Seen[taskID] = at
	if keep != nil && len(l.st.Seen) > 300 {
		for id := range l.st.Seen {
			if !keep(id) {
				delete(l.st.Seen, id)
			}
		}
	}
	l.save()
}

// Folded says whether the By project group is folded on this Mac.
func (l *Local) Folded(group string) bool {
	if l == nil {
		return false
	}
	for _, g := range l.st.Folded {
		if g == group {
			return true
		}
	}
	return false
}

// SetFolded folds or unfolds a By project group.
func (l *Local) SetFolded(group string, on bool) {
	if l == nil {
		return
	}
	var out []string
	for _, g := range l.st.Folded {
		if g != group {
			out = append(out, g)
		}
	}
	if on {
		out = append(out, group)
	}
	l.st.Folded = out
	l.save()
}

// BenchWidth is the workbench's dragged width, or 0.
func (l *Local) BenchWidth() float32 {
	if l == nil {
		return 0
	}
	return l.st.BenchWidth
}

// SetBenchWidth keeps the workbench's width.
func (l *Local) SetBenchWidth(w float32) {
	if l == nil {
		return
	}
	l.st.BenchWidth = w
	l.save()
}

// ScreensBoth says whether the Phone page shows its screens side by side.
func (l *Local) ScreensBoth() bool { return l != nil && l.st.Screens == "both" }

// SetScreensBoth keeps the Phone page's choice.
func (l *Local) SetScreensBoth(on bool) {
	if l == nil {
		return
	}
	l.st.Screens = ""
	if on {
		l.st.Screens = "both"
	}
	l.save()
}
