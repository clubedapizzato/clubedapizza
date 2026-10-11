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
  ]
};

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

  // Preço unitário de um item do carrinho
  function unitario(item) {
    if (item.tipo === 'pizza') return pizza(item.tamanho, item.sabores, item.adicional);
    const p = produto(item.id);
    return p ? p.preco : 0;
  }

  function descricao(item) {
    if (item.tipo === 'pizza') {
      const t = tamanho(item.tamanho);
      let s = `Pizza ${t ? t.nome : item.tamanho} (${item.tamanho}) - ${item.sabores.join(' / ')}`;
      if (item.adicional) s += ` + ${C.nomeAdicional}`;
      return s;
    }
    const p = produto(item.id);
    return p ? p.nome : item.id;
  }

  function subtotal(itens) {
    return (itens || []).reduce((s, it) => s + unitario(it) * (it.qtd || 1), 0);
  }

  function taxa(tipoEntrega) {
    return tipoEntrega === 'retirada' ? 0 : (CONFIG.entrega.taxa || 0);
  }

  return { tamanho, sabor, produto, pizza, unitario, descricao, subtotal, taxa };
})();

window.dinheiro = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
window.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- status do pedido ---------- */
window.STATUS = {
  ordem: ['novo', 'producao', 'saiu', 'entregue'],
  rotulo(status, tipo) {
    return ({
      novo: 'Recebido',
      producao: 'Em produção',
      saiu: tipo === 'retirada' ? 'Pronto p/ retirada' : 'Saiu para entrega',
      entregue: 'Entregue',
      cancelado: 'Cancelado'
    })[status] || status;
  },
  // Mensagem de WhatsApp enviada ao cliente em cada fase
  mensagem(p, status) {
    const loja = CONFIG.loja.nome;
    const n = p.numero;
    const nome = (p.cliente.nome || '').split(' ')[0];
    return ({
      novo: `Olá ${nome}! 🍕 Recebemos seu pedido *#${n}* no ${loja}. Total: ${dinheiro(p.total)}.`,
      producao: `Olá ${nome}! 👨‍🍳 Seu pedido *#${n}* já está em produção no ${loja}.`,
      saiu: p.entrega.tipo === 'retirada'
        ? `Olá ${nome}! ✅ Seu pedido *#${n}* está pronto para retirada no ${loja}.`
        : `Olá ${nome}! 🛵 Seu pedido *#${n}* saiu para entrega. Já já chega aí!`,
      entregue: `Pedido *#${n}* entregue. Obrigado pela preferência, ${nome}! ❤️ ${loja}`,
      cancelado: `Olá ${nome}. Seu pedido *#${n}* foi cancelado. Qualquer dúvida, fale conosco.`
    })[status];
  }
};

window.linkWhats = function (telefone, texto) {
  let d = String(telefone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto || '')}`;
};

window.hojeISO = function () {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
