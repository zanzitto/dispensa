# Dispensa – app Android "ricette dagli ingredienti"

Documento di passaggio. Chi lo legge (persona o Claude Code) deve poter continuare il lavoro senza altre spiegazioni.

## 1. Obiettivo

App Android in italiano. L'utente sceglie gli ingredienti che ha in casa (es. farina + passata di pomodoro) e l'app mostra tutte le ricette che li contengono (pizza, pasta al pomodoro, gnocchi...).

Scelte già prese:
- **Nessuna intelligenza artificiale.** È una ricerca in un database di ricette, quindi risposte istantanee e costo quasi zero.
- Il database di ricette (grande, online) lo fornisce il proprietario del progetto. **Non è ancora stato scelto.**

## 2. Stato attuale

Esiste solo un **prototipo di design cliccabile** in `prototype/index.html` (HTML + JS, nessuna dipendenza). Mostra schermate, pulsanti e logica di ricerca con 12 ricette di esempio scritte a mano. Anteprima online: https://claude.ai/artifact/WNmLh5wnnZjKCufRpxuJED

Non esiste ancora codice Android.

## 3. Come funziona il prototipo

**Schermate**
1. **Cerca:** barra di ricerca con suggerimenti, ingredienti raggruppati per categoria (Base; Pasta, riso, pane; Verdure; Formaggi e salumi), ingredienti scelti in alto, pulsante in basso "Vedi N ricette" (disattivato se non c'è nessun ingrediente).
2. **Risultati:** elenco di schede con emoji, nome, tempo, difficoltà e un'etichetta: verde "Hai tutto" oppure arancione "Ti manca: ...". Interruttore tra due modalità.
3. **Dettaglio ricetta:** pannello a scorrimento dal basso con ingredienti (verdi = ce li hai, arancioni = mancano) e procedimento.
4. **Preferiti:** ricette salvate col cuore, memorizzate sul dispositivo.

**Logica di ricerca** (funzione `match()` nel prototipo)
- Gli ingredienti "scontati" (sale, pepe, olio, acqua) vengono ignorati: non vanno chiesti all'utente e non contano come mancanti.
- Modalità **"Con tutti i miei ingredienti"**: restano solo le ricette che contengono *tutti* gli ingredienti scelti.
- Modalità **"Quasi pronte"**: ricette che contengono almeno un ingrediente scelto e a cui manca **al massimo 1** ingrediente.
- L'ordinamento è per numero di ingredienti mancanti (prima quelle complete).

**Stile:** palette calda (arancio pomodoro `#d94f2b`, crema `#fbf6ee`), modalità chiara e scura automatica, barra di navigazione in basso (Cerca / Preferiti), pulsante principale grande vicino al pollice, bordi molto arrotondati.

## 4. Cosa serve decidere / fornire

1. **Il database di ricette** (lo dà il proprietario). Prima di usarlo bisogna verificare:
   - **Licenza e termini d'uso:** si può usare in un'app pubblicata? Serve citare la fonte?
   - **Lingua:** se è in inglese, le ricette vanno tradotte in italiano (una volta sola, in anticipo, non a ogni ricerca).
   - **Formato:** API online, file JSON/CSV scaricabile o database. Da questo dipende l'architettura (sezione 5).
2. **Tecnologia Android.** Consiglio **Expo (React Native)**: il design del prototipo si traduce facilmente, si prova subito sul telefono con Expo Go e si può pubblicare sul Play Store. Alternative: Flutter o Kotlin con Jetpack Compose. Decisione da confermare col proprietario.

## 5. Architettura consigliata

**Se il database è scaricabile (preferibile):** importarlo in uno **SQLite incluso nell'app** (`expo-sqlite`). Vantaggi: funziona offline, ricerca istantanea, nessun server da pagare.

**Se è solo un'API online:** mettere un **piccolo server intermediario** (non mettere mai la chiave API dentro l'app: si può estrarre) che fa la ricerca e il caching.

**Normalizzazione degli ingredienti (la parte più importante).** Nei database veri gli ingredienti sono scritti in mille modi ("2 cucchiai di farina 00", "pomodori pelati", "Parmigiano Reggiano DOP"). Serve una fase di preparazione dati che:
- porti tutto in minuscolo e senza accenti;
- tolga quantità e unità di misura;
- unisca singolari/plurali e sinonimi (pomodoro/pomodori/passata, se si decide che sono uguali);
- produca per ogni ricetta una lista di **ingredienti canonici**.

Poi si crea una tabella ingredienti, una tabella ricette e una tabella di collegamento con indice sull'ingrediente: la ricerca "tutte le ricette che contengono A e B" diventa una query veloce anche con centinaia di migliaia di ricette.

La lista di ingredienti da mostrare nella schermata Cerca va ricavata dai dati reali (i più frequenti, raggruppati per categoria), non scritta a mano.

## 6. Piano di lavoro

1. Ricevere il database e controllarne licenza, formato e lingua.
2. Script di preparazione dati: pulizia, normalizzazione ingredienti, traduzione se serve, esportazione in SQLite.
3. Creare il progetto Expo e riprodurre le 4 schermate del prototipo con i dati reali.
4. Implementare la ricerca con le due modalità e gli ingredienti scontati.
5. Preferiti persistenti, stato vuoto, caricamento ed errori.
6. Prove su telefono vero, icona, nome, schermata di avvio.
7. Citazione della fonte dei dati nell'app, informativa privacy (anche se l'app non raccoglie dati), pubblicazione su Google Play.

## 7. Idee per dopo (non fare subito)

Filtri per dieta e tempo, foto del piatto, lista della spesa degli ingredienti mancanti, ricerca per esclusione ("senza glutine"), condivisione ricetta.

## 8. Prompt da incollare in Claude Code

Apri Claude Code nella cartella di questo pacchetto e incolla:

```
Leggi HANDOFF.md e prototype/index.html: contengono tutto il contesto del progetto.
Voglio costruire l'app Android "Dispensa" con Expo (React Native), in italiano,
seguendo il design e la logica del prototipo (schermate Cerca, Risultati,
Dettaglio, Preferiti; due modalità di ricerca; ingredienti scontati ignorati).

Il database di ricette è qui: [INCOLLA LINK O FILE DEL DATABASE].

Prima di scrivere l'app:
1. Controlla formato, lingua e licenza del database e dimmi cosa trovi.
2. Proponi come normalizzare gli ingredienti e come trasformare i dati in SQLite.
3. Aspetta la mia conferma, poi segui il piano di lavoro della sezione 6.

Spiegami le cose in modo semplice: non sono uno sviluppatore.
```
