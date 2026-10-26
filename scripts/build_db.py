"""Prepara il database SQLite di Dispensa dalle fonti grezze in data/raw.

Uso (dalla cartella del progetto):  python -I scripts/build_db.py

Legge:   data/raw/wikibooks-it/pages.jsonl, data/raw/artusi/pages.jsonl
Scrive:  data/dispensa.db            database per l'app
         data/ingredienti_report.txt elenco ingredienti con frequenza (per controllo a mano)

Tabelle:
  recipes(id, source, title, course, servings, steps, url, license)
  ingredients(id, name, key, category, is_staple, n_recipes)
  recipe_ingredients(recipe_id, ingredient_id, display)   con indice su ingredient_id
"""
import collections
import json
import re
import sqlite3
import sys
import unicodedata
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_DB = ROOT / "data" / "dispensa.db"
OUT_REPORT = ROOT / "data" / "ingredienti_report.txt"

STAPLES = {"sale", "pepe", "olio", "acqua"}
MIN_INGREDIENTS = 2

LICENSE_WB = "CC BY-SA 4.0 - Wikibooks italiano (autori: cronologia della pagina)"
LICENSE_AR = "Pubblico dominio - Pellegrino Artusi (trascrizione Wikisource)"
LICENSE_WB_EN = "CC BY-SA 4.0 - Wikibooks inglese (traduzione automatica)"


# ---------------------------------------------------------------- utilita' testo

def unaccent(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def strip_markup(t):
    """Toglie sintassi wiki e HTML, lasciando il testo leggibile."""
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<ref[^>]*?/>", "", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    prev = None
    while prev != t:  # template annidati
        prev = t
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"\[\[(?:Immagine|Image|File|Categoria|Category):[^\]]*\]\]", "", t, flags=re.I)
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\]", "", t)
    t = re.sub(r"'{2,}", "", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("\xa0", " ").replace("’", "'").replace("`", "'")
    for a, b in (("½", "1/2"), ("¼", "1/4"), ("¾", "3/4"), ("⁄", "/")):
        t = t.replace(a, b)
    return t


def split_sections(text):
    """[(titolo_minuscolo, corpo)] in ordine. Il testo prima del primo titolo ha titolo ''."""
    out, title, buf = [], "", []
    for line in text.splitlines():
        m = re.match(r"^=+\s*(.*?)\s*=+\s*$", line)
        if m:
            out.append((title, "\n".join(buf)))
            title, buf = m.group(1).strip().lower(), []
        else:
            buf.append(line)
    out.append((title, "\n".join(buf)))
    return out


# ---------------------------------------------------------------- ingredienti

NUMRE = re.compile(r"^\d+(?:[.,/\-–]\d+)*(?:g|gr|kg|ml|cl|dl|l|lt|hg|cc)?\.?$")
NUMWORDS = {
    "un", "uno", "una", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove",
    "dieci", "dodici", "mezzo", "mezza", "mezzi", "mezze", "qualche", "alcuni", "alcune",
    "poco", "poca", "pochi", "poche", "pochino", "tanto", "tanta", "circa", "ca", "ca.", "cca",
    "scarso", "scarsa", "abbondante", "abbondanti", "generoso", "generosa", "colmo", "colma",
    "raso", "rasa", "n", "n.", "nr", "doppio", "doppia", "po", "po'", "bel", "bella", "buon",
    "buona", "piccolo", "piccola", "piccoli", "piccole", "grosso", "grossa", "grossi", "grosse",
    "medio", "media", "medi", "medie", "grande", "grandi", "e", "o", "a",
}
UNITS = {
    "kg", "g", "gr", "grammi", "grammo", "hg", "etto", "etti", "ettogrammo", "mg", "l", "lt",
    "litro", "litri", "dl", "decilitro", "decilitri", "cl", "ml", "millilitri", "chilo", "chili",
    "chilogrammo", "chilogrammi", "cucchiaio", "cucchiai", "cucchiaino", "cucchiaini",
    "cucchiaiata", "cucchiaiate", "tazza", "tazze", "tazzina", "tazzine", "bicchiere",
    "bicchieri", "bicchierino", "bicchierini", "pizzico", "pizzichi", "pugno", "pugni",
    "pugnello", "pugnelli", "manciata", "manciate", "mazzetto", "mazzetti", "mazzo", "mazzi",
    "ciuffo", "ciuffi", "bustina", "bustine", "confezione", "confezioni", "scatola", "scatole",
    "lattina", "lattine", "barattolo", "barattoli", "goccia", "gocce", "goccio", "spruzzo",
    "rametto", "rametti", "spicchio", "spicchi", "foglia", "foglie", "fogliolina", "foglioline",
    "tocco", "tocchetto", "tocchetti", "bottiglia", "bottiglie", "bottiglietta",
}
# unita' che sono anche ingredienti/oggetti: contano solo se seguite da "di"
UNITS_AMBIGUOUS = {
    "noce", "fetta", "fette", "costola", "costole", "gambo", "gambi", "pezzo", "pezzi",
    "pezzetto", "pezzetti", "dado", "dadi", "testa", "teste", "cuore", "cuori", "panetto",
    "panetti", "zampa", "zampe", "ciuffetto", "rotolo", "filo", "fili",
}
CONNECTORS = {"di", "d", "del", "dei", "della", "delle", "dello", "degli", "dell"}
ARTICLES = {"il", "lo", "la", "le", "i", "gli", "l", "un", "uno", "una"}
CUT_WORDS = {"per", "da", "con", "in", "gia", "circa", "ben", "tipo", "come", "tagliato",
             "tagliata", "tagliati", "tagliate", "sopra", "sotto", "se", "senza", "oppure"}
CUT_AFTER_A = {"terra", "dadini", "fette", "pezzi", "pezzetti", "cubetti", "tocchetti", "rondelle",
               "listarelle", "striscioline", "julienne", "temperatura", "piacere", "seconda",
               "scelta", "gusto", "persona", "testa"}
MODIFIERS = {
    "grattugiato", "grattugiata", "grattugiati", "grattugiate", "grattato", "grattata",
    "grattati", "grattate", "tritato", "tritata", "tritati", "tritate", "sbucciato",
    "sbucciata", "sbucciati", "sbucciate", "lessato", "lessata", "lessati", "lessate", "cotto",
    "cotta", "cotti", "cotte", "crudo", "cruda", "crudi", "crude", "fresco", "fresca", "freschi",
    "fresche", "maturo", "matura", "maturi", "mature", "sodo", "sode", "sodi", "tiepido",
    "tiepida", "caldo", "calda", "freddo", "fredda", "intero", "intera", "interi", "intere",
    "fine", "fini", "sottile", "sottili", "spezzettato", "spezzettata", "spezzettati",
    "affettato", "affettata", "affettati", "affettate", "surgelato", "surgelata", "surgelati",
    "congelato", "congelata", "congelati", "bollente", "ammorbidito", "ammorbidita", "morbido",
    "morbida", "sciolto", "sciolta", "fuso", "fusa", "setacciato", "setacciata", "passato",
    "passata_", "pulito", "pulita", "puliti", "pulite", "lavato", "lavata", "lavati", "lavate",
    "pestato", "pestata", "sgusciato", "sgusciati", "sgusciate", "sgocciolato", "sgocciolati",
    "scolato", "scolata", "scolati", "scolate", "tostato", "tostata", "tostati", "tostate",
    "tagliuzzato", "tagliuzzati", "sminuzzato", "sminuzzata", "sminuzzati", "frullato",
    "frullata", "pelato_", "dolce_", "extra", "q", "b", "qb", "abbondante", "abbondanti",
    "grosso", "grossa", "grossi", "grosse", "piccolo", "piccola", "piccoli", "piccole",
    "medio", "media", "medi", "medie", "grande", "grandi", "bello", "bella", "belli", "belle",
    "rosso_", "ecc", "etc", "idem", "uguale", "stesso", "stessa", "circa", "tritate",
    "magro", "magra", "grasso", "grassa", "buona", "buon", "meglio",
    "finemente", "grossolanamente", "grossolano", "tagliato", "tagliata", "tagliati", "tagliate", "battuto",
    "battuta", "battuti", "battute", "schiacciato", "schiacciata", "schiacciati", "schiacciate", "diviso",
    "divisa", "divisi", "divise", "drenato", "drenata", "drenati", "drenate", "spremuto", "spremuta",
    "spremuti", "spremute", "cubato", "cubata", "cubati", "cubate", "rimosso", "rimossa", "rimossi",
    "rimosse", "scongelato", "scongelata", "scongelati", "imbevuto", "imbevuta", "affilato", "triturato",
    "triturata", "triturati", "picchiato", "picchiata", "scanalato", "suddiviso", "suddivisi", "terra",
    "sciacquato", "sciacquati", "asciugato", "asciugata", "asciugati", "ammollo", "ammollato",
    "trimestrale", "trimestrali", "separato", "separata", "separati", "separate", "risciacquato", "risciacquata",
    "risciacquati", "risciacquate", "desiderato", "sbriciolato", "sbriciolata", "sbriciolati", "disidratato", "disidratata", "essiccato", "essiccata",
    "essiccati", "essiccate", "affumicato_", "tostati", "granulare", "raschiato", "raschiata",
}
NOT_A_NAME_START = {
    "a", "ma", "che", "non", "nella", "nel", "nei", "nelle", "anche", "possibilmente",
    "leggermente", "servitelo", "servire", "se", "si", "ne", "molto", "poi", "prima", "dopo",
    "circa", "forma", "ottimo", "ottima", "ideale", "meglio", "oppure", "ovvero", "cioe",
    "debole", "liquido", "ammollito", "inumidito", "scegliere", "usare", "quelli", "quelle", "finemente",
    "piu", "piu'", "taglio", "piatto", "dolore", "odore", "aroma", "consigli", "far", "perno", "cuneo",
    "questo", "questa", "tutti", "tutte", "ogni", "peso", "legato", "scarso", "ridurla",
}
BLACKLIST = {
    "persone", "persona", "ingredienti", "ingrediente", "quanto", "idem", "altro", "altri",
    "altre", "resto", "stesso", "tutto", "tutti", "varie", "dose", "dosi", "teglia", "stampo",
    "pirofila", "pentola", "padella", "quantita", "necessario", "occorrente", "sopra", "sotto",
    "ingredienti per", "gusto", "piacere", "pezzi", "pezzo", "cucchiai", "cucchiaio", "grammi",
    "meglio", "rossi", "rosso", "magro", "legno", "presa", "porzioni", "porzione", "semi", "piu", "taglio",
    "piatto", "dolore", "odore", "aroma", "maria", "consigli", "cuneo", "rene",
    "e", "di", "a", "il", "la", "le", "lo", "i", "gli", "un", "una", "uno", "po", "ml", "kg",
}

CUTS_RX = (r"^(?:(?:petto|coscia|cosce|fesa|noce|lombata|filetto|polpa|spalla|girello|cosciotto|"
           r"fettine|fetta|fette|costolette|costoletta|bistecca|bistecche|lonza|arista|taglio|petti|cosce|"
           r"pezzo|pezzi|carne|polpa|ossobuco|stinco|cotolette|scaloppine|tagli) (?:di )?)?")

# (regex su nome senza accenti, nome canonico). Il primo che combacia vince.
ALIASES = [
    (r"^pane (?:grattugiat|grattat)\w*$|^pan ?grattat\w*$|^pangrattato$", "pangrattato"),
    (r"^(?:passata|salsa|polpa|sugo) di pomodor\w*$|^passata$|^pelati$|^pomodor\w* pelat\w*$|^polpa pomodor\w*$|^salsa di pomodor\w*$", "passata di pomodoro"),
    (r"^(?:concentrato|conserva|estratto) di pomodor\w*$", "concentrato di pomodoro"),
    (r"^(?:uov[oa]|uova)( .*)?$|^tuorl\w+( .*)?$|^ross[io] d.?uov\w*( .*)?$|^albume\w*( .*)?$|^albumi( .*)?$|^chiar[ae]( d.?uov\w*)?$", "uova"),
    (r"^vainigli\w*|^vanigli\w*|^vanillin\w*$|^estratto di vaniglia$|^essenza di vaniglia$", "vaniglia"),
    (r"^(?:rhum|rum)( .*)?$", "rum"),
    (r"^presa( di sale)?$", "sale"),
    (r"^formaggio (?:grana|parmigiano)\b.*$|^gr?formaggio parmigiano.*$", "parmigiano"),
    (r"^formaggio pecorino.*$", "pecorino"),
    (r"^butter$|^burro .*$", "burro"),
    (r"^accorciamento( .*)?$|^shortening$", "strutto"),
    (r"^molasse$|^melassa( .*)?$", "melassa"),
    (r"^crema di tartaro$|^cremor( di)? tartaro$", "cremor tartaro"),
    (r"^stock di .*$|^brodo( .*)?$|^bouillon.*$|^cubett\w* di .*$", "brodo"),
    (r"^pur[eè] di pomodor\w*$", "passata di pomodoro"),
    (r"^chiodi$", "chiodi di garofano"),
    (r"^fiocchi di pepe rosso.*$|^pepe rosso.*$", "peperoncino"),
    (r"^avena( .*)?$|^fiocchi d.?avena.*$", "avena"),
    (r"^flour$|^all.purpose flour$", "farina"),
    (r"^succo di lime( .*)?$|^lime( .*)?$|^scorza di lime.*$", "lime"),
    (r"^ginger$|^zenzero .*$|^pezzo zenzero$", "zenzero"),
    (r"^cumin$|^cumino( .*)?$", "cumino"),
    (r"^cilantro$|^coriandolo( .*)?$", "coriandolo"),
    (r"^dill weed$|^aneto( .*)?$", "aneto"),
    (r"^lard$|^strutto( .*)?$", "strutto"),
    (r"^clovi$|^chiodi di garofano( .*)?$|^garofan\w*$", "chiodi di garofano"),
    (r"^pasta di pomodor\w*$", "concentrato di pomodoro"),
    (r"^(?:digione )?senape( .*)?$|^digione senape$", "senape"),
    (r"^bianco d.?uov\w*$|^albume( .*)?$", "uova"),
    (r"^carni? bovin\w*$|^manzo .*$|^bistecca( .*)?$", "manzo"),
    (r"^margarita$|^margarina( .*)?$", "margarina"),
    (r"^paprika( .*)?$|^paprica( .*)?$|^pepe di cayenna.*$", "paprika"),
    (r"^origano( .*)?$", "origano"),
    (r"^timo( .*)?$", "timo"),
    (r"^alloro( .*)?$|^foglio della baia$|^foglie? di alloro$", "alloro"),
    (r"^scalogn\w*( .*)?$", "scalogno"),
    (r"^salsa di soia( .*)?$|^soia salsa$", "salsa di soia"),
    (r"^gamberett\w*( .*)?$|^gamber\w*( .*)?$", "gamberi"),
    (r"^petti? di pollo( .*)?$|^cosc\w+ di pollo( .*)?$", "pollo"),
    (r"^uv[ae]\w* ?sultanin\w*$|^uvett\w*( .*)?$|^uva passa$", "uvetta"),
    (r"^bicarbonato.*$", "bicarbonato"),
    (r"^(?:midolla|mollica|midollo) di pane.*$", "pane"),
    (r"^cacao.*$", "cacao"),
    (r"^aceto.*$", "aceto"),
    (CUTS_RX + r"(?:di )?vitell[ao]( di latte)?$", "vitello"),
    (CUTS_RX + r"(?:di )?manzo$", "manzo"),
    (CUTS_RX + r"(?:di )?(?:maiale|suino)$", "maiale"),
    (CUTS_RX + r"(?:di )?pollo$", "pollo"),
    (CUTS_RX + r"(?:di )?agnello$", "agnello"),
    (CUTS_RX + r"(?:di )?tacchino$", "tacchino"),
    (CUTS_RX + r"(?:di )?coniglio$", "coniglio"),
    (r"^olio( .*)?$", "olio"),
    (r"^sale( .*)?$", "sale"),
    (r"^pepe( .*)?$", "pepe"),
    (r"^acqua( .*)?$", "acqua"),
    (r"^zucchero( .*)?$", "zucchero"),
    (r"^burro( .*)?$", "burro"),
    (r"^lievito( .*)?$", "lievito"),
    (r"^brodo( .*)?$|^dado( .*)?$", "brodo"),
    (r"^farina(?!.*(?:mais|riso|ceci|castagn|mandorl|segal|farro|saracen|integral|kamut|avena|cocco)).*$", "farina"),
    (r"^latte(?: (?:intero|parzialmente scremato|scremato|fresco|tiepido|caldo|freddo))?$", "latte"),
    (r"^(?:parmigiano|grana)(?: .*)?$", "parmigiano"),
    (r"^pecorino( .*)?$", "pecorino"),
    (r"^mozzarell\w*( .*)?$", "mozzarella"),
    (r"^ricotta( .*)?$", "ricotta"),
    (r"^mascarpone( .*)?$", "mascarpone"),
    (r"^panna( .*)?$", "panna"),
    (r"^yogurt( .*)?$", "yogurt"),
    (r"^prosciutto( .*)?$", "prosciutto"),
    (r"^pomodor\w*( .*)?$", "pomodori"),
    (r"^cipoll\w*( .*)?$", "cipolla"),
    (r"^aglio( .*)?$|^spicch\w+ d.?aglio$", "aglio"),
    (r"^patat\w*( .*)?$", "patate"),
    (r"^carot\w*( .*)?$", "carote"),
    (r"^zucchin\w*( .*)?$", "zucchine"),
    (r"^melanzan\w*( .*)?$", "melanzane"),
    (r"^peperoncin\w*( .*)?$", "peperoncino"),
    (r"^peperon[ei]( .*)?$", "peperoni"),
    (r"^(?:fung\w*|porcini\w*|champignon\w*)( .*)?$", "funghi"),
    (r"^basilic\w*( .*)?$", "basilico"),
    (r"^prezzemol\w*( .*)?$", "prezzemolo"),
    (r"^rosmarin\w*( .*)?$", "rosmarino"),
    (r"^salvia( .*)?$", "salvia"),
    (r"^limon\w*( .*)?$|^(?:scorza|succo|buccia)(?: grattugiata)? di limon\w*( .*)?$|^succo di mezzo limone.*$", "limone"),
    (r"^(?:aranc\w*|scorza di aranc\w*|succo di aranc\w*|buccia di aranc\w*)$", "arancia"),
    (r"^noc[ei] moscat\w*$|^odore di noce moscata$", "noce moscata"),
    (r"^odore di (.+)$", None),  # gestito a parte: "odore di spezie" -> spezie
    (r"^riso( .*)?$", "riso"),
    (r"^pane( .*)?$", "pane"),
    (r"^(?:pasta|spaghett\w*|penne|rigaton\w*|fusill\w*|tagliatell\w*|linguin\w*|maccheron\w*|bucatin\w*|farfall\w*|orecchiett\w*|tagliolin\w*|pappardell\w*|paccher\w*|fettuccin\w*|vermicell\w*|ditalin\w*|conchigli\w*|lasagn\w*|tortigliion\w*)(?! (?:sfoglia|frolla|brisee|di |lievitata|madre|per))( .*)?$", "pasta"),
    (r"^(?:carne|manzo|vitello|maiale|vitellone) macinat\w*$|^macinato( .*)?$", "carne macinata"),
    (r"^ciocc?olat\w*( .*)?$", "cioccolato"),
    (r"^mandorl\w*( .*)?$", "mandorle"),
    (r"^(?:acciug\w*|alic[ei])( .*)?$", "acciughe"),
    (r"^vino bianc\w*( .*)?$", "vino bianco"),
    (r"^vino ross\w*( .*)?$", "vino rosso"),
    (r"^tonno( .*)?$", "tonno"),
]
ALIASES = [(re.compile(p), c) for p, c in ALIASES]

CATEGORIES = [
    ("Base", ["farina", "uova", "latte", "burro", "zucchero", "lievito", "olio", "sale", "pepe",
              "acqua", "miele", "cacao", "panna", "amido", "fecola", "aceto", "brodo", "spezie",
              "cannella", "vaniglia", "bicarbonato", "gelatina", "senape", "maionese",
              "noce moscata", "concentrato", "cioccolato", "vaniglia", "rum", "marsala", "vino",
              "grappa", "cognac", "colla di pesce", "cremor", "strutto", "candito", "cedro",
              "zafferano", "chiodi di garofano", "anaci", "cumino", "maggiorana", "caffe",
              "lievito", "salsa di soia", "liquore", "sciroppo", "confettura", "marmellata"]),
    ("Pasta, riso, pane", ["pasta", "riso", "pane", "pangrattato", "gnocchi", "polenta",
                           "semolino", "couscous", "orzo", "farro", "fette biscottate",
                           "biscott", "savoiardi", "sfoglia"]),
    ("Formaggi e salumi", ["parmigiano", "pecorino", "mozzarella", "ricotta", "mascarpone",
                           "formaggio", "gorgonzola", "grana", "prosciutto", "pancetta",
                           "guanciale", "salsiccia", "salame", "speck", "mortadella",
                           "provola", "fontina", "taleggio", "bresaola", "yogurt", "lardo"]),
    ("Carne e pesce", ["pollo", "manzo", "vitello", "maiale", "agnello", "tacchino",
                       "coniglio", "carne", "tonno", "merluzzo", "acciughe", "gamberi",
                       "cozze", "vongole", "salmone", "pesce", "baccala", "calamari",
                       "seppie", "polpo", "fegato", "costolett", "bistecca", "filetto"]),
    ("Legumi e frutta secca", ["ceci", "fagioli", "lenticchie", "piselli", "fave", "mandorle",
                               "noci", "nocciole", "pistacchi", "pinoli", "uvetta", "uva sultanina",
                               "arachidi", "castagne", "soia", "lupini"]),
    ("Verdure e frutta", ["pomodor", "passata", "cipolla", "aglio", "carote", "zucchine",
                          "melanzane", "peperon", "funghi", "spinaci", "bietol", "insalata",
                          "sedano", "basilico", "prezzemolo", "rosmarino", "salvia", "limone",
                          "arancia", "mela", "mele", "pera", "pere", "patate", "cavol",
                          "broccol", "carciof", "asparag", "finocchi", "zucca", "porri",
                          "radicchio", "rucola", "olive", "capperi", "alloro", "menta",
                          "origano", "timo", "banana", "fragole", "ciliegie", "pesche",
                          "albicocche", "fichi", "ananas", "cocco", "lattuga", "cetriol",
                          "fagiolini", "verdur", "frutta", "peperoncino", "zenzero"]),
]


EXACT_TOKENS = {"pepe", "sale", "olio", "acqua", "pera", "pere", "mela", "mele", "riso", "pane",
                "uova", "latte", "fave", "orzo", "grana", "lardo", "speck", "pasta", "noci", "zucca",
                "porri", "sei", "olive"}


def category_of(key):
    for cat, toks in CATEGORIES:
        for t in toks:
            tail = r"\b" if t in EXACT_TOKENS else ""
            if re.search(r"\b" + re.escape(t) + tail, key):
                return cat
    return "Altro"


def alias(name):
    for rx, canon in ALIASES:
        m = rx.match(name)
        if m:
            if canon is None:
                return re.sub(r"^odore di ", "", name)  # "odore di spezie" -> "spezie"
            return canon
    return None


QTY_PART = re.compile(
    r"\d|grammi|decilit|litr|cucchia|quant|idem|\bn\.|pizzic|un po|\bpoc|mezz|\betto|\betti|"
    r"bicchier|tazz|pugn|manciat|bastan|occorr|piacere|sufficien|\bcirca\b|\becc\b|"
    r"\b(?:un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b|\bpresa\b")

# attrezzi e utensili che compaiono negli elenchi ma non sono ingredienti
TOOLS_RX = re.compile(
    r"\b(?:coltell\w*|mezzaluna|pentol\w*|padell\w*|tegam\w*|teglia|tortiera|stampo|frusta|"
    r"mattarello|terrina|ciotola|spatola|frullatore|mixer|casseruola|setaccio|colino|"
    r"pirofila|spianatoia|scodella|forno|forchetta|forchette|cucchiai\w* di (?:legno|plastica|metallo)|"
    r"carta (?:da|forno|alluminio)|pellicola|frullino|planetaria|bilancia|termometro)\b")


def clean_piece(p):
    """Un pezzo di riga ('1 kg di carote fresche') -> nome senza accenti, o None."""
    p = p.strip(" .;:-–*#")
    p = re.sub(r"\s+", " ", p)
    if not p or re.match(r"^per\b", p):
        return None
    p = re.split(r"\s+(?:o|oppure)\s+", p)[0]
    toks = p.split()
    i, popped = 0, False
    while i < len(toks):
        w = toks[i].strip(".,;:")
        nxt = toks[i + 1].strip(".,;:") if i + 1 < len(toks) else ""
        if NUMRE.match(w) or w in NUMWORDS and (popped or w not in {"e", "o", "a", "n", "n."}) \
                or w in UNITS:
            popped = True
            i += 1
        elif w in UNITS_AMBIGUOUS and nxt in CONNECTORS | {"d"} or (
                w in UNITS_AMBIGUOUS and nxt.startswith("d'")):
            popped = True
            i += 1
        elif popped and (w in CONNECTORS or w == "da"):
            i += 1
        else:
            break
    toks = toks[i:]
    if not toks:
        return None
    toks[0] = re.sub(r"^(?:dell|dei|degli|della|delle|del|nell|all|sull|un|d|l)'", "", toks[0])
    while toks and toks[0] in ARTICLES | CONNECTORS:
        toks = toks[1:]
    toks = [t.strip(".,;:") for t in toks if t.strip(".,;:")]
    # taglia alle preposizioni descrittive
    for j in range(1, len(toks)):
        if toks[j] in CUT_WORDS or (toks[j] == "a" and j + 1 < len(toks) and toks[j + 1] in CUT_AFTER_A):
            toks = toks[:j]
            break
    name = " ".join(toks)
    name = re.sub(r"^odore di ", "", name)
    canon = alias(name)
    if canon:
        return canon
    kept = [t for t in toks if t not in MODIFIERS]
    while kept and kept[-1] in CONNECTORS:
        kept.pop()
    if not kept:
        return None
    name = " ".join(kept)
    canon = alias(name)
    return canon or name


def extract_names(line):
    """Riga di ingredienti (con markup) -> (lista nomi senza accenti, testo da mostrare)."""
    display = strip_markup(line).strip(" *#:\t")
    display = re.sub(r"\s+", " ", display).strip()
    # le frazioni scritte con apici nei testi inglesi ("1<sup>1</sup>/<sub>2</sub>") diventano "11/2": si rimettono a posto
    display = re.sub(r"(?<![\d/])([1-9])([1-7])/(2|3|4|8)(?!\d)", lambda m: "%s %s/%s" % m.groups() if int(m.group(2)) < int(m.group(3)) else m.group(0), display)
    t = unaccent(display).lower()
    if TOOLS_RX.search(t):
        return [], display
    t = re.sub(r"\([^)]*\)", " ", t)
    t = re.sub(r"\bq\.?\s?b\.?(?=\W|$)|quanto basta|quanta ne (?:occorre|serve|basta)|a piacere|come desiderato|come necessario|o assaporare|a gusto|per assaggiare|da gustare|\becc\.?", " ", t)
    parts = [x.strip() for x in t.split(",")]
    pieces = parts[:1] + [x for x in parts[1:] if not QTY_PART.search(x)]
    names = []
    for part in pieces:
        for sub in re.split(r"\s+(?:e|ed|\+|&)\s+|/(?!\d)", part):
            n = clean_piece(sub)
            if not n or len(n) < 3 or len(n.split()) > 4 or re.search(r"\d", n) or n in BLACKLIST:
                continue
            first = n.split()[0]
            if re.search(r"mente$", n) and " " not in n:
                continue
            # frasi e verbi finiti per sbaglio negli elenchi: "tagliare a bastoncini", "che sono ..."
            if first in NOT_A_NAME_START or (len(first) >= 6 and re.search(r"(?:are|ere|ire|ndo)$", first)):
                continue
            if n not in names:
                names.append(n)
    return names, display


# ---------------------------------------------------------------- fonti

def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f]


STOP_SECTIONS = re.compile(r"^(consigli|note|varianti|variante|voci correlate|ricette correlate|altri progetti|"
                           r"collegamenti esterni|bibliografia|curiosit|storia|vedi anche|galleria|riferimenti)")
PREP_SECTIONS = re.compile(r"^(preparazione|procedimento|ricetta|esecuzione|realizzazione|come si prepara)")
COURSES = ["Antipasti", "Primi piatti", "Secondi piatti", "Contorni", "Piatti unici", "Dolci",
           "Torte dolci", "Biscotti", "Salse", "Bevande", "Pane", "Pizza"]


def bullets(body):
    out = []
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("*") and not s.rstrip().endswith(":"):
            out.append(s)
    return out


def steps_from(bodies):
    steps = []
    for body in bodies:
        for line in strip_markup(body).splitlines():
            s = re.sub(r"^[#*:\s]+", "", line).strip()
            if s:
                steps.append(s)
    return "\n".join(steps)


def parse_wikibooks(rows, stats):
    recipes = []
    for r in rows:
        text = r["text"]
        if re.match(r"\s*#(?:redirect|rinvia)", text, re.I):
            stats["redirect"] += 1
            continue
        secs = split_sections(text)
        ing_idx = next((i for i, (t, _) in enumerate(secs) if t.startswith("ingredient")), None)
        if ing_idx is None:
            stats["senza sezione ingredienti"] += 1
            continue
        ing_lines, steps_bodies, state = [], [], "ing"
        for t, body in secs[ing_idx:]:
            if state == "ing":
                if t != "" and not t.startswith("ingredient") and PREP_SECTIONS.match(t):
                    state = "prep"
                    steps_bodies.append(body)
                elif t != "" and STOP_SECTIONS.match(t):
                    break
                else:
                    ing_lines += bullets(body)
            elif state == "prep":
                if STOP_SECTIONS.match(t):
                    break
                steps_bodies.append(body)
        steps = steps_from(steps_bodies)
        if not steps:
            stats["senza preparazione"] += 1
            continue
        m = re.search(r"per\s+'*(\d+)'*\s+person", text, re.I)
        cats = re.findall(r"\[\[Categoria:([^\]|]+)", text, re.I)
        course = next((c for p in COURSES for c in cats if c.startswith(p)), None)
        course = next((p for p in COURSES if course and course.startswith(p)), "Altro")
        title = r["title"].split("/")[-1]
        recipes.append({
            "source": "wikibooks", "title": title, "course": course,
            "servings": int(m.group(1)) if m else None, "steps": steps,
            "url": "https://it.wikibooks.org/wiki/" + urllib.parse.quote(r["title"].replace(" ", "_")),
            "license": LICENSE_WB, "ing_lines": ing_lines})
    return recipes


def parse_artusi(rows, stats):
    recipes = []
    for r in rows:
        m = re.match(r"^[^/]+/(?:(.+)/)?(\d+)\.\s*(.+)$", r["title"])
        if not m:
            continue
        section, _, title = m.groups()
        text = strip_markup(r["text"])
        ing_lines, para = [], []
        for line in text.splitlines():
            s = line.strip()
            if not s:
                continue
            if s.startswith("*"):
                ing_lines.append(s)
            else:
                para.append(s)
        steps = steps_from(para)
        if not steps:
            stats["artusi senza testo"] += 1
            continue
        recipes.append({
            "source": "artusi", "title": title.strip(), "course": (section or "Altro").strip(),
            "servings": None, "steps": steps,
            "url": "https://it.wikisource.org/wiki/" + urllib.parse.quote(r["title"].replace(" ", "_")),
            "license": LICENSE_AR, "ing_lines": ing_lines})
    return recipes


def parse_translated(paths, stats):
    """Ricette del Cookbook inglese, gia' tradotte da scripts/translate_en.py."""
    recipes = []
    for path in paths:
        for rec in read_jsonl(path):
            if rec.get("skip"):
                stats["en: senza ingredienti/procedura"] += 1
                continue
            steps = "\n".join(rec["steps"])
            if not steps or len(rec["ing"]) < 2:
                stats["en: vuota dopo la traduzione"] += 1
                continue
            recipes.append({
                "source": "wikibooks-en", "title": rec["title"].strip(), "course": rec["course"],
                "servings": rec.get("servings"), "steps": steps, "url": rec["url"],
                "license": LICENSE_WB_EN, "ing_lines": rec["ing"]})
    return recipes


# ---------------------------------------------------------------- unione e scrittura

def merge_plurals(counts):
    """Unisce plurali e singolari (cipolle/cipolla) guardando i dati: vince la forma piu' frequente."""
    mapping = {}
    for k in sorted(counts, key=lambda x: -counts[x]):
        if " " in k or len(k) < 4:
            continue
        cands = []
        if k.endswith("i"):
            cands = [k[:-1] + "o", k[:-1] + "e", k[:-1] + "a"]
        elif k.endswith("e"):
            cands = [k[:-1] + "a"]
        elif k.endswith("o"):
            cands = [k[:-1] + "i"]
        best = max((c for c in cands if c in counts), key=lambda c: counts[c], default=None)
        if best and best != k:
            if counts[best] >= counts[k]:
                mapping[k] = best
            else:
                mapping[best] = k
    def resolve(x):
        seen = set()
        while x in mapping and x not in seen:
            seen.add(x)
            x = mapping[x]
        return x
    return resolve


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    stats = collections.Counter()
    recipes = parse_wikibooks(read_jsonl(RAW / "wikibooks-it" / "pages.jsonl"), stats)
    recipes += parse_artusi(read_jsonl(RAW / "artusi" / "pages.jsonl"), stats)
    recipes += parse_translated(sorted((ROOT / "data" / "translated").glob("wikibooks-en-it.*.jsonl")), stats)
    print("ricette lette dalle fonti:", len(recipes))

    # per mostrare gli accenti: parola senza accento -> forma accentata piu' usata
    wordforms = collections.defaultdict(collections.Counter)
    for rec in recipes:
        for line in rec["ing_lines"]:
            for w in re.findall(r"[a-zà-ÿ]+", strip_markup(line).lower()):
                wordforms[unaccent(w)][w] += 1

    parsed = []
    for rec in recipes:
        items, seen = [], set()
        for line in rec["ing_lines"]:
            names, display = extract_names(line)
            for n in names:
                if n not in seen:
                    seen.add(n)
                    items.append((n, display))
        if len(items) < MIN_INGREDIENTS:
            stats["scartate: meno di %d ingredienti" % MIN_INGREDIENTS] += 1
            continue
        parsed.append((rec, items))

    counts = collections.Counter(n for _, items in parsed for n, _ in items)
    resolve = merge_plurals(counts)
    counts2 = collections.Counter()
    final = []
    for rec, items in parsed:
        merged, seen = [], set()
        for n, disp in items:
            k = resolve(n)
            if k not in seen:
                seen.add(k)
                merged.append((k, disp))
        final.append((rec, merged))
        counts2.update(k for k, _ in merged)

    def pretty(key):
        return " ".join(wordforms[w].most_common(1)[0][0] if w in wordforms else w for w in key.split())

    OUT_DB.parent.mkdir(parents=True, exist_ok=True)
    if OUT_DB.exists():
        OUT_DB.unlink()
    db = sqlite3.connect(OUT_DB)
    db.executescript("""
        CREATE TABLE recipes(id INTEGER PRIMARY KEY, source TEXT, title TEXT, course TEXT,
                             servings INTEGER, steps TEXT, url TEXT, license TEXT);
        CREATE TABLE ingredients(id INTEGER PRIMARY KEY, name TEXT, key TEXT UNIQUE,
                                 category TEXT, is_staple INTEGER, n_recipes INTEGER);
        CREATE TABLE recipe_ingredients(recipe_id INTEGER, ingredient_id INTEGER, display TEXT,
                                        PRIMARY KEY(recipe_id, ingredient_id));
        CREATE INDEX idx_ri_ingredient ON recipe_ingredients(ingredient_id);
    """)
    ing_id = {}
    for key, n in counts2.most_common():
        cur = db.execute("INSERT INTO ingredients(name,key,category,is_staple,n_recipes) VALUES(?,?,?,?,?)",
                         (pretty(key), key, category_of(key), int(key in STAPLES), n))
        ing_id[key] = cur.lastrowid
    for rec, merged in final:
        cur = db.execute("INSERT INTO recipes(source,title,course,servings,steps,url,license) VALUES(?,?,?,?,?,?,?)",
                         (rec["source"], rec["title"], rec["course"], rec["servings"],
                          rec["steps"], rec["url"], rec["license"]))
        for key, disp in merged:
            db.execute("INSERT INTO recipe_ingredients VALUES(?,?,?)", (cur.lastrowid, ing_id[key], disp))
    db.commit()

    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write("ricette\tingrediente\tcategoria\n")
        for key, n in counts2.most_common():
            f.write("%d\t%s\t%s\n" % (n, pretty(key), category_of(key)))

    n_rec = db.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    n_ing = db.execute("SELECT COUNT(*) FROM ingredients").fetchone()[0]
    n_rare = db.execute("SELECT COUNT(*) FROM ingredients WHERE n_recipes=1").fetchone()[0]
    by_src = db.execute("SELECT source, COUNT(*) FROM recipes GROUP BY source").fetchall()
    print("\n== risultato ==")
    print("ricette nel database:", n_rec, dict(by_src))
    print("ingredienti distinti:", n_ing, "(di cui in una sola ricetta: %d)" % n_rare)
    print("\n== scarti ==")
    for k, v in stats.items():
        print(" ", k, v)
    print("\n== 40 ingredienti piu' frequenti ==")
    for name, cat, n in db.execute("SELECT name,category,n_recipes FROM ingredients ORDER BY n_recipes DESC LIMIT 40"):
        print("  %4d  %-28s %s" % (n, name, cat))
    print("\n== per categoria ==")
    for cat, n, tot in db.execute("SELECT category, COUNT(*), SUM(n_recipes) FROM ingredients GROUP BY category ORDER BY 2 DESC"):
        print("  %-24s %4d ingredienti" % (cat, n))
    db.close()


if __name__ == "__main__":
    main()
