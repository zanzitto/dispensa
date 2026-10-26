"""Genera le pagine statiche del sito (una per ricetta) per Google e per chi arriva da una ricerca.

Uso:  python -I scripts/build_pages.py [--site site] [--out dist] [--url https://utente.github.io/dispensa]

Copia la cartella del sito in --out e vi aggiunge:
  ricetta/<id>-<nome>.html   una pagina per ricetta, con il testo gia' scritto dentro e i dati strutturati
  ricette/index.html         elenco di tutte le ricette per portata (serve a far scoprire le pagine)
  sitemap.xml, robots.txt
Le pagine NON vanno salvate nel repository: le genera GitHub a ogni pubblicazione (vedi .github/workflows/pages.yml).
"""
import argparse
import collections
import html
import json
import math
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_URL = "https://zanzitto.github.io/dispensa"

EMOJI = [
    (r"pizza", "🍕"), (r"torte? dolc|torta|crostat", "🎂"), (r"biscott|pasticcini", "🍪"),
    (r"dolc|dessert|creme|budini|pasticc", "🍰"), (r"gelat|sorbett", "🍨"), (r"liquor|bevand|cocktail", "🍹"),
    (r"colazion", "🥞"), (r"primi|minestr|pasta|riso|gnocchi", "🍝"), (r"zupp|brod|passati", "🍲"),
    (r"uov|frittat", "🍳"), (r"pesc|frutti di mare|crostacei", "🐟"),
    (r"arrost|second|carne|lesso|umido|fritt|bolliti", "🍖"), (r"insalat", "🥗"),
    (r"contorn|verdur|legum", "🥦"), (r"antipast|stuzzich", "🥟"), (r"sals|condiment", "🥫"),
    (r"pane|focacc", "🍞"), (r"unic", "🍲"),
]
HUES = [
    (r"dolc|torte|biscott|dessert|creme|gelat|budin", 335), (r"zupp|brod", 22),
    (r"primi|pasta|minestr|riso|gnocchi", 38), (r"second|carne|arrost|lesso|umido|fritt", 10),
    (r"insalat|contorn|verdur|legum", 125), (r"antipast", 85), (r"pesc", 200), (r"bevand|liquor", 275),
    (r"pane|pizza|focacc", 42), (r"sals", 4), (r"uov|colazion", 50),
]


def esc(s):
    return html.escape(str(s), quote=True)


def slugify(title):
    s = unicodedata.normalize("NFKD", title)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60].strip("-") or "ricetta"


def pick(table, course, default):
    for rx, val in table:
        if re.search(rx, course, re.I):
            return val
    return default


def plural(n, one, many):
    return "%d %s" % (n, one if n == 1 else many)


def recipe_path(r):
    return "ricetta/%d-%s.html" % (r["id"], slugify(r["t"]))


def related(recipes, ing_by_id):
    """Per ogni ricetta, le piu' simili: contano di piu' gli ingredienti rari in comune."""
    by_ing = collections.defaultdict(list)
    core = {}
    for r in recipes:
        ids = {i for i, _ in r["i"] if not ing_by_id[i]["s"]}
        core[r["id"]] = ids
        for i in ids:
            if ing_by_id[i]["f"] <= 400:
                by_ing[i].append(r["id"])
    out = {}
    for r in recipes:
        score = collections.Counter()
        for i in core[r["id"]]:
            w = 1.0 / math.log(ing_by_id[i]["f"] + 2)
            for other in by_ing.get(i, ()):
                if other != r["id"]:
                    score[other] += w
        out[r["id"]] = [rid for rid, _ in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))[:6]]
    return out


def page(title, description, canonical, body, base_rel, extra_head=""):
    return """<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(canon)s">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Dispensa">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(canon)s">
<meta name="theme-color" content="#ff5a36">
<link rel="icon" href="%(rel)sicon.svg" type="image/svg+xml">
<link rel="manifest" href="%(rel)smanifest.webmanifest">
<link rel="stylesheet" href="%(rel)scss/style.css">
%(extra)s</head>
<body>
<div id="app">
%(body)s
</div>
<nav id="nav" aria-label="Navigazione principale">
  <a href="%(rel)s#/" class="on" data-nav="cerca"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Cerca</a>
  <a href="%(rel)s#/preferiti" data-nav="preferiti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-4.6-9.3-9.2C1.2 8.6 3 5 6.5 5c2 0 3.5 1.1 5.5 3.2C14 6.1 15.5 5 17.5 5 21 5 22.8 8.6 21.3 11.8 19 16.4 12 21 12 21z"/></svg>Preferiti</a>
  <a href="%(rel)s#/info" data-nav="info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>Info</a>
</nav>
</body>
</html>
""" % {"title": esc(title), "desc": esc(description), "canon": esc(canonical), "body": body,
       "rel": base_rel, "extra": extra_head}


def recipe_page(r, data, ing_by_id, rel_ids, by_id, base_url):
    src = data["sources"].get(r["src"], {})
    course = r["c"]
    hue, emoji = pick(HUES, course, 30), pick(EMOJI, course, "🍽️")
    lines, seen = [], set()
    for iid, disp in r["i"]:
        if disp not in seen:
            seen.add(disp)
            lines.append(disp)
    main = [ing_by_id[i]["n"] for i, _ in r["i"] if not ing_by_id[i]["s"]]
    main = list(dict.fromkeys(main))
    steps = [s for s in r["st"].split("\n") if s.strip()]
    title = "%s – ricetta con %s | Dispensa" % (r["t"], plural(len(lines), "ingrediente", "ingredienti"))
    desc = "Ricetta %s: %s%s. Procedimento passo per passo, su Dispensa trovi le ricette in base agli ingredienti che hai in casa." % (
        r["t"], plural(len(lines), "ingrediente", "ingredienti"), " (" + ", ".join(main[:5]) + ")" if main else "")
    if len(desc) > 300:
        desc = desc[:297] + "..."
    canonical = "%s/%s" % (base_url, recipe_path(r))

    steps_html = ("<div class=\"prose\">%s</div>" % "".join("<p>%s</p>" % esc(s) for s in steps)
                  if src.get("passi") == "prosa"
                  else "<ol class=\"stepcards\">%s</ol>" % "".join("<li>%s</li>" % esc(s) for s in steps))
    rel_html = ""
    if rel_ids:
        rel_html = "<h3>Ricette simili</h3><ul class=\"ing simili\">%s</ul>" % "".join(
            "<li><a href=\"../%s\">%s</a></li>" % (esc(recipe_path(by_id[i])), esc(by_id[i]["t"])) for i in rel_ids)
    find_html = ""
    if main:
        find_html = ("<h3>Come trovarla su Dispensa</h3><p>Scegli %s tra i tuoi ingredienti: Dispensa ti mostra questa ricetta "
                     "e tutte le altre che puoi preparare con quello che hai in casa, anche quelle a cui manca un solo ingrediente.</p>"
                     % esc(", ".join(main[:4])))
    body = (
        '<div class="bar"><a class="ib" href="../" aria-label="Torna a Dispensa">←</a>'
        '<h2 style="flex:1">🍅 Dispensa</h2></div>'
        '<div class="cover" style="--h:%d"><div class="big" aria-hidden="true">%s</div></div>'
        '<article class="detail"><h1>%s</h1><div class="tags"><span class="tag">%s</span>%s<span class="tag">%s</span></div>'
        '<div class="actions"><a class="btn pri" href="../">Cerca con i tuoi ingredienti</a></div>'
        '<h3>Ingredienti</h3><ul class="ing">%s</ul><h3>Procedimento</h3>%s%s%s'
        '<div class="credit">%sFonte: <a href="%s" target="_blank" rel="noopener">%s</a> · Licenza: <a href="%s" target="_blank" rel="noopener">%s</a>'
        '</div></article>'
    ) % (
        hue, emoji, esc(r["t"]), esc(course),
        '<span class="tag">per %s</span>' % plural(r["sv"], "persona", "persone") if r.get("sv") else "",
        plural(len(lines), "ingrediente", "ingredienti"),
        "".join("<li>%s</li>" % esc(l) for l in lines), steps_html, find_html, rel_html,
        '<span class="auto">Tradotta automaticamente dall’inglese</span><br>' if src.get("auto") else "",
        esc(r["u"]), esc(src.get("nome", r["src"])), esc(src.get("licenza_url", "#")), esc(src.get("licenza", "")))

    ld = {
        "@context": "https://schema.org", "@type": "Recipe", "name": r["t"], "inLanguage": "it",
        "recipeCategory": course, "recipeIngredient": lines,
        "recipeInstructions": [{"@type": "HowToStep", "text": s} for s in steps],
        "isBasedOn": r["u"], "url": canonical,
    }
    if r.get("sv"):
        ld["recipeYield"] = "%d persone" % r["sv"]
    ld_json = json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")
    extra = '<script type="application/ld+json">%s</script>\n' % ld_json
    return page(title, desc, canonical, body, "../", extra)


def index_page(data, base_url):
    by_course = collections.defaultdict(list)
    for r in data["recipes"]:
        by_course[r["c"]].append(r)
    parts = ['<div class="bar"><a class="ib" href="../" aria-label="Torna a Dispensa">←</a><h2 style="flex:1">🍅 Tutte le ricette</h2></div>'
             '<div class="page"><p>%d ricette da scoprire. Per trovare quella giusta in base a cosa hai in casa, '
             '<a href="../">usa la ricerca per ingredienti</a>.</p>' % len(data["recipes"])]
    for course in sorted(by_course, key=lambda c: (c == "Altro", c)):
        items = sorted(by_course[course], key=lambda r: r["t"].lower())
        parts.append("<h2>%s %s <small>(%d)</small></h2><ul>%s</ul>" % (
            pick(EMOJI, course, "🍽️"), esc("Altre ricette" if course == "Altro" else course), len(items),
            "".join('<li><a href="../%s">%s</a></li>' % (esc(recipe_path(r)), esc(r["t"])) for r in items)))
    parts.append("</div>")
    return page("Tutte le ricette | Dispensa",
                "Elenco di tutte le ricette di Dispensa, divise per tipo di piatto.",
                base_url + "/ricette/", "".join(parts), "../")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=str(ROOT / "site"))
    ap.add_argument("--out", default=str(ROOT / "dist"))
    ap.add_argument("--url", default=DEFAULT_URL)
    a = ap.parse_args()
    site, out, base = Path(a.site).resolve(), Path(a.out).resolve(), a.url.rstrip("/")
    if out == site or out in site.parents or site in out.parents:
        sys.exit("--out non puo' essere dentro o sopra la cartella del sito")
    data = json.loads((site / "data" / "recipes.json").read_text(encoding="utf-8"))
    ing_by_id = {g["id"]: g for g in data["ingredients"]}
    by_id = {r["id"]: r for r in data["recipes"]}

    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(site, out)
    (out / "ricetta").mkdir()
    (out / "ricette").mkdir()

    rel = related(data["recipes"], ing_by_id)
    for r in data["recipes"]:
        (out / recipe_path(r)).write_text(recipe_page(r, data, ing_by_id, rel[r["id"]], by_id, base), encoding="utf-8")
    (out / "ricette" / "index.html").write_text(index_page(data, base), encoding="utf-8")

    day = data.get("version", "")
    urls = [base + "/", base + "/ricette/"] + ["%s/%s" % (base, recipe_path(r)) for r in data["recipes"]]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += ["<url><loc>%s</loc>%s</url>" % (esc(u), "<lastmod>%s</lastmod>" % day if day else "") for u in urls]
    sm.append("</urlset>")
    (out / "sitemap.xml").write_text("\n".join(sm) + "\n", encoding="utf-8")
    (out / "robots.txt").write_text("User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % base, encoding="utf-8")
    print("pagine create: %d ricette + indice, mappa del sito con %d indirizzi -> %s" % (len(data["recipes"]), len(urls), out))


if __name__ == "__main__":
    main()
