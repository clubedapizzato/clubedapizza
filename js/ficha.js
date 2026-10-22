/* =========================================================
   FICHA TÉCNICA (custo das pizzas e adicionais) — só Gestão/cozinha/balcão (logado)
   - insumos/{id}: { nome, categoria, unidade, precoCompra, qtdEmbalagem, perda %, fornecedor, atualizadoEm, ativo, historico }
   - fichas/{saborId|adicionalId}: { P: [{ insumoId, qtd }], M: [...], G: [...] }
   - fichas/_base: { P, M, G (base comum de toda pizza: massa, caixa, gás...), cmvAlvo }
   - estoque do insumo (opcional): controlaEstoque, estoqueAtual, estoqueMinimo, estoqueIdeal (na unidade do insumo)
   Custos são privados (coleções só para logado). Baixa de insumos por pedido: DB.baixarInsumos.
   ========================================================= */
window.Ficha = (function () {
  const UNIDADES = ['kg', 'g', 'L', 'ml', 'un'];
  const CATEGORIAS = ['Queijos', 'Carnes', 'Vegetais', 'Molhos', 'Massa', 'Embalagens', 'Gás/Energia', 'Outros'];
  const TAMANHOS = ['P', 'M', 'G'];
  let insumos = {}, fichas = {}, iniciado = false, erroLeitura = null, carregado = false;
  const r2 = v => Math.round(v * 100) / 100;

  // R$ por unidade do insumo (R$/kg, R$/L, R$/un), já com a perda: custo ÷ (1 − perda)
  function custoUnit(ins) {
    if (!ins || !(Number(ins.qtdEmbalagem) > 0)) return 0;
    const perda = Math.min(Math.max(Number(ins.perda) || 0, 0), 95);
    return (Number(ins.precoCompra) || 0) / Number(ins.qtdEmbalagem) / (1 - perda / 100);
  }
  const custoLinha = l => custoUnit(insumos[l.insumoId]) * (Number(l.qtd) || 0);
  const custoLinhas = linhas => (linhas || []).reduce((s, l) => s + custoLinha(l), 0);
  const base = () => fichas._base || {};
  const custoBase = tam => custoLinhas(base()[tam]);
  const cmvAlvo = () => Number(base().cmvAlvo) || 33;
  const temFicha = (id, tam) => !!(fichas[id] && (fichas[id][tam] || []).length);
  // Custo da ficha (sem base) ou null se não tem ficha nesse tamanho
  const custoFicha = (id, tam) => temFicha(id, tam) ? custoLinhas(fichas[id][tam]) : null;
  // Pizza inteira de um sabor: ficha + base comum
  const custoSabor = (id, tam) => { const c = custoFicha(id, tam); return c == null ? null : c + custoBase(tam); };
  const idSabor = nome => { const s = Preco.sabor(nome); return (s && s.id) || 'pizza-' + Catalogo.slug(nome); };

  /* Custo de um item de pizza do pedido (ou null se falta ficha de algum sabor):
     meio a meio pela mesma regra do preço (média, ou o sabor mais caro se CONFIG.meioAMeio = 'maior')
     + base comum + adicionais que tiverem ficha. */
  function custoItem(it) {
    if (!it || it.tipo !== 'pizza') return null;
    const cs = (it.sabores || []).map(n => custoFicha(idSabor(n), it.tamanho));
    if (!cs.length || cs.some(c => c == null)) return null;
    let c;
    if (CONFIG.meioAMeio === 'maior') {
      const precos = it.sabores.map(n => (Preco.sabor(n) || {})[it.tamanho] || 0);
      c = cs[precos.indexOf(Math.max(...precos))];
    } else c = cs.reduce((a, b) => a + b, 0) / cs.length;
    c += custoBase(it.tamanho);
    (it.adicionais || []).forEach(a => { c += custoFicha(a.id, it.tamanho) || 0; });
    return r2(c);
  }

  // Quantidade digitada → unidade do insumo ("280g" num insumo em kg = 0,28; "0,5" = 0,5)
  function lerQtd(txt, unidade) {
    const m = String(txt || '').trim().toLowerCase().replace(',', '.').match(/^([0-9]*\.?[0-9]+)\s*(kg|g|l|ml|un)?$/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    const u = m[2], un = String(unidade || '').toLowerCase();
    if (u && u !== un) {
      if (u === 'g' && un === 'kg') v /= 1000; else if (u === 'kg' && un === 'g') v *= 1000;
      else if (u === 'ml' && un === 'l') v /= 1000; else if (u === 'l' && un === 'ml') v *= 1000;
      else return null;
    }
    return Math.round(v * 100000) / 100000;
  }
  // Converte entre unidades compatíveis (g↔kg, ml↔L); null se não dá
  function converter(v, de, para) {
    const a = String(de || '').toLowerCase(), b = String(para || '').toLowerCase();
    if (!a || !b || a === b) return v;
    const f = { 'g>kg': 1 / 1000, 'kg>g': 1000, 'ml>l': 1 / 1000, 'l>ml': 1000 }[a + '>' + b];
    return f ? v * f : null;
  }
  const r5 = v => Math.round(v * 100000) / 100000;

  /* ---------- estoque de insumos ---------- */
  // Custo médio de compra por unidade (sem a perda) — vale para estoque, compras e baixas
  const custoMedio = ins => ins && Number(ins.qtdEmbalagem) > 0 ? (Number(ins.precoCompra) || 0) / Number(ins.qtdEmbalagem) : 0;
  // 'off' (não controla) | 'neg' | 'baixo' (no mínimo ou abaixo) | 'perto' (até 1,5 × mínimo) | 'ok'
  function estado(ins) {
    if (!ins || !ins.controlaEstoque) return 'off';
    const a = Number(ins.estoqueAtual) || 0, m = Number(ins.estoqueMinimo) || 0;
    return a < 0 ? 'neg' : a <= m && m > 0 ? 'baixo' : a <= m * 1.5 && m > 0 ? 'perto' : a <= 0 ? 'baixo' : 'ok';
  }
  // Insumos ativos que controlam estoque e estão no mínimo ou abaixo (inclui negativos)
  const acabando = () => Object.values(insumos).filter(i => i.ativo !== false && ['neg', 'baixo'].includes(estado(i)));

  /* Quanto comprar: ideal − atual (ideal vazio = 2 × mínimo), arredondado para embalagens inteiras.
     { qtd (na unidade), embalagens, custo (estimado pelo custo médio) } ou null se não precisa */
  function sugestaoCompra(ins) {
    const a = Number(ins.estoqueAtual) || 0, ideal = Number(ins.estoqueIdeal) || (Number(ins.estoqueMinimo) || 0) * 2;
    const falta = ideal - a, emb = Number(ins.qtdEmbalagem) || 1;
    if (!(falta > 0)) return null;
    const embalagens = Math.ceil(falta / emb - 1e-9);
    return { qtd: r5(embalagens * emb), embalagens, custo: Math.round(embalagens * emb * custoMedio(ins) * 100) / 100 };
  }

  /* Consumo de insumos de um pedido pelas fichas (meio a meio = fração de cada sabor; + base comum + adicionais).
     fs/is: mapas de fichas e insumos (padrão: os carregados). Quantidade BRUTA na unidade do insumo:
     qtd da ficha ÷ (1 − perda), a mesma conta do custo. Retorna { qtd: { insumoId: n }, semFicha: ['CALABRESA (G)'] } */
  function consumoPedido(pedido, fs = fichas, is = insumos) {
    const qtd = {}, semFicha = [];
    const soma = (linhas, fator) => (linhas || []).forEach(l => {
      const ins = is[l.insumoId];
      let q = (Number(l.qtd) || 0) * fator;
      if (ins && l.un) { const c = converter(q, l.un, ins.unidade); if (c != null) q = c; }
      const perda = ins ? Math.min(Math.max(Number(ins.perda) || 0, 0), 95) : 0;
      qtd[l.insumoId] = (qtd[l.insumoId] || 0) + q / (1 - perda / 100);
    });
    const tem = (id, tam) => !!(fs[id] && (fs[id][tam] || []).length);
    (pedido.itens || []).forEach(it => {
      if (it.tipo !== 'pizza') return;
      const q = it.qtd || 1, tam = it.tamanho, sab = it.sabores || [];
      sab.forEach(n => {
        const id = idSabor(n);
        if (tem(id, tam)) soma(fs[id][tam], q / sab.length);
        else semFicha.push(`${n} (${tam})`);
      });
      if (fs._base) soma(fs._base[tam], q);
      (it.adicionais || []).forEach(a => {
        if (tem(a.id, tam)) soma(fs[a.id][tam], q);
        else semFicha.push(`+ ${a.nome || a.id} (${tam})`);
      });
    });
    Object.keys(qtd).forEach(k => { qtd[k] = r5(qtd[k]); });
    return { qtd, semFicha: [...new Set(semFicha)] };
  }
  // ids de fichas que um pedido pode usar (para ler dentro da transação)
  const fichasDoPedido = pedido => [...new Set(['_base'].concat(...(pedido.itens || []).filter(it => it.tipo === 'pizza')
    .map(it => (it.sabores || []).map(idSabor).concat((it.adicionais || []).map(a => a.id)))))];

  // Fichas (e a base) que usam o insumo
  const fichasDoInsumo = id => Object.values(fichas).filter(f => TAMANHOS.some(t => (f[t] || []).some(l => l.insumoId === id)));
  const usoInsumo = id => fichasDoInsumo(id).length;

  /* Resultado de venda: CMV %, taxa da maquininha, lucro e preço sugerido pelo CMV alvo */
  function resultado(venda, custo) {
    const taxa = (Number((CARDAPIO.loja || {}).taxaMaquininha) || 0) / 100 * venda;
    const lucro = venda - custo - taxa;
    return { venda, custo, cmv: venda > 0 ? custo / venda * 100 : null, taxa, lucro, margem: venda > 0 ? lucro / venda * 100 : null, sugerido: custo / (cmvAlvo() / 100) };
  }
  const corCmv = cmv => cmv == null ? '' : cmv <= 35 ? 'ok' : cmv <= 45 ? 'medio' : 'alto';

  // Insumos do exemplo do dono (ficha G: custo R$ 30,09 → CMV 41,2% com venda de R$ 73,00)
  const EXEMPLO = [
    ['Queijo muçarela', 'Queijos', 'kg', 37.54, 1, 0.280], ['Bacon', 'Carnes', 'kg', 49.17, 1, 0.120],
    ['Frango desfiado', 'Carnes', 'kg', 25.70, 1, 0.200], ['Gás de cozinha (botijão 13 kg)', 'Gás/Energia', 'kg', 134.94, 13, 0.235],
    ['Caixa grande 35 cm', 'Embalagens', 'un', 63.00, 50, 1], ['Milho', 'Vegetais', 'kg', 15.83, 1, 0.060],
    ['Azeitona', 'Vegetais', 'kg', 29.33, 1, 0.030], ['Creme de leite', 'Molhos', 'kg', 29.20, 1, 0.025],
    ['Massa (farinha de trigo)', 'Massa', 'kg', 5.00, 1, 0.300], ['Molho de tomate', 'Molhos', 'kg', 9.75, 1, 0.080]
  ];
  const listaExemplo = () => EXEMPLO.map(([nome, categoria, unidade, precoCompra, qtdEmbalagem]) => ({
    id: 'ins-' + Catalogo.slug(nome), nome, categoria, unidade, precoCompra, qtdEmbalagem, perda: 0, fornecedor: '', ativo: true, atualizadoEm: Date.now(), historico: []
  }));
  const fichaExemplo = () => EXEMPLO.map(x => ({ insumoId: 'ins-' + Catalogo.slug(x[0]), qtd: x[5] }));

  // Assina insumos e fichas (só logado); onChange a cada atualização
  function iniciar(onChange) {
    if (iniciado) return; iniciado = true;
    const avisar = () => { try { onChange && onChange(); } catch (e) { console.error(e); } };
    // erro de leitura (ex.: regras sem insumos/fichas) fica visível na Gestão
    const falhou = e => { erroLeitura = e; avisar(); };
    DB.observarInsumos(l => { erroLeitura = null; carregado = true; insumos = {}; l.forEach(i => { insumos[i.id] = i; }); avisar(); }, falhou);
    DB.observarFichas(l => { fichas = {}; l.forEach(f => { fichas[f.id] = f; }); avisar(); }, falhou);
  }

  return {
    UNIDADES, CATEGORIAS, TAMANHOS, iniciar, custoUnit, custoLinha, custoLinhas, custoBase, custoFicha, custoSabor, custoItem,
    temFicha, idSabor, lerQtd, usoInsumo, resultado, corCmv, cmvAlvo, listaExemplo, fichaExemplo,
    fichasDoInsumo, converter, custoMedio, estado, acabando, sugestaoCompra, consumoPedido, fichasDoPedido, carregado: () => carregado,
    insumo: id => insumos[id] || null, insumos: () => Object.values(insumos).sort((a, b) => a.nome.localeCompare(b.nome)),
    ficha: id => fichas[id] || null, base, erro: () => erroLeitura
  };
})();
