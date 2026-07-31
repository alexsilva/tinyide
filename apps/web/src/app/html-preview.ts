import createDOMPurify from "dompurify";
import type {
  CapabilityRegistryApi,
  CommandRegistryApi,
  Disposable,
  PluginSettingsProvider,
  PluginSettingValues,
  TextEditorDocumentSnapshot,
  WorkbenchEditorToolbarProvider,
  WorkbenchHtmlPreviewProvider,
  WorkbenchHtmlPreviewSandboxPermission,
  WorkbenchResourceDescriptor,
  WorkbenchResourceEditorProvider,
} from "@tinyide/plugin-api";
import { resolvePluginBooleanSettingValue } from "./plugin-settings";

const HTML_EXTENSIONS = [".html", ".htm"];
const CORE_HTML_PLUGIN_ID = "core.html";
const SOURCE_LINE_ATTRIBUTE = "data-tinyide-source-line";
const ALLOWED_SANDBOX_PERMISSIONS = new Set<WorkbenchHtmlPreviewSandboxPermission>([
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-popups",
]);
const FORBIDDEN_URL_PROTOCOL = /^(?:javascript|vbscript|data):/i;
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "poster", "xlink:href"]);
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);

const openInPreviewSetting = {
  id: "openInPreview",
  type: "boolean",
  label: "Abrir em modo de visualização",
  description: "Renderiza documentos HTML ao abri-los. A alternância manual continua valendo durante a sessão do documento.",
  defaultValue: true,
} as const;

export const htmlPreviewSettingsProvider: PluginSettingsProvider = {
  id: "core.html.settings",
  pluginId: CORE_HTML_PLUGIN_ID,
  title: "HTML",
  description: "Configura o modo inicial dos documentos HTML.",
  settings: [openInPreviewSetting],
};

function htmlResource(resource: Pick<WorkbenchResourceDescriptor, "name" | "path" | "mediaType" | "kind">): boolean {
  if (resource.kind !== "text") return false;
  if (resource.mediaType.toLocaleLowerCase().split(";", 1)[0] === "text/html") return true;
  const path = (resource.path ?? resource.name).toLocaleLowerCase();
  return HTML_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function applicableProviders(
  resource: WorkbenchResourceDescriptor,
  providers: readonly WorkbenchHtmlPreviewProvider[],
): readonly WorkbenchHtmlPreviewProvider[] {
  return providers
    .filter((provider) => {
      try {
        return provider.canHandle?.(resource) !== false;
      } catch {
        return false;
      }
    })
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0) || left.id.localeCompare(right.id));
}

function safeSandbox(
  permissions: readonly WorkbenchHtmlPreviewSandboxPermission[] | undefined,
): readonly WorkbenchHtmlPreviewSandboxPermission[] {
  return [...new Set((permissions ?? []).filter((permission) => ALLOWED_SANDBOX_PERMISSIONS.has(permission)))];
}

function resourceFromDocument(document: TextEditorDocumentSnapshot): WorkbenchResourceDescriptor {
  return {
    id: document.id,
    name: document.name,
    ...(document.path ? { path: document.path } : {}),
    ...(document.workspaceRoot ? { workspaceRoot: document.workspaceRoot } : {}),
    mediaType: document.mediaType ?? "text/plain",
    size: document.content.length,
    kind: "text",
  };
}

function countLines(text: string): number {
  let total = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") total += 1;
  }
  return total;
}

function lineAtOffset(text: string, offset: number): number {
  return countLines(text.slice(0, Math.max(0, offset)));
}

export function htmlTopLevelBlockLines(source: string): readonly number[] {
  const bodyStart = /<body\b[^>]*>/i.exec(source);
  const bodyEnd = bodyStart
    ? source.slice(bodyStart.index + bodyStart[0].length).search(/<\/body\s*>/i)
    : -1;
  const start = bodyStart ? bodyStart.index + bodyStart[0].length : 0;
  const end = bodyStart && bodyEnd >= 0 ? start + bodyEnd : source.length;
  const fragment = source.slice(start, end);
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?([A-Za-z][\w:-]*)\b[^>]*>/g;
  const lines: number[] = [];
  let depth = 0;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(fragment))) {
    const raw = token[0];
    const tag = token[1]?.toLocaleLowerCase();
    if (!tag || raw.startsWith("<!")) continue;
    const closing = /^<\//.test(raw);
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) lines.push(lineAtOffset(source, start + token.index));
    if (!VOID_ELEMENTS.has(tag) && !/\/\s*>$/.test(raw)) depth += 1;
  }
  return lines;
}

function annotateTopLevelBlocks(source: string, owner: Document): string {
  const parser = new owner.defaultView!.DOMParser();
  const parsed = parser.parseFromString(source, "text/html");
  const blocks = Array.from(parsed.body.children);
  const lines = htmlTopLevelBlockLines(source);
  if (blocks.length === lines.length) {
    blocks.forEach((block, index) => block.setAttribute(SOURCE_LINE_ATTRIBUTE, String(lines[index])));
  }
  const doctype = parsed.doctype ? `<!doctype ${parsed.doctype.name}>` : "<!doctype html>";
  return `${doctype}\n${parsed.documentElement.outerHTML}`;
}

export function sanitizeHtmlPreview(source: string, owner: Document): string {
  const view = owner.defaultView;
  if (!view) return "";
  const purifier = createDOMPurify(view);
  purifier.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName.toLocaleLowerCase();
    if (name.startsWith("on") || name === "srcdoc") {
      data.keepAttr = false;
      return;
    }
    if (!URL_ATTRIBUTES.has(name)) return;
    const normalized = data.attrValue.replace(/[\u0000-\u0020]+/g, "").toLocaleLowerCase();
    if (FORBIDDEN_URL_PROTOCOL.test(normalized)) data.keepAttr = false;
  });
  return purifier.sanitize(annotateTopLevelBlocks(source, owner), {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "base", "meta", "iframe", "object", "embed", "foreignObject"],
    FORBID_ATTR: ["srcdoc"],
  }) as string;
}

function interpolate(value: number, start: number, end: number, mappedStart: number, mappedEnd: number): number {
  if (end <= start) return mappedStart;
  const ratio = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return mappedStart + ratio * (mappedEnd - mappedStart);
}

export interface HtmlPreviewAnchor {
  readonly line: number;
  readonly offset: number;
}

export function previewOffsetForLine(
  anchors: readonly HtmlPreviewAnchor[],
  line: number,
  totalLines: number,
  contentHeight: number,
): number {
  if (!anchors.length) return interpolate(line, 1, Math.max(1, totalLines), 0, contentHeight);
  let index = 0;
  while (index + 1 < anchors.length && anchors[index + 1]!.line <= line) index += 1;
  const current = anchors[index]!;
  if (line < current.line && index === 0) return interpolate(line, 1, current.line, 0, current.offset);
  const next = anchors[index + 1] ?? { line: Math.max(current.line + 1, totalLines + 1), offset: contentHeight };
  return interpolate(line, current.line, next.line, current.offset, next.offset);
}

export function sourceLineForPreviewOffset(
  anchors: readonly HtmlPreviewAnchor[],
  offset: number,
  totalLines: number,
  contentHeight: number,
): number {
  if (!anchors.length) return interpolate(offset, 0, contentHeight, 1, Math.max(1, totalLines));
  let index = 0;
  while (index + 1 < anchors.length && anchors[index + 1]!.offset <= offset) index += 1;
  const current = anchors[index]!;
  if (offset < current.offset && index === 0) return interpolate(offset, 0, current.offset, 1, current.line);
  const next = anchors[index + 1] ?? { line: Math.max(current.line + 1, totalLines + 1), offset: contentHeight };
  return interpolate(offset, current.offset, next.offset, current.line, next.line);
}

function emptyDisposable(): Disposable {
  return { dispose() {} };
}

function synchronizePreviewScroll(input: {
  readonly iframe: HTMLIFrameElement;
  readonly source: string;
  readonly topLine?: number;
  readonly revealLine?: (line: number) => void;
}): Disposable {
  const { iframe, source, topLine, revealLine } = input;
  let disposed = false;
  let frame = 0;
  let scrollView: Window | null = null;
  let scrollingElement: Element | null = null;
  let anchors: readonly HtmlPreviewAnchor[] = [];
  let reported = topLine ?? 1;

  const cancelFrame = () => {
    if (!frame || !scrollView) return;
    (scrollView.cancelAnimationFrame ?? scrollView.clearTimeout).call(scrollView, frame);
    frame = 0;
  };
  const contentHeight = () => Math.max(
    1,
    (scrollingElement?.scrollHeight ?? 1) - (scrollingElement?.clientHeight ?? scrollView?.innerHeight ?? 0),
  );
  const onScroll = () => {
    if (disposed || frame || !scrollView || !scrollingElement) return;
    frame = (scrollView.requestAnimationFrame ?? scrollView.setTimeout).call(scrollView, () => {
      frame = 0;
      if (disposed || !scrollingElement) return;
      const line = sourceLineForPreviewOffset(
        anchors,
        scrollingElement.scrollTop,
        countLines(source),
        contentHeight(),
      );
      if (Math.abs(line - reported) < 0.01) return;
      reported = line;
      revealLine?.(line);
    });
  };
  const onLoad = () => {
    if (disposed) return;
    const document = iframe.contentDocument;
    scrollView = iframe.contentWindow;
    scrollingElement = document?.scrollingElement ?? document?.documentElement ?? null;
    if (!document?.body || !scrollView || !scrollingElement) return;
    const origin = scrollingElement.getBoundingClientRect().top - scrollingElement.scrollTop;
    anchors = Array.from(document.body.children).flatMap((element) => {
      const line = Number(element.getAttribute(SOURCE_LINE_ATTRIBUTE));
      element.removeAttribute(SOURCE_LINE_ATTRIBUTE);
      return Number.isFinite(line) && line >= 1
        ? [{ line, offset: Math.max(0, element.getBoundingClientRect().top - origin) }]
        : [];
    });
    scrollingElement.scrollTop = previewOffsetForLine(
      anchors,
      reported,
      countLines(source),
      contentHeight(),
    );
    scrollView.addEventListener("scroll", onScroll, { passive: true });
  };

  iframe.addEventListener("load", onLoad, { once: true });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      iframe.removeEventListener("load", onLoad);
      scrollView?.removeEventListener("scroll", onScroll);
      cancelFrame();
      iframe.remove();
    },
  };
}

export interface NativeHtmlPreviewFeature {
  readonly resourceEditorProvider: WorkbenchResourceEditorProvider;
  readonly toolbarProvider: WorkbenchEditorToolbarProvider;
  readonly settingsProvider: PluginSettingsProvider;
  toggle(document: TextEditorDocumentSnapshot): void;
  dispose(): void;
}

export function createNativeHtmlPreviewFeature(
  getProviders: () => readonly WorkbenchHtmlPreviewProvider[] = () => [],
): NativeHtmlPreviewFeature {
  const previewModes = new Map<string, boolean>();
  const previewSnapshots = new Map<string, TextEditorDocumentSnapshot>();
  const listeners = new Set<() => void>();

  const providersFor = (resource: WorkbenchResourceDescriptor) => applicableProviders(resource, getProviders());
  const emitChange = () => listeners.forEach((listener) => listener());

  const resourceEditorProvider: WorkbenchResourceEditorProvider = {
    id: "core.html.preview",
    pluginId: CORE_HTML_PLUGIN_ID,
    priority: -100,
    canOpen(resource, settings: PluginSettingValues = {}) {
      if (!htmlResource(resource)) return false;
      if (!previewModes.has(resource.id)) {
        let previewByDefault = resolvePluginBooleanSettingValue(openInPreviewSetting, settings);
        const providers = providersFor(resource).slice().reverse();
        for (const provider of providers) {
          try {
            const configured = provider.previewByDefault?.(resource);
            if (configured !== undefined) {
              previewByDefault = configured;
              break;
            }
          } catch {
            // A faulty customization must not break the text editor.
          }
        }
        previewModes.set(resource.id, previewByDefault);
      }
      return previewModes.get(resource.id) === true;
    },
    onDidChange(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    async mount({ container, resource, read, signal, topLine, revealLine }) {
      if (signal?.aborted) return emptyDisposable();
      const snapshot = previewSnapshots.get(resource.id);
      let html = snapshot?.content ?? await (await read()).text();
      if (signal?.aborted) return emptyDisposable();
      let sandbox: readonly WorkbenchHtmlPreviewSandboxPermission[] = [];
      let unsafeExecution = false;
      for (const provider of providersFor(resource)) {
        if (!provider.providePreview) continue;
        try {
          const result = await provider.providePreview({ resource, html, sandbox });
          if (signal?.aborted) return emptyDisposable();
          if (!result) continue;
          if (typeof result.html === "string") html = result.html;
          if (result.sandbox) sandbox = safeSandbox(result.sandbox);
          if (result.unsafeAllowScripts === true && result.unsafeSkipSanitize === true) {
            unsafeExecution = true;
          }
        } catch {
          // A failing plugin customizer must not disable the core HTML preview.
        }
      }
      if (signal?.aborted) return emptyDisposable();

      const iframe = container.ownerDocument.createElement("iframe");
      iframe.dataset.htmlPreview = "";
      iframe.title = `Prévia de ${resource.name}`;
      iframe.referrerPolicy = "no-referrer";
      iframe.setAttribute("sandbox", [...sandbox, ...(unsafeExecution ? ["allow-scripts"] : [])].join(" "));
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "0";
      iframe.style.background = "#fff";
      iframe.srcdoc = unsafeExecution ? html : sanitizeHtmlPreview(html, container.ownerDocument);
      const scrollDisposable = synchronizePreviewScroll({
        iframe,
        source: html,
        ...(topLine !== undefined ? { topLine } : {}),
        ...(revealLine ? { revealLine } : {}),
      });
      if (signal?.aborted) {
        scrollDisposable.dispose();
        return emptyDisposable();
      }
      container.replaceChildren(iframe);
      const onAbort = () => scrollDisposable.dispose();
      signal?.addEventListener("abort", onAbort, { once: true });
      return {
        dispose() {
          signal?.removeEventListener("abort", onAbort);
          scrollDisposable.dispose();
        },
      };
    },
  };

  const toolbarProvider: WorkbenchEditorToolbarProvider = {
    id: "core.html.toolbar",
    provideItems(document) {
      const resource = resourceFromDocument(document);
      if (!htmlResource(resource)) return [];
      const previewing = previewModes.get(document.id) === true;
      return [{
        id: "core.html.preview",
        label: previewing ? "Editar HTML" : "Visualizar HTML",
        command: "core.html.togglePreview",
        icon: previewing ? "diff" : "preview",
        order: 20,
      }];
    },
  };

  const toggle = (document: TextEditorDocumentSnapshot) => {
    const resource = resourceFromDocument(document);
    if (!htmlResource(resource)) return;
    const previewing = previewModes.get(document.id) === true;
    previewModes.set(document.id, !previewing);
    if (previewing) previewSnapshots.delete(document.id);
    else previewSnapshots.set(document.id, { ...document });
    emitChange();
  };

  return {
    resourceEditorProvider,
    toolbarProvider,
    settingsProvider: htmlPreviewSettingsProvider,
    toggle,
    dispose() {
      previewModes.clear();
      previewSnapshots.clear();
      listeners.clear();
    },
  };
}

export function installNativeHtmlPreview(
  capabilities: CapabilityRegistryApi,
  commands: CommandRegistryApi,
): Disposable {
  const feature = createNativeHtmlPreviewFeature(
    () => capabilities.getAll<WorkbenchHtmlPreviewProvider>("workbench.htmlPreview"),
  );
  const subscriptions = [
    capabilities.register("plugin.settings", feature.settingsProvider),
    capabilities.register("workbench.resourceEditor", feature.resourceEditorProvider),
    capabilities.register("workbench.editorToolbar", feature.toolbarProvider),
    commands.register("core.html.togglePreview", (document) => {
      feature.toggle(document as TextEditorDocumentSnapshot);
    }),
  ];
  return {
    dispose() {
      subscriptions.reverse().forEach((subscription) => subscription.dispose());
      feature.dispose();
    },
  };
}
