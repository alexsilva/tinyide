/**
 * Identidade de "janela de painel".
 *
 * Uma janela de painel é uma janela auxiliar do mesmo workspace que apresenta
 * uma única superfície de plugin — tool window, painel ou sidebar — como janela
 * real do sistema. A identidade viaja na URL (`?tinyidePanelWindow=<kind>:<id>`),
 * como o escopo do workspace viaja no caminho: um reload reabre a mesma
 * superfície sem depender de estado externo.
 *
 * A apresentação é decisão do host: plugins continuam montando no container que
 * recebem e não sabem se ele vive num dock, num modal ou numa janela do SO.
 */

export const PANEL_WINDOW_QUERY = "tinyidePanelWindow";
export const PANEL_WINDOW_VIEW_QUERY = "tinyidePanelView";

export type PanelWindowKind = "tool-window" | "panel" | "sidebar";

export interface PanelWindowReference {
  readonly kind: PanelWindowKind;
  readonly id: string;
}

/** Pedido de reanexar entregue pelo host à janela que abriu o painel. */
export interface PanelWindowReattachRequest {
  readonly reference: PanelWindowReference;
  readonly viewId?: string;
}

const PANEL_WINDOW_KINDS: readonly PanelWindowKind[] = ["tool-window", "panel", "sidebar"];

/** Ids de contribuição são identificadores simples ("terminal", "git.changes"). */
const PANEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function isPanelWindowKind(value: string): value is PanelWindowKind {
  return (PANEL_WINDOW_KINDS as readonly string[]).includes(value);
}

export function parsePanelWindowReference(
  raw: string | null | undefined,
): PanelWindowReference | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const separator = value.indexOf(":");
  if (separator <= 0) return undefined;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!isPanelWindowKind(kind) || !PANEL_ID_PATTERN.test(id)) return undefined;
  return { kind, id };
}

export function serializePanelWindowReference(reference: PanelWindowReference): string {
  return `${reference.kind}:${reference.id}`;
}

function panelViewId(raw: unknown): string | undefined {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value && PANEL_ID_PATTERN.test(value) ? value : undefined;
}

/**
 * Pedido vindo do host (processo main), não da própria URL. É mensagem entre
 * janelas e merece a mesma desconfiança: uma superfície irreconhecível é
 * descartada em vez de abrir um dock que ninguém pediu.
 */
export function parsePanelWindowReattachRequest(payload: unknown): PanelWindowReattachRequest | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const { panelWindow, panelView } = payload as { panelWindow?: unknown; panelView?: unknown };
  const reference = parsePanelWindowReference(typeof panelWindow === "string" ? panelWindow : undefined);
  if (!reference) return undefined;
  const viewId = panelViewId(panelView);
  return viewId ? { reference, viewId } : { reference };
}

function currentSearchParams(): URLSearchParams | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const href = window.location?.href;
    return href ? new URL(href).searchParams : undefined;
  } catch {
    return undefined;
  }
}

/** Superfície que esta janela apresenta, quando ela é uma janela de painel. */
export function activePanelWindowReference(): PanelWindowReference | undefined {
  return parsePanelWindowReference(currentSearchParams()?.get(PANEL_WINDOW_QUERY));
}

/** View interna solicitada na abertura (ex.: "git.history" dentro da tool window "git"). */
export function activePanelWindowViewId(): string | undefined {
  return panelViewId(currentSearchParams()?.get(PANEL_WINDOW_VIEW_QUERY));
}

/**
 * `true` quando esta janela apresenta uma única superfície. Janelas de painel
 * não são donas do estado persistido do workspace: layout, snapshot e ponteiro
 * de host pertencem às janelas completas — sem este gate, a janela auxiliar
 * gravaria por cima um layout degenerado (sem editor, sem sidebars).
 */
export function isPanelWindow(): boolean {
  return activePanelWindowReference() !== undefined;
}

export function panelWindowDocumentTitle(label: string, workspaceName: string): string {
  return workspaceName && workspaceName !== "Sem workspace" ? `${label} — ${workspaceName}` : label;
}
