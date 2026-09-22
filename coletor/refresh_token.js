// ==========================================================================
// CHECAGEM SEMANAL DO TOKEN (antes: "renovador")
//
// Desde 22/09/2026 o coletor usa um TOKEN DE PAGINA, que NAO expira.
// Este script agora e um checador de saude:
//   - token valido e sem vencimento  -> OK, nada a fazer
//   - token valido vencendo (<10d)   -> tenta estender (so funciona p/ token de usuario)
//   - token invalido/revogado        -> ERRO alto (acende o Dashboard de Automacoes)
//
// Roda pela tarefa agendada semanal (domingo 10:30): npm run renovar-token
// ==========================================================================

import fs from "node:fs";
import path from "node:path";
import { carregarEnv, exigir, RAIZ_PROJETO } from "./lib/env.js";

carregarEnv();

const TOKEN_ATUAL = exigir("IG_ACCESS_TOKEN");
const APP_ID = exigir("IG_APP_ID");
const APP_SECRET = exigir("IG_APP_SECRET");
const VERSAO = process.env.IG_API_VERSION || "v22.0";
const CAMINHO_ENV = path.join(RAIZ_PROJETO, ".env");
const CAMINHO_LOG = path.join(RAIZ_PROJETO, "logs.txt");

function registrar(msg) {
  try {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const c = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    fs.appendFileSync(CAMINHO_LOG, `[${c}] [renovar-token] ${msg}\n`, "utf8");
  } catch {}
}

async function main() {
  // 1) inspeciona o token atual
  const appTok = `${APP_ID}|${APP_SECRET}`;
  const durl = new URL(`https://graph.facebook.com/${VERSAO}/debug_token`);
  durl.searchParams.set("input_token", TOKEN_ATUAL);
  durl.searchParams.set("access_token", appTok);
  const dresp = await fetch(durl);
  const djson = await dresp.json();
  const info = djson.data;

  if (!info || !info.is_valid) {
    registrar(
      `ERRO: token INVALIDO/revogado (${djson.error?.message || info?.error?.message || "sem detalhe"}) - ` +
        `gerar token novo no Graph API Explorer (pedir ajuda ao Claude) | exit=1`
    );
    console.error("\n[ERRO] Token invalido/revogado. Gere um novo no Graph API Explorer.\n");
    process.exit(1);
  }

  // 2) token de pagina / sem vencimento: nada a fazer
  if (info.expires_at === 0) {
    registrar(`=== FIM === exit=0 | token de pagina valido, sem vencimento - nada a fazer`);
    console.log("\n[OK] Token de pagina valido e sem vencimento. Nada a fazer.\n");
    return;
  }

  // 3) token com prazo: se ainda folgado, so reporta
  const diasRestantes = Math.round((info.expires_at * 1000 - Date.now()) / 86400000);
  if (diasRestantes >= 10) {
    registrar(`=== FIM === exit=0 | token valido, vence em ~${diasRestantes} dias - nada a fazer`);
    console.log(`\n[OK] Token valido, vence em ~${diasRestantes} dias.\n`);
    return;
  }

  // 4) vencendo: tenta estender (funciona p/ token curto de usuario; o longo a Meta nao estende)
  const url = new URL(`https://graph.facebook.com/${VERSAO}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", APP_ID);
  url.searchParams.set("client_secret", APP_SECRET);
  url.searchParams.set("fb_exchange_token", TOKEN_ATUAL);
  const resp = await fetch(url);
  const json = await resp.json();

  const novoToken = json.access_token;
  const diasNovo = json.expires_in ? Math.round(json.expires_in / 86400) : 0;
  if (!resp.ok || json.error || !novoToken || novoToken === TOKEN_ATUAL || diasNovo < 10) {
    registrar(
      `ERRO: token vence em ~${diasRestantes} dias e a troca NAO estendeu ` +
        `(a Meta nao estende token longo) - gerar token novo no Graph API Explorer | exit=1`
    );
    console.error(`\n[ERRO] Token vence em ~${diasRestantes} dias e nao consegui estender. Gere um novo.\n`);
    process.exit(1);
  }

  let conteudo = fs.readFileSync(CAMINHO_ENV, "utf8");
  conteudo = conteudo.replace(/^IG_ACCESS_TOKEN=.*$/m, `IG_ACCESS_TOKEN=${novoToken}`);
  fs.writeFileSync(CAMINHO_ENV, conteudo, "utf8");
  registrar(`=== FIM === exit=0 | token estendido, validade ~${diasNovo} dias`);
  console.log(`\n[OK] Token estendido. Validade: ~${diasNovo} dias.\n`);
}

main().catch((e) => {
  registrar(`ERRO inesperado na checagem do token: ${e.message} | exit=1`);
  console.error("\n[ERRO inesperado]", e);
  process.exit(1);
});
