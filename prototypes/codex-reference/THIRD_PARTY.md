# Componentes e origem

Esta interface usa fontes reais instaladas do registro oficial do Notra UI, não reproduções visuais em HTML.

- Registro: <https://ui.usenotra.com/r/{name}.json>
- Instruções: <https://ui.usenotra.com/introduction>
- Thread: <https://ui.usenotra.com/components/chatgpt/thread>
- Catálogo e hashes das fontes recebidas: `NOTRA_COMPONENTS.json`.
- Primitivas dependentes: shadcn `base-nova`, sobre Base UI. As dependências e versões efetivamente resolvidas estão em `package-lock.json`.

Foram instalados o bloco ChatGPT completo, Sidebar e App Sidebar, Button, Dropdown Menu, Select, Tooltip, Sonner, Icon Tabs, Step Slider, Shimmer, Chat Minimap, Composer, Card, Table, Model Icon, OpenCode Logo e os elementos Codex de markdown, reasoning, explored, exec e working. Os componentes aparecem em `src/components/`; a aplicação composta está em `src/App.tsx` e `src/features/chat.tsx`.

Os componentes de conversa, menus, logos de provedores, seletor de esforço, botões, tooltips, notificações e navegação usam essas implementações. Os componentes adicionais ficam disponíveis no catálogo local; partes sem função no workspace, como tabelas de dados ou layouts de métricas, não foram colocadas na tela apenas para demonstração.

Adaptações locais: Composer com rascunho controlado, textarea e slots de anexos/modelo; textos de interface em português; logos de provedores combinados ao seletor de modelos do workspace; normalização do tipo `strokeWidth` do Spinner para compatibilidade com Hugeicons. A estrutura e os tokens dos componentes foram preservados. O layout de projetos/worktrees, o diff e a simulação local compõem esses elementos para o OpenCodex.

A documentação do Notra disponibiliza os componentes para copiar e instalar. Os JSONs recebidos não incluem uma declaração própria de licença; este projeto preserva a origem sem atribuir uma licença inexistente ao Notra. As licenças das dependências npm permanecem nos respectivos pacotes. Logos e nomes de modelos pertencem aos seus titulares; o catálogo de modelos da demonstração é ilustrativo.
