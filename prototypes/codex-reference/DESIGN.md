# Direção visual — OpenCodex × Notra

Uma experiência de desenvolvimento familiar, precisa e cuidada, expressa pela composição de componentes oficiais Notra sobre uma estrutura de projetos, conversas e revisão.

## Autoridade visual

A solicitação do usuário define Notra UI como sistema visual. Foram instalados os arquivos reais do registro oficial, com seus tokens, keyframes, componentes e dependências Base UI. O bloco ChatGPT fornece Thread, Message, Reasoning, Search, Activity, Source Chip, Actions, App Call, Thinking e Composer. Sidebar, Icon Tabs, Dropdown Menu, Button, Tooltip, Sonner, Step Slider e Model Icon completam a experiência.

Não aplicar outra identidade por cima desses elementos. O CSS próprio trata da composição, dos painéis e das necessidades de projetos/worktrees. Os elementos de profundidade nos botões e menus pertencem ao Notra e foram preservados por solicitação explícita.

## Tokens e composição

- Conversa: tokens Notra ChatGPT. Escuro `--chatgpt-bg: #212121`, texto `#ececec`, superfície/composer `#303030`; claro fundo `#ffffff`, texto `#0d0d0d`, bubble `#f4f4f4`.
- Shell escuro: sidebar `#111111`, popover `#252525`, border `#ffffff12`; claro sidebar `#f7f7f7`, popover `#ffffff`, border `#e5e5e5`.
- Tipografia: Inter Variable local no shell; stack original ChatGPT no thread. Corpo de conversa 16 px, navegação 12–14 px, metadados 10–12 px. Código usa fonte monospace.
- Sidebar: 270 px inicial, redimensionamento nativo do Notra entre 240 e 400 px; rail de 48 px. Barra superior 59 px, linha de abas 49 px, coluna de leitura e composer com máximo de 48rem. Revisão lateral de 350 px.
- Abaixo de 1100 px, a revisão sobrepõe o conteúdo. Abaixo de 780 px, sidebar vira sheet e os modos paralelos formam uma coluna; ilhas deixam o arraste livre. A biblioteca posiciona e limita os overlays.
- Logos: Model Icon oficial Notra com vetores dos provedores. Modelos de uma mesma família compartilham sua marca; os nomes do catálogo são ilustrativos.

## Interação e movimento

Base UI fornece foco, teclado, seleção e overlays. Icon Tabs mantém um indicador animado e os logos das sessões; Step Slider oferece esforço por conversa. Thread preserva a leitura e segue conteúdo novo quando o usuário está no fim. Os chats abertos permanecem montados ao trocar de aba, preservando rolagem e controles.

O movimento serve a transições e feedback: tempos de 150–200 ms nos controles e overlays, indicador próprio nas abas e animação do slider. `prefers-reduced-motion` reduz o movimento. O tema é aplicado antes da primeira pintura para evitar flash claro ao abrir o modo escuro.

## Evidência

Typecheck, build e percurso funcional em Chromium passaram. As capturas verificam os dois temas em desktop/mobile e os estados de modelos, esforço, atividade e revisão. A revisão visual independente retornou `ship` para o protótipo, sem achados materiais; o escopo e as limitações funcionais estão no README. Capturas distribuídas em `previews/`.

O detector estático apontou somente o uso de Inter como fonte recorrente. A fonte foi mantida por coerência com a família de componentes escolhida para esta interface operacional; não houve achado funcional ou visual material associado.
