// D254, D541: where the reader is in a conversation, kept while it is off the screen (a task opened
// on a phone, another partner shown): one per partner, so a switch back lands where they were.

export interface Place {
  kept: boolean;
  top: number;
  following: boolean;
  mark: number;
  /** The row the New messages divider stands before, frozen when the conversation opens. */
  divider: number | undefined;
  opened: boolean;
  hiddenMark: number | undefined;
}

const fresh = (): Place => ({ kept: false, top: 0, following: true, mark: 0, divider: undefined, opened: false, hiddenMark: undefined });

/** The shown conversation's place (a live binding: a switch replaces it). */
export let place: Place = fresh();
const held = new Map<string, Place>();

/** D541: the place of the conversation left is held; the one shown comes back, else a new one. */
export function switchPlace(from: string, to: string) {
  held.set(from, place);
  place = held.get(to) ?? fresh();
  held.delete(to);
}
