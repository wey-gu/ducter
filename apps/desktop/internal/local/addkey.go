package local

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// AddKey runs `ducter key add --json` with the pasted key on stdin (never
// an argument: those show in the process list) and returns its JSON (D298).
// Exit 1 just means the key didn't work; the JSON says why.
func (s *Supervisor) AddKey(key string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, s.CLI, "key", "add", "--json")
	cmd.Env = s.env()
	cmd.Stdin = strings.NewReader(key + "\n")
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	runErr := cmd.Run()
	if out.Len() == 0 && runErr != nil {
		return nil, fmt.Errorf("ducter key add: %v %s", runErr, strings.TrimSpace(errb.String()))
	}
	return bytes.TrimSpace(out.Bytes()), nil
}
