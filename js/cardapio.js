/* =========================================================
   CARDÁPIO + REGRAS DE PREÇO (usado pela loja e pela cozinha)
   ========================================================= */
window.CARDAPIO = {
  tamanhos: [
    { id: 'P', nome: 'Pequena', maxSabores: 1, adicional: 3 },
    { id: 'M', nome: 'Média',   maxSabores: 2, adicional: 5 },
    { id: 'G', nome: 'Grande',  maxSabores: 2, adicional: 7 }
  ],
  nomeAdicional: 'Catupiry / Cheddar',

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
    taxaMaquininha: 2.5          // % padrão da maquininha usada no preço sugerido
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

  function pizza(tam, sabores, adicional) {
    const t = tamanho(tam);
    const precos = (sabores || []).map(n => (sabor(n) || {})[tam]).filter(v => typeof v === 'number');
    if (!t || !precos.length) return 0;
    const regra = (window.CONFIG && CONFIG.meioAMeio) || 'media';
    const base = regra === 'maior'
      ? Math.max(...precos)
      : precos.reduce((a, b) => a + b, 0) / precos.length;
    return Math.round((base + (adicional ? t.adicional : 0)) * 100) / 100;
  }

  // Preço unitário de um item do carrinho (produto que saiu do catálogo usa o preço gravado no pedido)
  function unitario(item) {
    if (item.tipo === 'pizza') return pizza(item.tamanho, item.sabores, item.adicional);
    const p = produto(item.id);
    return p ? p.preco : (item.preco || 0);
  }

  function descricao(item) {
    if (item.tipo === 'pizza') {
      const t = tamanho(item.tamanho);
      let s = `Pizza ${t ? t.nome : item.tamanho} (${item.tamanho}) - ${item.sabores.join(' / ')}`;
      if (item.adicional) s += ` + ${C.nomeAdicional}`;
      return s;
    }
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

  return { tamanho, sabor, produto, categoriaDe, ehSache, pizza, unitario, descricao, saches, listaSaches, subtotal, taxa, distanciaKm };
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
    return k ? Object.assign({ email: k }, CONFIG.equipe[k]) : { email, nome: email, papel: 'cozinha' };
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
    return ({
      novo: `Olá ${nome}! 🍕 Recebemos seu pedido *#${n}* no ${loja}. Total: ${dinheiro(p.total)}.${ag}`,
      producao: `Olá ${nome}! 👨‍🍳 Seu pedido *#${n}* já está em produção no ${loja}.`,
      pronto: `Olá ${nome}! 📦 Seu pedido *#${n}* está pronto e já vai sair para entrega.`,
      saiu: p.entrega.tipo === 'retirada'
        ? `Olá ${nome}! ✅ Seu pedido *#${n}* está pronto para retirada no ${loja}.`
        : `Olá ${nome}! 🛵 Seu pedido *#${n}* saiu para entrega${p.entregador && p.entregador.nome ? ' com ' + p.entregador.nome.split(' ')[0] : ''}. Já já chega aí!${cobrar(p)}`,
      entregue: `Pedido *#${n}* entregue. Obrigado pela preferência, ${nome}! ❤️ ${loja}`,
      nao_entregue: `Olá ${nome}. Tentamos entregar seu pedido *#${n}*, mas não conseguimos${p.naoEntregue && p.naoEntregue.motivo ? ' (' + p.naoEntregue.motivo.toLowerCase() + ')' : ''}. Por favor, responda esta mensagem para combinarmos. ${loja}`,
      cancelado: `Olá ${nome}. Seu pedido *#${n}* foi cancelado. Qualquer dúvida, fale conosco.`
    })[status];
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

/* ---------- horário de atendimento / agendamento ---------- */
window.Horario = (function () {
  const H = () => CONFIG.horario || { dias: [0, 1, 2, 3, 4, 5, 6], abre: '00:00', fecha: '23:59', intervaloAgendamentoMin: 30, alertaAntesMin: 40 };
  const min = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const em = (dia, hhmm) => { const d = new Date(dia); d.setHours(0, min(hhmm), 0, 0); return d; };

  function aberto(agora = new Date()) {
    const h = H(), m = agora.getHours() * 60 + agora.getMinutes();
    return h.dias.includes(agora.getDay()) && m >= min(h.abre) && m < min(h.fecha);
  }

  // Turno atual (se aberto) ou o próximo: { data, inicio, fim, aberto }
  function proximoTurno(agora = new Date()) {
    const h = H();
    for (let i = 0; i < 8; i++) {
      const dia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
      if (!h.dias.includes(dia.getDay())) continue;
      const inicio = em(dia, h.abre), fim = em(dia, h.fecha);
      if (agora < fim) return { data: isoDe(dia), inicio, fim, aberto: agora >= inicio };
    }
    return null;
  }

  // Horários (ms) para agendar: de 30 em 30 min, do turno atual (só futuros) ou do próximo
  function horariosAgendamento(agora = new Date()) {
    const t = proximoTurno(agora);
    if (!t) return [];
    const passo = (H().intervaloAgendamentoMin || 30) * 60000, lista = [];
    for (let x = t.inicio.getTime(); x + passo <= t.fim.getTime(); x += passo) if (x > agora.getTime()) lista.push(x);
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
    return t ? `Abrimos ${quando(t.inicio, agora)} às ${H().abre}` : '';
  }
  // "hoje às 20:00" / "sexta (18/10) às 20:00"
  function textoAgendado(ms, agora = new Date()) {
    const q = quando(ms, agora);
    return (q === 'hoje' || q === 'amanhã' ? q : `${q} (${new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`) + ` às ${hora(ms)}`;
  }
  // Pedido agendado que ainda não deve ir para produção
  const emEspera = (p, agora = Date.now()) => !!p.agendadoPara && p.status === 'novo' && p.agendadoPara - agora > (H().alertaAntesMin || 40) * 60000;

  return { aberto, proximoTurno, horariosAgendamento, hora, formatar, quando, textoAbertura, textoAgendado, emEspera };
})();
