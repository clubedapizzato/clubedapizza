/* =========================================================
   CATÁLOGO DE PRODUTOS + ESTOQUE (Firestore: produtos e config/loja)
   - Se a coleção "produtos" estiver vazia ou offline, vale o cardápio fixo de js/cardapio.js
   - Reconstrói CARDAPIO.sabores / CARDAPIO.categorias, então Preco.* continua igual
   ========================================================= */
window.Catalogo = (function () {
  const C = window.CARDAPIO;
  const clone = o => JSON.parse(JSON.stringify(o));
  const PADRAO = clone({ sabores: C.sabores, categorias: C.categorias, adicionais: C.adicionais });
  const LOJA_PADRAO = clone(C.loja);
  const SACHES = ['Maionese', 'Ketchup', 'Mostarda', 'Barbecue', 'Molho de pimenta'];
  const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let docs = {};          // id -> documento do Firestore
  let doBanco = false;    // true = catálogo veio do Firestore

  // Lista para o botão "Importar cardápio atual" (formato do Firestore)
  function listaImportacao() {
    const l = [];
    let ordem = 0;
    PADRAO.sabores.forEach(s => l.push({
      id: 'pizza-' + slug(s.nome), tipo: 'sabor', nome: s.nome, desc: s.desc || '', categoria: 'Pizzas', ordem: ordem++,
      ativo: true, controlaEstoque: false, precos: { P: s.P, M: s.M, G: s.G }, custos: { P: null, M: null, G: null }
    }));
    // Bebidas entram SEM controle de estoque (não somem da loja); ele liga na 1ª entrada de compra
    PADRAO.categorias.forEach(cat => cat.produtos.forEach(p => l.push({
      id: p.id, tipo: 'produto', nome: p.nome, categoria: cat.nome, ordem: ordem++, ativo: true,
      controlaEstoque: false, unidade: 'un', estoqueAtual: 0, estoqueMinimo: 6, custoUnitario: 0, custosExtras: 0,
      taxaMaquininha: null, margemDesejada: 30, precoVenda: p.preco, precoAutomatico: false
    })));
    l.push(...adicionaisPadrao(ordem)); ordem += PADRAO.adicionais.length;
    SACHES.forEach(n => l.push({
      id: 'sache-' + slug(n), tipo: 'produto', nome: n, categoria: 'Sachês', ordem: ordem++, ativo: true,
      controlaEstoque: true, unidade: 'sachê', estoqueAtual: 0, estoqueMinimo: 30, custoUnitario: 0, custosExtras: 0,
      taxaMaquininha: null, margemDesejada: 60, precoVenda: 0, precoAutomatico: true
    }));
    return l;
  }

  // Adicionais iniciais (Catupiry e Cheddar) no formato do Firestore
  const adicionaisPadrao = (ordem = 0) => PADRAO.adicionais.map((a, i) => ({
    id: a.id, tipo: 'adicional', nome: a.nome, categoria: 'Adicionais', ordem: ordem + i, ativo: true,
    precos: { P: a.P, M: a.M, G: a.G }, controlaEstoque: false, unidade: 'porção', estoqueAtual: 0, estoqueMinimo: 0
  }));

  const ordenar = l => l.slice().sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || String(a.nome).localeCompare(b.nome));

  function aplicar(lista) {
    docs = {};
    lista.forEach(p => { docs[p.id] = p; });
    doBanco = lista.length > 0;
    if (!doBanco) { C.sabores = clone(PADRAO.sabores); C.categorias = clone(PADRAO.categorias); C.adicionais = clone(PADRAO.adicionais); return; }
    const ord = ordenar(lista);
    C.sabores = ord.filter(p => p.tipo === 'sabor').map(p => ({
      id: p.id, nome: p.nome, desc: p.desc || '', P: (p.precos || {}).P, M: (p.precos || {}).M, G: (p.precos || {}).G,
      ativo: p.ativo !== false, custos: p.custos || {}, ingredientes: ingredientes(p.ingredientes)
    }));
    // adicionais da pizza; catálogo importado antes deles existirem → vale o padrão (Catupiry e Cheddar)
    const adic = ord.filter(p => p.tipo === 'adicional');
    C.adicionais = adic.length ? adic.map(p => ({ id: p.id, nome: p.nome, P: (p.precos || {}).P, M: (p.precos || {}).M, G: (p.precos || {}).G, ativo: p.ativo !== false }))
      : clone(PADRAO.adicionais);
    const cats = [];
    ord.filter(p => p.tipo !== 'sabor' && p.tipo !== 'adicional').forEach(p => {
      const nome = p.categoria || 'Outros';
      let c = cats.find(x => x.nome === nome);
      if (!c) { c = { id: slug(nome), nome, produtos: [] }; cats.push(c); }
      c.produtos.push({ id: p.id, nome: p.nome, preco: Number(p.precoVenda) || 0, ativo: p.ativo !== false });
    });
    C.categorias = cats;
  }

  // Assina produtos + config/loja; onChange é chamado a cada atualização (estoque em tempo real)
  function iniciar(onChange) {
    const avisar = () => { try { onChange && onChange(); } catch (e) { console.error(e); } };
    DB.observarProdutos(l => { aplicar(l); avisar(); }, () => { aplicar([]); avisar(); });
    DB.observarConfig(cfg => { C.loja = Object.assign({}, LOJA_PADRAO, cfg || {}); avisar(); });
  }

  const doc = id => docs[id] || null;
  // Unidades disponíveis para venda (Infinity se não controla estoque)
  function disponivel(id) {
    const d = docs[id];
    if (!d || !d.controlaEstoque) return Infinity;
    return Math.max(0, Math.floor(d.estoqueAtual || 0));
  }
  const vendavel = p => p.ativo !== false && disponivel(p.id) > 0;
  const saboresAtivos = () => C.sabores.map((s, i) => ({ s, i })).filter(x => x.s.ativo !== false);
  // Categorias para a vitrine (sem sachês): só ativos e com estoque
  const categoriasVenda = () => C.categorias.filter(c => c.id !== 'saches')
    .map(c => Object.assign({}, c, { produtos: c.produtos.filter(vendavel) })).filter(c => c.produtos.length);
  const sachesVenda = () => ((C.categorias.find(c => c.id === 'saches') || {}).produtos || []).filter(vendavel);

  // Itens do carrinho que passam do estoque: [{ id, nome, pedido, tem }]
  function faltas(itens) {
    const qtd = {};
    (itens || []).forEach(it => {
      if (it.tipo === 'produto') qtd[it.id] = (qtd[it.id] || 0) + (it.qtd || 1);
      (it.adicionais || []).forEach(a => { qtd[a.id] = (qtd[a.id] || 0) + (it.qtd || 1); });   // adicional com estoque
    });
    const item = id => Preco.produto(id) || Preco.adicional(id);
    return Object.keys(qtd).filter(id => qtd[id] > disponivel(id) || (item(id) && item(id).ativo === false))
      .map(id => ({ id, nome: (item(id) || {}).nome || id, pedido: qtd[id], tem: item(id) && item(id).ativo === false ? 0 : disponivel(id) }));
  }

  /* ---------- adicionais e "retirar ingredientes" na montagem da pizza (loja e balcão) ---------- */
  const ingredientes = t => (Array.isArray(t) ? t : String(t || '').split(',')).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const adicionaisVenda = () => (C.adicionais || []).filter(a => a.ativo !== false && disponivel(a.id) > 0);
  // Descrição do sabor no cardápio: a descrição ou os ingredientes
  const descSabor = s => s.desc || (s.ingredientes && s.ingredientes.length ? s.ingredientes.join(', ') : '');
  /* HTML das seções "➕ Adicionais" e "➖ Retirar" do modal. m = montagem { tamanho, sabores, adicionais:[ids], retirar:[{ingrediente,sabor}] }
     Os cliques chamam mAdic(id) e mRet(iSabor, iIngrediente) da página. */
  function htmlExtras(m) {
    const adic = adicionaisVenda();
    let h = '';
    if (adic.length) h += `<h3 style="margin-top:14px">➕ Adicionais</h3><div class="chips">${adic.map(a =>
      `<span class="chip ${m.adicionais.includes(a.id) ? 'on' : ''}" onclick="mAdic('${a.id}')">${m.adicionais.includes(a.id) ? '✓ ' : '+ '}${esc(a.nome)} • ${dinheiro(a[m.tamanho])}</span>`).join('')}</div>`;
    const grupos = m.sabores.map((n, i) => ({ n, i, ing: (Preco.sabor(n) || {}).ingredientes || [] })).filter(g => g.ing.length);
    if (grupos.length) {
      h += `<h3 style="margin-top:14px">➖ Retirar <span class="muted">(sem custo)</span></h3>`;
      grupos.forEach(g => {
        if (m.sabores.length > 1) h += `<div class="muted" style="margin:6px 0 4px">${esc(g.n)}</div>`;
        h += `<div class="chips">${g.ing.map((x, j) => { const on = m.retirar.some(r => r.ingrediente === x && r.sabor === g.n);
          return `<span class="chip ${on ? 'on' : ''}" onclick="mRet(${g.i},${j})">${on ? '🚫 sem ' : ''}${esc(x)}</span>`; }).join('')}</div>`;
      });
    }
    return h;
  }
  function alternarAdicional(m, id) { m.adicionais = m.adicionais.includes(id) ? m.adicionais.filter(x => x !== id) : m.adicionais.concat([id]); }
  function alternarRetirar(m, iSabor, iIng) {
    const sabor = m.sabores[iSabor], ing = ((Preco.sabor(sabor) || {}).ingredientes || [])[iIng];
    if (!ing) return;
    const ja = m.retirar.some(r => r.ingrediente === ing && r.sabor === sabor);
    m.retirar = ja ? m.retirar.filter(r => !(r.ingrediente === ing && r.sabor === sabor)) : m.retirar.concat([{ ingrediente: ing, sabor }]);
  }
  // tirou um sabor: some o "retirar" dele
  const ajustarMontagem = m => { m.retirar = m.retirar.filter(r => m.sabores.includes(r.sabor)); };
  // { adicionais: [{ id, nome, preco }], retirar } para gravar no item
  const extrasItem = m => ({
    adicionais: m.adicionais.map(id => { const a = Preco.adicional(id) || { nome: id }; return { id, nome: a.nome, preco: a[m.tamanho] || 0 }; }),
    retirar: m.retirar.slice()
  });

  // Taxa da maquininha (%) do produto ou a padrão da loja
  const taxaDe = d => (d && d.taxaMaquininha != null && d.taxaMaquininha !== '') ? Number(d.taxaMaquininha) : Number((C.loja || {}).taxaMaquininha) || 0;

  // Custo opcional da pizza (média dos custos dos sabores no tamanho); null se faltar algum
  function custoPizza(it) {
    const cs = (it.sabores || []).map(n => { const s = Preco.sabor(n); return s && s.custos ? s.custos[it.tamanho] : null; });
    if (!cs.length || cs.some(c => c == null || c === '')) return null;
    return Math.round(cs.reduce((a, b) => a + Number(b), 0) / cs.length * 100) / 100;
  }

  // Item pronto para gravar no pedido (nome/preço do momento; sachês com a cortesia aplicada)
  function itensPedido(itens) {
    const s = Preco.saches(itens);
    return itens.map(({ uid, ...it }, i) => {
      if (it.tipo !== 'produto') {   // pizza: preço e adicionais do momento
        if (it.adicionais) it.adicionais = it.adicionais.map(a => Object.assign({}, a, { preco: Preco.precoAdicional(a, it.tamanho) }));
        return Object.assign(it, { preco: Preco.unitario(it) });
      }
      const extra = { nome: Preco.descricao(it), preco: Preco.unitario(it), categoria: (Preco.categoriaDe(it.id) || {}).nome || '' };
      if (Preco.ehSache(it)) Object.assign(extra, { sache: true, gratis: s.gratisPorItem[i] || 0 });
      return Object.assign(it, extra);
    });
  }

  return {
    iniciar, aplicar, listaImportacao, doc, todos: () => ordenar(Object.values(docs)), doBanco: () => doBanco,
    disponivel, vendavel, saboresAtivos, categoriasVenda, sachesVenda, faltas, taxaDe, custoPizza, itensPedido, slug, SACHES,
    adicionaisPadrao, adicionaisVenda, ingredientes, descSabor, htmlExtras, alternarAdicional, alternarRetirar, ajustarMontagem, extrasItem
  };
})();
