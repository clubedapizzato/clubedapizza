/* =========================================================
   PIX "COPIA E COLA" (BR Code estático com valor e identificador)
   Padrão EMV/BACEN — não depende de banco nem de API.
   ========================================================= */
window.Pix = (function () {
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * @param {object} o { chave, nome, cidade, valor, txid }
   */
  function gerar(o) {
    const nome = semAcento(o.nome).toUpperCase().slice(0, 25);
    const cidade = semAcento(o.cidade).toUpperCase().slice(0, 15);
    const txid = (semAcento(o.txid || '***').replace(/[^A-Za-z0-9]/g, '') || '***').slice(0, 25);

    let p = campo('00', '01');
    p += campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', String(o.chave).trim()));
    p += campo('52', '0000');
    p += campo('53', '986');
    if (o.valor > 0) p += campo('54', Number(o.valor).toFixed(2));
    p += campo('58', 'BR');
    p += campo('59', nome);
    p += campo('60', cidade);
    p += campo('62', campo('05', txid));
    p += '6304';
    return p + crc16(p);
  }

  return { gerar, crc16 };
})();
