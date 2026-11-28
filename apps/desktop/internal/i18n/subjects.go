package i18n

// D653 (research/244 rules 1 and 8): one living card per subject. The
// same keys and words as the web client (apps/web/src/i18n-subjects.ts);
// apps/web/test/words.test.ts keeps them equal.

var zhSubjects = Table{
	"subject.working": "在做",
	"subject.waiting": "等你",
	"subject.done":    "做完了",
	"subject.failed":  "没做成",
	"subject.label":   "工作的进展",
}

var enSubjects = Table{
	"subject.working": "Working",
	"subject.waiting": "Needs you",
	"subject.done":    "Done",
	"subject.failed":  "Didn't work",
	"subject.label":   "How this work is going",
}

func init() {
	for k, v := range zhSubjects {
		zh[k] = v
	}
	for k, v := range enSubjects {
		en[k] = v
	}
}
