import type {
  WorkbenchOutputFollowControl,
  WorkbenchOutputFollowOptions,
} from "@tinyide/plugin-api";

export function scrollOutputToEnd(element: Pick<HTMLElement, "scrollTop" | "scrollHeight"> | null | undefined): void {
  if (!element) return;
  element.scrollTop = element.scrollHeight;
}

export function createOutputFollowControl(
  options: WorkbenchOutputFollowOptions,
): WorkbenchOutputFollowControl {
  const label = document.createElement("label");
  label.className = ["workbench-output-follow", options.className].filter(Boolean).join(" ");

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = options.checked ?? true;
  input.setAttribute("aria-label", options.label ?? "Seguir saída");

  const text = document.createElement("span");
  text.textContent = options.label ?? "Seguir saída";
  label.append(input, text);

  let disposed = false;
  const follow = () => {
    if (!disposed && input.checked) options.follow();
  };
  const onChange = () => follow();
  input.addEventListener("change", onChange);

  return {
    element: label,
    input,
    get following() {
      return input.checked;
    },
    setFollowing(value) {
      input.checked = value;
      if (value) follow();
    },
    notify: follow,
    dispose() {
      if (disposed) return;
      disposed = true;
      input.removeEventListener("change", onChange);
      label.remove();
    },
  };
}
