import { useState } from "react";
import type { DebugVariable } from "@tinyide/plugin-api";

function formattedDebugValue(value: string, type?: string): { text: string; kind: string } {
  const normalizedType = type?.toLocaleLowerCase() ?? "";
  const trimmed = value.trim();
  const kind = normalizedType.includes("bool") || /^(true|false)$/i.test(trimmed)
    ? "boolean"
    : normalizedType.includes("int") || normalizedType.includes("float") || normalizedType.includes("number") || /^-?\d+(?:\.\d+)?$/.test(trimmed)
      ? "number"
      : normalizedType.includes("none") || normalizedType.includes("null") || /^(none|null|undefined)$/i.test(trimmed)
        ? "null"
        : normalizedType.includes("str") || normalizedType.includes("string")
          ? "string"
          : "object";
  if (trimmed.length < 80 || !/^[\[{]/.test(trimmed)) return { text: value, kind };
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), kind };
  } catch {
    return { text: value, kind };
  }
}

export function DebugVariableNode({ variable, depth = 0 }: { variable: DebugVariable; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const formatted = formattedDebugValue(variable.value, variable.type);
  const children = variable.children;
  const hasChildren = Boolean(children && children.length);
  return (
    <div className="debug-variable">
      <div className="debug-variable__row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="debug-variable__toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="debug-variable__toggle debug-variable__toggle--spacer" aria-hidden="true" />
        )}
        <span className="debug-variable__name">{variable.name}</span>
        {variable.type ? <small className="debug-variable__type">{variable.type}</small> : null}
        <span className={`debug-variable__value is-${formatted.kind}`}>{formatted.text}</span>
      </div>
      {hasChildren && expanded ? (
        <div className="debug-variable__children">
          {children!.map((child, index) => (
            <DebugVariableNode key={`${child.name}-${index}`} variable={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

