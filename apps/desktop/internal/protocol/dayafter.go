package protocol

// D623: the day after the first run. The partner's message carries the true facts code
// found (at most three), each a link to the thing the person set up yesterday.
type DayAfter struct {
	Items []DayAfterItem `json:"items"`
}

// DayAfterItem is one thing that was set up: its kind, the id it opens and its own name.
// Kind is "task", "keep", "account", "chat" or "app"; Chat's ID is the app ("telegram", "slack",
// "wechat"), and account/chat open Settings rather than one page.
type DayAfterItem struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Title string `json:"title"`
}
