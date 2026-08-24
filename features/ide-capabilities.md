# Capacidades do tinyIde

Este documento registra as capacidades atualmente implementadas no tinyIde, a qualidade observada de cada área e as principais lacunas para evolução futura.

A avaliação considera quatro critérios:

- completude funcional;
- estabilidade e cobertura de testes;
- integração com o restante da IDE;
- maturidade operacional e experiência de uso.

## Escala de qualidade

| Nota | Interpretação |
| ---: | --- |
| 9–10 | Madura e confiável |
| 7–8,9 | Boa, com lacunas localizadas |
| 5–6,9 | Funcional, mas ainda intermediária |
| 3–4,9 | Experimental |
| 0–2,9 | Apenas estrutural ou incompleta |

## Visão geral

| Área | Qualidade |
| --- | ---: |
| Arquitetura extensível por plugins | **9,0** |
| Workbench e layout | **8,4** |
| Explorer e sistema de arquivos | **8,5** |
| Editor de texto | **7,6** |
| Execução de perfis | **8,6** |
| Streaming de saída | **8,8** |
| Depuração | **7,8** |
| Terminal | **8,4** |
| Git | **9,0** |
| Busca indexada | **8,5** |
| Docker | **8,0** |
| Python | **8,0** |
| Ambientes Python | **8,6** |
| Pytest | **9,0** |
| JavaScript e TypeScript | **7,3** |
| Runtime Node.js | **8,1** |
| Persistência de workspace | **8,0** |
| Desktop e Electron | **8,5** |
| Segurança | **8,8** |
| Acessibilidade e UX | **7,7** |
| Performance geral | **7,8** |

**Qualidade global estimada: 8,3/10.**

---

## 1. Arquitetura de plugins — 9,0

### Capacidades

- Instalação e remoção de plugins.
- Catálogo de plugins.
- Manifests com versão, compatibilidade, permissões e dependências.
- Frontend e backend separados por plugin.
- Activation events.
- Capability registry, event bus e command registry.
- Contribuições para sidebar, tool windows, painéis, titlebar, menus de contexto, toolbar do editor, diagnósticos, navegação, ícones, criação de arquivos, ambientes, perfis, debug adapters e badges.

### Pontos fortes

- Plugins usam APIs públicas e não precisam importar internals do host.
- O core permanece agnóstico de linguagem e runtime.
- Docker, Git, Python, Node, Search, Pytest e Terminal demonstram extensibilidade real.

### Lacunas

- Marketplace remoto ainda não consolidado.
- Falta isolamento forte por processo ou sandbox para extensões de terceiros.
- Permissões ainda funcionam mais como governança do que como fronteira absoluta de segurança.
- Hot reload de plugins em produção ainda é limitado.

## 2. Workbench e layout — 8,4

### Capacidades

- Activity bars esquerda e direita.
- Sidebars, tool windows e painéis inferiores.
- Abas, grupos, fechamento e restauração.
- Divisores redimensionáveis.
- Diálogos integrados.
- Badges de execução, problemas, plugins e contribuições externas.
- Persistência do layout.

### Pontos fortes

- Aparência e fluxo próximos de IDEs desktop.
- Plugins são integrados ao workbench, não tratados como páginas isoladas.
- Layout e contribuições possuem testes dedicados.

### Lacunas

- Coordenação excessiva concentrada no `App.tsx`.
- Falta command palette abrangente.
- Múltiplos grupos de editor lado a lado ainda não estão maduros.
- Drag-and-drop do layout pode evoluir.

## 3. Explorer e sistema de arquivos — 8,5

### Capacidades

- Abrir arquivo e pasta.
- Suporte ao File System Access API e ao host desktop.
- Árvore de diretórios com expansão e recolhimento.
- Criação inline de arquivo e diretório.
- Renomeação inline.
- Remoção, cópia unitária e cópia em lote.
- Cópia recursiva de diretórios.
- Seleção múltipla e histórico de navegação.
- Localização do arquivo aberto.
- Reconciliação após mudanças externas.
- Identificação de texto, imagem e binário.

### Pontos fortes

- Boa abstração entre browser e desktop.
- Operações reais de filesystem são testadas.
- Plugins podem contribuir filtros, ícones e ações de contexto.

### Lacunas

- Falta mover em lote por clipboard.
- Falta progresso para operações grandes.
- Não há undo transacional de operações de arquivo.
- Symlinks não são tratados como recurso de primeira classe.
- Árvores muito grandes ainda podem exigir virtualização.

## 4. Editor de texto — 7,6

### Capacidades

- Edição de texto, abas e estado dirty.
- Syntax highlighting.
- Numeração de linhas e régua.
- Busca local.
- Configuração de indentação.
- Persistência de seleção, cursor e scroll.
- Navegação para símbolos.
- Diagnósticos, decorações e ações de Git.
- Exibição de imagens e detecção de binários.
 - Arrastar e soltar arquivos externos na região do editor para abrir, editar e executar quando plugins suportarem o tipo.

### Pontos fortes

- Extensível por providers de linguagem, navegação e diagnósticos.
- Integra editor, Git, execução e problemas.

### Lacunas

- Não há LSP completo.
- Autocomplete semântico é limitado.
- Não há rename global, code actions ou refactoring engine.
- Não há multicursor avançado e folding semântico robusto.
- Arquivos muito grandes ainda podem pressionar o DOM e o highlighting.

## 5. Execução de perfis — 8,6

### Capacidades

- Perfis persistentes por workspace.
- Execução, parada e restart.
- Ambiente, working directory, argumentos e variáveis.
- Execução por script e módulo.
- Perfis e targets contribuídos por plugins.
- Múltiplas execuções em abas.
- Restauração de processos após reload.
- Integração com Python, Node, npm, Pytest e comandos genéricos.

### Pontos fortes

- Pipeline central agnóstico de linguagem.
- Plugins fornecem presets, ambientes e targets sem acoplar o core.
- Processos long-running usam o mesmo mecanismo.

### Lacunas

- Falta configuração de política de saída por perfil.
- Não há compound run configuration.
- Faltam dependências entre perfis e before-launch tasks.
- Attach genérico a processos existentes ainda não está disponível.

## 6. Streaming de saída — 8,8

### Capacidades

- Buffer circular no backend.
- Cursor incremental.
- Leitura em lotes.
- Retenção limitada com descarte do conteúdo antigo.
- Indicador de truncamento.
- `stdout`, `stderr` e follow output.
- Preservação de scroll.
- Restauração de processos após reload.

### Pontos fortes

- Solução genérica para qualquer processo long-running.
- Tráfego incremental e memória limitada.
- Proteção contra saída infinita de servidores, watchers e workers.

### Lacunas

- Ainda usa polling.
- Não há SSE ou WebSocket.
- Falta persistência completa de logs em arquivo.
- Não há virtualização de milhões de linhas.
- O conteúdo descartado não pode ser exportado integralmente.

## 7. Depuração — 7,8

### Capacidades

- Debug adapters por plugin.
- Python/PDB e Node Inspector.
- Breakpoints, continue, step over, step into, stop e restart.
- Estado de sessão e painel de debug.
- Integração com perfis e Pytest.

### Pontos fortes

- Abstração genérica por adapter.
- Lifecycle de Python e Node coberto por testes.

### Lacunas

- Falta suporte amplo ao DAP.
- Falta attach genérico.
- Conditional breakpoints e watch expressions ainda são limitados.
- Avaliação interativa e inspeção de objetos podem evoluir.
- Multiprocess e subprocess debugging ainda são incompletos.

## 8. Terminal — 8,4

### Capacidades

- PTY real e xterm.
- Múltiplas sessões e abas.
- Shell iniciado no workspace.
- Variáveis e hooks contribuídos por plugins.
- Ativação de ambiente Python.
- Persistência da sessão ao fechar o painel.
- Reconexão após reload.
- Resize, scroll, follow output e estado de conexão.

### Pontos fortes

- Terminal interativo real, não apenas executor de comandos.
- Sessão sobrevive à remontagem do frontend.
- Integração genérica com ambientes.

### Lacunas

- Falta busca no buffer.
- Falta seleção avançada de shell pela UI.
- Não há links e comandos detectados semanticamente.
- Scrollback completo não é persistido.
- Bundle do terminal ainda é relativamente grande.

## 9. Git — 9,0

### Capacidades

- Status, staged, unstaged e untracked.
- Stage, unstage, commit, amend e discard.
- Branches, checkout, criação, rename e upstream.
- Stash, remotes, fetch e push.
- Rebase, cherry-pick e reset.
- Undo commit.
- Histórico e grafo de commits.
- Diff unified e lado a lado.
- Intraline diff e modos de whitespace.
- Renames e arquivos não versionados.
- Decorações no editor e Explorer.
- Submódulos.
- Console de operações.

### Pontos fortes

- Uma das áreas mais maduras da IDE.
- Testes usam repositórios temporários e operações reais.
- Integra buffers dirty do editor ao status visível.

### Lacunas

- Falta merge conflict editor dedicado.
- Falta blame e interactive rebase.
- Falta stage por hunk diretamente no diff.
- Falta integração com pull requests.
- Autenticação remota depende do ambiente do host.

## 10. Busca indexada — 8,5

### Capacidades

- Busca por conteúdo, nome e caminho.
- Regex e case sensitive.
- Snippets, ranking e limites.
- Abertura na linha encontrada.
- Filtro do Explorer.
- Indexação incremental e watcher.
- Debounce e fila serializada.
- Cache por workspace.
- Progresso e indexação parcial no startup.
- Limites de memória, tamanho e quantidade de arquivos.

### Pontos fortes

- Não bloqueia o startup da IDE.
- Proteção explícita de memória.
- Atualização incremental de arquivos adicionados, alterados e removidos.

### Lacunas

- Não é busca semântica.
- Falta cancelamento explícito de consultas.
- Falta replace in files.
- Falta histórico de consultas.
- Monorepos muito grandes ainda podem exigir índice persistente mais sofisticado.

## 11. Docker — 8,0

### Capacidades

- Listagem e lifecycle de contêineres.
- Logs, inspect, stats e exec.
- Console do contêiner.
- Imagens, pull e prune.
- Volumes e redes.
- Docker Compose.
- Ações em lote.
- Agrupamento por projeto, favoritos, filtros e ordenação.
- Modal de detalhes e badge de contêineres em execução.

### Pontos fortes

- Boa integração com o workbench.
- Ações coletivas e organização de projetos Compose.
- Badge independente do painel aberto.

### Lacunas

- Logs Docker ainda não usam o mesmo protocolo incremental do runtime central.
- Console de contêiner não é PTY pleno.
- Falta suporte a contexts remotos e registries.
- Falta Kubernetes.
- Stats podem evoluir para séries temporais.

## 12. Python — 8,0

### Capacidades

- Highlighting e lint de sintaxe.
- Diagnósticos de TODO e trailing whitespace.
- Navegação para classes, funções e métodos.
- Imports absolutos, relativos, aliases e imports parentizados.
- Navegação para implementações do ambiente.
- Ícones e criação de arquivos Python.
- Pyodide como runtime auxiliar carregado sob demanda.

### Pontos fortes

- Linguagem e runtime estão corretamente separados.
- Navegação cobre diversos formatos de import.

### Lacunas

- Não equivale a Pyright ou Pylance.
- Tipagem e inference são limitadas.
- Não há autocomplete semântico completo.
- Não há rename ou refactoring.
- Django ainda não possui análise semântica dedicada.
- Dependência de CDN do Pyodide exige estratégia offline.

## 13. Ambientes Python — 8,6

### Capacidades

- Descoberta e seleção de executáveis.
- Criação, importação, atualização e remoção de venvs.
- Ambiente ativo por workspace.
- Execução de script e módulo.
- Gerenciamento de pacotes.
- Perfis e targets contribuídos.
- Ativação no terminal.
- Variáveis e `PATH`.
- Debug Python.

### Pontos fortes

- Plugin separado e integrado a execução, terminal, Pytest e debug.
- Suporte explícito a execução por módulo.

### Lacunas

- Falta suporte dedicado a Poetry, Pipenv, uv e Conda.
- Falta resolução de lockfile.
- Falta comparação entre ambientes.
- Falta ambiente Python executado em container ou host remoto.

## 14. Pytest — 9,0

### Capacidades

- Descoberta respeitando `pytest.ini` e `pyproject.toml`.
- `testpaths`, `python_files` e `norecursedirs`.
- Módulos, classes, funções, métodos e node IDs.
- Execução por contexto, arquivo e teste individual.
- Debug.
- Resultados e progresso em tempo real.
- Filtro, contadores e detalhes de falha.
- Rerun failed.
- Suporte a xdist.
- Perfil preso à aba e atualização sem remontagem completa.

### Pontos fortes

- Uma das experiências mais refinadas do projeto.
- Integra corretamente o runtime central e perfis temporários.

### Lacunas

- Falta cobertura de código.
- Falta histórico e comparação entre execuções.
- Falta suporte dedicado a unittest e outros frameworks.
- Resultados ainda dependem parcialmente da interpretação do stdout.

## 15. JavaScript e TypeScript — 7,3

### Capacidades

- Highlighting para JS, TS e JSON.
- Diagnósticos básicos.
- Navegação para classes, funções e métodos.
- Imports nomeados, aliases e namespace imports.
- Ícones e criação de arquivos.

### Pontos fortes

- Plugin pequeno, limpo e desacoplado.
- Navegação básica entre arquivos funciona.

### Lacunas

- Não há TypeScript Language Service completo.
- Não há type checking real do projeto.
- Falta autocomplete semântico, auto-import e refactoring.
- Suporte a JSX e TSX ainda é superficial.
- `tsconfig` não é interpretado profundamente.

## 16. Runtime Node.js — 8,1

### Capacidades

- Descoberta e seleção de Node.
- Associação com npm.
- Scripts do `package.json`.
- Perfis Node e npm.
- Execução de scripts.
- Debug por Node Inspector.
- Tool window própria.
- Validação de caminhos e diálogos integrados.

### Pontos fortes

- Evita usar acidentalmente o Node empacotado no Electron.
- Debug real e lifecycle testados.

### Lacunas

- Falta suporte dedicado a pnpm, yarn, bun, nvm, fnm e asdf.
- Falta test runner JavaScript dedicado.
- Falta attach a processo Node existente.
- Source maps ainda podem evoluir no debugger.

## 17. Persistência e configuração por workspace — 8,0

### Capacidades

- Estado e configurações locais por workspace.
- `.tinyide/settings.json`.
- Perfis, ambientes, runtimes e preferências de plugins.
- Persistência de layout, abas, documentos, seleção e scroll.
- Restauração do workspace no desktop.
- Reconciliação de recursos.

### Pontos fortes

- Configuração local por diretório, alinhada ao modelo de IDEs como IntelliJ.
- Plugins possuem namespaces próprios.

### Lacunas

- Ainda podem existir estados históricos em storage global.
- Falta versionamento formal de schema e migrations.
- Falta distinção visual clara entre configuração de usuário, workspace e diretório.
- Multi-root workspace ainda não está maduro.

## 18. Desktop e Electron — 8,5

### Capacidades

- Filesystem nativo.
- Restauração de workspace.
- Single instance.
- Ambiente de login shell.
- State store e file manager.
- Plugin backends.
- Empacotamento Linux.
- Hardening de produção.

### Pontos fortes

- O frontend continua web-first.
- Desktop atua como host, sem duplicar toda a aplicação.
- Startup, segurança e packaging possuem testes.

### Lacunas

- Windows e macOS ainda precisam de validação equivalente.
- Auto-update não está consolidado.
- Assinatura de código e notarization não foram validadas.
- Bundle web principal ainda é grande.

## 19. Segurança — 8,8

### Capacidades

- `contextIsolation`.
- `nodeIntegration: false`.
- Sandbox e `webSecurity`.
- Webview e plugins Chromium desativados.
- DevTools e remote debugging bloqueados no pacote.
- Electron fuses.
- Validação de caminhos e escape de workspace.
- Limites de payload.
- Backend escopado por plugin.
- Uso de subprocessos sem shell quando aplicável.

### Pontos fortes

- Segurança é tratada como requisito arquitetural.
- Há testes específicos de hardening e packaging.

### Lacunas

- Plugins empacotados continuam sendo código confiável do produto.
- Não há assinatura criptográfica de plugins.
- Falta política CSP mais explícita e auditável.
- Dependências remotas precisam de integridade e fallback offline.

## 20. Acessibilidade e UX — 7,7

### Capacidades

- `aria-label`, roles e tooltips.
- Escape em diálogos.
- Separadores acessíveis.
- Feedback de estado e badges descritivos.
- Foco adequado em terminal e diálogos.
- Menus integrados.

### Pontos fortes

- Acessibilidade está presente desde a implementação.
- Estados não dependem somente de cor.

### Lacunas

- Falta auditoria completa com leitor de tela.
- Falta validação sistemática de contraste.
- Nem todo drag-and-drop possui equivalente por teclado.
- Textos ainda misturam português e inglês.
- Falta infraestrutura consistente de i18n.

## 21. Performance — 7,8

### Pontos fortes

- Streaming e buffers limitados.
- Busca com orçamento de memória.
- Debounce, filas serializadas e atualizações incrementais.
- Pytest evita remontagens desnecessárias.
- Pyodide carregado sob demanda.

### Lacunas

- Bundle principal e plugins visuais ainda são grandes.
- Algumas árvores e listas não são virtualizadas.
- Polling ainda é usado em diferentes módulos.
- Falta benchmark contínuo no pipeline padrão.
- O `App.tsx` permanece grande e centralizador.

---

## Capacidades ausentes ou ainda imaturas

1. LSP completo.
2. Autocomplete semântico.
3. Refactoring e rename global.
4. Multi-root workspace.
5. Múltiplos grupos de editor.
6. Command palette completa.
7. Replace in files.
8. Merge conflict editor.
9. Stage por hunk.
10. DAP mais abrangente.
11. Cobertura de testes e histórico de execuções.
12. Package managers adicionais.
13. Marketplace remoto e assinatura de plugins.
14. Virtualização sistemática.
15. Distribuição validada em Windows e macOS.
16. Auto-update.
17. i18n consistente.

## Prioridades recomendadas

1. Editor semântico e integração LSP.
2. Refactoring, rename e code actions.
3. Multi-editor e multi-root workspace.
4. Command palette e navegação global.
5. Virtualização e redução dos bundles.
6. Merge conflict editor e stage por hunk.
7. Distribuição multiplataforma e auto-update.

## Regra de manutenção

Ao alterar uma capacidade:

1. Atualize a descrição funcional.
2. Atualize os pontos fortes e as lacunas.
3. Reavalie a nota da área.
4. Registre os testes automatizados relevantes.
5. Valide o fluxo no navegador antes de considerar a capacidade concluída.
