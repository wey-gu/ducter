package imessage

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Row is one message of the Messages database, as the bridge needs it.
type Row struct {
	RowID int64
	GUID  string
	// Text is message.text, or the words decoded from attributedBody
	// when text is NULL (recent macOS).
	Text   string
	FromMe bool
	// Handle is the other side's address (+8613…, someone@icloud.com):
	// the sender of a received message, the recipient of a sent one.
	Handle string
	// Chat is the chat's identifier; Group is a group chat (never read).
	Chat  string
	Group bool
	Date  time.Time
	// AssocType: 2000–2006 a tapback added, 3000–3006 one removed; 0 a
	// plain message. AssocGUID is the message it is on ("p:0/<guid>").
	AssocType int
	AssocGUID string
	Files     []Attachment
}

// Attachment is one file a message carries (attachment.filename, often
// starting with ~).
type Attachment struct {
	Path string
	MIME string
}

// Tapbacks the bridge reads (associated_message_type).
const (
	TapLike    = 2001
	TapDislike = 2002
)

// Store reads the Messages database. Tests use a fake, or the real reader
// on a fixture database.
type Store interface {
	// MaxRowID is the newest message's ROWID (the cursor a fresh link
	// starts from, so nothing older is ever read).
	MaxRowID(ctx context.Context) (int64, error)
	// Since is up to limit messages after ROWID after, oldest first.
	Since(ctx context.Context, after int64, limit int) ([]Row, error)
	// Stamp changes whenever the database may hold something new (the
	// database's and its WAL's size and time); "" when unknown.
	Stamp() string
}

// Errors the reader and the sender say in words on Settings.
var (
	// ErrNoDiskAccess: macOS keeps the Messages database from this app
	// until it has Full Disk Access.
	ErrNoDiskAccess = errors.New("imessage: no Full Disk Access")
	// ErrNoMessages: there is no Messages database: Messages was never
	// set up on this Mac.
	ErrNoMessages = errors.New("imessage: Messages isn't set up")
	// ErrNoAutomation: macOS keeps this app from controlling Messages
	// (Automation › Messages is off).
	ErrNoAutomation = errors.New("imessage: no Automation permission for Messages")
	// ErrNotSignedIn: Messages has no iMessage account signed in.
	ErrNotSignedIn = errors.New("imessage: Messages isn't signed in to iMessage")
)

// DefaultDB is the Messages database of the user this app runs as.
func DefaultDB() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "Messages", "chat.db")
}

// SQLiteStore reads chat.db read-only through the sqlite3 that ships with
// macOS (no cgo, no driver in the app). The child is spawned by the app, so
// macOS counts the app's Full Disk Access for it.
type SQLiteStore struct {
	Path string
	Bin  string // "" = /usr/bin/sqlite3
}

func (s SQLiteStore) bin() string {
	if s.Bin != "" {
		return s.Bin
	}
	return "/usr/bin/sqlite3"
}

// check tells a missing database from one macOS won't let us open.
func (s SQLiteStore) check() error {
	f, err := os.Open(s.Path)
	if err == nil {
		f.Close()
		return nil
	}
	if errors.Is(err, fs.ErrNotExist) {
		// Without Full Disk Access ~/Library/Messages itself can't be
		// listed: say permission, not "not set up".
		if _, derr := os.ReadDir(filepath.Dir(s.Path)); derr != nil && !errors.Is(derr, fs.ErrNotExist) {
			return ErrNoDiskAccess
		}
		return ErrNoMessages
	}
	if errors.Is(err, fs.ErrPermission) {
		return ErrNoDiskAccess
	}
	return err
}

func (s SQLiteStore) query(ctx context.Context, sql string) ([]map[string]any, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var out, errb bytes.Buffer
	run := func(target string) error {
		out.Reset()
		errb.Reset()
		cmd := exec.CommandContext(ctx, s.bin(), "-readonly", "-json", target, sql)
		cmd.Stdout, cmd.Stderr = &out, &errb
		return cmd.Run()
	}
	err := run(s.Path)
	if err != nil && strings.Contains(errb.String(), "unable to open") && !exists(s.Path+"-wal") {
		// A WAL database with no -shm beside it (Messages not running) can't be
		// opened read-only the ordinary way; with no -wal either, the file alone
		// is the whole database, so read it as immutable.
		err = run("file:" + s.Path + "?immutable=1")
	}
	if err != nil {
		msg := strings.TrimSpace(errb.String())
		if strings.Contains(msg, "authorization denied") || strings.Contains(msg, "unable to open") {
			return nil, ErrNoDiskAccess
		}
		return nil, fmt.Errorf("imessage: reading Messages: %v: %s", err, msg)
	}
	if len(bytes.TrimSpace(out.Bytes())) == 0 {
		return nil, nil
	}
	var rows []map[string]any
	dec := json.NewDecoder(&out)
	dec.UseNumber()
	if err := dec.Decode(&rows); err != nil {
		return nil, fmt.Errorf("imessage: reading Messages: %w", err)
	}
	return rows, nil
}

// MaxRowID implements Store.
func (s SQLiteStore) MaxRowID(ctx context.Context) (int64, error) {
	rows, err := s.query(ctx, "SELECT COALESCE(MAX(ROWID),0) AS n FROM message;")
	if err != nil || len(rows) == 0 {
		return 0, err
	}
	return num(rows[0]["n"]), nil
}

// The columns are those macOS 14 and later have; a group chat is style 43.
const sinceSQL = `SELECT m.ROWID AS rowid, COALESCE(m.guid,'') AS guid, COALESCE(m.text,'') AS text,
 COALESCE(hex(m.attributedBody),'') AS body, COALESCE(m.is_from_me,0) AS from_me,
 COALESCE(h.id,'') AS handle, COALESCE(c.chat_identifier,'') AS chat, COALESCE(c.style,0) AS style,
 COALESCE(m.date,0) AS date, COALESCE(m.associated_message_type,0) AS assoc_type,
 COALESCE(m.associated_message_guid,'') AS assoc_guid,
 (SELECT GROUP_CONCAT(COALESCE(a.filename,'') || char(30) || COALESCE(a.mime_type,''), char(31))
    FROM message_attachment_join maj JOIN attachment a ON a.ROWID = maj.attachment_id
   WHERE maj.message_id = m.ROWID) AS files
FROM message m
LEFT JOIN handle h ON h.ROWID = m.handle_id
LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
LEFT JOIN chat c ON c.ROWID = cmj.chat_id
WHERE m.ROWID > %d
GROUP BY m.ROWID
ORDER BY m.ROWID
LIMIT %d;`

// Since implements Store.
func (s SQLiteStore) Since(ctx context.Context, after int64, limit int) ([]Row, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.query(ctx, fmt.Sprintf(sinceSQL, after, limit))
	if err != nil {
		return nil, err
	}
	out := make([]Row, 0, len(rows))
	for _, m := range rows {
		r := Row{
			RowID:     num(m["rowid"]),
			GUID:      str(m["guid"]),
			Text:      str(m["text"]),
			FromMe:    num(m["from_me"]) != 0,
			Handle:    str(m["handle"]),
			Chat:      str(m["chat"]),
			Group:     num(m["style"]) == 43,
			Date:      appleTime(num(m["date"])),
			AssocType: int(num(m["assoc_type"])),
			AssocGUID: str(m["assoc_guid"]),
		}
		if r.Text == "" {
			if b, err := hex.DecodeString(str(m["body"])); err == nil {
				r.Text = DecodeAttributedBody(b)
			}
		}
		r.Text = strings.ReplaceAll(r.Text, "￼", "") // the object mark an attachment leaves
		if f := str(m["files"]); f != "" {
			for _, one := range strings.Split(f, "\x1f") {
				p, mime, _ := strings.Cut(one, "\x1e")
				if p != "" {
					r.Files = append(r.Files, Attachment{Path: p, MIME: mime})
				}
			}
		}
		if r.Chat == "" {
			r.Chat = r.Handle
		}
		out = append(out, r)
	}
	return out, nil
}

// Stamp implements Store.
func (s SQLiteStore) Stamp() string {
	var b strings.Builder
	for _, p := range []string{s.Path, s.Path + "-wal"} {
		if fi, err := os.Stat(p); err == nil {
			fmt.Fprintf(&b, "%d:%d;", fi.Size(), fi.ModTime().UnixNano())
		}
	}
	return b.String()
}

// appleEpoch is 2001-01-01 UTC, where Messages counts from.
var appleEpoch = time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)

// appleTime reads message.date: nanoseconds since 2001 (seconds before
// macOS 10.13).
func appleTime(v int64) time.Time {
	if v == 0 {
		return time.Time{}
	}
	if v > 1e12 {
		return appleEpoch.Add(time.Duration(v))
	}
	return appleEpoch.Add(time.Duration(v) * time.Second)
}

// AppleDate is t as message.date stores it (for fixtures).
func AppleDate(t time.Time) int64 { return int64(t.Sub(appleEpoch)) }

func num(v any) int64 {
	switch x := v.(type) {
	case json.Number:
		n, _ := strconv.ParseInt(x.String(), 10, 64)
		return n
	case float64:
		return int64(x)
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
	}
	return 0
}

func str(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// ExpandPath turns an attachment's ~/… into a real path.
func ExpandPath(p string) string {
	if strings.HasPrefix(p, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, p[2:])
	}
	return p
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
