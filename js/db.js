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
  const LS = 'cdp_pedidos', LS_PROD = 'cdp_produtos', LS_MOV = 'cdp_movimentos', LS_CFG = 'cdp_config', LS_RAS = 'cdp_rastreio', LS_FILA = 'cdp_fila', LS_INS = 'cdp_insumos', LS_FIC = 'cdp_fichas', LS_DISP = 'cdp_disponibilidade';
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
  // Guarda no erro o documento que falhou (aparece no console: "[Firebase] permission-denied em insumos/ins-x")
  const comCaminho = (caminho, promessa) => promessa.catch(e => { if (e && typeof e === 'object') e.caminho = caminho; throw e; });

  /* Mensagem clara para o toast a partir do código do erro do Firebase */
  function mensagemErro(e) {
    const code = String((e && e.code) || '').replace(/^(firestore|auth)\//, '');
    const campo = String((e && e.message) || '').match(/in field ([\w.\[\]-]+)/);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sem internet, tente de novo.';
    if (code === 'permission-denied') return 'Sem permissão: entre de novo ou publique as regras do Firebase (Firestore → Regras).';
    if (code === 'unauthenticated' || code === 'user-token-expired') return 'Sessão expirada: entre de novo.';
    if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network-request-failed') return 'Sem internet, tente de novo.';
    if (code === 'invalid-argument') return `Dado inválido${campo ? ' no campo ' + campo[1] : ''}. Confira e tente de novo.`;
    // página nova com script antigo em cache (ex.: "DB.salvarInsumo is not a function")
    if (e instanceof TypeError && /is not a function|undefined/.test(e.message)) return 'Página desatualizada: aperte Ctrl+F5 (no celular, feche e abra o navegador).';
    if (!code && e && e.message) return e.message;   // mensagens do próprio sistema (ex.: "Produto não encontrado.")
    return `Erro ao salvar${code ? ' (' + code + ')' : ''}. Tente de novo.`;
  }
  const logErro = e => console.error('[Firebase]', (e && e.code) || '', e && e.caminho ? 'em ' + e.caminho : '', e);

  const usuario = () => (modo() === 'demo' ? 'demo' : (auth && auth.currentUser && auth.currentUser.email) || '');

  /* ---------------- ESTOQUE (regras comuns aos dois modos) ---------------- */
  // Só produtos: o adicional da pizza não tem estoque próprio — baixa pelos insumos da ficha (baixarInsumos)
  const idsProdutos = itens => [...new Set((itens || []).filter(it => it.tipo === 'produto').map(it => it.id))];

  // Alterações de estoque de um pedido. sinal -1 = baixa (venda), +1 = estorno
  function planoEstoque(pedido, prods, sinal) {
    const qtd = {};
    (pedido.itens || []).forEach(it => {
      if (it.tipo === 'produto') qtd[it.id] = (qtd[it.id] || 0) + (it.qtd || 1);
    });
    const mudancas = [], faltas = [];
    Object.keys(qtd).forEach(id => {
      const p = prods[id];
      if (!p || !p.controlaEstoque || p.tipo === 'adicional') return;
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
        // ficha técnica (se carregada: cozinha/balcão logados); senão o custo manual do sabor
        const f = window.Ficha ? Ficha.custoItem(it) : null;
        const c = f != null ? f : Catalogo.custoPizza(it);
        return c != null ? Object.assign({}, it, { custoUnitario: c }) : it;
      }
      return it;
    });
  }
  const movimentoVenda = (m, sinal, pedidoId, pedido) => Object.assign({
    tipo: sinal < 0 ? 'venda' : 'estorno', produtoId: m.id, produtoNome: m.nome, qtd: m.qtd,
    custoUnitario: m.custo, estoqueDepois: m.estoque, pedidoId, pedidoNumero: pedido.numero || null,
    data: pedido.data || hojeISO(), em: Date.now(), usuario: usuario()
  }, pedido.consumoInterno ? { consumoInterno: pedido.consumoInterno.tipo || true } : {});

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

  /* opcoes.baixarEstoque: baixa o estoque na mesma operação (balcão)
     opcoes.entregue: balcão sem pizza — já nasce entregue (não vai para a fila da cozinha)
     opcoes.vinculos(pedidoId, numero) → [{ col, id, dados, uniao: { campo: [itens] } }]: documentos gravados
       na MESMA transação do pedido (ex.: compra no fiado, desconto na folha). "uniao" acrescenta itens a uma lista. */
  async function criarPedido(pedido, opcoes = {}) {
    await init();
    // data = dia do turno de ENTREGA (agendado para outro dia entra na fila daquele dia)
    const data = pedido.data || hojeISO(), agora = Date.now();
    pedido = Object.assign({}, pedido, {
      data, status: 'novo', impresso: false, criadoEm: agora,
      historico: [{ status: 'novo', em: agora }]
    });
    if (opcoes.entregue) Object.assign(pedido, { status: 'entregue', entregueEm: agora, historico: [{ status: 'novo', em: agora }, { status: 'entregue', em: agora }] });
    const vinculos = (id, n) => (opcoes.vinculos ? opcoes.vinculos(id, n) : []) || [];

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
      vinculos(id, numero).forEach(v => {
        const k = 'cdp_' + v.col, o = lerLS(k, {}), d = o[v.id] = Object.assign(o[v.id] || {}, v.dados, { id: v.id });
        Object.entries(v.uniao || {}).forEach(([c, l]) => { d[c] = (d[c] || []).concat(l.filter(x => !(d[c] || []).some(y => JSON.stringify(y) === JSON.stringify(x)))); });
        gravarLS(k, o);
      });
      const todos = lerTodos();
      todos[id] = pedido;
      gravarTodos(todos);
      return { id, numero, faltas, codigo: pedido.codigo || null };
    }

    const contRef = fs.doc(db, 'contadores', data);
    const pedRef = fs.doc(fs.collection(db, 'pedidos'));
    let faltas = [], codigo = null;
    const numero = await comCaminho('pedidos/' + pedRef.id, fs.runTransaction(db, async tx => {
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
      vinculos(pedRef.id, n).forEach(v => {
        const extra = {};
        Object.entries(v.uniao || {}).forEach(([c, l]) => { extra[c] = fs.arrayUnion(...l); });
        tx.set(fs.doc(db, v.col, v.id), Object.assign({}, v.dados, extra), { merge: true });
      });
      return n;
    }));
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
    return comCaminho('pedidos/' + id + ' (estoque)', fs.runTransaction(db, async tx => {
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
    }));
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
    await comCaminho('config/fila', fs.setDoc(fs.doc(db, 'config', 'fila'), campos, { merge: true }));
  }

  // Disponibilidade dos adicionais (config/disponibilidade): público, SEM custos; gravado pelas páginas logadas
  async function observarDisponibilidade(cb) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => cb(lerLS(LS_DISP, null)), LS_DISP);
    return fs.onSnapshot(fs.doc(db, 'config', 'disponibilidade'), s => cb(s.exists() ? s.data() : null), e => { console.error(e); cb(null); });
  }
  async function salvarDisponibilidade(campos) {
    await init();
    if (modo() === 'demo') { gravarLS(LS_DISP, campos); return; }
    await comCaminho('config/disponibilidade', fs.setDoc(fs.doc(db, 'config', 'disponibilidade'), campos));
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
    await comCaminho('pedidos/' + id, fs.updateDoc(fs.doc(db, 'pedidos', id), upd));
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
    await comCaminho('produtos/' + id, fs.setDoc(fs.doc(db, 'produtos', id), campos, { merge: true }));
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
    await comCaminho('produtos (importação)', b.commit());
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
    await comCaminho('config/loja', fs.setDoc(fs.doc(db, 'config', 'loja'), campos, { merge: true }));
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
    return comCaminho('produtos/' + m.produtoId + ' + movimentos', fs.runTransaction(db, async tx => {
      const s = await tx.get(ref);
      if (!s.exists()) throw new Error('Produto não encontrado.');
      const { upd, mov } = aplicarMovimento(s.data(), m);
      tx.update(ref, upd);
      tx.set(fs.doc(fs.collection(db, 'movimentos')), mov);
      return upd;
    }));
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

  /* ---------------- FICHA TÉCNICA (insumos e fichas: só logado) ---------------- */
  async function observarColecao(nome, chaveLS, cb, erro) {
    await init();
    if (modo() === 'demo') return ouvirLocal(() => cb(Object.values(lerLS(chaveLS, {}))), chaveLS);
    return fs.onSnapshot(fs.collection(db, nome), s => cb(s.docs.map(d => Object.assign({}, d.data(), { id: d.id }))),
      e => { console.error(e); erro && erro(e); });
  }
  async function salvarDoc(nome, chaveLS, id, campos) {
    await init();
    if (modo() === 'demo') { const o = lerLS(chaveLS, {}); o[id] = Object.assign(o[id] || {}, campos, { id }); gravarLS(chaveLS, o); return; }
    const { id: _, ...dados } = campos;
    await comCaminho(nome + '/' + id, fs.setDoc(fs.doc(db, nome, id), dados, { merge: true }));
  }
  const observarInsumos = (cb, erro) => observarColecao('insumos', LS_INS, cb, erro);
  const observarFichas = (cb, erro) => observarColecao('fichas', LS_FIC, cb, erro);
  const salvarInsumo = (id, campos) => salvarDoc('insumos', LS_INS, id, campos);
  // ficha inteira (P/M/G) substitui a anterior
  async function salvarFicha(id, campos) {
    await init();
    if (modo() === 'demo') { const o = lerLS(LS_FIC, {}); o[id] = Object.assign({}, o[id] || {}, campos, { id }); gravarLS(LS_FIC, o); return; }
    await comCaminho('fichas/' + id, fs.setDoc(fs.doc(db, 'fichas', id), campos, { merge: true }));
  }

  /* ---------------- ESTOQUE DE INSUMOS (coleção movimentos com tipoItem: 'insumo') ----------------
     Cada movimento é UM documento com itens: [{ insumoId, nome, unidade, qtd (+ entra / − sai), custoUnit, valor, saldoDepois }]
     tipo: 'compra' (nota com vários insumos, custo médio ponderado) | 'ajuste' | 'inventario' (contagem) |
           'consumo' (baixa pela ficha técnica, id fixo ins-consumo-{pedidoId}) | 'estorno' (pedido cancelado, ins-estorno-{pedidoId}) */
  const r4 = v => Math.round(v * 10000) / 10000, r5i = v => Math.round(v * 100000) / 100000, r2 = v => Math.round(v * 100) / 100;
  const idMov = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* m = { tipo: 'compra'|'ajuste'|'inventario', data, fornecedor, nota, motivo, obs,
           itens: [{ insumoId, qtd (compra: comprada; ajuste: +/−; inventario: contada), valor (compra: total pago) }] }
     ins = { id: insumo }. Retorna { upds: { id: campos }, mov } */
  function aplicarMovInsumos(ins, m) {
    const upds = {}, itens = [];
    m.itens.forEach(x => {
      const i = ins[x.insumoId];
      if (!i) throw new Error('Insumo não encontrado.');
      const atual = (upds[x.insumoId] && upds[x.insumoId].estoqueAtual != null ? upds[x.insumoId].estoqueAtual : Number(i.estoqueAtual)) || 0;
      const custo = Ficha.custoMedio(Object.assign({}, i, upds[x.insumoId] || {}));
      const emb = Number(i.qtdEmbalagem) > 0 ? Number(i.qtdEmbalagem) : 1;
      const it = { insumoId: x.insumoId, nome: i.nome, unidade: i.unidade };
      if (m.tipo === 'compra') {
        const q = Number(x.qtd), v = Number(x.valor) || 0;
        if (!(q > 0)) throw new Error(`Quantidade inválida (${i.nome}).`);
        // custo médio ponderado (estoque zerado/negativo: vale o preço desta compra)
        const medio = atual > 0 ? (atual * custo + v) / (atual + q) : v / q;
        const u = upds[x.insumoId] = Object.assign(upds[x.insumoId] || {}, {
          estoqueAtual: r5i(atual + q), precoCompra: r4(medio * emb), qtdEmbalagem: emb, atualizadoEm: Date.now(),
          historico: ((upds[x.insumoId] || {}).historico || i.historico || []).concat([{ em: i.atualizadoEm || Date.now(), precoCompra: i.precoCompra, qtdEmbalagem: i.qtdEmbalagem }])
        });
        Object.assign(it, { qtd: q, custoUnit: r4(v / q), valor: r2(v), saldoDepois: u.estoqueAtual, custoMedioDepois: r4(medio), custoMedioAntes: r4(custo) });
      } else if (m.tipo === 'inventario') {
        const contado = Number(x.qtd);
        if (!(contado >= 0)) throw new Error(`Contagem inválida (${i.nome}).`);
        const d = r5i(contado - atual);
        upds[x.insumoId] = Object.assign(upds[x.insumoId] || {}, { estoqueAtual: r5i(contado) });
        Object.assign(it, { qtd: d, antes: r5i(atual), contado: r5i(contado), custoUnit: r4(custo), valor: r2(d * custo), valorContado: r2(contado * custo), saldoDepois: r5i(contado) });
      } else {
        const d = Number(x.qtd);
        if (!d) throw new Error(`Quantidade inválida (${i.nome}).`);
        upds[x.insumoId] = Object.assign(upds[x.insumoId] || {}, { estoqueAtual: r5i(atual + d) });
        Object.assign(it, { qtd: r5i(d), custoUnit: r4(custo), valor: r2(d * custo), saldoDepois: r5i(atual + d) });
      }
      itens.push(it);
    });
    const mov = {
      tipoItem: 'insumo', tipo: m.tipo, itens, valorTotal: r2(itens.reduce((s, x) => s + x.valor, 0)),
      produtoNome: itens.length === 1 ? itens[0].nome : `${itens.length} insumos`,
      fornecedor: m.fornecedor || '', nota: m.nota || '', motivo: m.motivo || '', obs: m.obs || '',
      data: m.data || hojeISO(), em: Date.now(), usuario: usuario()
    };
    return { upds, mov };
  }

  async function lancarMovInsumos(m) {
    await init();
    if (!m.itens || !m.itens.length) throw new Error('Nenhum insumo informado.');
    if (modo() === 'demo') {
      const ins = lerLS(LS_INS, {});
      const { upds, mov } = aplicarMovInsumos(ins, m);
      Object.keys(upds).forEach(id => Object.assign(ins[id], upds[id]));
      const movs = lerLS(LS_MOV, []); movs.push(Object.assign({ id: idMov() }, mov));
      gravarLS(LS_INS, ins); gravarLS(LS_MOV, movs);
      return mov;
    }
    const ids = [...new Set(m.itens.map(x => x.insumoId))];
    return comCaminho('insumos + movimentos (' + m.tipo + ')', fs.runTransaction(db, async tx => {
      const ins = {};
      for (const id of ids) { const s = await tx.get(fs.doc(db, 'insumos', id)); if (s.exists()) ins[id] = Object.assign({ id }, s.data()); }
      const { upds, mov } = aplicarMovInsumos(ins, m);
      Object.keys(upds).forEach(id => tx.update(fs.doc(db, 'insumos', id), upds[id]));
      tx.set(fs.doc(fs.collection(db, 'movimentos')), mov);
      return mov;
    }));
  }

  /* Baixa (sinal −1) dos insumos de um pedido pela ficha técnica, ou estorno (+1) — uma única vez.
     Baixa: pedido.estoqueInsumosBaixado = true + movimentos/ins-consumo-{id}. Estorno devolve exatamente o que baixou.
     Insumo sem controlaEstoque é ignorado; sem ficha → aviso (semFicha) no movimento. Falta de estoque nunca bloqueia. */
  function planoConsumo(pedido, fichasM, ins) {
    const c = Ficha.consumoPedido(pedido, fichasM, ins);
    const itens = [], upds = {}, faltas = [];
    Object.keys(c.qtd).forEach(id => {
      const i = ins[id], q = c.qtd[id];
      if (!i || !i.controlaEstoque || !(q > 0)) return;
      const atual = Number(i.estoqueAtual) || 0, custo = Ficha.custoMedio(i);
      if (atual < q) faltas.push(i.nome);
      upds[id] = { estoqueAtual: r5i(atual - q) };
      itens.push({ insumoId: id, nome: i.nome, unidade: i.unidade, qtd: -q, custoUnit: r4(custo), valor: r2(-q * custo), saldoDepois: r5i(atual - q) });
    });
    return { itens, upds, faltas, semFicha: c.semFicha };
  }
  function planoEstornoInsumos(consumo, ins) {
    const itens = [], upds = {};
    ((consumo && consumo.itens) || []).forEach(x => {
      const i = ins[x.insumoId]; if (!i) return;
      const atual = Number(i.estoqueAtual) || 0, q = -x.qtd;
      upds[x.insumoId] = { estoqueAtual: r5i(atual + q) };
      itens.push({ insumoId: x.insumoId, nome: i.nome, unidade: i.unidade, qtd: q, custoUnit: x.custoUnit, valor: r2(q * x.custoUnit), saldoDepois: r5i(atual + q) });
    });
    return { itens, upds };
  }
  const movPedido = (tipo, pedido, pedidoId, itens, extra) => Object.assign({
    tipoItem: 'insumo', tipo, itens, valorTotal: r2(itens.reduce((s, x) => s + x.valor, 0)),
    produtoNome: `Pedido #${pedido.numero || ''}${pedido.consumoInterno ? ' (consumo interno)' : ''}`, pedidoId, pedidoNumero: pedido.numero || null,
    data: pedido.data || hojeISO(), em: Date.now(), usuario: usuario()
  }, pedido.consumoInterno ? { consumoInterno: pedido.consumoInterno.tipo || true } : {}, extra || {});

  async function moverInsumosPedido(id, sinal) {
    await init();
    if (!window.Ficha) return { feito: false, semFicha: [], faltas: [] };
    const pode = p => sinal < 0 ? !p.estoqueInsumosBaixado && p.status !== 'cancelado' : !!p.estoqueInsumosBaixado;
    const marca = sinal < 0 ? { estoqueInsumosBaixado: true } : { estoqueInsumosBaixado: false, estoqueInsumosEstornado: true };
    const idC = 'ins-consumo-' + id, idE = 'ins-estorno-' + id;
    if (modo() === 'demo') {
      const todos = lerTodos(), p = todos[id];
      if (!p || !pode(p)) return { feito: false, semFicha: [], faltas: [] };
      const ins = lerLS(LS_INS, {}), movs = lerLS(LS_MOV, []);
      let r = { semFicha: [], faltas: [] };
      if (sinal < 0) {
        r = planoConsumo(p, lerLS(LS_FIC, {}), ins);
        Object.keys(r.upds).forEach(k => Object.assign(ins[k], r.upds[k]));
        if (r.itens.length || r.semFicha.length) movs.push(Object.assign({ id: idC }, movPedido('consumo', p, id, r.itens, { semFicha: r.semFicha, faltas: r.faltas })));
      } else {
        const e = planoEstornoInsumos(movs.find(m => m.id === idC), ins);
        Object.keys(e.upds).forEach(k => Object.assign(ins[k], e.upds[k]));
        if (e.itens.length) movs.push(Object.assign({ id: idE }, movPedido('estorno', p, id, e.itens)));
      }
      Object.assign(p, marca);
      gravarLS(LS_INS, ins); gravarLS(LS_MOV, movs); gravarTodos(todos);
      return { feito: true, semFicha: r.semFicha, faltas: r.faltas };
    }
    const pedRef = fs.doc(db, 'pedidos', id);
    return comCaminho('pedidos/' + id + ' (insumos)', fs.runTransaction(db, async tx => {
      const ps = await tx.get(pedRef);
      if (!ps.exists()) return { feito: false, semFicha: [], faltas: [] };
      const p = ps.data();
      if (!pode(p)) return { feito: false, semFicha: [], faltas: [] };
      const ins = {}, lerIns = async ids => { for (const k of ids) { const s = await tx.get(fs.doc(db, 'insumos', k)); if (s.exists()) ins[k] = Object.assign({ id: k }, s.data()); } };
      if (sinal < 0) {
        const fichasM = {};
        for (const k of Ficha.fichasDoPedido(p)) { const s = await tx.get(fs.doc(db, 'fichas', k)); if (s.exists()) fichasM[k] = s.data(); }
        const ids = Object.keys(Ficha.consumoPedido(p, fichasM, {}).qtd);
        await lerIns(ids);
        const r = planoConsumo(p, fichasM, ins);
        Object.keys(r.upds).forEach(k => tx.update(fs.doc(db, 'insumos', k), r.upds[k]));
        if (r.itens.length || r.semFicha.length) tx.set(fs.doc(db, 'movimentos', idC), movPedido('consumo', p, id, r.itens, { semFicha: r.semFicha, faltas: r.faltas }));
        tx.update(pedRef, marca);
        return { feito: true, semFicha: r.semFicha, faltas: r.faltas };
      }
      const cs = await tx.get(fs.doc(db, 'movimentos', idC));
      const consumo = cs.exists() ? cs.data() : null;
      await lerIns(((consumo && consumo.itens) || []).map(x => x.insumoId));
      const e = planoEstornoInsumos(consumo, ins);
      Object.keys(e.upds).forEach(k => tx.update(fs.doc(db, 'insumos', k), e.upds[k]));
      if (e.itens.length) tx.set(fs.doc(db, 'movimentos', idE), movPedido('estorno', p, id, e.itens));
      tx.update(pedRef, marca);
      return { feito: true, semFicha: [], faltas: [] };
    }));
  }
  const baixarInsumos = id => moverInsumosPedido(id, -1);
  const estornarInsumos = id => moverInsumosPedido(id, 1);

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
    init, modo, criarPedido, observarPedido, observarPedidosDoDia, observarPedidosFuturos, listarPedidos, ultimoPedidoPorTelefone, buscarCodigo, observarFila, salvarFila, observarDisponibilidade, salvarDisponibilidade, atualizarPedido,
    observarInsumos, observarFichas, salvarInsumo, salvarFicha, mensagemErro, logErro,
    baixarEstoque, estornarEstoque, observarProdutos, salvarProduto, importarProdutos, observarConfig, salvarConfig,
    lancarMovimento, listarMovimentos, login, sair, observarUsuario,
    lancarMovInsumos, baixarInsumos, estornarInsumos
  };
})();
