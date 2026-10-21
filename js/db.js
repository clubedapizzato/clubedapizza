/* =========================================================
   BANCO DE DADOS (pedidos, produtos/estoque, movimentos, config)
   - Firebase Firestore (produção, tempo real entre aparelhos)
   - Modo demonstração (localStorage, só no mesmo navegador)
   ========================================================= */
window.DB = (function () {
  const FB_VER = '10.12.2';
  const FB = m => `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${m}.js`;
  let fs, auth, db, authMod;
  let pronto = null;

  const modo = () => (CONFIG.firebase ? 'firebase' : 'demo');

  function init() {
    if (pronto) return pronto;
    pronto = (async () => {
      if (modo() !== 'firebase') return;
      const appMod = await import(FB('app'));
      fs = await import(FB('firestore'));
      authMod = await import(FB('auth'));
      const app = appMod.initializeApp(CONFIG.firebase);
      db = fs.getFirestore(app);
      auth = authMod.getAuth(app);
    })();
    return pronto;
  }

  /* ---------------- modo demonstração ---------------- */
  const LS = 'cdp_pedidos', LS_PROD = 'cdp_produtos', LS_MOV = 'cdp_movimentos', LS_CFG = 'cdp_config', LS_RAS = 'cdp_rastreio', LS_FILA = 'cdp_fila';
  const lerLS = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) || padrao; } catch { return padrao; } };
  const gravarLS = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new CustomEvent('cdp-local', { detail: k })); };
  const lerTodos = () => lerLS(LS, {});
  const gravarTodos = o => gravarLS(LS, o);
  function ouvirLocal(fn, chave = LS) {
    const h = e => { const k = e.type === 'storage' ? e.key : e.detail; if (!k || k === chave) fn(); };
    window.addEventListener('storage', h);
    window.addEventListener('cdp-local', h);
    fn();
    return () => { window.removeEventListener('storage', h); window.removeEventListener('cdp-local', h); };
  }
  const usuario = () => (modo() === 'demo' ? 'demo' : (auth && auth.currentUser && auth.currentUser.email) || '');

  /* ---------------- ESTOQUE (regras comuns aos dois modos) ---------------- */
  // produtos + adicionais das pizzas (adicional pode controlar estoque)
  const idsProdutos = itens => [...new Set((itens || []).flatMap(it => it.tipo === 'produto' ? [it.id] : (it.adicionais || []).map(a => a.id)))];

  // Alterações de estoque de um pedido. sinal -1 = baixa (venda), +1 = estorno
  function planoEstoque(pedido, prods, sinal) {
    const qtd = {};
    (pedido.itens || []).forEach(it => {
      if (it.tipo === 'produto') qtd[it.id] = (qtd[it.id] || 0) + (it.qtd || 1);
      (it.adicionais || []).forEach(a => { qtd[a.id] = (qtd[a.id] || 0) + (it.qtd || 1); });
    });
    const mudancas = [], faltas = [];
    Object.keys(qtd).forEach(id => {
      const p = prods[id];
      if (!p || !p.controlaEstoque) return;
      const atual = p.estoqueAtual || 0;
      if (sinal < 0 && atual < qtd[id]) faltas.push({ id, nome: p.nome, pedido: qtd[id], tem: atual });
      mudancas.push({ id, nome: p.nome, qtd: sinal * qtd[id], estoque: atual + sinal * qtd[id], custo: p.custoUnitario || 0 });
    });
    return { mudancas, faltas };
  }
  // Grava no item o custo do momento da venda (relatório de lucro fiel)
  function itensComCusto(itens, prods) {
    return (itens || []).map(it => {
      if (it.tipo === 'produto' && prods[it.id]) {
        const p = prods[it.id];
        return Object.assign({}, it, { custoUnitario: p.custoUnitario || 0, custoExtras: p.custosExtras || 0 });
      }
      if (it.tipo === 'pizza' && it.custoUnitario == null && window.Catalogo) {
        const c = Catalogo.custoPizza(it);
        return c != null ? Object.assign({}, it, { custoUnitario: c }) : it;
      }
      return it;
    });
  }
  const movimentoVenda = (m, sinal, pedidoId, pedido) => ({
    tipo: sinal < 0 ? 'venda' : 'estorno', produtoId: m.id, produtoNome: m.nome, qtd: m.qtd,
    custoUnitario: m.custo, estoqueDepois: m.estoque, pedidoId, pedidoNumero: pedido.numero || null,
    data: pedido.data || hojeISO(), em: Date.now(), usuario: usuario()
  });

  // Entrada de compra (custo médio ponderado) ou ajuste (perda, avaria, consumo, contagem)
  function aplicarMovimento(prod, m) {
    const atual = prod.estoqueAtual || 0, upd = {};
    let delta;
    if (m.tipo === 'entrada') {
      delta = m.qtd;
      upd.custoUnitario = Math.round((atual > 0 ? (atual * (prod.custoUnitario || 0) + m.valorTotal) / (atual + m.qtd) : m.valorTotal / m.qtd) * 10000) / 10000;
      if (m.ligarControle) upd.controlaEstoque = true;
      if (prod.precoAutomatico) {
        const taxa = prod.taxaMaquininha != null ? prod.taxaMaquininha : ((CARDAPIO.loja || {}).taxaMaquininha || 0);
        const sug = Margem.sugerido(upd.custoUnitario, prod.custosExtras, prod.margemDesejada, taxa);
        if (sug) upd.precoVenda = Math.round(Margem.arredondar(sug) * 100) / 100;
      }
    } else delta = m.contagem ? m.qtd - atual : m.qtd;
    upd.estoqueAtual = atual + delta;
    const mov = {
      tipo: m.tipo, produtoId: m.produtoId, produtoNome: prod.nome, qtd: delta,
      valorTotal: m.tipo === 'entrada' ? m.valorTotal : null,
      custoUnitario: m.tipo === 'entrada' ? Math.round(m.valorTotal / m.qtd * 10000) / 10000 : (prod.custoUnitario || 0),
      fornecedor: m.fornecedor || '', motivo: m.motivo || '', obs: m.obs || '',
      estoqueDepois: upd.estoqueAtual, data: m.data || hojeISO(), em: Date.now(), usuario: usuario()
    };
    return { upd, mov };
  }

  /* ---------------- API ---------------- */
  // Pedido do site e delivery do balcão ganham código de acompanhamento (rastreio/{codigo})
  const precisaCodigo = p => p.origem === 'site' || (p.entrega && p.entrega.tipo === 'entrega');

  // opcoes.baixarEstoque: baixa o estoque na mesma operação (balcão)
  async function criarPedido(pedido, opcoes = {}) {
    await init();
    // data = dia do turno de ENTREGA (agendado para outro dia entra na fila daquele dia)
    const data = pedido.data || hojeISO();
    pedido = Object.assign({}, pedido, {
      data, status: 'novo', impresso: false, criadoEm: Date.now(),
      historico: [{ status: 'novo', em: Date.now() }]
    });

    if (modo() === 'demo') {
      const kc = 'cdp_cont_' + data;
      const numero = (parseInt(localStorage.getItem(kc) || '0', 10) + 1);
      localStorage.setItem(kc, numero);
      const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      Object.assign(pedido, { id, numero });
      if (precisaCodigo(pedido)) {
        const ras = lerLS(LS_RAS, {});
        let c; do { c = Rastreio.gerar(); } while (ras[c]);
        ras[c] = { pedidoId: id, criadoEm: Date.now() };
        pedido.codigo = c;
        gravarLS(LS_RAS, ras);
      }
      let faltas = [];
      if (opcoes.baixarEstoque) {
        const prods = lerLS(LS_PROD, {}), movs = lerLS(LS_MOV, []);
        const plano = planoEstoque(pedido, prods, -1);
        faltas = plano.faltas;
        plano.mudancas.forEach(m => { prods[m.id].estoqueAtual = m.estoque; movs.push(Object.assign({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, movimentoVenda(m, -1, id, pedido))); });
        pedido.itens = itensComCusto(pedido.itens, prods);
        pedido.estoqueBaixado = true;
        gravarLS(LS_PROD, prods); gravarLS(LS_MOV, movs);
      }
      const todos = lerTodos();
      todos[id] = pedido;
      gravarTodos(todos);
      return { id, numero, faltas, codigo: pedido.codigo || null };
    }

    const contRef = fs.doc(db, 'contadores', data);
    const pedRef = fs.doc(fs.collection(db, 'pedidos'));
    let faltas = [], codigo = null;
    const numero = await fs.runTransaction(db, async tx => {
      const snap = await tx.get(contRef);
      const n = snap.exists() ? snap.data().n + 1 : 1;
      let doc = Object.assign({}, pedido, { numero: n, criadoEmServidor: fs.serverTimestamp() });
      // código livre (colisão: gera outro)
      let rasRef = null;
      if (precisaCodigo(pedido)) {
        for (let i = 0; i < 6; i++) {
          codigo = Rastreio.gerar(); rasRef = fs.doc(db, 'rastreio', codigo);
          if (!(await tx.get(rasRef)).exists()) break;
          if (i === 5) throw new Error('Não foi possível gerar o código do pedido.');
        }
        doc.codigo = codigo;
      }
      const prods = {};
      if (opcoes.baixarEstoque) {
        for (const pid of idsProdutos(pedido.itens)) { const s = await tx.get(fs.doc(db, 'produtos', pid)); if (s.exists()) prods[pid] = s.data(); }
      }
      tx.set(contRef, { n });
      if (opcoes.baixarEstoque) {
        const plano = planoEstoque(doc, prods, -1);
        faltas = plano.faltas;
        plano.mudancas.forEach(m => {
          tx.update(fs.doc(db, 'produtos', m.id), { estoqueAtual: m.estoque });
          tx.set(fs.doc(fs.collection(db, 'movimentos')), movimentoVenda(m, -1, pedRef.id, doc));
        });
        doc = Object.assign(doc, { itens: itensComCusto(doc.itens, prods), estoqueBaixado: true });
      }
      tx.set(pedRef, doc);
      if (rasRef) tx.set(rasRef, { pedidoId: pedRef.id, criadoEm: Date.now() });
      return n;
    });
    return { id: pedRef.id, numero, faltas, codigo };
  }

  /* Baixa (sinal -1) ou estorno (+1) do estoque de um pedido, uma única vez.
     Baixa: pedido.estoqueBaixado = true. Estorno: só se já baixou → estoqueBaixado = false. */
  async function moverEstoquePedido(id, sinal) {
    await init();
    const pode = p => sinal < 0 ? !p.estoqueBaixado : !!p.estoqueBaixado;
    const marca = sinal < 0 ? { estoqueBaixado: true } : { estoqueBaixado: false, estoqueEstornado: true };
    if (modo() === 'demo') {
      const todos = lerTodos(), p = todos[id];
      if (!p || !pode(p)) return { faltas: [], feito: false };
      const prods = lerLS(LS_PROD, {}), movs = lerLS(LS_MOV, []);
      const plano = planoEstoque(p, prods, sinal);
      plano.mudancas.forEach(m => { prods[m.id].estoqueAtual = m.estoque; movs.push(Object.assign({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, movimentoVenda(m, sinal, id, p))); });
      if (sinal < 0) p.itens = itensComCusto(p.itens, prods);
      Object.assign(p, marca);
      gravarLS(LS_PROD, prods); gravarLS(LS_MOV, movs); gravarTodos(todos);
      return { faltas: plano.faltas, feito: true };
    }
    const pedRef = fs.doc(db, 'pedidos', id);
    return fs.runTransaction(db, async tx => {
      const ps = await tx.get(pedRef);
      if (!ps.exists()) return { faltas: [], feito: false };
      const p = ps.data();
      if (!pode(p)) return { faltas: [], feito: false };
      const prods = {};
      for (const pid of idsProdutos(p.itens)) { const s = await tx.get(fs.doc(db, 'produtos', pid)); if (s.exists()) prods[pid] = s.data(); }
      const plano = planoEstoque(p, prods, sinal);
      plano.mudancas.forEach(m => {
        tx.update(fs.doc(db, 'produtos', m.id), { estoqueAtual: m.estoque });
        tx.set(fs.doc(fs.collection(db, 'movimentos')), movimentoVenda(m, sinal, id, p));
      });
      tx.update(pedRef, sinal < 0 ? Object.assign({ itens: itensComCusto(p.itens, prods) }, marca) : marca);
      return { faltas: plano.faltas, feito: true };
    });
  }
  const baixarEstoque = id => moverEstoquePedido(id, -1);
  const estornarEstoque = id => moverEstoquePedido(id, 1);

  async function observarPedido(id, cb) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => { const p = lerTodos()[id]; cb(p || null); });
    return fs.onSnapshot(fs.doc(db, 'pedidos', id),
      s => cb(s.exists() ? Object.assign({ id: s.id }, s.data()) : null),
      e => { console.error(e); cb(null); });
  }

  async function observarPedidosDoDia(data, cb, erro) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => cb(Object.values(lerTodos()).filter(p => p.data === data)));
    const q = fs.query(fs.collection(db, 'pedidos'), fs.where('data', '==', data));
    return fs.onSnapshot(q, s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), e => { console.error(e); erro && erro(e); });
  }

  // Pedidos com data (YYYY-MM-DD) entre "de" e "ate" (inclusive) — relatórios
  async function listarPedidos(de, ate) {
    await init();
    if (modo() === 'demo') return Object.values(lerTodos()).filter(p => p.data >= de && p.data <= ate);
    const q = fs.query(fs.collection(db, 'pedidos'), fs.where('data', '>=', de), fs.where('data', '<=', ate));
    const s = await fs.getDocs(q);
    return s.docs.map(d => Object.assign({ id: d.id }, d.data()));
  }

  // Código de acompanhamento → id do pedido (null se não existe)
  async function buscarCodigo(codigo) {
    await init();
    if (modo() === 'demo') { const r = lerLS(LS_RAS, {})[codigo]; return r ? r.pedidoId : null; }
    const s = await fs.getDoc(fs.doc(db, 'rastreio', codigo));
    return s.exists() ? s.data().pedidoId : null;
  }

  // Fila pública sem dados pessoais (config/fila), mantida pela cozinha
  async function observarFila(cb) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => cb(lerLS(LS_FILA, null)), LS_FILA);
    return fs.onSnapshot(fs.doc(db, 'config', 'fila'), s => cb(s.exists() ? s.data() : null), e => { console.error(e); cb(null); });
  }
  async function salvarFila(campos) {
    await init();
    if (modo() === 'demo') { gravarLS(LS_FILA, Object.assign(lerLS(LS_FILA, {}), campos)); return; }
    await fs.setDoc(fs.doc(db, 'config', 'fila'), campos, { merge: true });
  }

  // Último pedido (mais recente) com este telefone — só dígitos; delivery do balcão (logado)
  async function ultimoPedidoPorTelefone(tel) {
    await init();
    let l;
    if (modo() === 'demo') l = Object.values(lerTodos()).filter(p => p.cliente && p.cliente.telefone === tel);
    else {
      const q = fs.query(fs.collection(db, 'pedidos'), fs.where('cliente.telefone', '==', tel));
      l = (await fs.getDocs(q)).docs.map(d => Object.assign({ id: d.id }, d.data()));
    }
    return l.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0))[0] || null;
  }

  // Pedidos de dias FUTUROS (agendamentos), em tempo real
  async function observarPedidosFuturos(data, cb, erro) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => cb(Object.values(lerTodos()).filter(p => p.data > data)));
    const q = fs.query(fs.collection(db, 'pedidos'), fs.where('data', '>', data));
    return fs.onSnapshot(q, s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), e => { console.error(e); erro && erro(e); });
  }

  async function atualizarPedido(id, campos, novoStatus) {
    await init();
    if (modo() === 'demo') {
      const todos = lerTodos();
      if (!todos[id]) return;
      Object.assign(todos[id], campos);
      if (novoStatus) todos[id].historico.push({ status: novoStatus, em: Date.now() });
      gravarTodos(todos);
      return;
    }
    const upd = Object.assign({}, campos);
    if (novoStatus) upd.historico = fs.arrayUnion({ status: novoStatus, em: Date.now() });
    await fs.updateDoc(fs.doc(db, 'pedidos', id), upd);
  }

  /* ---------------- PRODUTOS / CONFIG / MOVIMENTOS ---------------- */
  async function observarProdutos(cb, erro) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => cb(Object.values(lerLS(LS_PROD, {}))), LS_PROD);
    return fs.onSnapshot(fs.collection(db, 'produtos'), s => cb(s.docs.map(d => Object.assign({}, d.data(), { id: d.id }))),
      e => { console.error(e); erro && erro(e); });
  }
  async function salvarProduto(id, campos) {
    await init();
    if (modo() === 'demo') {
      const prods = lerLS(LS_PROD, {});
      prods[id] = Object.assign(prods[id] || {}, campos, { id });
      gravarLS(LS_PROD, prods);
      return;
    }
    await fs.setDoc(fs.doc(db, 'produtos', id), campos, { merge: true });
  }
  // Cria os produtos a partir do cardápio fixo — só se a coleção estiver vazia
  async function importarProdutos(lista) {
    await init();
    if (modo() === 'demo') {
      const prods = lerLS(LS_PROD, {});
      if (Object.keys(prods).length) throw new Error('A coleção de produtos já tem itens.');
      lista.forEach(p => { prods[p.id] = p; });
      gravarLS(LS_PROD, prods);
      return lista.length;
    }
    const atual = await fs.getDocs(fs.query(fs.collection(db, 'produtos'), fs.limit(1)));
    if (!atual.empty) throw new Error('A coleção de produtos já tem itens.');
    const b = fs.writeBatch(db);
    lista.forEach(p => { const { id, ...dados } = p; b.set(fs.doc(db, 'produtos', id), dados); });
    await b.commit();
    return lista.length;
  }

  async function observarConfig(cb) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => cb(lerLS(LS_CFG, {})), LS_CFG);
    return fs.onSnapshot(fs.doc(db, 'config', 'loja'), s => cb(s.exists() ? s.data() : {}), e => { console.error(e); cb({}); });
  }
  async function salvarConfig(campos) {
    await init();
    if (modo() === 'demo') { gravarLS(LS_CFG, Object.assign(lerLS(LS_CFG, {}), campos)); return; }
    await fs.setDoc(fs.doc(db, 'config', 'loja'), campos, { merge: true });
  }

  // m = { tipo: 'entrada'|'ajuste', produtoId, qtd, valorTotal, fornecedor, data, motivo, obs, contagem, ligarControle }
  async function lancarMovimento(m) {
    await init();
    if (modo() === 'demo') {
      const prods = lerLS(LS_PROD, {}), prod = prods[m.produtoId];
      if (!prod) throw new Error('Produto não encontrado.');
      const { upd, mov } = aplicarMovimento(prod, m);
      Object.assign(prod, upd);
      const movs = lerLS(LS_MOV, []);
      movs.push(Object.assign({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, mov));
      gravarLS(LS_PROD, prods); gravarLS(LS_MOV, movs);
      return upd;
    }
    const ref = fs.doc(db, 'produtos', m.produtoId);
    return fs.runTransaction(db, async tx => {
      const s = await tx.get(ref);
      if (!s.exists()) throw new Error('Produto não encontrado.');
      const { upd, mov } = aplicarMovimento(s.data(), m);
      tx.update(ref, upd);
      tx.set(fs.doc(fs.collection(db, 'movimentos')), mov);
      return upd;
    });
  }
  // Movimentos com data (YYYY-MM-DD) entre "de" e "ate", mais recentes primeiro
  async function listarMovimentos(de, ate) {
    await init();
    let l;
    if (modo() === 'demo') l = lerLS(LS_MOV, []).filter(m => m.data >= de && m.data <= ate);
    else {
      const q = fs.query(fs.collection(db, 'movimentos'), fs.where('data', '>=', de), fs.where('data', '<=', ate));
      l = (await fs.getDocs(q)).docs.map(d => Object.assign({ id: d.id }, d.data()));
    }
    return l.sort((a, b) => b.em - a.em);
  }

  async function login(email, senha) {
    await init();
    if (modo() === 'demo') return;
    await authMod.signInWithEmailAndPassword(auth, email, senha);
  }
  async function sair() { await init(); if (modo() === 'firebase') await authMod.signOut(auth); }
  async function observarUsuario(cb) {
    await init();
    if (modo() === 'demo') { cb({ email: 'demo' }); return () => {}; }
    return authMod.onAuthStateChanged(auth, cb);
  }

  return {
    init, modo, criarPedido, observarPedido, observarPedidosDoDia, observarPedidosFuturos, listarPedidos, ultimoPedidoPorTelefone, buscarCodigo, observarFila, salvarFila, atualizarPedido,
    baixarEstoque, estornarEstoque, observarProdutos, salvarProduto, importarProdutos, observarConfig, salvarConfig,
    lancarMovimento, listarMovimentos, login, sair, observarUsuario
  };
})();
