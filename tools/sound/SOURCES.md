# Title sound: sources and licenses

Every recorded sound in the title moment (D87) comes from the sources below.
The files are data, downloaded by `fetch.sh` from the exact URLs in
`manifest.tsv`, and never committed; only the rendered WAVs ship. Nothing comes
from a game, a film or a copyrighted track, and no melody is quoted: the
progressions and the tone are written for Ducter (see `title2.py`).

## Samples

| Source | What we use | Author | License | Where the terms are |
|---|---|---|---|---|
| VSCO 2 Community Edition, <https://github.com/sgossner/VSCO-2-CE> | Cello, viola and violin sections (sustain, vibrato), solo contrabass (non-vibrato), flute (non-vibrato), upright piano (softest layer), pipe organ (quiet manual and pedal), glockenspiel, harp | Versilian Studios: recorded by Sam Gossner and Simon Dalzell, sample cutting by Elan Hickler / Soundemote (README); upright piano and organ sampled by Simon Dalzell of Ivy Audio | CC0 1.0 (public domain dedication) | Repository `LICENSE` and GitHub's license field (`CC0-1.0`); `Keys/Organ/Info.txt` and `Keys/Upright Piano/Info.txt`: "Bearer is granted right to redistribute this sample set by Versilian Studios LLC. Credit to both original author and Versilian Studios is encouraged." |
| University of Iowa Musical Instrument Samples (MIS), <https://theremin.music.uiowa.edu/MIS.html> | Vibraphone (struck with the sustain pedal, and bowed), crotales (the pp grand piano was tried and dropped: its noise floor is only ~20 dB under the notes) | Lawrence Fritts, University of Iowa Electronic Music Studios | Free for any use, no restrictions | MIS.html, verified 2026-11-09: "these recordings have been freely available on this website and may be downloaded and used for any projects, without restrictions." |

Credit line (not required by either license, given because it is right):
"Instrument samples: VSCO 2 Community Edition (Versilian Studios, CC0; upright
piano and organ by Simon Dalzell / Ivy Audio) and the University of Iowa Musical Instrument
Samples (Lawrence Fritts)."

## The room

| Source | What we use | Author | License |
|---|---|---|---|
| OpenAIR library, St George's Episcopal Church (stereo IRs `st_georges_close/medium/far.wav`), files at <https://webfiles.york.ac.uk/OPENAIR/IRs/st-georges-episcopal-church/> | Convolution reverb for all three variants | Adam Townsell; www.openairlib.net (Audiolab, University of York) | Public Domain (Creative Commons Public Domain), as stated on the space's OpenAIR page |

The license was read from the space's page on the original OpenAIR site
(`openairlib.net/auralizationdb/content/st-georges-episcopal-church`, archived
2018-07-02 at web.archive.org; a copy is kept with the downloaded sources).
That page asks: "Attribute this work to: www.openairlib.net Adam Townsell". The
current OpenAIR site (openair.hosted.york.ac.uk) had an expired TLS
certificate on 2026-11-09 and could not be read. Most other OpenAIR spaces are
CC BY-SA, which we avoided.

Credit line: "Reverb: St George's Episcopal Church impulse response, Adam
Townsell, OpenAIR (www.openairlib.net), public domain."

## Music excerpts (m1-m3, `excerpts.py`)

Public-domain compositions in recordings their makers released to the public
domain or under CC0, so they can be cut, mastered and shipped in the app.
Licenses were read from the source pages on 2026-11-09; the raw metadata
(archive.org item metadata, Wikimedia Commons file-page wikitext and
extmetadata) is kept with the evidence, not in git.

| Id | Piece | Performer | Recording source | Recording license |
|---|---|---|---|---|
| m1 | Frédéric Chopin, Nocturne in D-flat major, Op. 27 No. 2 (ending) | Not named in the release | Musopen, "The Complete Chopin Collection", <https://archive.org/details/musopen-chopin> (`NocturneOp27No2.mp3`, uploaded by aaron@musopen.org) | CC0 1.0 (item `licenseurl`: http://creativecommons.org/publicdomain/zero/1.0/) |
| m2 | Franz Schubert, Piano Sonata in A major, D 664, II. Andante (ending) | Paul Pitman | Musopen Kickstarter Project (2012), via Wikimedia Commons, <https://commons.wikimedia.org/wiki/File:Schubert_-_Piano_Sonata_No._13_in_A_major,_D664_-_II._Andante_(Paul_Pitman).flac> | Public domain: released by its author, Musopen (Commons templates `Musopen`, `PD-author`) |
| m3 | Frédéric Chopin, Prelude in F-sharp major, Op. 28 No. 13 (ending) | Not named in the release | Musopen, <https://archive.org/details/musopen-chopin> (`Prelude Op. 28 no. 13.mp3`) | CC0 1.0 |

All three composers died more than 150 years ago, so the works are public domain.
Musopen asks for credit when its recordings are used (a request, not a license
condition). Credit lines for Settings > About > Licenses:

- m1: "Chopin, Nocturne Op. 27 No. 2. Recording: Musopen (musopen.org), CC0."
- m2: "Schubert, Piano Sonata D 664, II. Andante. Paul Pitman, piano. Recording: Musopen (musopen.org), public domain."
- m3: "Chopin, Prelude Op. 28 No. 13. Recording: Musopen (musopen.org), CC0."

Also downloaded and checked but not used for an excerpt (see `manifest.tsv`):
Chopin Prelude Op. 28 No. 17 (Musopen, CC0); Grieg, Piano Concerto Op. 16, II
(Commons, Musopen PD; the recording has a high noise floor, about -45 dBFS
against a -23 dBFS peak); Tchaikovsky, Piano Concerto No. 1, II (Commons, CC0);
Borodin, String Quartet No. 2, III (Commons, Musopen PD). Not considered: CC BY-SA
and NC material, and Pixabay Music (its license forbids use in a trademark or
service mark and standalone redistribution, which a shipped title sound in an
open-source repo is close to).
