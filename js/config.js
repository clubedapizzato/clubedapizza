/* =========================================================
   CONFIGURAÇÃO DA LOJA — edite somente este arquivo
   ========================================================= */
window.CONFIG = {
  loja: {
    nome: 'Clube da Pizza',
    // WhatsApp da loja (DDI + DDD + número, só dígitos) — recebe comprovantes Pix
    whatsapp: '5563991332966',
    cidade: 'Novo Acordo - TO',
    site: 'https://clubedapizzato.com.br'   // endereço da loja nos links de acompanhamento
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

  /* Horário de atendimento da loja online (o balcão não tem restrição).
     dias: 0 = domingo, 1 = segunda ... 6 = sábado (3 = quarta: FECHADO).
     Pedidos "o quanto antes" só dentro do horário; fora dele o cliente só AGENDA. */
  horario: {
    dias: [0, 1, 2, 4, 5, 6],
    abre: '18:30',
    fecha: '23:00',
    intervaloAgendamentoMin: 30,   // horários de agendamento de 30 em 30 min
    alertaAntesMin: 40             // agendado entra em "Novos" (alarme + impressão) X min antes
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

  /* Equipe: e-mail de login (Firebase → Authentication → Usuários) → nome e papel.
     papel: 'entregador' (página entregador.html) | 'cozinha' | 'admin'.
     Quem NÃO estiver aqui continua entrando normalmente como cozinha. */
  equipe: {
    'entregador.henrique@clubedapizzato.com.br': { nome: 'Henrique de Almeida', papel: 'entregador' }
  },

  /* Banco de dados em tempo real (Firebase).
     null  => MODO DEMONSTRAÇÃO: loja e cozinha só se comunicam
              no MESMO navegador/computador (bom para testar).
     Para produção cole aqui o objeto firebaseConfig (ver README). */
  firebase: {
    apiKey: "AIzaSyAnDb8IE43MAVyCeWAT0KznnRQMgS3_Rgo",
    authDomain: "clube-da-pizza-8749a.firebaseapp.com",
    projectId: "clube-da-pizza-8749a",
    storageBucket: "clube-da-pizza-8749a.firebasestorage.app",
    messagingSenderId: "1098468521589",
    appId: "1:1098468521589:web:4915555c3c9cee3fc32a3c"
  }
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
