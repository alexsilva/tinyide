import {
  languageProviderForFile,
  TEXT_EDITOR_FORMAT_DOCUMENT_COMMAND,
  type LanguageDocumentFormattingResult,
  type LanguageProvider,
  type ModuleContext,
  type ResourceContextMenuItem,
  type TextEditorContextMenuContext,
  type TextEditorContextMenuProvider,
  type TinyIdeModule,
} from "@tinyide/plugin-api";
import { formatGenericDocument } from "./generic-formatter";

export const CODE_FORMATTER_MODULE_ID = "code-formatter";
export const FORMAT_DOCUMENT_COMMAND = TEXT_EDITOR_FORMAT_DOCUMENT_COMMAND;

function formattingProvider(
  document: TextEditorContextMenuContext["document"],
  providers: readonly LanguageProvider[],
): LanguageProvider | undefined {
  const provider = languageProviderForFile(document.name, providers);
  return provider?.formatDocument ? provider : undefined;
}

function formatterMenuItem(): ResourceContextMenuItem {
  return {
    id: "code-formatter.format-document",
    label: "Formatar documento",
    command: FORMAT_DOCUMENT_COMMAND,
    group: "formatting",
    order: 200,
    enabled: true,
  };
}

async function formatDocument(
  commandContext: TextEditorContextMenuContext,
  providers: readonly LanguageProvider[],
): Promise<LanguageDocumentFormattingResult> {
  const override = formattingProvider(commandContext.document, providers);
  const overridden = override?.formatDocument
    ? await override.formatDocument({
        document: commandContext.document,
        selectionStart: commandContext.selectionStart,
        selectionEnd: commandContext.selectionEnd,
        ...(commandContext.environmentExecutable
          ? { environmentExecutable: commandContext.environmentExecutable }
          : {}),
      })
    : undefined;

  return overridden ?? formatGenericDocument({
    content: commandContext.document.content,
    selectionStart: commandContext.selectionStart,
    selectionEnd: commandContext.selectionEnd,
  });
}

export function createCodeFormatterModule(): TinyIdeModule {
  return {
    id: CODE_FORMATTER_MODULE_ID,
    version: "0.1.0",
    init(context: ModuleContext) {
      const providers = () => context.extensions.getLanguageProviders();
      const menuProvider: TextEditorContextMenuProvider = {
        id: "code-formatter.editor-menu",
        pluginId: CODE_FORMATTER_MODULE_ID,
        provideItems() {
          return [formatterMenuItem()];
        },
      };

      context.subscriptions.push(context.extensions.registerTextEditorContextMenuProvider(menuProvider));
      context.subscriptions.push(context.commands.register(
        FORMAT_DOCUMENT_COMMAND,
        async (commandContext: TextEditorContextMenuContext) => {
          const busy = context.workbench.editor.beginBusy({
            documentId: commandContext.document.id,
            label: "Formatando documento...",
          });
          try {
            const result = await formatDocument(commandContext, providers());
            if (result.content === commandContext.document.content) return;
            const selectionStart = Math.min(
              Math.max(0, result.selectionStart ?? commandContext.selectionStart),
              result.content.length,
            );
            const selectionEnd = Math.min(
              Math.max(selectionStart, result.selectionEnd ?? commandContext.selectionEnd),
              result.content.length,
            );
            await context.workbench.editor.replaceContent({
              documentId: commandContext.document.id,
              content: result.content,
              selectionStart,
              selectionEnd,
            });
          } finally {
            busy.dispose();
          }
        },
      ));
    },
  };
}

export const codeFormatterModule = createCodeFormatterModule();
