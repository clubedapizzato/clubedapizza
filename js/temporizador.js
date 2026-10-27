/* =========================================================
   TEMPORIZADOR DOS CARTÕES DA COZINHA (usado só por cozinha.html)
   Prazo = horário MÁXIMO prometido ao cliente:
   - entrega: fim da faixa "entre X e Y" (mesma conta do Previsao.calcular no acompanhamento),
     congelada no momento do pedido (preparo + fila na frente + Movimento +15/+30 + entrega por km)
   - retirada: "pronto por volta de"
   - balcão (comer aqui / levar): só o preparo
   - agendado: o horário marcado (🔵 enquanto não entra na fila)
   ========================================================= */
window.Temporizador = (function () {
  const MIN = 60000, AVISO_MIN = 10;
  const L = () => Object.assign({ preparoBaseMin: 25, porPedidoMin: 5, entregaBaseMin: 10, porKmMin: 2 }, CARDAPIO.loja);
  const r5 = t => Math.round(t / (5 * MIN)) * 5 * MIN;

  // Prazo calculado uma vez e guardado no aparelho: não "anda" quando a fila ou o Movimento mudam depois
  const LS = 'cdp_coz_prazos';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { cache = {}; }
  function gravar() {
    const limite = Date.now() - 3 * 86400000;   // guarda só os últimos dias
    Object.keys(cache).forEach(k => { if (cache[k].em < limite) delete cache[k]; });
    try { localStorage.setItem(LS, JSON.stringify(cache)); } catch (e) { /* sem armazenamento: recalcula */ }
  }

  // Fase do pedido num instante (pelo histórico de status)
  function statusEm(p, t) {
    if (p.criadoEm > t) return null;
    let s = 'novo';
    (p.historico || []).forEach(h => { if (h.em <= t) s = h.status; });
    return s;
  }
  // Início da fase atual
  function inicioFase(p) {
    const h = (p.historico || []).filter(x => x.status === p.status).pop();
    if (h) return h.em;
    if (p.status === 'saiu' && p.saiuEm) return p.saiuEm;
    return p.criadoEm;
  }

  // Previsão que o cliente viu ao fazer o pedido (fila e Movimento daquele momento)
  function calcular(p, pedidos, ajusteMin) {
    const c = L(), e = p.entrega || {};
    if (p.agendadoPara) return p.agendadoPara;
    if (e.tipo === 'balcao') return p.criadoEm + c.preparoBaseMin * MIN;
    const aFrente = pedidos.filter(x => x.data === p.data && x.numero < p.numero && !x.agendadoPara &&
      ['novo', 'producao'].includes(statusEm(x, p.criadoEm))).length;
    const viagem = e.tipo === 'entrega' ? (c.entregaBaseMin + c.porKmMin * (e.distanciaKm || 0)) * MIN : 0;
    const centro = p.criadoEm + (c.preparoBaseMin + c.porPedidoMin * aFrente + (Number(ajusteMin) || 0)) * MIN + viagem;
    return e.tipo === 'entrega' ? r5(centro + 7 * MIN) : r5(centro);
  }
  function prazo(p, pedidos, ajusteMin) {
    if (p.agendadoPara) return p.agendadoPara;   // agendamento pode ser remarcado: sempre o atual
    const k = p.id, x = cache[k];
    if (x && x.criadoEm === p.criadoEm) return x.prazo;
    const v = calcular(p, pedidos, ajusteMin);
    cache[k] = { prazo: v, criadoEm: p.criadoEm, em: Date.now() };
    gravar();
    return v;
  }

  // Início do relógio (para a barra de progresso): pedido feito, ou entrada na fila do agendado
  function inicio(p) {
    if (!p.agendadoPara) return p.criadoEm;
    return Math.max(p.criadoEm, p.agendadoPara - Horario.config().alertaAntesMin * MIN);
  }

  // Meta da fase atual em minutos (null = sem meta)
  function meta(p) {
    const c = L(), e = p.entrega || {};
    if (p.status === 'producao') return c.preparoBaseMin;
    if (p.status === 'saiu' && e.tipo === 'entrega') return Math.round(c.entregaBaseMin + c.porKmMin * (e.distanciaKm || 0));
    return null;
  }
  function nomeFase(p) {
    const e = p.entrega || {};
    if (p.status === 'novo') return 'recebido';
    if (p.status === 'producao') return 'em produção';
    if (p.status === 'pronto') return 'pronto, aguardando entregador';
    if (p.status === 'saiu') return e.tipo === 'entrega' ? 'em rota' : 'pronto, aguardando cliente';
    return p.status;
  }

  const ATIVOS = ['novo', 'producao', 'pronto', 'saiu'];
  const ativo = p => ATIVOS.includes(p.status);

  // 'sched' | 'ok' | 'warn' | 'late'
  function estado(p, prazoMs, agora = Date.now()) {
    if (p.agendadoPara && Horario.emEspera(p, agora)) return 'sched';
    const r = prazoMs - agora;
    return r < 0 ? 'late' : r <= AVISO_MIN * MIN ? 'warn' : 'ok';
  }

  function relogio(ms) {
    const s = Math.floor(Math.abs(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    const mmss = String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    return h ? h + ':' + mmss : mmss;
  }

  // Quando foi entregue (para o resumo do dia)
  function entregueEm(p) {
    const h = (p.historico || []).filter(x => x.status === 'entregue').pop();
    return p.entregueEm || (h && h.em) || null;
  }

  /* Resumo do dia: % entregue no prazo e tempo médio pedido → entregue.
     Fica de fora: agendado (o relógio dele é o horário marcado) e balcão sem preparo (já nasce entregue). */
  function resumoDia(pedidos, prazoDe) {
    const feitos = pedidos.filter(p => p.status === 'entregue' && entregueEm(p) &&
      (p.historico || []).some(h => h.status === 'producao'));
    const noPrazo = feitos.filter(p => entregueEm(p) <= prazoDe(p)).length;
    const medidos = feitos.filter(p => !p.agendadoPara);
    const medio = medidos.length ? medidos.reduce((s, p) => s + (entregueEm(p) - p.criadoEm), 0) / medidos.length : null;
    return { total: feitos.length, noPrazo, pct: feitos.length ? Math.round(noPrazo / feitos.length * 100) : null, medioMin: medio == null ? null : Math.round(medio / MIN) };
  }

  return { MIN, AVISO_MIN, prazo, calcular, inicio, inicioFase, meta, nomeFase, ativo, estado, relogio, entregueEm, resumoDia, statusEm };
})();
