/* =========================================================
   CONFIGURAÇÃO DA LOJA — edite somente este arquivo
   ========================================================= */
window.CONFIG = {
  loja: {
    nome: 'Clube da Pizza',
    // WhatsApp da loja (DDI + DDD + número, só dígitos) — recebe comprovantes Pix
    whatsapp: '5563991332966',
    cidade: 'Novo Acordo - TO'
  },

  entrega: {
    permitirRetirada: true,   // cliente pode escolher "retirar no balcão"
    // Localização da PIZZARIA [latitude, longitude] — base do cálculo da distância
    // (no Google Maps: clique com o botão direito em cima da loja e copie os números)
    localLoja: [-9.962522, -47.677779],
    kmGratis: 5,              // entrega grátis até esta distância (km)
    valorPorKm: 5.00,         // R$ por km (ou fração) que passar do limite grátis
    // Distância em linha reta x fator. 1.0 = linha reta; 1.3 ≈ caminho pelas ruas
    fatorRota: 1.0,
    raioMaximoKm: null,       // ex.: 15 para não aceitar entregas mais longe; null = sem limite
    zoom: 15
  },

  pix: {
    chave: '55377043000182',      // CNPJ (só dígitos). Alternativa: celular '+5563991332966'
    nomeRecebedor: 'HENRIQUE A E S AMARAL', // até 25 caracteres, sem acento
    cidade: 'NOVO ACORDO'            // até 15 caracteres, sem acento
  },

  // Preço da pizza meio a meio: 'media' (média dos sabores) ou 'maior' (sabor mais caro)
  meioAMeio: 'media',

  impressora: {
    colunas: 32   // 32 = papel 58 mm | 48 = papel 80 mm
  },

  /* Banco de dados em tempo real (Firebase).
     null  => MODO DEMONSTRAÇÃO: loja e cozinha só se comunicam
              no MESMO navegador/computador (bom para testar).
     Para produção cole aqui o objeto firebaseConfig (ver README). */
  firebase: null
  /* exemplo:
  firebase: {
    apiKey: "AIza...",
    authDomain: "clubedapizza.firebaseapp.com",
    projectId: "clubedapizza",
    storageBucket: "clubedapizza.appspot.com",
    messagingSenderId: "000000000",
    appId: "1:000:web:abc"
  }
  */
};
