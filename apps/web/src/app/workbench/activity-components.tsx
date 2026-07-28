import * as Tooltip from "@radix-ui/react-tooltip";
import { Box, Files, History, Terminal } from "lucide-react";
import { useState, type KeyboardEventHandler, type ReactElement, type ReactNode } from "react";
import type { WorkbenchActivityIcon } from "@tinyide/plugin-api";
import type { ActivityBarSide, ActivityButtonDescriptor } from "../activity-layout";

export function IconButton({
  label,
  children,
  onClick,
  onKeyDown,
  active = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  readonly active?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className={`icon-button${active ? " is-active" : ""}`}
          type="button"
          aria-label={label}
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
  dragging,
  dragActive,
  onActivate,
  onMove,
  onDragStateChange,
}: {
  readonly item: PluginActivityButton;
  readonly side: ActivityBarSide;
  readonly active: boolean;
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
        label={item.label}
        active={active}
        onClick={onActivate}
        onKeyDown={(event) => {
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

function GitBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="git" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f05032" d="M12 1.55 22.45 12 12 22.45 1.55 12 12 1.55Z" />
      <path fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m7.8 7.8 8.4 8.4M11.05 11.05l3.15-3.15" />
      <circle cx="7.8" cy="7.8" r="1.7" fill="#fff" />
      <circle cx="16.2" cy="7.8" r="1.7" fill="#fff" />
      <circle cx="16.2" cy="16.2" r="1.7" fill="#fff" />
    </svg>
  );
}

function DockerBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="docker" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#2496ed">
        <rect x="3" y="8" width="3.2" height="2.8" rx=".35" />
        <rect x="6.7" y="8" width="3.2" height="2.8" rx=".35" />
        <rect x="10.4" y="8" width="3.2" height="2.8" rx=".35" />
        <rect x="6.7" y="4.7" width="3.2" height="2.8" rx=".35" />
        <rect x="10.4" y="4.7" width="3.2" height="2.8" rx=".35" />
        <rect x="10.4" y="1.4" width="3.2" height="2.8" rx=".35" />
        <rect x="14.1" y="8" width="3.2" height="2.8" rx=".35" />
        <path d="M22.55 9.8c-.85-.55-1.95-.7-2.93-.42-.12-1.02-.7-1.9-1.58-2.45l-.58-.36-.36.58c-.45.72-.58 1.57-.39 2.38H2.05c-.42 0-.76.34-.76.76 0 4.72 3.62 8.57 8.27 8.57 4.27 0 7.64-2.02 9.54-5.7 1.3.08 2.5-.43 3.28-1.44l.45-.58-.28-1.34Z" />
      </g>
      <circle cx="5.25" cy="13.05" r=".62" fill="#fff" />
    </svg>
  );
}

function NodeBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="nodejs" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#5fa04e" d="M12 1.35 21.25 6.7v10.6L12 22.65 2.75 17.3V6.7L12 1.35Z" />
      <path fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.05" d="M7.2 16.5v-9l9.6 9v-9" />
      <circle cx="7.2" cy="7.5" r="1.15" fill="#fff" />
      <circle cx="16.8" cy="16.5" r="1.15" fill="#fff" />
    </svg>
  );
}

function PythonBrandIcon() {
  return (
    <svg className="workbench-brand-icon" data-workbench-icon="python" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#3776ab" d="M11.75 2C6.8 2 7.1 4.15 7.1 4.15v2.23h4.74v.67H5.22S2 6.68 2 11.74s2.82 4.88 2.82 4.88h1.69v-2.37s-.09-2.82 2.77-2.82h4.7s2.64.04 2.64-2.55V4.6S17.02 2 11.75 2Z" />
      <circle cx="9.12" cy="4.72" r=".78" fill="#fff" />
      <path fill="#ffd43b" d="M12.25 22c4.95 0 4.65-2.15 4.65-2.15v-2.23h-4.74v-.67h6.62S22 17.32 22 12.26s-2.82-4.88-2.82-4.88h-1.69v2.37s.09 2.82-2.77 2.82h-4.7s-2.64-.04-2.64 2.55v4.28S6.98 22 12.25 22Z" />
      <circle cx="14.88" cy="19.28" r=".78" fill="#fff" />
    </svg>
  );
}

export function WorkbenchActivityIconView({ icon }: { readonly icon: WorkbenchActivityIcon | undefined }) {
  if (icon === "docker") return <DockerBrandIcon />;
  if (icon === "git" || icon === "source-control") return <GitBrandIcon />;
  if (icon === "nodejs") return <NodeBrandIcon />;
  if (icon === "python") return <PythonBrandIcon />;
  if (icon === "files") return <Files size={20} />;
  if (icon === "history") return <History size={20} />;
  if (icon === "terminal") return <Terminal size={20} />;
  return <Box size={20} />;
}

