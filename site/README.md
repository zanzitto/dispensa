# Dispensa – sito

Sito statico (HTML + CSS + JavaScript, nessuna dipendenza) installabile come app (PWA).
Cerca ricette dagli ingredienti, funziona offline.

## Avvio
Doppio clic su `avvia-sito.bat` (nella cartella principale) oppure, da questa cartella:
`python -m http.server 8080` e apri http://localhost:8080/

## Dove modificare cosa
| Cosa | File |
|---|---|
| Testi, colori, aspetto | `css/style.css`, testi in `js/app.js` |
| Impostazioni (pubblicità, ricette per pagina, email) | blocco `DISPENSA_CONFIG` in `index.html` |
| Regole di ricerca (ingredienti scontati, "quasi pronte") | `js/search.js` (in alto, commentate) |
| Schermate | `js/app.js` (`viewSearch`, `viewResults`, `viewDetail`, ...) |
| Ricette e ingredienti | si rigenerano, non si modificano a mano (vedi sotto) |

Dopo aver cambiato i file, aumenta `VERSION` in `sw.js`, altrimenti chi ha già aperto il sito vede la vecchia copia.

## Aggiornare le ricette
```
python -I scripts/build_db.py      # fonti grezze in data/raw  ->  data/dispensa.db
python -I scripts/export_json.py   # data/dispensa.db          ->  site/data/recipes.json
node scripts/test_search.js        # prove della ricerca
```
Per aggiungere una fonte: salvala in `data/raw/`, aggiungi il parser in `build_db.py`, annota licenza in `data/raw/FONTI.md` e in `export_json.py` (SOURCES).

## Pubblicità (solo nell'app)
Il modulo `js/ads.js` gestisce gli annunci AdMob. Sul sito web resta spento.
- **Provarlo sul sito**: apri `http://localhost:8080/?demoads=1` (annunci finti: banner e interstitial quando esci da una ricetta).
- **Nell'app**: installa il plugin (`npm i @capacitor-community/admob`), imposta `ads.enabled: true` e i tuoi codici in `index.html`. Finche' `testMode` e' `true` vedi solo annunci di prova di Google.
- **Mai cliccare i tuoi annunci veri**: AdMob chiude l'account.
- Limiti modificabili (`ads.limits`): un interstitial ogni 4 minuti e ogni 3 ricette, mai prima della quinta ricetta.
- Prove della logica: `node scripts/test_ads.js`.

## Verso Play Store e App Store (Capacitor)
Capacitor impacchetta questo stesso sito in un'app nativa, senza riscriverlo.
1. Servono icone PNG (1024x1024) generate da `icon.svg`.
2. `npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`
3. `npx cap init Dispensa it.tuonome.dispensa --web-dir site`, poi `npx cap add android` / `npx cap add ios`
4. `npx cap sync` dopo ogni modifica al sito, poi apri Android Studio (`npx cap open android`) o Xcode.
5. Account: Google Play Console (pagamento una tantum), Apple Developer Program (annuale). Per iOS serve un Mac con Xcode.
6. Prima della pubblicazione: informativa privacy online, schermate dello store, citazione delle fonti (già nella pagina Info).
