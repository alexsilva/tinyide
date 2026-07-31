import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import {
  requestTextContextMenu,
  selectedTextAtTarget,
} from "./app/text-context-menu";
import "./app.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Application root was not found.");

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const target = event.target instanceof Element ? event.target : undefined;
  if (target?.closest(".code-editor")) return;
  const text = selectedTextAtTarget(event.target, document.getSelection());
  if (!text) return;
  event.stopPropagation();
  requestTextContextMenu({ text, x: event.clientX, y: event.clientY });
}, { capture: true });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
