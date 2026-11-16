package imessage

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// archived is an attributedBody as Messages writes it: a typedstream of an
// NSAttributedString whose first NSString is the words.
func archived(text string) []byte {
	head, _ := hex.DecodeString("040b73747265616d747970656481e803840140848484124e5341747472696275746564537472696e67008484084e534f626a656374008592848484084e53537472696e67019484012b")
	b := append([]byte{}, head...)
	n := len(text)
	switch {
	case n < 0x80:
		b = append(b, byte(n))
	case n < 0x10000:
		b = append(b, 0x81, byte(n), byte(n>>8))
	default:
		b = append(b, 0x82, byte(n), byte(n>>8), byte(n>>16), byte(n>>24))
	}
	b = append(b, text...)
	// What follows the string: its attributes (never read).
	tail, _ := hex.DecodeString("8684026949011e928484840c4e5344696374696f6e617279")
	return append(b, tail...)
}

func TestDecodeAttributedBody(t *testing.T) {
	long := strings.Repeat("看下 CI 为什么挂了。", 30) // over 127 bytes: a two-byte length
	for name, text := range map[string]string{"short": "hi", "chinese": "帮我看看今天的日程", "long": long, "marks": "a\x01+b"} {
		if got := DecodeAttributedBody(archived(text)); got != text {
			t.Errorf("%s: got %q", name, got)
		}
	}
	if got := DecodeAttributedBody([]byte("garbage that is no archive")); got != "garbage that is no archive" {
		t.Errorf("plain bytes: %q", got)
	}
	if got := DecodeAttributedBody([]byte{0x04, 0x0b, 'x'}); got != "" {
		t.Errorf("short header: %q", got)
	}
	if got := DecodeAttributedBody(nil); got != "" {
		t.Errorf("nil: %q", got)
	}
	// A length past the end decodes to nothing, never to a guess.
	b := archived("hello")
	b = b[:len(b)-30]
	if got := DecodeAttributedBody(b); got != "" {
		t.Errorf("cut: %q", got)
	}
}

// fixture builds a chat.db with the tables macOS has, minimally, in a temp
// directory. Never the person's own Messages.
func fixture(t *testing.T) (string, func(sql string)) {
	t.Helper()
	if _, err := exec.LookPath("sqlite3"); err != nil {
		t.Skip("no sqlite3 here")
	}
	path := filepath.Join(t.TempDir(), "chat.db")
	run := func(sql string) {
		t.Helper()
		out, err := exec.Command("sqlite3", path, sql).CombinedOutput()
		if err != nil {
			t.Fatalf("sqlite3: %v: %s", err, out)
		}
	}
	run(`PRAGMA journal_mode=WAL;
CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, service TEXT);
CREATE TABLE chat (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, style INTEGER, chat_identifier TEXT, service_name TEXT);
CREATE TABLE message (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, text TEXT, attributedBody BLOB,
  handle_id INTEGER DEFAULT 0, service TEXT, date INTEGER, is_from_me INTEGER DEFAULT 0,
  associated_message_guid TEXT, associated_message_type INTEGER DEFAULT 0, cache_has_attachments INTEGER DEFAULT 0);
CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER, message_date INTEGER DEFAULT 0, PRIMARY KEY (chat_id, message_id));
CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER);
CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT, filename TEXT, mime_type TEXT, transfer_name TEXT);
CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
INSERT INTO handle (id, service) VALUES ('+8613800000000', 'iMessage'), ('stranger@icloud.com', 'iMessage'), ('friend@icloud.com', 'iMessage');
INSERT INTO chat (guid, style, chat_identifier, service_name) VALUES ('iMessage;-;+8613800000000', 45, '+8613800000000', 'iMessage'),
  ('iMessage;+;chat1', 43, 'chat1', 'iMessage');`)
	return path, run
}

func TestSQLiteStoreReadsAFixture(t *testing.T) {
	// The store runs the sqlite3 that ships with macOS (/usr/bin/sqlite3); Messages exists only there.
	if runtime.GOOS != "darwin" {
		t.Skip("the Messages database is macOS only")
	}
	path, run := fixture(t)
	now := time.Date(2026, 11, 16, 10, 0, 0, 0, time.UTC)
	d := AppleDate(now)
	run(fmt.Sprintf(`
INSERT INTO message (guid, text, handle_id, service, date, is_from_me) VALUES ('g1', '看下 CI', 1, 'iMessage', %[1]d, 0);
INSERT INTO message (guid, text, attributedBody, handle_id, service, date, is_from_me) VALUES ('g2', NULL, X'%[2]s', 1, 'iMessage', %[1]d, 0);
INSERT INTO message (guid, text, handle_id, service, date, is_from_me) VALUES ('g3', 'in a group', 3, 'iMessage', %[1]d, 0);
INSERT INTO message (guid, text, handle_id, service, date, is_from_me, cache_has_attachments) VALUES ('g4', char(65532), 1, 'iMessage', %[1]d, 0, 1);
INSERT INTO message (guid, text, handle_id, service, date, is_from_me, associated_message_guid, associated_message_type) VALUES ('g5', 'Liked “x”', 1, 'iMessage', %[1]d, 0, 'p:0/g9', 2001);
INSERT INTO chat_message_join (chat_id, message_id) VALUES (1,1),(1,2),(2,3),(1,4),(1,5);
INSERT INTO attachment (guid, filename, mime_type) VALUES ('a1', '~/Library/Messages/Attachments/ab/IMG_1.heic', 'image/heic');
INSERT INTO message_attachment_join (message_id, attachment_id) VALUES (4, 1);`, d, strings.ToUpper(hex.EncodeToString(archived("帮我订明天的会议室")))))
	s := SQLiteStore{Path: path}
	ctx := context.Background()
	max, err := s.MaxRowID(ctx)
	if err != nil || max != 5 {
		t.Fatalf("max %d %v", max, err)
	}
	rows, err := s.Since(ctx, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 5 {
		t.Fatalf("rows %d", len(rows))
	}
	if r := rows[0]; r.Text != "看下 CI" || r.Handle != "+8613800000000" || r.Chat != "+8613800000000" || r.FromMe || r.Group || !r.Date.Equal(now) {
		t.Errorf("row 1: %+v", r)
	}
	if r := rows[1]; r.Text != "帮我订明天的会议室" {
		t.Errorf("attributedBody: %+v", r)
	}
	if !rows[2].Group {
		t.Errorf("the group chat: %+v", rows[2])
	}
	if r := rows[3]; r.Text != "" || len(r.Files) != 1 || r.Files[0].MIME != "image/heic" || !strings.HasSuffix(r.Files[0].Path, "IMG_1.heic") {
		t.Errorf("attachment: %+v", r)
	}
	if r := rows[4]; r.AssocType != TapLike || r.AssocGUID != "p:0/g9" {
		t.Errorf("tapback: %+v", r)
	}
	if rows, _ := s.Since(ctx, 4, 10); len(rows) != 1 || rows[0].GUID != "g5" {
		t.Errorf("after a cursor: %+v", rows)
	}
	if s.Stamp() == "" {
		t.Error("no stamp")
	}
}

func TestSQLiteStoreSaysWhyItCantRead(t *testing.T) {
	dir := t.TempDir()
	if _, err := (SQLiteStore{Path: filepath.Join(dir, "chat.db")}).MaxRowID(context.Background()); !errors.Is(err, ErrNoMessages) {
		t.Errorf("missing: %v", err)
	}
	if os.Geteuid() == 0 {
		t.Skip("root reads anything")
	}
	locked := filepath.Join(dir, "locked.db")
	if err := os.WriteFile(locked, nil, 0o000); err != nil {
		t.Fatal(err)
	}
	if _, err := (SQLiteStore{Path: locked}).Since(context.Background(), 0, 1); !errors.Is(err, ErrNoDiskAccess) {
		t.Errorf("no access: %v", err)
	}
}

func TestOsaErrors(t *testing.T) {
	if !errors.Is(osaError("execution error: Not authorized to send Apple events to Messages. (-1743)", errors.New("exit 1")), ErrNoAutomation) {
		t.Error("-1743")
	}
	if !errors.Is(osaError("execution error: Can’t get account 1. (-1728)", errors.New("exit 1")), ErrNotSignedIn) {
		t.Error("-1728")
	}
	if err := osaError("boom", errors.New("exit 1")); errors.Is(err, ErrNoAutomation) || err == nil {
		t.Error("other")
	}
}
