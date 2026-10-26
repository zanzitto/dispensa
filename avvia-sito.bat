@echo off
rem Avvia il sito Dispensa in locale e lo apre nel browser. Chiudi questa finestra per fermarlo.
cd /d "%~dp0site"
start "" http://localhost:8080/
python -m http.server 8080 --bind 127.0.0.1
