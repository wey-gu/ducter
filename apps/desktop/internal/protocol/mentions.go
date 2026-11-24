package protocol

import "encoding/json"

// D534: @ and / in the composers (packages/protocol/src/mentions.ts). A
// reference picked with @ or / rides with the words (Send.Refs,
// TaskSend.Refs); the home resolves it and keeps it on the message
// (UserMsg.Refs); the lists come as mention_list and slash_list.

// Ref is one reference as the app sends it: what, which one, and the name
// written in the words after @ (or /).
type Ref struct {
	Kind  string `json:"kind"` // task | keep | partner | file | pr | issue | skill | action
	ID    string `json:"id"`
	Label string `json:"label"`
}

// HeldRef is a reference as the home resolved it (UserMsg.Refs).
type HeldRef struct {
	Ref
	State   string `json:"state,omitempty"`
	About   string `json:"about,omitempty"`
	URL     string `json:"url,omitempty"`
	Missing bool   `json:"missing,omitempty"`
}

// MentionItem is one row of the @ list.
type MentionItem struct {
	Ref
	Sub       string `json:"sub,omitempty"`
	Attention string `json:"attention,omitempty"`
}

// SlashEntry is one row of the / list.
type SlashEntry struct {
	Name   string `json:"name"`
	Group  string `json:"group"` // ducter | skills | native | task
	Insert string `json:"insert,omitempty"`
	Run    string `json:"run,omitempty"` // new_task | handover | find | pause | switch | fork
	About  string `json:"about,omitempty"`
	Source string `json:"source,omitempty"`
	Ref    *Ref   `json:"ref,omitempty"`
}

// MentionFind asks for the @ list for Q (TaskID: inside that task).
type MentionFind struct {
	T      string `json:"t"` // "mention_find"
	ID     string `json:"id"`
	Q      string `json:"q"`
	TaskID string `json:"taskId,omitempty"`
}

// SlashFind asks for the / list: the partner's, or that task's.
type SlashFind struct {
	T      string `json:"t"` // "slash_find"
	ID     string `json:"id"`
	TaskID string `json:"taskId,omitempty"`
}

// MentionList is the home's answer to MentionFind.
type MentionList struct {
	ID    string        `json:"id"`
	Items []MentionItem `json:"items"`
}

// SlashList is the home's answer to SlashFind.
type SlashList struct {
	ID      string       `json:"id"`
	TaskID  string       `json:"taskId,omitempty"`
	Entries []SlashEntry `json:"entries"`
	Harness string       `json:"harness,omitempty"`
}

func decodeMentions(data []byte, f ServerFrame) (ServerFrame, error) {
	if f.T == "mention_list" {
		var m MentionList
		if err := json.Unmarshal(data, &m); err != nil {
			return f, err
		}
		f.Mentions = &m
		return f, nil
	}
	var s SlashList
	if err := json.Unmarshal(data, &s); err != nil {
		return f, err
	}
	f.Slash = &s
	return f, nil
}
