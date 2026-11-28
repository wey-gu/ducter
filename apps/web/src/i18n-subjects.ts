// D653 (research/244 rules 1 and 8): one living card per subject, under the message that
// started the work. The same keys and words as the Mac (apps/desktop/internal/i18n/subjects.go);
// test/subjects.test.ts keeps them equal. A state is one word, never a joined line.
export const subjectWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "subject.working": "在做",
    "subject.waiting": "等你",
    "subject.done": "做完了",
    "subject.failed": "没做成",
    "subject.label": "工作的进展",
  },
  en: {
    "subject.working": "Working",
    "subject.waiting": "Needs you",
    "subject.done": "Done",
    "subject.failed": "Didn't work",
    "subject.label": "How this work is going",
  },
};
