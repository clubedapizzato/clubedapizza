# Clube da Pizza — Sistema de Pedidos

| Página | Para quem | O que faz |
|---|---|---|
| `index.html` | **Cliente** (endereço principal) | Cardápio por categoria, monta pizza (meio a meio + adicional), nome/telefone, endereço com **mapa e pino arrastável**, pagamento (Pix / dinheiro com troco / cartão), resumo e **acompanhamento em tempo real** |
| `cozinha.html` | **Cozinha** | Painel com colunas *Novos → Em produção → 📦 Prontos → 🛵 Em rota → Entregues*, alerta sonoro, **impressão automática**, confirmação manual do Pix, WhatsApp por fase, **alerta vermelho de pedido não entregue** (reenviar / cancelar) e baixa de estoque ao iniciar a produção |
| `entregador.html` | **Entregador** (login próprio) | Escolhe os pedidos prontos → **rota otimizada** saindo da pizzaria, mapa com paradas numeradas, **🧭 Navegar** no Google Maps, valor a cobrar/troco, ✅ Entregue / ❌ Não entregue com motivo |
| `balcao.html` | **Balcão** (login da cozinha) | Tela rápida de caixa: toca nos itens → *Comer aqui / Para levar* → Pix/Dinheiro (troco)/Cartão → pedido já PAGO, recebe número na hora e vai para a cozinha (impresso pela auto-impressão). **🛵 Delivery** para pedidos de WhatsApp/telefone: telefone (busca o endereço do último pedido), mapa com pino e taxa como na loja, pagamento na entrega ou Pix, e confirmação pronta no WhatsApp |
| `relatorios.html` | **Gestão** (login da cozinha) | **Relatórios:** faturamento, ticket médio, pedidos por dia/origem, pizzas por sabor e tamanho, bebidas, pagamentos, **lucro bruto por produto e CMV**, **entregas por entregador**, CSV. **📦 Produtos & Estoque:** cadastro, preços, margem, compras, ajustes, sachês e cortesia |
| `clientes.html` | **Gestão** (login da cozinha) | **👥 Clientes:** lista por telefone com segmentos (VIP, Frequente, Novo, Em risco, Inativo), ficha do cliente (o que compra, histórico), WhatsApp com mensagem pronta, 🎁 fidelidade (simulador), rankings e CSV. Acesso pelo endereço `/clientes.html` |
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
| `js/endereco.js` | Endereço com mapa, pino, busca e taxa — usado pela loja e pelo delivery do balcão |
| `js/rota.js` | Rota do entregador (vizinho mais próximo + 2-opt/or-opt) e links do Google Maps |
| `js/clientes.js` | Cálculos da página de clientes (agrupamento por telefone, segmentos, fidelidade, CSV) — só leitura |
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
Editável em **Gestão → 📦 Produtos & Estoque → 🕒 Horário de funcionamento** (salvo em `config/loja.horario`, vale na hora, sem atualizar o site). `CONFIG.horario` no `js/config.js` é só o padrão se o Firebase não responder.
- Uma linha por dia: aberto/fechado, abre e fecha (horários diferentes por dia). Fechar depois da meia-noite (ex.: 18:30–00:30) conta como turno do dia em que abriu — pedidos das 00:15 entram no dia anterior e a cozinha continua nele.
- **📅 Exceções:** datas fechadas (feriado/folga) ou com horário especial, com motivo.
- **🔴 Fechar a loja agora:** emergência (gás, energia). A loja mostra "Fechado no momento" e só aceita agendamento para o próximo turno; volta sozinha no próximo dia de atendimento, ou pelo botão "Reabrir" na Gestão/cozinha.
- **Agendamento:** com a loja aberta, os próximos horários de 30 em 30 min do turno; antes de abrir, a partir do **primeiro horário de agendamento** (padrão 19:00; se abrir depois dele, abertura + 30 min) até fecha − 30 min.
- Cozinha: agendados ficam em **📅 Agendados** e entram em *Novos* (com alarme e auto-impressão) 40 min antes do horário. O balcão não tem restrição de horário.

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

## Acompanhamento por código, fila e previsão
- Pedido do site e delivery do balcão ganham um **código de 6 caracteres** (sem 0/O, 1/I/L), ex.: `K7P3QX`, gravado em `rastreio/{codigo}` → `{ pedidoId }` na mesma transação do pedido (o cliente abre pelo código, mas não lista nada).
- Código + link `https://clubedapizzato.com.br/?codigo=...` vão em todas as mensagens de WhatsApp (comprovante Pix, confirmação do balcão, cada fase da cozinha/entregador).
- Loja: botão **📦 Acompanhar pedido** (aceita minúsculas, espaço e hífen), `?codigo=` na URL e **"Seus pedidos de hoje"** (últimos 5 pedidos guardados no aparelho).
- **Fila e previsão:** a cozinha (aberta e logada) publica `config/fila` sem dados pessoais (número, data, status, hora) a cada mudança e um "sinal de vida" a cada 4 min. O cliente vê "Há N pedidos na sua frente" e a faixa de previsão (preparo + 5 min por pedido à frente + ajuste de movimento + entrega + min/km, ±7 min). Tempos em **Gestão → ⚙️ Configurações**; ajuste rápido na cozinha: **⏱️ Movimento Normal / +15 / +30**. Sem atualização há mais de 10 min, a fila some e fica só o status.

## Adicionais da pizza
- Gestão → 📦 Produtos & Estoque → **➕ Adicionais da pizza**: produtos `tipo: 'adicional'` com preço P/M/G, ativo, ordem e estoque opcional. Padrão: Catupiry e Cheddar (P 3 • M 5 • G 7). Preço da pizza = regra do meio a meio + soma dos adicionais do tamanho. Item do pedido: `adicionais: [{ id, nome, preco }]` (pedidos antigos com `adicional: true` continuam valendo).

## Ficha técnica (custo, CMV e lucro) — só Gestão
- Gestão → **📋 Ficha técnica**:
  - **🧂 Insumos** (`insumos/{id}`): unidade, preço de compra ÷ quantidade da embalagem = custo por kg/L/un, perda % (custo ÷ (1 − perda)), fornecedor, histórico de preço ("💲 Atualizar preço" recalcula as fichas na hora).
  - **Fichas** (`fichas/{saborId|adicionalId}`): insumo + quantidade por tamanho (P/M/G; aceita "280g" num insumo em kg), copiar de outro tamanho (com fator) ou de outro sabor. **Base comum** (`fichas/_base`: massa, caixa, gás…) entra em todos os sabores. Resultado: CMV %, maquininha, lucro, margem e preço sugerido pelo **CMV alvo**.
  - Visão geral de todos os sabores × tamanhos + CSV.
- Meio a meio: custo = média das metades (ou a mais cara, se `CONFIG.meioAMeio = 'maior'`) + base + adicionais. O custo é gravado no item do pedido na baixa (cozinha/balcão logados); pedidos sem custo usam a ficha atual e aparecem como "estimado".
- **Custos são privados**: `insumos` e `fichas` só para usuário logado (a loja do cliente não carrega nada disso). Insumos não baixam estoque nesta fase.

## Clientes — `clientes.html` (só leitura)
- Lê os pedidos do período escolhido (30 dias, **90 dias** (padrão), este ano, tudo ou datas) — mesma consulta dos relatórios, **regras do Firebase não mudam**.
- Cliente = telefone só com dígitos (com/sem 55, com/sem 9 no celular antigo); nome = o mais recente. Pedidos sem telefone (balcão comer aqui/levar) ficam em "🏪 Balcão sem identificação". Cancelados e não entregues ficam fora do gasto.
- Segmentos (nesta prioridade): ⭐ VIP (top 10% em gasto ou 8+ pedidos) • 💤 Inativo (60+ dias) • ⚠️ Em risco (2+ pedidos, 31–59 dias) • 🔁 Frequente (3+ pedidos, ≤ 30 dias) • 🆕 Novo (1º pedido ≤ 30 dias) • 🙂 Ocasional. "Novo/1ª compra" consideram só o período carregado.
- 🎁 Fidelidade: simulador interno. Regra e recompensas entregues ficam no `localStorage` do aparelho (`cdp_fidelidade_regra`, `cdp_fidelidade_entregues`); a loja não muda.

## Atualizações e cache
As páginas carregam `js/*.js` e `css/app.css` com `?v=AAAAMMDD`. **Ao alterar qualquer JS/CSS, troque esse número em todas as páginas** (mesmo valor), para o navegador não misturar página nova com script antigo — isso causava "Erro ao salvar" logo após um deploy.
