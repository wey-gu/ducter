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
// (off | missing | signed_out | unreachable | secret | gone | refused, with
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
}

// MemFileAnswer is the home's answer to a MemFileSaveReq (same ID): kept,
// or why not.
type MemFileAnswer struct {
	ID      string        `json:"id"`
	Media   string        `json:"media"`
	OK      bool          `json:"ok"`
	Saved   *MemFileSaved `json:"saved,omitempty"`
	Why     string        `json:"why,omitempty"`
	Message string        `json:"message,omitempty"`
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
