/* =========================================================
   FIDELIDADE (controle interno) — coleção PRIVADA "fidelidade" (só logado)
   - fidelidade/config      → regra { tipo, meta, valor, recompensa, inicio, atualizadoEm, atualizadoPor }
   - fidelidade/{telefone}  → { entregas: [{ em, por, obs }], atualizadoEm } (telefone = Clientes.normTel)
   Modo demonstração: localStorage "cdp_fidelidade". Usa o mesmo app Firebase do js/db.js (não altera o db.js).
   ========================================================= */
window.Fidelidade = (function () {
  const FB = m => `https://www.gstatic.com/firebasejs/10.12.2/firebase-${m}.js`;   // mesma versão do js/db.js
  const LS = 'cdp_fidelidade';                                                     // "banco" do modo demonstração
  const LEG_CFG = 'cdp_fidelidade_regra', LEG_ENT = 'cdp_fidelidade_entregues';      // versão antiga (só neste aparelho)
  let fs = null, db = null, auth = null;

  async function init() {
    await DB.init();
    if (DB.modo() !== 'firebase' || db) return;
    const appMod = await import(FB('app')), authMod = await import(FB('auth'));
    fs = await import(FB('firestore'));
    db = fs.getFirestore(appMod.getApp());   // mesma instância do db.js
    auth = authMod.getAuth(appMod.getApp());
  }
  const usuario = () => DB.modo() === 'demo' ? 'demo' : (auth && auth.currentUser && auth.currentUser.email) || '';
  const lerLS = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) || padrao; } catch { return padrao; } };
  const gravarLS = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new CustomEvent('cdp-local', { detail: k })); };
  const comCaminho = (caminho, p) => p.catch(e => { if (e && typeof e === 'object') e.caminho = caminho; throw e; });

  // estado = { config: {...} | null, entregas: { telefone: [{ em, por, obs }] } }
  function deDocs(docs) {
    const st = { config: null, entregas: {} };
    docs.forEach(([id, d]) => {
      if (id === 'config') st.config = d;
      else if ((d.entregas || []).length) st.entregas[id] = d.entregas.slice().sort((a, b) => a.em - b.em);
    });
    return st;
  }

  async function observar(cb, erro) {
    await init();
    if (DB.modo() === 'demo') {
      const h = e => { const k = e.type === 'storage' ? e.key : e.detail; if (!k || k === LS) cb(deDocs(Object.entries(lerLS(LS, {})))); };
      window.addEventListener('storage', h); window.addEventListener('cdp-local', h);
      h({ type: 'cdp-local' });
      return () => { window.removeEventListener('storage', h); window.removeEventListener('cdp-local', h); };
    }
    return fs.onSnapshot(fs.collection(db, 'fidelidade'), s => cb(deDocs(s.docs.map(d => [d.id, d.data()]))),
      e => { DB.logErro(Object.assign(e, { caminho: 'fidelidade' })); erro && erro(e); });
  }

  async function salvarConfig(cfg) {
    await init();
    const doc = { tipo: cfg.tipo, meta: Number(cfg.meta) || 10, valor: Number(cfg.valor) || 300, recompensa: cfg.recompensa || '', inicio: cfg.inicio || '',
      atualizadoEm: Date.now(), atualizadoPor: usuario() };
    if (DB.modo() === 'demo') { const o = lerLS(LS, {}); o.config = doc; gravarLS(LS, o); return; }
    await comCaminho('fidelidade/config', fs.setDoc(fs.doc(db, 'fidelidade', 'config'), doc));
  }

  // Acrescenta entregas (sem duplicar pelo "em"); lista = [{ em, por, obs }]
  async function adicionarEntregas(tel, lista) {
    await init();
    if (!/^\d{10,11}$/.test(tel)) throw new Error('Telefone inválido.');
    if (DB.modo() === 'demo') {
      const o = lerLS(LS, {}), d = o[tel] = o[tel] || { entregas: [] };
      lista.forEach(e => { if (!d.entregas.some(x => x.em === e.em)) d.entregas.push(e); });
      d.atualizadoEm = Date.now(); gravarLS(LS, o); return;
    }
    await comCaminho('fidelidade/' + tel, fs.setDoc(fs.doc(db, 'fidelidade', tel), { entregas: fs.arrayUnion(...lista), atualizadoEm: Date.now() }, { merge: true }));
  }
  const marcarEntregue = (tel, obs) => adicionarEntregas(tel, [{ em: Date.now(), por: usuario(), obs: String(obs || '').slice(0, 200) }]);

  // Remove exatamente esta entrega (desfazer)
  async function desfazer(tel, entrega) {
    await init();
    if (DB.modo() === 'demo') {
      const o = lerLS(LS, {}); if (!o[tel]) return;
      o[tel].entregas = o[tel].entregas.filter(x => x.em !== entrega.em);
      if (!o[tel].entregas.length) delete o[tel];
      gravarLS(LS, o); return;
    }
    await comCaminho('fidelidade/' + tel, fs.updateDoc(fs.doc(db, 'fidelidade', tel), { entregas: fs.arrayRemove(entrega), atualizadoEm: Date.now() }));
  }

  /* ---------------- MIGRAÇÃO do localStorage antigo ---------------- */
  // { config | null, entregas: { telefone: [ms] } } ou null se não há nada neste aparelho
  function legado() {
    const config = lerLS(LEG_CFG, null), ent = lerLS(LEG_ENT, {});
    const entregas = {};
    Object.keys(ent || {}).forEach(t => { const l = (ent[t] || []).filter(n => typeof n === 'number'); if (l.length) entregas[t] = l; });
    return config || Object.keys(entregas).length ? { config, entregas } : null;
  }
  const chaveCfg = c => c ? JSON.stringify([c.tipo || 'pizzas', Number(c.meta) || 0, Number(c.valor) || 0, c.recompensa || '', c.inicio || '']) : '';
  // O que falta subir: { config: bool (regra diferente/ausente), novas: { tel: [ms] }, nNovas, temRemoto }
  function pendencias(leg, st) {
    if (!leg) return null;
    const novas = {}; let nNovas = 0;
    Object.entries(leg.entregas).forEach(([t, l]) => {
      const tem = new Set(((st.entregas || {})[t] || []).map(e => e.em));
      const f = l.filter(ms => !tem.has(ms));
      if (f.length) { novas[t] = f; nNovas += f.length; }
    });
    const config = !!leg.config && chaveCfg(leg.config) !== chaveCfg(st.config);
    return { config, novas, nNovas, temRemoto: !!st.config };
  }
  function limparLegado() { try { localStorage.removeItem(LEG_CFG); localStorage.removeItem(LEG_ENT); } catch { } }

  // Envia a regra (se substituirConfig ou o Firebase não tem) e as entregas que faltam; depois limpa o aparelho
  async function migrar(st, substituirConfig) {
    const leg = legado(), p = pendencias(leg, st);
    if (!p) return { config: false, entregas: 0 };
    let config = false;
    if (p.config && (!p.temRemoto || substituirConfig)) {
      await salvarConfig(Object.assign({}, Clientes.FID_PADRAO, leg.config)); config = true;
    }
    const obs = 'migrado do aparelho';
    for (const [t, l] of Object.entries(p.novas)) {
      const tel = Clientes.normTel(t) || t;
      await adicionarEntregas(tel, l.map(em => ({ em, por: usuario(), obs })));
    }
    limparLegado();
    return { config, entregas: p.nNovas };
  }

  return { init, observar, salvarConfig, marcarEntregue, desfazer, legado, pendencias, migrar, limparLegado };
})();
