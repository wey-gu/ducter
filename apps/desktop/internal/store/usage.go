package store

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// UsageState is the week's count the home last gave (D591), for Settings ›
// Overview and the limit card; Asked is when this app last asked for it.
type UsageState struct {
	Report  *protocol.UsageReport
	Asked   time.Time
	Version int
}

func (s *Store) applyUsage(f protocol.ServerFrame) {
	if f.UsageFor == nil {
		return // an error keeps the last count
	}
	s.Usage.Report = f.UsageFor
	s.Usage.Version++
}
