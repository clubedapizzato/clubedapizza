/* =========================================================
   CLIENTES (só leitura dos pedidos) — usado por clientes.html
   - Cliente = telefone normalizado (só dígitos, sem 55)
   - Segmentos estilo RFM, sabores favoritos, fidelidade (simulador)
   ========================================================= */
window.Clientes = (function () {
  const DIA = 864e5;
  const r2 = v => Math.round(v * 100) / 100;
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const chaveTexto = s => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();

  /* "(63) 9 9133-2966", "+55 63 99133 2966", "063991332966" → "63991332966".
     Celular antigo com 10 dígitos (sem o 9) ganha o 9 para juntar com o número novo. '' = sem telefone */
  function normTel(t) {
    let d = String(t || '').replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1);
    if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
    return d.length === 10 || d.length === 11 ? d : '';
  }
  const fmtTel = d => d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d;

  // Fora do faturamento: cancelado e não entregue (pendente), como nos relatórios
  const valido = p => p.status !== 'cancelado' && p.status !== 'nao_entregue';
  const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / DIA);
  const maisUsado = o => { const e = Object.entries(o).sort((a, b) => b[1] - a[1]); return e.length ? e[0][0] : ''; };
  const ehSache = it => it.tipo === 'produto' && (it.sache || it.categoria === 'Sachês' || Preco.ehSache(it));
  const precoItem = it => it.preco != null ? it.preco : Preco.unitario(it);

  const SEGMENTOS = {
    vip: { nome: '⭐ VIP', cor: '#a16207', fundo: '#fef9c3', regra: 'Top 10% em gasto ou 8+ pedidos' },
    frequente: { nome: '🔁 Frequente', cor: '#166534', fundo: '#dcfce7', regra: '3+ pedidos e última compra há até 30 dias' },
    novo: { nome: '🆕 Novo', cor: '#1d4ed8', fundo: '#dbeafe', regra: '1º pedido nos últimos 30 dias' },
    risco: { nome: '⚠️ Em risco', cor: '#c2410c', fundo: '#ffedd5', regra: '2+ pedidos e de 31 a 59 dias sem pedir' },
    inativo: { nome: '💤 Inativo', cor: '#57534e', fundo: '#e7e5e4', regra: '60 dias ou mais sem pedir' },
    ocasional: { nome: '🙂 Ocasional', cor: '#6b21a8', fundo: '#f3e8ff', regra: 'Os demais (ex.: 1–2 pedidos, sem sumir)' }
  };

  function novoCliente(chave) {
    return {
      chave, telefone: chave, nomes: {}, nome: '', pedidos: [], n: 0, cancelados: 0, naoEntregues: 0, total: 0,
      taxas: 0, primeira: null, ultima: null, bairros: {}, bairroNomes: {}, enderecos: {}, formas: {}, tipos: {},
      sabores: {}, saboresValor: {}, tamanhos: {}, adicionais: {}, produtos: {}, saches: {}, pizzas: 0,
      diasSemana: [0, 0, 0, 0, 0, 0, 0], horas: {}, ultimoEm: 0
    };
  }

  // Soma os itens de um pedido válido no cliente (meio a meio = ½ por sabor)
  function somarItens(c, p) {
    (p.itens || []).forEach(it => {
      const q = it.qtd || 1, v = precoItem(it) * q;
      if (it.tipo === 'pizza') {
        const s = it.sabores || [];
        s.forEach(n => { c.sabores[n] = (c.sabores[n] || 0) + q / s.length; c.saboresValor[n] = (c.saboresValor[n] || 0) + v / s.length; });
        c.tamanhos[it.tamanho] = (c.tamanhos[it.tamanho] || 0) + q;
        c.pizzas += q;
        const ad = it.adicionais || (it.adicional ? [{ nome: CARDAPIO.nomeAdicional, preco: (Preco.tamanho(it.tamanho) || {}).adicional || 0 }] : []);
        ad.forEach(a => {
          const n = a.nome || (Preco.adicional(a.id) || {}).nome || a.id;
          const x = c.adicionais[n] = c.adicionais[n] || { qtd: 0, valor: 0 };
          x.qtd += q; x.valor += (a.preco != null ? a.preco : Preco.precoAdicional(a, it.tamanho)) * q;
        });
      } else {
        const n = it.nome || Preco.descricao(it);
        if (ehSache(it)) c.saches[n] = (c.saches[n] || 0) + q;
        else { const x = c.produtos[n] = c.produtos[n] || { qtd: 0, valor: 0 }; x.qtd += q; x.valor += v; }
      }
    });
  }

  /* pedidos → { clientes, balcao, resumo, bairros, saboresGeral, saboresVip }
     hoje = 'AAAA-MM-DD' (dias sem pedir contam até hoje) */
  function analisar(pedidos, hoje = hojeISO()) {
    const mapa = {}, balcao = { pedidos: 0, total: 0, cancelados: 0 };
    let cancelados = 0, valorCancelado = 0, naoEntregues = 0;
    const bairros = {};   // chave → { nome, nomes, clientes:Set, pedidos, total }
    const ordem = pedidos.slice().sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));

    ordem.forEach(p => {
      if (p.status === 'cancelado') { cancelados++; valorCancelado += p.total || 0; }
      if (p.status === 'nao_entregue') naoEntregues++;
      const chave = normTel(p.cliente && p.cliente.telefone);
      if (!chave) {
        if (p.status === 'cancelado') balcao.cancelados++;
        else if (valido(p)) { balcao.pedidos++; balcao.total += p.total || 0; }
        return;
      }
      const c = mapa[chave] = mapa[chave] || novoCliente(chave);
      c.pedidos.push(p);
      const nome = String((p.cliente && p.cliente.nome) || '').trim();
      if (nome) { c.nomes[nome] = (c.nomes[nome] || 0) + 1; if ((p.criadoEm || 0) >= c.ultimoEm) { c.nome = nome; c.ultimoEm = p.criadoEm || 0; } }
      if (p.status === 'cancelado') { c.cancelados++; return; }
      if (p.status === 'nao_entregue') { c.naoEntregues++; return; }

      const total = p.total || 0, e = p.entrega || {};
      c.n++; c.total += total; c.taxas += p.taxaEntrega || 0;
      if (!c.primeira || p.data < c.primeira) c.primeira = p.data;
      if (!c.ultima || p.data > c.ultima) c.ultima = p.data;
      const forma = (p.pagamento && p.pagamento.forma) || '';
      if (forma) c.formas[forma] = (c.formas[forma] || 0) + 1;
      c.tipos[e.tipo || 'entrega'] = (c.tipos[e.tipo || 'entrega'] || 0) + 1;
      if (e.tipo === 'entrega' && e.bairro) {
        const kb = chaveTexto(e.bairro), nb = String(e.bairro).trim();
        c.bairros[kb] = (c.bairros[kb] || 0) + 1;
        c.bairroNomes[kb] = nb;
        const end = `${String(e.rua || '').trim()}, ${String(e.numero || '').trim()} - ${nb}`;
        const ke = chaveTexto(end), x = c.enderecos[ke] = c.enderecos[ke] || { texto: end, n: 0 };   // "centro" = "Centro"
        x.n++; x.texto = end;   // texto mais recente
        const b = bairros[kb] = bairros[kb] || { nomes: {}, clientes: new Set(), pedidos: 0, total: 0 };
        b.nomes[nb] = (b.nomes[nb] || 0) + 1; b.clientes.add(chave); b.pedidos++; b.total += total;
      }
      c.diasSemana[new Date(p.data + 'T12:00').getDay()]++;
      const quando = p.agendadoPara || p.criadoEm;
      if (quando) { const h = new Date(quando).getHours(); c.horas[h] = (c.horas[h] || 0) + 1; }
      somarItens(c, p);
    });

    const clientes = Object.values(mapa).filter(c => c.n > 0);
    clientes.forEach(c => {
      c.pedidos.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
      c.outrosNomes = Object.keys(c.nomes).filter(n => n !== c.nome);
      if (!c.nome) c.nome = '(sem nome)';
      c.ticket = c.total / c.n;
      c.diasSemPedir = diasEntre(c.ultima, hoje);
      c.diasDesdePrimeira = diasEntre(c.primeira, hoje);
      c.freqMedia = c.n > 1 ? diasEntre(c.primeira, c.ultima) / (c.n - 1) : null;
      const kb = maisUsado(c.bairros);
      c.bairro = kb ? c.bairroNomes[kb] : '';
      c.saborFav = maisUsado(c.sabores);
      c.pagamentoFav = maisUsado(c.formas);
      const ds = c.diasSemana.indexOf(Math.max(...c.diasSemana));
      c.diaFav = c.n ? Horario.DIAS[ds] : '';
      const hf = maisUsado(c.horas);
      c.horaFav = hf !== '' ? Number(hf) : null;
    });

    // VIP = top 10% em gasto (pelo menos 1) ou 8+ pedidos
    const porGasto = clientes.slice().sort((a, b) => b.total - a.total);
    const nVip = Math.ceil(porGasto.length * 0.1);
    const topVip = new Set(porGasto.slice(0, nVip).map(c => c.chave));
    clientes.forEach(c => { c.segmento = segmento(c, topVip.has(c.chave)); c.sumido = c.segmento === 'vip' && c.diasSemPedir > 30; });

    // % do faturamento identificado que vem dos 20% melhores clientes
    const fatIdent = clientes.reduce((s, c) => s + c.total, 0);
    const n20 = Math.ceil(porGasto.length * 0.2);
    const fat20 = porGasto.slice(0, n20).reduce((s, c) => s + c.total, 0);
    const nPed = clientes.reduce((s, c) => s + c.n, 0);
    const faturamento = fatIdent + balcao.total;
    const resumo = {
      clientes: clientes.length,
      novos: clientes.filter(c => c.diasDesdePrimeira <= 30).length,
      recorrentes: clientes.filter(c => c.n >= 2).length,
      recompra: clientes.length ? clientes.filter(c => c.n >= 2).length / clientes.length * 100 : null,
      ticket: (nPed + balcao.pedidos) ? faturamento / (nPed + balcao.pedidos) : 0,
      ticketIdent: nPed ? fatIdent / nPed : 0,
      gastoMedio: clientes.length ? fatIdent / clientes.length : 0,
      pctTop20: fatIdent ? fat20 / fatIdent * 100 : null, nTop20: n20,
      faturamento, fatIdent, pedidos: nPed + balcao.pedidos, pedidosIdent: nPed,
      cancelados, valorCancelado, naoEntregues
    };

    const listaBairros = Object.values(bairros).map(b => ({ nome: maisUsado(b.nomes), clientes: b.clientes.size, pedidos: b.pedidos, total: b.total }))
      .sort((a, b) => b.total - a.total);
    const somaSabores = l => { const o = {}; l.forEach(c => Object.entries(c.sabores).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; })); return o; };
    return {
      clientes, balcao, resumo, bairros: listaBairros,
      saboresGeral: somaSabores(clientes), saboresVip: somaSabores(clientes.filter(c => c.segmento === 'vip'))
    };
  }

  function segmento(c, topGasto) {
    if (topGasto || c.n >= 8) return 'vip';
    if (c.diasSemPedir >= 60) return 'inativo';
    if (c.n >= 2 && c.diasSemPedir > 30) return 'risco';
    if (c.n >= 3 && c.diasSemPedir <= 30) return 'frequente';
    if (c.diasDesdePrimeira <= 30) return 'novo';
    return 'ocasional';
  }

  /* ---------------- FIDELIDADE (simulador, controle interno) ----------------
     cfg = { tipo: 'pizzas'|'valor', meta (pizzas), valor (R$), recompensa, inicio ('AAAA-MM-DD' ou '') }
     entregues = [ms, ...] recompensas já entregues a este cliente */
  const FID_PADRAO = { tipo: 'pizzas', meta: 10, valor: 300, recompensa: '1 pizza G grátis', inicio: '' };
  function fidelidade(c, cfg, entregues) {
    cfg = Object.assign({}, FID_PADRAO, cfg || {});
    const ped = c.pedidos.filter(p => valido(p) && (!cfg.inicio || p.data >= cfg.inicio));
    const porPizza = cfg.tipo !== 'valor';
    const meta = porPizza ? Math.max(1, Math.round(Number(cfg.meta) || 10)) : Math.max(1, Number(cfg.valor) || 300);
    const base = porPizza
      ? ped.reduce((s, p) => s + (p.itens || []).filter(it => it.tipo === 'pizza').reduce((a, it) => a + (it.qtd || 1), 0), 0)
      : r2(ped.reduce((s, p) => s + (p.total || 0) - (p.taxaEntrega || 0), 0));   // compras sem a taxa de entrega
    const ganhos = Math.floor(base / meta + 1e-9);
    const nEnt = (entregues || []).length;
    const resto = r2(base - ganhos * meta);
    const falta = r2(meta - resto);
    return {
      porPizza, meta, base, ganhos, entregues: nEnt, disponiveis: Math.max(0, ganhos - nEnt), resto, falta,
      // "Quase lá": faltam 1–2 pizzas (ou até 20% do valor)
      quaseLa: porPizza ? falta <= 2 : falta <= meta * 0.2,
      pct: Math.min(100, resto / meta * 100)
    };
  }

  /* ---------------- MENSAGENS DE WHATSAPP ---------------- */
  const primeiroNome = n => String(n || '').trim().split(/\s+/)[0] || '';
  const fav = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
  function mensagem(c, tipo, f, cfg) {
    const nome = primeiroNome(c.nome), loja = CONFIG.loja.nome, site = CONFIG.loja.site || '';
    const oi = nome && c.nome !== '(sem nome)' ? `Oi, ${nome}!` : 'Oi!';
    const sabor = c.saborFav ? ` A sua preferida é a *${fav(c.saborFav)}* 😋` : '';
    cfg = Object.assign({}, FID_PADRAO, cfg || {});
    if (tipo === 'fidelidade' && f) {
      if (f.disponiveis > 0) return `${oi} 🎉 Você completou ${f.porPizza ? f.meta + ' pizzas' : 'a meta de ' + dinheiro(f.meta) + ' em compras'} no ${loja} e ganhou *${cfg.recompensa}*! É só avisar no próximo pedido que quer usar o prêmio. Obrigado pela preferência ❤️\n${site}`;
      const falta = f.porPizza ? `${f.falta} pizza${f.falta === 1 ? '' : 's'}` : dinheiro(f.falta) + ' em compras';
      return `${oi} 🎁 Faltam só *${falta}* para você ganhar *${cfg.recompensa}* no ${loja}! Bora pedir? 🍕\n${site}`;
    }
    const seg = tipo || c.segmento;
    if (seg === 'risco' || seg === 'inativo' || (seg === 'vip' && c.diasSemPedir > 30))
      return `${oi} Sentimos sua falta no ${loja} 🍕 Já faz ${c.diasSemPedir} dias desde o seu último pedido.${sabor} Que tal matar a saudade hoje? Peça pelo site: ${site}`;
    if (seg === 'vip')
      return `${oi} Passando para agradecer: você é um dos clientes mais especiais do ${loja} ⭐ Obrigado por cada pedido! Quando bater a fome, é só chamar 🍕 ${site}`;
    if (seg === 'novo')
      return `${oi} Obrigado por pedir no ${loja} 🍕 Esperamos que tenha gostado! Qualquer sugestão, responda aqui. Cardápio e pedidos: ${site}`;
    if (seg === 'frequente')
      return `${oi} Obrigado pela preferência de sempre no ${loja} 🔁🍕 Você faz parte da nossa história! Pedidos: ${site}`;
    return `${oi} Aqui é do ${loja} 🍕 Hoje tem pizza quentinha esperando por você!${sabor} Peça pelo site: ${site}`;
  }

  /* ---------------- CSV (separador ;, para planilha/Google Sheets) ---------------- */
  function csv(clientes, extras) {
    const n = v => v == null ? '' : (Number(v) || 0).toFixed(2).replace('.', ',');
    const cel = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const br = iso => iso ? iso.split('-').reverse().join('/') : '';
    const linhas = [['Nome', 'Telefone', 'Outros nomes', 'Bairro', 'Pedidos', 'Total gasto', 'Ticket medio', '1a compra', 'Ultima compra', 'Dias sem pedir',
      'Frequencia media (dias)', 'Sabor favorito', 'Pagamento preferido', 'Segmento', 'Cancelados', 'Fidelidade']];
    clientes.forEach(c => linhas.push([
      c.nome, fmtTel(c.telefone), c.outrosNomes.join(' | '), c.bairro, c.n, n(c.total), n(c.ticket), br(c.primeira), br(c.ultima), c.diasSemPedir,
      c.freqMedia == null ? '' : String(Math.round(c.freqMedia * 10) / 10).replace('.', ','), c.saborFav, c.pagamentoFav, SEGMENTOS[c.segmento].nome.replace(/^\S+\s/, ''),
      c.cancelados, extras ? extras(c) : ''
    ]));
    return '\uFEFF' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  }

  return { normTel, fmtTel, valido, analisar, segmento, SEGMENTOS, FID_PADRAO, fidelidade, mensagem, csv, chaveTexto, diasEntre };
})();
