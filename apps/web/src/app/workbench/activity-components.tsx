import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useState, type KeyboardEventHandler, type ReactElement, type ReactNode } from "react";
import type {
  WorkbenchActivityBadgeProvider,
  WorkbenchActivityBadgeSnapshot,
  WorkbenchActivityIcon,
} from "@tinyide/plugin-api";
import { resolveWorkbenchIcon, subscribeWorkbenchIcons } from "./icon-manager";
import type { ActivityBarSide, ActivityButtonDescriptor } from "../activity-layout";

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
  spacer = false,
  children,
  onMove,
  onDragStateChange,
}: {
  readonly itemKey: string;
  readonly side: ActivityBarSide;
  readonly draggingKey?: string;
  readonly spacer?: boolean;
  readonly children?: ReactNode;
  readonly onMove: (
    key: string,
    side: ActivityBarSide,
    targetKey?: string,
    placeAfter?: boolean,
  ) => void;
  readonly onDragStateChange: (key?: string) => void;
}) {
  return (
    <div
      className={`activity-fixed-slot${spacer ? " activity-spacer" : " activity-button-slot"}${draggingKey ? " is-drag-active" : ""}${draggingKey === itemKey ? " is-dragging" : ""}`}
      data-activity-key={itemKey}
      draggable={!spacer}
      onDragStart={spacer ? undefined : (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/x-tinyide-activity-button", itemKey);
        onDragStateChange(itemKey);
      }}
      onDragEnd={spacer ? undefined : () => onDragStateChange()}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/x-tinyide-activity-button")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const key = event.dataTransfer.getData("text/x-tinyide-activity-button");
        if (!key) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        onMove(key, side, itemKey, event.clientY >= bounds.top + bounds.height / 2);
        onDragStateChange();
      }}
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
  readonly onActivate: () => void;
  readonly onMove: (
    key: string,
    side: ActivityBarSide,
    targetKey?: string,
    placeAfter?: boolean,
  ) => void;
  readonly onDragStateChange: (key?: string) => void;
}) {
  const badge = useActivityBadge(item.activityBadge);
  const baseLabel = label ?? item.label;
  const accessibleLabel = badge ? `${baseLabel}: ${badge.label}` : baseLabel;
  return (
    <div
      className={`activity-button-slot${dragActive ? " is-drag-active" : ""}${dragging ? " is-dragging" : ""}`}
      data-activity-key={item.key}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/x-tinyide-activity-button", item.key);
        onDragStateChange(item.key);
      }}
      onDragEnd={() => onDragStateChange()}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/x-tinyide-activity-button")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const key = event.dataTransfer.getData("text/x-tinyide-activity-button");
        if (!key) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        onMove(key, side, item.key, event.clientY >= bounds.top + bounds.height / 2);
        onDragStateChange();
      }}
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
