# Regras do projeto — Clube da Pizza

- **Logo e rodapé obrigatórios:** toda página HTML com interface deve ter a logo do Clube da Pizza (`img/logo-96.webp`/`img/logo-128.webp`, fallback `img/logo-96.jpg`/`img/logo-128.jpg`) no canto superior esquerdo do cabeçalho (`<div class="marca"><a class="logoTopo">…</a><h1>…</h1></div>` dentro de `header.topo .in`) e o rodapé `<footer class="rodape">2024-2026 Clube da Pizza Delivery. Todos os direitos reservados.</footer>` logo depois de `</main>`. Páginas novas devem seguir o mesmo padrão (copie o cabeçalho, os ícones do `<head>` e o rodapé de uma página existente).
- Ao alterar qualquer JS/CSS, troque o `?v=AAAAMMDD` em todas as páginas (ver README → Atualizações e cache).
- Impressão (`window.print`) e ticket ESC/POS (`js/impressora.js`) não mostram logo nem rodapé.
