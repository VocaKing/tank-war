#!/bin/sh
# Starts a tiny local web server (Python 3) and opens the game. Or: npx serve .
cd "$(dirname "$0")"
( sleep 1; (open http://localhost:8000/ 2>/dev/null || xdg-open http://localhost:8000/ 2>/dev/null) ) &
python3 -m http.server 8000
