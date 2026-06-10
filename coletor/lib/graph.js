// Funcoes para conversar com a Instagram Graph API com seguranca:
// - monta a URL com a versao certa
// - trata erros sem derrubar o coletor inteiro
// - respeita o limite de chamadas (pequena pausa entre requisicoes)
// - segue a paginacao quando a resposta vem em pedacos

const BASE = "https://graph.facebook.com";

export function versaoApi() {
  return process.env.IG_API_VERSION || "v22.0";
}

// pequena pausa para nao estourar o limite (~200 chamadas/hora)
export function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Faz um GET na Graph API. Retorna { ok, data, erro }.
// Nunca lanca excecao: quem chama decide o que fazer com o erro.
export async function graphGet(caminho, params, token) {
  const url = new URL(`${BASE}/${versaoApi()}/${caminho}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  url.searchParams.set("access_token", token);

  try {
    const resp = await fetch(url);
    const json = await resp.json();

    if (!resp.ok || json.error) {
      const msg = json.error?.message || `HTTP ${resp.status}`;
      return { ok: false, erro: msg, raw: json };
    }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// Igual ao graphGet, mas segue a paginacao e junta tudo no campo "data".
// Util para listar todas as midias (posts) da conta.
export async function graphGetTudo(caminho, params, token, limitePaginas = 20) {
  let itens = [];
  let r = await graphGet(caminho, params, token);
  if (!r.ok) return r;

  itens = itens.concat(r.data.data || []);
  let proxima = r.data.paging?.next;
  let paginas = 1;

  while (proxima && paginas < limitePaginas) {
    await dormir(400); // respeita o limite de chamadas
    try {
      const resp = await fetch(proxima);
      const json = await resp.json();
      if (json.error) break;
      itens = itens.concat(json.data || []);
      proxima = json.paging?.next;
      paginas++;
    } catch {
      break;
    }
  }

  return { ok: true, data: { data: itens } };
}
