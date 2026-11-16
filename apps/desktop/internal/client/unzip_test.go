package client

import (
	"bytes"
	"compress/gzip"
	"testing"
)

// D284: a large frame comes gzipped, a small one as its JSON.
func TestUnzip(t *testing.T) {
	frame := []byte(`{"t":"task_history","taskId":"t1","events":[]}`)
	if got, err := Unzip(frame); err != nil || !bytes.Equal(got, frame) {
		t.Fatalf("plain: %q %v", got, err)
	}
	var b bytes.Buffer
	zw := gzip.NewWriter(&b)
	zw.Write(frame)
	zw.Close()
	if got, err := Unzip(b.Bytes()); err != nil || !bytes.Equal(got, frame) {
		t.Fatalf("gzipped: %q %v", got, err)
	}
}
