# Arquitetura de módulos

## Objetivo

Módulos são implementações básicas distribuídas com o tinyIde e carregadas automaticamente pelo host. Eles permitem retirar funcionalidades concretas de `apps/web` sem transformá-las em plugins instaláveis ou aumentar o domínio do `@tinyide/core`.

O modelo separa três responsabilidades:

```text
core      → primitivas genéricas e independentes de funcionalidade
módulo    → implementação básica incluída na distribuição
plugin    → extensão instalável, habilitável e substituível pelo usuário
```

O suporte básico a HTML é a primeira implementação dessa arquitetura.

## Limites arquiteturais

Um módulo:

- é compilado junto com a aplicação;
- é carregado automaticamente durante a inicialização da plataforma;
- não possui instalação, habilitação ou ativação persistida;
- usa somente contratos públicos de `@tinyide/plugin-api`;
- registra contribuições pelos mesmos providers e hooks disponíveis aos plugins;
- pode fornecer uma implementação padrão substituível por providers de plugins;
- não deve acessar implementações internas de `apps/web` ou `@tinyide/core`.

Um módulo não é um atalho para adicionar regras de produto ao core. Funcionalidades genéricas continuam no core; funcionalidades básicas concretas ficam em módulos; extensões opcionais ficam em plugins.

## Organização do repositório

```text
modules/
├── builtin/
│   ├── package.json
│   └── src/
│       └── index.ts       # catálogo estático de módulos incluídos
└── html/
    ├── module.json        # metadados descritivos do módulo
    ├── package.json
    └── src/
        ├── index.ts       # implementação de TinyIdeModule
        ├── html-language.ts
        └── html-preview.ts
```

Cada módulo funcional deve possuir seu próprio pacote. O pacote `@tinyide/modules`, localizado em `modules/builtin`, mantém somente o catálogo das implementações carregadas pela distribuição atual:

```ts
import type { TinyIdeModule } from "@tinyide/plugin-api";
import { htmlModule } from "@tinyide/module-html";

export const builtinModules: readonly TinyIdeModule[] = [htmlModule];
```

O catálogo não deve conter lógica funcional. Sua responsabilidade é declarar, de forma explícita, quais módulos fazem parte da aplicação.

## Contrato público

O contrato de um módulo está em `@tinyide/plugin-api`:

```ts
interface ModuleContext {
  readonly commands: CommandRegistryApi;
  readonly events: EventBusApi;
  readonly extensions: PluginExtensionApi;
  readonly workbench: WorkbenchApi;
  readonly subscriptions: Disposable[];
}

interface TinyIdeModule {
  readonly id: string;
  readonly version: string;
  init(context: ModuleContext): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
```

O `ModuleContext` é deliberadamente menor que o `PluginContext`. Módulos não recebem `backend`, porque são implementações frontend internas da distribuição e não possuem backend privado roteado pelo sistema de plugins.

Apesar de estarem no mesmo repositório, módulos devem depender do contrato público. Isso mantém suas contribuições compatíveis com as de plugins e evita criar uma API interna paralela.

## Inicialização e descarte

O `AppModuleHost` administra o ciclo de vida dos módulos.

Fluxo de inicialização:

```text
AppPlatform.initialize()
→ AppModuleHost.initialize(builtinModules)
→ criação de um ModuleContext por módulo
→ module.init(context)
→ armazenamento do módulo ativo
→ restauração da plataforma e descoberta de plugins
```

Os módulos são inicializados antes da restauração e da descoberta dos plugins. Assim, a aplicação já possui suas implementações básicas quando contribuições externas são carregadas.

Regras do host:

- IDs duplicados são rejeitados;
- falha em `init()` descarta as subscriptions já registradas pelo módulo;
- módulos são descartados na ordem inversa da inicialização;
- `module.dispose()` é chamado antes do descarte das subscriptions;
- subscriptions são descartadas em ordem reversa.

Um registro criado durante `init()` deve sempre ser adicionado a `context.subscriptions`:

```ts
export const htmlModule: TinyIdeModule = {
  id: "html",
  version: "0.1.0",
  init(context) {
    context.subscriptions.push(
      context.extensions.registerLanguageProvider(htmlLanguageProvider),
    );
  },
};
```

## Metadados do módulo

Cada módulo pode manter um `module.json` para identidade e inspeção do pacote:

```json
{
  "id": "html",
  "name": "HTML",
  "description": "Implementação básica de edição e visualização HTML.",
  "version": "0.1.0",
  "entrypoint": "./src/index.ts"
}
```

Na arquitetura atual, esse arquivo é descritivo. O catálogo compilado em `modules/builtin` é a fonte de verdade para carregamento. Portanto, adicionar apenas um `module.json` não faz o módulo ser descoberto automaticamente.

O `id` e a `version` do manifesto devem permanecer consistentes com o objeto `TinyIdeModule` exportado pelo entrypoint.

## Módulos versus plugins

| Aspecto | Módulo | Plugin |
| --- | --- | --- |
| Distribuição | incluído na aplicação | repositório/pacote externo |
| Descoberta | catálogo estático | catálogo de plugins e `plugin.json` |
| Carregamento | automático no startup | após instalação e habilitação |
| Estado persistido | não | sim |
| Ativação | `init()` | `init()` e `activate()` opcional |
| Desativação pelo usuário | não | sim |
| Backend privado | não | opcional |
| Contrato | `ModuleContext` | `PluginContext` |
| Contribuições | providers e hooks públicos | providers e hooks públicos |

A escolha deve seguir estas regras:

1. É uma primitiva genérica necessária para sustentar qualquer funcionalidade? Pertence ao core.
2. É uma implementação básica que deve existir em toda distribuição do tinyIde? Pode ser um módulo.
3. É opcional, instalável, específica de linguagem, framework, ferramenta ou integração? Deve ser um plugin.

Exemplos:

```text
CommandRegistry                    → core
suporte básico a HTML              → módulo
Python, Django, Git e Terminal     → plugins
```

## Substituição por plugins

Módulos registram implementações básicas pelos registries públicos. Plugins podem registrar providers mais completos para a mesma superfície quando o contrato suportar prioridade ou seleção entre providers.

O host não deve conter condições como:

```text
se plugin.id == "html" então desabilitar módulo
```

A substituição deve ser consequência das regras genéricas do registry: prioridade, adequação ao recurso, seleção explícita ou outra política pública. Módulos e plugins não devem importar ou controlar diretamente uns aos outros.

## Como criar um módulo

1. Criar `modules/<nome>/package.json` com dependência de `@tinyide/plugin-api`.
2. Criar `module.json` com identidade, versão e entrypoint.
3. Exportar um objeto `TinyIdeModule` em `src/index.ts`.
4. Registrar contribuições apenas por `context.commands`, `context.events`, `context.extensions` e `context.workbench`.
5. Adicionar todos os descartáveis a `context.subscriptions`.
6. Adicionar o pacote ao catálogo `modules/builtin/src/index.ts`.
7. Adicionar a dependência correspondente em `modules/builtin/package.json`.
8. Criar testes unitários para providers e para o ciclo de vida do módulo.
9. Validar typecheck, testes e integração no navegador.

## Validação arquitetural

A base deve comprovar continuamente que:

1. todos os módulos inicializam sem plugins instalados;
2. IDs duplicados são rejeitados;
3. falhas de inicialização não deixam registros ativos;
4. descarte ocorre em ordem reversa;
5. módulos não importam `apps/web`, `@tinyide/core` ou plugins;
6. módulos usam exclusivamente contratos públicos;
7. a aplicação continua inicializando quando o catálogo está vazio;
8. providers de plugins podem substituir ou complementar implementações básicas sem tratamento por ID;
9. metadados e exports permanecem consistentes;
10. as contribuições funcionam no navegador após o build.

