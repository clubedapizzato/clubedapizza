/* =========================================================
   FINANCEIRO — cálculos (sem tela e sem banco), usado por caixa.html
   Datas sempre 'AAAA-MM-DD'. Valores em R$ (arredondados a centavos).
   Só LÊ os pedidos (nada é gravado neles).
   ========================================================= */
window.FinCalc = (function () {
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const DIA = 864e5;
  const dt = iso => new Date(iso + 'T12:00');
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDias = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const diasEntre = (a, b) => Math.round((dt(b) - dt(a)) / DIA);
  const fimMes = (y, m) => new Date(y, m + 1, 0).getDate();   // m 0-11
  // soma meses mantendo o dia de vencimento (31 → último dia do mês curto)
  function addMeses(s, n, dia) {
    const d = dt(s), y = d.getFullYear(), m = d.getMonth() + n;
    const alvo = new Date(y, m, 1), dd = Math.min(dia || d.getDate(), fimMes(alvo.getFullYear(), alvo.getMonth()));
    return iso(new Date(alvo.getFullYear(), alvo.getMonth(), dd));
  }
  const mesDe = s => String(s || '').slice(0, 7);
  const inicioMes = m => m + '-01';
  const fimDoMes = m => { const [y, mm] = m.split('-').map(Number); return `${m}-${String(fimMes(y, mm - 1)).padStart(2, '0')}`; };
  const addMes = (m, n) => mesDe(addMeses(m + '-01', n, 1));

  /* ---------------- RECORRÊNCIA ---------------- */
  const RECORRENCIAS = {
    unica: 'Única', diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal (15 dias)', mensal: 'Mensal',
    bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual'
  };
  const MESES_REC = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
  // próxima data depois de "s" (dia = dia do vencimento nas mensais)
  function proxima(s, tipo, dia) {
    if (tipo === 'diaria') return addDias(s, 1);
    if (tipo === 'semanal') return addDias(s, 7);
    if (tipo === 'quinzenal') return addDias(s, 15);
    if (MESES_REC[tipo]) return addMeses(s, MESES_REC[tipo], dia);
    return null;
  }
  /* Próxima ocorrência de uma conta recorrente (null se acabou).
     rec = { tipo, dia, ate (data final), parcelas (nº total de vezes), n (esta é a n-ésima) } */
  function proximaOcorrencia(conta) {
    const rec = conta.recorrencia || {};
    if (!rec.tipo || rec.tipo === 'unica' || conta.parcelado) return null;
    const n = (rec.n || 1) + 1;
    if (rec.parcelas && n > rec.parcelas) return null;
    const venc = proxima(conta.vencimento, rec.tipo, rec.dia);
    if (rec.ate && venc > rec.ate) return null;
    return { vencimento: venc, n };
  }
  // Datas futuras (depois de conta.vencimento) até "limite", respeitando fim/parcelas — previsão
  function projetar(conta, limite) {
    const out = []; let c = conta;
    for (let i = 0; i < 1000; i++) {
      const p = proximaOcorrencia(c);
      if (!p || p.vencimento > limite) break;
      out.push(p);
      c = Object.assign({}, c, { vencimento: p.vencimento, recorrencia: Object.assign({}, c.recorrencia, { n: p.n }) });
    }
    return out;
  }
  // Parcelamento: divide o total em N (centavos que sobram vão na 1ª), vencimentos mensais
  function parcelas(total, n, primeiroVenc, tipo = 'mensal') {
    n = Math.max(1, Math.floor(n));
    const cent = Math.round(total * 100), base = Math.floor(cent / n), resto = cent - base * n;
    const dia = Number(primeiroVenc.slice(8, 10));
    const l = []; let v = primeiroVenc;
    for (let i = 1; i <= n; i++) {
      l.push({ n: i, total: n, valor: (base + (i === 1 ? resto : 0)) / 100, vencimento: v });
      v = proxima(v, tipo, dia) || v;
    }
    return l;
  }
  // Situação de uma conta: aberta | vencida | paga | cancelada
  function situacao(c, hoje) {
    if (c.status === 'paga' || c.status === 'cancelada') return c.status;
    return c.vencimento < hoje ? 'vencida' : 'aberta';
  }

  /* ---------------- VENDAS (pedidos → entradas por forma) ---------------- */
  // Venda de verdade: fora cancelado, não entregue e consumo interno (refeição de funcionário, cortesia… não é receita)
  const ativo = p => p.status !== 'cancelado' && p.status !== 'nao_entregue';
  const valido = p => ativo(p) && !p.consumoInterno;
  const ehConsumo = p => ativo(p) && !!p.consumoInterno;
  const FORMAS_VENDA = ['dinheiro', 'pix', 'cartao'];
  /* pedidos → { dias: { data: { dinheiro, pix, cartao, fiado, outros, total, taxaCartao, qtd } }, ... }
     excluirFiado: Set de 'data#numero' de pedidos lançados como fiado (saem da forma original e viram "fiado") */
  function vendasPorDia(pedidos, taxaCartaoPct, excluirFiado) {
    const dias = {};
    (pedidos || []).forEach(p => {
      if (!valido(p) || !p.data) return;
      const d = dias[p.data] = dias[p.data] || { dinheiro: 0, pix: 0, cartao: 0, fiado: 0, outros: 0, total: 0, taxaCartao: 0, qtd: 0, taxasEntrega: 0 };
      const v = Number(p.total) || 0, f = (p.pagamento || {}).forma;
      d.qtd++; d.total += v; d.taxasEntrega += Number(p.taxaEntrega) || 0;
      if (f === 'fiado' || (excluirFiado && excluirFiado.has(p.data + '#' + p.numero))) d.fiado += v;
      else if (FORMAS_VENDA.includes(f)) d[f] += v;
      else d.outros += v;
    });
    Object.values(dias).forEach(d => {
      ['dinheiro', 'pix', 'cartao', 'fiado', 'outros', 'total', 'taxasEntrega'].forEach(k => { d[k] = r2(d[k]); });
      d.taxaCartao = r2(d.cartao * (Number(taxaCartaoPct) || 0) / 100);
    });
    return dias;
  }
  /* Lançamentos "virtuais" das vendas (não gravados): um por dia e forma + a taxa do cartão.
     contas = { dinheiro: idConta, pix, cartao }; desde = só dias >= esta data */
  function lancamentosVendas(dias, contas, desde) {
    const l = [];
    Object.keys(dias).sort().forEach(data => {
      if (desde && data < desde) return;
      const d = dias[data];
      const nomes = { dinheiro: '💵 Dinheiro', pix: '⚡ Pix', cartao: '💳 Cartão', outros: 'Outras formas' };
      ['dinheiro', 'pix', 'cartao', 'outros'].forEach(f => {
        if (!d[f]) return;
        l.push({ id: `venda-${data}-${f}`, virtual: true, origem: 'vendas', tipo: 'entrada', data, valor: d[f], forma: f,
          conta: contas[f] || contas.dinheiro, categoria: 'Vendas balcão/site', descricao: `Vendas do dia — ${nomes[f]}` });
      });
      if (d.taxaCartao) l.push({ id: `venda-${data}-taxa`, virtual: true, origem: 'vendas', tipo: 'saida', data, valor: d.taxaCartao, forma: 'cartao',
        conta: contas.cartao || contas.dinheiro, categoria: 'Taxas bancárias/maquininha', descricao: 'Taxa da maquininha (estimada) sobre vendas no cartão' });
    });
    return l;
  }
  // Pedidos de "data#numero" lançados como fiado (para não contar a venda 2x)
  function chavesFiado(fiados) {
    const s = new Set();
    (fiados || []).forEach(f => (f.movimentos || []).forEach(m => { if (m.tipo === 'compra' && !m.cancelado && m.pedido && m.pedidoData) s.add(m.pedidoData + '#' + m.pedido); }));
    return s;
  }

  /* ---------------- SALDOS ---------------- */
  // Efeito de um lançamento numa conta (+ entra / − sai)
  function efeito(l, contaId) {
    const v = Number(l.valor) || 0;
    if (l.tipo === 'transferencia') return (l.contaDestino === contaId ? v : 0) - (l.conta === contaId ? v : 0);
    if (l.conta !== contaId) return 0;
    return l.tipo === 'entrada' ? v : -v;
  }
  // contas = [{ id, saldoInicial, dataSaldo }]; lanc = todos (manuais + virtuais). Saldo até "ate" (inclusive)
  function saldos(contas, lanc, ate) {
    const o = {};
    contas.forEach(c => {
      let s = Number(c.saldoInicial) || 0;
      lanc.forEach(l => { if ((!c.dataSaldo || l.data >= c.dataSaldo) && (!ate || l.data <= ate)) s += efeito(l, c.id); });
      o[c.id] = r2(s);
    });
    return o;
  }
  // Entradas/saídas reais (sem transferências) entre de e ate
  function totais(lanc, de, ate) {
    let ent = 0, sai = 0;
    lanc.forEach(l => {
      if (l.data < de || l.data > ate || l.tipo === 'transferencia') return;
      if (l.tipo === 'entrada') ent += Number(l.valor) || 0; else sai += Number(l.valor) || 0;
    });
    return { entradas: r2(ent), saidas: r2(sai), resultado: r2(ent - sai) };
  }
  // Fluxo diário: [{ data, entradas, saidas, saldo (acumulado, a partir de saldoAntes) }]
  function fluxo(lanc, de, ate, saldoAntes = 0) {
    const out = []; let s = saldoAntes;
    const por = {};
    lanc.forEach(l => {
      if (l.data < de || l.data > ate || l.tipo === 'transferencia') return;
      const d = por[l.data] = por[l.data] || { e: 0, s: 0 };
      if (l.tipo === 'entrada') d.e += Number(l.valor) || 0; else d.s += Number(l.valor) || 0;
    });
    for (let d = de; d <= ate; d = addDias(d, 1)) {
      const x = por[d] || { e: 0, s: 0 };
      s += x.e - x.s;
      out.push({ data: d, entradas: r2(x.e), saidas: r2(x.s), saldo: r2(s) });
    }
    return out;
  }
  function fluxoMensal(diario) {
    const m = {};
    diario.forEach(d => { const k = mesDe(d.data), x = m[k] = m[k] || { mes: k, entradas: 0, saidas: 0, saldo: 0 }; x.entradas += d.entradas; x.saidas += d.saidas; x.saldo = d.saldo; });
    return Object.values(m).map(x => Object.assign(x, { entradas: r2(x.entradas), saidas: r2(x.saidas), resultado: r2(x.entradas - x.saidas) }));
  }

  /* ---------------- CAIXA DO DIA (turno) ----------------
     Esperado em dinheiro = abertura + vendas em dinheiro do turno
                          + TODAS as entradas − TODAS as saídas da conta "Caixa físico" lançadas DURANTE o turno
     (sangria, suprimento, retirada do dono, despesas, contas pagas, vales, folha, fiado recebido, transferências),
     venha de onde vier (aba Lançamentos, Contas, Fiados, Funcionários ou o próprio Caixa).
     "Durante o turno" = lançamento criado entre a abertura e o fechamento (criadoEm), não a data digitada:
     assim turno que passa da meia-noite e lançamento com data retroativa contam certo.
     Ajustes de fechamento (sobra/quebra e correções) não entram. */
  const ehAjusteCaixa = l => !!l.ajusteCaixa || (l.origem === 'caixa' && /^(Sobra|Quebra) de caixa$/.test(l.categoria || ''));
  function noTurno(l, turno, fim) {
    if (l.virtual || ehAjusteCaixa(l)) return false;
    if (l.criadoEm) return l.criadoEm >= (turno.abertoEm || 0) && l.criadoEm <= (fim || Infinity);
    return l.data === turno.data;   // lançamento antigo sem hora: pela data
  }
  // Linhas que mexem na gaveta durante o turno: [{ id, em, descricao, categoria, valor (+ entra / − sai), l }]
  function linhasTurno(turno, lancs, contaCaixa, fim) {
    return (lancs || []).filter(l => noTurno(l, turno, fim)).map(l => ({ l, v: efeito(l, contaCaixa) })).filter(x => Math.abs(x.v) > 0.004)
      .map(({ l, v }) => ({ id: l.id, em: l.criadoEm || null, data: l.data, descricao: l.descricao || '', categoria: l.categoria || (l.tipo === 'transferencia' ? 'Transferência' : ''),
        origem: l.origem || 'manual', valor: r2(v) }))
      .sort((a, b) => (a.em || 0) - (b.em || 0));
  }
  function esperadoCaixa(turno, vendasDia, lancs, contaCaixa, fim) {
    const linhas = linhasTurno(turno, lancs, contaCaixa, fim);
    const ent = r2(linhas.filter(x => x.valor > 0).reduce((s, x) => s + x.valor, 0)), sai = r2(-linhas.filter(x => x.valor < 0).reduce((s, x) => s + x.valor, 0));
    const v = vendasDia || {};
    const dinheiro = r2((Number(turno.trocoInicial) || 0) + (v.dinheiro || 0) + ent - sai);
    return { abertura: r2(turno.trocoInicial), vendasDinheiro: r2(v.dinheiro), entradasDinheiro: ent, saidasDinheiro: sai, linhas, dinheiro, pix: r2(v.pix), cartao: r2(v.cartao) };
  }
  function diferencas(esperado, contado) {
    const o = {};
    ['dinheiro', 'pix', 'cartao'].forEach(k => { if (contado[k] != null && contado[k] !== '') o[k] = r2(Number(contado[k]) - esperado[k]); });
    return o;
  }

  /* ---------------- FIADOS ---------------- */
  // f.movimentos: [{ tipo: 'compra'|'pagamento', valor, data, vencimento }] → saldo, aberto (FIFO), atraso
  function resumoFiado(f, hoje) {
    const movs = (f.movimentos || []).filter(m => !m.cancelado).slice().sort((a, b) => a.data.localeCompare(b.data) || (a.em || 0) - (b.em || 0));
    const compras = movs.filter(m => m.tipo === 'compra').map(m => Object.assign({}, m, { resta: Number(m.valor) || 0 }));
    let pago = movs.filter(m => m.tipo === 'pagamento').reduce((s, m) => s + (Number(m.valor) || 0), 0);
    const totalCompras = compras.reduce((s, m) => s + m.resta, 0), totalPago = pago;
    compras.forEach(c => { const x = Math.min(c.resta, pago); c.resta = r2(c.resta - x); pago -= x; });
    const abertas = compras.filter(c => c.resta > 0.004);
    const saldo = r2(totalCompras - totalPago);
    const venc = abertas.map(c => c.vencimento || c.data).sort()[0];
    const atraso = venc && venc < hoje ? diasEntre(venc, hoje) : 0;
    const idade = { a30: 0, a60: 0, mais: 0 };
    abertas.forEach(c => { const d = diasEntre(c.data, hoje); if (d <= 30) idade.a30 += c.resta; else if (d <= 60) idade.a60 += c.resta; else idade.mais += c.resta; });
    Object.keys(idade).forEach(k => { idade[k] = r2(idade[k]); });
    const limite = Number(f.limite) || 0;
    return { saldo, totalCompras: r2(totalCompras), totalPago: r2(totalPago), abertas, atraso, vencimento: venc || null, idade,
      limite, disponivel: limite ? r2(limite - saldo) : null, estourado: !!limite && saldo > limite + 0.004 };
  }

  /* ---------------- FOLHA ---------------- */
  const TIPOS_PAG = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', diaria: 'Diária (diarista)' };
  // Período padrão que contém "ref" para o tipo de pagamento
  function periodoFolha(tipo, ref, diaPag) {
    const d = dt(ref), y = d.getFullYear(), m = d.getMonth();
    if (tipo === 'mensal') return [iso(new Date(y, m, 1)), iso(new Date(y, m, fimMes(y, m)))];
    if (tipo === 'quinzenal') return d.getDate() <= 15 ? [iso(new Date(y, m, 1)), iso(new Date(y, m, 15))] : [iso(new Date(y, m, 16)), iso(new Date(y, m, fimMes(y, m)))];
    // semanal / diária: semana que termina no dia de pagamento (0 dom … 6 sáb; padrão sábado)
    const fim = new Date(d); const alvo = diaPag != null && diaPag !== '' ? Number(diaPag) : 6;
    while (fim.getDay() !== alvo) fim.setDate(fim.getDate() + 1);
    const ini = new Date(fim); ini.setDate(ini.getDate() - 6);
    return [iso(ini), iso(fim)];
  }
  // Entregas do funcionário-entregador no período (pedidos entregues por ele)
  function entregasDe(func, pedidos, de, ate) {
    const nomes = [func.entregadorNome, func.entregadorEmail].filter(Boolean).map(s => String(s).toLowerCase().trim());
    if (!nomes.length) return { qtd: 0, taxas: 0 };
    let qtd = 0, taxas = 0;
    (pedidos || []).forEach(p => {
      if (p.status !== 'entregue' || !p.entregador || !p.entrega || p.entrega.tipo !== 'entrega' || p.data < de || p.data > ate) return;
      const e = p.entregador, chaves = [e.nome, e.email].filter(Boolean).map(s => String(s).toLowerCase().trim());
      if (chaves.some(k => nomes.includes(k))) { qtd++; taxas += Number(p.taxaEntrega) || 0; }
    });
    return { qtd, taxas: r2(taxas) };
  }
  /* Folha de um funcionário no período.
     itens = vales/descontos/bônus (fin_folha tipo vale|desconto|bonus) ainda não usados em outra folha */
  function calcularFolha(func, de, ate, itens, pedidos) {
    const valor = Number(func.valor) || 0;
    let base = 0, dias = 0;
    if (func.tipoPagamento === 'diaria') {
      Object.entries(func.dias || {}).forEach(([d, q]) => { if (d >= de && d <= ate) dias += Number(q) || 0; });
      base = valor * dias;
    } else base = valor;
    const ent = entregasDe(func, pedidos, de, ate);
    const comissao = r2(ent.qtd * (Number(func.comissaoEntrega) || 0) + ent.taxas * (Number(func.comissaoTaxaPct) || 0) / 100);
    const doPeriodo = (itens || []).filter(i => ['vale', 'desconto', 'bonus'].includes(i.tipo) && i.funcionarioId === func.id && !i.folhaId && i.data <= ate);
    const soma = t => r2(doPeriodo.filter(i => i.tipo === t).reduce((s, i) => s + (Number(i.valor) || 0), 0));
    const bonus = soma('bonus'), vales = soma('vale'), descontos = soma('desconto');
    const bruto = r2(base + comissao + bonus);
    return { funcionarioId: func.id, nome: func.nome, de, ate, tipoPagamento: func.tipoPagamento, valorBase: valor, dias, base: r2(base),
      entregas: ent.qtd, taxasEntrega: ent.taxas, comissao, bonus, vales, descontos, bruto, liquido: r2(bruto - vales - descontos),
      itensIds: doPeriodo.map(i => i.id) };
  }
  // Estimativa do custo da folha num intervalo (previsão / painel): fixo proporcional ao nº de períodos
  function folhaEstimada(funcs, de, ate) {
    let t = 0;
    (funcs || []).filter(f => f.ativo !== false).forEach(f => {
      const v = Number(f.valor) || 0, dias = diasEntre(de, ate) + 1;
      if (f.tipoPagamento === 'mensal') t += v * dias / 30;
      else if (f.tipoPagamento === 'quinzenal') t += v * dias / 15;
      else if (f.tipoPagamento === 'semanal') t += v * dias / 7;
      else t += v * (Number(f.diasSemana) || 0) * dias / 7;   // diarista: dias por semana previstos
    });
    return r2(t);
  }

  /* ---------------- CONSUMO INTERNO ----------------
     Pedido do balcão com consumoInterno: { tipo, quem, funcionarioId, motivo, descontar, descontarModo } — total cobrado 0,
     valorReferencia = preço de venda. Custo: o gravado no item (ou custoItem(it)); sem custo, o preço de venda de referência. */
  const TIPOS_CONSUMO = {
    funcionario: { nome: 'Funcionário', dre: 'Alimentação de funcionários' }, dono: { nome: 'Dono', dre: 'Consumo do dono (retirada)' },
    cortesia: { nome: 'Cortesia/brinde', dre: 'Cortesias (marketing)' }, degustacao: { nome: 'Degustação', dre: 'Degustação (marketing)' },
    perda: { nome: 'Perda', dre: 'Perdas' }
  };
  function custoConsumo(p, custoItem) {
    let custo = 0, semCusto = 0, venda = 0;
    (p.itens || []).forEach(it => {
      const q = it.qtd || 1, pv = (Number(it.preco) || 0) * q, c = custoItem ? custoItem(it) : (it.custoUnitario != null ? it.custoUnitario + (it.custoExtras || 0) : null);
      venda += pv;
      if (c != null && c > 0) custo += c * q; else { custo += pv; semCusto += pv; }
    });
    return { custo: r2(custo), venda: r2(p.valorReferencia != null ? p.valorReferencia : venda), semCusto: r2(semCusto) };
  }
  // pedidos → { total: { custo, venda, n }, porTipo: { tipo: {...} }, porPessoa: { nome: {...} }, lista }
  function resumoConsumo(pedidos, custoItem) {
    const r = { total: { custo: 0, venda: 0, n: 0, semCusto: 0 }, porTipo: {}, porPessoa: {}, lista: [] };
    const soma = (o, k, c) => { const x = o[k] = o[k] || { custo: 0, venda: 0, n: 0, semCusto: 0 }; x.custo = r2(x.custo + c.custo); x.venda = r2(x.venda + c.venda); x.semCusto = r2(x.semCusto + c.semCusto); x.n++; };
    (pedidos || []).filter(ehConsumo).forEach(p => {
      const c = custoConsumo(p, custoItem), ci = p.consumoInterno;
      soma(r, 'total', c);
      soma(r.porTipo, ci.tipo || 'funcionario', c); soma(r.porPessoa, ci.quem || '—', c);
      r.lista.push(Object.assign({ p }, c));
    });
    return r;
  }

  /* ---------------- CATEGORIAS / DRE ---------------- */
  // grupo: cmv | variavel | fixa | folha | retirada | taxa (saídas) — venda | receita | aporte | fiado (entradas)
  const CATEGORIAS = {
    saida: [
      ['Insumos/ingredientes', 'cmv'], ['Bebidas', 'cmv'], ['Embalagens', 'cmv'], ['Gás', 'variavel'], ['Energia', 'fixa'], ['Água', 'fixa'],
      ['Aluguel', 'fixa'], ['Internet/telefone', 'fixa'], ['Combustível/moto', 'variavel'], ['Manutenção', 'variavel'], ['Marketing', 'variavel'],
      ['Impostos (DAS MEI)', 'fixa'], ['Taxas bancárias/maquininha', 'taxa'], ['Salários', 'folha'], ['Diárias', 'folha'],
      ['Vales/adiantamentos', 'folha'], ['Pró-labore/retirada do dono', 'retirada'], ['Quebra de caixa', 'variavel'], ['Outros', 'variavel']
    ].map(([nome, grupo]) => ({ nome, grupo })),
    entrada: [
      ['Vendas balcão/site', 'venda'], ['Outras receitas', 'receita'], ['Aporte do dono', 'aporte'], ['Recebimento de fiado', 'fiado'], ['Sobra de caixa', 'receita']
    ].map(([nome, grupo]) => ({ nome, grupo }))
  };
  const GRUPOS = { cmv: 'Custo de mercadoria (CMV)', variavel: 'Despesa variável', fixa: 'Despesa fixa', folha: 'Folha', retirada: 'Retirada do dono', taxa: 'Taxa de cartão/banco',
    venda: 'Venda', receita: 'Outra receita', aporte: 'Aporte (não é receita)', fiado: 'Recebimento de fiado (não é receita nova)' };
  function grupoDe(cats, tipo, nome) {
    const c = ((cats || CATEGORIAS)[tipo] || []).find(x => x.nome === nome);
    return c ? c.grupo : (tipo === 'entrada' ? 'receita' : 'variavel');
  }

  /* DRE simplificado (regime misto: vendas pelos pedidos, despesas pelos lançamentos pagos).
     o = { pedidos (do mês), lanc (do mês, manuais+virtuais), cats, taxaCartaoPct, cmvPedidos: { valor, cobertura } | null,
           fiadosSemPedido (R$ vendido fiado sem nº de pedido no mês) } */
  function dre(o) {
    const vendasPed = r2((o.pedidos || []).filter(valido).reduce((s, p) => s + (Number(p.total) || 0), 0));
    const cartao = r2((o.pedidos || []).filter(p => valido(p) && (p.pagamento || {}).forma === 'cartao').reduce((s, p) => s + (Number(p.total) || 0), 0));
    let vendasManuais = 0, outras = 0, aportes = 0, recFiado = 0, taxasBanco = 0, retiradas = 0, comprasCmv = 0;
    const desp = { variavel: {}, fixa: {}, folha: {} };
    (o.lanc || []).forEach(l => {
      if (l.tipo === 'transferencia' || l.virtual) return;
      const g = grupoDe(o.cats, l.tipo, l.categoria), v = Number(l.valor) || 0;
      if (l.tipo === 'entrada') {
        if (g === 'venda') vendasManuais += v; else if (g === 'aporte') aportes += v; else if (g === 'fiado') recFiado += v; else outras += v;
        return;
      }
      if (g === 'cmv') comprasCmv += v;
      else if (g === 'taxa') taxasBanco += v;
      else if (g === 'retirada') retiradas += v;
      else { const b = desp[g] || desp.variavel; b[l.categoria] = (b[l.categoria] || 0) + v; }
    });
    const receita = r2(vendasPed + vendasManuais + (o.fiadosSemPedido || 0));
    const taxaCartao = r2(cartao * (Number(o.taxaCartaoPct) || 0) / 100);
    const taxas = r2(taxaCartao + taxasBanco);
    const receitaLiquida = r2(receita - taxas);
    let cmv = null, cmvFonte = 'nd';
    if (o.cmvPedidos && o.cmvPedidos.valor > 0) { cmv = r2(o.cmvPedidos.valor); cmvFonte = 'pedidos'; }
    else if (comprasCmv > 0) { cmv = r2(comprasCmv); cmvFonte = 'compras'; }
    const margemBruta = r2(receitaLiquida - (cmv || 0));
    const soma = b => r2(Object.values(b).reduce((s, v) => s + v, 0));
    const variaveis = soma(desp.variavel), fixas = soma(desp.fixa), folha = soma(desp.folha);
    // consumo interno (custo): funcionário/cortesia/degustação/perda saem do lucro; o do dono vira retirada
    const consumoDre = {}; let consumoTotal = 0, consumoDono = 0;
    Object.entries((o.consumo && o.consumo.porTipo) || {}).forEach(([t, x]) => {
      if (t === 'dono') { consumoDono += x.custo; return; }
      const n = (TIPOS_CONSUMO[t] || { dre: t }).dre; consumoDre[n] = r2((consumoDre[n] || 0) + x.custo); consumoTotal += x.custo;
    });
    consumoTotal = r2(consumoTotal); consumoDono = r2(consumoDono); retiradas += consumoDono;
    const lucro = r2(margemBruta - consumoTotal - variaveis - fixas - folha + outras);
    return {
      vendasPedidos: vendasPed, vendasManuais: r2(vendasManuais), fiadosSemPedido: r2(o.fiadosSemPedido || 0), receita, cartao, taxaCartao, taxasBanco: r2(taxasBanco), taxas, receitaLiquida,
      cmv, cmvFonte, cmvCobertura: o.cmvPedidos ? o.cmvPedidos.cobertura : null, comprasCmv: r2(comprasCmv), margemBruta,
      despesas: { variavel: desp.variavel, fixa: desp.fixa, folha: desp.folha }, variaveis, fixas, folha, outrasReceitas: r2(outras),
      lucro, margem: receita > 0 ? lucro / receita * 100 : null, retiradas: r2(retiradas), aportes: r2(aportes), recebimentoFiado: r2(recFiado),
      consumo: consumoDre, consumoTotal, consumoDono
    };
  }

  /* Ponto de equilíbrio: custos fixos ÷ margem de contribuição %.
     MC % = (receita − taxas − CMV − variáveis) ÷ receita. pizzas/dia pelo valor médio por pizza. */
  function pontoEquilibrio(d, o) {
    const fixos = r2((o.fixos != null ? o.fixos : d.fixas + d.folha));
    const mc = d.receita > 0 ? (d.receita - d.taxas - (d.cmv || 0) - (d.consumoTotal || 0) - d.variaveis) / d.receita : null;
    const fat = mc && mc > 0 ? r2(fixos / mc) : null;
    const porPizza = o.pizzas > 0 ? d.receita / o.pizzas : null;
    const diasAbertos = o.diasAbertos || 26;
    const pizzasMes = fat != null && porPizza ? fat / porPizza : null;
    return { fixos, mcPct: mc == null ? null : mc * 100, faturamento: fat, porPizza: porPizza == null ? null : r2(porPizza), diasAbertos,
      porDia: fat == null ? null : r2(fat / diasAbertos), pizzasMes: pizzasMes == null ? null : Math.ceil(pizzasMes),
      pizzasDia: pizzasMes == null ? null : Math.ceil(pizzasMes / diasAbertos * 10) / 10,
      atingido: fat == null ? null : d.receita >= fat };
  }

  /* ---------------- PREVISÃO ----------------
     saldo hoje + contas a receber − contas a pagar (abertas + recorrências futuras) − folha estimada (+ média de vendas)
     → { dias: [{ data, entradas, saidas, saldo }], marcos: { 30, 60, 90 }, menor: { data, saldo } } */
  function previsao(o) {
    const hoje = o.hoje, fim = addDias(hoje, o.dias || 90);
    const ev = {};   // data → { e, s }
    const add = (data, v, ent) => { const k = data < hoje ? hoje : data; if (k > fim) return; const x = ev[k] = ev[k] || { e: 0, s: 0 }; if (ent) x.e += v; else x.s += v; };
    (o.contas || []).forEach(c => {
      if (c.status !== 'aberta') return;
      const ent = c.natureza === 'receber', v = Number(c.valor) || 0;
      add(c.vencimento, v, ent);
      projetar(c, fim).forEach(p => add(p.vencimento, v, ent));
    });
    if (o.folhaDia) for (let d = addDias(hoje, 1); d <= fim; d = addDias(d, 1)) add(d, o.folhaDia, false);
    if (o.vendasDia) for (let d = addDias(hoje, 1); d <= fim; d = addDias(d, 1)) add(d, o.vendasDia, true);
    const dias = []; let s = Number(o.saldo) || 0, menor = { data: hoje, saldo: s };
    for (let d = hoje; d <= fim; d = addDias(d, 1)) {
      const x = ev[d] || { e: 0, s: 0 };
      s += x.e - x.s;
      dias.push({ data: d, entradas: r2(x.e), saidas: r2(x.s), saldo: r2(s) });
      if (s < menor.saldo) menor = { data: d, saldo: r2(s) };
    }
    const marco = n => { const ate = dias.slice(0, n + 1), d = ate[ate.length - 1];
      return { data: d.data, saldo: d.saldo, entradas: r2(ate.reduce((a, x) => a + x.entradas, 0)), saidas: r2(ate.reduce((a, x) => a + x.saidas, 0)) }; };
    return { dias, marcos: { 30: marco(30), 60: marco(60), 90: marco(90) }, menor };
  }

  /* ---------------- CSV ---------------- */
  function csv(linhas) {
    const c = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + linhas.map(l => l.map(c).join(';')).join('\n');
  }

  return {
    r2, addDias, addMeses, diasEntre, mesDe, inicioMes, fimDoMes, addMes, RECORRENCIAS, proxima, proximaOcorrencia, projetar, parcelas, situacao,
    valido, ehConsumo, TIPOS_CONSUMO, custoConsumo, resumoConsumo, vendasPorDia, lancamentosVendas, chavesFiado, efeito, saldos, totais, fluxo, fluxoMensal, esperadoCaixa, linhasTurno, noTurno, ehAjusteCaixa, diferencas,
    resumoFiado, TIPOS_PAG, periodoFolha, entregasDe, calcularFolha, folhaEstimada, CATEGORIAS, GRUPOS, grupoDe, dre, pontoEquilibrio, previsao, csv
  };
})();
