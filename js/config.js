/* =========================================================
   CONFIGURAÇÃO DA LOJA — edite somente este arquivo
   ========================================================= */
window.CONFIG = {
  loja: {
    nome: 'Clube da Pizza',
    // WhatsApp da loja (DDI + DDD + número, só dígitos) — recebe comprovantes Pix
    whatsapp: '5563999999999',
    cidade: 'Novo Acordo - TO'
  },

  entrega: {
    taxa: 5.00,               // taxa fixa de entrega (R$)
    permitirRetirada: true,   // cliente pode escolher "retirar no balcão"
    // Centro inicial do mapa [latitude, longitude]
    centroMapa: [-9.9706, -47.6772],
    zoom: 15
  },

  pix: {
    chave: '',                    // CPF/CNPJ (só dígitos), e-mail, telefone (+5563...) ou chave aleatória
    nomeRecebedor: 'CLUBE DA PIZZA', // até 25 caracteres, sem acento
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
