@echo off
title Uniqo - Your Style. Your Rarity.
cd /d "%~dp0"
start "" http://localhost:8080/
python server.py
pause
