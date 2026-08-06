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

## O que ainda não é coberto

Execução e depuração de um perfil, terminal, operações de git e a grade de banco de
dados. São os próximos candidatos: cada um exige preparar o ambiente (intérprete,
repositório, servidor de banco) e vale um arquivo próprio.
