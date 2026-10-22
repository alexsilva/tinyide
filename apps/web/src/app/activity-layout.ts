export type ActivityBarSide = "left" | "right";

export interface ActivityButtonPlacement {
  readonly side: ActivityBarSide;
  readonly order: number;
}

export type ActivityButtonPlacements = Readonly<Record<string, ActivityButtonPlacement>>;

export interface ActivityButtonDescriptor {
  readonly key: string;
  readonly defaultOrder: number;
  readonly defaultSide?: ActivityBarSide;
  readonly movable?: boolean;
}

export function isActivityButtonPlacement(value: unknown): value is ActivityButtonPlacement {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActivityButtonPlacement>;
  return (candidate.side === "left" || candidate.side === "right")
    && Number.isFinite(candidate.order);
}

export function orderedActivityButtons<T extends ActivityButtonDescriptor>(
  items: readonly T[],
  placements: ActivityButtonPlacements,
  side: ActivityBarSide,
): readonly T[] {
  return items
    .filter((item) => (placements[item.key]?.side ?? item.defaultSide ?? "left") === side)
    .slice()
    .sort((left, right) => {
      const leftOrder = placements[left.key]?.order ?? left.defaultOrder;
      const rightOrder = placements[right.key]?.order ?? right.defaultOrder;
      return leftOrder - rightOrder || left.key.localeCompare(right.key);
    });
}

export interface ActivityPointerPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Onde um botão em arrasto seria solto. `key` ausente significa o fim da
 * barra indicada por `side`.
 */
export interface ActivityDropTarget {
  readonly side: ActivityBarSide;
  readonly key?: string;
  readonly placeAfter: boolean;
}

/**
 * Distância em pixels a partir da qual o gesto deixa de ser clique e vira
 * reordenação. Fica acima do tremor natural da mão e abaixo da altura de um
 * slot (36px), para que o arrasto comece antes de o ponteiro sair do botão.
 */
export const ACTIVITY_DRAG_START_DISTANCE = 6;

/**
 * A activity bar reordena por pointer events, nunca por arrasto nativo. Cada
 * clique num `draggable` que se mova 3px abre uma sessão de arrasto do sistema
 * (XDND no X11), e em 2026-10-22 uma dessas sessões terminou sem o Chromium
 * avisar a página: o renderer ficou acreditando que arrastava e descartou todo
 * clique e tecla até a janela ser fechada. Decidir o gesto aqui, pela
 * distância, mantém o clique como clique e tira o sistema do caminho.
 */
export function isActivityDragGesture(
  origin: ActivityPointerPosition | undefined,
  current: ActivityPointerPosition,
  threshold = ACTIVITY_DRAG_START_DISTANCE,
): boolean {
  if (!origin) return false;
  return Math.hypot(current.x - origin.x, current.y - origin.y) > threshold;
}

/** Metade de baixo do slot alvo insere depois dele; metade de cima, antes. */
export function activityDropPlacesAfter(
  bounds: { readonly top: number; readonly height: number },
  clientY: number,
): boolean {
  return clientY >= bounds.top + bounds.height / 2;
}

export function sameActivityDropTarget(
  left: ActivityDropTarget | undefined,
  right: ActivityDropTarget | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.side === right.side && left.key === right.key && left.placeAfter === right.placeAfter;
}

export function moveActivityButton(
  items: readonly ActivityButtonDescriptor[],
  placements: ActivityButtonPlacements,
  key: string,
  side: ActivityBarSide,
  targetKey?: string,
  placeAfter = false,
): ActivityButtonPlacements {
  const movingItem = items.find((item) => item.key === key);
  if (!movingItem?.movable) return placements;
  // Soltar o botão sobre ele mesmo é um gesto nulo — sem isto o alvo some da
  // lista de destino e o botão acaba jogado para o fim da barra.
  if (targetKey === key) return placements;

  const targetItems = orderedActivityButtons(items, placements, side)
    .filter((item) => item.key !== key);
  const targetIndex = targetKey
    ? targetItems.findIndex((item) => item.key === targetKey)
    : -1;
  const insertionIndex = targetIndex < 0
    ? targetItems.length
    : targetIndex + (placeAfter ? 1 : 0);
  const previous = targetItems[insertionIndex - 1];
  const next = targetItems[insertionIndex];
  const orderFor = (item: ActivityButtonDescriptor) => (
    placements[item.key]?.order ?? item.defaultOrder
  );
  const order = previous && next
    ? (orderFor(previous) + orderFor(next)) / 2
    : previous
      ? orderFor(previous) + 1_000
      : next
        ? orderFor(next) - 1_000
        : 0;

  return {
    ...placements,
    [key]: { side, order },
  };
}
