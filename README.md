# TOPIK Daily Five

A personal Korean vocabulary app for iPhone Safari (no Mac, no App Store).

- 5 new words a day, one at a time between 09:00 and 23:00 (09:00, 11:48, 14:36, 17:24, 20:12).
- Each word: English meaning, simple Korean meaning, one example sentence in Korean and English.
  Every word in the sentence can be tapped for its meaning, romanization and dictionary form.
- 5 games per word: Match, Fill the blank, Sentence builder, Listen and choose, Right form.
- Recap of the day's 5 words (best around 22:30).
- Levels of 60 days (300 words). After 60 days the level exam opens: 40 questions, pass with 32 (80%).
  New words pause until you pass. Fail → retake the next day.
- Practice any level you have reached, any time: 10-question round, 20-question mini test, weak words.
- Progress is stored on the phone. Me → Save backup writes a file to the Files app.

## Files

| Path | What |
|---|---|
| `index.html`, `styles.css`, `app.js` | the app |
| `sw.js` | offline cache (bump `VERSION` after any change) |
| `manifest.webmanifest`, `icons/` | home-screen app name and icon |
| `data/level1.json` ... `data/level6.json` | words for each level (300 each), built from `tools/parts/` |
| `tools/level1_wordlist.json` ... `level6_wordlist.json` | the 60-day word plan for each level |
| `tools/CONTENT_BRIEF.md` | rules used to write the word content |
| `tools/validate.py` | checks content files |
| `tools/build.py` | merges `tools/parts/*.json` into `data/level1.json` (`--icons` redraws icons) |

## Run on this PC

```
C:/Users/A11111/Python_miniconda/envs/trannosyed312/python.exe -m http.server 8772 --directory "C:/Users/A11111/OneDrive/Saif files/PhD/App/TOPIK app"
```

then open http://127.0.0.1:8772.

## Put it on the iPhone

The phone needs to load the app from an https address once (after that it works offline).
Upload this folder to a free static host such as GitHub Pages, open the address in Safari,
then Share → Add to Home Screen. Open it from the home-screen icon from then on, so iOS keeps its data.

## Built to run by itself

All six levels (1,800 words, `data/level1.json` ... `data/level6.json`) are already in the app, so nothing has to be
edited to move up: passing a level exam starts the next level the same day. After Level 6 the app switches to
review mode for good: 5 words a day from all 1,800 (weakest and longest-unseen first), with every level's practice
and exam still open. The Today screen asks for a backup every 30 days.

If the app files are ever changed and re-uploaded, the phone picks them up by itself on the next launch
(the offline cache in `sw.js` checks the network first). Bump `VERSION` in `sw.js` when doing that.
