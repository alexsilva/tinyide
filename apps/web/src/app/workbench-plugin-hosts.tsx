import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  WorkbenchExecutionViewProvider,
  WorkbenchExecutionViewTarget,
  WorkbenchPanelContribution,
  WorkbenchResourceEditorProvider,
  WorkbenchSidebarContribution,
  WorkbenchStateApi,
  WorkbenchStatusbarContribution,
  WorkbenchTabApi,
  WorkbenchTitlebarContribution,
  WorkbenchToolWindowContribution,
} from "@tinyide/plugin-api";
import type { OpenDocument } from "../browser-filesystem";
import { createWorkbenchTabApi } from "./workbench-tabs";
import { workbenchResourceDescriptor } from "./runtime";

export interface WorkbenchToolWindowViewRequest {
  readonly toolWindowId: string;
  readonly viewId: string;
  readonly sequence: number;
}

interface Disposable {
  dispose(): void;
}

function mountResult(
  result: void | Disposable | Promise<void | Disposable>,
  container: HTMLElement,
  isDisposed: () => boolean,
  setDisposable: (value: void | Disposable) => void,
): void {
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    void Promise.resolve(result)
      .then((disposable) => {
        if (isDisposed()) disposable?.dispose();
        else setDisposable(disposable);
      })
      .catch((cause) => {
        if (!isDisposed()) container.textContent = cause instanceof Error ? cause.message : String(cause);
      });
    return;
  }
  setDisposable(result as void | Disposable);
}

export function WorkbenchSidebarHost({
  provider,
  state,
  onClose,
}: {
  readonly provider: WorkbenchSidebarContribution;
  readonly state: WorkbenchStateApi;
  readonly onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: void | Disposable;
    try {
      mountResult(
        provider.mount({ container, state, close }),
        container,
        () => disposed,
        (value) => { mountedDisposable = value; },
      );
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state, close]);

  return <div className="plugin-sidebar-host" ref={containerRef} data-sidebar-id={provider.id} />;
}

export function WorkbenchPanelHost({
  provider,
  state,
}: {
  readonly provider: WorkbenchPanelContribution;
  readonly state: WorkbenchStateApi;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: void | Disposable;
    try {
      mountResult(
        provider.mount({ container, state }),
        container,
        () => disposed,
        (value) => { mountedDisposable = value; },
      );
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state]);

  return <div className="plugin-panel-host" ref={containerRef} data-panel-id={provider.id} />;
}

export function ExecutionViewHost({
  provider,
  target,
  state,
}: {
  readonly provider: WorkbenchExecutionViewProvider;
  readonly target: WorkbenchExecutionViewTarget;
  readonly state: WorkbenchStateApi;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: void | Disposable;
    try {
      mountResult(
        provider.mount({ container, state, target: targetRef.current }),
        container,
        () => disposed,
        (value) => { mountedDisposable = value; },
      );
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state, target.profileId, target.mode]);

  return (
    <div
      className="execution-panel-plugin-view"
      ref={containerRef}
      data-execution-view-provider={provider.id}
    />
  );
}

export function WorkbenchToolWindowHost({
  provider,
  state,
  visible,
  height,
  viewRequest,
  onClose,
  onResize,
  onResetHeight,
}: {
  readonly provider: WorkbenchToolWindowContribution;
  readonly state: WorkbenchStateApi;
  readonly visible: boolean;
  readonly height: number;
  readonly viewRequest?: WorkbenchToolWindowViewRequest;
  readonly onClose: () => void;
  readonly onResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onResetHeight: () => void;
}) {
  const headerContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<(WorkbenchTabApi & Disposable) | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    const headerContainer = headerContainerRef.current;
    const container = containerRef.current;
    if (!headerContainer || !container) return;
    let disposed = false;
    let mountedDisposable: void | Disposable;
    const tabs = createWorkbenchTabApi(headerContainer);
    tabsRef.current = tabs;
    try {
      mountResult(
        provider.mount({ headerContainer, container, state, tabs, close }),
        container,
        () => disposed,
        (value) => { mountedDisposable = value; },
      );
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }

    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      tabs.dispose();
      if (tabsRef.current === tabs) tabsRef.current = null;
      headerContainer.replaceChildren();
      container.replaceChildren();
    };
  }, [provider, state, close]);

  useEffect(() => {
    if (!viewRequest || viewRequest.toolWindowId !== provider.id) return;
    tabsRef.current?.select(viewRequest.viewId);
  }, [provider.id, viewRequest]);

  return (
    <section
      className={`tool-window-panel${visible ? "" : " tool-window-panel--hidden"}`}
      style={{ height }}
      data-tool-window-id={provider.id}
    >
      <div
        className="resize-handle resize-handle--panel"
        role="separator"
        aria-label={`Redimensionar ${provider.label}`}
        onPointerDown={onResize}
        onDoubleClick={onResetHeight}
      />
      <div className="panel-heading tool-window-heading">
        <div className="tool-window-header-content" ref={headerContainerRef} />
        <button
          className="icon-button small"
          type="button"
          aria-label={`Ocultar painel ${provider.label}`}
          title="Ocultar painel"
          onClick={close}
        ><X size={14} /></button>
      </div>
      <div className="plugin-panel-host" ref={containerRef} data-panel-id={provider.id} />
    </section>
  );
}

export function WorkbenchTitlebarHost({
  provider,
  state,
}: {
  readonly provider: WorkbenchTitlebarContribution;
  readonly state: WorkbenchStateApi;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: void | Disposable;
    try {
      mountResult(
        provider.mount({ container, state }),
        container,
        () => disposed,
        (value) => { mountedDisposable = value; },
      );
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state]);

  return <div className="titlebar-plugin-actions" data-titlebar-contribution={provider.id} ref={containerRef} />;
}

export function WorkbenchStatusbarHost({
  provider,
  state,
}: {
  readonly provider: WorkbenchStatusbarContribution;
  readonly state: WorkbenchStateApi;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mountedDisposable: void | Disposable;
    try {
      mountResult(
        provider.mount({ container, state }),
        container,
        () => disposed,
        (value) => { mountedDisposable = value; },
      );
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, state]);

  return <div className="statusbar-plugin-item" data-statusbar-contribution={provider.id} ref={containerRef} />;
}

export async function readOpenDocumentBlob(document: OpenDocument): Promise<Blob> {
  if (document.handle) return document.handle.getFile();
  if (document.kind === "text") {
    return new Blob([document.content], { type: document.mediaType || "text/plain;charset=utf-8" });
  }
  throw new Error("O conteúdo binário não está mais disponível. Reabra o arquivo pelo workspace.");
}

export function ResourceEditorHost({
  provider,
  document,
  topLine,
  onRevealLine,
}: {
  readonly provider: WorkbenchResourceEditorProvider;
  readonly document: OpenDocument;
  readonly topLine?: number;
  readonly onRevealLine?: (line: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  const topLineRef = useRef(topLine);
  const revealLineRef = useRef(onRevealLine);
  revealLineRef.current = onRevealLine;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    let disposed = false;
    let mountedDisposable: void | Disposable;
    try {
      mountResult(
        provider.mount({
          container,
          resource: workbenchResourceDescriptor(document),
          read: () => readOpenDocumentBlob(documentRef.current),
          signal: controller.signal,
          topLine: topLineRef.current,
          revealLine: (line: number) => revealLineRef.current?.(line),
        }),
        container,
        () => disposed,
        (value) => { mountedDisposable = value; },
      );
    } catch (cause) {
      container.textContent = cause instanceof Error ? cause.message : String(cause);
    }
    return () => {
      disposed = true;
      controller.abort();
      mountedDisposable?.dispose();
      container.replaceChildren();
    };
  }, [provider, document.id]);

  return (
    <div
      className="resource-editor resource-editor--plugin"
      ref={containerRef}
      data-resource-editor-provider={provider.id}
    />
  );
}
