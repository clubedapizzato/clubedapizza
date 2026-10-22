/* =========================================================
   FICHA TÉCNICA (custo das pizzas e adicionais) — só Gestão/cozinha/balcão (logado)
   - insumos/{id}: { nome, categoria, unidade, precoCompra, qtdEmbalagem, perda %, fornecedor, atualizadoEm, ativo, historico }
   - fichas/{saborId|adicionalId}: { P: [{ insumoId, qtd }], M: [...], G: [...] }
   - fichas/_base: { P, M, G (base comum de toda pizza: massa, caixa, gás...), cmvAlvo }
   Custos são privados (coleções só para logado). Não baixa estoque de insumo nesta fase.
   ========================================================= */
window.Ficha = (function () {
  const UNIDADES = ['kg', 'g', 'L', 'ml', 'un'];
  const CATEGORIAS = ['Queijos', 'Carnes', 'Vegetais', 'Molhos', 'Massa', 'Embalagens', 'Gás/Energia', 'Outros'];
  const TAMANHOS = ['P', 'M', 'G'];
  let insumos = {}, fichas = {}, iniciado = false, erroLeitura = null;
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
  // Fichas (e a base) que usam o insumo
  const usoInsumo = id => Object.keys(fichas).filter(k => TAMANHOS.some(t => (fichas[k][t] || []).some(l => l.insumoId === id))).length;

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
    DB.observarInsumos(l => { erroLeitura = null; insumos = {}; l.forEach(i => { insumos[i.id] = i; }); avisar(); }, falhou);
    DB.observarFichas(l => { fichas = {}; l.forEach(f => { fichas[f.id] = f; }); avisar(); }, falhou);
  }

  return {
    UNIDADES, CATEGORIAS, TAMANHOS, iniciar, custoUnit, custoLinha, custoLinhas, custoBase, custoFicha, custoSabor, custoItem,
    temFicha, idSabor, lerQtd, usoInsumo, resultado, corCmv, cmvAlvo, listaExemplo, fichaExemplo,
    insumo: id => insumos[id] || null, insumos: () => Object.values(insumos).sort((a, b) => a.nome.localeCompare(b.nome)),
    ficha: id => fichas[id] || null, base, erro: () => erroLeitura
  };
})();
