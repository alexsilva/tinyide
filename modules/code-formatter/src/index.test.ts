import { describe, expect, it, vi } from "vitest";
import { TEXT_EDITOR_FORMAT_DOCUMENT_COMMAND } from "@tinyide/plugin-api";
import type {
  LanguageProvider,
  ModuleContext,
  TextEditorContextMenuProvider,
} from "@tinyide/plugin-api";
import { FORMAT_DOCUMENT_COMMAND, codeFormatterModule } from "./index";
import { formatGenericSource } from "./generic-formatter";

function languageProvider(overrides: Partial<LanguageProvider> = {}): LanguageProvider {
  return {
    id: "test-language",
    name: "Test Language",
    extensions: [".test"],
    highlight: () => [],
    lint: async () => [],
    ...overrides,
  };
}

function setup(providers: readonly LanguageProvider[] = []) {
  let menuProvider: TextEditorContextMenuProvider | undefined;
  let command: ((context: any) => Promise<void>) | undefined;
  const replaceContent = vi.fn(async () => undefined);
  const disposeBusy = vi.fn();
  const beginBusy = vi.fn(() => ({ dispose: disposeBusy }));
  const context = {
    commands: {
      register(id: string, handler: (value: any) => Promise<void>) {
        if (id === FORMAT_DOCUMENT_COMMAND) command = handler;
        return { dispose() {} };
      },
    },
    extensions: {
      getLanguageProviders: () => providers,
      registerTextEditorContextMenuProvider(provider: TextEditorContextMenuProvider) {
        menuProvider = provider;
        return { dispose() {} };
      },
    },
    workbench: { editor: { replaceContent, beginBusy } },
    subscriptions: [],
  } as unknown as ModuleContext;
  codeFormatterModule.init(context);
  return {
    menuProvider: () => menuProvider,
    command: () => command,
    replaceContent,
    beginBusy,
    disposeBusy,
  };
}

const menuContext = {
  document: { id: "doc", name: "sample.test", content: "const value={answer:42};" },
  selectionStart: 0,
  selectionEnd: 0,
  line: 1,
  column: 1,
};

describe("code formatter module", () => {
  it("usa o comando público e oferece formatação mesmo sem plugin de linguagem", async () => {
    expect(FORMAT_DOCUMENT_COMMAND).toBe(TEXT_EDITOR_FORMAT_DOCUMENT_COMMAND);
    const harness = setup();
    expect(harness.menuProvider()?.provideItems(menuContext)).toEqual([
      expect.objectContaining({ label: "Formatar documento", command: FORMAT_DOCUMENT_COMMAND, enabled: true }),
    ]);

    await harness.command()?.(menuContext);
    expect(harness.beginBusy).toHaveBeenCalledWith({
      documentId: "doc",
      label: "Formatando documento...",
    });
    expect(harness.disposeBusy).toHaveBeenCalledTimes(1);
    expect(harness.replaceContent).toHaveBeenCalledWith({
      documentId: "doc",
      content: "const value = {\n  answer: 42\n};\n",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });

  it("prioriza o override do plugin de linguagem", async () => {
    const formatDocument = vi.fn(async () => ({ content: "plugin formatted", selectionStart: 3, selectionEnd: 3 }));
    const harness = setup([languageProvider({ formatDocument })]);

    await harness.command()?.({ ...menuContext, environmentExecutable: "/venv/bin/python" });

    expect(formatDocument).toHaveBeenCalledWith({
      document: menuContext.document,
      selectionStart: 0,
      selectionEnd: 0,
      environmentExecutable: "/venv/bin/python",
    });
    expect(harness.replaceContent).toHaveBeenCalledWith({
      documentId: "doc",
      content: "plugin formatted",
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it("volta ao formatter genérico quando o override não está disponível no ambiente", async () => {
    const formatDocument = vi.fn(async () => undefined);
    const harness = setup([languageProvider({ formatDocument })]);

    await harness.command()?.(menuContext);

    expect(formatDocument).toHaveBeenCalledTimes(1);
    expect(harness.replaceContent).toHaveBeenCalledWith(expect.objectContaining({
      content: "const value = {\n  answer: 42\n};\n",
    }));
  });

  it("encerra o estado ocupado mesmo quando o override falha", async () => {
    const harness = setup([languageProvider({
      formatDocument: async () => { throw new Error("formatter failed"); },
    })]);

    await expect(harness.command()?.(menuContext)).rejects.toThrow("formatter failed");
    expect(harness.disposeBusy).toHaveBeenCalledTimes(1);
  });
});

describe("generic code formatter", () => {
  it("formata estruturas comuns de chaves sem conhecer a linguagem", () => {
    expect(formatGenericSource("if(true){value={answer:42};}\n")).toBe(
      "if(true) {\n  value = {\n    answer: 42\n  };\n}\n",
    );
  });

  it("é conservador com documentos sem estrutura de chaves", () => {
    const pythonLike = "def hello(name):\n    return f\"Hello {name}\"\n\n    \n";
    expect(formatGenericSource(pythonLike)).toBe("def hello(name):\n    return f\"Hello {name}\"\n\n\n");
  });
});
