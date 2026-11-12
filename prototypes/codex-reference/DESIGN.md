# Direção visual

Um workspace de desenvolvimento calmo, familiar e preciso: superfícies neutras, barra lateral compacta, conversa generosa e painel de revisão aberto sob demanda.

- **Tipografia:** fonte sans do sistema; conversa a 15 px, navegação a 13–14 px e código a 12 px.
- **Escuro:** fundo `#111214`, lateral `#191a1c`, superfície `#202123`, texto `#f0f0f0`.
- **Claro:** fundo `#fafafa`, lateral `#f1f1f1`, superfície `#fff`, texto `#212121`.
- **Hierarquia:** divisórias finas, cantos discretos, ícones lineares, azul apenas para seleção e verde/vermelho para diff.
- **Movimento:** resposta curta aos controles e entrada do painel; respeita movimento reduzido.
- **Composição:** foco escuro com conversa ampla; claro com lateral recuada; revisão escura com diff lateral. Em telas estreitas, painéis laterais aparecem sobre o conteúdo.

Os três estados são protótipos visuais e não uma implementação integrada ao app de produção.

## Tokens e composição final

O texto secundário usa `#a2a4a7` no escuro e `#666666` no claro; placeholders e metadados usam `#909296` e `#737373`. O diff usa verde/vermelho `#78cba1` / `#df7773` no escuro e `#26754b` / `#ad3f39` no claro. Blocos de adição/remoção claros usam `#e2f0e7` / `#fae4e2`, com texto `#236c44` / `#a13b34`.

A lateral mede 260 px (268 px com o recuo claro), o painel de revisão 390 px e a coluna de conversa no máximo 780 px. A barra superior mede 53 px e as abas 40 px. O composer tem raio de 15 px; seletores e janelas, 13 px; botões, 7 px. Worktrees usam 12 px e idades de conversa, 11 px. Abaixo de 800 px, a lateral é recolhida, a revisão ocupa até 90vw e as ilhas passam a uma grade. Abaixo de 520 px, o espaçamento e os controles se compactam.

As abas podem ser reordenadas e as ilhas mantêm posição e dimensões em memória. O foco, a seleção de texto e a rolagem são preservados ao renderizar alterações de estado. A seleção de modelo fica ancorada ao composer. Movimento comunica apenas feedback ou mudança de estado: controles em 160 ms, revisão em 200 ms e indicador de trabalho em 1,1 s. `prefers-reduced-motion` reduz animações e transições para 0,01 ms.

A revisão visual independente confirmou a direção e a resolução dos achados de contraste, metadados, controle lateral duplicado e recolhimento mobile. As capturas finais estão em `previews/`; a cobertura funcional e seus limites estão no README.
