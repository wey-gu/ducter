// D547: the composer's words, sized without the DOM (so tests reach them without the app).

/** The most lines the words grow to before they scroll inside (five, as a messaging app). */
export const WORDS_LINES = 5;

/** The first (longest) of the choices whose width fits the room, else the last (shortest). */
export const longestThatFits = (choices: readonly string[], width: (s: string) => number, room: number): string => choices.find((c) => width(c) <= room) ?? choices.at(-1) ?? "";
