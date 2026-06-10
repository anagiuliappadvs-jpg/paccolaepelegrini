# Dashboard de Instagram da Empresa

Dashboard web com as metricas do perfil de Instagram + modulo de planejamento
de conteudo (com conformidade OAB para advocacia).

## Arquitetura (regra de ouro)

**Nenhum token ou senha pode aparecer no site publico.** Por isso ha duas partes:

```
[Instagram Graph API]  --(token secreto)-->  [COLETOR privado]
        --> grava data/snapshot.json (sem segredos) -->  [SITE publico le o JSON]
```

## Estrutura

```
coletor/
  fetch_instagram.js   # busca metricas, processa e grava o snapshot
  refresh_token.js     # renova o token de longa duracao
  lib/                 # utilitarios (config e chamadas a API)
data/
  snapshot.json        # retrato processado (publico, SEM segredos)
  planejamento.json    # calendario + ideias (editado por voce)
site/                  # front-end publico (Fase 3 em diante)
```

## Como rodar o coletor (depois de configurar)

1. Copie `.env.example` para `.env` e preencha o token e o ID da conta.
2. No terminal, dentro desta pasta:

```
npm run coletar          # busca os dados e grava data/snapshot.json
npm run renovar-token    # renova o token de longa duracao (rode ~1x/mes)
```

> O arquivo `.env` NUNCA vai pro GitHub (esta no `.gitignore`).

## Como ver o dashboard

Clique 2x no arquivo **"Abrir Dashboard.bat"** (na pasta do projeto).
Ele abre o dashboard no navegador. Feche a janela preta para encerrar.

## Link publico

**https://anagiuliappadvs-jpg.github.io/dashboard-instagram/**

(atualiza sozinho todo dia as 11h, quando o coletor roda e publica o snapshot)

## Status das fases

- [x] Fase 1 - Coletor (testado com dados reais de @paccolaepelegrini)
- [x] Fase 2 - Agenda automatica (coletor diario 11h via Task Scheduler, publica no GitHub)
- [x] Fase 3 - Site (visao geral + tabela de posts)
- [x] Fase 4 - Graficos (crescimento, formato, horarios, audiencia, funil)
- [x] Fase 5 - Planejamento (kanban + metas + conformidade OAB) - leitura
- [x] Fase 7 - Deploy (link publico no GitHub Pages)
- [x] Token de 60 dias + renovacao automatica semanal
- [ ] Fase 6 - Sugestoes por IA (opcional)
