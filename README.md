# Clube da Pizza — Sistema de Pedidos

| Página | Para quem | O que faz |
|---|---|---|
| `index.html` | **Cliente** (endereço principal) | Cardápio por categoria, monta pizza (meio a meio + adicional), nome/telefone, endereço com **mapa e pino arrastável**, pagamento (Pix / dinheiro com troco / cartão), resumo e **acompanhamento em tempo real** |
| `cozinha.html` | **Cozinha** | Painel com colunas *Novos → Em produção → 📦 Prontos → 🛵 Em rota → Entregues*, alerta sonoro, **impressão automática**, confirmação manual do Pix, WhatsApp por fase, **alerta vermelho de pedido não entregue** (reenviar / cancelar) e baixa de estoque ao iniciar a produção |
| `entregador.html` | **Entregador** (login próprio) | Escolhe os pedidos prontos → **rota otimizada** saindo da pizzaria, mapa com paradas numeradas, **🧭 Navegar** no Google Maps, valor a cobrar/troco, ✅ Entregue / ❌ Não entregue com motivo |
| `balcao.html` | **Balcão** (login da cozinha) | Tela rápida de caixa: toca nos itens → *Comer aqui / Para levar* → Pix/Dinheiro (troco)/Cartão → pedido já PAGO, recebe número na hora e vai para a cozinha (impresso pela auto-impressão) |
| `relatorios.html` | **Gestão** (login da cozinha) | **Relatórios:** faturamento, ticket médio, pedidos por dia/origem, pizzas por sabor e tamanho, bebidas, pagamentos, **lucro bruto por produto e CMV**, **entregas por entregador**, CSV. **📦 Produtos & Estoque:** cadastro, preços, margem, compras, ajustes, sachês e cortesia |
| `loja.html` | — | Redireciona para o endereço principal (links antigos) |

## Arquivos
| Arquivo | Função |
|---|---|
| `js/config.js` | **Único arquivo a editar**: nome, WhatsApp, taxa de entrega, chave Pix, centro do mapa, Firebase |
| `js/cardapio.js` | Sabores, preços P/M/G, bebidas, regra do meio a meio, mensagens de WhatsApp |
| `js/pix.js` | Gera o Pix "copia e cola" + QR Code com o valor exato (padrão BACEN, sem API) |
| `js/impressora.js` | Ticket 58 mm — Bluetooth ESC/POS (JP58H) ou impressão do navegador |
| `js/db.js` | Banco de dados (Firebase) ou modo demonstração — pedidos, produtos, estoque (transações) |
| `js/catalogo.js` | Lê o catálogo do Firestore (`produtos`, `config/loja`); se vazio/offline usa `js/cardapio.js` |
| `js/rota.js` | Rota do entregador (vizinho mais próximo + 2-opt/or-opt) e links do Google Maps |
| `firestore.rules` | Regras de segurança do Firebase |

## Testar agora (modo demonstração)
Com `firebase: null` no `config.js`, abra `index.html` e `cozinha.html` em **duas abas do mesmo navegador**. O pedido feito na loja aparece na cozinha na hora.

## Colocar em produção (Firebase, grátis no plano Spark)
1. Acesse https://console.firebase.google.com → **Criar projeto**.
2. **Firestore Database** → Criar banco (modo produção, região `southamerica-east1`).
3. Aba **Regras** → cole o conteúdo de `firestore.rules` → Publicar.
4. **Authentication** → Começar → ativar **E-mail/senha** → aba Usuários → **Adicionar usuário** (login da cozinha).
5. Configurações do projeto (⚙️) → **Seus apps** → ícone `</>` (Web) → copie o `firebaseConfig` e cole em `CONFIG.firebase` no `js/config.js`.
6. Authentication → Configurações → **Domínios autorizados** → adicione `clubedapizzato.com.br` e `www.clubedapizzato.com.br`.
7. Preencha `pix.chave`, `loja.whatsapp` e `entrega.localLoja` (coordenadas da pizzaria) no `config.js`.

Links: cliente → **https://clubedapizzato.com.br** • cozinha → `https://clubedapizzato.com.br/cozinha.html` • balcão → `https://clubedapizzato.com.br/balcao.html`

O domínio próprio é definido no arquivo `CNAME` (GitHub Pages). O endereço antigo `henriquesilva-tjto.github.io/clubedapizza` redireciona para ele.

## Horário e agendamento
Configurável em `CONFIG.horario` (`js/config.js`): quinta a terça, 18:30–23:00 (fechado às quartas).
- Loja aberta: pedido "o quanto antes" ou agendado para mais tarde no mesmo turno.
- Loja fechada: aviso "🔒 Estamos fechados" e o pedido só pode ser **agendado** (horários de 30 em 30 min do próximo dia de funcionamento).
- O campo `data` do pedido é o dia do turno de entrega (numeração e relatórios por dia de atendimento).
- Cozinha: agendados ficam em **📅 Agendados** e entram em *Novos* (com alarme e auto-impressão) 40 min antes do horário. Agendamentos de dias futuros aparecem num aviso no topo.
- O balcão não tem restrição de horário.

## Impressão na cozinha
- Marque **🖨️ Auto-imprimir** em **apenas um** aparelho (o que está ligado à impressora).
- **Bluetooth (JP58H):** botão *Conectar JP58H* (Chrome no Android/PC).
- **Impressora USB/rede no PC:** sem janela de confirmação, abra o Chrome com `--kiosk-printing` (atalho: `chrome.exe --kiosk-printing https://.../cozinha.html`) e defina a térmica como padrão.

## Fases atuais e próximas
| Recurso | Agora (v1) | Próxima fase |
|---|---|---|
| WhatsApp ao cliente | Ao mudar a fase, o WhatsApp abre com a mensagem pronta → toque em *Enviar* | Envio 100% automático via API (Z-API, Evolution API ou WhatsApp Cloud API) |
| Confirmação do Pix | QR/copia e cola com valor exato + comprovante via WhatsApp → cozinha toca em **Confirmar Pix** | Confirmação automática via API de cobrança (Mercado Pago, Efí, Asaas) com webhook |
| Taxa de entrega | Grátis até 5 km; acima, R$ 5 por km (ou fração) excedente, pela distância em linha reta até o pino | Distância pelas ruas (rota real) |

## Fluxo de entrega (status)
| Tipo | Fases |
|---|---|
| Entrega | `novo` → `producao` → **`pronto`** (📦 Pronto p/ entrega) → `saiu` (entregador iniciou a rota) → `entregue` ou **`nao_entregue`** |
| Retirada / balcão | `novo` → `producao` → `saiu` ("Pronto") → `entregue` |

- `CONFIG.equipe` (`js/config.js`): e-mail de login → `{ nome, papel }` (`entregador`, `cozinha`, `admin`). Quem não está na lista entra como cozinha. Login de entregador abrindo cozinha/balcão/gestão é levado para `entregador.html`.
- Não entregue: o entregador escolhe o motivo (obrigatório; "Outro" exige observação). Na cozinha aparece em vermelho com **🔁 Reenviar para entrega** (volta para Pronto) ou **Cancelar** (devolve o estoque).
- A rota usa distância em linha reta para decidir a ordem; o caminho pelas ruas é do Google Maps (até 9 paradas intermediárias por link — acima disso a rota é dividida em trechos).

## Produtos, estoque e sachês
- Coleção `produtos` (leitura pública, escrita logado). **Gestão → 📦 Produtos & Estoque → Importar cardápio atual** cria tudo a partir de `js/cardapio.js` (bebidas entram sem controle de estoque para não sumirem da loja; o controle liga na 1ª entrada de compra).
- **Preço sugerido** = (custo + extras) ÷ (1 − margem − taxa da maquininha). A gestão mostra margem real e lucro por unidade com o preço atual.
- **Entrada de compra** recalcula o **custo médio ponderado**; **Ajuste** (perda, avaria, consumo interno, contagem). Histórico em `movimentos`.
- **Baixa automática**: balcão baixa ao criar o pedido; site baixa quando a cozinha clica *Iniciar produção* (transação + `estoqueBaixado: true`, nunca duas vezes). Cancelar devolve (movimento `estorno`). Falta de estoque na produção só avisa (o estoque fica negativo, em vermelho na gestão).
- **Sachês**: categoria "Sachês" com preço automático pela margem a cada compra. Cortesia "X grátis por pizza" em `config/loja`, aplicada aos mais baratos.
- O item vendido guarda `custoUnitario` do momento → relatório de lucro bruto/CMV fiel.
