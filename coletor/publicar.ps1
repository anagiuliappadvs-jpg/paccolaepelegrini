# Roda o coletor e PUBLICA o snapshot novo no GitHub (Pages atualiza sozinho).
# Usado pela tarefa agendada diaria. Nunca envia o .env (esta no .gitignore).
$ErrorActionPreference = "Continue"
$proj = Split-Path -Parent $PSScriptRoot
Set-Location $proj

# 1) coleta os dados (gera data/snapshot.json)
node "coletor\fetch_instagram.js"

# 2) publica so os dados, sem segredos
git pull --rebase --autostash 2>$null
git add data/snapshot.json data/planejamento.json 2>$null
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  $msg = "Atualiza dados ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
  git commit -m $msg 2>$null
  git push 2>$null
  Write-Host "[publicar] snapshot enviado ao GitHub"
} else {
  Write-Host "[publicar] sem mudancas para publicar"
}
