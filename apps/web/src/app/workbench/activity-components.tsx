import * as Tooltip from "@radix-ui/react-tooltip";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  WorkbenchActivityBadgeProvider,
  WorkbenchActivityBadgeSnapshot,
  WorkbenchActivityIcon,
} from "@tinyide/plugin-api";
import { resolveWorkbenchIcon, subscribeWorkbenchIcons } from "./icon-manager";
import {
  activityDropPlacesAfter,
  isActivityDragGesture,
  sameActivityDropTarget,
} from "../activity-layout";
import type {
  ActivityBarSide,
  ActivityButtonDescriptor,
  ActivityDropTarget,
  ActivityPointerPosition,
} from "../activity-layout";

export type ActivityMoveHandler = (
  key: string,
  side: ActivityBarSide,
  targetKey?: string,
  placeAfter?: boolean,
) => void;

/** Sem argumentos: o arrasto acabou. Com `key`: `key` está sendo arrastado sobre `target`. */
export type ActivityDragStateHandler = (key?: string, target?: ActivityDropTarget) => void;

interface ActivityReorderGesture {
  readonly pointerId: number;
  readonly origin: ActivityPointerPosition;
  readonly slot: HTMLElement;
  dragging: boolean;
  cancelled: boolean;
  /** Último destino comunicado; `null` enquanto nenhum foi comunicado. */
  target: ActivityDropTarget | undefined | null;
}

function capturePointer(slot: HTMLElement, pointerId: number) {
  try {
    slot.setPointerCapture(pointerId);
  } catch {
    // O ponteiro já se foi (ou o ambiente não captura): o gesto segue pelos
    // eventos que ainda chegarem ao slot.
  }
}

function releasePointer(slot: HTMLElement, pointerId: number) {
  try {
    if (slot.hasPointerCapture(pointerId)) slot.releasePointerCapture(pointerId);
  } catch {
    // Já liberado.
  }
}

/**
 * Slot ou barra sob o ponteiro, lidos dos atributos que as próprias barras
 * anotam no DOM. Com o ponteiro capturado o `:hover` não acompanha o alvo,
 * então o destino é calculado aqui e devolvido como estado.
 */
function activityDropTargetAt(position: ActivityPointerPosition): ActivityDropTarget | undefined {
  const element = document.elementFromPoint(position.x, position.y);
  if (!element) return undefined;
  const slot = element.closest<HTMLElement>("[data-activity-key][data-activity-side]");
  if (slot) {
    const side = slot.dataset.activitySide;
    if (side !== "left" && side !== "right") return undefined;
    const key = slot.dataset.activityKey;
    return {
      side,
      ...(key ? { key } : {}),
      placeAfter: activityDropPlacesAfter(slot.getBoundingClientRect(), position.y),
    };
  }
  const side = element.closest<HTMLElement>("[data-activity-bar]")?.dataset.activityBar;
  return side === "left" || side === "right" ? { side, placeAfter: true } : undefined;
}

/**
 * Reordenação da activity bar por pointer events, sem `draggable`.
 *
 * Um `draggable` transforma qualquer clique com 3px de movimento numa sessão
 * de arrasto do sistema operacional. Em 2026-10-22 uma dessas sessões, aberta
 * por um clique num botão de painel, terminou sem o Chromium avisar o
 * renderer; a página passou a descartar cliques e teclas até ser fechada,
 * porque o Blink ignora toda entrada enquanto acredita estar arrastando. Aqui
 * o gesto nunca sai da página: o clique continua clique, o arrasto só começa
 * depois do limiar, o ponteiro fica capturado pelo slot e o destino é lido
 * do DOM a cada movimento.
 *
 * A captura é mantida até o `pointerup` mesmo quando Esc cancela o gesto:
 * assim o `click` sintetizado no fim nasce no slot, nunca no botão, e um
 * arrasto cancelado não abre painel por engano.
 */
function useActivityReorder({
  itemKey,
  enabled,
  dragging,
  onMove,
  onDragStateChange,
}: {
  readonly itemKey: string;
  readonly enabled: boolean;
  readonly dragging: boolean;
  readonly onMove: ActivityMoveHandler;
  readonly onDragStateChange: ActivityDragStateHandler;
}) {
  const gestureRef = useRef<ActivityReorderGesture | undefined>(undefined);
  const cancelRef = useRef(() => {});

  const finish = (gesture: ActivityReorderGesture, apply: boolean) => {
    gestureRef.current = undefined;
    releasePointer(gesture.slot, gesture.pointerId);
    if (!gesture.dragging) return;
    gesture.dragging = false;
    if (apply && gesture.target) {
      onMove(itemKey, gesture.target.side, gesture.target.key, gesture.target.placeAfter);
    }
    onDragStateChange();
  };

  cancelRef.current = () => {
    const gesture = gestureRef.current;
    if (!gesture?.dragging) return;
    gesture.dragging = false;
    gesture.cancelled = true;
    onDragStateChange();
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dragging]);

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (!enabled || event.button !== 0 || !event.isPrimary) return;
      gestureRef.current = {
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        slot: event.currentTarget,
        dragging: false,
        cancelled: false,
        target: null,
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
      const position = { x: event.clientX, y: event.clientY };
      if (!gesture.dragging) {
        if (!isActivityDragGesture(gesture.origin, position)) return;
        gesture.dragging = true;
        capturePointer(gesture.slot, gesture.pointerId);
      }
      const target = activityDropTargetAt(position);
      if (gesture.target !== null && sameActivityDropTarget(target, gesture.target)) return;
      gesture.target = target;
      onDragStateChange(itemKey, target);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.dragging) gesture.target = activityDropTargetAt({ x: event.clientX, y: event.clientY });
      finish(gesture, true);
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      const gesture = gestureRef.current;
      if (gesture && gesture.pointerId === event.pointerId) finish(gesture, false);
    },
    onLostPointerCapture() {
      // Perder a captura por qualquer motivo (janela perdeu foco, elemento
      // saiu do DOM) é o fim do gesto, sem aplicar nada.
      const gesture = gestureRef.current;
      if (gesture?.dragging) finish(gesture, false);
    },
  };
}

function dropIndicatorClass(itemKey: string, dropTarget: ActivityDropTarget | undefined): string {
  if (dropTarget?.key !== itemKey) return "";
  return dropTarget.placeAfter ? " is-drop-after" : " is-drop-before";
}

export function IconButton({
  label,
  children,
  onClick,
  onKeyDown,
  active = false,
  disabled = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  readonly active?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className={`icon-button${active ? " is-active" : ""}`}
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="right" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function PluginCardIcon({
  name,
  src,
  fallback,
}: {
  readonly name: string;
  readonly src: string | undefined;
  readonly fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="plugin-card-icon" title={name}>
      {src && !failed
        ? <img src={src} alt="" aria-hidden="true" onError={() => setFailed(true)} />
        : fallback}
    </span>
  );
}

export interface PluginActivityButton extends ActivityButtonDescriptor {
  readonly id: string;
  readonly kind: "sidebar" | "toolWindow";
  readonly label: string;
  readonly icon?: WorkbenchActivityIcon;
  readonly activityBadge?: WorkbenchActivityBadgeProvider;
}

function useActivityBadge(provider: WorkbenchActivityBadgeProvider | undefined): WorkbenchActivityBadgeSnapshot | undefined {
  const [snapshot, setSnapshot] = useState<WorkbenchActivityBadgeSnapshot | undefined>(() => provider?.snapshot());

  useEffect(() => {
    if (!provider) {
      setSnapshot(undefined);
      return undefined;
    }
    setSnapshot(provider.snapshot());
    const subscription = provider.subscribe(setSnapshot);
    return () => subscription.dispose();
  }, [provider]);

  return snapshot;
}

export function FixedActivitySlot({
  itemKey,
  side,
  draggingKey,
  dropTarget,
  spacer = false,
  children,
  onMove,
  onDragStateChange,
}: {
  readonly itemKey: string;
  readonly side: ActivityBarSide;
  readonly draggingKey?: string;
  readonly dropTarget?: ActivityDropTarget;
  readonly spacer?: boolean;
  readonly children?: ReactNode;
  readonly onMove: ActivityMoveHandler;
  readonly onDragStateChange: ActivityDragStateHandler;
}) {
  const dragging = draggingKey === itemKey;
  const reorder = useActivityReorder({ itemKey, enabled: !spacer, dragging, onMove, onDragStateChange });
  return (
    <div
      className={`activity-fixed-slot${spacer ? " activity-spacer" : " activity-button-slot"}${draggingKey ? " is-drag-active" : ""}${dragging ? " is-dragging" : ""}${dropIndicatorClass(itemKey, dropTarget)}`}
      data-activity-key={itemKey}
      data-activity-side={side}
      {...reorder}
      onKeyDown={spacer ? undefined : (event) => {
        if (!event.altKey) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onMove(itemKey, event.key === "ArrowLeft" ? "left" : "right");
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const sibling = event.key === "ArrowUp"
            ? event.currentTarget.previousElementSibling
            : event.currentTarget.nextElementSibling;
          const targetKey = sibling instanceof HTMLElement ? sibling.dataset.activityKey : undefined;
          if (targetKey) onMove(itemKey, side, targetKey, event.key === "ArrowDown");
        }
      }}
    >
      {children}
    </div>
  );
}

export function MovableActivityButton({
  item,
  side,
  active,
  disabled = false,
  label,
  dragging,
  dragActive,
  dropTarget,
  onActivate,
  onMove,
  onDragStateChange,
}: {
  readonly item: PluginActivityButton;
  readonly side: ActivityBarSide;
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly dragging: boolean;
  readonly dragActive: boolean;
  readonly dropTarget?: ActivityDropTarget;
  readonly onActivate: () => void;
  readonly onMove: ActivityMoveHandler;
  readonly onDragStateChange: ActivityDragStateHandler;
}) {
  const badge = useActivityBadge(item.activityBadge);
  const reorder = useActivityReorder({ itemKey: item.key, enabled: true, dragging, onMove, onDragStateChange });
  const baseLabel = label ?? item.label;
  const accessibleLabel = badge ? `${baseLabel}: ${badge.label}` : baseLabel;
  return (
    <div
      className={`activity-button-slot${dragActive ? " is-drag-active" : ""}${dragging ? " is-dragging" : ""}${dropIndicatorClass(item.key, dropTarget)}`}
      data-activity-key={item.key}
      data-activity-side={side}
      {...reorder}
    >
      <IconButton
        label={accessibleLabel}
        active={active}
        disabled={disabled}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (disabled) return;
          if (!event.altKey) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onMove(item.key, event.key === "ArrowLeft" ? "left" : "right");
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const slot = event.currentTarget.closest<HTMLElement>(".activity-button-slot");
            const sibling = event.key === "ArrowUp"
              ? slot?.previousElementSibling
              : slot?.nextElementSibling;
            const targetKey = sibling instanceof HTMLElement ? sibling.dataset.activityKey : undefined;
            if (targetKey) onMove(item.key, side, targetKey, event.key === "ArrowDown");
          }
        }}
      >
        <WorkbenchActivityIconView icon={item.icon} />
        {badge ? (
          <span
            className={`activity-notification-badge is-${badge.tone ?? "neutral"}`}
            aria-hidden="true"
          >{badge.value}</span>
        ) : null}
      </IconButton>
    </div>
  );
}

export function ButtonTooltip({
  label,
  children,
  side = "bottom",
}: {
  readonly label: string;
  readonly children: ReactElement;
  readonly side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side={side} sideOffset={6}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function WorkbenchActivityIconView({
  icon,
  size,
  className,
}: {
  readonly icon: WorkbenchActivityIcon | undefined;
  readonly size?: number;
  readonly className?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeWorkbenchIcons(() => setTick((value) => value + 1)), []);
  const definition = resolveWorkbenchIcon(icon);
  const style = size ? { width: size, height: size } : undefined;
  if (!definition) {
    return <span className={`workbench-icon is-missing${className ? ` ${className}` : ""}`} style={style} aria-hidden="true" />;
  }
  return (
    <span
      className={`workbench-icon${className ? ` ${className}` : ""}`}
      data-workbench-icon={definition.id}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: definition.svg }}
    />
  );
}

/** Alias semântico para uso geral na UI (não só activity bar). */
export const WorkbenchIcon = WorkbenchActivityIconView;
