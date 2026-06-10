// ==========================================================================
// Dashboard publico (somente leitura). Le data/snapshot.json e
// data/planejamento.json e desenha tudo. NAO contem nenhum segredo.
// ==========================================================================

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const COR_NAVY = "#1a2b4a";
const COR_GOLD = "#c9a227";
const PALETA = ["#1a2b4a", "#c9a227", "#3a7ca5", "#9b59b6", "#2e7d52", "#b5532a", "#5d6d7e"];

const nf = new Intl.NumberFormat("pt-BR");
const pct = (n) => (n ?? 0).toFixed(2).replace(".", ",") + "%";
const $ = (id) => document.getElementById(id);

function dataBR(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
function quando(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function carregar(caminho) {
  try {
    const r = await fetch(caminho + "?t=" + Date.now());
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

let SNAP = null;

(async function init() {
  const [snap, plano] = await Promise.all([
    carregar("./data/snapshot.json"),
    carregar("./data/planejamento.json"),
  ]);

  if (!snap || !snap.conta) {
    $("carregando").textContent =
      "Ainda não há dados. Rode o coletor (npm run coletar) para gerar o snapshot.";
    return;
  }
  SNAP = snap;

  cabecalho(snap);
  cards(snap);
  graficoCrescimento(snap);
  graficoFormato(snap);
  funil(snap);
  graficoGenero(snap);
  graficoIdade(snap);
  graficoCidade(snap);
  heatmap(snap);
  sugestoes(snap);
  tabela(snap);
  topEPiores(snap);
  topTodosTempos(snap);
  if (plano) planejamento(plano);

  $("carregando").hidden = true;
  $("app").hidden = false;
})();

function cabecalho(s) {
  const c = s.conta;
  if (c.foto) { $("foto").src = c.foto; } else { $("foto").style.display = "none"; }
  $("foto").onerror = () => ($("foto").style.visibility = "hidden");
  $("nome").textContent = c.nome || c.username;
  $("handle").textContent = "@" + c.username;
  $("handle").href = "https://instagram.com/" + c.username;
  $("bio").textContent = c.bio || "";
  $("atualizado").textContent = "Atualizado em " + quando(s.atualizadoEm);
}

function cards(s) {
  const v = s.visaoGeral || {};
  const lista = [
    { rotulo: "Seguidores", valor: nf.format(s.conta.seguidores || 0), tend: crescimentoSeguidores(s) },
    { rotulo: "Alcance (período)", valor: nf.format(v.alcancePeriodo || 0) },
    { rotulo: "Engajamento médio", valor: pct(v.engajamentoMedio) },
    { rotulo: "Posts analisados", valor: nf.format(v.postsNoPeriodo || 0) },
  ];
  $("cards").innerHTML = lista.map((x) => `
    <div class="card">
      <div class="rotulo">${x.rotulo}</div>
      <div class="valor">${x.valor}</div>
      ${x.tend || ""}
    </div>`).join("");
}

function crescimentoSeguidores(s) {
  const h = s.historico || [];
  if (h.length < 2) return `<div class="tend" style="color:#6b7686">histórico começa hoje</div>`;
  const dif = h.at(-1).seguidores - h.at(-2).seguidores;
  const cls = dif >= 0 ? "up" : "down";
  const seta = dif >= 0 ? "▲" : "▼";
  return `<div class="tend ${cls}">${seta} ${nf.format(Math.abs(dif))} vs. anterior</div>`;
}

function graficoCrescimento(s) {
  const h = s.historico || [];
  const labels = h.map((d) => dataBR(d.data));
  const dados = h.map((d) => d.seguidores);
  if (h.length < 2) {
    $("notaCrescimento").textContent =
      "O gráfico ganha forma conforme o coletor roda nos próximos dias (1 ponto por dia).";
  }
  new Chart($("grafCrescimento"), {
    type: "line",
    data: { labels, datasets: [{ data: dados, borderColor: COR_NAVY, backgroundColor: "rgba(26,43,74,.08)", fill: true, tension: .3, pointBackgroundColor: COR_GOLD, pointRadius: 4 }] },
    options: baseOpts({ y: { beginAtZero: false } }),
  });
}

function graficoFormato(s) {
  const f = s.porFormato || [];
  new Chart($("grafFormato"), {
    type: "bar",
    data: { labels: f.map((x) => x.formato), datasets: [{ data: f.map((x) => x.engajamentoMedio), backgroundColor: f.map((_, i) => PALETA[i % PALETA.length]), borderRadius: 6 }] },
    options: baseOpts({ y: { ticks: { callback: (v) => v + "%" } } }, (ctx) => `${ctx.parsed.y}% · ${f[ctx.dataIndex].posts} posts`),
  });
}

function funil(s) {
  const f = s.funil || {};
  const etapas = [
    { rotulo: "Alcance", v: f.alcance },
    { rotulo: "Interações", v: f.interacoes },
    { rotulo: "Visitas ao perfil", v: f.visitasPerfil },
    { rotulo: "Cliques no link", v: f.cliquesLink },
    { rotulo: "Seguidores (total)", v: f.seguidores },
  ].filter((e) => e.v != null);
  const max = Math.max(...etapas.map((e) => e.v), 1);
  $("funil").innerHTML = etapas.map((e) => {
    const larg = Math.max(38, Math.round((e.v / max) * 100));
    return `<div class="etapa"><div class="barra" style="width:${larg}%"><span>${e.rotulo}</span><span class="valor-funil">${nf.format(e.v)}</span></div></div>`;
  }).join("");
}

function demoOrdenadaIdade(arr) {
  const ordem = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  return [...(arr || [])].sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
}

function graficoGenero(s) {
  const g = s.demografia?.gender || [];
  if (!g.length) return vazioCanvas("grafGenero");
  const mapa = { M: "Masculino", F: "Feminino", U: "Não informado" };
  new Chart($("grafGenero"), {
    type: "doughnut",
    data: { labels: g.map((x) => mapa[x.chave] || x.chave), datasets: [{ data: g.map((x) => x.valor), backgroundColor: PALETA }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });
}

function graficoIdade(s) {
  const a = demoOrdenadaIdade(s.demografia?.age);
  if (!a.length) return vazioCanvas("grafIdade");
  new Chart($("grafIdade"), {
    type: "bar",
    data: { labels: a.map((x) => x.chave), datasets: [{ data: a.map((x) => x.valor), backgroundColor: COR_NAVY, borderRadius: 6 }] },
    options: baseOpts(),
  });
}

function graficoCidade(s) {
  const c = [...(s.demografia?.city || [])].sort((a, b) => b.valor - a.valor).slice(0, 8);
  if (!c.length) return vazioCanvas("grafCidade");
  new Chart($("grafCidade"), {
    type: "bar",
    data: { labels: c.map((x) => x.chave), datasets: [{ data: c.map((x) => x.valor), backgroundColor: COR_GOLD, borderRadius: 6 }] },
    options: { ...baseOpts(), indexAxis: "y" },
  });
}

function vazioCanvas(id) {
  const cv = $(id);
  const ctx = cv.getContext("2d");
  ctx.font = "13px Segoe UI"; ctx.fillStyle = "#aeb6c2";
  ctx.fillText("Sem dados suficientes (precisa de 100+ seguidores).", 10, 30);
}

function heatmap(s) {
  const cels = s.mapaDeCalor || [];
  const max = Math.max(...cels.map((c) => c.engajamentoMedio), 0.01);
  const idx = {};
  cels.forEach((c) => (idx[`${c.dia}-${c.hora}`] = c));
  let html = `<div class="cab"></div>`;
  for (let h = 0; h < 24; h++) html += `<div class="cab">${h % 3 === 0 ? h + "h" : ""}</div>`;
  for (let d = 0; d < 7; d++) {
    html += `<div class="dia">${DIAS[d]}</div>`;
    for (let h = 0; h < 24; h++) {
      const c = idx[`${d}-${h}`];
      if (c) {
        const t = c.engajamentoMedio / max;
        const cor = mistura(t);
        html += `<div class="cel" style="background:${cor}" title="${DIAS[d]} ${h}h · ${pct(c.engajamentoMedio)} · ${c.posts} post(s)"></div>`;
      } else {
        html += `<div class="cel"></div>`;
      }
    }
  }
  $("heatmap").innerHTML = html;
}
function mistura(t) {
  // de cinza claro (#eef1f5) ate navy (#1a2b4a)
  const a = [238, 241, 245], b = [26, 43, 74];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function sugestoes(s) {
  const out = [];
  const f = [...(s.porFormato || [])].sort((a, b) => b.engajamentoMedio - a.engajamentoMedio)[0];
  if (f) out.push(`O formato que mais engaja é <b>${f.formato}</b> (${pct(f.engajamentoMedio)} em média). Vale priorizá-lo nas pautas informativas.`);
  const melhor = [...(s.mapaDeCalor || [])].sort((a, b) => b.engajamentoMedio - a.engajamentoMedio)[0];
  if (melhor) out.push(`Seu público engaja mais às <b>${DIAS[melhor.dia]}, por volta das ${melhor.hora}h</b>. Bom horário para publicar conteúdo educativo.`);
  // temas (hashtags) dos melhores posts
  const tags = {};
  (s.topPosts || []).forEach((p) => (p.legenda.match(/#\w+/g) || []).forEach((t) => (tags[t.toLowerCase()] = (tags[t.toLowerCase()] || 0) + 1)));
  const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]);
  if (topTags.length) out.push(`Temas recorrentes nos seus melhores posts: <b>${topTags.join(", ")}</b>. Explore variações em "você sabia que…" e "mitos x verdades".`);
  out.push(`Mantenha a frequência: a regularidade ajuda o alcance tanto quanto o conteúdo.`);

  $("sugestoes").innerHTML = out.map((t) =>
    `<li><span class="selo">✓ Sugestão informativa</span><br>${t}</li>`).join("");
}

// ---- Tabela ----
let ordenarPor = "timestamp", ordemAsc = false, filtro = "";
function tabela(s) {
  document.querySelectorAll("th[data-ordenar]").forEach((th) => {
    th.onclick = () => {
      const col = th.dataset.ordenar;
      if (ordenarPor === col) ordemAsc = !ordemAsc;
      else { ordenarPor = col; ordemAsc = false; }
      desenharTabela(s);
    };
  });
  $("filtroFormato").onchange = (e) => { filtro = e.target.value; desenharTabela(s); };
  desenharTabela(s);
}
function desenharTabela(s) {
  let posts = [...(s.posts || [])];
  if (filtro) posts = posts.filter((p) => p.formato === filtro);
  posts.sort((a, b) => {
    let x = a[ordenarPor], y = b[ordenarPor];
    if (ordenarPor === "timestamp") { x = new Date(a.timestamp).getTime(); y = new Date(b.timestamp).getTime(); }
    if (typeof x === "string") return ordemAsc ? x.localeCompare(y) : y.localeCompare(x);
    return ordemAsc ? x - y : y - x;
  });
  $("corpoTabela").innerHTML = posts.map((p) => `
    <tr>
      <td>
        ${img(p.miniatura, "mini")}
        <span class="legenda-mini">${escapar(p.legenda) || "(sem legenda)"}</span>
      </td>
      <td>${dataBR(p.timestamp)}</td>
      <td><span class="tag ${p.formato}">${p.formato}</span></td>
      <td class="num">${nf.format(p.likes)}</td>
      <td class="num">${nf.format(p.comentarios)}</td>
      <td class="num">${nf.format(p.salvos)}</td>
      <td class="num">${nf.format(p.alcance)}</td>
      <td class="num eng-forte">${pct(p.engajamento)}</td>
    </tr>`).join("");
}

function topEPiores(s) {
  $("melhores").innerHTML = (s.topPosts || []).map(linhaPost).join("");
  $("piores").innerHTML = (s.piorPosts || []).map(linhaPost).join("");
}
function linhaPost(p) {
  return `<a class="post-linha" href="${p.permalink || "#"}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
    ${img(p.miniatura, "")}
    <div class="info">
      <div class="l">${escapar(p.legenda) || "(sem legenda)"}</div>
      <div style="color:#6b7686">${p.formato} · ${dataBR(p.timestamp)} · ${nf.format(p.alcance)} alcance</div>
    </div>
    <div class="eng">${pct(p.engajamento)}</div>
  </a>`;
}

function topTodosTempos(s) {
  const arr = s.topTodosTempos || [];
  $("totalTudo").textContent = s.totalPostsTudo != null ? nf.format(s.totalPostsTudo) : arr.length;
  $("topTudo").innerHTML = arr
    .map(
      (p, i) => `<a class="post-linha" href="${p.permalink || "#"}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <span class="rank">${i + 1}º</span>
      ${img(p.miniatura, "")}
      <div class="info">
        <div class="l">${escapar(p.legenda) || "(sem legenda)"}</div>
        <div style="color:#6b7686">${p.formato} · ${dataBR(p.timestamp)} · ❤ ${nf.format(p.likes)} · 💬 ${nf.format(p.comentarios)}</div>
      </div>
      <div class="eng">${nf.format(p.interacoes)}<div style="font-size:.6rem;color:#6b7686;font-weight:400">interações</div></div>
    </a>`
    )
    .join("");
}

function planejamento(plano) {
  const meta = plano.metaDoMes;
  if (meta) $("metaBadge").textContent = `Meta do mês: ${meta.atual}/${meta.meta} · ${meta.descricao}`;
  const cols = plano.colunas || {};
  $("kanban").innerHTML = Object.entries(cols).map(([nome, cartoes]) => `
    <div class="coluna">
      <h3>${nome} (${cartoes.length})</h3>
      ${cartoes.length ? cartoes.map((c) => `<div class="cartao">${escapar(c.legenda || c.titulo || "")}<br><span class="selo-oab" style="color:${c.conformeOAB === false ? "#b5532a" : "#2e7d52"}">${c.conformeOAB === false ? "⚠ Revisar" : "✓ Conforme OAB"}</span></div>`).join("") : `<div class="vazio">Sem cartões ainda</div>`}
    </div>`).join("");

  const oab = plano.pilaresOAB || {};
  $("oabPermitidos").innerHTML = (oab.permitidos || []).map((x) => `<li>${escapar(x)}</li>`).join("");
  $("oabVedados").innerHTML = (oab.vedados || []).map((x) => `<li>${escapar(x)}</li>`).join("");
}

// ---- utilitarios ----
function img(url, cls) {
  if (!url) return `<span class="${cls}" style="display:inline-block;width:42px;height:42px;border-radius:8px;background:#e7eaef"></span>`;
  return `<img class="${cls}" src="${url}" loading="lazy" onerror="this.style.visibility='hidden'">`;
}
function escapar(t) {
  return (t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function baseOpts(scales = {}, tooltipLabel) {
  return {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: tooltipLabel ? { callbacks: { label: tooltipLabel } } : {} },
    scales: { x: { grid: { display: false } }, y: { grid: { color: "#eef1f5" }, ...scales.y }, ...scales },
  };
}
