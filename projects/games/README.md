# Wordplay

Three daily word games that run entirely in the browser: no server, no accounts, no tracking. Static files you can host anywhere (GitHub Pages, Cloudflare Pages, a USB stick).

| Game | Idea | Inspired by |
|---|---|---|
| **Nearest** | Find the secret word. Every guess is ranked by closeness in meaning; rank 1 is the answer. Hints and give-up included. | Contexto |
| **Fours** | Sixteen words, four hidden groups of four, four mistakes allowed, "one away" feedback. | Conexo / Connections |
| **Bridge** | Clue words with a gap: type one word that fits all of them. Scored 0-1000 by how close it is to *every* clue at once; five rounds (two-word bridge, three-word bridge, closest connection). | Chainle |

Everyone gets the same puzzle each UTC day; any puzzle number can be replayed (`#/nearest?n=12`). Progress, streaks and stats stay in `localStorage`.

## Run it

```sh
python3 -m http.server 8090 -d site      # then open http://localhost:8090
```

No build step. Plain ES modules, strict CSP (no inline scripts or styles).

## How the games work

Nearest and Bridge share one *word space*: 13,861 English words, each a 160-number vector (2.2 MB, `site/data/vectors.bin`). Similarity is the cosine between vectors.

- **Nearest** ranks all words by similarity to the secret word. A typed word is reduced to its base form (`dogs` counts as `dog`). Hints reveal the word halfway to the answer.
- **Bridge** scores a guess as `0.75 * weakest similarity + 0.25 * mean similarity` over the clues, then rescales so the best word the data knows scores exactly 1000 and unrelated words score about 0. A word that fits one clue but not the others therefore scores low. After each round the strongest answers are shown.
- **Fours** puzzles are hand-written (`tools/fours.txt`), so they have real red herrings.

## Data pipeline (`tools/`)

Runs offline, results are committed to `site/data/`.

```sh
pip install numpy wordfreq english-words gender-guesser geonamescache
curl -O https://conceptnet.s3.amazonaws.com/downloads/2019/numberbatch/numberbatch-en-19.08.txt.gz       # 325 MB, not committed
curl -O https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt
python3 tools/build_data.py --numberbatch numberbatch-en-19.08.txt.gz --common google-10000-english-no-swears.txt
python3 tools/build_puzzles.py       # bridges.json from the vectors + tools/concrete.txt
python3 tools/build_fours.py         # fours.json from tools/fours.txt (also validates)
```

`build_data.py` keeps common lowercase dictionary words (names and places are removed from answers and clues), drops simple inflections, reduces 300 to 160 dimensions with PCA and quantises to int8. On 300 random words, 84% of each word's true top-50 neighbours survive the reduction. A small blocklist keeps profanity and sexual terms out of guesses and answers; it is a guard, not a content filter.

## Tests

```sh
node --test tests/*.test.mjs                       # scoring, ranking, daily logic, data integrity
python3 -m http.server 8090 -d site &              # then, with playwright installed:
node tests/e2e/games.cjs                           # plays every game through the UI, mobile layout, CSP
```

## Known limits

- The word list is 13.8k words: rare words are "not in the list". Nearest answers come from the 3k common words in `secrets.txt`.
- Similarity comes from ConceptNet Numberbatch and sometimes surprises (it mixes meaning and association). Bridge puzzles are generated and filtered by the scoring itself, then spot-checked, not individually reviewed: expect a few odd ones (`tools/build_puzzles.py --seed N` makes a new set).
- There are 17 Fours puzzles; the sequence repeats after 17 days. Add more to `tools/fours.txt`.
- Day numbers are UTC; "same puzzle for everyone" is by date only, there is no server to check.

## Licence of the data

`site/data/words.txt` and `vectors.bin` are derived from [ConceptNet Numberbatch](https://github.com/commonsense/conceptnet-numberbatch) (CC BY-SA 4.0; Speer, Chin & Havasi, *ConceptNet 5.5*, AAAI 2017), and the vocabulary is selected using [wordfreq](https://github.com/rspeer/wordfreq) (data CC BY-SA 4.0). Derived data must be shared under the same licence with attribution. Choose the licence for the rest of the code yourself.
