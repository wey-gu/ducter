package hints

// Ticks are the ticked items of a checklist in the conversation (D303),
// kept on this Mac only.
func (l *Local) Ticks(key string) []int {
	if l == nil {
		return nil
	}
	return l.st.Ticks[key]
}

// SetTicks keeps a checklist's ticks on this Mac; none forgets it.
func (l *Local) SetTicks(key string, on []int) {
	if l == nil {
		return
	}
	if l.st.Ticks == nil {
		l.st.Ticks = map[string][]int{}
	}
	if len(on) == 0 {
		delete(l.st.Ticks, key)
	} else {
		l.st.Ticks[key] = on
	}
	l.save()
}
