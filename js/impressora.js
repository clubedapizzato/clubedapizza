/* =========================================================
   IMPRESSÃO DO TICKET (cozinha)
   - Bluetooth ESC/POS (JP58H) via Web Bluetooth, quando conectado
   - Senão, impressão pelo navegador (window.print)
   ========================================================= */
window.Impressora = (function () {
  let caracteristica = null;

  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const col = () => (CONFIG.impressora && CONFIG.impressora.colunas) || 32;
  const linha = c => c.repeat(col()) + '\n';
  const centro = t => { const n = Math.max(0, Math.floor((col() - t.length) / 2)); return ' '.repeat(n) + t + '\n'; };
  const duasColunas = (a, b) => {
    const espaco = col() - b.length - 1;
    const linhas = [];
    let resto = a;
    while (resto.length > espaco) { linhas.push(resto.slice(0, espaco)); resto = resto.slice(espaco); }
    return linhas.map(l => l + '\n').join('') + resto.padEnd(espaco) + ' ' + b + '\n';
  };

  const fone = t => { const d = String(t).replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : t; };

  function ticket(p) {
    const dt = p.criadoEm ? new Date(p.criadoEm) : new Date();
    let s = centro(semAcento(CONFIG.loja.nome).toUpperCase());
    s += linha('=');
    s += centro(`PEDIDO #${p.numero}`);
    const tipo = p.entrega.tipo;
    s += centro(tipo === 'balcao' ? `*** BALCAO - ${p.entrega.consumo === 'local' ? 'COMER AQUI' : 'PARA LEVAR'} ***`
      : tipo === 'retirada' ? '*** RETIRADA ***' : p.origem === 'balcao' ? '*** BALCAO/DELIVERY ***' : '*** ENTREGA ***');
    s += `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR').slice(0, 5)}\n`;
    if (p.agendadoPara) s += linha('*') + centro(`AGENDADO PARA: ${Horario.formatar(p.agendadoPara)}`) + linha('*');
    s += linha('-');
    if (p.cliente.nome) s += `CLIENTE: ${p.cliente.nome}\n`;
    if (p.cliente.telefone) s += `FONE: ${fone(p.cliente.telefone)}\n`;
    if (p.entrega.tipo === 'entrega') {
      const e = p.entrega;
      s += `END: ${e.rua}, ${e.numero}\n`;
      if (e.bairro) s += `BAIRRO: ${e.bairro}\n`;
      if (e.complemento) s += `COMPL: ${e.complemento}\n`;
      if (e.referencia) s += `REF: ${e.referencia}\n`;
    }
    s += linha('-');
    p.itens.filter(it => !Preco.ehSache(it)).forEach(it => {
      if (it.tipo === 'pizza') {
        s += `${it.qtd}x ${Preco.descricaoBase(it).toUpperCase()}\n`;
        Preco.nomesAdicionais(it).forEach(n => { s += `   + ${n.toUpperCase()}\n`; });
      } else s += `${it.qtd}x ${Preco.descricao(it).toUpperCase()}\n`;
      if (it.obs) s += `   OBS: ${it.obs}\n`;
    });
    const sc = Preco.saches(p.itens, p.cortesiaPorPizza || 0);
    if (sc.qtd) {
      s += linha('-') + `SACHES: ${Preco.listaSaches(p.itens).toUpperCase()}\n`;
      s += duasColunas(`${sc.qtd} SACHES${sc.gratis ? ` (${sc.gratis} GRATIS)` : ''}`, dinheiro(sc.valor));
    }
    if (p.obs) s += linha('-') + `OBS: ${p.obs}\n`;
    s += linha('-');
    s += duasColunas('SUBTOTAL', dinheiro(p.subtotal));
    if (p.entrega.tipo === 'entrega') {
      const km = p.entrega.distanciaKm != null ? ` ${String(p.entrega.distanciaKm).replace('.', ',')}KM` : '';
      s += duasColunas('ENTREGA' + km, p.taxaEntrega == null ? 'A COMBINAR' : p.taxaEntrega ? dinheiro(p.taxaEntrega) : 'GRATIS');
    }
    s += duasColunas('TOTAL', dinheiro(p.total));
    const pg = p.pagamento;
    let fp = ({ pix: 'PIX', dinheiro: 'DINHEIRO', cartao: tipo === 'balcao' ? 'CARTAO' : 'CARTAO NA ENTREGA' })[pg.forma] || pg.forma;
    if (tipo === 'balcao') fp += ' (PAGO)';
    else if (pg.forma === 'pix') fp += pg.confirmado ? ' (CONFIRMADO)' : ' (AGUARDANDO)';
    s += `PAGAMENTO: ${fp}\n`;
    if (pg.forma === 'dinheiro' && pg.trocoPara) s += `TROCO PARA: ${dinheiro(pg.trocoPara)} (${dinheiro(pg.trocoPara - p.total)})\n`;
    s += linha('=') + '\n\n\n';
    return semAcento(s).replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[^\n\x20-\x7E]/g, '');
  }

  async function conectar() {
    if (!navigator.bluetooth) throw new Error('Este navegador não suporta Web Bluetooth (use Chrome no Android/PC).');
    const dev = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-41a3-8c53-0d02c7f947e0']
    });
    const server = await dev.gatt.connect();
    for (const sv of await server.getPrimaryServices()) {
      for (const c of await sv.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) { caracteristica = c; break; }
      }
      if (caracteristica) break;
    }
    if (!caracteristica) throw new Error('Serviço de escrita não encontrado na impressora.');
    dev.addEventListener('gattserverdisconnected', () => { caracteristica = null; });
    return dev.name || 'Impressora';
  }

  async function bluetooth(texto) {
    const enc = new TextEncoder();
    await caracteristica.writeValue(new Uint8Array([27, 64]));
    const dados = enc.encode(texto);
    for (let i = 0; i < dados.length; i += 20) await caracteristica.writeValue(dados.slice(i, i + 20));
    await caracteristica.writeValue(new Uint8Array([27, 100, 4]));
  }

  function navegador(texto) {
    return new Promise(resolve => {
      const el = document.getElementById('ticketPrint');
      el.textContent = texto;
      const fim = () => { window.removeEventListener('afterprint', fim); resolve(); };
      window.addEventListener('afterprint', fim);
      window.print();
      setTimeout(fim, 3000); // alguns navegadores não disparam afterprint
    });
  }

  async function imprimir(pedido) {
    const texto = ticket(pedido);
    if (caracteristica) {
      try { await bluetooth(texto); return 'bluetooth'; }
      catch (e) { console.error(e); caracteristica = null; }
    }
    await navegador(texto);
    return 'navegador';
  }

  return { ticket, conectar, imprimir, conectada: () => !!caracteristica };
})();
