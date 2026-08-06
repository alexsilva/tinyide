# Testes de fumaça

Exercitam a IDE como um usuário: o Playwright lança o **Electron do próprio projeto**
(nenhum navegador é baixado) apontado para um workspace temporário, e percorre o
caminho de todo dia — abrir projeto, ler código, editar, salvar, visualizar um recurso
renderizado por plugin e buscar.

Estes testes existem porque a suíte unitária não pega esta classe de problema: a IDE já
esteve inutilizável em uso real com todos os testes verdes.

## Executar

```bash
npm run test:e2e          # compila a interface e roda a suíte
npm run test:e2e:quick    # reaproveita apps/web/dist, para iterar rápido
```

Em máquina sem servidor gráfico (servidor de CI, container), prefixe com `xvfb-run`:

```bash
xvfb-run -a npm run test:e2e
```

## Como funciona

- `ide-app.mjs` cria o workspace descartável, lança a IDE com estado isolado
  (`--user-data-dir` próprio, então nenhuma execução herda sessão da anterior) e oferece
  os passos de navegação.
- A seleção de projeto usa `TINYIDE_TEST_WORKSPACE_PICKER_PATH`, gancho já existente no
  processo principal, porque o seletor de diretório é nativo e não é operável pelo teste.
- Falhas guardam rastreamento em `test-results/`; abra com
  `npx playwright show-trace test-results/<caso>/trace.zip`.

## Detalhes da interface que os testes assumem

Verificados contra o aplicativo em execução — se algum mudar, o teste falha e aponta:

| Comportamento | Detalhe |
| --- | --- |
| Abrir arquivo | duplo clique no Explorer; um clique apenas seleciona |
| Editor de texto | `textarea.code-editor` |
| Markdown | abre na visualização do plugin, sem `textarea` |
| Busca | botão com rótulo acessível `Busca indexada`, campo `.tinyide-search__input` |

## Arquivos

| Arquivo | Cobre |
| --- | --- |
| `smoke.spec.mjs` | abrir projeto, ler e editar código, salvar no disco, markdown por plugin, busca |
| `execution.spec.mjs` | perfil gravado no workspace, execução com saída, depuração Python de ponta a ponta |
| `plugin-interaction.spec.mjs` | todos os plugins ativos sem falha, busca abrindo no editor, git, terminal, banco de dados, abas convivendo |
| `performance.spec.mjs` | orçamentos de tempo de abertura, carga do projeto, edição e execução, e resposta do editor durante a indexação |

## Depuração Python

O adaptador é o `pdb`, servido pelo backend do plugin `python-venv`. Dois detalhes
que os testes fixam, por serem fáceis de quebrar:

- depurar exige um **ambiente do provedor Python** (`environment: {mode: "fixed"}`
  apontando para um registro em `.tinyide/environments/python-registry.json`). Com
  `mode: "none"` o botão de depuração fica indisponível, ainda que o perfil informe um
  interpretador;
- ao fim do programa o `pdb` anuncia reinício e volta para a primeira linha. A sessão
  precisa encerrar nesse ponto, e o aviso não deve poluir o console.

## O que ainda não é coberto

Operações de escrita do git (commit, branch), grade de dados contra um banco real e
depuração de Node.js. Cada um exige preparar mais ambiente e vale um arquivo próprio.
