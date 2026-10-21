/* =========================================================
   CARDÁPIO + REGRAS DE PREÇO (usado pela loja e pela cozinha)
   ========================================================= */
window.CARDAPIO = {
  tamanhos: [
    { id: 'P', nome: 'Pequena', maxSabores: 1, adicional: 3 },
    { id: 'M', nome: 'Média',   maxSabores: 2, adicional: 5 },
    { id: 'G', nome: 'Grande',  maxSabores: 2, adicional: 7 }
  ],
  nomeAdicional: 'Catupiry / Cheddar',   // só para pedidos antigos (adicional: true)

  // Adicionais da pizza (preço por tamanho). Editáveis na Gestão (produtos tipo 'adicional').
  adicionais: [
    { id: 'adic-catupiry', nome: 'Catupiry', P: 3, M: 5, G: 7 },
    { id: 'adic-cheddar',  nome: 'Cheddar',  P: 3, M: 5, G: 7 }
  ],

  sabores: [
    { nome: 'CALABRESA',                  P: 37, M: 53, G: 70, desc: '' },
    { nome: 'VEGETARIANA',                P: 37, M: 53, G: 70, desc: '' },
    { nome: 'MUSSARELA',                  P: 37, M: 53, G: 70, desc: '' },
    { nome: 'ROMEU E JULIETA',            P: 37, M: 53, G: 70, desc: '' },
    { nome: 'CAIPIRA',                    P: 40, M: 56, G: 73, desc: '' },
    { nome: 'PORTUGUESA',                 P: 40, M: 56, G: 73, desc: '' },
    { nome: 'QUATRO QUEIJOS',             P: 40, M: 56, G: 73, desc: '' },
    { nome: 'CARNE DE SOL C/ BANANA',     P: 45, M: 62, G: 80, desc: '' },
    { nome: 'CARNE DE SOL C/ CHAMPIGNON', P: 45, M: 62, G: 80, desc: '' }
  ],

  // Demais categorias (produtos simples com preço fixo)
  categorias: [
    {
      id: 'refri-grande', nome: 'Refrigerantes 1L / 2L', produtos: [
        { id: 'coca-1l',      nome: 'Coca-Cola 1L',        preco: 11 },
        { id: 'coca-zero-1l', nome: 'Coca-Cola Zero 1L',   preco: 11 },
        { id: 'coca-2l',      nome: 'Coca-Cola 2L',        preco: 18 },
        { id: 'coca-zero-2l', nome: 'Coca-Cola Zero 2L',   preco: 18 },
        { id: 'fanta-2l',     nome: 'Fanta Laranja 2L',    preco: 13 },
        { id: 'kuat-2l',      nome: 'Guaraná Kuat 2L',     preco: 13 }
      ]
    },
    {
      id: 'latas', nome: 'Latas 350ml', produtos: [
        { id: 'lata-coca',      nome: 'Lata Coca-Cola',      preco: 6 },
        { id: 'lata-coca-zero', nome: 'Lata Coca-Cola Zero', preco: 6 },
        { id: 'lata-fanta',     nome: 'Lata Fanta Laranja',  preco: 6 },
        { id: 'lata-kuat',      nome: 'Lata Guaraná Kuat',   preco: 6 }
      ]
    }
  ],

  /* Configuração da loja (no Firestore: config/loja — editável na Gestão).
     Estes valores valem até a configuração carregar. */
  loja: {
    cortesiaSachesPorPizza: 0,   // sachês grátis por pizza (aplicados nos mais baratos)
    taxaMaquininha: 2.5,         // % padrão da maquininha usada no preço sugerido
    // Previsão mostrada ao cliente (minutos)
    preparoBaseMin: 25,          // preparo de um pedido
    porPedidoMin: 5,             // + por pedido na frente
    entregaBaseMin: 10,          // deslocamento fixo da entrega
    porKmMin: 2                  // + por km de distância
  }
};
/* O catálogo do Firestore (js/catalogo.js) substitui sabores/categorias acima.
   Itens com ativo === false continuam no catálogo (pedidos antigos), mas não aparecem à venda. */

/* ---------- regras de preço ---------- */
window.Preco = (function () {
  const C = window.CARDAPIO;
  const tamanho = id => C.tamanhos.find(t => t.id === id);
  const sabor = nome => C.sabores.find(s => s.nome === nome);
  const produto = id => {
    for (const cat of C.categorias) {
      const p = cat.produtos.find(x => x.id === id);
      if (p) return p;
    }
    return null;
  };
  const categoriaDe = id => C.categorias.find(c => c.produtos.some(x => x.id === id)) || null;
  // Sachê = produto da categoria "Sachês" (o item do pedido também guarda sache: true)
  const ehSache = it => it.tipo === 'produto' && (it.sache || ((categoriaDe(it.id) || {}).id === 'saches'));

  const adicional = id => (C.adicionais || []).find(a => a.id === id) || null;
  // Preço de um adicional no tamanho (catálogo atual; se saiu do catálogo, o gravado no pedido)
  const precoAdicional = (a, tam) => { const x = adicional(a.id || a); return x && typeof x[tam] === 'number' ? x[tam] : (a.preco || 0); };

  /* adicionais: lista [{ id, nome, preco }] ou ids; true = pedido antigo ("Catupiry / Cheddar" do tamanho) */
  function pizza(tam, sabores, adicionais) {
    const t = tamanho(tam);
    const precos = (sabores || []).map(n => (sabor(n) || {})[tam]).filter(v => typeof v === 'number');
    if (!t || !precos.length) return 0;
    const regra = (window.CONFIG && CONFIG.meioAMeio) || 'media';
    const base = regra === 'maior'
      ? Math.max(...precos)
      : precos.reduce((a, b) => a + b, 0) / precos.length;
    const extra = Array.isArray(adicionais) ? adicionais.reduce((s, a) => s + precoAdicional(a, tam), 0) : (adicionais ? t.adicional : 0);
    return Math.round((base + extra) * 100) / 100;
  }
  const adicionaisDe = it => it.adicionais || (it.adicional ? true : []);
  // ['Catupiry', 'Cheddar'] (pedido antigo: ['Catupiry / Cheddar'])
  const nomesAdicionais = it => it.adicionais ? it.adicionais.map(a => (adicional(a.id) || a).nome || a.nome) : it.adicional ? [C.nomeAdicional] : [];
  // "sem cebola (Calabresa), sem orégano" — no meio a meio indica a metade
  function textoRetirar(it) {
    const meia = (it.sabores || []).length > 1;
    const cap = n => String(n || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
    return (it.retirar || []).map(r => `sem ${r.ingrediente}${meia && r.sabor ? ` (${cap(r.sabor)})` : ''}`).join(', ');
  }

  // Preço unitário de um item do carrinho (produto que saiu do catálogo usa o preço gravado no pedido)
  function unitario(item) {
    if (item.tipo === 'pizza') return pizza(item.tamanho, item.sabores, adicionaisDe(item));
    const p = produto(item.id);
    return p ? p.preco : (item.preco || 0);
  }

  // "Pizza Grande (G) - CALABRESA" (sem adicionais)
  function descricaoBase(item) {
    const t = tamanho(item.tamanho);
    return `Pizza ${t ? t.nome : item.tamanho} (${item.tamanho}) - ${item.sabores.join(' / ')}`;
  }
  function descricao(item) {
    if (item.tipo === 'pizza') return descricaoBase(item) + nomesAdicionais(item).map(n => ` + ${n}`).join('');
    const p = produto(item.id);
    return p ? p.nome : (item.nome || item.id);
  }

  /* Sachês com cortesia: porPizza grátis por pizza, aplicados nos sachês MAIS BARATOS.
     Retorna { qtd, gratis, valor (cobrado), desconto, gratisPorItem[i] }. */
  function saches(itens, porPizza) {
    itens = itens || [];
    if (porPizza == null) porPizza = (C.loja && C.loja.cortesiaSachesPorPizza) || 0;
    const pizzas = itens.filter(it => it.tipo === 'pizza').reduce((s, it) => s + (it.qtd || 1), 0);
    const unidades = [];
    itens.forEach((it, i) => { if (ehSache(it)) for (let k = 0; k < (it.qtd || 1); k++) unidades.push({ i, preco: unitario(it) }); });
    unidades.sort((a, b) => a.preco - b.preco || a.i - b.i);
    const gratis = Math.min(unidades.length, Math.max(0, porPizza) * pizzas);
    const gratisPorItem = itens.map(() => 0);
    let desconto = 0;
    unidades.slice(0, gratis).forEach(u => { gratisPorItem[u.i]++; desconto += u.preco; });
    const bruto = unidades.reduce((s, u) => s + u.preco, 0);
    const r2 = v => Math.round(v * 100) / 100;
    return { qtd: unidades.length, gratis, valor: r2(bruto - desconto), desconto: r2(desconto), gratisPorItem };
  }
  // "2 Maionese, 1 Ketchup"
  const listaSaches = itens => (itens || []).filter(ehSache).map(it => `${it.qtd} ${descricao(it)}`).join(', ');

  function subtotal(itens, porPizza) {
    const bruto = (itens || []).reduce((s, it) => s + unitario(it) * (it.qtd || 1), 0);
    return Math.round((bruto - saches(itens, porPizza).desconto) * 100) / 100;
  }

  // Distância (km) da pizzaria até o ponto marcado no mapa
  function distanciaKm(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    const [la, lo] = CONFIG.entrega.localLoja;
    const r = d => d * Math.PI / 180;
    const a = Math.sin(r(lat - la) / 2) ** 2 + Math.cos(r(la)) * Math.cos(r(lat)) * Math.sin(r(lng - lo) / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a)) * (CONFIG.entrega.fatorRota || 1);
    return Math.round(km * 10) / 10;
  }

  // Taxa: grátis até kmGratis; depois valorPorKm por km (ou fração) excedente.
  // entrega = { tipo, lat, lng }. Sem localização => null (a combinar).
  function taxa(entrega) {
    if (!entrega || entrega.tipo === 'retirada' || entrega.tipo === 'balcao') return 0;
    const km = distanciaKm(entrega.lat, entrega.lng);
    if (km == null) return null;
    const E = CONFIG.entrega;
    const excedente = Math.max(0, km - (E.kmGratis || 0));
    return Math.max(0, Math.ceil(excedente - 1e-9)) * (E.valorPorKm || 0);
  }

  return { tamanho, sabor, produto, categoriaDe, ehSache, adicional, precoAdicional, pizza, adicionaisDe, nomesAdicionais, textoRetirar, unitario, descricaoBase, descricao, saches, listaSaches, subtotal, taxa, distanciaKm };
})();

/* ---------- margem / preço sugerido (percentuais em %, ex.: 30 = 30%) ---------- */
window.Margem = {
  // precoSugerido = (custo + extras) ÷ (1 − margem − taxa). null se margem + taxa >= 100%
  sugerido(custo, extras, margem, taxa) {
    const div = 1 - (Number(margem) || 0) / 100 - (Number(taxa) || 0) / 100;
    if (div <= 0) return null;
    return Math.round(((Number(custo) || 0) + (Number(extras) || 0)) / div * 100) / 100;
  },
  // Lucro por unidade e margem real (%) com o preço de venda atual
  lucro: (preco, custo, extras, taxa) => (Number(preco) || 0) * (1 - (Number(taxa) || 0) / 100) - (Number(custo) || 0) - (Number(extras) || 0),
  real(preco, custo, extras, taxa) { return preco > 0 ? this.lucro(preco, custo, extras, taxa) / preco * 100 : null; },
  arredondar: (v, passo = 0.05) => Math.ceil(v / passo - 1e-9) * passo
};

/* ---------- equipe (CONFIG.equipe): e-mail → { nome, papel } ---------- */
window.Equipe = {
  de(email) {
    const e = String(email || '').toLowerCase();
    const k = Object.keys(CONFIG.equipe || {}).find(x => x.toLowerCase() === e);
    return k ? Object.assign({ email: k }, CONFIG.equipe[k]) : { email, nome: this.nome(email), papel: 'cozinha' };
  },
  // Nunca mostrar e-mail de login: "cozinha@clubedapizza.com" → "Cozinha"
  nome(n) {
    n = String(n || '');
    if (!n.includes('@')) return n;
    const a = n.split('@')[0].replace(/[._-]+/g, ' ').trim();
    return a.replace(/(^|\s)\S/g, c => c.toUpperCase());
  },
  entregadores: () => Object.keys(CONFIG.equipe || {}).map(k => Object.assign({ email: k }, CONFIG.equipe[k])).filter(x => x.papel === 'entregador')
};

window.dinheiro = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
window.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- status do pedido ---------- */
window.STATUS = {
  // Entrega: novo → producao → pronto → saiu (entregador) → entregue | nao_entregue
  // Retirada / balcão: novo → producao → saiu ("Pronto") → entregue
  fases: tipo => tipo === 'entrega' ? ['novo', 'producao', 'pronto', 'saiu', 'entregue'] : ['novo', 'producao', 'saiu', 'entregue'],
  // Próxima fase pelo botão principal da cozinha
  proximo(status, tipo) { const f = this.fases(tipo), i = f.indexOf(status); return i >= 0 && i < f.length - 1 ? f[i + 1] : null; },
  rotulo(status, tipo) {
    return ({
      novo: 'Recebido',
      producao: 'Em produção',
      pronto: 'Pronto p/ entrega',
      saiu: tipo === 'retirada' ? 'Pronto p/ retirada' : tipo === 'balcao' ? 'Pronto' : 'Saiu para entrega',
      entregue: 'Entregue',
      nao_entregue: 'Não entregue',
      cancelado: 'Cancelado'
    })[status] || status;
  },
  // Mensagem de WhatsApp enviada ao cliente em cada fase
  mensagem(p, status) {
    const loja = CONFIG.loja.nome;
    const n = p.numero;
    const nome = (p.cliente.nome || '').split(' ')[0];
    const ag = p.agendadoPara ? ` 📅 Agendado para *${Horario.formatar(p.agendadoPara)}*.` : '';
    const txt = ({
      novo: `Olá ${nome}! 🍕 Recebemos seu pedido *#${n}* no ${loja}. Total: ${dinheiro(p.total)}.${ag}`,
      producao: `Olá ${nome}! 👨‍🍳 Seu pedido *#${n}* já está em produção no ${loja}.`,
      pronto: `Olá ${nome}! 📦 Seu pedido *#${n}* está pronto e já vai sair para entrega.`,
      saiu: p.entrega.tipo === 'retirada'
        ? `Olá ${nome}! ✅ Seu pedido *#${n}* está pronto para retirada no ${loja}.`
        : `Olá ${nome}! 🛵 Seu pedido *#${n}* saiu para entrega. Já já chega aí!${cobrar(p)}`,
      entregue: `Pedido *#${n}* entregue. Obrigado pela preferência, ${nome}! ❤️ ${loja}`,
      nao_entregue: `Olá ${nome}. Tentamos entregar seu pedido *#${n}*, mas não conseguimos${p.naoEntregue && p.naoEntregue.motivo ? ' (' + p.naoEntregue.motivo.toLowerCase() + ')' : ''}. Por favor, responda esta mensagem para combinarmos. ${loja}`,
      cancelado: `Olá ${nome}. Seu pedido *#${n}* foi cancelado. Qualquer dúvida, fale conosco.`
    })[status];
    // código + link de acompanhamento ficam no histórico do WhatsApp do cliente
    return txt && p.codigo && !['entregue', 'cancelado'].includes(status) ? txt + Rastreio.rodape(p) : txt;
  }
};

/* ---------- código de acompanhamento (ex.: K7P3QX) ---------- */
window.Rastreio = {
  ALFABETO: '23456789ABCDEFGHJKMNPQRSTUVWXYZ',   // sem 0/O, 1/I/L
  gerar() {
    const a = this.ALFABETO, r = new Uint32Array(6);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 1e9; });
    return Array.from(r, x => a[x % a.length]).join('');
  },
  // aceita minúsculas, espaços e hífen: "k7p 3-qx" → "K7P3QX"
  normalizar: t => String(t || '').toUpperCase().replace(/[^0-9A-Z]/g, ''),
  valido(c) { return c.length === 6 && [...c].every(x => this.ALFABETO.includes(x)); },
  link: codigo => `${(CONFIG.loja.site || location.origin).replace(/\/$/, '')}/?codigo=${codigo}`,
  rodape(p) { return `\n\n📦 Acompanhe seu pedido: ${this.link(p.codigo)}\nCódigo: *${p.codigo}*`; }
};

/* ---------- previsão de pronto/entrega mostrada ao cliente ----------
   fila = config/fila { atualizadoEm, ajusteMin, pedidos:[{numero,data,status,criadoEm}] } (publicada pela cozinha)
   Retorna null (esconder) | { agendado } | { aFrente, ini, fim } (entrega) | { aFrente, hora } (retirada) */
window.Previsao = {
  ATIVOS: ['novo', 'producao'],
  calcular(p, fila, agora = Date.now()) {
    if (!p || ['entregue', 'cancelado', 'nao_entregue'].includes(p.status)) return null;
    if (p.agendadoPara && p.status === 'novo') return { agendado: p.agendadoPara };
    if (!fila || !fila.atualizadoEm || agora - fila.atualizadoEm > 10 * 60000) return null;   // cozinha fechada/offline
    const L = Object.assign({ preparoBaseMin: 25, porPedidoMin: 5, entregaBaseMin: 10, porKmMin: 2 }, CARDAPIO.loja);
    const entrega = p.entrega.tipo === 'entrega', min = 60000, ajuste = Number(fila.ajusteMin) || 0;
    const viagem = entrega ? (L.entregaBaseMin + L.porKmMin * (p.entrega.distanciaKm || 0)) * min : 0;
    const aFrente = p.status === 'novo' ? (fila.pedidos || []).filter(x => x.data === p.data && x.numero < p.numero &&   // número é sequencial no dia
      this.ATIVOS.includes(x.status)).length : 0;
    let centro;
    if (p.status === 'novo') centro = agora + (L.preparoBaseMin + L.porPedidoMin * aFrente + ajuste) * min + viagem;
    else if (p.status === 'producao') {   // só o que falta do preparo
      const ini = ((p.historico || []).filter(h => h.status === 'producao').pop() || {}).em || agora;
      centro = agora + Math.max(0, ini + (L.preparoBaseMin + ajuste) * min - agora) + viagem;
    } else if (!entrega) return null;   // retirada já pronta
    else if (p.status === 'pronto') centro = agora + viagem;
    else centro = Math.max(agora, (p.saiuEm || agora) + viagem);   // saiu
    const r5 = t => Math.round(t / (5 * min)) * 5 * min;
    return entrega ? { aFrente, ini: r5(centro - 7 * min), fim: r5(centro + 7 * min) } : { aFrente, hora: r5(centro) };
  }
};

// Lembrete de pagamento na mensagem de "saiu para entrega"
function cobrar(p) {
  const pg = p.pagamento || {};
  if (pg.forma === 'dinheiro') return ` Valor: ${dinheiro(p.total)} em dinheiro${pg.trocoPara ? ` (troco para ${dinheiro(pg.trocoPara)})` : ''}.`;
  if (pg.forma === 'cartao') return ` Valor: ${dinheiro(p.total)} no cartão (levamos a maquininha).`;
  return '';
}

window.linkWhats = function (telefone, texto) {
  let d = String(telefone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto || '')}`;
};

window.isoDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
window.hojeISO = () => isoDe(new Date());

/* ---------- horário de atendimento / agendamento ----------
   Editável na Gestão (config/loja.horario, em tempo real); CONFIG.horario é só o padrão/fallback.
   horario = { semana: [{ aberto, abre, fecha }] (0 = domingo), excecoes: [{ data, aberto, abre, fecha, motivo }],
               fechadoAgora: { data } | null, primeiroAgendamento: '19:00', intervaloAgendamentoMin, alertaAntesMin }
   Fechar depois da meia-noite (ex.: 18:30–00:30): o turno é do dia em que abriu. */
window.Horario = (function () {
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const min = hhmm => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
  const em = (dia, minutos) => { const d = new Date(dia); d.setHours(0, minutos, 0, 0); return d; };
  const diaDe = (agora, i) => new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);

  // Configuração atual (Firestore se carregou; senão CONFIG.horario)
  function config() {
    const b = CONFIG.horario || { dias: [0, 1, 2, 3, 4, 5, 6], abre: '00:00', fecha: '23:59' };
    const h = (window.CARDAPIO && CARDAPIO.loja && CARDAPIO.loja.horario) || {};
    return {
      semana: h.semana && h.semana.length === 7 ? h.semana : DIAS.map((_, d) => ({ aberto: b.dias.includes(d), abre: b.abre, fecha: b.fecha })),
      excecoes: h.excecoes || [],
      fechadoAgora: h.fechadoAgora || null,
      primeiroAgendamento: h.primeiroAgendamento || b.primeiroAgendamento || '19:00',
      intervaloAgendamentoMin: h.intervaloAgendamentoMin || b.intervaloAgendamentoMin || 30,
      alertaAntesMin: h.alertaAntesMin || b.alertaAntesMin || 40
    };
  }

  // Turno de um dia (exceção da data vale mais que a semana): { data, inicio, fim, motivo } ou null
  function turnoDoDia(dia, H = config()) {
    const data = isoDe(dia), ex = H.excecoes.find(e => e.data === data);
    const r = ex || H.semana[dia.getDay()];
    if (!r || !r.aberto || !r.abre || !r.fecha) return null;
    const a = min(r.abre), f = min(r.fecha);
    return { data, inicio: em(dia, a), fim: em(dia, f <= a ? f + 1440 : f), motivo: ex ? ex.motivo || '' : '' };
  }
  // Turno em andamento agora (inclusive o de ontem que passou da meia-noite)
  function turnoAtual(agora = new Date(), H = config()) {
    for (const i of [0, -1]) { const t = turnoDoDia(diaDe(agora, i), H); if (t && agora >= t.inicio && agora < t.fim) return t; }
    return null;
  }
  // Dia de atendimento de um horário (pedido das 00:15 de um turno que abriu ontem é de ontem)
  const dataTurno = (ms = Date.now()) => { const t = turnoAtual(new Date(ms)); return t ? t.data : isoDe(new Date(ms)); };

  // 🔴 "Fechar a loja agora": vale só para o dia de atendimento em que foi ligado
  function emergencia(agora = new Date(), H = config()) {
    return !!(H.fechadoAgora && H.fechadoAgora.data === dataTurno(agora.getTime()));
  }
  function aberto(agora = new Date()) {
    const H = config();
    return !!turnoAtual(agora, H) && !emergencia(agora, H);
  }

  // Turno atual (se aberto) ou o próximo: { data, inicio, fim, aberto }
  function proximoTurno(agora = new Date()) {
    const H = config(), fechado = emergencia(agora, H);
    for (let i = -1; i < 15; i++) {
      const t = turnoDoDia(diaDe(agora, i), H);
      if (!t || agora >= t.fim) continue;
      if (fechado && t.data === H.fechadoAgora.data) continue;   // turno fechado na emergência: só o próximo
      return Object.assign(t, { aberto: agora >= t.inicio });
    }
    return null;
  }

  /* Horários (ms) para agendar, de 30 em 30 min até fecha − 30:
     - loja aberta: os próximos do turno atual;
     - turno que ainda não abriu: a partir do "primeiro horário de agendamento" (19:00);
       se a loja abre depois disso, abertura + 30 min. */
  function horariosAgendamento(agora = new Date()) {
    const t = proximoTurno(agora);
    if (!t) return [];
    const H = config(), passo = H.intervaloAgendamentoMin * 60000, lista = [];
    let x = t.inicio.getTime();
    if (!t.aberto) {
      const prim = em(t.inicio, min(H.primeiroAgendamento)).getTime();
      x = t.inicio.getTime() > prim ? t.inicio.getTime() + passo : prim;
    }
    for (; x + passo <= t.fim.getTime(); x += passo) if (x > agora.getTime()) lista.push(x);
    return lista;
  }

  const hora = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formatar = ms => `${new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora(ms)}`;

  // "hoje", "amanhã" ou o dia da semana
  function quando(ms, agora = new Date()) {
    const d = new Date(ms), dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 864e5);
    return dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : DIAS[d.getDay()];
  }
  // "Abrimos hoje às 18:30" / "Abrimos quinta às 18:30"
  function textoAbertura(agora = new Date()) {
    const t = proximoTurno(agora);
    return t ? `Abrimos ${quando(t.inicio, agora)} às ${hora(t.inicio)}` : '';
  }
  // "Agende para hoje a partir das 19:00"
  function textoAgendar(agora = new Date()) {
    const s = horariosAgendamento(agora);
    return s.length ? `Agende para ${quando(s[0], agora)} a partir das ${hora(s[0])}` : '';
  }
  // "hoje às 20:00" / "sexta (18/10) às 20:00"
  function textoAgendado(ms, agora = new Date()) {
    const q = quando(ms, agora);
    return (q === 'hoje' || q === 'amanhã' ? q : `${q} (${new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`) + ` às ${hora(ms)}`;
  }
  // "Aberto de quinta a terça, das 18:30 às 23:00" (dias com horários diferentes em grupos)
  function resumo(semana = config().semana) {
    const grupos = {};
    semana.forEach((d, i) => { if (d.aberto) (grupos[`${d.abre}|${d.fecha}`] = grupos[`${d.abre}|${d.fecha}`] || []).push(i); });
    const nomes = dias => {
      if (dias.length === 7) return 'todos os dias';
      // sequência circular: começa depois de um dia fora do grupo
      const ini = dias.find(d => !dias.includes((d + 6) % 7));
      const seq = []; for (let d = ini, k = 0; k < dias.length && dias.includes(d); d = (d + 1) % 7, k++) seq.push(d);
      if (seq.length === dias.length && dias.length >= 3) return `de ${DIAS[seq[0]]} a ${DIAS[seq[seq.length - 1]]}`;
      const n = seq.length === dias.length ? seq : dias;
      return n.length === 1 ? DIAS[n[0]] : n.slice(0, -1).map(d => DIAS[d]).join(', ') + ' e ' + DIAS[n[n.length - 1]];
    };
    const partes = Object.entries(grupos).map(([k, dias]) => { const [a, f] = k.split('|'); return `${nomes(dias)}, das ${a} às ${f}`; });
    if (!partes.length) return 'Fechado todos os dias';
    const fechados = semana.map((d, i) => d.aberto ? null : DIAS[i]).filter(Boolean);
    return 'Aberto ' + partes.join('; ') + (fechados.length ? ` (fechado: ${fechados.join(', ')})` : '');
  }
  // Pedido agendado que ainda não deve ir para produção
  const emEspera = (p, agora = Date.now()) => !!p.agendadoPara && p.status === 'novo' && p.agendadoPara - agora > config().alertaAntesMin * 60000;

  return { DIAS, config, turnoDoDia, turnoAtual, dataTurno, emergencia, aberto, proximoTurno, horariosAgendamento, hora, formatar, quando, textoAbertura, textoAgendar, textoAgendado, resumo, emEspera };
})();
