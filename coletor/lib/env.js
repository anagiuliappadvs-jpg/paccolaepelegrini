// Carrega as variaveis do arquivo .env SEM precisar instalar nada.
// No GitHub Actions as variaveis ja vem prontas no ambiente, entao
// este carregador so age quando existe um arquivo .env local.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizProjeto = path.resolve(__dirname, "..", "..");

export function carregarEnv() {
  const caminhoEnv = path.join(raizProjeto, ".env");
  if (!fs.existsSync(caminhoEnv)) return;

  const conteudo = fs.readFileSync(caminhoEnv, "utf8");
  for (const linha of conteudo.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;

    const igual = limpa.indexOf("=");
    if (igual === -1) continue;

    const chave = limpa.slice(0, igual).trim();
    let valor = limpa.slice(igual + 1).trim();
    // remove aspas se a pessoa colou com aspas por engano
    valor = valor.replace(/^["']|["']$/g, "");

    // nao sobrescreve o que ja veio do ambiente (ex.: GitHub Actions)
    if (process.env[chave] === undefined) {
      process.env[chave] = valor;
    }
  }
}

// Le uma variavel obrigatoria e da uma mensagem clara se faltar.
export function exigir(chave) {
  const valor = process.env[chave];
  if (!valor || valor.startsWith("cole_aqui")) {
    console.error(
      `\n[ERRO] Falta configurar "${chave}".\n` +
        `Abra o arquivo .env e preencha esse valor.\n`
    );
    process.exit(1);
  }
  return valor;
}

export const RAIZ_PROJETO = raizProjeto;
