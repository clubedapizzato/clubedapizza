/* =========================================================
   CAIXA / FINANCEIRO — tela (caixa.html)
   Cálculos em js/fincalc.js, gravação em js/financeiro.js (coleções fin_*).
   Pedidos: SÓ LEITURA (vendas automáticas, entregas, CMV).
   ========================================================= */
const $ = id => document.getElementById(id);
const F = FinCalc, r2 = F.r2;
const S = { cfg: null, lanc: [], contas: [], fiados: [], funcs: [], folha: [], caixas: [] };
let pedidos = [], pedidosDe = null, lojaCfg = {}, pedErro = null, finErro = null;
let aba = (() => { try { return localStorage.getItem('cdp_caixa_aba') || 'painel'; } catch { return 'painel'; } })();
let relPeriodo = 'mes', filtroConta = { pagar: 'abertas', receber: 'abertas' }, telWhats = '';
const ABAS = [['painel', '🏠 Painel'], ['caixa', '🧾 Caixa do dia'], ['lanc', '📒 Lançamentos'], ['pagar', '📤 A pagar'], ['receber', '📥 A receber'],
  ['fiados', '📝 Fiados'], ['func', '👷 Funcionários'], ['rel', '📈 Relatórios'], ['cfg', '⚙️ Config.']];
const FORMAS = { dinheiro: '💵 Dinheiro', pix: '⚡ Pix', cartao: '💳 Cartão', transferencia: '🏦 Transferência', boleto: '📄 Boleto', outros: 'Outros' };
const ORIGENS = { manual: '', vendas: '🛒 pedidos', conta_pagar: '📤 conta', conta_receber: '📥 conta', fiado: '📝 fiado', folha: '👷 folha', caixa: '🧾 caixa' };
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const br = s => s ? s.split('-').reverse().join('/') : '—';
const brMes = m => { const [y, mm] = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mm) - 1] + '/' + y.slice(2); };
const pct = v => v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const hoje = () => hojeISO();
const diaCaixa = () => { try { return Horario.dataTurno(); } catch { return hojeISO(); } };
const mesAtual = () => F.mesDe(hoje());
// "1.234,56" / "12,5" / "12.5" → número (null se vazio/inválido)
const num = t => { if (typeof t === 'number') return t; const s = String(t == null ? '' : t).trim().replace(/[^\d,.-]/g, ''); if (!s) return null;
  const v = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isNaN(v) ? null : v; };
const sinal = (v, tipo) => `<span class="${tipo === 'entrada' ? 'pos' : tipo === 'saida' ? 'neg' : ''}">${tipo === 'saida' ? '−' : tipo === 'entrada' ? '+' : ''}${dinheiro(v)}</span>`;
const corV = v => `<span class="${v < -0.004 ? 'neg' : v > 0.004 ? 'pos' : ''}">${dinheiro(v)}</span>`;

if (DB.modo() === 'demo') $('avisoDemo').classList.remove('hide');

/* ---------------- CONFIG PADRÃO ---------------- */
function cfgPadrao() {
  const ini = F.inicioMes(mesAtual());
  return {
    contas: [
      { id: 'caixa', nome: '💵 Caixa físico', tipo: 'caixa', saldoInicial: 0, dataSaldo: ini, ativa: true },
      { id: 'banco', nome: '🏦 Banco', tipo: 'banco', saldoInicial: 0, dataSaldo: ini, ativa: true },
      { id: 'pix', nome: '⚡ Pix / conta digital', tipo: 'pix', saldoInicial: 0, dataSaldo: ini, ativa: true }
    ],
    categorias: JSON.parse(JSON.stringify(F.CATEGORIAS)),
    contaVendas: { dinheiro: 'caixa', pix: 'pix', cartao: 'banco' },
    taxaCartao: null, vendasDesde: ini, meta: 0, mesesFechados: []
  };
}
const cfg = () => S.cfg || cfgPadrao();
const contasFin = () => cfg().contas;
const contasAtivas = () => contasFin().filter(c => c.ativa !== false);
const nomeConta = id => (contasFin().find(c => c.id === id) || {}).nome || id || '—';
const contaCaixa = () => (contasFin().find(c => c.tipo === 'caixa') || contasFin()[0] || {}).id;
const cats = tipo => (cfg().categorias || F.CATEGORIAS)[tipo] || [];
const taxaCartao = () => { const t = cfg().taxaCartao; return t != null && t !== '' ? Number(t) : Number((CARDAPIO.loja || {}).taxaMaquininha) || 0; };
const mesFechado = data => (cfg().mesesFechados || []).includes(F.mesDe(data));
function checarMes(...datas) {
  const d = datas.find(x => x && mesFechado(x));
  if (d) throw new Error(`O mês ${brMes(F.mesDe(d))} está fechado. Reabra em ⚙️ Config. → Fechamento mensal.`);
}
const desdeVendas = () => cfg().vendasDesde || F.inicioMes(mesAtual());

/* ---------------- DADOS DERIVADOS ---------------- */
function vendasDias() { return F.vendasPorDia(pedidos, taxaCartao(), F.chavesFiado(S.fiados)); }
let _cache = null;
function todosLanc() {
  if (_cache) return _cache;
  const virt = F.lancamentosVendas(vendasDias(), cfg().contaVendas || {}, desdeVendas());
  _cache = S.lanc.concat(virt);
  return _cache;
}
const invalidar = () => { _cache = null; };
const saldosHoje = () => F.saldos(contasFin(), todosLanc(), hoje());
const saldoTotal = s => r2(contasAtivas().reduce((t, c) => t + (s[c.id] || 0), 0));

/* ---------------- LOGIN / ACESSO ---------------- */
let iniciado = false;
DB.observarUsuario(u => {
  const entregador = !!u && DB.modo() !== 'demo' && Equipe.de(u.email).papel === 'entregador';
  const logado = !!u && !entregador;
  $('login').classList.toggle('hide', !!u);
  $('semAcesso').classList.toggle('hide', !entregador);
  if (entregador) $('semAcessoEmail').textContent = u.email;
  $('painel').classList.toggle('hide', !logado);
  $('ferramentas').classList.toggle('hide', !logado);
  $('btnSair').classList.toggle('hide', !logado || DB.modo() === 'demo');
  if (logado && !iniciado) { iniciado = true; iniciar(); }
});
async function entrar() {
  $('erroLogin').textContent = '';
  try { await DB.login($('email').value.trim(), $('senha').value); }
  catch (e) { $('erroLogin').textContent = 'E-mail ou senha inválidos.'; }
}
$('senha').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });

function iniciar() {
  mostrarAba(aba);
  const mapa = { fin_config: 'cfg', fin_lancamentos: 'lanc', fin_contas: 'contas', fin_fiados: 'fiados', fin_funcionarios: 'funcs', fin_folha: 'folha', fin_caixas: 'caixas' };
  Object.entries(mapa).forEach(([col, k]) => Fin.observar(col, l => {
    finErro = null;
    if (k === 'cfg') { const g = l.find(d => d.id === 'geral'); S.cfg = g ? Object.assign(cfgPadrao(), g) : null; }
    else S[k] = l;
    invalidar(); agendarRender();
  }, e => { finErro = e; agendarRender(); }));
  Catalogo.iniciar(() => { invalidar(); agendarRender(); });   // taxa da maquininha (config/loja) e custos
  Ficha.iniciar(() => agendarRender());
  carregarPedidos();
}
// Pedidos: do início do 6º mês atrás (relatórios) ou da data das vendas, até hoje
async function carregarPedidos(de) {
  const ini = [F.inicioMes(F.addMes(mesAtual(), -5)), desdeVendas(), ...contasFin().map(c => c.dataSaldo).filter(Boolean)].concat(de ? [de] : []).sort()[0];
  try {
    pedidos = await DB.listarPedidos(ini, F.addDias(hoje(), 1));
    pedidosDe = ini; pedErro = null;
    ouvirPedidosHoje();
  } catch (e) { pedErro = e; console.error(e); }
  invalidar(); agendarRender();
}
// Pedidos do turno atual em tempo real (vendas novas, fiado e consumo entram sem recarregar)
let pararHoje = null;
async function ouvirPedidosHoje() {
  if (pararHoje) return;
  const dia = diaCaixa();
  pararHoje = await DB.observarPedidosDoDia(dia, l => {
    pedidos = pedidos.filter(p => p.data !== dia).concat(l);
    invalidar(); agendarRender();
  }, e => { pedErro = e; agendarRender(); });
}
// Antes de usar um período antigo nos relatórios
async function garantirPedidos(de) { if (pedidosDe && de < pedidosDe) await carregarPedidos(de); }

let _t = null;
function agendarRender() { clearTimeout(_t); _t = setTimeout(renderTudo, 30); }
function renderTudo() {
  $('erroFin').innerHTML = finErro ? `<div class="alertas"><div class="al-verm">⚠️ ${esc(DB.mensagemErro(finErro))} Se acabou de atualizar o sistema, publique as regras do Firebase com as coleções <b>fin_*</b>.</div></div>` : '';
  const f = { painel: renderPainel, caixa: renderCaixa, lanc: renderLanc, pagar: () => renderContas('pagar'), receber: () => renderContas('receber'),
    fiados: renderFiados, func: renderFunc, rel: renderRel, cfg: renderCfg }[aba];
  try { f && f(); } catch (e) { console.error(e); }
}
function mostrarAba(a) {
  aba = a;
  try { localStorage.setItem('cdp_caixa_aba', a); } catch { }
  $('abas').innerHTML = ABAS.map(([id, n]) => `<button class="tab ${id === a ? 'on' : ''}" onclick="mostrarAba('${id}')">${n}</button>`).join('');
  ABAS.forEach(([x]) => $('aba-' + x).classList.toggle('hide', x !== a));
  if (a === 'cfg') cfgRascunho = null;
  renderTudo();
}
function erro(e) { DB.logErro(e); toast(DB.mensagemErro(e)); }

/* ================= PAINEL ================= */
function renderPainel() {
  const h = hoje(), m = mesAtual(), L = todosLanc(), s = saldosHoje();
  const kpi = (t, v, sub, cls = '') => `<div class="kpi ${cls}"><small>${t}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  $('kpiSaldos').innerHTML = contasAtivas().map(c => kpi(esc(c.nome), corV(s[c.id] || 0), c.dataSaldo ? `desde ${br(c.dataSaldo)}` : '', (s[c.id] || 0) < 0 ? 'verm' : ''))
    .join('') + kpi('Σ Total', corV(saldoTotal(s)), 'todas as contas', saldoTotal(s) < 0 ? 'verm' : 'verde');
  const th = F.totais(L, h, h), tm = F.totais(L, F.inicioMes(m), F.fimDoMes(m));
  $('kpiMov').innerHTML = kpi('Entradas hoje', `<span class="pos">${dinheiro(th.entradas)}</span>`) + kpi('Saídas hoje', `<span class="neg">${dinheiro(th.saidas)}</span>`) +
    kpi('Entradas do mês', `<span class="pos">${dinheiro(tm.entradas)}</span>`) + kpi('Saídas do mês', `<span class="neg">${dinheiro(tm.saidas)}</span>`) +
    kpi('Resultado do mês (caixa)', corV(tm.resultado), 'entradas − saídas', tm.resultado < 0 ? 'verm' : 'verde');
  const em7 = F.addDias(h, 7);
  const pag = S.contas.filter(c => c.natureza === 'pagar' && c.status === 'aberta'), rec = S.contas.filter(c => c.natureza === 'receber' && c.status === 'aberta');
  const soma = l => r2(l.reduce((t, c) => t + (Number(c.valor) || 0), 0));
  const venc = pag.filter(c => c.vencimento < h), deHoje = pag.filter(c => c.vencimento === h), sete = pag.filter(c => c.vencimento > h && c.vencimento <= em7);
  const fi = S.fiados.map(f => Object.assign({ f }, F.resumoFiado(f, h))).filter(x => x.saldo > 0.004);
  const folhasAb = S.folha.filter(x => x.tipo === 'folha' && x.status === 'aberta');
  const [pde, pate] = [F.inicioMes(m), F.fimDoMes(m)];
  $('kpiComp').innerHTML =
    kpi('📤 Vencidas', `${dinheiro(soma(venc))}`, `${venc.length} conta(s) a pagar`, venc.length ? 'verm' : '') +
    kpi('📤 Vencem hoje', dinheiro(soma(deHoje)), `${deHoje.length} conta(s)`, deHoje.length ? 'amar' : '') +
    kpi('📤 Próximos 7 dias', dinheiro(soma(sete)), `${sete.length} conta(s)`) +
    kpi('📥 A receber', dinheiro(soma(rec)), `${rec.filter(c => c.vencimento < h).length} vencida(s)`) +
    kpi('📝 Fiado em aberto', dinheiro(fi.reduce((t, x) => t + x.saldo, 0)), `${fi.length} cliente(s) • ${fi.filter(x => x.atraso > 0).length} em atraso`, fi.some(x => x.atraso > 30) ? 'amar' : '') +
    kpi('👷 Folha a pagar', dinheiro(folhasAb.reduce((t, x) => t + (x.liquido || 0), 0)), `${folhasAb.length} folha(s) gerada(s) • estimado no mês ${dinheiro(F.folhaEstimada(S.funcs, pde, pate))}`, folhasAb.length ? 'amar' : '');
  // meta
  const vm = Object.entries(vendasDias()).filter(([d]) => F.mesDe(d) === m).reduce((t, [, v]) => t + v.total, 0);
  const meta = Number(cfg().meta) || 0;
  $('cardMeta').innerHTML = meta ? `<h3>🎯 Meta de faturamento — ${brMes(m)}</h3><div class="linha"><span>${dinheiro(vm)} de ${dinheiro(meta)}</span><b>${pct(vm / meta * 100)}</b></div>
    <div class="meta"><i style="width:${Math.min(100, vm / meta * 100).toFixed(1)}%"></i></div>
    <div class="muted" style="margin-top:4px">${vm >= meta ? '✅ Meta batida!' : `Faltam ${dinheiro(meta - vm)} • ${diasRestantes()} dia(s) de atendimento restantes → ${dinheiro((meta - vm) / Math.max(1, diasRestantes()))} por dia`}</div>`
    : `<div class="muted">🎯 Defina uma meta de faturamento mensal em ⚙️ Config. para acompanhar o progresso. Vendas do mês: <b>${dinheiro(vm)}</b>.</div>`;
  $('statusPed').textContent = pedErro ? '⚠️ Não foi possível ler os pedidos (vendas automáticas indisponíveis).' : `Vendas lidas dos pedidos desde ${br(pedidosDe)} • ${pedidos.length} pedido(s).`;
  $('alertas').innerHTML = alertas().map(([c, t]) => `<div class="al-${c}">${t}</div>`).join('');
}
function diasAbertosMes(m, aPartirDe) {
  let n = 0;
  for (let d = F.inicioMes(m); d <= F.fimDoMes(m); d = F.addDias(d, 1)) {
    if (aPartirDe && d < aPartirDe) continue;
    let ab; try { ab = !!Horario.turnoDoDia(new Date(d + 'T12:00')); } catch { ab = (CONFIG.horario.dias || []).includes(new Date(d + 'T12:00').getDay()); }
    if (ab) n++;
  }
  return n;
}
const diasRestantes = () => diasAbertosMes(mesAtual(), hoje());
function alertas() {
  const h = hoje(), a = [];
  if (!S.cfg) a.push(['azul', '👋 Primeiro acesso: confira em <a href="#" onclick="mostrarAba(\'cfg\');return false">⚙️ Config.</a> as contas (caixa/banco/pix), o <b>saldo inicial</b> e a data de importação das vendas, e salve.']);
  const pag = S.contas.filter(c => c.natureza === 'pagar' && c.status === 'aberta');
  const v = pag.filter(c => c.vencimento < h), hj = pag.filter(c => c.vencimento === h);
  if (v.length) a.push(['verm', `🔴 <b>${v.length} conta(s) a pagar vencida(s)</b>: ${v.slice(0, 4).map(c => `${esc(c.descricao)} (${dinheiro(c.valor)}, ${br(c.vencimento)})`).join(', ')}${v.length > 4 ? '…' : ''} <a href="#" onclick="filtroConta.pagar='vencidas';mostrarAba('pagar');return false">ver</a>`]);
  if (hj.length) a.push(['amar', `🟡 <b>Vence hoje:</b> ${hj.map(c => `${esc(c.descricao)} ${dinheiro(c.valor)}`).join(', ')}`]);
  const rv = S.contas.filter(c => c.natureza === 'receber' && c.status === 'aberta' && c.vencimento < h);
  if (rv.length) a.push(['amar', `📥 ${rv.length} conta(s) a receber atrasada(s): ${dinheiro(rv.reduce((t, c) => t + c.valor, 0))}`]);
  const ab = S.caixas.filter(c => c.status === 'aberto' && c.data < diaCaixa());
  if (ab.length) a.push(['verm', `🧾 Caixa de ${br(ab[0].data)} ainda está <b>aberto</b>. <a href="#" onclick="mostrarAba('caixa');return false">Fechar</a>`]);
  const s = saldosHoje();
  contasAtivas().forEach(c => { if ((s[c.id] || 0) < -0.004) a.push(['verm', `⚠️ Saldo negativo em ${esc(c.nome)}: ${dinheiro(s[c.id])} — confira o saldo inicial e os lançamentos.`]); });
  const est = S.fiados.map(f => Object.assign({ f }, F.resumoFiado(f, h))).filter(x => x.estourado);
  if (est.length) a.push(['amar', `📝 Fiado acima do limite: ${est.map(x => `${esc(x.f.nome)} (${dinheiro(x.saldo)} / ${dinheiro(x.limite)})`).join(', ')}`]);
  const dup = duplicidades();
  if (dup.length) a.push(['amar', `⚠️ Possível venda em dobro: há lançamento manual de venda em dia já importado dos pedidos (${dup.slice(0, 5).map(br).join(', ')}). <a href="#" onclick="mostrarAba('lanc');return false">conferir</a>`]);
  // retiradas x lucro (mês)
  const d = dreMes(mesAtual());
  if (d.retiradas > 0 && d.retiradas > Math.max(0, d.lucro)) a.push(['verm', `💸 Retiradas do dono no mês (${dinheiro(d.retiradas)}) já passaram do lucro (${dinheiro(d.lucro)}): o dinheiro está saindo do caixa da empresa.`]);
  const ant = F.addMes(mesAtual(), -1);
  if (S.cfg && new Date().getDate() >= 5 && !(cfg().mesesFechados || []).includes(ant) && S.lanc.some(l => F.mesDe(l.data) === ant))
    a.push(['azul', `🔒 ${brMes(ant)} ainda não foi fechado. Confira e feche em ⚙️ Config. → Fechamento mensal.`]);
  return a;
}
// Dias com venda manual + vendas importadas
function duplicidades() {
  const vd = vendasDias(), desde = desdeVendas();
  return [...new Set(S.lanc.filter(l => l.tipo === 'entrada' && F.grupoDe(cfg().categorias, 'entrada', l.categoria) === 'venda' && l.data >= desde && vd[l.data]).map(l => l.data))].sort();
}

/* ================= FORMULÁRIO GENÉRICO ================= */
/* campos: [{ k, l, t: text|number|date|select|textarea|check|month, v, op: [[valor, rótulo]], w2, ph, on }] */
let _form = null;
function abrirForm(titulo, campos, salvar, o = {}) {
  _form = { campos, salvar, o };
  $('formTitulo').textContent = titulo;
  $('formTopo').innerHTML = o.topo || '';
  $('formExtra').innerHTML = '';
  $('formOk').textContent = o.ok || 'Salvar';
  $('formCampos').innerHTML = campos.map(c => {
    const id = 'ff_' + c.k, v = c.v == null ? '' : c.v, on = c.on ? ` oninput="${c.on}" onchange="${c.on}"` : '';
    if (c.t === 'html') return `<div class="w2">${c.html}</div>`;
    if (c.t === 'check') return `<label class="chk ${c.w2 ? 'w2' : ''}"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}${on}> ${c.l}</label>`;
    let inp;
    if (c.t === 'select') inp = `<select id="${id}"${on}>${c.op.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(v) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
    else if (c.t === 'textarea') inp = `<textarea id="${id}" placeholder="${esc(c.ph || '')}"${on}>${esc(v)}</textarea>`;
    else inp = `<input id="${id}" type="${c.t === 'number' ? 'text' : (c.t || 'text')}" ${c.t === 'number' ? 'inputmode="decimal"' : ''} value="${esc(c.t === 'number' && v !== '' ? String(v).replace('.', ',') : v)}" placeholder="${esc(c.ph || '')}" ${c.list ? `list="${c.list}"` : ''}${on}>`;
    return `<div class="${c.w2 ? 'w2' : ''} ${c.oculto ? 'hide' : ''}" id="box_${c.k}"><label for="${id}">${c.l}</label>${inp}</div>`;
  }).join('') + (o.datalist || '');
  $('formOk').onclick = enviarForm;
  $('mForm').classList.add('on');
  if (o.aoAbrir) o.aoAbrir();
  const p = $('formCampos').querySelector('input:not([type=checkbox]),select,textarea'); p && setTimeout(() => p.focus(), 50);
}
function valoresForm() {
  const v = {};
  _form.campos.forEach(c => {
    const el = $('ff_' + c.k); if (!el) return;
    v[c.k] = c.t === 'check' ? el.checked : c.t === 'number' ? num(el.value) : el.value.trim();
  });
  return v;
}
async function enviarForm() {
  const b = $('formOk'); if (b.disabled) return;
  b.disabled = true;
  try { const r = await _form.salvar(valoresForm()); if (r !== false) fecharForm(); }
  catch (e) { erro(e); }
  finally { b.disabled = false; }
}
function fecharForm() { $('mForm').classList.remove('on'); _form = null; }
function fechar(id) { $(id).classList.remove('on'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('mForm').classList.contains('on')) fecharForm(); else ['mWhats', 'mVer'].forEach(fechar); } });
// Escolha entre botões → Promise com o valor (null = cancelou)
function escolher(titulo, texto, opcoes) {
  return new Promise(res => {
    escolher.res = v => { fechar('mVer'); res(v); };
    $('verBox').innerHTML = `<h2>${titulo}</h2><div class="muted" style="margin-bottom:12px">${texto}</div>
      <div style="display:grid;gap:8px">${opcoes.map(([v, n, cls]) => `<button class="btn ${cls || 'sec'}" onclick='escolher.res(${JSON.stringify(v)})'>${n}</button>`).join('')}
      <button class="btn sec" onclick="escolher.res(null)">Voltar</button></div>`;
    $('mVer').classList.add('on');
  });
}
const exigir = (cond, msg) => { if (!cond) { toast(msg); return false; } return true; };
const opContas = (vazio) => (vazio ? [['', vazio]] : []).concat(contasAtivas().map(c => [c.id, c.nome]));
const opCats = tipo => cats(tipo).map(c => [c.nome, c.nome]);
const opFormas = () => Object.entries(FORMAS);

/* ================= CAIXA DO DIA ================= */
const turnoAberto = () => S.caixas.filter(c => c.status === 'aberto').sort((a, b) => b.data.localeCompare(a.data))[0] || null;
function esperadoDe(t) {
  const lancDia = S.lanc.filter(l => l.data === t.data);
  return F.esperadoCaixa(t, vendasDias()[t.data] || {}, lancDia, contaCaixa());
}
function renderCaixa() {
  const t = turnoAberto(), dc = diaCaixa();
  if (!t) {
    const ult = S.caixas.filter(c => c.status === 'fechado').sort((a, b) => b.fechadoEm - a.fechadoEm)[0];
    $('turno').innerHTML = `<h2>🧾 Caixa do dia — ${br(dc)}</h2><div class="muted">Nenhum caixa aberto.${ult ? ` Último fechamento: ${br(ult.data)} (contado em dinheiro ${dinheiro((ult.contado || {}).dinheiro)}).` : ''}</div>
      <button class="btn" style="margin-top:12px" onclick="abrirCaixa()">🔓 Abrir caixa</button>`;
  } else {
    const e = esperadoDe(t), v = vendasDias()[t.data] || {};
    const lin = (n, val, cls = '') => `<div class="linha ${cls}"><span>${n}</span><b>${val}</b></div>`;
    $('turno').innerHTML = `<div class="barraTopo"><h2>🧾 Caixa aberto — ${br(t.data)}</h2>
      <div class="acoes"><button class="btn sm sec" onclick="movCaixa('suprimento')">➕ Suprimento</button><button class="btn sm sec" onclick="movCaixa('sangria')">➖ Sangria</button>
      <button class="btn sm dark" onclick="fecharCaixa()">🔒 Fechar caixa</button></div></div>
      <div class="muted">Aberto por ${esc(t.abertoPor || '—')} às ${new Date(t.abertoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${t.data !== dc ? ` • <b style="color:#b91c1c">turno de outro dia — feche este caixa</b>` : ''}</div>
      <div class="grade" style="margin-top:10px"><div>
        <h3>💵 Dinheiro na gaveta (esperado)</h3>
        ${lin('Troco inicial', dinheiro(e.abertura))}${lin('+ Vendas em dinheiro', dinheiro(e.vendasDinheiro))}${lin('+ Suprimentos', dinheiro(e.suprimentos))}
        ${lin('− Sangrias', dinheiro(e.sangrias))}${e.entradasDinheiro ? lin('+ Outras entradas no caixa', dinheiro(e.entradasDinheiro)) : ''}${lin('− Saídas pagas do caixa', dinheiro(e.saidasDinheiro))}
        ${lin('= Esperado na gaveta', dinheiro(e.dinheiro), 'total')}
      </div><div>
        <h3>🛒 Vendas do turno (${v.qtd || 0} pedido(s))</h3>
        ${lin('💵 Dinheiro', dinheiro(v.dinheiro))}${lin('⚡ Pix', dinheiro(v.pix))}${lin('💳 Cartão', dinheiro(v.cartao))}${v.fiado ? lin('📝 Fiado', dinheiro(v.fiado)) : ''}${v.outros ? lin('Outras', dinheiro(v.outros)) : ''}
        ${lin('Total', dinheiro(v.total), 'total')}<div class="muted">Taxa estimada da maquininha: ${dinheiro(v.taxaCartao)} (${pct(taxaCartao())})</div>
      </div></div>
      <h3 style="margin-top:12px">Movimentos do caixa</h3>
      ${(t.movimentos || []).length ? `<table>${t.movimentos.map(m => `<tr><td>${new Date(m.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td><td>${m.tipo === 'sangria' ? '➖ Sangria' : '➕ Suprimento'}</td>
        <td>${esc(m.motivo || '')} <span class="muted">${m.tipo === 'sangria' ? '→' : '←'} ${esc(m.destino === 'retirada' ? 'Retirada do dono' : m.destino === 'aporte' ? 'Aporte do dono' : nomeConta(m.destino))}</span></td>
        <td class="r">${sinal(m.valor, m.tipo === 'sangria' ? 'saida' : 'entrada')}</td></tr>`).join('')}</table>` : '<div class="vazio">Nenhuma sangria ou suprimento.</div>'}`;
  }
  const h = S.caixas.filter(c => c.status === 'fechado').sort((a, b) => b.data.localeCompare(a.data) || b.fechadoEm - a.fechadoEm);
  $('histCaixa').innerHTML = h.length ? `<table><tr><th>Dia</th><th>Fechado por</th><th class="r">Abertura</th><th class="r">Esperado 💵</th><th class="r">Contado 💵</th><th class="r">Diferença 💵</th><th class="r">Pix</th><th class="r">Cartão</th><th>Justificativa</th></tr>
    ${h.map(c => { const d = c.diferencas || {};
      return `<tr><td>${br(c.data)}</td><td>${esc(c.fechadoPor || '')}<div class="muted">${new Date(c.fechadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div></td>
      <td class="r">${dinheiro(c.trocoInicial)}</td><td class="r">${dinheiro((c.esperado || {}).dinheiro)}</td><td class="r">${dinheiro((c.contado || {}).dinheiro)}</td>
      <td class="r">${difTxt(d.dinheiro)}</td><td class="r">${difTxt(d.pix)}</td><td class="r">${difTxt(d.cartao)}</td><td>${esc(c.justificativa || '')}</td></tr>`; }).join('')}</table>`
    : '<div class="vazio">Nenhum caixa fechado ainda.</div>';
}
const difTxt = d => d == null ? '—' : Math.abs(d) < 0.005 ? '<span class="tag verde">ok</span>' : d > 0 ? `<span class="pos">sobra ${dinheiro(d)}</span>` : `<span class="neg">falta ${dinheiro(-d)}</span>`;
function abrirCaixa() {
  const ult = S.caixas.filter(c => c.status === 'fechado').sort((a, b) => b.fechadoEm - a.fechadoEm)[0];
  abrirForm('🔓 Abrir caixa', [
    { k: 'data', l: 'Dia do turno', t: 'date', v: diaCaixa() },
    { k: 'troco', l: 'Troco inicial na gaveta (R$)', t: 'number', v: ult && ult.ficouNaGaveta != null ? ult.ficouNaGaveta : '' },
    { k: 'obs', l: 'Observação', w2: true }
  ], async v => {
    if (!exigir(v.troco != null && v.troco >= 0, 'Informe o troco inicial (0 se não tiver).') || !exigir(v.data, 'Informe o dia.')) return false;
    if (turnoAberto()) return exigir(false, 'Já existe um caixa aberto.');
    const id = 'cx-' + v.data + '-' + Date.now().toString(36);
    await Fin.substituir('fin_caixas', id, { data: v.data, trocoInicial: v.troco, obs: v.obs, status: 'aberto', abertoEm: Date.now(), abertoPor: Fin.usuario(), movimentos: [] });
    toast('Caixa aberto.');
  }, { ok: 'Abrir caixa' });
}
function movCaixa(tipo) {
  const t = turnoAberto(); if (!t) return;
  const outras = contasAtivas().filter(c => c.id !== contaCaixa()).map(c => [c.id, c.nome]);
  const ops = tipo === 'sangria' ? outras.concat([['retirada', '💸 Retirada do dono (pró-labore)']]) : outras.concat([['aporte', '💼 Aporte do dono']]);
  abrirForm(tipo === 'sangria' ? '➖ Sangria (tirar dinheiro do caixa)' : '➕ Suprimento (colocar dinheiro no caixa)', [
    { k: 'valor', l: 'Valor (R$)', t: 'number' },
    { k: 'destino', l: tipo === 'sangria' ? 'Para onde vai' : 'De onde vem', t: 'select', op: ops, v: ops[0] && ops[0][0] },
    { k: 'motivo', l: 'Motivo', w2: true, ph: tipo === 'sangria' ? 'ex.: depósito no banco, excesso de dinheiro' : 'ex.: reforço de troco' }
  ], async v => {
    if (!exigir(v.valor > 0, 'Informe o valor.')) return false;
    checarMes(t.data);
    const cx = contaCaixa(), lid = Fin.novoId('l');
    let l;
    if (v.destino === 'retirada') l = { tipo: 'saida', conta: cx, categoria: 'Pró-labore/retirada do dono', descricao: 'Sangria — retirada do dono' };
    else if (v.destino === 'aporte') l = { tipo: 'entrada', conta: cx, categoria: 'Aporte do dono', descricao: 'Suprimento — aporte do dono' };
    else if (tipo === 'sangria') l = { tipo: 'transferencia', conta: cx, contaDestino: v.destino, descricao: 'Sangria do caixa' };
    else l = { tipo: 'transferencia', conta: v.destino, contaDestino: cx, descricao: 'Suprimento do caixa' };
    Object.assign(l, { data: t.data, valor: v.valor, forma: 'dinheiro', obs: v.motivo, origem: 'caixa', refId: t.id, criadoEm: Date.now() });
    const movs = (t.movimentos || []).concat([{ tipo, valor: v.valor, motivo: v.motivo, destino: v.destino, em: Date.now(), por: Fin.usuario(), lancamentoId: lid }]);
    await Fin.lote([{ op: 'replace', col: 'fin_lancamentos', id: lid, dados: l }, { op: 'set', col: 'fin_caixas', id: t.id, dados: { movimentos: movs } }]);
    toast(tipo === 'sangria' ? 'Sangria registrada.' : 'Suprimento registrado.');
  });
}
function fecharCaixa() {
  const t = turnoAberto(); if (!t) return;
  const e = esperadoDe(t);
  abrirForm(`🔒 Fechar caixa — ${br(t.data)}`, [
    { k: 'dinheiro', l: `💵 Dinheiro contado na gaveta (esperado ${dinheiro(e.dinheiro)})`, t: 'number', on: 'difFech()' },
    { k: 'pix', l: `⚡ Pix conferido no app (esperado ${dinheiro(e.pix)})`, t: 'number', v: e.pix, on: 'difFech()' },
    { k: 'cartao', l: `💳 Cartão na maquininha (esperado ${dinheiro(e.cartao)})`, t: 'number', v: e.cartao, on: 'difFech()' },
    { k: 'fica', l: '💵 Fica na gaveta para o próximo turno (troco)', t: 'number', ph: 'opcional' },
    { k: 'just', l: 'Justificativa da diferença (obrigatória se houver)', t: 'textarea', w2: true }
  ], async v => {
    if (!exigir(v.dinheiro != null && v.dinheiro >= 0, 'Informe o dinheiro contado.')) return false;
    const dif = F.diferencas(e, v);
    if (Object.values(dif).some(d => Math.abs(d) >= 0.01) && !exigir(v.just, 'Explique a diferença (justificativa).')) return false;
    checarMes(t.data);
    const ops = [], dd = dif.dinheiro || 0;
    const doc = { status: 'fechado', fechadoEm: Date.now(), fechadoPor: Fin.usuario(), esperado: e, contado: { dinheiro: v.dinheiro, pix: v.pix, cartao: v.cartao },
      diferencas: dif, justificativa: v.just, ficouNaGaveta: v.fica != null ? v.fica : null };
    if (Math.abs(dd) >= 0.01) {   // acerta o saldo do caixa físico com a contagem
      const lid = Fin.novoId('l');
      doc.lancamentoAjusteId = lid;
      ops.push({ op: 'replace', col: 'fin_lancamentos', id: lid, dados: { tipo: dd > 0 ? 'entrada' : 'saida', data: t.data, valor: r2(Math.abs(dd)), conta: contaCaixa(), forma: 'dinheiro',
        categoria: dd > 0 ? 'Sobra de caixa' : 'Quebra de caixa', descricao: `${dd > 0 ? 'Sobra' : 'Falta'} no fechamento do caixa de ${br(t.data)}`, obs: v.just, origem: 'caixa', refId: t.id, criadoEm: Date.now() } });
    }
    ops.push({ op: 'set', col: 'fin_caixas', id: t.id, dados: doc });
    await Fin.lote(ops);
    toast(Math.abs(dd) >= 0.01 ? `Caixa fechado com ${dd > 0 ? 'sobra' : 'falta'} de ${dinheiro(Math.abs(dd))} (lançada).` : 'Caixa fechado e conferido. ✅');
  }, { ok: 'Fechar caixa', topo: '<div id="difBox" class="aviso">Digite os valores contados.</div>' });
  difFech.e = e;
}
function difFech() {
  if (!_form) return;
  const v = valoresForm(), d = F.diferencas(difFech.e, v);
  $('difBox').innerHTML = ['dinheiro', 'pix', 'cartao'].filter(k => d[k] != null).map(k => `${FORMAS[k]}: ${difTxt(d[k])}`).join(' • ') || 'Digite os valores contados.';
}

/* ================= LANÇAMENTOS ================= */
function filtrosLanc() {
  if (!$('lDe').value) { $('lDe').value = F.inicioMes(mesAtual()); $('lAte').value = F.fimDoMes(mesAtual()); }
  const sc = $('lConta').value, sk = $('lCat').value;
  $('lConta').innerHTML = `<option value="">Todas as contas</option>` + contasFin().map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
  $('lConta').value = sc;
  const todas = [...new Set(cats('saida').concat(cats('entrada')).map(c => c.nome).concat(S.lanc.map(l => l.categoria).filter(Boolean)))].sort();
  $('lCat').innerHTML = `<option value="">Todas as categorias</option>` + todas.map(c => `<option>${esc(c)}</option>`).join('');
  $('lCat').value = sk;
}
function lancFiltrados(de, ate, comVendas) {
  const t = $('lTipo').value, c = $('lConta').value, k = $('lCat').value, b = Clientes.chaveTexto($('lBusca').value);
  return todosLanc().filter(l => l.data >= de && l.data <= ate && (comVendas || !l.virtual) && (!t || l.tipo === t) && (!c || l.conta === c || l.contaDestino === c) && (!k || l.categoria === k) &&
    (!b || Clientes.chaveTexto([l.descricao, l.pessoa, l.obs, l.nota, l.categoria].join(' ')).includes(b)))
    .sort((a, b2) => b2.data.localeCompare(a.data) || (b2.criadoEm || 0) - (a.criadoEm || 0));
}
function renderLanc() {
  filtrosLanc();
  const de = $('lDe').value, ate = $('lAte').value, l = lancFiltrados(de, ate, $('lVendas').checked);
  const tot = F.totais(l, de, ate);
  const dup = duplicidades().filter(d => d >= de && d <= ate);
  $('lAviso').innerHTML = dup.length ? `<div class="aviso">⚠️ Dias com venda lançada à mão <b>e</b> importada dos pedidos (pode estar em dobro): ${dup.map(br).join(', ')}. Apague o lançamento manual ou mude "Importar vendas a partir de" em ⚙️ Config.</div>` : '';
  $('tabLanc').innerHTML = `<table><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Forma</th><th class="r">Valor</th><th></th></tr>
    ${l.length ? l.map(x => `<tr><td style="white-space:nowrap">${br(x.data)}${mesFechado(x.data) ? ' 🔒' : ''}</td>
      <td>${esc(x.descricao)}${x.pessoa ? `<div class="muted">${esc(x.pessoa)}</div>` : ''}${x.obs ? `<div class="muted">📝 ${esc(x.obs)}</div>` : ''}${x.nota ? `<div class="muted">🧾 NF ${esc(x.nota)}</div>` : ''}</td>
      <td>${esc(x.categoria || (x.tipo === 'transferencia' ? 'Transferência' : ''))} ${ORIGENS[x.origem] ? `<span class="tag">${ORIGENS[x.origem]}</span>` : ''}</td>
      <td>${x.tipo === 'transferencia' ? `${esc(nomeConta(x.conta))} → ${esc(nomeConta(x.contaDestino))}` : esc(nomeConta(x.conta))}</td>
      <td>${FORMAS[x.forma] || esc(x.forma || '')}</td><td class="r">${sinal(x.valor, x.tipo)}</td>
      <td style="white-space:nowrap">${x.virtual ? '' : `<button class="btn sm sec" title="Editar" onclick="editarLanc('${x.id}')">✏️</button> <button class="btn sm sec" title="Excluir" onclick="excluirLanc('${x.id}')">🗑️</button>`}</td></tr>`).join('')
      : '<tr><td colspan="7" class="vazio">Nenhum lançamento no filtro.</td></tr>'}
    <tr class="tot"><td colspan="5">Entradas ${dinheiro(tot.entradas)} • Saídas ${dinheiro(tot.saidas)}</td><td class="r">${corV(tot.resultado)}</td><td></td></tr></table>`;
  renderVendas(de, ate);
}
function renderVendas(de, ate) {
  const vd = vendasDias(), dias = Object.keys(vd).filter(d => d >= de && d <= ate).sort().reverse(), desde = desdeVendas();
  $('vendasInfo').innerHTML = `Lidas dos pedidos (cancelados e não entregues ficam fora). Entram no fluxo a partir de <b>${br(desde)}</b>: dinheiro → ${esc(nomeConta(cfg().contaVendas.dinheiro))}, Pix → ${esc(nomeConta(cfg().contaVendas.pix))}, cartão → ${esc(nomeConta(cfg().contaVendas.cartao))} (menos a taxa estimada de ${pct(taxaCartao())}). Nada é gravado nos pedidos.`;
  const T = { qtd: 0, dinheiro: 0, pix: 0, cartao: 0, fiado: 0, outros: 0, taxaCartao: 0, total: 0 };
  dias.forEach(d => Object.keys(T).forEach(k => { T[k] += vd[d][k] || 0; }));
  $('tabVendas').innerHTML = dias.length ? `<table><tr><th>Dia</th><th class="r">Pedidos</th><th class="r">💵 Dinheiro</th><th class="r">⚡ Pix</th><th class="r">💳 Cartão</th><th class="r">📝 Fiado</th><th class="r">Taxa cartão</th><th class="r">Total</th><th class="r">Líquido</th></tr>
    ${dias.map(d => { const v = vd[d]; return `<tr><td>${br(d)}${d < desde ? ' <span class="tag">não importado</span>' : ''}</td><td class="r">${v.qtd}</td><td class="r">${dinheiro(v.dinheiro)}</td><td class="r">${dinheiro(v.pix)}</td>
      <td class="r">${dinheiro(v.cartao)}</td><td class="r">${v.fiado ? dinheiro(v.fiado) : '—'}</td><td class="r neg">${v.taxaCartao ? '−' + dinheiro(v.taxaCartao) : '—'}</td><td class="r"><b>${dinheiro(v.total)}</b></td><td class="r">${dinheiro(v.total - v.taxaCartao)}</td></tr>`; }).join('')}
    <tr class="tot"><td>Total</td><td class="r">${T.qtd}</td><td class="r">${dinheiro(T.dinheiro)}</td><td class="r">${dinheiro(T.pix)}</td><td class="r">${dinheiro(T.cartao)}</td><td class="r">${dinheiro(T.fiado)}</td><td class="r">−${dinheiro(T.taxaCartao)}</td><td class="r">${dinheiro(T.total)}</td><td class="r">${dinheiro(T.total - T.taxaCartao)}</td></tr></table>`
    : '<div class="vazio">Nenhuma venda no período.</div>';
}
function camposLanc(tipo, l = {}) {
  return [
    { k: 'data', l: 'Data', t: 'date', v: l.data || hoje() },
    { k: 'valor', l: 'Valor (R$)', t: 'number', v: l.valor },
    { k: 'descricao', l: 'Descrição', w2: true, v: l.descricao, ph: tipo === 'saida' ? 'ex.: Compra de mussarela' : 'ex.: Encomenda de festa' },
    { k: 'categoria', l: 'Categoria', t: 'select', op: opCats(tipo), v: l.categoria || (tipo === 'saida' ? 'Insumos/ingredientes' : 'Outras receitas') },
    { k: 'conta', l: 'Conta', t: 'select', op: opContas(), v: l.conta || contaCaixa() },
    { k: 'forma', l: 'Forma', t: 'select', op: opFormas(), v: l.forma || 'dinheiro' },
    { k: 'pessoa', l: tipo === 'saida' ? 'Fornecedor (opcional)' : 'Cliente (opcional)', v: l.pessoa, list: 'dlPessoas' },
    { k: 'nota', l: 'Nº da nota / comprovante', v: l.nota },
    { k: 'obs', l: 'Observação', t: 'textarea', w2: true, v: l.obs }
  ];
}
const datalistPessoas = () => `<datalist id="dlPessoas">${[...new Set(S.lanc.map(l => l.pessoa).concat(S.contas.map(c => c.pessoa)).filter(Boolean))].sort().map(p => `<option value="${esc(p)}">`).join('')}</datalist>`;
function novoLanc(tipo, l) {
  abrirForm(tipo === 'saida' ? '➖ Nova saída' : '➕ Nova entrada', camposLanc(tipo, l), v => salvarLanc(null, tipo, v), { datalist: datalistPessoas() });
}
async function salvarLanc(id, tipo, v, orig) {
  if (!exigir(v.valor > 0, 'Informe o valor.') || !exigir(v.descricao, 'Informe a descrição.') || !exigir(v.data, 'Informe a data.')) return false;
  checarMes(v.data, orig && orig.data);
  if (tipo === 'entrada' && F.grupoDe(cfg().categorias, 'entrada', v.categoria) === 'venda' && v.data >= desdeVendas()
    && !confirm('As vendas desta data já entram automaticamente pelos pedidos. Lançar à mão pode contar em dobro. Lançar mesmo assim?')) return false;
  const doc = Object.assign({}, orig || { origem: 'manual', criadoEm: Date.now(), criadoPor: Fin.usuario() }, v, { tipo });
  await Fin.substituir('fin_lancamentos', id || Fin.novoId('l'), doc);
  toast('Lançamento salvo.');
}
function novaTransf(l = {}, id) {
  abrirForm('🔁 Transferência entre contas', [
    { k: 'data', l: 'Data', t: 'date', v: l.data || hoje() }, { k: 'valor', l: 'Valor (R$)', t: 'number', v: l.valor },
    { k: 'conta', l: 'Sai de', t: 'select', op: opContas(), v: l.conta || contaCaixa() }, { k: 'contaDestino', l: 'Entra em', t: 'select', op: opContas(), v: l.contaDestino || 'banco' },
    { k: 'descricao', l: 'Descrição', w2: true, v: l.descricao || 'Depósito do caixa no banco' }, { k: 'obs', l: 'Observação', t: 'textarea', w2: true, v: l.obs }
  ], async v => {
    if (!exigir(v.valor > 0, 'Informe o valor.') || !exigir(v.conta !== v.contaDestino, 'Escolha contas diferentes.')) return false;
    checarMes(v.data, l.data);
    await Fin.substituir('fin_lancamentos', id || Fin.novoId('l'), Object.assign({}, id ? l : { origem: 'manual', criadoEm: Date.now(), criadoPor: Fin.usuario() }, v, { tipo: 'transferencia', forma: 'transferencia' }));
    toast('Transferência salva.');
  });
}
function editarLanc(id) {
  const l = S.lanc.find(x => x.id === id); if (!l) return;
  if (l.origem && l.origem !== 'manual') return toast(`Este lançamento foi gerado por ${ORIGENS[l.origem] || l.origem}: altere/desfaça por lá.`);
  if (mesFechado(l.data)) return toast('Mês fechado: reabra para editar.');
  if (l.tipo === 'transferencia') return novaTransf(l, id);
  abrirForm('✏️ Editar lançamento', camposLanc(l.tipo, l), v => salvarLanc(id, l.tipo, v, l), { datalist: datalistPessoas() });
}
async function excluirLanc(id) {
  const l = S.lanc.find(x => x.id === id); if (!l) return;
  if (l.origem && l.origem !== 'manual') return toast(`Gerado por ${ORIGENS[l.origem] || l.origem}: desfaça por lá (ex.: "Desfazer pagamento").`);
  if (!confirm(`Excluir "${l.descricao}" (${dinheiro(l.valor)})?`)) return;
  try { checarMes(l.data); await Fin.apagar('fin_lancamentos', id); toast('Excluído.'); } catch (e) { erro(e); }
}
function baixarCSV(nome, linhas) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([F.csv(linhas)], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function csvLanc(doRel) {
  let de, ate, l;
  if (doRel) { [de, ate] = intervaloRel(); l = todosLanc().filter(x => x.data >= de && x.data <= ate).sort((a, b) => a.data.localeCompare(b.data)); }
  else { de = $('lDe').value; ate = $('lAte').value; l = lancFiltrados(de, ate, $('lVendas').checked).reverse(); }
  baixarCSV(`lancamentos_${de}_a_${ate}.csv`, [['Data', 'Tipo', 'Descrição', 'Categoria', 'Grupo', 'Conta', 'Conta destino', 'Forma', 'Valor', 'Pessoa', 'Nota', 'Obs', 'Origem']]
    .concat(l.map(x => [br(x.data), x.tipo, x.descricao, x.categoria || '', x.tipo === 'transferencia' ? '' : F.GRUPOS[F.grupoDe(cfg().categorias, x.tipo, x.categoria)] || '', nomeConta(x.conta), x.contaDestino ? nomeConta(x.contaDestino) : '',
      x.forma || '', x.tipo === 'saida' ? -x.valor : x.valor, x.pessoa || '', x.nota || '', x.obs || '', x.virtual ? 'pedidos' : x.origem || 'manual'])));
}

/* ================= CONTAS A PAGAR / RECEBER ================= */
const FILTROS_CONTA = [['abertas', 'Em aberto'], ['vencidas', 'Vencidas'], ['7d', 'Próx. 7 dias'], ['mes', 'Este mês'], ['pagas', 'Pagas/recebidas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']];
const SIT = { aberta: ['Aberta', 'azul'], vencida: ['Vencida', 'verm'], paga: ['Paga', 'verde'], cancelada: ['Cancelada', ''] };
function renderContas(nat) {
  const h = hoje(), f = filtroConta[nat], box = nat === 'pagar' ? 'cPagar' : 'cReceber', busca = ($('cb_' + nat) || {}).value || '';
  const b = Clientes.chaveTexto(busca);
  let l = S.contas.filter(c => c.natureza === nat).map(c => Object.assign({ sit: F.situacao(c, h) }, c));
  l = l.filter(c => ({ abertas: c.status === 'aberta', vencidas: c.sit === 'vencida', '7d': c.status === 'aberta' && c.vencimento <= F.addDias(h, 7),
    mes: F.mesDe(c.vencimento) === mesAtual(), pagas: c.status === 'paga', canceladas: c.status === 'cancelada', todas: true }[f]))
    .filter(c => !b || Clientes.chaveTexto([c.descricao, c.pessoa, c.categoria, c.obs].join(' ')).includes(b))
    .sort((a, c) => (f === 'pagas' ? (c.pagoEm || '').localeCompare(a.pagoEm || '') : a.vencimento.localeCompare(c.vencimento)));
  const tot = r2(l.reduce((t, c) => t + (c.status === 'paga' ? Number(c.valorPago) || 0 : Number(c.valor) || 0), 0));
  const verbo = nat === 'pagar' ? 'Pagar' : 'Receber';
  const foco = document.activeElement && document.activeElement.id === 'cb_' + nat;
  $(box).innerHTML = `<div class="barraTopo"><h2>${nat === 'pagar' ? '📤 Contas a pagar' : '📥 Contas a receber'}</h2>
    <div class="acoes"><button class="btn sm" onclick="editarConta('${nat}')">➕ Nova conta</button><button class="btn sm sec" onclick="csvContas('${nat}')">⬇️ CSV</button></div></div>
    <div class="filtros">${FILTROS_CONTA.map(([k, n]) => `<span class="chip ${k === f ? 'on' : ''}" onclick="filtroConta.${nat}='${k}';renderContas('${nat}')">${n}</span>`).join('')}
      <input id="cb_${nat}" placeholder="🔎 Buscar" value="${esc(busca)}" oninput="renderContas('${nat}')"></div>
    <div class="rolar"><table><tr><th>Vencimento</th><th>Descrição</th><th>${nat === 'pagar' ? 'Fornecedor' : 'Cliente'}</th><th>Categoria</th><th class="r">Valor</th><th>Situação</th><th></th></tr>
    ${l.length ? l.map(c => {
      const rec = c.recorrencia && c.recorrencia.tipo && c.recorrencia.tipo !== 'unica' && !c.parcelado;
      const [sn, sc] = SIT[c.sit];
      const atraso = c.sit === 'vencida' ? ` ${F.diasEntre(c.vencimento, h)}d` : c.status === 'aberta' && c.vencimento === h ? ' hoje' : '';
      return `<tr><td style="white-space:nowrap">${br(c.vencimento)}</td>
      <td><b>${esc(c.descricao)}</b>${c.parcela ? ` <span class="tag">${c.parcela.n}/${c.parcela.total}</span>` : ''}${rec ? ` <span class="tag azul" title="Recorrente">🔁 ${F.RECORRENCIAS[c.recorrencia.tipo]}${c.recorrencia.parcelas ? ` ${c.recorrencia.n || 1}/${c.recorrencia.parcelas}` : ''}</span>` : ''}
        ${c.obs ? `<div class="muted">📝 ${esc(c.obs)}</div>` : ''}${c.status === 'paga' ? `<div class="muted">${nat === 'pagar' ? 'Pago' : 'Recebido'} ${br(c.pagoEm)} • ${dinheiro(c.valorPago)} • ${esc(nomeConta(c.contaPg))}</div>` : ''}</td>
      <td>${esc(c.pessoa || '')}</td><td>${esc(c.categoria || '')}</td><td class="r"><b>${dinheiro(c.valor)}</b></td>
      <td><span class="tag ${sc}">${c.status === 'paga' && nat === 'receber' ? 'Recebida' : sn}${atraso}</span></td>
      <td style="white-space:nowrap">${c.status === 'aberta' ? `<button class="btn sm" style="background:var(--ok)" onclick="pagarConta('${c.id}')">${verbo}</button> <button class="btn sm sec" title="Editar" onclick="editarConta('${nat}','${c.id}')">✏️</button> <button class="btn sm sec" title="Cancelar" onclick="cancelarConta('${c.id}')">✖</button>`
        : c.status === 'paga' ? `<button class="btn sm sec" onclick="desfazerConta('${c.id}')">↩️ Desfazer</button>` : `<button class="btn sm sec" title="Excluir" onclick="excluirConta('${c.id}')">🗑️</button>`}</td></tr>`; }).join('')
      : `<tr><td colspan="7" class="vazio">Nenhuma conta neste filtro.</td></tr>`}
    <tr class="tot"><td colspan="4">${l.length} conta(s)</td><td class="r">${dinheiro(tot)}</td><td colspan="2"></td></tr></table></div>`;
  if (foco) { const i = $('cb_' + nat); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function editarConta(nat, id) {
  const c = id ? S.contas.find(x => x.id === id) : { natureza: nat, vencimento: hoje(), recorrencia: { tipo: 'unica' }, conta: nat === 'pagar' ? 'banco' : 'pix', categoria: nat === 'pagar' ? 'Aluguel' : 'Outras receitas' };
  if (!c) return;
  const rec = c.recorrencia || {}, tipoCat = nat === 'pagar' ? 'saida' : 'entrada';
  const termina = rec.ate ? 'data' : rec.parcelas ? 'vezes' : 'nunca';
  const campos = [
    { k: 'descricao', l: 'Descrição', w2: true, v: c.descricao, ph: nat === 'pagar' ? 'ex.: Aluguel do ponto' : 'ex.: Convênio empresa X' },
    { k: 'pessoa', l: nat === 'pagar' ? 'Fornecedor' : 'Cliente', v: c.pessoa, list: 'dlPessoas' },
    { k: 'categoria', l: 'Categoria', t: 'select', op: opCats(tipoCat), v: c.categoria },
    { k: 'valor', l: id || !c.parcelado ? 'Valor (R$)' : 'Valor total (R$)', t: 'number', v: c.valor },
    { k: 'vencimento', l: id ? 'Vencimento' : '1º vencimento', t: 'date', v: c.vencimento },
    { k: 'conta', l: nat === 'pagar' ? 'Pagar pela conta' : 'Receber na conta', t: 'select', op: opContas(), v: c.conta },
    { k: 'forma', l: 'Forma', t: 'select', op: opFormas(), v: c.forma || 'pix' }
  ];
  if (!c.parcelado) campos.push(
    { k: 'rec', l: 'Repetir', t: 'select', op: Object.entries(F.RECORRENCIAS), v: rec.tipo || 'unica', on: 'formRec()' },
    { k: 'termina', l: 'Termina', t: 'select', op: [['nunca', 'Sem data final'], ['data', 'Em uma data'], ['vezes', 'Depois de N vezes']], v: termina, on: 'formRec()' },
    { k: 'ate', l: 'Data final', t: 'date', v: rec.ate || '' },
    { k: 'vezes', l: 'Nº total de vezes', t: 'number', v: rec.parcelas || '' });
  if (!id) campos.push({ k: 'parcelado', l: '🧮 Compra parcelada: dividir o valor total em N parcelas e criar todas agora', t: 'check', w2: true, on: 'formRec()' });
  campos.push({ k: 'nota', l: 'Nº da nota / documento', v: c.nota }, { k: 'obs', l: 'Observação', v: c.obs });
  abrirForm(id ? '✏️ Editar conta' : (nat === 'pagar' ? '📤 Nova conta a pagar' : '📥 Nova conta a receber'), campos, v => salvarConta(nat, c, id, v),
    { datalist: datalistPessoas(), aoAbrir: formRec, topo: c.parcela ? `<div class="aviso">Parcela ${c.parcela.n}/${c.parcela.total} de uma compra parcelada.</div>` : '' });
}
function formRec() {
  const v = valoresForm(), par = v.parcelado, r = v.rec || 'unica';
  const show = (k, s) => { const b = $('box_' + k); b && b.classList.toggle('hide', !s); };
  show('rec', true); show('termina', !par && r !== 'unica'); show('ate', !par && r !== 'unica' && v.termina === 'data'); show('vezes', par || (r !== 'unica' && v.termina === 'vezes'));
  if (par) { $('ff_rec').value = r === 'unica' ? 'mensal' : r; }
  const lv = document.querySelector('label[for=ff_vezes]'); if (lv) lv.textContent = par ? 'Nº de parcelas' : 'Nº total de vezes';
  const lval = document.querySelector('label[for=ff_valor]'); if (lval && $('ff_parcelado')) lval.textContent = par ? 'Valor TOTAL da compra (R$)' : 'Valor (R$)';
}
async function salvarConta(nat, c, id, v) {
  if (!exigir(v.descricao, 'Informe a descrição.') || !exigir(v.valor > 0, 'Informe o valor.') || !exigir(v.vencimento, 'Informe o vencimento.')) return false;
  const base = { natureza: nat, descricao: v.descricao, pessoa: v.pessoa, categoria: v.categoria, conta: v.conta, forma: v.forma, nota: v.nota, obs: v.obs };
  const tipo = v.rec || 'unica';
  const recorrencia = { tipo, dia: Number(v.vencimento.slice(8, 10)) };
  if (!v.parcelado && tipo !== 'unica') { if (v.termina === 'data' && v.ate) recorrencia.ate = v.ate; if (v.termina === 'vezes' && v.vezes > 0) recorrencia.parcelas = Math.floor(v.vezes); }
  if (!id) {
    if (v.parcelado) {
      if (!exigir(v.vezes >= 2, 'Informe o nº de parcelas (2 ou mais).')) return false;
      const serie = Fin.novoId('s'), ps = F.parcelas(v.valor, v.vezes, v.vencimento, tipo === 'unica' ? 'mensal' : tipo);
      await Fin.lote(ps.map(p => ({ op: 'replace', col: 'fin_contas', id: Fin.novoId('c'), dados: Object.assign({}, base, {
        descricao: `${v.descricao} (${p.n}/${p.total})`, valor: p.valor, vencimento: p.vencimento, parcelado: true, parcela: { n: p.n, total: p.total }, valorTotal: v.valor,
        serieId: serie, recorrencia: { tipo: 'unica' }, status: 'aberta', criadoEm: Date.now() }) })));
      return toast(`${ps.length} parcelas criadas.`);
    }
    const nid = Fin.novoId('c');
    await Fin.substituir('fin_contas', nid, Object.assign(base, { valor: v.valor, vencimento: v.vencimento, recorrencia: Object.assign(recorrencia, { n: 1 }), serieId: nid, status: 'aberta', criadoEm: Date.now() }));
    return toast('Conta criada.');
  }
  // edição: só esta ou esta + futuras abertas da mesma série
  const irmas = S.contas.filter(x => x.id !== id && x.serieId && x.serieId === c.serieId && x.status === 'aberta' && x.vencimento > c.vencimento);
  let escopo = 'esta';
  if (irmas.length || (c.recorrencia && c.recorrencia.tipo !== 'unica')) {
    escopo = await escolher('Aplicar a alteração em…', irmas.length ? `Há mais ${irmas.length} parcela(s)/ocorrência(s) em aberto desta série.` : 'Conta recorrente: as próximas ocorrências são criadas a partir desta.',
      [['esta', 'Só nesta conta'], ['futuras', 'Nesta e em todas as futuras', 'dark']]);
    if (!escopo) return false;
  }
  const ops = [];
  const dadosRec = c.parcelado ? {} : { recorrencia: Object.assign({}, recorrencia, { n: (c.recorrencia || {}).n || 1 }) };
  if (escopo === 'esta' && c.recorrencia && c.recorrencia.tipo !== 'unica' && !c.parcelado) dadosRec.recorrencia = Object.assign({}, c.recorrencia);   // só esta: mantém a regra
  ops.push({ op: 'replace', col: 'fin_contas', id, dados: Object.assign({}, c, base, { valor: v.valor, vencimento: v.vencimento }, escopo === 'esta' && c.parcelado ? { descricao: v.descricao } : {}, dadosRec, escopo === 'esta' && !c.parcelado && c.recorrencia && c.recorrencia.tipo !== 'unica' ? { valorProximas: c.valorProximas != null ? c.valorProximas : c.valor } : { valorProximas: null }) });
  if (escopo === 'futuras') irmas.forEach(x => ops.push({ op: 'set', col: 'fin_contas', id: x.id, dados: Object.assign({}, base, { valor: v.valor, descricao: x.parcela ? v.descricao.replace(/\s*\(\d+\/\d+\)$/, '') + ` (${x.parcela.n}/${x.parcela.total})` : v.descricao }) }));
  await Fin.lote(ops);
  toast(escopo === 'futuras' ? 'Alterado nesta e nas futuras.' : 'Conta alterada.');
}
function pagarConta(id) {
  const c = S.contas.find(x => x.id === id); if (!c) return;
  const pg = c.natureza === 'pagar';
  abrirForm(`${pg ? '💸 Pagar' : '💰 Receber'}: ${c.descricao}`, [
    { k: 'valor', l: `Valor ${pg ? 'pago' : 'recebido'} (R$) — conta: ${dinheiro(c.valor)}`, t: 'number', v: c.valor, on: 'difPg()' },
    { k: 'data', l: `Data do ${pg ? 'pagamento' : 'recebimento'}`, t: 'date', v: hoje() },
    { k: 'conta', l: 'Conta', t: 'select', op: opContas(), v: c.conta || contaCaixa() },
    { k: 'forma', l: 'Forma', t: 'select', op: opFormas(), v: c.forma || 'pix' },
    { k: 'obs', l: 'Observação', w2: true }
  ], async v => {
    if (!exigir(v.valor > 0, 'Informe o valor.') || !exigir(v.data, 'Informe a data.')) return false;
    checarMes(v.data);
    const lid = Fin.novoId('l'), dif = r2(v.valor - c.valor);
    const ops = [{ op: 'replace', col: 'fin_lancamentos', id: lid, dados: { tipo: pg ? 'saida' : 'entrada', data: v.data, valor: v.valor, descricao: c.descricao, categoria: c.categoria,
      conta: v.conta, forma: v.forma, pessoa: c.pessoa || '', nota: c.nota || '', obs: [v.obs, dif ? (dif > 0 ? `juros/multa ${dinheiro(dif)}` : `desconto ${dinheiro(-dif)}`) : ''].filter(Boolean).join(' • '),
      origem: pg ? 'conta_pagar' : 'conta_receber', refId: c.id, criadoEm: Date.now(), criadoPor: Fin.usuario() } }];
    const up = { status: 'paga', valorPago: v.valor, pagoEm: v.data, contaPg: v.conta, lancamentoId: lid, diferenca: dif };
    const prox = F.proximaOcorrencia(c);
    let msg = pg ? 'Pago e lançado como saída.' : 'Recebido e lançado como entrada.';
    if (prox) {
      const pid = Fin.novoId('c'), { id: _, status, valorPago, pagoEm, contaPg, lancamentoId, diferenca, proximaId, valorProximas, atualizadoEm, atualizadoPor, ...base } = c;
      ops.push({ op: 'replace', col: 'fin_contas', id: pid, dados: Object.assign(base, { valor: valorProximas != null ? valorProximas : c.valor, vencimento: prox.vencimento,
        recorrencia: Object.assign({}, c.recorrencia, { n: prox.n }), serieId: c.serieId || c.id, status: 'aberta', criadoEm: Date.now() }) });
      up.proximaId = pid;
      msg += ` Próxima: ${br(prox.vencimento)}.`;
    }
    ops.push({ op: 'set', col: 'fin_contas', id: c.id, dados: up });
    await Fin.lote(ops);
    toast(msg);
  }, { ok: pg ? 'Confirmar pagamento' : 'Confirmar recebimento', topo: '<div id="difPgBox"></div>' });
  difPg.c = c;
}
function difPg() {
  const v = valoresForm(), d = r2((v.valor || 0) - difPg.c.valor);
  $('difPgBox').innerHTML = d ? `<div class="aviso">${d > 0 ? `Juros/multa: <b>${dinheiro(d)}</b>` : `Desconto: <b>${dinheiro(-d)}</b>`}</div>` : '';
}
async function desfazerConta(id) {
  const c = S.contas.find(x => x.id === id); if (!c) return;
  const prox = c.proximaId && S.contas.find(x => x.id === c.proximaId);
  if (prox && prox.status === 'paga') return toast('A próxima ocorrência já foi paga: desfaça ela primeiro.');
  if (!confirm(`Desfazer o ${c.natureza === 'pagar' ? 'pagamento' : 'recebimento'} de "${c.descricao}"? O lançamento será apagado${prox ? ' e a próxima ocorrência (aberta) também' : ''}.`)) return;
  try {
    checarMes(c.pagoEm);
    const ops = [{ op: 'set', col: 'fin_contas', id, dados: { status: 'aberta', valorPago: null, pagoEm: null, contaPg: null, lancamentoId: null, diferenca: null, proximaId: null } }];
    if (c.lancamentoId) ops.push({ op: 'delete', col: 'fin_lancamentos', id: c.lancamentoId });
    if (prox) ops.push({ op: 'delete', col: 'fin_contas', id: prox.id });
    await Fin.lote(ops); toast('Desfeito.');
  } catch (e) { erro(e); }
}
async function cancelarConta(id) {
  const c = S.contas.find(x => x.id === id); if (!c) return;
  const rec = c.recorrencia && c.recorrencia.tipo !== 'unica' && !c.parcelado && F.proximaOcorrencia(c);
  let gerar = false;
  if (rec) {
    const r = await escolher('Cancelar conta recorrente', `"${c.descricao}" — ${br(c.vencimento)}`, [['pular', `Cancelar só esta (cria a próxima em ${br(rec.vencimento)})`], ['encerrar', 'Encerrar a recorrência (não gera mais)', 'dark']]);
    if (!r) return; gerar = r === 'pular';
  } else if (!confirm(`Cancelar "${c.descricao}" (${dinheiro(c.valor)})?`)) return;
  try {
    const ops = [{ op: 'set', col: 'fin_contas', id, dados: { status: 'cancelada', canceladaEm: Date.now() } }];
    if (gerar) {
      const pid = Fin.novoId('c'), { id: _, status, atualizadoEm, atualizadoPor, ...base } = c;
      ops.push({ op: 'replace', col: 'fin_contas', id: pid, dados: Object.assign(base, { vencimento: rec.vencimento, recorrencia: Object.assign({}, c.recorrencia, { n: rec.n }), serieId: c.serieId || c.id, status: 'aberta', criadoEm: Date.now() }) });
      ops[0].dados.proximaId = pid;
    }
    await Fin.lote(ops); toast('Conta cancelada.');
  } catch (e) { erro(e); }
}
async function excluirConta(id) { if (confirm('Excluir esta conta cancelada?')) { try { await Fin.apagar('fin_contas', id); } catch (e) { erro(e); } } }
function csvContas(nat) {
  const l = S.contas.filter(c => !nat || typeof nat !== 'string' || c.natureza === nat).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  baixarCSV(`contas_${nat && typeof nat === 'string' ? nat : 'pagar_receber'}.csv`, [['Tipo', 'Vencimento', 'Descrição', 'Pessoa', 'Categoria', 'Valor', 'Situação', 'Recorrência', 'Parcela', 'Pago em', 'Valor pago', 'Conta', 'Obs']]
    .concat(l.map(c => [c.natureza === 'pagar' ? 'A pagar' : 'A receber', br(c.vencimento), c.descricao, c.pessoa || '', c.categoria || '', c.valor, F.situacao(c, hoje()),
      F.RECORRENCIAS[(c.recorrencia || {}).tipo] || '', c.parcela ? `${c.parcela.n}/${c.parcela.total}` : '', c.pagoEm ? br(c.pagoEm) : '', c.valorPago || '', nomeConta(c.contaPg || c.conta), c.obs || ''])));
}

/* ================= FIADOS ================= */
function renderFiados() {
  const h = hoje(), b = Clientes.chaveTexto($('fBusca').value), dig = b.replace(/\D/g, '');
  const l = S.fiados.map(f => Object.assign({ f }, F.resumoFiado(f, h)));
  const ab = l.filter(x => x.saldo > 0.004);
  const kpi = (t, v, s, cls = '') => `<div class="kpi ${cls}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  $('kpiFiado').innerHTML = kpi('Total em fiado', dinheiro(ab.reduce((t, x) => t + x.saldo, 0)), `${ab.length} cliente(s) devendo`) +
    kpi('Em atraso', dinheiro(ab.filter(x => x.atraso > 0).reduce((t, x) => t + x.saldo, 0)), `${ab.filter(x => x.atraso > 0).length} cliente(s)`, ab.some(x => x.atraso > 0) ? 'verm' : '') +
    kpi('Acima do limite', ab.filter(x => x.estourado).length, 'cliente(s)', ab.some(x => x.estourado) ? 'amar' : '') +
    kpi('Recebido no mês', dinheiro(l.reduce((t, x) => t + (x.f.movimentos || []).filter(m => m.tipo === 'pagamento' && F.mesDe(m.data) === mesAtual()).reduce((a, m) => a + m.valor, 0), 0)));
  const vis = l.filter(x => (!$('fSoAberto').checked || x.saldo > 0.004) && (!b || Clientes.chaveTexto(x.f.nome).includes(b) || (dig.length >= 3 && (x.f.telefone || '').includes(dig))))
    .sort((a, c) => c.saldo - a.saldo || a.f.nome.localeCompare(c.f.nome));
  $('tabFiados').innerHTML = `<table><tr><th>Cliente</th><th class="r">Saldo devedor</th><th class="r">Limite</th><th>Vencimento</th><th class="r">Atraso</th><th></th></tr>
    ${vis.length ? vis.map(x => `<tr><td><b>${esc(x.f.nome)}</b><div class="muted">${x.f.telefone ? Clientes.fmtTel(x.f.telefone) : 'sem telefone'}</div></td>
      <td class="r"><b class="${x.saldo > 0.004 ? 'neg' : ''}">${dinheiro(x.saldo)}</b>${x.estourado ? '<div><span class="tag verm">acima do limite</span></div>' : ''}</td>
      <td class="r">${x.limite ? dinheiro(x.limite) + `<div class="muted">livre ${dinheiro(Math.max(0, x.disponivel))}</div>` : '—'}</td>
      <td>${x.saldo > 0.004 ? br(x.vencimento) : '—'}</td><td class="r">${x.atraso ? `<span class="tag ${x.atraso > 30 ? 'verm' : 'amar'}">${x.atraso} dia(s)</span>` : '—'}</td>
      <td style="white-space:nowrap"><button class="btn sm sec" onclick="compraFiado('${x.f.id}')">🛒 Compra</button> <button class="btn sm" style="background:var(--ok)" onclick="pagamentoFiado('${x.f.id}')">💵 Pagamento</button>
        <button class="btn sm sec" onclick="extratoFiado('${x.f.id}')">📄 Extrato</button> ${x.f.telefone ? `<button class="btn sm wa" onclick="whatsFiado('${x.f.id}','cobranca')">💬 Cobrar</button>` : ''} <button class="btn sm sec" onclick="editarFiado('${x.f.id}')">✏️</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="vazio">Nenhum cliente com fiado.</td></tr>'}</table>`;
  const top = ab.slice().sort((a, c) => c.saldo - a.saldo).slice(0, 10), max = top.length ? top[0].saldo : 1;
  $('rankFiado').innerHTML = top.length ? top.map((x, i) => `<div class="hb"><span class="n">${i + 1}º ${esc(x.f.nome)}${x.atraso ? ` <span class="tag ${x.atraso > 30 ? 'verm' : 'amar'}">${x.atraso}d</span>` : ''}</span>
    <span class="t"><i style="width:${(x.saldo / max * 100).toFixed(1)}%"></i></span><span class="v">${dinheiro(x.saldo)}</span></div>`).join('') : '<div class="vazio">Ninguém devendo. 🎉</div>';
}
// clientes já vistos nos pedidos (sugestão de nome/telefone)
const datalistClientes = () => { const m = {}; pedidos.forEach(p => { const t = Clientes.normTel(p.cliente && p.cliente.telefone); if (t) m[t] = p.cliente.nome; });
  return `<datalist id="dlCli">${Object.entries(m).map(([t, n]) => `<option value="${esc(n)} — ${Clientes.fmtTel(t)}">`).join('')}</datalist>`; };
function editarFiado(id) {
  const f = id ? S.fiados.find(x => x.id === id) : {};
  abrirForm(id ? '✏️ Cliente do fiado' : '➕ Cliente do fiado', [
    { k: 'nome', l: 'Nome', v: f.nome, list: id ? '' : 'dlCli', on: 'preencherCli()' }, { k: 'telefone', l: 'Telefone (WhatsApp)', v: f.telefone ? Clientes.fmtTel(f.telefone) : '' },
    { k: 'limite', l: 'Limite de crédito (R$) — vazio = sem limite', t: 'number', v: f.limite || '' }, { k: 'obs', l: 'Observação', v: f.obs }
  ], async v => {
    const nome = v.nome.replace(/\s+—\s+\(.*$/, '').trim();
    if (!exigir(nome, 'Informe o nome.')) return false;
    const tel = Clientes.normTel(v.telefone);
    if (v.telefone && !tel) return exigir(false, 'Telefone inválido (DDD + número).');
    const nid = id || tel || Fin.novoId('fi');
    if (!id && S.fiados.some(x => x.id === nid)) return exigir(false, 'Já existe um cliente com este telefone.');
    await Fin.salvar('fin_fiados', nid, Object.assign({ nome, telefone: tel, limite: v.limite || 0, obs: v.obs }, id ? {} : { movimentos: [], criadoEm: Date.now() }));
    toast('Cliente salvo.');
  }, { datalist: datalistClientes() });
}
function preencherCli() {
  const n = $('ff_nome').value, m = n.match(/^(.*?)\s+—\s+(\(.*)$/);
  if (m) { $('ff_nome').value = m[1]; $('ff_telefone').value = m[2]; }
}
function compraFiado(id) {
  const f = S.fiados.find(x => x.id === id); if (!f) return;
  const r = F.resumoFiado(f, hoje());
  abrirForm(`🛒 Compra no fiado — ${f.nome}`, [
    { k: 'valor', l: 'Valor (R$)', t: 'number' }, { k: 'data', l: 'Data', t: 'date', v: hoje() },
    { k: 'descricao', l: 'Descrição', w2: true, ph: 'ex.: 1 pizza G calabresa' },
    { k: 'pedido', l: 'Nº do pedido (opcional)', t: 'number', ph: 'ex.: 12' }, { k: 'pedidoData', l: 'Dia do pedido', t: 'date', v: diaCaixa() },
    { k: 'vencimento', l: 'Vencimento combinado', t: 'date', v: F.addDias(hoje(), 30) }
  ], async v => {
    if (!exigir(v.valor > 0, 'Informe o valor.')) return false;
    if (r.limite && r.saldo + v.valor > r.limite + 0.004 && !confirm(`Passa do limite de crédito (${dinheiro(r.limite)}): saldo ficará ${dinheiro(r.saldo + v.valor)}. Lançar mesmo assim?`)) return false;
    if (v.pedido && !pedidos.some(p => p.data === v.pedidoData && String(p.numero) === String(v.pedido)) && !confirm(`Pedido #${v.pedido} de ${br(v.pedidoData)} não encontrado. Continuar?`)) return false;
    const m = { id: Fin.novoId('m'), tipo: 'compra', valor: v.valor, data: v.data, descricao: v.descricao, vencimento: v.vencimento, em: Date.now(), por: Fin.usuario() };
    if (v.pedido) Object.assign(m, { pedido: Math.floor(v.pedido), pedidoData: v.pedidoData });
    await Fin.salvar('fin_fiados', id, { movimentos: (f.movimentos || []).concat([m]) });
    toast(v.pedido ? `Fiado lançado. O pedido #${v.pedido} sai das vendas em ${FORMAS[(pedidos.find(p => p.data === v.pedidoData && String(p.numero) === String(v.pedido)) || { pagamento: {} }).pagamento.forma] || 'dinheiro'} e entra como fiado.` : 'Compra no fiado lançada.');
  });
}
function pagamentoFiado(id) {
  const f = S.fiados.find(x => x.id === id); if (!f) return;
  const r = F.resumoFiado(f, hoje());
  abrirForm(`💵 Pagamento — ${f.nome} (deve ${dinheiro(r.saldo)})`, [
    { k: 'valor', l: 'Valor recebido (R$)', t: 'number', v: r.saldo > 0 ? r.saldo : '' }, { k: 'data', l: 'Data', t: 'date', v: hoje() },
    { k: 'conta', l: 'Entrou na conta', t: 'select', op: opContas(), v: contaCaixa() }, { k: 'forma', l: 'Forma', t: 'select', op: opFormas(), v: 'dinheiro' }, { k: 'obs', l: 'Observação', w2: true }
  ], async v => {
    if (!exigir(v.valor > 0, 'Informe o valor.')) return false;
    if (v.valor > r.saldo + 0.004 && !confirm(`O valor passa do saldo devedor (${dinheiro(r.saldo)}). Continuar?`)) return false;
    checarMes(v.data);
    const lid = Fin.novoId('l'), m = { id: Fin.novoId('m'), tipo: 'pagamento', valor: v.valor, data: v.data, conta: v.conta, forma: v.forma, obs: v.obs, lancamentoId: lid, em: Date.now(), por: Fin.usuario() };
    await Fin.lote([
      { op: 'replace', col: 'fin_lancamentos', id: lid, dados: { tipo: 'entrada', data: v.data, valor: v.valor, conta: v.conta, forma: v.forma, categoria: 'Recebimento de fiado', descricao: `Fiado — ${f.nome}`, pessoa: f.nome, obs: v.obs, origem: 'fiado', refId: id, criadoEm: Date.now(), criadoPor: Fin.usuario() } },
      { op: 'set', col: 'fin_fiados', id, dados: { movimentos: (f.movimentos || []).concat([m]) } }]);
    const resta = r2(r.saldo - v.valor);
    toast(resta <= 0.004 ? 'Fiado quitado! ✅' : `Pagamento lançado. Resta ${dinheiro(resta)}.`);
    if (f.telefone) setTimeout(() => { if (confirm(resta <= 0.004 ? 'Enviar mensagem de quitação no WhatsApp?' : 'Enviar recibo do pagamento no WhatsApp?')) whatsFiado(id, 'quitacao', v.valor); }, 300);
  }, { ok: 'Lançar pagamento' });
}
function extratoFiado(id) {
  const f = S.fiados.find(x => x.id === id); if (!f) return;
  const r = F.resumoFiado(f, hoje());
  let s = 0;
  const movs = (f.movimentos || []).slice().sort((a, b) => a.data.localeCompare(b.data) || a.em - b.em).map(m => { s += m.cancelado ? 0 : m.tipo === 'compra' ? m.valor : -m.valor; return Object.assign({ saldo: r2(s) }, m); });
  $('verBox').innerHTML = `<div class="barraTopo"><h2>📄 Extrato — ${esc(f.nome)}</h2><button class="btn sm sec" onclick="fechar('mVer')">Fechar</button></div>
    <div class="muted">${f.telefone ? Clientes.fmtTel(f.telefone) : ''} • limite ${r.limite ? dinheiro(r.limite) : 'sem limite'} • comprou ${dinheiro(r.totalCompras)} • pagou ${dinheiro(r.totalPago)}</div>
    <div class="rolar" style="margin-top:8px"><table><tr><th>Data</th><th>Lançamento</th><th class="r">Valor</th><th class="r">Saldo</th><th></th></tr>
    ${movs.map(m => `<tr><td>${br(m.data)}</td><td>${m.tipo === 'compra' ? `🛒 ${esc(m.descricao || 'Compra')}${m.pedido ? ` <span class="tag">pedido #${m.pedido}</span>` : ''}${m.cancelado ? ' <span class="tag verm">estornado (pedido cancelado)</span>' : ''}${m.vencimento ? `<div class="muted">vence ${br(m.vencimento)}</div>` : ''}` : `💵 Pagamento ${FORMAS[m.forma] || ''}${m.obs ? `<div class="muted">${esc(m.obs)}</div>` : ''}`}</td>
      <td class="r">${sinal(m.valor, m.tipo === 'compra' ? 'saida' : 'entrada')}</td><td class="r"><b>${dinheiro(m.saldo)}</b></td><td><button class="btn sm sec" title="Excluir (lançado errado)" onclick="excluirMovFiado('${id}','${m.id}')">🗑️</button></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Sem movimentos.</td></tr>'}
    <tr class="tot"><td colspan="3">Saldo devedor</td><td class="r">${dinheiro(r.saldo)}</td><td></td></tr></table></div>
    ${f.telefone ? `<div style="display:flex;gap:8px;margin-top:12px"><button class="btn wa sm" onclick="whatsFiado('${id}','cobranca')">💬 Cobrar</button><button class="btn wa sm" onclick="whatsFiado('${id}','extrato')">💬 Enviar extrato</button></div>` : ''}`;
  $('mVer').classList.add('on');
}
async function excluirMovFiado(id, mid) {
  const f = S.fiados.find(x => x.id === id), m = f && (f.movimentos || []).find(x => x.id === mid); if (!m) return;
  if (!confirm(`Excluir ${m.tipo === 'compra' ? 'a compra' : 'o pagamento'} de ${dinheiro(m.valor)} (${br(m.data)})?${m.lancamentoId ? ' A entrada no caixa também será apagada.' : ''}`)) return;
  try {
    if (m.lancamentoId) checarMes(m.data);
    const ops = [{ op: 'set', col: 'fin_fiados', id, dados: { movimentos: f.movimentos.filter(x => x.id !== mid) } }];
    if (m.lancamentoId) ops.push({ op: 'delete', col: 'fin_lancamentos', id: m.lancamentoId });
    await Fin.lote(ops); fechar('mVer'); toast('Excluído.');
  } catch (e) { erro(e); }
}
function msgFiado(f, tipo, valor) {
  const r = F.resumoFiado(f, hoje()), nome = (f.nome || '').split(' ')[0], loja = CONFIG.loja.nome;
  if (tipo === 'quitacao') return r.saldo <= 0.004
    ? `Olá, ${nome}! 😊\nRecebemos seu pagamento${valor ? ` de *${dinheiro(valor)}*` : ''}. Seu crediário no *${loja}* está *quitado* ✅.\n\nMuito obrigado pela confiança e pela parceria! Quando bater a fome, é só chamar. 🍕`
    : `Olá, ${nome}! 😊\nRecebemos seu pagamento de *${dinheiro(valor)}*. Obrigado!\nSaldo restante no crediário: *${dinheiro(r.saldo)}*.\n\n${loja} 🍕`;
  if (tipo === 'extrato') return `Olá, ${nome}! Segue o resumo do seu crediário no *${loja}*:\n\n` + (f.movimentos || []).slice().sort((a, b) => a.data.localeCompare(b.data))
    .map(m => `${br(m.data)} • ${m.tipo === 'compra' ? 'Compra' : 'Pagamento'}${m.descricao ? ' (' + m.descricao + ')' : ''}: ${m.tipo === 'compra' ? '' : '−'}${dinheiro(m.valor)}`).join('\n') + `\n\n*Saldo: ${dinheiro(r.saldo)}*`;
  return `Olá, ${nome}! Tudo bem? 😊\nAqui é do *${loja}*. Passando para lembrar, com carinho, do seu saldo em aberto no crediário: *${dinheiro(r.saldo)}*` +
    `${r.vencimento ? ` (vencimento combinado: ${br(r.vencimento)})` : ''}.\n\nPode pagar por Pix (chave: ${CONFIG.pix.chave}) ou em dinheiro na próxima compra.` +
    `\nSe já pagou, por favor desconsidere esta mensagem. Muito obrigado! 🍕`;
}
function whatsFiado(id, tipo, valor) {
  const f = S.fiados.find(x => x.id === id); if (!f || !f.telefone) return;
  telWhats = f.telefone;
  $('wNome').textContent = f.nome; $('wTel').textContent = Clientes.fmtTel(f.telefone);
  $('wTexto').value = msgFiado(f, tipo, valor);
  $('mWhats').classList.add('on');
}
function csvFiados() {
  const h = hoje();
  baixarCSV('fiados.csv', [['Cliente', 'Telefone', 'Limite', 'Comprou', 'Pagou', 'Saldo', 'Vencimento', 'Dias em atraso', '0-30 dias', '31-60 dias', '60+ dias']]
    .concat(S.fiados.map(f => { const r = F.resumoFiado(f, h); return [f.nome, f.telefone || '', r.limite || '', r.totalCompras, r.totalPago, r.saldo, r.vencimento ? br(r.vencimento) : '', r.atraso, r.idade.a30, r.idade.a60, r.idade.mais]; })));
}

/* ================= FUNCIONÁRIOS / FOLHA ================= */
function renderFunc() {
  const l = S.funcs.filter(f => $('fuInativos').checked || f.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const pend = S.folha.filter(i => i.tipo !== 'folha' && !i.folhaId);
  $('listaFunc').innerHTML = l.length ? l.map(f => {
    const [de, ate] = F.periodoFolha(f.tipoPagamento, hoje(), f.diaPagamento);
    const prev = F.calcularFolha(f, de, ate, S.folha, pedidos);
    const p = pend.filter(i => i.funcionarioId === f.id);
    return `<div class="item"><div><b>${esc(f.nome)}</b> ${f.ativo === false ? '<span class="tag">inativo</span>' : ''} <span class="muted">${esc(f.funcao || '')}</span>
      <div class="muted">${F.TIPOS_PAG[f.tipoPagamento] || ''} • ${f.tipoPagamento === 'diaria' ? `${dinheiro(f.valor)}/dia` : dinheiro(f.valor)}${f.entregadorNome ? ` • 🛵 ${esc(f.entregadorNome)}${f.comissaoEntrega ? ` (${dinheiro(f.comissaoEntrega)}/entrega)` : ''}${f.comissaoTaxaPct ? ` (${pct(f.comissaoTaxaPct)} da taxa)` : ''}` : ''}${f.pix ? ` • Pix ${esc(f.pix)}` : ''}</div>
      <div class="muted">Período atual ${br(de)}–${br(ate)}: ${f.tipoPagamento === 'diaria' ? `${prev.dias} dia(s) • ` : ''}${prev.entregas ? `${prev.entregas} entrega(s) • ` : ''}${p.length ? `${p.length} vale/desc./bônus pendente(s) • ` : ''}líquido previsto <b>${dinheiro(prev.liquido)}</b></div></div>
      <div class="acoes">${f.tipoPagamento === 'diaria' ? `<button class="btn sm sec" onclick="diarias('${f.id}')">📅 Diárias</button>` : ''}
        <button class="btn sm sec" onclick="itemFolha('${f.id}','vale')">💸 Vale</button><button class="btn sm sec" onclick="itemFolha('${f.id}','desconto')">➖ Desconto</button><button class="btn sm sec" onclick="itemFolha('${f.id}','bonus')">➕ Bônus</button>
        <button class="btn sm dark" onclick="gerarFolha('${f.id}')">🧾 Gerar folha</button><button class="btn sm sec" onclick="editarFunc('${f.id}')">✏️</button></div></div>`;
  }).join('') : '<div class="vazio">Nenhum funcionário cadastrado.</div>';
  renderFolhas(); renderItensFolha();
}
const nomesEntregadores = () => [...new Set(Equipe.entregadores().map(e => e.nome).concat(pedidos.filter(p => p.entregador && p.entregador.nome).map(p => p.entregador.nome)))].sort();
function editarFunc(id) {
  const f = id ? S.funcs.find(x => x.id === id) : { ativo: true, tipoPagamento: 'semanal', diaPagamento: 6, admissao: hoje() };
  abrirForm(id ? `✏️ ${f.nome}` : '➕ Novo funcionário', [
    { k: 'nome', l: 'Nome', v: f.nome }, { k: 'funcao', l: 'Função', v: f.funcao, ph: 'pizzaiolo, atendente, entregador…' },
    { k: 'telefone', l: 'Telefone (WhatsApp)', v: f.telefone ? Clientes.fmtTel(f.telefone) : '' }, { k: 'pix', l: 'Chave Pix', v: f.pix },
    { k: 'admissao', l: 'Data de admissão', t: 'date', v: f.admissao }, { k: 'tipoPagamento', l: 'Tipo de pagamento', t: 'select', op: Object.entries(F.TIPOS_PAG), v: f.tipoPagamento, on: 'formFunc()' },
    { k: 'valor', l: 'Valor por período (R$)', t: 'number', v: f.valor },
    { k: 'diaPagamento', l: 'Dia do pagamento', t: 'select', op: DIAS_SEM.map((d, i) => [i, d]), v: f.diaPagamento },
    { k: 'diaMes', l: 'Dia do pagamento (dia do mês)', t: 'number', v: f.diaMes || 5 },
    { k: 'diasSemana', l: 'Dias por semana (previsão)', t: 'number', v: f.diasSemana || 4 },
    { k: 'entregadorNome', l: '🛵 É entregador? Nome dele nos pedidos', t: 'select', op: [['', '— não é entregador —']].concat(nomesEntregadores().map(n => [n, n])), v: f.entregadorNome || '' },
    { k: 'comissaoEntrega', l: 'Comissão por entrega (R$)', t: 'number', v: f.comissaoEntrega || '' },
    { k: 'comissaoTaxaPct', l: 'Comissão: % da taxa de entrega', t: 'number', v: f.comissaoTaxaPct || '' },
    { k: 'ativo', l: 'Ativo', t: 'check', v: f.ativo !== false }, { k: 'obs', l: 'Observação', t: 'textarea', w2: true, v: f.obs }
  ], async v => {
    if (!exigir(v.nome, 'Informe o nome.') || !exigir(v.valor > 0, 'Informe o valor.')) return false;
    const tel = Clientes.normTel(v.telefone);
    const doc = Object.assign({}, f, v, { telefone: tel, diaPagamento: Number(v.diaPagamento), dias: f.dias || {}, criadoEm: f.criadoEm || Date.now() });
    delete doc.id;
    await Fin.substituir('fin_funcionarios', id || Fin.novoId('fu'), doc);
    toast('Funcionário salvo.');
  }, { aoAbrir: formFunc });
}
function formFunc() {
  const t = $('ff_tipoPagamento').value;
  $('box_diaPagamento').classList.toggle('hide', !(t === 'semanal' || t === 'diaria'));
  $('box_diaMes').classList.toggle('hide', t !== 'mensal');
  $('box_diasSemana').classList.toggle('hide', t !== 'diaria');
  document.querySelector('label[for=ff_valor]').textContent = t === 'diaria' ? 'Valor da diária (R$)' : `Valor ${t === 'semanal' ? 'por semana' : t === 'quinzenal' ? 'por quinzena' : 'por mês'} (R$)`;
}
let semanaRef = null;
function diarias(id, mover) {
  const f = S.funcs.find(x => x.id === id); if (!f) return;
  if (!mover) semanaRef = F.periodoFolha('semanal', hoje(), f.diaPagamento)[0];
  else semanaRef = F.addDias(semanaRef, mover * 7);
  diarias.dias = Object.assign({}, f.dias || {}); diarias.id = id;
  desenharDiarias();
  $('mVer').classList.add('on');
}
function desenharDiarias() {
  const f = S.funcs.find(x => x.id === diarias.id), d = diarias.dias;
  const dias = Array.from({ length: 7 }, (_, i) => F.addDias(semanaRef, i));
  const tot = dias.reduce((t, x) => t + (Number(d[x]) || 0), 0);
  $('verBox').innerHTML = `<h2>📅 Diárias — ${esc(f.nome)}</h2><div class="muted">Toque no dia: vazio → dia inteiro → meio dia → vazio. Diária ${dinheiro(f.valor)}.</div>
    <div class="barraTopo" style="margin-top:10px"><button class="btn sm sec" onclick="diarias('${f.id}',-1)">◀ Semana anterior</button><b>${br(dias[0])} a ${br(dias[6])}</b><button class="btn sm sec" onclick="diarias('${f.id}',1)">Próxima ▶</button></div>
    <div class="semana">${dias.map(x => { const q = Number(d[x]) || 0; return `<button class="${q === 1 ? 'd1' : q ? 'dm' : ''}" onclick="marcarDia('${x}')">${DIAS_SEM[new Date(x + 'T12:00').getDay()]}<b>${x.slice(8)}</b>${q === 1 ? '✔ dia' : q ? '½ dia' : '—'}</button>`; }).join('')}</div>
    <div class="linha total"><span>${tot} dia(s) na semana</span><b>${dinheiro(tot * (f.valor || 0))}</b></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn sec" onclick="fechar('mVer')">Fechar</button><button class="btn" style="flex:1" onclick="salvarDiarias()">Salvar dias</button></div>`;
}
function marcarDia(x) { const q = Number(diarias.dias[x]) || 0; if (!q) diarias.dias[x] = 1; else if (q === 1) diarias.dias[x] = 0.5; else delete diarias.dias[x]; desenharDiarias(); }
async function salvarDiarias() {
  const f = S.funcs.find(x => x.id === diarias.id);
  try { const { id, ...doc } = f; await Fin.substituir('fin_funcionarios', id, Object.assign(doc, { dias: diarias.dias })); fechar('mVer'); toast('Dias salvos.'); } catch (e) { erro(e); }
}
function itemFolha(fid, tipo) {
  const f = S.funcs.find(x => x.id === fid); if (!f) return;
  const nomes = { vale: '💸 Vale / adiantamento', desconto: '➖ Desconto', bonus: '➕ Bônus / comissão' };
  const campos = [{ k: 'valor', l: 'Valor (R$)', t: 'number' }, { k: 'data', l: 'Data', t: 'date', v: hoje() }, { k: 'descricao', l: 'Descrição', w2: true, ph: tipo === 'desconto' ? 'ex.: falta, consumo' : tipo === 'bonus' ? 'ex.: meta batida' : 'ex.: adiantamento' }];
  if (tipo === 'vale') campos.push({ k: 'conta', l: 'Saiu da conta', t: 'select', op: opContas(), v: contaCaixa() }, { k: 'forma', l: 'Forma', t: 'select', op: opFormas(), v: 'dinheiro' });
  abrirForm(`${nomes[tipo]} — ${f.nome}`, campos, async v => {
    if (!exigir(v.valor > 0, 'Informe o valor.')) return false;
    const iid = Fin.novoId('it'), ops = [], doc = { tipo, funcionarioId: fid, nome: f.nome, valor: v.valor, data: v.data, descricao: v.descricao, folhaId: null, criadoEm: Date.now() };
    if (tipo === 'vale') {   // dinheiro saiu agora → saída no fluxo; na folha é descontado do líquido
      checarMes(v.data);
      const lid = Fin.novoId('l'); doc.lancamentoId = lid;
      ops.push({ op: 'replace', col: 'fin_lancamentos', id: lid, dados: { tipo: 'saida', data: v.data, valor: v.valor, conta: v.conta, forma: v.forma, categoria: 'Vales/adiantamentos',
        descricao: `Vale — ${f.nome}`, pessoa: f.nome, obs: v.descricao, origem: 'folha', refId: iid, criadoEm: Date.now(), criadoPor: Fin.usuario() } });
    }
    ops.push({ op: 'replace', col: 'fin_folha', id: iid, dados: doc });
    await Fin.lote(ops); toast(tipo === 'vale' ? 'Vale lançado (saída no caixa; será descontado na folha).' : 'Lançado; entra na próxima folha.');
  });
}
function renderItensFolha() {
  const st = $('itStatus').value, l = S.folha.filter(i => i.tipo !== 'folha' && (!st || !i.folhaId)).sort((a, b) => b.data.localeCompare(a.data));
  const nm = { vale: '💸 Vale', desconto: '➖ Desconto', bonus: '➕ Bônus' };
  $('tabItens').innerHTML = l.length ? `<table><tr><th>Data</th><th>Funcionário</th><th>Tipo</th><th>Descrição</th><th class="r">Valor</th><th>Folha</th><th></th></tr>
    ${l.map(i => `<tr><td>${br(i.data)}</td><td>${esc(i.nome)}</td><td>${nm[i.tipo]}</td><td>${esc(i.descricao || '')}</td><td class="r">${dinheiro(i.valor)}</td>
      <td>${i.folhaId ? '<span class="tag verde">na folha</span>' : '<span class="tag amar">pendente</span>'}</td><td>${i.folhaId ? '' : `<button class="btn sm sec" onclick="excluirItemFolha('${i.id}')">🗑️</button>`}</td></tr>`).join('')}</table>`
    : '<div class="vazio">Nada pendente.</div>';
}
async function excluirItemFolha(id) {
  const i = S.folha.find(x => x.id === id); if (!i || !confirm(`Excluir ${i.tipo} de ${dinheiro(i.valor)} (${i.nome})?${i.lancamentoId ? ' A saída no caixa também será apagada.' : ''}`)) return;
  try { if (i.lancamentoId) checarMes(i.data); const ops = [{ op: 'delete', col: 'fin_folha', id }]; if (i.lancamentoId) ops.push({ op: 'delete', col: 'fin_lancamentos', id: i.lancamentoId }); await Fin.lote(ops); } catch (e) { erro(e); }
}
function gerarFolha(fid) {
  const f = S.funcs.find(x => x.id === fid); if (!f) return;
  const [de, ate] = F.periodoFolha(f.tipoPagamento, hoje(), f.diaPagamento);
  abrirForm(`🧾 Folha — ${f.nome}`, [{ k: 'de', l: 'De', t: 'date', v: de, on: 'prevFolha()' }, { k: 'ate', l: 'Até', t: 'date', v: ate, on: 'prevFolha()' }],
    async v => {
      if (!exigir(v.de && v.ate && v.de <= v.ate, 'Período inválido.')) return false;
      const sobre = S.folha.find(x => x.tipo === 'folha' && x.funcionarioId === fid && x.de <= v.ate && x.ate >= v.de);
      if (sobre && !confirm(`Já existe folha de ${br(sobre.de)} a ${br(sobre.ate)} para ${f.nome}. Gerar outra mesmo assim?`)) return false;
      await salvarFolha(f, v.de, v.ate); toast('Folha gerada. Confira e toque em "Pagar".');
    }, { ok: 'Gerar folha', topo: '<div id="prevFolhaBox"></div>', aoAbrir: () => { prevFolha.f = f; prevFolha(); } });
}
function prevFolha() {
  const v = valoresForm(); if (!v.de || !v.ate) return;
  $('prevFolhaBox').innerHTML = tabelaFolha(F.calcularFolha(prevFolha.f, v.de, v.ate, S.folha, pedidos));
}
function tabelaFolha(x) {
  const lin = (n, v, cls = '') => `<div class="linha ${cls}"><span>${n}</span><b>${v}</b></div>`;
  return `<div class="card" style="margin:0 0 8px;padding:10px 14px">${x.tipoPagamento === 'diaria' ? lin(`Diárias: ${x.dias} × ${dinheiro(x.valorBase)}`, dinheiro(x.base)) : lin(`Salário ${(F.TIPOS_PAG[x.tipoPagamento] || '').toLowerCase()}`, dinheiro(x.base))}
    ${x.entregas || x.comissao ? lin(`Comissão: ${x.entregas} entrega(s)`, dinheiro(x.comissao)) : ''}${x.bonus ? lin('Bônus', dinheiro(x.bonus)) : ''}
    ${lin('Bruto', dinheiro(x.bruto))}${x.vales ? lin('(−) Vales/adiantamentos', '−' + dinheiro(x.vales)) : ''}${x.descontos ? lin('(−) Descontos', '−' + dinheiro(x.descontos)) : ''}
    ${lin('Líquido a pagar', dinheiro(x.liquido), 'total')}</div>`;
}
async function salvarFolha(f, de, ate) {
  const x = F.calcularFolha(f, de, ate, S.folha, pedidos), id = Fin.novoId('fo');
  await Fin.lote([{ op: 'replace', col: 'fin_folha', id, dados: Object.assign(x, { tipo: 'folha', status: 'aberta', criadoEm: Date.now(), telefone: f.telefone || '', funcao: f.funcao || '', pix: f.pix || '' }) }]
    .concat(x.itensIds.map(i => ({ op: 'set', col: 'fin_folha', id: i, dados: { folhaId: id } }))));
  return id;
}
async function gerarTodas() {
  const ativos = S.funcs.filter(f => f.ativo !== false);
  const plano = ativos.map(f => { const [de, ate] = F.periodoFolha(f.tipoPagamento, hoje(), f.diaPagamento); return { f, de, ate, ja: S.folha.some(x => x.tipo === 'folha' && x.funcionarioId === f.id && x.de === de && x.ate === ate) }; });
  const novos = plano.filter(p => !p.ja);
  if (!novos.length) return toast('Todas as folhas do período atual já foram geradas.');
  if (!confirm(`Gerar a folha do período atual de ${novos.length} funcionário(s)?\n\n${novos.map(p => `${p.f.nome}: ${br(p.de)} a ${br(p.ate)}`).join('\n')}`)) return;
  try { for (const p of novos) await salvarFolha(p.f, p.de, p.ate); toast(`${novos.length} folha(s) gerada(s).`); } catch (e) { erro(e); }
}
function renderFolhas() {
  const st = $('foStatus').value, l = S.folha.filter(x => x.tipo === 'folha' && (!st || x.status === st)).sort((a, b) => b.ate.localeCompare(a.ate) || a.nome.localeCompare(b.nome));
  const tot = l.reduce((t, x) => t + x.liquido, 0);
  $('tabFolhas').innerHTML = l.length ? `<table><tr><th>Funcionário</th><th>Período</th><th class="r">Bruto</th><th class="r">Vales</th><th class="r">Descontos</th><th class="r">Líquido</th><th>Situação</th><th></th></tr>
    ${l.map(x => `<tr><td><b>${esc(x.nome)}</b><div class="muted">${F.TIPOS_PAG[x.tipoPagamento] || ''}${x.entregas ? ` • ${x.entregas} entrega(s)` : ''}${x.tipoPagamento === 'diaria' ? ` • ${x.dias} dia(s)` : ''}</div></td>
      <td style="white-space:nowrap">${br(x.de)} a ${br(x.ate)}</td><td class="r">${dinheiro(x.bruto)}</td><td class="r">${x.vales ? '−' + dinheiro(x.vales) : '—'}</td><td class="r">${x.descontos ? '−' + dinheiro(x.descontos) : '—'}</td>
      <td class="r"><b>${dinheiro(x.liquido)}</b></td><td>${x.status === 'paga' ? `<span class="tag verde">paga ${br(x.pagoEm)}</span>` : '<span class="tag amar">a pagar</span>'}</td>
      <td style="white-space:nowrap">${x.status === 'aberta' ? `<button class="btn sm" style="background:var(--ok)" onclick="pagarFolha('${x.id}')">Pagar</button> <button class="btn sm sec" title="Excluir" onclick="excluirFolha('${x.id}')">🗑️</button>`
        : `<button class="btn sm sec" onclick="desfazerFolha('${x.id}')">↩️</button>`} <button class="btn sm sec" title="Recibo" onclick="recibo('${x.id}')">🖨️</button>${x.telefone ? ` <button class="btn sm wa" onclick="whatsFolha('${x.id}')">💬</button>` : ''}</td></tr>`).join('')}
    <tr class="tot"><td colspan="5">${l.length} folha(s)</td><td class="r">${dinheiro(tot)}</td><td colspan="2"></td></tr></table>`
    : '<div class="vazio">Nenhuma folha neste filtro.</div>';
}
function pagarFolha(id) {
  const x = S.folha.find(f => f.id === id); if (!x) return;
  abrirForm(`💸 Pagar folha — ${x.nome}`, [{ k: 'data', l: 'Data do pagamento', t: 'date', v: hoje() }, { k: 'conta', l: 'Saiu da conta', t: 'select', op: opContas(), v: x.pix ? 'pix' : contaCaixa() },
    { k: 'forma', l: 'Forma', t: 'select', op: opFormas(), v: x.pix ? 'pix' : 'dinheiro' }], async v => {
    checarMes(v.data);
    const ops = [], up = { status: 'paga', pagoEm: v.data, conta: v.conta, forma: v.forma };
    if (x.liquido > 0) {
      const lid = Fin.novoId('l'); up.lancamentoId = lid;
      ops.push({ op: 'replace', col: 'fin_lancamentos', id: lid, dados: { tipo: 'saida', data: v.data, valor: x.liquido, conta: v.conta, forma: v.forma, categoria: x.tipoPagamento === 'diaria' ? 'Diárias' : 'Salários',
        descricao: `Folha ${x.nome} (${br(x.de)} a ${br(x.ate)})`, pessoa: x.nome, origem: 'folha', refId: id, criadoEm: Date.now(), criadoPor: Fin.usuario() } });
    }
    ops.push({ op: 'set', col: 'fin_folha', id, dados: up });
    await Fin.lote(ops); toast(`Folha paga: ${dinheiro(x.liquido)} lançado como saída.`);
  }, { ok: 'Confirmar pagamento', topo: tabelaFolha(x) });
}
async function excluirFolha(id) {
  const x = S.folha.find(f => f.id === id); if (!x || !confirm(`Excluir a folha de ${x.nome} (${br(x.de)} a ${br(x.ate)})? Vales/descontos/bônus voltam a ficar pendentes.`)) return;
  try { await Fin.lote([{ op: 'delete', col: 'fin_folha', id }].concat(S.folha.filter(i => i.folhaId === id).map(i => ({ op: 'set', col: 'fin_folha', id: i.id, dados: { folhaId: null } })))); } catch (e) { erro(e); }
}
async function desfazerFolha(id) {
  const x = S.folha.find(f => f.id === id); if (!x || !confirm(`Desfazer o pagamento da folha de ${x.nome}? A saída no caixa será apagada.`)) return;
  try { checarMes(x.pagoEm); const ops = [{ op: 'set', col: 'fin_folha', id, dados: { status: 'aberta', pagoEm: null, lancamentoId: null } }]; if (x.lancamentoId) ops.push({ op: 'delete', col: 'fin_lancamentos', id: x.lancamentoId }); await Fin.lote(ops); } catch (e) { erro(e); }
}
function textoRecibo(x, larg) {
  const L = (a, b) => { const s = String(b); return a + ' '.repeat(Math.max(1, larg - a.length - s.length)) + s; }, hr = '-'.repeat(larg);
  const itens = S.folha.filter(i => i.folhaId === x.id);
  return [CONFIG.loja.nome.toUpperCase(), 'RECIBO DE PAGAMENTO', hr, `Funcionário: ${x.nome}`, x.funcao ? `Função: ${x.funcao}` : '', `Período: ${br(x.de)} a ${br(x.ate)}`, `Tipo: ${F.TIPOS_PAG[x.tipoPagamento] || ''}`, hr,
    x.tipoPagamento === 'diaria' ? L(`Diárias ${x.dias} x ${dinheiro(x.valorBase)}`, dinheiro(x.base)) : L('Salário', dinheiro(x.base)),
    x.comissao ? L(`Comissão ${x.entregas} entrega(s)`, dinheiro(x.comissao)) : '', x.bonus ? L('Bônus', dinheiro(x.bonus)) : '', L('BRUTO', dinheiro(x.bruto)),
    ...itens.filter(i => i.tipo !== 'bonus').map(i => L(`(-) ${i.tipo === 'vale' ? 'Vale' : 'Desc.'} ${br(i.data).slice(0, 5)}`, dinheiro(i.valor))), hr,
    L('LÍQUIDO', dinheiro(x.liquido)), x.status === 'paga' ? `Pago em ${br(x.pagoEm)} (${(FORMAS[x.forma] || x.forma || '').replace(/^\S+\s/, '')})` : 'A PAGAR', '',
    'Declaro ter recebido a importância', 'líquida acima.', '', '', '_'.repeat(Math.min(larg, 32)), x.nome].filter(s => s !== '').join('\n');
}
async function recibo(id) {
  const x = S.folha.find(f => f.id === id); if (!x) return;
  const fmt = await escolher('🖨️ Recibo', 'Tamanho do papel', [['58', 'Térmica 58 mm', 'dark'], ['80', 'Térmica 80 mm'], ['a4', 'Folha A4']]);
  if (!fmt) return;
  const t = $('ticketPrint');
  t.className = 'print-only ' + (fmt === '80' ? 'm80' : fmt === 'a4' ? 'a4' : '');
  t.textContent = textoRecibo(x, fmt === '80' ? 48 : fmt === 'a4' ? 60 : (CONFIG.impressora || {}).colunas || 32);
  setTimeout(() => window.print(), 50);
}
function whatsFolha(id) {
  const x = S.folha.find(f => f.id === id); if (!x) return;
  telWhats = x.telefone; $('wNome').textContent = x.nome; $('wTel').textContent = Clientes.fmtTel(x.telefone);
  $('wTexto').value = `Olá, ${x.nome.split(' ')[0]}! Segue o resumo do seu pagamento:\n\n\`\`\`\n${textoRecibo(x, 32)}\n\`\`\``;
  $('mWhats').classList.add('on');
}
function csvFolha() {
  baixarCSV('folha.csv', [['Funcionário', 'Tipo', 'De', 'Até', 'Dias', 'Entregas', 'Base', 'Comissão', 'Bônus', 'Bruto', 'Vales', 'Descontos', 'Líquido', 'Situação', 'Pago em']]
    .concat(S.folha.filter(x => x.tipo === 'folha').sort((a, b) => a.de.localeCompare(b.de)).map(x => [x.nome, F.TIPOS_PAG[x.tipoPagamento] || '', br(x.de), br(x.ate), x.dias, x.entregas, x.base, x.comissao, x.bonus, x.bruto, x.vales, x.descontos, x.liquido, x.status, x.pagoEm ? br(x.pagoEm) : ''])));
}

/* ================= RELATÓRIOS ================= */
const PER_REL = [['mes', 'Este mês'], ['mesPassado', 'Mês passado'], ['3m', 'Últimos 3 meses'], ['ano', 'Este ano']];
function intervaloRel() {
  const m = mesAtual();
  if (relPeriodo === 'mes') return [F.inicioMes(m), F.fimDoMes(m)];
  if (relPeriodo === 'mesPassado') { const a = F.addMes(m, -1); return [F.inicioMes(a), F.fimDoMes(a)]; }
  if (relPeriodo === '3m') return [F.inicioMes(F.addMes(m, -2)), F.fimDoMes(m)];
  if (relPeriodo === 'ano') return [m.slice(0, 4) + '-01-01', m.slice(0, 4) + '-12-31'];
  return [$('rDe').value, $('rAte').value];
}
async function renderRel() {
  $('rPeriodos').innerHTML = PER_REL.map(([k, n]) => `<span class="chip ${k === relPeriodo ? 'on' : ''}" onclick="relPeriodo='${k}';renderRel()">${n}</span>`).join('');
  const [de, ate] = intervaloRel();
  if (!de || !ate || de > ate) return toast('Período inválido.');
  $('rDe').value = de; $('rAte').value = ate;
  if (!$('rMes').value) $('rMes').value = mesAtual();
  if (pedidosDe && de < pedidosDe) { $('rStatus').textContent = 'Carregando pedidos do período...'; await garantirPedidos(de); return; }
  $('rStatus').textContent = `${br(de)} a ${br(ate)} • vendas dos pedidos a partir de ${br(desdeVendas())}`;
  renderFluxo(); renderDre(); renderCat(); renderPrev(); render6m(); renderFolhaRel(); renderIdade(); renderConsumo();
}
function saldoAntes(de) { const s = F.saldos(contasFin(), todosLanc(), F.addDias(de, -1)); return saldoTotal(s); }
function graficoBarras(pontos, series) {   // pontos: [{ rot, vals: [..], dica }]
  const max = Math.max(1, ...pontos.flatMap(p => p.vals));
  return `<div class="legenda">${series.map(s => `<span><i style="background:${s.cor}"></i>${s.nome}</span>`).join('')}</div>
    <div class="graf">${pontos.map(p => `<div class="col" data-dica="${esc(p.dica)}">${p.vals.map((v, i) => `<i style="height:${(v / max * 100).toFixed(1)}%;background:${series[i].cor}"></i>`).join('')}</div>`).join('')}</div>
    <div class="grafRot">${pontos.map((p, i) => `<span>${pontos.length > 16 && i % Math.ceil(pontos.length / 12) ? '' : p.rot}</span>`).join('')}</div>`;
}
document.addEventListener('mousemove', e => {
  const c = e.target.closest && e.target.closest('[data-dica]'), d = $('dica');
  if (!c) { d.style.display = 'none'; return; }
  d.textContent = c.dataset.dica; d.style.display = 'block';
  d.style.left = Math.min(e.clientX + 12, innerWidth - d.offsetWidth - 8) + 'px'; d.style.top = (e.clientY + 14) + 'px';
});
const COR_E = '#15803d', COR_S = '#b91c1c';
function dadosFluxo() {
  const [de, ate] = intervaloRel(), d = F.fluxo(todosLanc(), de, ate, saldoAntes(de));
  return $('rFluxoModo').value === 'm' ? F.fluxoMensal(d).map(x => Object.assign(x, { rot: brMes(x.mes) })) : d.map(x => Object.assign(x, { rot: x.data.slice(8) + '/' + x.data.slice(5, 7) }));
}
function renderFluxo() {
  const l = dadosFluxo(), [de] = intervaloRel();
  const te = l.reduce((t, x) => t + x.entradas, 0), ts = l.reduce((t, x) => t + x.saidas, 0);
  $('rFluxo').innerHTML = graficoBarras(l.map(x => ({ rot: x.rot, vals: [x.entradas, x.saidas], dica: `${x.rot}\nEntradas ${dinheiro(x.entradas)}\nSaídas ${dinheiro(x.saidas)}\nSaldo ${dinheiro(x.saldo)}` })),
    [{ nome: 'Entradas', cor: COR_E }, { nome: 'Saídas', cor: COR_S }]) +
    `<div class="rolar" style="max-height:320px;overflow-y:auto;margin-top:10px"><table><tr><th>${$('rFluxoModo').value === 'm' ? 'Mês' : 'Dia'}</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Resultado</th><th class="r">Saldo acumulado</th></tr>
    <tr><td class="muted">Saldo em ${br(F.addDias(de, -1))}</td><td></td><td></td><td></td><td class="r">${dinheiro(saldoAntes(de))}</td></tr>
    ${l.filter(x => x.entradas || x.saidas || $('rFluxoModo').value === 'm').map(x => `<tr><td>${x.rot}</td><td class="r pos">${dinheiro(x.entradas)}</td><td class="r neg">${dinheiro(x.saidas)}</td><td class="r">${corV(x.entradas - x.saidas)}</td><td class="r"><b>${corV(x.saldo)}</b></td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td class="r">${dinheiro(te)}</td><td class="r">${dinheiro(ts)}</td><td class="r">${corV(te - ts)}</td><td class="r">${l.length ? dinheiro(l[l.length - 1].saldo) : ''}</td></tr></table></div>`;
}
function csvFluxo() {
  const [de, ate] = intervaloRel();
  baixarCSV(`fluxo_${de}_a_${ate}.csv`, [['Período', 'Entradas', 'Saídas', 'Resultado', 'Saldo acumulado']].concat(dadosFluxo().map(x => [x.rot, x.entradas, x.saidas, r2(x.entradas - x.saidas), x.saldo])));
}
// Custo do item: gravado na venda; senão cadastro/ficha atual (como nos relatórios da Gestão)
function custoItem(it) {
  if (it.custoUnitario != null && (it.custoUnitario || it.custoExtras)) return it.custoUnitario + (it.custoExtras || 0);
  if (it.tipo === 'produto') { const d = Catalogo.doc(it.id); if (d && (d.custoUnitario || d.custosExtras)) return (d.custoUnitario || 0) + (d.custosExtras || 0); }
  if (it.tipo === 'pizza') { let f = null; try { f = Ficha.custoItem(it); } catch { } const c = f != null ? f : Catalogo.custoPizza(it); if (c) return c; }
  return null;
}
function cmvPedidos(ped) {
  let cmv = 0, rc = 0, rt = 0, pizzas = 0;
  ped.filter(F.valido).forEach(p => (p.itens || []).forEach(it => {
    const q = it.qtd || 1, rec = (it.preco != null ? it.preco : (window.Preco ? Preco.unitario(it) : 0)) * q;
    rt += rec; if (it.tipo === 'pizza') pizzas += q;
    const c = custoItem(it); if (c == null) return;
    cmv += c * q; rc += rec;
  }));
  return { valor: r2(cmv), cobertura: rt ? rc / rt * 100 : null, pizzas };
}
function dreMes(m) {
  const de = F.inicioMes(m), ate = F.fimDoMes(m), ped = pedidos.filter(p => p.data >= de && p.data <= ate);
  const fiadosSem = S.fiados.reduce((t, f) => t + (f.movimentos || []).filter(x => x.tipo === 'compra' && !x.pedido && x.data >= de && x.data <= ate).reduce((a, x) => a + x.valor, 0), 0);
  const cm = cmvPedidos(ped), consumo = F.resumoConsumo(ped, custoItem);
  const d = F.dre({ pedidos: ped.filter(p => p.data >= desdeVendas()), lanc: S.lanc.filter(l => l.data >= de && l.data <= ate), cats: cfg().categorias, taxaCartaoPct: taxaCartao(), cmvPedidos: cm, fiadosSemPedido: fiadosSem, consumo });
  d.pizzas = cm.pizzas;
  return d;
}
function renderDre() {
  const m = $('rMes').value || mesAtual(), d = dreMes(m);
  const row = (n, v, cls = '', extra = '') => `<tr class="${cls}"><td>${n}</td><td class="r">${v == null ? '<span class="muted">não disponível</span>' : (typeof v === 'string' ? v : dinheiro(v))}</td><td class="r muted">${extra}</td></tr>`;
  const p = v => d.receita ? pct(v / d.receita * 100) : '';
  const linhasGrupo = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => row(esc(k), -v, 'sub', p(v))).join('');
  $('rDre').innerHTML = `<table class="dre"><tr><th>${brMes(m)}</th><th class="r">R$</th><th class="r">% receita</th></tr>
    ${row('Receita de vendas', d.receita, '', '100%')}${row('Pedidos (site + balcão)', d.vendasPedidos, 'sub')}${d.vendasManuais ? row('Vendas lançadas à mão', d.vendasManuais, 'sub') : ''}${d.fiadosSemPedido ? row('Vendas no fiado sem pedido', d.fiadosSemPedido, 'sub') : ''}
    ${row(`(−) Taxas de cartão/banco <span class="muted">(${pct(taxaCartao())} sobre ${dinheiro(d.cartao)} no cartão)</span>`, -d.taxas, '', p(d.taxas))}
    ${row('(=) Receita líquida', d.receitaLiquida, 'res', p(d.receitaLiquida))}
    ${row(`(−) CMV <span class="muted">${d.cmvFonte === 'pedidos' ? `(custo gravado nos pedidos/fichas; ${pct(d.cmvCobertura)} das vendas com custo)` : d.cmvFonte === 'compras' ? '(pelas compras de insumos/bebidas/embalagens lançadas)' : ''}</span>`, d.cmv == null ? null : -d.cmv, '', d.cmv == null ? '' : p(d.cmv))}
    ${row('(=) Margem bruta', d.margemBruta, 'res', p(d.margemBruta))}
    ${d.consumoTotal ? row('(−) Consumo interno (custo)', -d.consumoTotal, '', p(d.consumoTotal)) + linhasGrupo(d.consumo) : ''}
    ${row('(−) Despesas variáveis', -d.variaveis, '', p(d.variaveis))}${linhasGrupo(d.despesas.variavel)}
    ${row('(−) Despesas fixas', -d.fixas, '', p(d.fixas))}${linhasGrupo(d.despesas.fixa)}
    ${row('(−) Folha', -d.folha, '', p(d.folha))}${linhasGrupo(d.despesas.folha)}
    ${d.outrasReceitas ? row('(+) Outras receitas', d.outrasReceitas, '', p(d.outrasReceitas)) : ''}
    ${row('(=) LUCRO LÍQUIDO', `<span class="${d.lucro < 0 ? 'neg' : 'pos'}">${dinheiro(d.lucro)}</span>`, 'res', d.margem == null ? '' : `margem ${pct(d.margem)}`)}
    ${row(`Retiradas do dono (pró-labore)${d.consumoDono ? ` <span class="muted">— inclui ${dinheiro(d.consumoDono)} de consumo do dono</span>` : ''}`, -d.retiradas, 'sub')}${d.aportes ? row('Aportes do dono', d.aportes, 'sub') : ''}${d.recebimentoFiado ? row('Fiados recebidos (já contados na venda)', d.recebimentoFiado, 'sub') : ''}</table>
    ${d.cmvFonte === 'pedidos' && d.comprasCmv ? `<div class="muted" style="margin-top:6px">Compras de insumos/bebidas/embalagens no mês: ${dinheiro(d.comprasCmv)} (não somadas de novo: o CMV vem do custo dos itens vendidos).</div>` : ''}
    ${d.retiradas > Math.max(0, d.lucro) ? `<div class="alertas" style="margin-top:8px"><div class="al-verm">💸 Retiradas (${dinheiro(d.retiradas)}) maiores que o lucro (${dinheiro(d.lucro)}): o dono está tirando mais do que a pizzaria gera.</div></div>` : ''}`;
  renderPe(m, d);
}
function renderPe(m, d) {
  $('rPeMes').textContent = '— ' + brMes(m);
  const fixosPrev = S.contas.filter(c => c.natureza === 'pagar' && c.status === 'aberta' && F.mesDe(c.vencimento) === m && ['fixa', 'folha'].includes(F.grupoDe(cfg().categorias, 'saida', c.categoria))).reduce((t, c) => t + c.valor, 0);
  const pe = F.pontoEquilibrio(d, { pizzas: d.pizzas, diasAbertos: diasAbertosMes(m), fixos: d.fixas + d.folha + fixosPrev });
  const lin = (n, v) => `<div class="linha"><span>${n}</span><b>${v}</b></div>`;
  $('rPe').innerHTML = pe.faturamento == null ? `<div class="vazio">Sem vendas ou margem de contribuição negativa no mês — não dá para calcular.</div>` :
    `<div class="grade"><div>${lin('Custos fixos do mês (fixas + folha' + (fixosPrev ? ` + ${dinheiro(fixosPrev)} a pagar` : '') + ')', dinheiro(pe.fixos))}${lin('Margem de contribuição', pct(pe.mcPct))}
      ${lin('<b>Faturamento mínimo no mês</b>', dinheiro(pe.faturamento))}${lin(`Por dia (${pe.diasAbertos} dias de atendimento)`, dinheiro(pe.porDia))}</div>
      <div>${lin('Valor médio por pizza vendida', pe.porPizza ? dinheiro(pe.porPizza) : '—')}${lin('Pizzas no mês para empatar', pe.pizzasMes != null ? pe.pizzasMes : '—')}${lin('<b>Pizzas por dia</b>', pe.pizzasDia != null ? pe.pizzasDia.toLocaleString('pt-BR') : '—')}
      ${lin('Faturamento do mês', `${dinheiro(d.receita)} ${pe.atingido ? '✅' : '⏳'}`)}</div></div>
      <div class="meta"><i style="width:${Math.min(100, d.receita / pe.faturamento * 100).toFixed(1)}%;background:${pe.atingido ? 'var(--ok)' : 'var(--warn)'}"></i></div>
      <div class="muted" style="margin-top:4px">MC % = (receita − taxas − CMV − despesas variáveis) ÷ receita. Valor por pizza = receita total ÷ pizzas vendidas (inclui bebidas e taxa de entrega).</div>`;
}
function csvDre() {
  const m = $('rMes').value || mesAtual(), d = dreMes(m);
  const l = [['DRE ' + m, 'R$'], ['Receita de vendas', d.receita], ['(-) Taxas', -d.taxas], ['(=) Receita líquida', d.receitaLiquida], ['(-) CMV', d.cmv == null ? 'não disponível' : -d.cmv], ['(=) Margem bruta', d.margemBruta]];
  ['variavel', 'fixa', 'folha'].forEach(g => Object.entries(d.despesas[g]).forEach(([k, v]) => l.push([`(-) ${k}`, -v])));
  Object.entries(d.consumo || {}).forEach(([k, v]) => l.push([`(-) Consumo interno: ${k}`, -v]));
  l.push(['(+) Outras receitas', d.outrasReceitas], ['(=) Lucro líquido', d.lucro], ['Margem %', d.margem == null ? '' : r2(d.margem)], ['Retiradas do dono', d.retiradas]);
  baixarCSV(`dre_${m}.csv`, l);
}
function renderCat() {
  const [de, ate] = intervaloRel(), o = {};
  todosLanc().forEach(l => { if (l.tipo === 'saida' && l.data >= de && l.data <= ate) o[l.categoria || 'Outros'] = (o[l.categoria || 'Outros'] || 0) + l.valor; });
  const e = Object.entries(o).sort((a, b) => b[1] - a[1]), tot = e.reduce((t, x) => t + x[1], 0), max = e.length ? e[0][1] : 1;
  $('rCat').innerHTML = e.length ? e.map(([k, v]) => `<div class="hb" data-dica="${esc(k)}\n${dinheiro(v)} (${pct(v / tot * 100)})"><span class="n">${esc(k)}</span><span class="t"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><span class="v">${dinheiro(v)} <small class="muted">${pct(v / tot * 100)}</small></span></div>`).join('') +
    `<div class="linha total"><span>Total de saídas</span><b>${dinheiro(tot)}</b></div>` : '<div class="vazio">Nenhuma saída no período.</div>';
}
function render6m() {
  const meses = Array.from({ length: 6 }, (_, i) => F.addMes(mesAtual(), i - 5)), L = todosLanc();
  const cat = {}, tot = meses.map(() => ({ e: 0, s: 0 }));
  L.forEach(l => { const i = meses.indexOf(F.mesDe(l.data)); if (i < 0 || l.tipo === 'transferencia') return;
    if (l.tipo === 'entrada') tot[i].e += l.valor; else { tot[i].s += l.valor; const k = l.categoria || 'Outros'; (cat[k] = cat[k] || meses.map(() => 0))[i] += l.valor; } });
  const ds = meses.map(m => dreMes(m));
  $('r6m').innerHTML = graficoBarras(meses.map((m, i) => ({ rot: brMes(m), vals: [tot[i].e, tot[i].s], dica: `${brMes(m)}\nEntradas ${dinheiro(tot[i].e)}\nSaídas ${dinheiro(tot[i].s)}\nLucro (DRE) ${dinheiro(ds[i].lucro)}` })), [{ nome: 'Entradas', cor: COR_E }, { nome: 'Saídas', cor: COR_S }]) +
    `<table style="margin-top:10px"><tr><th></th>${meses.map(m => `<th class="r">${brMes(m)}</th>`).join('')}</tr>
    <tr><td><b>Faturamento (vendas)</b></td>${ds.map(d => `<td class="r"><b>${dinheiro(d.receita)}</b></td>`).join('')}</tr>
    <tr><td><b>Lucro líquido (DRE)</b></td>${ds.map(d => `<td class="r">${corV(d.lucro)}</td>`).join('')}</tr>
    <tr><td>Margem</td>${ds.map(d => `<td class="r">${pct(d.margem)}</td>`).join('')}</tr>
    <tr><td><b>Entradas (caixa)</b></td>${tot.map(t => `<td class="r pos">${dinheiro(t.e)}</td>`).join('')}</tr>
    <tr><td><b>Saídas (caixa)</b></td>${tot.map(t => `<td class="r neg">${dinheiro(t.s)}</td>`).join('')}</tr>
    ${Object.entries(cat).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0)).map(([k, v]) => `<tr><td class="muted">&nbsp;&nbsp;${esc(k)}</td>${v.map(x => `<td class="r">${x ? dinheiro(x) : '—'}</td>`).join('')}</tr>`).join('')}</table>`;
}
function renderPrev() {
  const h = hoje(), s = saldoTotal(saldosHoje());
  const folhaDia = $('pvFolha').checked ? F.folhaEstimada(S.funcs, h, F.addDias(h, 29)) / 30 : 0;
  let vendasDia = 0;
  if ($('pvVendas').checked) { const vd = vendasDias(); let t = 0; for (let d = F.addDias(h, -30); d < h; d = F.addDias(d, 1)) if (vd[d]) t += vd[d].total - vd[d].taxaCartao; vendasDia = t / 30; }
  const p = F.previsao({ hoje: h, saldo: s, contas: S.contas, dias: 90, folhaDia, vendasDia });
  const k = n => { const x = p.marcos[n]; return `<div class="kpi ${x.saldo < 0 ? 'verm' : ''}"><small>Em ${n} dias (${br(x.data)})</small><b>${corV(x.saldo)}</b><span>+${dinheiro(x.entradas)} / −${dinheiro(x.saidas)}</span></div>`; };
  const pts = p.dias, max = Math.max(...pts.map(x => x.saldo), 0), min = Math.min(...pts.map(x => x.saldo), 0), W = 300, H = 90, y = v => H - (v - min) / ((max - min) || 1) * H;
  const ev = [];
  S.contas.filter(c => c.status === 'aberta').forEach(c => { ev.push({ d: c.vencimento < h ? h : c.vencimento, c, v: c.valor }); F.projetar(c, F.addDias(h, 30)).forEach(x => ev.push({ d: x.vencimento, c, v: c.valor, proj: true })); });
  ev.sort((a, b) => a.d.localeCompare(b.d));
  $('rPrev').innerHTML = `<div class="kpis">${k(30)}${k(60)}${k(90)}</div>
    <svg viewBox="0 0 ${W} ${H + 4}" style="width:100%;height:110px" role="img" aria-label="Saldo previsto">
      <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#a8a29e" stroke-dasharray="3 3" stroke-width="1"/>
      <polyline fill="none" stroke="#1c1917" stroke-width="2" points="${pts.map((x, i) => `${(i / (pts.length - 1) * W).toFixed(1)},${y(x.saldo).toFixed(1)}`).join(' ')}"/></svg>
    <div class="muted">Hoje ${dinheiro(s)} • menor saldo previsto: <b class="${p.menor.saldo < 0 ? 'neg' : ''}">${dinheiro(p.menor.saldo)}</b> em ${br(p.menor.data)}${folhaDia ? ` • folha estimada ${dinheiro(folhaDia * 30)}/mês` : ''}${vendasDia ? ` • vendas ${dinheiro(vendasDia)}/dia` : ''}</div>
    <h3 style="margin-top:10px">Próximos 30 dias</h3>
    <div class="rolar" style="max-height:240px;overflow-y:auto">${ev.filter(e => e.d <= F.addDias(h, 30)).map(e => `<div class="linha"><span>${br(e.d)} • ${esc(e.c.descricao)}${e.proj ? ' <span class="tag azul">🔁 prevista</span>' : ''}</span>${sinal(e.v, e.c.natureza === 'pagar' ? 'saida' : 'entrada')}</div>`).join('') || '<div class="vazio">Nenhuma conta nos próximos 30 dias.</div>'}</div>`;
}
function renderConsumo() {
  const [de, ate] = intervaloRel(), r = F.resumoConsumo(pedidos.filter(p => p.data >= de && p.data <= ate), custoItem);
  const tab = (o, t, nome) => `<table><tr><th>${t}</th><th class="r">Pedidos</th><th class="r">Custo</th><th class="r">Valor de venda</th></tr>${Object.entries(o).sort((a, b) => b[1].custo - a[1].custo)
    .map(([k, x]) => `<tr><td>${esc(nome ? nome(k) : k)}</td><td class="r">${x.n}</td><td class="r"><b>${dinheiro(x.custo)}</b></td><td class="r">${dinheiro(x.venda)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td class="r">${r.total.n}</td><td class="r">${dinheiro(r.total.custo)}</td><td class="r">${dinheiro(r.total.venda)}</td></tr></table>`;
  $('rConsumo').innerHTML = r.total.n ? `<div class="grade"><div class="rolar">${tab(r.porTipo, 'Tipo', k => (F.TIPOS_CONSUMO[k] || {}).dre || k)}</div><div class="rolar">${tab(r.porPessoa, 'Pessoa')}</div></div>
    <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Ver pedidos (${r.lista.length})</summary><div class="rolar"><table><tr><th>Dia</th><th>Pedido</th><th>Tipo</th><th>Quem</th><th>Motivo</th><th class="r">Custo</th><th class="r">Venda</th><th>Folha</th></tr>
    ${r.lista.sort((a, b) => b.p.data.localeCompare(a.p.data)).map(x => { const ci = x.p.consumoInterno; return `<tr><td>${br(x.p.data)}</td><td>#${x.p.numero}</td><td>${esc(ci.tipoNome || ci.tipo)}</td><td>${esc(ci.quem || '')}</td><td>${esc(ci.motivo || '')}</td>
      <td class="r">${dinheiro(x.custo)}</td><td class="r">${dinheiro(x.venda)}</td><td>${ci.descontar ? `<span class="tag amar">desconto (${ci.descontarModo === 'venda' ? 'venda' : 'custo'})</span>` : ''}</td></tr>`; }).join('')}</table></div></details>
    <div class="muted" style="margin-top:6px">Custo pela ficha técnica/cadastro gravado na baixa; item sem custo conta pelo preço de venda. No DRE: funcionário → alimentação de funcionários, cortesia/degustação → marketing, perda → perdas, dono → retirada.</div>`
    : '<div class="vazio">Nenhum consumo interno no período.</div>';
}
function renderFolhaRel() {
  const [de, ate] = intervaloRel(), o = {};
  S.folha.forEach(x => {
    if (x.tipo !== 'folha' || x.ate < de || x.de > ate) return;
    const r = o[x.funcionarioId] = o[x.funcionarioId] || { nome: x.nome, n: 0, bruto: 0, vales: 0, desc: 0, liq: 0, pago: 0, ent: 0 };
    r.n++; r.bruto += x.bruto; r.vales += x.vales; r.desc += x.descontos; r.liq += x.liquido; r.ent += x.entregas || 0; if (x.status === 'paga') r.pago += x.liquido;
  });
  const l = Object.values(o).sort((a, b) => b.bruto - a.bruto);
  $('rFolha').innerHTML = l.length ? `<table><tr><th>Funcionário</th><th class="r">Folhas</th><th class="r">Entregas</th><th class="r">Bruto</th><th class="r">Vales</th><th class="r">Desc.</th><th class="r">Líquido</th><th class="r">Pago</th></tr>
    ${l.map(r => `<tr><td>${esc(r.nome)}</td><td class="r">${r.n}</td><td class="r">${r.ent || '—'}</td><td class="r">${dinheiro(r.bruto)}</td><td class="r">${dinheiro(r.vales)}</td><td class="r">${dinheiro(r.desc)}</td><td class="r"><b>${dinheiro(r.liq)}</b></td><td class="r">${dinheiro(r.pago)}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td></td><td></td><td class="r">${dinheiro(l.reduce((t, r) => t + r.bruto, 0))}</td><td class="r">${dinheiro(l.reduce((t, r) => t + r.vales, 0))}</td><td class="r">${dinheiro(l.reduce((t, r) => t + r.desc, 0))}</td><td class="r">${dinheiro(l.reduce((t, r) => t + r.liq, 0))}</td><td class="r">${dinheiro(l.reduce((t, r) => t + r.pago, 0))}</td></tr></table>`
    : '<div class="vazio">Nenhuma folha no período.</div>';
}
function renderIdade() {
  const h = hoje(), l = S.fiados.map(f => Object.assign({ f }, F.resumoFiado(f, h))).filter(x => x.saldo > 0.004).sort((a, b) => b.saldo - a.saldo);
  const T = { a30: 0, a60: 0, mais: 0 }; l.forEach(x => Object.keys(T).forEach(k => { T[k] += x.idade[k]; }));
  $('rIdade').innerHTML = l.length ? `<table><tr><th>Cliente</th><th class="r">0–30 dias</th><th class="r">31–60</th><th class="r">60+</th><th class="r">Total</th></tr>
    ${l.map(x => `<tr><td>${esc(x.f.nome)}</td><td class="r">${x.idade.a30 ? dinheiro(x.idade.a30) : '—'}</td><td class="r">${x.idade.a60 ? `<span class="tag amar">${dinheiro(x.idade.a60)}</span>` : '—'}</td><td class="r">${x.idade.mais ? `<span class="tag verm">${dinheiro(x.idade.mais)}</span>` : '—'}</td><td class="r"><b>${dinheiro(x.saldo)}</b></td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td class="r">${dinheiro(T.a30)}</td><td class="r">${dinheiro(T.a60)}</td><td class="r">${dinheiro(T.mais)}</td><td class="r">${dinheiro(T.a30 + T.a60 + T.mais)}</td></tr></table>
    <div class="muted" style="margin-top:6px">Idade conta da data da compra; pagamentos abatem as compras mais antigas primeiro.</div>` : '<div class="vazio">Nenhum fiado em aberto.</div>';
}

/* ================= CONFIGURAÇÕES ================= */
let cfgRascunho = null;
function renderCfg() {
  if (!cfgRascunho) cfgRascunho = JSON.parse(JSON.stringify(cfg()));
  const c = cfgRascunho;
  $('cfgContas').innerHTML = c.contas.map((k, i) => `<div class="cfgConta">
    <div><label>Nome</label><input value="${esc(k.nome)}" oninput="cfgRascunho.contas[${i}].nome=this.value"></div>
    <div><label>Tipo</label><select onchange="cfgRascunho.contas[${i}].tipo=this.value">${[['caixa', 'Caixa físico'], ['banco', 'Banco'], ['pix', 'Pix/digital'], ['outra', 'Outra']].map(([v, n]) => `<option value="${v}" ${k.tipo === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div><label>Saldo inicial (R$)</label><input inputmode="decimal" value="${String(k.saldoInicial || 0).replace('.', ',')}" oninput="cfgRascunho.contas[${i}].saldoInicial=num(this.value)||0"></div>
    <div><label>Data do saldo</label><input type="date" value="${k.dataSaldo || ''}" onchange="cfgRascunho.contas[${i}].dataSaldo=this.value"></div>
    <label class="chk" style="margin:0 0 10px"><input type="checkbox" ${k.ativa !== false ? 'checked' : ''} onchange="cfgRascunho.contas[${i}].ativa=this.checked"> ativa</label></div>`).join('');
  const opc = c.contas.map(k => `<option value="${esc(k.id)}">${esc(k.nome)}</option>`).join('');
  [['cCtDin', 'dinheiro'], ['cCtPix', 'pix'], ['cCtCar', 'cartao']].forEach(([id, f]) => { $(id).innerHTML = opc; $(id).value = c.contaVendas[f]; });
  $('cVendasDesde').value = c.vendasDesde || '';
  $('cTaxa').value = c.taxaCartao != null && c.taxaCartao !== '' ? String(c.taxaCartao).replace('.', ',') : '';
  $('cTaxaPadrao').textContent = pct(Number((CARDAPIO.loja || {}).taxaMaquininha) || 0);
  $('cMeta').value = c.meta ? String(c.meta).replace('.', ',') : '';
  $('cFiadoDias').value = c.fiadoDiasPadrao || ''; $('cLimCons').value = c.limiteConsumoDia ? String(c.limiteConsumoDia).replace('.', ',') : ''; $('cModoDesc').value = c.consumoDescontoModo === 'venda' ? 'venda' : 'custo';
  ['saida', 'entrada'].forEach(t => {
    const grupos = t === 'saida' ? ['cmv', 'variavel', 'fixa', 'folha', 'retirada', 'taxa'] : ['venda', 'receita', 'aporte', 'fiado'];
    $(t === 'saida' ? 'cfgCatSaida' : 'cfgCatEntrada').innerHTML = c.categorias[t].map((k, i) => `<div class="cfgCat">
      <input value="${esc(k.nome)}" oninput="cfgRascunho.categorias.${t}[${i}].nome=this.value">
      <select onchange="cfgRascunho.categorias.${t}[${i}].grupo=this.value">${grupos.map(g => `<option value="${g}" ${k.grupo === g ? 'selected' : ''}>${F.GRUPOS[g]}</option>`).join('')}</select>
      <button class="btn sm sec" title="Remover" onclick="cfgRascunho.categorias.${t}.splice(${i},1);renderCfg()">✖</button></div>`).join('');
  });
  // meses com lançamentos ou vendas
  const meses = [...new Set(S.lanc.map(l => F.mesDe(l.data)).concat(Object.keys(vendasDias()).map(F.mesDe)).concat([mesAtual()]))].sort().reverse().slice(0, 12);
  $('cfgMeses').innerHTML = `<table><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Lucro (DRE)</th><th></th></tr>${meses.map(m => {
    const t = F.totais(todosLanc(), F.inicioMes(m), F.fimDoMes(m)), f = (cfg().mesesFechados || []).includes(m);
    return `<tr><td>${brMes(m)} ${f ? '<span class="tag">🔒 fechado</span>' : ''}</td><td class="r">${dinheiro(t.entradas)}</td><td class="r">${dinheiro(t.saidas)}</td><td class="r">${corV(dreMes(m).lucro)}</td>
      <td class="r">${f ? `<button class="btn sm sec" onclick="fecharMes('${m}',false)">🔓 Reabrir</button>` : m < mesAtual() ? `<button class="btn sm dark" onclick="fecharMes('${m}',true)">🔒 Fechar mês</button>` : '<span class="muted">mês atual</span>'}</td></tr>`; }).join('')}</table>`;
}
function addConta() { cfgRascunho.contas.push({ id: Fin.novoId('ct'), nome: 'Nova conta', tipo: 'banco', saldoInicial: 0, dataSaldo: hoje(), ativa: true }); renderCfg(); }
function addCat(t) { cfgRascunho.categorias[t].push({ nome: 'Nova categoria', grupo: t === 'saida' ? 'variavel' : 'receita' }); renderCfg(); }
async function salvarCfg() {
  const c = cfgRascunho;
  c.contaVendas = { dinheiro: $('cCtDin').value, pix: $('cCtPix').value, cartao: $('cCtCar').value };
  c.vendasDesde = $('cVendasDesde').value; c.taxaCartao = $('cTaxa').value.trim() === '' ? null : num($('cTaxa').value); c.meta = num($('cMeta').value) || 0;
  c.fiadoDiasPadrao = Math.floor(num($('cFiadoDias').value) || 0) || 30; c.limiteConsumoDia = num($('cLimCons').value) || 0; c.consumoDescontoModo = $('cModoDesc').value;
  if (c.contas.some(k => !k.nome.trim())) return toast('Dê um nome para todas as contas.');
  ['saida', 'entrada'].forEach(t => { c.categorias[t] = c.categorias[t].filter(k => k.nome.trim()).map(k => ({ nome: k.nome.trim(), grupo: k.grupo })); });
  try {
    const { id, atualizadoEm, atualizadoPor, ...doc } = c;
    await Fin.substituir('fin_config', 'geral', doc);
    cfgRascunho = null; toast('Configurações salvas.');
    carregarPedidos();
  } catch (e) { erro(e); }
}
async function fecharMes(m, fechar) {
  if (fechar && !confirm(`Fechar ${brMes(m)}? Lançamentos desse mês ficam bloqueados (dá para reabrir depois).`)) return;
  const l = (cfg().mesesFechados || []).filter(x => x !== m).concat(fechar ? [m] : []).sort();
  try {
    const { id, atualizadoEm, atualizadoPor, ...doc } = cfg();
    await Fin.substituir('fin_config', 'geral', Object.assign(doc, { mesesFechados: l }));
    cfgRascunho = null; toast(fechar ? `${brMes(m)} fechado. 🔒` : `${brMes(m)} reaberto.`);
  } catch (e) { erro(e); }
}

function toast(t) {
  const e = $('toast'); e.textContent = t; e.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 3200);
}
