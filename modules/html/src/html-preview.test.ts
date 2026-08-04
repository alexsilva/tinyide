// @ts-expect-error jsdom is available to the test runner without bundled declarations.
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type {
  Disposable,
  TextEditorDocumentSnapshot,
  WorkbenchHtmlPreviewProvider,
  WorkbenchResourceDescriptor,
} from "@tinyide/plugin-api";
import {
  createHtmlPreviewFeature,
  htmlPreviewSettingsProvider,
  htmlTopLevelBlockLines,
  previewOffsetForLine,
  sanitizeHtmlPreview,
  sourceLineForPreviewOffset,
} from "./html-preview";

const document: TextEditorDocumentSnapshot = {
  id: "page",
  name: "index.html",
  path: "index.html",
  workspaceRoot: "/workspace",
  mediaType: "text/html",
  content: "<h1>Hello</h1><script>alert(1)</script>",
  isDirty: true,
};

const resource: WorkbenchResourceDescriptor = {
  id: "page",
  name: "index.html",
  path: "index.html",
  workspaceRoot: "/workspace",
  mediaType: "text/html",
  size: document.content.length,
  kind: "text",
};

function testContainer(): { readonly dom: JSDOM; readonly container: HTMLElement } {
  const dom = new JSDOM("<div id=\"host\"></div>", { pretendToBeVisual: true });
  return {
    dom,
    container: dom.window.document.querySelector("#host") as HTMLElement,
  };
}

async function mountPreview(
  feature: ReturnType<typeof createHtmlPreviewFeature>,
  html: string,
  options: {
    readonly signal?: AbortSignal;
    readonly topLine?: number;
    readonly revealLine?: (line: number) => void;
  } = {},
): Promise<{ readonly container: HTMLElement; readonly iframe: HTMLIFrameElement; readonly disposable: Disposable }> {
  const { container } = testContainer();
  const disposable = await feature.resourceEditorProvider.mount({
    container,
    resource,
    async read() { return new Blob([html]); },
    ...options,
  }) as Disposable;
  return {
    container,
    iframe: container.querySelector("[data-html-preview]") as HTMLIFrameElement,
    disposable,
  };
}

describe("native HTML preview", () => {
  it("registers an HTML setting enabled by default", () => {
    expect(htmlPreviewSettingsProvider).toMatchObject({
      pluginId: "module.html",
      title: "HTML",
      settings: [{
        id: "openInPreview",
        type: "boolean",
        defaultValue: true,
      }],
    });
  });

  it("resolves initial mode as manual choice, plugin default, setting, then true", () => {
    const disabled = createHtmlPreviewFeature();
    expect(disabled.resourceEditorProvider.canOpen(resource, { openInPreview: false })).toBe(false);
    disabled.toggle(document);
    expect(disabled.resourceEditorProvider.canOpen(resource, { openInPreview: false })).toBe(true);
    disabled.toggle(document);
    expect(disabled.resourceEditorProvider.canOpen(resource, { openInPreview: true })).toBe(false);

    const pluginEnabled = createHtmlPreviewFeature(() => [{
      id: "enable",
      pluginId: "example",
      previewByDefault: () => true,
    }]);
    expect(pluginEnabled.resourceEditorProvider.canOpen(resource, { openInPreview: false })).toBe(true);
    pluginEnabled.toggle(document);
    expect(pluginEnabled.resourceEditorProvider.canOpen(resource, { openInPreview: true })).toBe(false);

    const pluginDisabled = createHtmlPreviewFeature(() => [{
      id: "disable",
      pluginId: "example",
      previewByDefault: () => false,
    }]);
    expect(pluginDisabled.resourceEditorProvider.canOpen(resource, { openInPreview: true })).toBe(false);

    const defaultFeature = createHtmlPreviewFeature();
    expect(defaultFeature.resourceEditorProvider.canOpen(resource)).toBe(true);
  });

  it("sanitizes active content and dangerous embedded elements", () => {
    const { dom } = testContainer();
    const unsafe = `<!doctype html><html><head>
      <base href="https://evil.example/">
      <meta http-equiv="refresh" content="0;url=https://evil.example/">
    </head><body>
      <script>alert(1)</script>
      <img src="data:text/html,evil" onerror="alert(1)">
      <a href="javascript:alert(1)" onclick="alert(1)">link</a>
      <form action="vbscript:alert(1)"><button formaction="data:text/html,evil">go</button></form>
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <object data="https://evil.example/object"></object>
      <embed src="https://evil.example/embed">
      <svg><script>alert(1)</script><foreignObject><div onload="alert(1)"></div></foreignObject></svg>
    </body></html>`;
    const sanitized = sanitizeHtmlPreview(unsafe, dom.window.document);
    const parsed = new dom.window.DOMParser().parseFromString(sanitized, "text/html");

    expect(parsed.querySelectorAll("script,base,meta,iframe,object,embed,foreignObject")).toHaveLength(0);
    expect(parsed.querySelector("[onerror],[onclick],[onload],[srcdoc]")).toBeNull();
    expect(parsed.querySelector("img")?.hasAttribute("src")).toBe(false);
    expect(parsed.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(parsed.querySelector("form")?.hasAttribute("action")).toBe(false);
    expect(parsed.querySelector("button")?.hasAttribute("formaction")).toBe(false);
  });

  it("sanitizes after provider composition and filters sandbox permissions", async () => {
    const providers: WorkbenchHtmlPreviewProvider[] = [
      {
        id: "broken.html",
        pluginId: "broken",
        priority: 5,
        providePreview: () => {
          throw new Error("broken customizer");
        },
      },
      {
        id: "example.html",
        pluginId: "example",
        priority: 10,
        providePreview: ({ html }) => ({
          html: `${html}<script>provider()</script><p onclick="provider()">safe</p>`,
          sandbox: ["allow-forms", "allow-same-origin" as never, "allow-scripts" as never],
        }),
      },
    ];
    const feature = createHtmlPreviewFeature(() => providers);
    const { iframe, disposable } = await mountPreview(feature, "<h1>Hello</h1>");

    expect(iframe.srcdoc).toContain("<h1");
    expect(iframe.srcdoc).not.toContain("<script");
    expect(iframe.srcdoc).not.toContain("onclick");
    expect(iframe.getAttribute("sandbox")).toBe("allow-forms");
    disposable.dispose();
    feature.dispose();
  });

  it("requires both explicit unsafe flags before executing unsanitized HTML", async () => {
    const partial = createHtmlPreviewFeature(() => [{
      id: "partial",
      pluginId: "partial",
      providePreview: () => ({
        html: "<script>blocked()</script>",
        unsafeAllowScripts: true,
      }),
    }]);
    const partialMount = await mountPreview(partial, "<p>source</p>");
    expect(partialMount.iframe.srcdoc).not.toContain("<script");
    expect(partialMount.iframe.getAttribute("sandbox")).toBe("");
    partialMount.disposable.dispose();

    const unsafe = createHtmlPreviewFeature(() => [{
      id: "unsafe",
      pluginId: "unsafe",
      providePreview: () => ({
        html: "<script>allowed()</script>",
        sandbox: ["allow-popups", "allow-same-origin" as never],
        unsafeAllowScripts: true,
        unsafeSkipSanitize: true,
      }),
    }]);
    const unsafeMount = await mountPreview(unsafe, "<p>source</p>");
    expect(unsafeMount.iframe.srcdoc).toBe("<script>allowed()</script>");
    expect(unsafeMount.iframe.getAttribute("sandbox")).toBe("allow-popups allow-scripts");
    expect(unsafeMount.iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
    unsafeMount.disposable.dispose();
  });

  it("uses the real media type for toolbar detection", () => {
    const feature = createHtmlPreviewFeature();
    const extensionless = { ...document, name: "preview", path: "preview", mediaType: "text/html" };
    expect(feature.toolbarProvider.provideItems(extensionless)).toEqual([expect.objectContaining({
      command: "module.html.togglePreview",
    })]);
    feature.toggle(extensionless);
    expect(feature.resourceEditorProvider.canOpen({ ...resource, name: "preview", path: "preview" })).toBe(true);
  });

  it("does not mutate the DOM when an asynchronous mount is cancelled", async () => {
    let resolveRead: ((blob: Blob) => void) | undefined;
    const read = new Promise<Blob>((resolve) => { resolveRead = resolve; });
    const feature = createHtmlPreviewFeature();
    const { container } = testContainer();
    const controller = new AbortController();
    const mounting = feature.resourceEditorProvider.mount({
      container,
      resource,
      read: () => read,
      signal: controller.signal,
    });
    controller.abort();
    resolveRead?.(new Blob(["<h1>late</h1>"]));
    const disposable = await mounting as Disposable;

    expect(container.childElementCount).toBe(0);
    disposable.dispose();
  });

  it("disposes the mounted iframe and its scroll listener", async () => {
    const feature = createHtmlPreviewFeature();
    const { iframe, disposable } = await mountPreview(feature, "<p>one</p>\n<p>two</p>");
    const view = iframe.contentWindow!;
    const removeListener = vi.spyOn(view, "removeEventListener");
    const loadEvent = iframe.ownerDocument.createEvent("Event");
    loadEvent.initEvent("load", false, false);
    iframe.dispatchEvent(loadEvent);

    expect(iframe.isConnected).toBe(true);
    disposable.dispose();
    expect(iframe.isConnected).toBe(false);
    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("maps source lines to preview offsets and back with proportional fallback", () => {
    const anchors = [
      { line: 2, offset: 100 },
      { line: 6, offset: 500 },
    ];
    expect(previewOffsetForLine(anchors, 4, 10, 900)).toBe(300);
    expect(sourceLineForPreviewOffset(anchors, 300, 10, 900)).toBe(4);
    expect(previewOffsetForLine([], 5, 10, 900)).toBe(400);
    expect(sourceLineForPreviewOffset([], 400, 10, 900)).toBe(5);
  });

  it("restores topLine in the iframe and continuously reports preview scrolling", async () => {
    const feature = createHtmlPreviewFeature();
    const revealLine = vi.fn();
    const mounted = await mountPreview(
      feature,
      "<h1>one</h1>\n<p>two</p>\n<section>three</section>\n<footer>four</footer>",
      { topLine: 3, revealLine },
    );
    const previewDocument = mounted.iframe.contentDocument!;
    const previewView = mounted.iframe.contentWindow!;
    previewDocument.body.innerHTML = [
      "<h1 data-tinyide-source-line=\"1\">one</h1>",
      "<p data-tinyide-source-line=\"2\">two</p>",
      "<section data-tinyide-source-line=\"3\">three</section>",
      "<footer data-tinyide-source-line=\"4\">four</footer>",
    ].join("");
    const scrollingElement = previewDocument.documentElement;
    Object.defineProperty(scrollingElement, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(scrollingElement, "clientHeight", { configurable: true, value: 100 });
    vi.spyOn(scrollingElement, "getBoundingClientRect").mockReturnValue({ top: 0 } as DOMRect);
    Array.from(previewDocument.body.children as Iterable<HTMLElement>).forEach((element, index) => {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ top: index * 100 } as DOMRect);
    });

    const loadEvent = mounted.iframe.ownerDocument.createEvent("Event");
    loadEvent.initEvent("load", false, false);
    mounted.iframe.dispatchEvent(loadEvent);
    expect(scrollingElement.scrollTop).toBe(200);

    scrollingElement.scrollTop = 300;
    const scrollEvent = mounted.iframe.ownerDocument.createEvent("Event");
    scrollEvent.initEvent("scroll", false, false);
    previewView.dispatchEvent(scrollEvent);
    await new Promise((resolve) => previewView.setTimeout(resolve, 30));
    expect(revealLine).toHaveBeenLastCalledWith(4);
    mounted.disposable.dispose();
  });

  it("annotates top-level blocks using their source lines", () => {
    expect(htmlTopLevelBlockLines("<body>\n<h1>A</h1>\n<section><p>B</p></section>\n</body>")).toEqual([2, 3]);
    const { dom } = testContainer();
    const sanitized = sanitizeHtmlPreview("<body>\n<h1>A</h1>\n<script>x()</script>\n<p>B</p>\n</body>", dom.window.document);
    const parsed = new dom.window.DOMParser().parseFromString(sanitized, "text/html");
    expect(Array.from(parsed.body.children as Iterable<Element>).map((element) => element.getAttribute("data-tinyide-source-line"))).toEqual([
      "2",
      "4",
    ]);
  });

  it("ignores non-HTML documents", () => {
    const feature = createHtmlPreviewFeature();
    expect(feature.toolbarProvider.provideItems({
      ...document,
      name: "notes.txt",
      path: "notes.txt",
      mediaType: "text/plain",
    })).toEqual([]);
    expect(feature.resourceEditorProvider.canOpen({
      ...resource,
      name: "notes.txt",
      path: "notes.txt",
      mediaType: "text/plain",
    })).toBe(false);
    feature.dispose();
  });
});
