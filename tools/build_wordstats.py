"""Build the offline word statistics used by web/js/stats.js. Pure counting, no machine learning.

Inputs (downloaded once, not committed):
  WikiText-103 raw (Merity et al., 2016; CC BY-SA), 100M words of Wikipedia:
    https://huggingface.co/api/datasets/Salesforce/wikitext/parquet/wikitext-103-raw-v1/train/0.parquet
    https://huggingface.co/api/datasets/Salesforce/wikitext/parquet/wikitext-103-raw-v1/train/1.parquet
  New General Service List 1.2 (Browne, Culligan & Phillips; CC BY-SA 4.0):
    https://www.newgeneralservicelist.com/s/NGSL_12_lemmatized_for_research.csv

Usage:
  python -m venv .venv && .venv/bin/pip install pyarrow
  .venv/bin/python tools/build_wordstats.py train-0.parquet train-1.parquet --ngsl NGSL_12_lemmatized_for_research.csv

Outputs (web/data/):
  vocab.txt    words by frequency rank (spell-check dictionary)
  ngrams.bin   hashed counts of word sequences around commonly confused words
  ngsl.txt     NGSL word forms (everyday-vocabulary coverage)

Tokenisation MUST match tokenize() in web/js/stats.js.
"""
import argparse, json, math, os, re, struct, sys, time
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "data")

# Keep in sync with web/js/stats.js
ART = ["a", "an", "the"]
PREP = ["in", "on", "at", "to", "for", "of", "with", "about", "from", "by", "into", "over", "under", "since"]
PARTICLES = ["back", "up", "again", "down", "out"]
PRON = ["me", "him", "her", "us", "them", "you", "it"]
CONF = set(ART + PREP + PARTICLES)
ANCH = CONF | set(PRON) | {"<s>", "</s>"}

WIKI_FIX = [(" @-@ ", "-"), (" @,@ ", ","), (" @.@ ", ".")]
CHUNK = re.compile(r"[.,;:!?()\"\[\]=0-9]+|\n")
WORD = re.compile(r"[a-z]+")


def chunks(text):
    for a, b in WIKI_FIX:
        text = text.replace(a, b)
    for part in CHUNK.split(text.lower()):
        toks = WORD.findall(part)
        if toks:
            yield ["<s>"] + toks + ["</s>"]


def fnv1a(s):
    h = 0x811C9DC5
    for byte in s.encode("ascii"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("parquet", nargs="+")
    ap.add_argument("--ngsl", required=True)
    ap.add_argument("--max-ngrams", type=int, default=700_000)
    ap.add_argument("--vocab-min", type=int, default=8)
    ap.add_argument("--vocab-max", type=int, default=70_000)
    args = ap.parse_args()
    import pyarrow.parquet as pq

    uni, grams = Counter(), Counter()
    t0, ntok = time.time(), 0
    for path in args.parquet:
        table = pq.read_table(path, columns=["text"])
        for batch in table.to_batches(max_chunksize=20000):
            for line in batch.column(0).to_pylist():
                if not line or line.startswith(" = "):  # skip empty lines and headings
                    continue
                for t in chunks(line):
                    n = len(t)
                    ntok += n - 2
                    uni.update(t[1:-1])
                    for i in range(n - 1):
                        a, b = t[i], t[i + 1]
                        if a in ANCH or b in ANCH:
                            grams[a + " " + b] += 1
                        if i + 2 < n and b in CONF:
                            grams[a + " " + b + " " + t[i + 2]] += 1
            print(f"  {ntok/1e6:.0f}M tokens, {len(grams)/1e6:.1f}M n-grams, {time.time()-t0:.0f}s", file=sys.stderr)

    # prune to the size budget: keep the most frequent n-grams
    counts = sorted(grams.values(), reverse=True)
    floor = max(3, counts[min(len(counts), args.max_ngrams) - 1] if counts else 3)
    kept = {}
    for g, c in grams.items():
        if c >= floor:
            h = fnv1a(g)
            q = min(255, round(math.log2(c) * 8))
            kept[h] = max(kept.get(h, 0), q)
    keys = sorted(kept)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "ngrams.bin"), "wb") as f:
        f.write(b"LTNG")                                   # magic
        f.write(struct.pack("<III", 1, len(keys), floor))  # version, entries, prune floor
        f.write(struct.pack(f"<{len(keys)}I", *keys))
        f.write(bytes(kept[k] for k in keys))

    # vocabulary: corpus words by frequency + NGSL forms + every word used in the app's content
    ngsl_forms = []
    for line in open(args.ngsl, encoding="utf-8-sig"):
        if line.startswith("##") or not line.strip():
            continue
        forms = [w.strip().lower() for w in line.strip().split(",") if w.strip()]
        ngsl_forms.append(forms)
    content = json.load(open(os.path.join(OUT, "content.json"), encoding="utf-8"))
    # only words from correct text (models, examples, prompts), never from the deliberately weak answers
    good = [s[k] for s in content["scenarios"] for k in ("title", "context", "line", "situation")]
    good += [m for s in content["scenarios"] for m in s["models"] + s["tests"]["pass"]]
    good += [p["example"] for p in content["patterns"].values()]
    good += [o["text"] for q in content["quizzes"] for o in q["options"] if o["correct"]]
    content_words = set(WORD.findall(" ".join(good).lower()))
    vocab = [w for w, c in uni.most_common(args.vocab_max) if c >= args.vocab_min and len(w) > 1 or w in ("a", "i")]
    work = set()
    for line in open(os.path.join(HERE, "workwords.txt"), encoding="utf-8"):
        if not line.startswith("#"):
            work.update(line.lower().split())
    # British/American spelling variants of known words (organise/organize, colour/color, ...)
    variants = set()
    for w in vocab[:40000]:
        for a, z in (("isation", "ization"), ("ise", "ize"), ("ised", "ized"), ("ising", "izing"), ("yse", "yze"), ("our", "or"), ("tre", "ter")):
            for x, y in ((a, z), (z, a)):
                if w.endswith(x) and len(w) > len(x) + 2:
                    variants.add(w[: -len(x)] + y)
    seen = set(vocab)
    extra = sorted((set(w for f in ngsl_forms for w in f) | content_words | work | variants) - seen)
    with open(os.path.join(OUT, "vocab.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(vocab + extra) + "\n")
    with open(os.path.join(OUT, "ngsl.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(",".join(forms) for forms in ngsl_forms) + "\n")

    size = os.path.getsize(os.path.join(OUT, "ngrams.bin"))
    print(json.dumps({"tokens": ntok, "ngrams_counted": len(grams), "ngrams_kept": len(keys), "prune_floor": floor,
                      "ngrams_bin_kb": size // 1024, "vocab": len(vocab) + len(extra), "ngsl_lemmas": len(ngsl_forms),
                      "seconds": round(time.time() - t0)}, indent=1))


if __name__ == "__main__":
    main()
