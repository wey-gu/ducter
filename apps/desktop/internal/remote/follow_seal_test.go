package remote

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"testing"
)

// sealForTest seals a note as the home does (follow.ts), for the tests.
func sealForTest(t *testing.T, u string, at int64) string {
	t.Helper()
	k, _ := b64.DecodeString(vecKey)
	block, _ := aes.NewCipher(k)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, 12)
	_, _ = rand.Read(nonce)
	pt, _ := json.Marshal(Note{URL: u, At: at})
	return b64.EncodeToString(append(nonce, gcm.Seal(nil, nonce, pt, []byte("ducter-addr-v1:"+vecID))...))
}
