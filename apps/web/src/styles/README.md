# Arquitetura de estilos

O shell web possui um único ponto de entrada: `../app.css`.

A ordem dos imports é parte do contrato visual:

1. `foundation.css`: tokens, reset e primitivas globais;
2. `workbench.css`: estrutura fixa do shell, Explorer, editor, painéis e diálogos centrais;
3. `features.css`: recursos especializados e integrações de plugins.

## Regras

- Não adicionar estilos globais fora de `foundation.css`.
- Não adicionar outro arquivo CSS global ao `main.tsx`.
- Não repetir o mesmo seletor no mesmo contexto de media/container query. Alterar a regra proprietária existente.
- Estilos de recurso devem usar um bloco de classes próprio, preferencialmente BEM (`recurso`, `recurso__elemento`, `recurso--modificador`).
- Correções de layout não devem ser anexadas ao final do arquivo. Devem ser feitas na regra proprietária.
- Mudanças visuais precisam validar, no navegador, titlebar, activity bar, sidebar, editor e painel inferior.

O teste `style-contract.test.ts` impede a reintrodução de entradas globais paralelas, seletores globais fora do arquivo-base e sobrescritas duplicadas.
