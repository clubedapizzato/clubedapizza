/* =========================================================
   ROTA DE ENTREGA (entregador)
   - Melhor sequência saindo da pizzaria: vizinho mais próximo + melhoria 2-opt
   - Links do Google Maps com a rota pelas ruas (até 9 paradas intermediárias por link)
   ========================================================= */
window.Rota = (function () {
  // Distância em linha reta (km) entre [lat, lng]
  function km(a, b) {
    const r = d => d * Math.PI / 180;
    const x = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(x));
  }

  // Comprimento do caminho origem → pontos[ordem[0]] → pontos[ordem[1]] ...
  function distancia(origem, pontos, ordem) {
    let s = 0, at = origem;
    ordem.forEach(i => { s += km(at, pontos[i]); at = pontos[i]; });
    return s;
  }

  /* Ordem de visita (índices de "pontos") saindo de "origem", sem voltar.
     1) vizinho mais próximo; 2) 2-opt: inverte trechos enquanto encurtar o caminho;
     3) or-opt: muda de lugar blocos de 1 a 3 paradas (ex.: casa "atrás" da pizzaria vai para o início). */
  function otimizar(origem, pontos) {
    const n = pontos.length;
    if (n < 2) return pontos.map((_, i) => i);
    const resto = new Set(pontos.map((_, i) => i)), ordem = [];
    let at = origem;
    while (resto.size) {
      let melhor = null, dm = Infinity;
      resto.forEach(i => { const d = km(at, pontos[i]); if (d < dm - 1e-12) { dm = d; melhor = i; } });
      ordem.push(melhor); resto.delete(melhor); at = pontos[melhor];
    }
    // caminho com a origem na posição 0 (fixa); o fim é livre
    const P = [origem].concat(ordem.map(i => pontos[i])), idx = [-1].concat(ordem);
    const custo = () => { let t = 0; for (let k = 1; k <= n; k++) t += km(P[k - 1], P[k]); return t; };
    let melhorou = true, voltas = 0;
    while (melhorou && voltas++ < 100) {
      melhorou = false;
      // or-opt: tira o bloco P[i..i+L-1] e testa em todas as outras posições (normal e invertido)
      for (let L = 1; L <= 3; L++) {
        for (let i = 1; i + L - 1 <= n; i++) {
          const atual = custo();
          const bp = P.splice(i, L), bi = idx.splice(i, L);
          let melhor = null;
          for (let j = 1; j <= P.length; j++) {
            for (const inv of [false, true]) {
              const sp = inv ? bp.slice().reverse() : bp;
              P.splice(j, 0, ...sp);
              const c = custo();
              P.splice(j, L);
              if (c < atual - 1e-9 && (!melhor || c < melhor.c)) melhor = { c, j, inv };
            }
          }
          if (melhor) {
            P.splice(melhor.j, 0, ...(melhor.inv ? bp.slice().reverse() : bp));
            idx.splice(melhor.j, 0, ...(melhor.inv ? bi.slice().reverse() : bi));
            melhorou = true;
          } else { P.splice(i, 0, ...bp); idx.splice(i, 0, ...bi); }
        }
      }
      for (let i = 1; i < n; i++) {
        for (let j = i + 1; j <= n; j++) {
          const antes = km(P[i - 1], P[i]) + (j < n ? km(P[j], P[j + 1]) : 0);
          const depois = km(P[i - 1], P[j]) + (j < n ? km(P[i], P[j + 1]) : 0);
          if (depois < antes - 1e-9) {
            P.splice(i, j - i + 1, ...P.slice(i, j + 1).reverse());
            idx.splice(i, j - i + 1, ...idx.slice(i, j + 1).reverse());
            melhorou = true;
          }
        }
      }
    }
    return idx.slice(1);
  }

  /* Links do Google Maps para as paradas (strings "lat,lng" ou endereço), em ordem.
     Cada link: origem + até 9 waypoints + destino. Origem null = localização atual do celular.
     Retorna [{ url, de, ate }] (de/ate = nº das paradas do trecho, começando em 1). */
  function linksGoogle(paradas, origem) {
    const MAX = 10, enc = encodeURIComponent, out = [];
    let o = origem || null;
    for (let i = 0; i < paradas.length; i += MAX) {
      const trecho = paradas.slice(i, i + MAX), dest = trecho[trecho.length - 1], wps = trecho.slice(0, -1);
      const url = 'https://www.google.com/maps/dir/?api=1' + (o ? '&origin=' + enc(o) : '') + '&destination=' + enc(dest) +
        (wps.length ? '&waypoints=' + wps.map(enc).join('%7C') : '') + '&travelmode=driving';
      out.push({ url, de: i + 1, ate: i + trecho.length });
      o = dest;
    }
    return out;
  }

  return { km, distancia, otimizar, linksGoogle };
})();
