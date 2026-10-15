# Clube da Pizza — Sistema de Pedidos

| Página | Para quem | O que faz |
|---|---|---|
| `index.html` | **Cliente** (endereço principal) | Cardápio por categoria, monta pizza (meio a meio + adicional), nome/telefone, endereço com **mapa e pino arrastável**, pagamento (Pix / dinheiro com troco / cartão), resumo e **acompanhamento em tempo real** |
| `cozinha.html` | **Cozinha** | Painel com colunas *Novos → Em produção → Saiu → Entregue*, alerta sonoro, **impressão automática**, confirmação manual do Pix e botão de WhatsApp para o cliente em cada fase |
| `balcao.html` | **Balcão** | Sistema antigo de lançamento manual |
| `loja.html` | — | Redireciona para o endereço principal (links antigos) |

## Arquivos
| Arquivo | Função |
|---|---|
| `js/config.js` | **Único arquivo a editar**: nome, WhatsApp, taxa de entrega, chave Pix, centro do mapa, Firebase |
| `js/cardapio.js` | Sabores, preços P/M/G, bebidas, regra do meio a meio, mensagens de WhatsApp |
| `js/pix.js` | Gera o Pix "copia e cola" + QR Code com o valor exato (padrão BACEN, sem API) |
| `js/impressora.js` | Ticket 58 mm — Bluetooth ESC/POS (JP58H) ou impressão do navegador |
| `js/db.js` | Banco de dados (Firebase) ou modo demonstração |
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
