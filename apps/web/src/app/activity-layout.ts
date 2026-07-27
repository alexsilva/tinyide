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
