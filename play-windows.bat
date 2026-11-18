@echo off
REM Starts a tiny local web server (Python 3 required) and opens the game.
cd /d "%~dp0"
start "" http://localhost:8000/
python -m http.server 8000 || py -m http.server 8000
