# Content brief: vocabulary content for a Korean (TOPIK) study app

The learner is an adult English speaker who started as a beginner and climbs one level every 2 months
(Level 1 = TOPIK 1 ... Level 6 = TOPIK 6). The app shows 5 new words a day.
For each word it shows the English meaning, a simple Korean meaning, ONE example sentence in Korean and English
(every word of the sentence can be tapped for its meaning), and 5 mini-games. You write the content for
a range of days of one level. The word list is `tools/levelN_wordlist.json` (day, slot order = list order).
Level 1 is finished: `data/level1.json` shows 300 real entries you can imitate.

## Output

A UTF-8 JSON file (a list of objects, ordered by day then slot) at
`tools/parts/levelN_days{FROM}-{TO}.json` (two-digit days, e.g. `level3_days21-40.json`). Do not touch any other file.
`id` is `L{N}-` + three-digit `(day-1)*5 + slot` (e.g. `L3-101`).

## Level-specific rules (these override the Level 1 limits further down)

| Level | Sentence length | Grammar you may use (in addition to everything from lower levels) | ko_meaning style |
|---|---|---|---|
| 1 | 2–5 chunks | 이/가, 은/는, 을/를, 에, 에서, 도, 하고/와/과, 의, -아요/어요, -았어요/었어요, 안, 이에요/예요, -고 싶어요, -(으)세요 | very simple |
| 2 | 3–6 chunks | -고, -지만, -아서/어서, -(으)ㄹ 거예요, -(으)ㄹ 수 있다/없다, -(으)면, -(으)니까, noun modifiers -는/-(으)ㄴ/-(으)ㄹ, -지 않다, -아야/어야 하다, -(으)러 가다, -(으)려고 하다, 못, -겠어요 | simple |
| 3 | 3–8 chunks | -는데, -(으)면서, -기 때문에, -(으)ㄴ 적이 있다, -게 되다, -는 것, -기로 하다, -아/어 보다, -(으)ㄹ 때, short indirect speech (-다고 하다), formal -ㅂ니다/습니다 | learner-dictionary style |
| 4 | 4–9 chunks | natural intermediate speech and writing: -는 편이다, -(으)ㄹ 뿐만 아니라, -에 따르면, -(으)ㄴ/는 반면에, -도록, passive/causative forms, written -ㄴ다/는다 style allowed | learner-dictionary style |
| 5 | 4–10 chunks | TOPIK II reading style: news, essays, explanations; written -ㄴ다/는다 style common | standard dictionary style, still clear |
| 6 | 4–10 chunks | formal and academic writing, professional contexts | standard dictionary style |

- Polite 해요 style stays the default for Levels 1–3. From Level 4 on, mix 해요 style and written -ㄴ다/는다 style.
- Example sentences should mostly use words from the same or lower levels (see the other `tools/level*_wordlist.json`
  files); at most TWO words per sentence from outside the lists (Level 1–2: at most ONE).
- `form` questions should practice grammar typical of the level (particles at Level 1, connectors and endings at
  Level 2–3, register, nuance and collocations at Level 4–6), always with exactly one correct option.
- For Levels 4–6, collocation questions are good (which verb goes with this noun, e.g. 영향을 ___ → 미치다).

## One entry (this is the real entry for day 1, slot 1; follow its shape exactly)

```json
{
  "id": "L1-001", "day": 1, "slot": 1,
  "ko": "엄마", "roman": "eomma", "en": "mom", "pos": "noun",
  "ko_meaning": "나를 낳아 준 여자 부모를 부르는 말",
  "ko_meaning_en": "A word for the female parent who gave birth to you",
  "example": {
    "ko": "엄마가 밥을 먹어요.",
    "roman": "Eomma-ga babeul meogeoyo.",
    "en": "Mom eats rice.",
    "tokens": [
      {"t": "엄마가", "r": "eomma-ga", "base": "엄마 + 가", "en": "mom", "note": "가 marks the subject"},
      {"t": "밥을", "r": "babeul", "base": "밥 + 을", "en": "rice", "note": "을 marks the object"},
      {"t": "먹어요", "r": "meogeoyo", "base": "먹다", "en": "eats", "note": "present tense, polite (-어요)"}
    ],
    "target": 0
  },
  "cloze_options": ["엄마가", "해가", "달이", "물이"],
  "form": {
    "q_en": "Pick the particle that makes 'mom' the subject.",
    "ko": "엄마___ 밥을 먹어요.",
    "options": ["가", "를", "에", "을"],
    "answer": 0,
    "why": "가 marks the subject after a vowel. 를/을 mark an object, and 에 means 'at/to'."
  }
}
```

## Field rules

- `id` = `L{N}-` + three-digit number `(day-1)*5 + slot`. `ko` must be exactly the word in the list.
- `roman`: Revised Romanization as pronounced. `en`: short English meaning (you may refine the list's wording).
- `pos`: one of noun, verb, adjective, adverb, number, pronoun, expression, question word, counter, determiner,
  conjunction, idiom, suffix. Korean descriptive verbs (크다, 예쁘다...) are "adjective".
- `ko_meaning`: a short Korean definition in the style the level table gives (use easier words than the headword).
  `ko_meaning_en`: its English translation.
- `example`: ONE sentence; length, grammar and style as in the level table above.
  Keep it natural and something a real person would say or write.
  - `tokens`: the sentence split exactly at spaces, punctuation removed, so that joining the `t` values with a
    single space gives the sentence without its final . ? or !. No commas in the sentence.
    Each token: `t` (as written), `r` (romanization), `base` (dictionary form; for noun + particle write
    "noun + particle"), `en` (meaning in this sentence), optional `note` (short grammar note in English).
  - `target`: index of the token that contains this day's word (conjugated forms count).
- `cloze_options`: 4 different strings. The first is exactly the target token. The other 3 are other words of the
  same or a lower level in the same grammatical shape (same particle/ending pattern, correct for that word's final sound), that make the
  sentence clearly wrong or silly in meaning. The game shows the English sentence as a hint, so only the first fits.
- `form`: a grammar-in-use question about this word in a sentence (particle choice, verb ending, native vs
  Sino-Korean number, 둘→두 before counters, honorific, etc.). `ko` contains `___` where the answer goes.
  4 different options, `answer` = index of the correct one, and EXACTLY ONE option may be grammatical and natural
  (check carefully: e.g. 도 or 는 are often also correct, so avoid them as distractors when they would fit).
  `why`: one or two short sentences in English.

## Quality

Accuracy matters more than speed: correct Korean (particles after vowel vs consonant, irregular verbs such as
듣다→들어요, 덥다→더워요, 모르다→몰라요, 쓰다→써요), natural sentences, correct romanization, correct glosses.
Avoid the same sentence pattern for every word in a day; vary subjects and verbs. Never reuse another word's
example sentence (the checker warns about exact repeats across all files).
At Levels 3–6 the wrong cloze options must be plausible-looking (same part of speech and form) but wrong in this
sentence, so the game stays a real test.

## Check

Run the checker and fix every ERROR (look at WARNs too):

```
PYTHONIOENCODING=utf-8 "C:/Users/A11111/Python_miniconda/envs/trannosyed312/python.exe" "<app folder>/tools/validate.py" "<your file>"
```

Then report: the file path, the checker's last line, and any word where you were unsure.
