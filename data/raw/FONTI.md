# Fonti dei dati grezzi (scaricati il 2026-10-26)

Dati non modificati, come scaricati. Da pulire/normalizzare in una fase successiva.

## wikibooks-it/pages.jsonl
- Fonte: Italian Wikibooks, pagine "Libro di cucina/..." (https://it.wikibooks.org/)
- Contenuto: 843 pagine, circa 676 vere ricette (sezioni Ingredienti + Preparazione), testo wiki grezzo.
- Licenza: CC BY-SA 4.0. Obblighi: citare la fonte (Wikibooks e autori, link alla pagina di ogni ricetta) e distribuire le modifiche con la stessa licenza.
- Ogni riga: title, pageid, revid, text. La cronologia di ogni pagina elenca gli autori.

## artusi/pages.jsonl
- Fonte: Italian Wikisource, "Scienza in cucina e l'arte di mangiar bene" di Pellegrino Artusi (https://it.wikisource.org/)
- Contenuto: 824 pagine, 791 ricette numerate. Ingredienti come elenco puntato ("*Ricotta, grammi 300.") e procedimento in prosa ottocentesca.
- Licenza: opera di pubblico dominio (autore morto nel 1911). Da verificare le condizioni della trascrizione di Wikisource prima della pubblicazione.

## artusi/la_scienza_in_cucina.pdf
- Stesso testo, da Liber Liber (copia sul mirror del Politecnico di Torino), tratto dall'edizione Einaudi 1994. Solo di riferimento: la fonte usata per i dati è il Wikisource sopra.

## wikibooks-en/pages.jsonl (+ data/translated/wikibooks-en-it.*.jsonl)
- Fonte: Wikibooks inglese, Cookbook (https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents), scaricato il 2026-10-26.
- Contenuto: 3.799 pagine, circa 3.650 ricette usabili.
- Licenza: CC BY-SA 4.0. Obblighi: citare la fonte e distribuire le modifiche con la stessa licenza.
- Traduzione in italiano AUTOMATICA e offline (Argos Translate), con conversione di once/libbre in grammi e gradi Fahrenheit in Celsius (scripts/translate_en.py).
  Le ricette tradotte sono segnalate come tali nel sito. La traduzione puo' contenere errori.

## NON inclusi (licenza non adatta a un'app con pubblicità)
- DBRicette (Giorgio Musilli): CC non commerciale, nessuna modifica, archivi non riutilizzabili senza consenso scritto. Serve il permesso dell'autore.
- Dataset Zenodo "Italian gastronomic recipes": derivato da giallozafferano.it, provenienza dei diritti non chiara.
