// ==========================================================================
// RENOVADOR DO TOKEN DE LONGA DURACAO
//
// O token de longa duracao vale ~60 dias. Este script troca o token atual
// por um novo (zerando o prazo) e ATUALIZA o arquivo .env automaticamente.
//
// Rode de vez em quando (ex.: 1x por mes) com:  npm run renovar-token
// Precisa do ID e do Segredo do app (IG_APP_ID e IG_APP_SECRET no .env).
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
  const url = new URL(`https://graph.facebook.com/${VERSAO}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", APP_ID);
  url.searchParams.set("client_secret", APP_SECRET);
  url.searchParams.set("fb_exchange_token", TOKEN_ATUAL);

  const resp = await fetch(url);
  const json = await resp.json();

  if (!resp.ok || json.error || !json.access_token) {
    registrar(`ERRO ao renovar token: ${json.error?.message || resp.status} | exit=1`);
    console.error(
      "\n[ERRO] Nao consegui renovar o token:",
      json.error?.message || `HTTP ${resp.status}`
    );
    console.error(
      "Se o token ja estiver expirado, gere um novo manualmente no " +
        "Meta for Developers e cole no .env.\n"
    );
    process.exit(1);
  }

  const novoToken = json.access_token;
  const validadeDias = json.expires_in
    ? Math.round(json.expires_in / 86400)
    : "~60";

  // atualiza o .env trocando so a linha do token (preserva o resto)
  let conteudo = fs.readFileSync(CAMINHO_ENV, "utf8");
  if (/^IG_ACCESS_TOKEN=.*$/m.test(conteudo)) {
    conteudo = conteudo.replace(
      /^IG_ACCESS_TOKEN=.*$/m,
      `IG_ACCESS_TOKEN=${novoToken}`
    );
  } else {
    conteudo += `\nIG_ACCESS_TOKEN=${novoToken}\n`;
  }
  fs.writeFileSync(CAMINHO_ENV, conteudo, "utf8");

  registrar(`=== FIM === exit=0 | token renovado, validade ~${validadeDias} dias`);
  console.log(`\n[OK] Token renovado. Validade: ~${validadeDias} dias.`);
  console.log("     O arquivo .env foi atualizado automaticamente.\n");
}

main().catch((e) => {
  console.error("\n[ERRO inesperado]", e);
  process.exit(1);
});
