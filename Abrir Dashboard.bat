@echo off
REM Abre o dashboard no navegador (sobe o servidor local e abre a pagina).
REM Feche esta janela preta para encerrar o servidor.
cd /d "%~dp0"
start "" http://localhost:4321/
node tools\preview-server.mjs
