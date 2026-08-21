import type {
  TinyIdeModule,
  WorkbenchIconDefinition,
  WorkbenchIconPackDefinition,
  WorkbenchIconProvider,
  ResourceIconProvider,
  ResourceContext,
} from "@tinyide/plugin-api";

function defineIcon(
  id: string,
  label: string,
  order: number,
  svg: string,
  description?: string,
): WorkbenchIconDefinition {
  return { id, label, order, svg, ...(description ? { description } : {}) };
}

/** SVG de interface: stroke currentColor — herda a cor do botão/tema. */
const strokeSvg = (paths: string, viewBox = "0 0 24 24") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Pack padrão: 100% theme-aware. */
export const builtinIcons: readonly WorkbenchIconDefinition[] = [
  defineIcon("box", "Caixa", 10, strokeSvg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" x2="12" y1="22.08" y2="12"/>'), "Fallback genérico."),
  defineIcon("files", "Arquivos", 20, strokeSvg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/><path d="M13 13h-1"/>'), "Explorador e recursos de workspace."),
  defineIcon("history", "Histórico", 30, strokeSvg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>')),
  defineIcon("database", "Banco de dados", 40, strokeSvg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>')),
  defineIcon("plugins", "Plugins", 45, strokeSvg('<path d="M12 22v-5"/><path d="M15 8V2"/><path d="M9 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/>')),
  defineIcon("play", "Executar", 46, strokeSvg('<polygon points="6 3 20 12 6 21 6 3"/>')),
  defineIcon("problems", "Problemas", 47, strokeSvg('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>')),
  defineIcon("terminal", "Terminal", 50, strokeSvg('<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>'), "Sessões interativas de shell."),
  defineIcon("git", "Git", 60, strokeSvg('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>')),
  defineIcon("source-control", "Controle de versão", 61, strokeSvg('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>'), "Alias de git para sidebars de SCM."),
  defineIcon("docker", "Docker", 70, strokeSvg('<path d="M22 12.5c0 1.2-.5 2-1.5 2.5-1.5.8-4.5 1-7.5 1s-6-.2-7.5-1C4.5 14.5 4 13.7 4 12.5"/><rect x="5" y="8" width="2.5" height="2.5" rx=".3"/><rect x="8.5" y="8" width="2.5" height="2.5" rx=".3"/><rect x="12" y="8" width="2.5" height="2.5" rx=".3"/><rect x="8.5" y="4.5" width="2.5" height="2.5" rx=".3"/><rect x="12" y="4.5" width="2.5" height="2.5" rx=".3"/><rect x="15.5" y="8" width="2.5" height="2.5" rx=".3"/>')),
  defineIcon("nodejs", "Node.js", 80, strokeSvg('<path d="M12 2 21 7v10l-9 5-9-5V7l9-5Z"/><path d="M8 16V8l8 8V8"/>')),
  defineIcon("python", "Python", 90, strokeSvg('<path d="M12 2c-3.2 0-3.5 1.4-3.5 1.4v2.1h4v.5H6.2S3 6.4 3 11.2s2.3 4.5 2.3 4.5h1.5v-2.2s-.1-2.6 2.5-2.6h4.3s2.4 0 2.4-2.4V4.5S15.2 2 12 2Z"/><path d="M12 22c3.2 0 3.5-1.4 3.5-1.4v-2.1h-4v-.5h6.3S21 17.6 21 12.8s-2.3-4.5-2.3-4.5h-1.5v2.2s.1 2.6-2.5 2.6h-4.3s-2.4 0-2.4 2.4v3.9S8.8 22 12 22Z"/>')),
defineIcon("search", "Buscar", 15, strokeSvg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')),
  defineIcon("folder", "Pasta", 16, strokeSvg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.81-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>')),
  defineIcon("folder-open", "Pasta aberta", 17, strokeSvg('<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>')),
  defineIcon("file", "Arquivo", 18, strokeSvg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>')),
  defineIcon("settings", "Configurações", 19, strokeSvg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>')),
  defineIcon("pause", "Pausar", 48, strokeSvg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>')),
  defineIcon("stop", "Parar", 49, strokeSvg('<rect x="5" y="5" width="14" height="14" rx="2"/>')),
  defineIcon("refresh", "Atualizar", 52, strokeSvg('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>')),
  defineIcon("rerun", "Reexecutar", 53, strokeSvg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="m10 9 5 3-5 3z"/>')),
  defineIcon("undo", "Desfazer", 54, strokeSvg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>')),
  defineIcon("plus", "Adicionar", 55, strokeSvg('<path d="M5 12h14"/><path d="M12 5v14"/>')),
  defineIcon("save", "Salvar", 56, strokeSvg('<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>')),
  defineIcon("close", "Fechar", 57, strokeSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>')),
  defineIcon("copy", "Copiar", 58, strokeSvg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>')),
  defineIcon("diff", "Diff", 59, strokeSvg('<path d="M12 3v18"/><path d="m6 9 6-6 6 6"/><path d="m6 15 6 6 6-6"/>')),
  defineIcon("back", "Voltar", 62, strokeSvg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>')),
  defineIcon("forward", "Avançar", 63, strokeSvg('<path d="m12 5 7 7-7 7"/><path d="M5 12h14"/>')),
  defineIcon("preview", "Pré-visualizar", 64, strokeSvg('<path d="M2.06 12.32a1 1 0 0 1 0-.64A10.7 10.7 0 0 1 12 5c3.9 0 7.4 1.9 9.94 6.68a1 1 0 0 1 0 .64A10.7 10.7 0 0 1 12 19c-3.9 0-7.4-1.9-9.94-6.68Z"/><circle cx="12" cy="12" r="3"/>')),
  defineIcon("package", "Pacote", 65, strokeSvg('<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>')),
  defineIcon("check", "Confirmar", 66, strokeSvg('<path d="M20 6 9 17l-5-5"/>')),
];

export const brandIcons: readonly WorkbenchIconDefinition[] = builtinIcons.map((icon) => {
  if (icon.id === "terminal") {
    return defineIcon("terminal", icon.label, icon.order ?? 50, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#1a1f28"/><rect x="3" y="4.5" width="18" height="15" rx="2" fill="#252b36" stroke="#5a6578" stroke-width="1"/><circle cx="5.5" cy="7" r=".8" fill="#ef6a6a"/><circle cx="8" cy="7" r=".8" fill="#e5b95c"/><circle cx="10.5" cy="7" r=".8" fill="#67c587"/><path fill="none" stroke="#72e39a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="m6 11 2.5 2-2.5 2M11 15h5"/></svg>`);
  }
  if (icon.id === "git" || icon.id === "source-control") {
    return defineIcon(icon.id, icon.label, icon.order ?? 60, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#f05032" d="M12 1.55 22.45 12 12 22.45 1.55 12 12 1.55Z"/><path fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m7.8 7.8 8.4 8.4M11.05 11.05l3.15-3.15"/><circle cx="7.8" cy="7.8" r="1.7" fill="#fff"/><circle cx="16.2" cy="7.8" r="1.7" fill="#fff"/><circle cx="16.2" cy="16.2" r="1.7" fill="#fff"/></svg>`);
  }
  if (icon.id === "docker") {
    return defineIcon("docker", icon.label, icon.order ?? 70, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><g fill="#2496ed"><rect x="3" y="8" width="3.2" height="2.8" rx=".35"/><rect x="6.7" y="8" width="3.2" height="2.8" rx=".35"/><rect x="10.4" y="8" width="3.2" height="2.8" rx=".35"/><rect x="6.7" y="4.7" width="3.2" height="2.8" rx=".35"/><rect x="10.4" y="4.7" width="3.2" height="2.8" rx=".35"/><rect x="10.4" y="1.4" width="3.2" height="2.8" rx=".35"/><rect x="14.1" y="8" width="3.2" height="2.8" rx=".35"/><path d="M22.55 9.8c-.85-.55-1.95-.7-2.93-.42-.12-1.02-.7-1.9-1.58-2.45l-.58-.36-.36.58c-.45.72-.58 1.57-.39 2.38H2.05c-.42 0-.76.34-.76.76 0 4.72 3.62 8.57 8.27 8.57 4.27 0 7.64-2.02 9.54-5.7 1.3.08 2.5-.43 3.28-1.44l.45-.58-.28-1.34Z"/></g></svg>`);
  }
  if (icon.id === "nodejs") {
    return defineIcon("nodejs", icon.label, icon.order ?? 80, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#5fa04e" d="M12 1.35 21.25 6.7v10.6L12 22.65 2.75 17.3V6.7L12 1.35Z"/><path fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.05" d="M7.2 16.5v-9l9.6 9v-9"/><circle cx="7.2" cy="7.5" r="1.15" fill="#fff"/><circle cx="16.8" cy="16.5" r="1.15" fill="#fff"/></svg>`);
  }
  if (icon.id === "python") {
    return defineIcon("python", icon.label, icon.order ?? 90, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#3776ab" d="M11.75 2C6.8 2 7.1 4.15 7.1 4.15v2.23h4.74v.67H5.22S2 6.68 2 11.74s2.82 4.88 2.82 4.88h1.69v-2.37s-.09-2.82 2.77-2.82h4.7s2.64.04 2.64-2.55V4.6S17.02 2 11.75 2Z"/><circle cx="9.12" cy="4.72" r=".78" fill="#fff"/><path fill="#ffd43b" d="M12.25 22c4.95 0 4.65-2.15 4.65-2.15v-2.23h-4.74v-.67h6.62S22 17.32 22 12.26s-2.82-4.88-2.82-4.88h-1.69v2.37s.09 2.82-2.77 2.82h-4.7s-2.64-.04-2.64 2.55v4.28S6.98 22 12.25 22Z"/><circle cx="14.88" cy="19.28" r=".78" fill="#fff"/></svg>`);
  }
  return icon;
});

const funSvg = (body: string, viewBox = "0 0 24 24") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true">${body}</svg>`;

export const funIcons: readonly WorkbenchIconDefinition[] = [
  defineIcon(
    "box",
    "Caixa",
    10,
    funSvg(
      '<defs><linearGradient id="fun-box" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><path fill="url(#fun-box)" d="M12 2.2 21 7.2v9.6L12 21.8 3 16.8V7.2L12 2.2Z"/><path fill="#fff" fill-opacity=".35" d="M12 2.2 21 7.2 12 12.2 3 7.2Z"/><path fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" d="M12 12.2v9.6M3 7.2l9 5 9-5"/>',
    ),
  ),
  defineIcon(
    "files",
    "Arquivos",
    20,
    funSvg(
      '<rect x="4" y="5" width="11" height="14" rx="2" fill="#38bdf8"/><rect x="8" y="3" width="11" height="14" rx="2" fill="#818cf8"/><path fill="#c4b5fd" d="M15 3h4l3 3v11a2 2 0 0 1-2 2h-5Z"/><path stroke="#fff" stroke-width="1.3" stroke-linecap="round" d="M11 10h5M11 13h4"/>',
    ),
  ),
  defineIcon(
    "history",
    "Histórico",
    30,
    funSvg(
      '<circle cx="12" cy="12" r="9" fill="#f472b6"/><circle cx="12" cy="12" r="6.2" fill="#fdf2f8"/><path fill="none" stroke="#db2777" stroke-width="1.8" stroke-linecap="round" d="M12 8.2v4.1l2.8 1.7"/><path fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M5.2 7.5 3.5 5.8M3.5 5.8H6.2"/>',
    ),
  ),
  defineIcon(
    "database",
    "Banco de dados",
    40,
    funSvg(
      '<ellipse cx="12" cy="6" rx="8" ry="3.2" fill="#34d399"/><path fill="#10b981" d="M4 6v5c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V6"/><path fill="#059669" d="M4 11v5c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-5"/><ellipse cx="12" cy="11" rx="8" ry="3.2" fill="#6ee7b7" fill-opacity=".55"/><ellipse cx="12" cy="16" rx="8" ry="3.2" fill="#a7f3d0" fill-opacity=".4"/>',
    ),
  ),
  defineIcon(
    "plugins",
    "Plugins",
    45,
    funSvg(
      '<rect x="7" y="9" width="10" height="8" rx="2.5" fill="#fbbf24"/><path fill="#f59e0b" d="M9 9V5.5a1.5 1.5 0 0 1 3 0V9M12 9V5.5a1.5 1.5 0 0 1 3 0V9"/><path fill="#fde68a" d="M10.5 17v3a1.5 1.5 0 0 0 3 0v-3"/><circle cx="12" cy="13" r="1.4" fill="#fff"/>',
    ),
  ),
  defineIcon(
    "play",
    "Executar",
    46,
    funSvg(
      '<circle cx="12" cy="12" r="10" fill="#4ade80"/><path fill="#fff" d="M10 8.2 16.5 12 10 15.8Z"/>',
    ),
  ),
  defineIcon(
    "problems",
    "Problemas",
    47,
    funSvg(
      '<path fill="#fb923c" d="M12 3 22 20H2L12 3Z"/><circle cx="12" cy="16.2" r="1.2" fill="#fff"/><path stroke="#fff" stroke-width="2" stroke-linecap="round" d="M12 9.2v4"/>',
    ),
  ),
  defineIcon(
    "terminal",
    "Terminal",
    50,
    funSvg(
      '<rect width="22" height="18" x="1" y="3" rx="3" fill="#1e1b4b"/><rect x="3" y="5.5" width="18" height="13" rx="1.5" fill="#312e81"/><circle cx="5.5" cy="7.3" r=".7" fill="#f87171"/><circle cx="7.8" cy="7.3" r=".7" fill="#fbbf24"/><circle cx="10.1" cy="7.3" r=".7" fill="#4ade80"/><path fill="none" stroke="#a5b4fc" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m5.5 11.5 2.8 2-2.8 2M11 15.5h5"/>',
    ),
  ),
  defineIcon(
    "git",
    "Git",
    60,
    funSvg(
      '<path fill="#fb7185" d="M12 2 22 12 12 22 2 12 12 2Z"/><circle cx="8" cy="8" r="2" fill="#fff"/><circle cx="16" cy="8" r="2" fill="#fff"/><circle cx="16" cy="16" r="2" fill="#fff"/><path fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" d="m8 8 8 8M9.5 9.5 14 8"/>',
    ),
  ),
  defineIcon(
    "source-control",
    "Controle de versão",
    61,
    funSvg(
      '<path fill="#fb7185" d="M12 2 22 12 12 22 2 12 12 2Z"/><circle cx="8" cy="8" r="2" fill="#fff"/><circle cx="16" cy="8" r="2" fill="#fff"/><circle cx="16" cy="16" r="2" fill="#fff"/><path fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" d="m8 8 8 8M9.5 9.5 14 8"/>',
    ),
  ),
  defineIcon(
    "docker",
    "Docker",
    70,
    funSvg(
      '<path fill="#38bdf8" d="M3 14.5c0 2.5 4 4 9 4s9-1.5 9-4c1.2.1 2.3-.4 3-1.3.4-.6.3-1.5-.2-2-.8-.7-2-.8-3-.4C20.4 9.2 19 8 17.2 8l-.6.4c-.5.8-.6 1.7-.4 2.6H3.2c-.5 0-.9.4-.9.9 0 .4.1.8.3 1.1"/><rect x="5" y="10" width="2.4" height="2.2" rx=".35" fill="#0ea5e9"/><rect x="8" y="10" width="2.4" height="2.2" rx=".35" fill="#0ea5e9"/><rect x="11" y="10" width="2.4" height="2.2" rx=".35" fill="#0ea5e9"/><rect x="8" y="7.2" width="2.4" height="2.2" rx=".35" fill="#7dd3fc"/><rect x="11" y="7.2" width="2.4" height="2.2" rx=".35" fill="#7dd3fc"/><rect x="11" y="4.4" width="2.4" height="2.2" rx=".35" fill="#bae6fd"/><rect x="14" y="10" width="2.4" height="2.2" rx=".35" fill="#0ea5e9"/>',
    ),
  ),
  defineIcon(
    "nodejs",
    "Node.js",
    80,
    funSvg(
      '<path fill="#86efac" d="M12 2 21 7v10l-9 5-9-5V7l9-5Z"/><path fill="#22c55e" d="M12 5.2 17.8 8.5v7L12 18.8 6.2 15.5v-7L12 5.2Z"/><path fill="none" stroke="#14532d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M8.5 15.2V8.8l7 6.4V8.8"/>',
    ),
  ),
  defineIcon(
    "python",
    "Python",
    90,
    funSvg(
      '<path fill="#60a5fa" d="M12 3c-3 0-3.2 1.3-3.2 1.3v2h3.6v.5H6.8S4 7.2 4 11.2s2 4 2 4h1.4v-2s0-2.3 2.3-2.3h3.8s2.2 0 2.2-2.1V5.4S15 3 12 3Z"/><circle cx="9.6" cy="5.4" r=".7" fill="#fff"/><path fill="#fde047" d="M12 21c3 0 3.2-1.3 3.2-1.3v-2h-3.6v-.5h5.6S20 16.8 20 12.8s-2-4-2-4h-1.4v2s0 2.3-2.3 2.3h-3.8s-2.2 0-2.2 2.1v3.8S9 21 12 21Z"/><circle cx="14.4" cy="18.6" r=".7" fill="#fff"/>',
    ),
  ),,
  defineIcon("search", "Buscar", 15, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="#3b82f6"/><path stroke="#1e40af" stroke-width="2" stroke-linecap="round" d="m20 20-3.2-3.2"/><circle cx="11" cy="11" r="3" fill="#93c5fd"/></svg>`),
  defineIcon("folder", "Pasta", 16, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#f59e0b" d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.81-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path fill="#fbbf24" d="M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z"/></svg>`),
  defineIcon("folder-open", "Pasta aberta", 17, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#d97706" d="M4 5h4l2 2h10v2H4z"/><path fill="#f59e0b" d="m6 14 1.5-3h12.5l-1.5 6H5a1 1 0 0 1-1-1v-1z"/></svg>`),
  defineIcon("file", "Arquivo", 18, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#64748b" d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path fill="#94a3b8" d="M14 3v4h4"/></svg>`),
  defineIcon("settings", "Configurações", 19, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="#e2e8f0"/><path fill="#64748b" d="M19.4 13a7.7 7.7 0 0 0 .1-2l2-1.2-2-3.4-2.3.6a7.5 7.5 0 0 0-1.7-1L15 4h-4l-.5 2a7.5 7.5 0 0 0-1.7 1L6.5 6.4l-2 3.4 2 1.2a7.7 7.7 0 0 0 0 2l-2 1.2 2 3.4 2.3-.6a7.5 7.5 0 0 0 1.7 1l.5 2h4l.5-2a7.5 7.5 0 0 0 1.7-1l2.3.6 2-3.4-2-1.2Z"/></svg>`),
  defineIcon("pause", "Pausar", 48, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#eab308"/><rect x="7" y="7" width="3.5" height="10" rx="1" fill="#fff"/><rect x="13.5" y="7" width="3.5" height="10" rx="1" fill="#fff"/></svg>`),
  defineIcon("stop", "Parar", 49, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ef4444"/><rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="#fff"/></svg>`),
  defineIcon("refresh", "Atualizar", 52, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#0ea5e9"/><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" d="M8 10a5 5 0 1 1 1 6"/><path fill="#fff" d="m7 7 1.5 4H5z"/></svg>`),
  defineIcon("rerun", "Reexecutar", 53, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path fill="#fff" d="M10 8.5 15.5 12 10 15.5z"/></svg>`),
  defineIcon("undo", "Desfazer", 54, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#8b5cf6"/><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" d="M9 10h6a3 3 0 0 1 0 6h-2"/><path fill="#fff" d="m9 7-3 3 3 3z"/></svg>`),
  defineIcon("plus", "Adicionar", 55, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path stroke="#fff" stroke-width="2.2" stroke-linecap="round" d="M12 7v10M7 12h10"/></svg>`),
  defineIcon("save", "Salvar", 56, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#3b82f6" d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path fill="#93c5fd" d="M8 3h7v5H8z"/><path fill="#dbeafe" d="M8 14h8v6H8z"/></svg>`),
  defineIcon("close", "Fechar", 57, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#64748b"/><path stroke="#fff" stroke-width="2.2" stroke-linecap="round" d="m8 8 8 8M16 8l-8 8"/></svg>`),
  defineIcon("copy", "Copiar", 58, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="#6366f1"/><rect x="4" y="4" width="12" height="12" rx="2" fill="#a5b4fc"/></svg>`),
  defineIcon("diff", "Diff", 59, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#1e293b"/><path stroke="#4ade80" stroke-width="2" d="M7 8h10"/><path stroke="#f87171" stroke-width="2" d="M7 16h10"/></svg>`),
  defineIcon("back", "Voltar", 62, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#475569"/><path fill="#fff" d="m13.5 7-5 5 5 5V7z"/></svg>`),
  defineIcon("forward", "Avançar", 63, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#475569"/><path fill="#fff" d="m10.5 7 5 5-5 5V7z"/></svg>`),
  defineIcon("preview", "Pré-visualizar", 64, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="7" fill="#0ea5e9"/><circle cx="12" cy="12" r="3.5" fill="#e0f2fe"/><circle cx="12" cy="12" r="1.5" fill="#0369a1"/></svg>`),
  defineIcon("package", "Pacote", 65, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#a78bfa" d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9L12 2.5Z"/><path fill="#c4b5fd" d="M12 2.5 21 7.5 12 12.5 3 7.5Z"/></svg>`),
  defineIcon("check", "Confirmar", 66, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m7.5 12.5 3 3 6-6"/></svg>`),

];

export const defaultIconPack: WorkbenchIconPackDefinition = {
  id: "tinyide.default",
  label: "Padrão",
  description: "Ícones em traço que herdam a cor do tema e do botão ativo.",
  order: 10,
  icons: builtinIcons,
};

export const brandIconPack: WorkbenchIconPackDefinition = {
  id: "tinyide.brand",
  label: "Marcas",
  description: "Cores oficiais de Git, Docker, Node e Python (demais ícones iguais ao padrão).",
  order: 20,
  icons: brandIcons.filter(Boolean),
};

export const funIconPack: WorkbenchIconPackDefinition = {
  id: "tinyide.fun",
  label: "Divertido",
  description: "Ícones coloridos e lúdicos — visual alegre, independente do tema.",
  order: 30,
  icons: funIcons.filter(Boolean),
};

export const builtinIconPacks: readonly WorkbenchIconPackDefinition[] = [
  defaultIconPack,
  brandIconPack,
  funIconPack,
];

export const builtinIconProvider: WorkbenchIconProvider = {
  id: "tinyide.builtin.icons",
  priority: 0,
  packs: () => builtinIconPacks,
};


/** Badges de tipo de arquivo — plugins podem registrar ResourceIconProvider com prioridade visual própria. */
const RESOURCE_BADGE_BY_EXT: Readonly<Record<string, { label: string; foreground: string; background: string }>> = {
  ".md": { label: "M", foreground: "#e2e8f0", background: "#475569" },
  ".mdx": { label: "M", foreground: "#e2e8f0", background: "#475569" },
  ".js": { label: "JS", foreground: "#0f172a", background: "#f7df1e" },
  ".mjs": { label: "JS", foreground: "#0f172a", background: "#f7df1e" },
  ".cjs": { label: "JS", foreground: "#0f172a", background: "#f7df1e" },
  ".jsx": { label: "JX", foreground: "#0f172a", background: "#61dafb" },
  ".ts": { label: "TS", foreground: "#fff", background: "#3178c6" },
  ".tsx": { label: "TX", foreground: "#fff", background: "#3178c6" },
  ".py": { label: "PY", foreground: "#fff", background: "#3776ab" },
  ".json": { label: "{}", foreground: "#fbbf24", background: "#1e293b" },
  ".css": { label: "#", foreground: "#fff", background: "#264de4" },
  ".scss": { label: "S", foreground: "#fff", background: "#c6538c" },
  ".html": { label: "<>", foreground: "#fff", background: "#e34f26" },
  ".svg": { label: "SVG", foreground: "#0f172a", background: "#ffb13b" },
  ".yml": { label: "Y", foreground: "#fff", background: "#cb171e" },
  ".yaml": { label: "Y", foreground: "#fff", background: "#cb171e" },
  ".toml": { label: "T", foreground: "#fff", background: "#9c4121" },
  ".sql": { label: "SQL", foreground: "#fff", background: "#336791" },
  ".sh": { label: "$", foreground: "#22c55e", background: "#14532d" },
  ".rs": { label: "RS", foreground: "#fff", background: "#dea584" },
  ".go": { label: "GO", foreground: "#fff", background: "#00add8" },
  ".java": { label: "JV", foreground: "#fff", background: "#b07219" },
  ".kt": { label: "KT", foreground: "#fff", background: "#a97bff" },
  ".rb": { label: "RB", foreground: "#fff", background: "#cc342d" },
  ".php": { label: "PHP", foreground: "#fff", background: "#777bb4" },
  ".vue": { label: "V", foreground: "#fff", background: "#42b883" },
  ".svelte": { label: "SV", foreground: "#fff", background: "#ff3e00" },
};

export const builtinResourceIconProvider: ResourceIconProvider = {
  id: "tinyide.builtin.resource-icons",
  provideIcon(resource: ResourceContext) {
    if (resource.kind !== "file") return undefined;
    const lower = resource.name.toLowerCase();
    for (const [ext, badge] of Object.entries(RESOURCE_BADGE_BY_EXT)) {
      if (lower.endsWith(ext)) {
        return {
          id: `file${ext}`,
          label: badge.label,
          foreground: badge.foreground,
          background: badge.background,
          title: resource.name,
        };
      }
    }
    return undefined;
  },
};

export const iconModule: TinyIdeModule = {
  id: "icons",
  version: "0.1.0",
  init(context) {
    context.subscriptions.push(context.extensions.registerWorkbenchIconProvider(builtinIconProvider));
    context.subscriptions.push(context.extensions.registerResourceIconProvider(builtinResourceIconProvider));
  },
};
