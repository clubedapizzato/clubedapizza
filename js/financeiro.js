/* =========================================================
   FINANCEIRO / CAIXA — coleções PRIVADAS (só logado)
   fin_config/geral   → contas (caixa/banco/pix) e saldo inicial, categorias, meta, meses fechados
   fin_lancamentos    → entradas, saídas e transferências (manuais ou geradas por pagar/receber/fiado/folha/caixa)
   fin_contas         → contas a pagar e a receber (recorrência, parcelas)
   fin_fiados         → um documento por cliente (telefone), com compras e pagamentos
   fin_funcionarios   → cadastro + dias trabalhados (diaristas)
   fin_folha          → vales, descontos, bônus e folhas geradas
   fin_caixas         → turnos de caixa (abertura, sangria, suprimento, fechamento)
   Modo demonstração: localStorage "cdp_fin_<coleção>". Usa o mesmo app Firebase do js/db.js (não altera o db.js).
   ========================================================= */
window.Fin = (function () {
  const FB = m => `https://www.gstatic.com/firebasejs/10.12.2/firebase-${m}.js`;   // mesma versão do js/db.js
  const COLECOES = ['fin_config', 'fin_lancamentos', 'fin_contas', 'fin_fiados', 'fin_funcionarios', 'fin_folha', 'fin_caixas'];
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
  const chaveLS = col => 'cdp_' + col.replace(/^fin_/, 'fin_');
  const lerLS = col => { try { return JSON.parse(localStorage.getItem(chaveLS(col))) || {}; } catch { return {}; } };
  const gravarLS = (col, v) => { localStorage.setItem(chaveLS(col), JSON.stringify(v)); window.dispatchEvent(new CustomEvent('cdp-local', { detail: chaveLS(col) })); };
  const comCaminho = (caminho, p) => p.catch(e => { if (e && typeof e === 'object') e.caminho = caminho; throw e; });
  const novoId = (pref = 'f') => pref + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // Firestore não aceita undefined
  const limpo = o => JSON.parse(JSON.stringify(o));

  // Assina uma coleção inteira → cb([{ id, ... }])
  async function observar(col, cb, erro) {
    await init();
    if (DB.modo() === 'demo') {
      const h = e => { const k = e.type === 'storage' ? e.key : e.detail; if (!k || k === chaveLS(col)) cb(Object.values(lerLS(col))); };
      window.addEventListener('storage', h); window.addEventListener('cdp-local', h);
      h({ type: 'cdp-local' });
      return () => { window.removeEventListener('storage', h); window.removeEventListener('cdp-local', h); };
    }
    return fs.onSnapshot(fs.collection(db, col), s => cb(s.docs.map(d => Object.assign({}, d.data(), { id: d.id }))),
      e => { DB.logErro(Object.assign(e, { caminho: col })); erro && erro(e); });
  }

  /* Grava várias operações de uma vez (tudo ou nada).
     ops = [{ op: 'set' (mescla) | 'replace' | 'delete', col, id, dados }] */
  async function lote(ops) {
    await init();
    const quem = usuario(), agora = Date.now();
    ops = ops.map(o => o.op === 'delete' ? o : Object.assign({}, o, { dados: limpo(Object.assign({}, o.dados, { atualizadoEm: agora, atualizadoPor: quem })) }));
    if (DB.modo() === 'demo') {
      const mud = {};
      ops.forEach(o => {
        const c = mud[o.col] = mud[o.col] || lerLS(o.col);
        if (o.op === 'delete') delete c[o.id];
        else c[o.id] = Object.assign(o.op === 'replace' ? {} : (c[o.id] || {}), o.dados, { id: o.id });
      });
      Object.keys(mud).forEach(col => gravarLS(col, mud[col]));
      return;
    }
    const b = fs.writeBatch(db);
    ops.forEach(o => {
      const ref = fs.doc(db, o.col, o.id);
      if (o.op === 'delete') b.delete(ref);
      else { const { id: _, ...dados } = o.dados; b.set(ref, dados, o.op === 'replace' ? {} : { merge: true }); }
    });
    await comCaminho(ops.map(o => o.col + '/' + o.id).join(', '), b.commit());
  }
  const salvar = (col, id, dados) => lote([{ op: 'set', col, id, dados }]);
  const substituir = (col, id, dados) => lote([{ op: 'replace', col, id, dados }]);
  const apagar = (col, id) => lote([{ op: 'delete', col, id }]);

  return { init, COLECOES, observar, lote, salvar, substituir, apagar, novoId, usuario };
})();
