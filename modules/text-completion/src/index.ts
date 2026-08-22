import type {
  ModuleContext,
  TextEditorCompletionContext,
  TextEditorCompletionItem,
  TextEditorCompletionProvider,
  TextEditorDocumentSnapshot,
  TinyIdeModule,
} from "@tinyide/plugin-api";

export const TEXT_COMPLETION_MODULE_ID = "text-completion";
export const TEXT_COMPLETION_PROVIDER_ID = "text-completion.document-words";
export const TEXT_COMPLETION_PRIORITY = -100;
export const DEFAULT_TEXT_COMPLETION_LIMIT = 40;

const TEXTUAL_MEDIA_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/x-rst",
  "text/asciidoc",
]);

const TEXTUAL_EXTENSIONS = new Set([
  ".adoc",
  ".asciidoc",
  ".changelog",
  ".log",
  ".markdown",
  ".md",
  ".mdown",
  ".mkd",
  ".notes",
  ".rst",
  ".text",
  ".txt",
]);

const TEXTUAL_BASENAMES = new Set([
  "changelog",
  "copying",
  "license",
  "notes",
  "readme",
  "todo",
]);

const WORD_PATTERN = /[\p{L}][\p{L}\p{M}\p{N}_'-]{2,}/gu;
const INLINE_CODE_PATTERN = /`[^`]*`/g;
const FENCE_PATTERN = /^\s*(```|~~~)/;

type RankedWord = {
  readonly word: string;
  readonly normalized: string;
  readonly count: number;
  readonly lastIndex: number;
};

function mediaTypeBase(mediaType: string | undefined): string {
  return mediaType?.split(";")[0]?.trim().toLocaleLowerCase("en-US") ?? "";
}

function documentName(document: TextEditorDocumentSnapshot): string {
  return (document.path || document.name || "").split(/[\\/]/).pop() ?? document.name;
}

function extensionOf(document: TextEditorDocumentSnapshot): string {
  const name = documentName(document).toLocaleLowerCase("en-US");
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index) : "";
}

function basenameOf(document: TextEditorDocumentSnapshot): string {
  const name = documentName(document).toLocaleLowerCase("en-US");
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

export function isMarkdownDocument(document: TextEditorDocumentSnapshot): boolean {
  const mediaType = mediaTypeBase(document.mediaType);
  const extension = extensionOf(document);
  return mediaType === "text/markdown" || mediaType === "text/x-markdown" || [".md", ".markdown", ".mdown", ".mkd"].includes(extension);
}

export function isTextCompletionDocument(document: TextEditorDocumentSnapshot): boolean {
  const mediaType = mediaTypeBase(document.mediaType);
  if (TEXTUAL_MEDIA_TYPES.has(mediaType)) return true;
  const extension = extensionOf(document);
  if (TEXTUAL_EXTENSIONS.has(extension)) return true;
  return TEXTUAL_BASENAMES.has(basenameOf(document));
}

export function stripMarkdownCode(content: string): string {
  let fenced = false;
  return content
    .split(/\r?\n/)
    .map((line) => {
      if (FENCE_PATTERN.test(line)) {
        fenced = !fenced;
        return "";
      }
      if (fenced) return "";
      return line.replace(INLINE_CODE_PATTERN, " ");
    })
    .join("\n");
}

export function normalizeCompletionWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function readableWord(value: string): boolean {
  return /\p{L}/u.test(value) && !/^[_'-]+$/.test(value);
}

export function documentWordCompletions(
  context: TextEditorCompletionContext,
  limit: number = DEFAULT_TEXT_COMPLETION_LIMIT,
): TextEditorCompletionItem[] {
  if (context.signal?.aborted || limit <= 0) return [];

  const prefix = context.prefix.trim();
  const normalizedPrefix = normalizeCompletionWord(prefix);
  if (normalizedPrefix.length < 2) return [];

  const source = isMarkdownDocument(context.document)
    ? stripMarkdownCode(context.document.content)
    : context.document.content;
  const words = new Map<string, { word: string; count: number; lastIndex: number }>();
  let match: RegExpExecArray | null;
  WORD_PATTERN.lastIndex = 0;

  while ((match = WORD_PATTERN.exec(source)) !== null) {
    if (context.signal?.aborted) return [];
    const word = match[0];
    if (!readableWord(word)) continue;
    const normalized = normalizeCompletionWord(word);
    if (!normalized.startsWith(normalizedPrefix) || normalized === normalizedPrefix) continue;
    const previous = words.get(normalized);
    if (previous) {
      const preferredWord = previous.word === previous.word.toLocaleLowerCase("pt-BR") && word !== word.toLocaleLowerCase("pt-BR")
        ? word
        : previous.word;
      words.set(normalized, {
        word: preferredWord,
        count: previous.count + 1,
        lastIndex: match.index,
      });
    } else {
      words.set(normalized, { word, count: 1, lastIndex: match.index });
    }
  }

  const ranked: RankedWord[] = [...words.entries()]
    .map(([normalized, value]) => ({ normalized, ...value }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (right.lastIndex !== left.lastIndex) return right.lastIndex - left.lastIndex;
      return left.word.localeCompare(right.word, "pt-BR");
    });

  return ranked.slice(0, limit).map((entry, index) => ({
    label: entry.word,
    insertText: entry.word,
    kind: "text",
    detail: "texto do documento",
    sortText: `${String(index).padStart(4, "0")}_${entry.normalized}`,
    filterText: entry.word,
  }));
}

export const textCompletionProvider: TextEditorCompletionProvider = {
  id: TEXT_COMPLETION_PROVIDER_ID,
  pluginId: TEXT_COMPLETION_MODULE_ID,
  priority: TEXT_COMPLETION_PRIORITY,
  canComplete(document) {
    return isTextCompletionDocument(document);
  },
  provideCompletions(context) {
    return documentWordCompletions(context);
  },
};

export const textCompletionModule: TinyIdeModule = {
  id: TEXT_COMPLETION_MODULE_ID,
  version: "0.1.0",
  init(context: ModuleContext) {
    context.subscriptions.push(
      context.extensions.registerTextEditorCompletionProvider(textCompletionProvider),
    );
  },
};

export default textCompletionModule;
