/* =========================================================
   ENDEREÇO DE ENTREGA COM MAPA (loja do cliente e delivery do balcão)
   - Mapa Leaflet/OSM com pino arrastável (ou toque no mapa) e marcador da pizzaria
   - Rua/bairro preenchidos pelo pino; "Localizar endereço digitado" (Nominatim)
   - Distância e taxa pela regra de Preco.taxa; sem mapa => taxa "a combinar"
   Uma instância por página (ids fixos: mapa, rua, numero, bairro, complemento, referencia).
   ========================================================= */
window.Endereco = (function () {
  let mapa = null, pino = null, ajustado = false, ruaAuto = true, bairroAuto = true;
  let inicial = null;   // { lat, lng } para o pino quando o mapa abrir
  let cfg = {};
  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  // opcoes: { minhaLocalizacao (botão 📡), onChange(), toast(texto) }
  function montar(el, opcoes) {
    cfg = Object.assign({ minhaLocalizacao: true, onChange() { }, toast: t => alert(t) }, opcoes);
    el.innerHTML = `
      <div class="muted" style="margin-top:12px"><b>Arraste o pino</b> (ou toque no mapa) até a ${cfg.minhaLocalizacao ? 'sua casa. Isso ajuda o entregador a chegar certinho.' : 'casa do cliente.'}</div>
      <div id="mapa"></div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${cfg.minhaLocalizacao ? '<button class="btn sm dark" type="button" onclick="Endereco.minhaLocalizacao()">📡 Usar minha localização</button>' : ''}
        <button class="btn sm sec" type="button" onclick="Endereco.buscar()">🔎 Localizar endereço digitado</button>
      </div>
      <div id="statusPino" class="muted" style="margin-top:6px"></div>
      <div class="grid3">
        <div><label for="rua">Rua / Avenida</label><input id="rua" autocomplete="address-line1"></div>
        <div><label for="numero">Número</label><input id="numero" placeholder="S/N se não houver"></div>
      </div>
      <div class="grid2">
        <div><label for="bairro">Bairro</label><input id="bairro"></div>
        <div><label for="complemento">Complemento</label><input id="complemento" placeholder="Casa, apto, bloco..."></div>
      </div>
      <label for="referencia">Ponto de referência</label>
      <input id="referencia" placeholder="Ex.: próximo à praça, portão azul">`;
    $('rua').addEventListener('input', () => { ruaAuto = false; });
    $('bairro').addEventListener('input', () => { bairroAuto = false; });
  }

  function iniciarMapa() {
    setTimeout(() => {
      if (mapa) { mapa.invalidateSize(); return; }
      if (typeof L === 'undefined') {   // mapa não carregou (internet fraca): segue só com o endereço digitado
        $('mapa').classList.add('hide');
        $('statusPino').textContent = 'Mapa indisponível no momento — capriche no endereço e no ponto de referência (taxa a combinar).';
        cfg.onChange();
        return;
      }
      const inicio = inicial ? [inicial.lat, inicial.lng] : CONFIG.entrega.localLoja;
      mapa = L.map('mapa').setView(inicio, inicial ? 17 : (CONFIG.entrega.zoom || 15));
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      }).addTo(mapa);
      L.circleMarker(CONFIG.entrega.localLoja, { radius: 8, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: .9 })
        .addTo(mapa).bindTooltip('🍕 ' + CONFIG.loja.nome);
      pino = L.marker(inicio, { draggable: true }).addTo(mapa);
      if (inicial) ajustado = true;
      pino.on('dragend', () => pinoMovido(false));
      mapa.on('click', e => { pino.setLatLng(e.latlng); pinoMovido(false); });
      msg();
    }, 50);
  }

  // Ponto marcado (só depois que o pino foi ajustado)
  function local() {
    if (!pino || !ajustado) return {};
    const ll = pino.getLatLng();
    return { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
  }
  const km = () => { const l = local(); return Preco.distanciaKm(l.lat, l.lng); };
  const taxa = () => Preco.taxa(Object.assign({ tipo: 'entrega' }, local()));
  const foraDaArea = () => { const k = km(); return k != null && !!CONFIG.entrega.raioMaximoKm && k > CONFIG.entrega.raioMaximoKm; };
  function textoTaxa(t) {
    if (t == null) return pino ? 'marque no mapa' : 'a combinar';
    return t === 0 ? 'Grátis' : dinheiro(t);
  }

  function msg() {
    let h = '⚠️ Marque a casa no mapa antes de confirmar — a taxa é calculada pela distância.';
    if (ajustado) {
      const k = km(), kmTxt = k.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      h = `✅ Localização marcada • 📏 ${kmTxt} km da pizzaria • entrega <b>${textoTaxa(taxa())}</b>`;
      if (foraDaArea()) h = `❌ Fora da área de entrega (${kmTxt} km). Escolha "Retirar" ou fale conosco no WhatsApp.`;
    }
    if (pino) $('statusPino').innerHTML = h;
    cfg.onChange();
  }
  async function pinoMovido(veioDeBusca) {
    ajustado = true; msg();
    if (veioDeBusca) return;
    const { lat, lng } = pino.getLatLng();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=pt-BR&lat=${lat}&lon=${lng}`);
      const j = await r.json(), a = j.address || {};
      const rua = a.road || a.pedestrian || '';
      const bairro = a.suburb || a.neighbourhood || a.quarter || a.village || '';
      if (rua && (ruaAuto || !val('rua'))) { $('rua').value = rua; ruaAuto = true; }
      if (bairro && (bairroAuto || !val('bairro'))) { $('bairro').value = bairro; bairroAuto = true; }
    } catch (e) { /* sem internet ou limite do serviço: digita manualmente */ }
  }
  function minhaLocalizacao() {
    if (!pino) return cfg.toast('Mapa indisponível.');
    if (!navigator.geolocation) { cfg.toast('Seu aparelho não permite localização.'); return; }
    cfg.toast('Buscando sua localização...');
    navigator.geolocation.getCurrentPosition(p => {
      const ll = [p.coords.latitude, p.coords.longitude];
      pino.setLatLng(ll); mapa.setView(ll, 18); pinoMovido(false);
    }, () => cfg.toast('Não foi possível obter a localização. Arraste o pino manualmente.'), { enableHighAccuracy: true, timeout: 15000 });
  }
  async function buscar() {
    if (!pino) return cfg.toast('Mapa indisponível.');
    const rua = val('rua'), num = val('numero'), bairro = val('bairro');
    if (!rua) { cfg.toast('Digite a rua primeiro.'); return; }
    const q = [rua + (num && !/s\/?n/i.test(num) ? ' ' + num : ''), bairro, CONFIG.loja.cidade, 'Brasil'].filter(Boolean).join(', ');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j.length) { cfg.toast('Endereço não encontrado. Arraste o pino até a casa.'); return; }
      const ll = [parseFloat(j[0].lat), parseFloat(j[0].lon)];
      pino.setLatLng(ll); mapa.setView(ll, 18); pinoMovido(true);
      cfg.toast('Confira se o pino está na casa certa.');
    } catch (e) { cfg.toast('Falha na busca. Arraste o pino manualmente.'); }
  }

  // Preenche campos e pino (endereço salvo no aparelho ou do último pedido)
  function preencher(d) {
    d = d || {};
    ['rua', 'numero', 'bairro', 'complemento', 'referencia'].forEach(k => { if ($(k)) $(k).value = d[k] || ''; });
    ruaAuto = !d.rua; bairroAuto = !d.bairro;
    if (typeof d.lat === 'number' && typeof d.lng === 'number') {
      inicial = { lat: d.lat, lng: d.lng };
      if (pino) { pino.setLatLng([d.lat, d.lng]); mapa.setView([d.lat, d.lng], 17); ajustado = true; }
    } else { inicial = null; if (pino) ajustado = false; }
    msg();
  }
  function limpar() {
    preencher({});
    if (pino) { pino.setLatLng(CONFIG.entrega.localLoja); mapa.setView(CONFIG.entrega.localLoja, CONFIG.entrega.zoom || 15); }
    ajustado = false; msg();
  }

  // Valida para enviar: { id, msg } do primeiro problema, ou null
  function validar() {
    if (!val('rua')) return { id: 'rua', msg: 'Informe a rua.' };
    if (!val('numero')) return { id: 'numero', msg: 'Informe o número (ou S/N).' };
    if (!val('bairro')) return { id: 'bairro', msg: 'Informe o bairro.' };
    if (pino && !ajustado) return { id: 'mapa', msg: 'Marque a casa no mapa (arraste o pino).' };
    if (foraDaArea()) return { id: 'mapa', msg: 'Endereço fora da área de entrega.' };
    return null;
  }
  // Objeto "entrega" do pedido
  function dados() {
    const l = local();
    return {
      tipo: 'entrega', rua: val('rua'), numero: val('numero'), bairro: val('bairro'),
      complemento: val('complemento'), referencia: val('referencia'),
      lat: l.lat ?? null, lng: l.lng ?? null, distanciaKm: km()
    };
  }

  return { montar, iniciarMapa, local, km, taxa, textoTaxa, minhaLocalizacao, buscar, preencher, limpar, validar, dados, temMapa: () => !!pino };
})();
