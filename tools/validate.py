"""Check vocabulary content files against the level word lists.

Usage:
  python validate.py parts/level2_days01-20.json [more files...]
  python validate.py --all            (checks every file in tools/parts)
The level is read from the file name (levelN_...). Prints problems; exit code 1 if any hard error.
"""
import json, re, sys, pathlib

HERE = pathlib.Path(__file__).parent
POS = {"noun", "verb", "adjective", "adverb", "number", "pronoun", "expression", "question word", "counter",
       "determiner", "conjunction", "idiom", "suffix"}
MAX_TOKENS = {1: 6, 2: 6, 3: 8, 4: 9, 5: 10, 6: 10}
_EXPECTED = {}


def expected(level):
    if level not in _EXPECTED:
        wl = json.loads((HERE / f"level{level}_wordlist.json").read_text(encoding="utf-8"))
        _EXPECTED[level] = {(d["day"], i + 1): (ko, en) for d in wl for i, (ko, en) in enumerate(d["words"])}
    return _EXPECTED[level]


def check_word(level, w, errors, warns):
    tag = f'{w.get("id", "?")} {w.get("ko", "?")}'
    def err(m): errors.append(f"{tag}: {m}")
    def warn(m): warns.append(f"{tag}: {m}")

    for k in ["id", "day", "slot", "ko", "roman", "en", "pos", "ko_meaning", "ko_meaning_en", "example", "cloze_options", "form"]:
        if k not in w:
            err(f"missing field {k}")
            return
    exp = expected(level)
    key = (w["day"], w["slot"])
    if key not in exp:
        err(f"day/slot {key} not in the level {level} word list")
    elif w["ko"] != exp[key][0]:
        err(f"ko should be {exp[key][0]}")
    if w["id"] != f'L{level}-{(w["day"] - 1) * 5 + w["slot"]:03d}':
        err(f"id should be L{level}-NNN with NNN = (day-1)*5+slot")
    if w["pos"] not in POS:
        err(f"pos must be one of {sorted(POS)}")
    if not re.search(r"[가-힣]", w["ko_meaning"]):
        err("ko_meaning must be Korean")

    ex = w["example"]
    for k in ["ko", "roman", "en", "tokens", "target"]:
        if k not in ex:
            err(f"example missing {k}")
            return
    body = re.sub(r"[.?!]+$", "", ex["ko"].strip())
    joined = " ".join(t.get("t", "") for t in ex["tokens"])
    if joined != body:
        err(f"tokens joined '{joined}' != sentence '{body}'")
    for t in ex["tokens"]:
        for k in ["t", "r", "base", "en"]:
            if not t.get(k):
                err(f"token {t.get('t')} missing {k}")
        if re.search(r"[.?!,]", t.get("t", "")):
            err(f"token '{t.get('t')}' must not contain punctuation")
    if not (0 <= ex["target"] < len(ex["tokens"])):
        err("example.target index out of range")
        return
    if len(ex["tokens"]) > MAX_TOKENS[level]:
        warn(f"example has {len(ex['tokens'])} tokens (max {MAX_TOKENS[level]} for level {level})")

    target_t = ex["tokens"][ex["target"]]["t"]
    co = w["cloze_options"]
    if len(co) != 4 or len(set(co)) != 4:
        err("cloze_options must be 4 different strings")
    elif co[0] != target_t:
        err(f"cloze_options[0] must equal the target token '{target_t}'")

    f = w["form"]
    for k in ["q_en", "ko", "options", "answer", "why"]:
        if k not in f:
            err(f"form missing {k}")
            return
    if "___" not in f["ko"]:
        err("form.ko must contain ___")
    if len(f["options"]) != 4 or len(set(f["options"])) != 4:
        err("form.options must be 4 different strings")
    if f["answer"] not in (0, 1, 2, 3):
        err("form.answer must be 0-3")


def level_of(path):
    m = re.search(r"level(\d)", pathlib.Path(path).name)
    if not m:
        sys.exit(f"cannot tell the level from the file name {path}")
    return int(m.group(1))


def main(paths):
    errors, warns, seen, sentences = [], [], {}, {}
    for p in paths:
        level = level_of(p)
        data = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
        if not isinstance(data, list):
            errors.append(f"{p}: top level must be a list")
            continue
        for w in data:
            check_word(level, w, errors, warns)
            k = (level, w.get("day"), w.get("slot"))
            if k in seen:
                errors.append(f"duplicate level/day/slot {k}")
            seen[k] = True
            s = w.get("example", {}).get("ko")
            if s in sentences:
                warns.append(f"{w.get('id')}: same example sentence as {sentences[s]}")
            sentences[s] = w.get("id")
    for m in warns:
        print("WARN ", m)
    for m in errors:
        print("ERROR", m)
    print(f"{len(seen)} words checked, {len(errors)} errors, {len(warns)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["--all"]:
        args = sorted(str(p) for p in (HERE / "parts").glob("level*.json"))
    sys.exit(main(args))
