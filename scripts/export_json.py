"""Esporta data/dispensa.db in site/data/recipes.json per il sito.

Uso (dalla cartella del progetto):  python -I scripts/export_json.py
Va rilanciato ogni volta che si rigenera il database con build_db.py.
"""
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "dispensa.db"
OUT = ROOT / "site" / "data" / "recipes.json"

CATEGORIES = ["Base", "Pasta, riso, pane", "Verdure e frutta", "Formaggi e salumi",
              "Carne e pesce", "Legumi e frutta secca", "Altro"]

SOURCES = {
    "wikibooks": {
        "nome": "Wikibooks italiano - Libro di cucina",
        "url": "https://it.wikibooks.org/wiki/Libro_di_cucina",
        "licenza": "CC BY-SA 4.0",
        "licenza_url": "https://creativecommons.org/licenses/by-sa/4.0/deed.it",
        "passi": "lista",
    },
    "wikibooks-en": {
        "nome": "Wikibooks inglese - Cookbook (traduzione automatica in italiano)",
        "url": "https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents",
        "licenza": "CC BY-SA 4.0",
        "licenza_url": "https://creativecommons.org/licenses/by-sa/4.0/deed.it",
        "passi": "lista",
        "auto": True,
    },
    "artusi": {
        "passi": "prosa",
        "nome": "Pellegrino Artusi - La scienza in cucina e l'arte di mangiar bene (trascrizione Wikisource)",
        "url": "https://it.wikisource.org/wiki/Scienza_in_cucina_e_l%27arte_di_mangiar_bene",
        "licenza": "Pubblico dominio",
        "licenza_url": "https://it.wikisource.org/wiki/Wikisource:Pubblico_dominio",
    },
}


def main():
    if not DB.exists():
        sys.exit("Manca %s: lancia prima scripts/build_db.py" % DB)
    db = sqlite3.connect(DB)
    ingredients = [
        {"id": i, "n": name, "k": key, "c": CATEGORIES.index(cat), "s": staple, "f": n}
        for i, name, key, cat, staple, n in db.execute(
            "SELECT id, name, key, category, is_staple, n_recipes FROM ingredients ORDER BY n_recipes DESC")
    ]
    links = {}
    for rid, iid, disp in db.execute(
            "SELECT recipe_id, ingredient_id, display FROM recipe_ingredients ORDER BY rowid"):
        links.setdefault(rid, []).append([iid, disp])
    recipes = [
        {"id": rid, "t": title, "c": course, "sv": servings, "src": source, "u": url,
         "i": links.get(rid, []), "st": steps}
        for rid, source, title, course, servings, steps, url in db.execute(
            "SELECT id, source, title, course, servings, steps, url FROM recipes ORDER BY id")
    ]
    data = {"version": date.today().isoformat(), "categories": CATEGORIES,
            "sources": SOURCES, "ingredients": ingredients, "recipes": recipes}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("scritto %s: %d ricette, %d ingredienti, %d KB" % (
        OUT.relative_to(ROOT), len(recipes), len(ingredients), OUT.stat().st_size // 1024))


if __name__ == "__main__":
    main()
