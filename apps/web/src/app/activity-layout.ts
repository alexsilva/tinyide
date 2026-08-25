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

/** Folga em pixels para distinguir um clique trêmulo de um arrasto real. */
export const ACTIVITY_DRAG_CLICK_TOLERANCE = 8;

/**
 * Chromium cancela o evento `click` assim que um gesto sobre um elemento
 * `draggable` ultrapassa o limiar nativo de arrasto (3px). Nos botões da
 * activity bar isso faz o clique "sumir": o drop cai no próprio slot, a
 * reordenação é nula e o painel não abre — o usuário precisa clicar de novo.
 * Um arrasto que termina praticamente onde começou é, na intenção do usuário,
 * um clique.
 */
export function isActivityDragClick(
  origin: ActivityPointerPosition | undefined,
  end: ActivityPointerPosition,
  tolerance = ACTIVITY_DRAG_CLICK_TOLERANCE,
): boolean {
  if (!origin) return false;
  // Alguns ambientes reportam (0, 0) no `dragend` quando o drop acontece fora
  // da janela; nesse caso a distância grande já descarta o gesto.
  return Math.hypot(end.x - origin.x, end.y - origin.y) <= tolerance;
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
