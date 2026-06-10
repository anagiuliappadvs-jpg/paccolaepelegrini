// ==========================================================================
// COLETOR DE DADOS DO INSTAGRAM  (Fase 1)
//
// O que ele faz, em ordem:
//   1. Le o token e o ID da conta (do .env ou dos Secrets do GitHub)
//   2. Busca metricas da conta (seguidores, alcance, visitas, cliques)
//   3. Busca a demografia da audiencia (idade, genero, cidade)
//   4. Lista as midias (posts) e as metricas de cada uma
//   5. Processa tudo (taxa de engajamento, por formato, melhores horarios,
//      top e piores posts, funil) e grava em data/snapshot.json
//
// IMPORTANTE: o snapshot.json NAO contem o token nem nenhum segredo.
// Ele e o unico arquivo que o site publico vai ler.
//
// Robustez: cada bloco de busca tem seu proprio tratamento de erro. Se uma
// metrica especifica nao existir na versao atual da API, o coletor avisa e
// segue em frente, sem perder o resto dos dados.
// ==========================================================================

import fs from "node:fs";
import path from "node:path";
import { carregarEnv, exigir, RAIZ_PROJETO } from "./lib/env.js";
import { graphGet, graphGetTudo, dormir, versaoApi } from "./lib/graph.js";

carregarEnv();

const TOKEN = exigir("IG_ACCESS_TOKEN");
const IG_USER_ID = exigir("IG_USER_ID");
const CAMINHO_SNAPSHOT = path.join(RAIZ_PROJETO, "data", "snapshot.json");

// Quantos posts RECENTES analisar a fundo (com metricas/insights).
// Limite ~200 chamadas/hora da API => nao vale puxar insights de centenas
// de posts antigos. 60 cobre bem a atividade recente e roda rapido.
const MAX_POSTS = Number(process.env.IG_MAX_POSTS || 60);

// logs.txt na raiz do projeto. O "Dashboard de Automacoes" da usuaria le este
// arquivo: carimbo [AAAA-MM-DD HH:MM:SS] e a palavra "ALERTA"/"erro" deixa o
// card vermelho. E assim que o token perto de expirar avisa sozinho.
const CAMINHO_LOG = path.join(RAIZ_PROJETO, "logs.txt");
function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function registrar(msg) {
  try {
    fs.appendFileSync(CAMINHO_LOG, `[${carimbo()}] ${msg}\n`, "utf8");
  } catch {}
}

// Quantos dias faltam para o token expirar (null se nao der pra checar).
async function diasDoToken() {
  const sec = process.env.IG_APP_SECRET;
  const appId = process.env.IG_APP_ID;
  if (!sec || !appId) return null;
  const r = await graphGet("debug_token", { input_token: TOKEN }, `${appId}|${sec}`);
  const exp = r.ok ? r.data?.data?.expires_at : null;
  if (!exp) return null; // 0 = nunca expira
  return Math.round((exp * 1000 - Date.now()) / 86400000);
}

// data de hoje no formato AAAA-MM-DD (fuso de Brasilia)
function hojeISO() {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return brasilia.toISOString().slice(0, 10);
}

function log(msg) {
  console.log(`  ${msg}`);
}

// --------------------------------------------------------------------------
// 1. DADOS BASICOS DA CONTA (nome, foto, total de seguidores, etc.)
// --------------------------------------------------------------------------
async function buscarConta() {
  const r = await graphGet(
    IG_USER_ID,
    {
      fields:
        "username,name,profile_picture_url,followers_count,follows_count,media_count,biography",
    },
    TOKEN
  );
  if (!r.ok) {
    registrar(`ERRO ao ler a conta: ${r.erro} (token expirado?) | exit=1`);
    console.error(`[ERRO] Nao consegui ler os dados da conta: ${r.erro}`);
    console.error(
      "Verifique se o TOKEN e o IG_USER_ID estao corretos e se o token nao expirou."
    );
    process.exit(1);
  }
  log(`Conta: @${r.data.username} - ${r.data.followers_count} seguidores`);
  return r.data;
}

// --------------------------------------------------------------------------
// 2. METRICAS DIARIAS DA CONTA (alcance, visitas ao perfil, cliques no link)
//    Cada metrica e pedida com tolerancia a falha, pois os nomes mudam
//    entre versoes da API.
// --------------------------------------------------------------------------
async function buscarInsightsConta() {
  const resultado = {};

  // metricas no formato "valor por dia"
  const porDia = ["reach"];
  // metricas no formato "valor total no periodo"
  const totais = ["profile_views", "website_clicks", "accounts_engaged"];

  for (const metric of porDia) {
    const r = await graphGet(
      `${IG_USER_ID}/insights`,
      { metric, period: "day" },
      TOKEN
    );
    if (r.ok && r.data.data?.[0]) {
      const valores = r.data.data[0].values || [];
      resultado[metric] = valores.at(-1)?.value ?? null;
    } else {
      log(`(aviso) metrica "${metric}" indisponivel: ${r.erro || "sem dados"}`);
    }
    await dormir(300);
  }

  for (const metric of totais) {
    const r = await graphGet(
      `${IG_USER_ID}/insights`,
      { metric, period: "day", metric_type: "total_value" },
      TOKEN
    );
    if (r.ok && r.data.data?.[0]) {
      resultado[metric] =
        r.data.data[0].total_value?.value ??
        r.data.data[0].values?.at(-1)?.value ??
        null;
    } else {
      log(`(aviso) metrica "${metric}" indisponivel: ${r.erro || "sem dados"}`);
    }
    await dormir(300);
  }

  return resultado;
}

// --------------------------------------------------------------------------
// 3. DEMOGRAFIA DA AUDIENCIA (exige 100+ seguidores na conta)
//    Na v22 isso vem de "follower_demographics" com um "breakdown".
// --------------------------------------------------------------------------
async function buscarDemografia() {
  const demografia = {};
  const recortes = ["age", "gender", "city", "country"];

  for (const breakdown of recortes) {
    const r = await graphGet(
      `${IG_USER_ID}/insights`,
      {
        metric: "follower_demographics",
        period: "lifetime",
        metric_type: "total_value",
        breakdown,
      },
      TOKEN
    );
    if (r.ok && r.data.data?.[0]?.total_value?.breakdowns?.[0]) {
      const resultados = r.data.data[0].total_value.breakdowns[0].results || [];
      demografia[breakdown] = resultados.map((x) => ({
        chave: x.dimension_values?.[0] ?? "?",
        valor: x.value ?? 0,
      }));
    } else {
      log(
        `(aviso) demografia "${breakdown}" indisponivel ` +
          `(precisa de 100+ seguidores): ${r.erro || "sem dados"}`
      );
    }
    await dormir(300);
  }

  return demografia;
}

// --------------------------------------------------------------------------
// 4. MIDIAS (POSTS) + METRICAS DE CADA UMA
// --------------------------------------------------------------------------
async function buscarPosts() {
  const paginasNecessarias = Math.ceil(MAX_POSTS / 50) + 1;
  const r = await graphGetTudo(
    `${IG_USER_ID}/media`,
    {
      fields:
        "id,caption,media_type,media_product_type,permalink,timestamp," +
        "like_count,comments_count,thumbnail_url,media_url",
      limit: 50,
    },
    TOKEN,
    paginasNecessarias
  );
  if (!r.ok) {
    log(`(aviso) nao consegui listar as midias: ${r.erro}`);
    return [];
  }

  // posts vem do mais novo para o mais antigo; pega so os recentes
  const todas = r.data.data || [];
  const midias = todas.slice(0, MAX_POSTS);
  log(
    `Conta tem ${todas.length}+ posts; analisando os ${midias.length} mais ` +
      `recentes (ajustavel em IG_MAX_POSTS). Buscando metricas de cada um...`
  );

  const posts = [];
  for (const m of midias) {
    const metricas = await buscarInsightsDeUmaMidia(m);
    posts.push(processarPost(m, metricas));
    await dormir(350); // respeita o limite de chamadas
  }
  return posts;
}

// escolhe as metricas certas conforme o tipo de midia
function metricasPorTipo(midia) {
  const ehReelOuVideo =
    midia.media_type === "VIDEO" ||
    midia.media_product_type === "REELS";
  if (ehReelOuVideo) {
    return ["reach", "saved", "shares", "total_interactions", "views"];
  }
  return ["reach", "saved", "shares", "total_interactions"];
}

async function buscarInsightsDeUmaMidia(midia) {
  const metric = metricasPorTipo(midia).join(",");
  let r = await graphGet(`${midia.id}/insights`, { metric }, TOKEN);

  // se a versao da API rejeitar alguma metrica, tenta um conjunto minimo
  if (!r.ok) {
    r = await graphGet(`${midia.id}/insights`, { metric: "reach,saved" }, TOKEN);
  }
  if (!r.ok) return {};

  const out = {};
  for (const item of r.data.data || []) {
    out[item.name] =
      item.values?.[0]?.value ?? item.total_value?.value ?? null;
  }
  return out;
}

// transforma os dados crus num formato limpo e calcula o engajamento
function processarPost(m, ins) {
  const likes = m.like_count ?? 0;
  const comentarios = m.comments_count ?? 0;
  const salvos = ins.saved ?? 0;
  const compart = ins.shares ?? 0;
  const alcance = ins.reach ?? 0;
  const interacoes =
    ins.total_interactions ?? likes + comentarios + salvos + compart;

  // taxa de engajamento = interacoes / alcance (em %)
  const engajamento = alcance > 0 ? (interacoes / alcance) * 100 : 0;

  const formato = nomeFormato(m);
  const data = m.timestamp ? new Date(m.timestamp) : null;

  return {
    id: m.id,
    formato,
    legenda: (m.caption || "").slice(0, 280),
    permalink: m.permalink || null,
    miniatura: m.thumbnail_url || m.media_url || null,
    timestamp: m.timestamp || null,
    diaSemana: data ? data.getUTCDay() : null, // 0=domingo
    hora: data ? (data.getUTCHours() + 24 - 3) % 24 : null, // hora Brasilia
    likes,
    comentarios,
    salvos,
    compartilhamentos: compart,
    alcance,
    interacoes,
    visualizacoes: ins.views ?? null,
    engajamento: Number(engajamento.toFixed(2)),
  };
}

function nomeFormato(m) {
  if (m.media_product_type === "REELS" || m.media_type === "VIDEO")
    return "Reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "Carrossel";
  return "Foto";
}

// Melhores posts de TODOS OS TEMPOS, por interacoes (curtidas + comentarios).
// Leve: usa so a lista de midias (sem chamada de insights por post), entao
// cabe no limite da API mesmo com centenas de posts.
async function buscarTopTodosTempos(qtd = 10) {
  const r = await graphGetTudo(
    `${IG_USER_ID}/media`,
    {
      fields:
        "id,caption,media_type,media_product_type,permalink,timestamp," +
        "like_count,comments_count,thumbnail_url,media_url",
      limit: 50,
    },
    TOKEN,
    25 // ate ~1250 posts
  );
  if (!r.ok) return { total: 0, top: [] };

  const todas = r.data.data || [];
  const lista = todas.map((m) => {
    const likes = m.like_count ?? 0;
    const comentarios = m.comments_count ?? 0;
    return {
      id: m.id,
      formato: nomeFormato(m),
      legenda: (m.caption || "").slice(0, 200),
      permalink: m.permalink || null,
      miniatura: m.thumbnail_url || m.media_url || null,
      timestamp: m.timestamp || null,
      likes,
      comentarios,
      interacoes: likes + comentarios,
    };
  });
  lista.sort((a, b) => b.interacoes - a.interacoes);
  return { total: todas.length, top: lista.slice(0, qtd) };
}

// --------------------------------------------------------------------------
// 5. PROCESSAMENTO FINAL (agregacoes que o site vai mostrar)
// --------------------------------------------------------------------------
function agregarPorFormato(posts) {
  const grupos = {};
  for (const p of posts) {
    (grupos[p.formato] ??= []).push(p.engajamento);
  }
  return Object.entries(grupos).map(([formato, taxas]) => ({
    formato,
    posts: taxas.length,
    engajamentoMedio: Number(
      (taxas.reduce((a, b) => a + b, 0) / taxas.length).toFixed(2)
    ),
  }));
}

// mapa de calor: media de engajamento por (dia da semana x hora)
function mapaDeCalor(posts) {
  const soma = {};
  const cont = {};
  for (const p of posts) {
    if (p.diaSemana === null || p.hora === null) continue;
    const chave = `${p.diaSemana}-${p.hora}`;
    soma[chave] = (soma[chave] || 0) + p.engajamento;
    cont[chave] = (cont[chave] || 0) + 1;
  }
  const celulas = [];
  for (const chave of Object.keys(soma)) {
    const [dia, hora] = chave.split("-").map(Number);
    celulas.push({
      dia,
      hora,
      engajamentoMedio: Number((soma[chave] / cont[chave]).toFixed(2)),
      posts: cont[chave],
    });
  }
  return celulas;
}

function topEPiores(posts) {
  const ordenados = [...posts].sort((a, b) => b.engajamento - a.engajamento);
  return {
    melhores: ordenados.slice(0, 5),
    piores: ordenados.slice(-5).reverse(),
  };
}

// guarda o historico de seguidores SEM apagar os dias antigos
function atualizarHistorico(snapshotAntigo, conta) {
  const historico = Array.isArray(snapshotAntigo?.historico)
    ? snapshotAntigo.historico
    : [];
  const hoje = hojeISO();
  const semHoje = historico.filter((d) => d.data !== hoje);
  semHoje.push({ data: hoje, seguidores: conta.followers_count });
  // mantem ordenado por data
  semHoje.sort((a, b) => a.data.localeCompare(b.data));
  return semHoje;
}

function montarFunil(insConta, conta) {
  return {
    alcance: insConta.reach ?? null,
    interacoes: insConta.accounts_engaged ?? null,
    visitasPerfil: insConta.profile_views ?? null,
    cliquesLink: insConta.website_clicks ?? null,
    seguidores: conta.followers_count ?? null,
  };
}

// --------------------------------------------------------------------------
// EXECUCAO
// --------------------------------------------------------------------------
async function main() {
  console.log(`\n== Coletor Instagram (API ${versaoApi()}) ==\n`);
  registrar("Coletor iniciado");

  // le o snapshot antigo para preservar o historico
  let snapshotAntigo = {};
  if (fs.existsSync(CAMINHO_SNAPSHOT)) {
    try {
      snapshotAntigo = JSON.parse(fs.readFileSync(CAMINHO_SNAPSHOT, "utf8"));
    } catch {
      log("(aviso) snapshot anterior ilegivel, comecando do zero");
    }
  }

  const conta = await buscarConta();
  const insConta = await buscarInsightsConta();
  const demografia = await buscarDemografia();
  const posts = await buscarPosts();
  const topTudo = await buscarTopTodosTempos(10);
  log(`Top de todos os tempos calculado entre ${topTudo.total} posts.`);

  const { melhores, piores } = topEPiores(posts);

  const snapshot = {
    atualizadoEm: new Date().toISOString(),
    conta: {
      username: conta.username,
      nome: conta.name || null,
      foto: conta.profile_picture_url || null,
      bio: conta.biography || null,
      seguidores: conta.followers_count ?? null,
      seguindo: conta.follows_count ?? null,
      totalPosts: conta.media_count ?? null,
    },
    visaoGeral: {
      alcancePeriodo: insConta.reach ?? null,
      visitasPerfil: insConta.profile_views ?? null,
      cliquesLink: insConta.website_clicks ?? null,
      postsNoPeriodo: posts.length,
      engajamentoMedio: posts.length
        ? Number(
            (
              posts.reduce((a, p) => a + p.engajamento, 0) / posts.length
            ).toFixed(2)
          )
        : 0,
    },
    historico: atualizarHistorico(snapshotAntigo, conta),
    posts,
    porFormato: agregarPorFormato(posts),
    mapaDeCalor: mapaDeCalor(posts),
    topPosts: melhores,
    piorPosts: piores,
    topTodosTempos: topTudo.top,
    totalPostsTudo: topTudo.total,
    demografia,
    funil: montarFunil(insConta, conta),
  };

  fs.mkdirSync(path.dirname(CAMINHO_SNAPSHOT), { recursive: true });
  fs.writeFileSync(CAMINHO_SNAPSHOT, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`\n[OK] snapshot.json gravado com ${posts.length} posts.`);
  console.log(`     ${CAMINHO_SNAPSHOT}\n`);

  // checa validade do token e registra (avisa se estiver perto de expirar)
  const dias = await diasDoToken();
  if (dias != null && dias < 10) {
    registrar(`ALERTA: token do Instagram expira em ${dias} dias - rode "npm run renovar-token"`);
  }
  const txtToken = dias == null ? "validade nao verificada" : `token expira em ${dias} dias`;
  registrar(
    `=== FIM === exit=0 | seguidores=${conta.followers_count} | posts=${posts.length} | ${txtToken}`
  );
}

main().catch((e) => {
  registrar(`ERRO inesperado: ${e.message} | exit=1`);
  console.error("\n[ERRO inesperado]", e);
  process.exit(1);
});
