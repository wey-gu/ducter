package protocol

import "encoding/json"

// D566: what Ducter made, kept in the person's Nowledge Mem (packages/protocol
// MemFileSaved, MemFileWhy; core/src/mem-files.ts).

// MemFileSaved is one file kept in Mem: URI is Mem's own reference
// (nowledgemem://source/<id>, which the Nowledge Mem app opens), Rev its
// version, Web Mem on the web where the person's Mem is its Cloud.
type MemFileSaved struct {
	URI string `json:"uri"`
	Rev int    `json:"rev"`
	At  string `json:"at"`
	Web string `json:"web,omitempty"`
}

// MemFileTrouble is the last file the Settings default didn't keep, and why
// (off | missing | signed_out | unreachable | secret | gone | refused | no_space | shared_space, with
// Mem's own words in Message).
type MemFileTrouble struct {
	Name    string `json:"name"`
	Why     string `json:"why"`
	Message string `json:"message,omitempty"`
	At      string `json:"at"`
}

// MemFileSaveReq is 存到 Nowledge Mem / Save to Nowledge Mem on a file
// card or in the viewer: the home keeps the file (its media id) in Mem.
type MemFileSaveReq struct {
	T     string `json:"t"` // "mem_file_save"
	ID    string `json:"id"`
	Media string `json:"media"`
	// Space (D575) is the person's answer to shared_space, once: "personal"
	// (their own Space, the default) or "shared" (the one Mem named).
	Space string `json:"space,omitempty"`
}

// MemFileShared (D575) is where Mem would put a file when its only write
// target is a Space others read: that Space's label and readers, and whether
// the person has a personal Space to keep it in instead.
type MemFileShared struct {
	Label    string `json:"label"`
	Readers  int    `json:"readers,omitempty"`
	Personal bool   `json:"personal"`
}

// MemFileAnswer is the home's answer to a MemFileSaveReq (same ID): kept,
// or why not.
type MemFileAnswer struct {
	ID      string         `json:"id"`
	Media   string         `json:"media"`
	OK      bool           `json:"ok"`
	Saved   *MemFileSaved  `json:"saved,omitempty"`
	Why     string         `json:"why,omitempty"`
	Message string         `json:"message,omitempty"`
	Shared  *MemFileShared `json:"shared,omitempty"`
}

func decodeMemFileAnswer(data []byte, f ServerFrame) (ServerFrame, error) {
	var m MemFileAnswer
	if err := json.Unmarshal(data, &m); err != nil {
		return f, err
	}
	f.MemFile = &m
	return f, nil
}

// MemKeeps is a file worth keeping in Mem, by what Mem reads: documents,
// sheets, slides, PDFs, Markdown and text, and code (protocol memKeeps).
func MemKeeps(m MediaRef) bool {
	switch m.Family() {
	case "pdf", "text", "doc", "sheet", "slides", "code":
		return true
	}
	return false
}
