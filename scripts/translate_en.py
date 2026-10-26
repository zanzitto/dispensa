"""Traduce in italiano le ricette del Cookbook inglese di Wikibooks (offline, con Argos Translate).

Va eseguito con il Python dell'ambiente che contiene argostranslate, non con quello di sistema:
    C:/Users/damia/mt/Scripts/python.exe scripts/translate_en.py [numero_parte numero_parti_totali]

Legge:   data/raw/wikibooks-en/pages.jsonl
Scrive:  data/translated/wikibooks-en-it.<parte>.jsonl   (una ricetta per riga; riprende da dove era arrivato)

Cosa fa di piu' della semplice traduzione:
- ingredienti: separa quantita' e unita', preferisce i grammi/ml gia' scritti tra parentesi
  ("1 cup (240 g / 8.5 oz) butter" -> "240 g di burro") e traduce solo il nome;
- convertisce oz/lb in grammi e i gradi Fahrenheit in Celsius;
- salva anche la portata (dalle categorie inglesi) e il numero di porzioni.
"""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_db as bd  # noqa: E402  (riusa strip_markup e split_sections)
import argostranslate.translate as tr  # noqa: E402

SRC = ROOT / "data" / "raw" / "wikibooks-en" / "pages.jsonl"
OUT_DIR = ROOT / "data" / "translated"

COURSE_MAP = [  # (regex sulle categorie inglesi, portata italiana): vince il primo
    (r"dessert|pie |cake|pudding|sweet|candy|ice cream|chocolate|fruit crisp|cobbler", "Dolci"),
    (r"cookie|biscuit", "Biscotti"),
    (r"bread|pizza|dough", "Pane e pizza"),
    (r"appetizer|snack|dip|finger food", "Antipasti"),
    (r"soup|stew|broth|chowder", "Zuppe e minestre"),
    (r"salad", "Insalate"),
    (r"pasta|rice recipes|risotto|noodle|dumpling|gnocchi", "Primi piatti"),
    (r"side dish|vegetable|potato", "Contorni"),
    (r"sauce|dressing|condiment|marinade|spice|relish|jam|jelly", "Salse"),
    (r"beverage|drink|cocktail|smoothie|juice|tea |coffee", "Bevande"),
    (r"breakfast|egg|pancake|waffle", "Colazione"),
    (r"main course|meat|beef|pork|chicken|poultry|fish|seafood|lamb|turkey|casserole|sandwich|burger|barbecue|grill", "Secondi piatti"),
]

UNITS = {  # unita' inglese -> (singolare, plurale) in italiano; None = si toglie
    "cup": ("tazza", "tazze"), "tablespoon": ("cucchiaio", "cucchiai"), "tbsp": ("cucchiaio", "cucchiai"),
    "teaspoon": ("cucchiaino", "cucchiaini"), "tsp": ("cucchiaino", "cucchiaini"),
    "clove": ("spicchio", "spicchi"), "pinch": ("pizzico", "pizzichi"), "dash": ("pizzico", "pizzichi"),
    "slice": ("fetta", "fette"), "sprig": ("rametto", "rametti"), "stalk": ("gambo", "gambi"),
    "bunch": ("mazzetto", "mazzetti"), "can": ("scatola", "scatole"), "package": ("confezione", "confezioni"),
    "handful": ("manciata", "manciate"), "head": ("testa", "teste"), "piece": ("pezzo", "pezzi"),
    "stick": ("panetto", "panetti"), "drop": ("goccia", "gocce"), "quart": ("litro", "litri"),
    "pint": ("mezzo litro", "mezzo litro"), "gallon": ("litri", "litri"), "leaf": ("foglia", "foglie"),
    "leaves": ("foglia", "foglie"),
}
UNIT_ALIASES = {"tablespoons": "tablespoon", "tbsps": "tbsp", "tbs": "tbsp", "t": "tbsp", "teaspoons": "teaspoon",
                "tsps": "tsp", "cups": "cup", "c": "cup", "cloves": "clove", "pinches": "pinch", "slices": "slice",
                "sprigs": "sprig", "stalks": "stalk", "bunches": "bunch", "cans": "can", "packages": "package",
                "handfuls": "handful", "heads": "head", "pieces": "piece", "sticks": "stick", "drops": "drop",
                "quarts": "quart", "pints": "pint", "gallons": "gallon", "dashes": "dash", "pkg": "package"}
METRIC = {"g": "g", "gram": "g", "grams": "g", "kg": "kg", "ml": "ml", "l": "l", "liter": "l", "litre": "l"}
OZ = {"oz": 28.35, "ounce": 28.35, "ounces": 28.35, "lb": 453.6, "lbs": 453.6, "pound": 453.6, "pounds": 453.6}
FRAC = {"½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8"}

_cache = {}


def mt(text):
    text = text.strip()
    if not text:
        return ""
    if text not in _cache:
        _cache[text] = tr.translate(text, "en", "it")
    return _cache[text]


OVERRIDES = {  # parole che il traduttore sbaglia di solito (chiave: minuscolo)
    "nutmeg": "noce moscata", "ground nutmeg": "noce moscata", "ground beef": "carne macinata di manzo",
    "ground pork": "carne macinata di maiale", "ground turkey": "carne macinata di tacchino",
    "ground chicken": "carne macinata di pollo", "ground cinnamon": "cannella in polvere",
    "all-purpose flour": "farina", "plain flour": "farina", "flour": "farina", "bread flour": "farina",
    "baking soda": "bicarbonato", "baking powder": "lievito in polvere", "heavy cream": "panna",
    "heavy whipping cream": "panna", "whipping cream": "panna", "confectioners' sugar": "zucchero a velo",
    "confectioner's sugar": "zucchero a velo", "powdered sugar": "zucchero a velo",
    "icing sugar": "zucchero a velo", "brown sugar": "zucchero di canna", "cornstarch": "amido di mais",
    "corn starch": "amido di mais", "cornflour": "amido di mais", "bell pepper": "peperone",
    "green onion": "cipollotto", "green onions": "cipollotti", "scallion": "cipollotto",
    "scallions": "cipollotti", "cilantro": "coriandolo", "eggplant": "melanzana", "shrimp": "gamberi",
    "olive oil": "olio d'oliva", "extra virgin olive oil": "olio extravergine d'oliva",
    "vegetable oil": "olio di semi", "butter": "burro", "unsalted butter": "burro", "salt": "sale",
    "pepper": "pepe", "black pepper": "pepe nero", "water": "acqua", "milk": "latte", "sugar": "zucchero",
    "egg": "uovo", "eggs": "uova", "garlic": "aglio", "onion": "cipolla", "onions": "cipolle",
    "tomatoes": "pomodori", "tomato": "pomodoro", "potatoes": "patate", "carrots": "carote",
    "parmesan": "parmigiano", "parmesan cheese": "parmigiano", "mozzarella": "mozzarella",
    "yeast": "lievito", "active dry yeast": "lievito secco", "vanilla": "vaniglia",
    "vanilla extract": "estratto di vaniglia", "lemon juice": "succo di limone", "lemon": "limone",
    "chicken": "pollo", "bacon": "pancetta", "rice": "riso", "pasta": "pasta", "spaghetti": "spaghetti",
    "honey": "miele", "cinnamon": "cannella", "basil": "basilico", "parsley": "prezzemolo",
    "rosemary": "rosmarino", "oregano": "origano", "thyme": "timo", "sage": "salvia",
    "mushrooms": "funghi", "zucchini": "zucchine", "celery": "sedano", "spinach": "spinaci",
}


def tr_name(text):
    """Nome dell'ingrediente (con eventuale nota dopo la virgola) -> italiano, minuscolo."""
    text = text.strip()
    main, _, note = text.partition(",")
    main = main.strip()
    out = OVERRIDES.get(main.lower()) or mt(main)
    out = out[:1].lower() + out[1:] if out and not main[:1].isupper() else out
    if note.strip():
        n = mt(note)
        n = n[:1].lower() + n[1:]
        if n.rstrip(".") not in out:   # a volte il traduttore ripete la nota gia' inclusa
            out += ", " + n
    return out


def fix_fracs(s):
    s = re.sub(r"(\d)([½¼¾⅓⅔⅛⅜⅝⅞])", r"\1 \2", s)
    for k, v in FRAC.items():
        s = s.replace(k, v)
    return s


def to_float(q):
    total = 0.0
    for part in q.split():
        if "/" in part:
            a, b = part.split("/")
            total += float(a) / float(b)
        else:
            total += float(part.replace(",", "."))
    return total


def fmt_num(x):
    return str(int(round(x))) if abs(x - round(x)) < 0.05 else ("%.1f" % x).replace(".", ",")


def round_grams(g):
    return int(round(g / 5.0) * 5) if g >= 50 else int(round(g))


def d_prep(name):
    name = name.strip()
    return ("d'" if re.match(r"[aeiouàèéìòù]", name, re.I) else "di ") + name


QTY = r"\d+(?:[.,]\d+)?(?:\s+\d+/\d+|/\d+)?"
LINE_RX = re.compile(r"^\s*(?P<q>" + QTY + r"(?:\s*(?:-|–|to)\s*" + QTY + r")?)\s*(?P<rest>.*)$", re.I)


def translate_ingredient(line):
    line = fix_fracs(bd.strip_markup(line)).strip(" *#:\t")
    line = re.sub(r"\s+", " ", line)
    if not line:
        return ""
    m = LINE_RX.match(line)
    if not m:
        return mt(line)
    qty, rest = m.group("q"), m.group("rest")
    qty = re.sub(r"\s*(?:-|–|to)\s*", "-", qty)
    # lattine/confezioni con il peso in once: "1 (14 oz) can tomatoes" -> "1 scatola da 400 g di pomodori"
    cm = re.match(r"^\((\d+(?:[.,]\d+)?)\s*(oz|ounces?|lbs?|pounds?)\.?\)\s*(can|cans|package|packages|jar|bottle)s?\s+(?:of\s+)?(.*)$",
                  rest, re.I)
    if cm:
        grams = round_grams(float(cm.group(1).replace(",", ".")) * OZ[cm.group(2).lower()])
        sing, plur = UNITS.get(UNIT_ALIASES.get(cm.group(3).lower(), cm.group(3).lower()), ("scatola", "scatole"))
        return "%s %s da %d g %s" % (qty, plur if to_float(qty.split("-")[0]) > 1 else sing, grams, d_prep(tr_name(cm.group(4))))
    # unita' metrica gia' scritta tra parentesi: "(240 g / 8.5 oz)"
    paren = re.search(r"\((\d+(?:[.,]\d+)?)\s*(g|grams?|kg|ml|l|liters?|litres?)\b[^)]*\)", rest, re.I)
    rest_wo = re.sub(r"\([^)]*\)", " ", rest).strip() if paren else rest
    wm = re.match(r"^([A-Za-z]+)\.?\s+(?:of\s+)?(.*)$", rest_wo)
    word, tail = (wm.group(1).lower(), wm.group(2)) if wm else ("", rest_wo)
    word = UNIT_ALIASES.get(word, word)
    plural_q = "-" in qty or to_float(qty.split("-")[0]) > 1
    if paren:
        unit_ok = word in UNITS or word in OZ or word in METRIC
        name = tail if unit_ok else rest_wo
        val = paren.group(1).replace(",", ".")
        unit = METRIC.get(paren.group(2).lower().rstrip("s") if paren.group(2).lower() not in METRIC else paren.group(2).lower(), paren.group(2))
        return "%s %s %s" % (val if "." not in val else val.rstrip("0").rstrip("."), unit, d_prep(tr_name(name))) if name else qty
    if word in METRIC:
        return "%s %s %s" % (qty, METRIC[word], d_prep(tr_name(tail)))
    if word in OZ:
        grams = round_grams(to_float(qty.split("-")[0]) * OZ[word])
        return "%d g %s" % (grams, d_prep(tr_name(tail)))
    if word in UNITS:
        sing, plur = UNITS[word]
        return "%s %s %s" % (qty, plur if plural_q else sing, d_prep(tr_name(tail)))
    return "%s %s" % (qty, tr_name(rest_wo))


def f_to_c(m):
    f = float(m.group(1))
    return "%d °C" % (round((f - 32) * 5 / 9 / 5) * 5)


def translate_step(line):
    s = bd.strip_markup(line)
    s = re.sub(r"^[#*:\s]+", "", s).strip()
    if not s:
        return ""
    s = re.sub(r"(\d{3})\s*(?:°|º|degrees?)?\s*F(?:ahrenheit)?\b", f_to_c, s)
    parts = re.split(r"(?<=[.!?])\s+", s)
    return " ".join(mt(p) for p in parts if p.strip())


def course_of(cats, text):
    blob = " ".join(cats).lower() + " "
    for rx, course in COURSE_MAP:
        if re.search(rx, blob):
            return course
    return "Altro"


def parse(row):
    text = row["text"]
    secs = bd.split_sections(text)
    ing, steps, state = [], [], None
    for title, body in secs:
        if title.startswith("ingredient"):
            state = "ing"
        elif title in ("procedure", "directions", "instructions", "method", "preparation"):
            state = "steps"
        elif title:
            state = None if title.startswith(("notes", "see also", "references", "equipment", "warnings",
                                                "special equipment", "external", "variations")) else state
        if state == "ing":
            ing += [l for l in body.splitlines() if l.strip().startswith("*")]
        elif state == "steps":
            steps += [l for l in body.splitlines() if l.strip()]
    if len(ing) < 2 or not steps:
        return None
    cats = re.findall(r"\[\[Category:([^\]|]+)", text)
    sv = re.search(r"\|\s*Servings\s*=\s*(\d+)", text)
    return {"title": row["title"].split(":", 1)[-1], "ing": ing, "steps": steps, "cats": cats,
            "servings": int(sv.group(1)) if sv else None}


def main():
    part, parts = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) >= 3 else (0, 1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / ("wikibooks-en-it.%d.jsonl" % part)
    done = set()
    if out_path.exists():
        done = {json.loads(l)["pageid"] for l in open(out_path, encoding="utf-8") if l.strip()}
    rows = [json.loads(l) for l in open(SRC, encoding="utf-8")]
    rows = [r for i, r in enumerate(rows) if i % parts == part and r["pageid"] not in done]
    print("parte %d/%d: %d ricette da tradurre (%d gia' fatte)" % (part, parts, len(rows), len(done)), flush=True)
    t0, n = time.time(), 0
    with open(out_path, "a", encoding="utf-8") as f:
        for row in rows:
            p = parse(row)
            if not p:
                f.write(json.dumps({"pageid": row["pageid"], "skip": True}) + "\n")
                continue
            rec = {
                "pageid": row["pageid"], "src_title": row["title"], "title": mt(p["title"]),
                "course": course_of(p["cats"], row["text"]), "servings": p["servings"],
                "ing": [x for x in (translate_ingredient(l) for l in p["ing"]) if x],
                "steps": [x for x in (translate_step(l) for l in p["steps"]) if x],
                "url": "https://en.wikibooks.org/wiki/" + row["title"].replace(" ", "_"),
            }
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            f.flush()
            n += 1
            if n % 25 == 0:
                print("  %d ricette, %.0f s" % (n, time.time() - t0), flush=True)
    print("fatto: %d ricette in %.0f minuti" % (n, (time.time() - t0) / 60))


if __name__ == "__main__":
    main()
