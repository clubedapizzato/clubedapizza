/* =========================================================
   BANCO DE DADOS DOS PEDIDOS
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
  const LS = 'cdp_pedidos';
  const lerTodos = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
  const gravarTodos = o => { localStorage.setItem(LS, JSON.stringify(o)); window.dispatchEvent(new Event('cdp-local')); };
  function ouvirLocal(fn) {
    const h = e => { if (!e.key || e.key === LS) fn(); };
    window.addEventListener('storage', h);
    window.addEventListener('cdp-local', h);
    fn();
    return () => { window.removeEventListener('storage', h); window.removeEventListener('cdp-local', h); };
  }

  /* ---------------- API ---------------- */
  async function criarPedido(pedido) {
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
      const todos = lerTodos();
      todos[id] = Object.assign(pedido, { id, numero });
      gravarTodos(todos);
      return { id, numero };
    }

    const contRef = fs.doc(db, 'contadores', data);
    const pedRef = fs.doc(fs.collection(db, 'pedidos'));
    const numero = await fs.runTransaction(db, async tx => {
      const snap = await tx.get(contRef);
      const n = snap.exists() ? snap.data().n + 1 : 1;
      tx.set(contRef, { n });
      tx.set(pedRef, Object.assign({}, pedido, { numero: n, criadoEmServidor: fs.serverTimestamp() }));
      return n;
    });
    return { id: pedRef.id, numero };
  }

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

  return { init, modo, criarPedido, observarPedido, observarPedidosDoDia, observarPedidosFuturos, listarPedidos, atualizarPedido, login, sair, observarUsuario };
})();
