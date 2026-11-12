// D233: what a task is told about a key, in one place: the tool's own answer and the message that
// resumes the task when the person answers later say the same thing. Never a value: the task gets
// the path of its key file and the variable's name.
import type { KeyAsk } from "@ducter/protocol/src/saved.ts";

/** A path quoted for a POSIX shell. */
export const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** The key is in the task's key file: how to use it without ever seeing it. */
export function keyReadyText(k: Pick<KeyAsk, "env" | "name" | "file">, resumed = false): string {
  return (
    `${resumed ? "The person gave you the key you asked for: " : ""}${k.env} (${k.name}) is ready. ` +
    `Load it only inside the one command that needs it, in the same shell line: . ${shq(k.file)} && <command> ` +
    `(the command then reads $${k.env}). Never print, echo, cat or log it, nor write it into a file, a commit or your report. ` +
    `The file goes when this task ends.${resumed ? " Carry on with the work that needed it." : ""}`
  );
}

/** The person said no (不给 / Don't give). */
export function keyRefusedText(k: Pick<KeyAsk, "env" | "name">): string {
  return `The person chose not to give you ${k.env} (${k.name}). Don't ask for it again in this task. Carry on with what you can do without it, and say in your report what is left undone and why it needs that key.`;
}

/** Waiting: the card stays; the task ends its turn and is resumed when the key is there. */
export function keyAskedText(k: Pick<KeyAsk, "env" | "name">): string {
  return `Asked the person for ${k.env} (${k.name}); the card stays until they answer. End your turn now (say in one short line that you're waiting for that key); you'll be resumed with a message when it is there or if they say no. Don't ask them for it in your words or in a report.`;
}

/** The switch is off (Settings › Autofill). */
export function keysOffText(env: string): string {
  return `The person turned off tasks asking them for keys. Don't ask for ${env} again; carry on without it, and say in your report which key you need (${env}), what it is and why.`;
}
