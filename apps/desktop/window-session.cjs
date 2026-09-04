const SCOPE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,95}$/;
// Espelha o contrato do renderer (apps/web/src/app/panel-window.ts): tipo fixo
// de superfície + id de contribuição. O valor chega por IPC, então é entrada
// não confiável até passar aqui.
const PANEL_WINDOW_PATTERN = /^(tool-window|panel|sidebar):[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const PANEL_VIEW_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/**
 * Monta a URL de uma janela do desktop.
 *
 * A identidade de estado da janela é o *workspace* que ela abre, carregado no
 * caminho da URL (`/w/<scopeId>/`). Uma janela sem projeto definido abre na
 * raiz e só ganha escopo quando um projeto é aberto — não existe mais um id de
 * sessão herdado, que era o que fazia janelas de hosts diferentes caírem no
 * mesmo escopo "default" e disputarem os mesmos arquivos de estado.
 */
function assertScopeId(scopeId) {
  const value = typeof scopeId === "string" ? scopeId.trim() : "";
  if (!SCOPE_ID_PATTERN.test(value)) throw new Error("Identificador de workspace inválido.");
  return value;
}

function assertPanelWindowReference(panelWindow) {
  const value = typeof panelWindow === "string" ? panelWindow.trim() : "";
  if (!PANEL_WINDOW_PATTERN.test(value)) throw new Error("Referência de painel inválida.");
  return value;
}

/**
 * View interna de uma tool window (ex.: "git.history" dentro de "git"). É
 * opcional por natureza: um valor fora do alfabeto de contribuições é
 * descartado — a superfície continua válida e apenas abre na aba padrão.
 */
function panelViewId(panelView) {
  const value = typeof panelView === "string" ? panelView.trim() : "";
  return PANEL_VIEW_PATTERN.test(value) ? value : undefined;
}

function desktopWindowUrl(runtimeUrl, { scopeId, projectPath, panelWindow, panelView } = {}) {
  const target = new URL(runtimeUrl);
  // A ausência de escopo é legítima (janela sem projeto); um escopo presente e
  // malformado não é — silenciá-lo abriria a janela na raiz, sem estado, sem
  // que ninguém percebesse.
  target.pathname = scopeId === undefined ? "/" : `/w/${assertScopeId(scopeId)}/`;
  const path = typeof projectPath === "string" ? projectPath.trim() : "";
  if (path) target.searchParams.set("tinyideOpenProject", `path:${path}`);
  else target.searchParams.delete("tinyideOpenProject");
  if (panelWindow !== undefined) {
    // Painel sem workspace não existe: a janela abriria numa superfície sem
    // projeto por trás, um estado que nenhum fluxo legítimo produz.
    if (scopeId === undefined) throw new Error("Uma janela de painel exige o escopo do workspace.");
    target.searchParams.set("tinyidePanelWindow", assertPanelWindowReference(panelWindow));
    const view = panelViewId(panelView);
    if (view) target.searchParams.set("tinyidePanelView", view);
    else target.searchParams.delete("tinyidePanelView");
  } else {
    target.searchParams.delete("tinyidePanelWindow");
    target.searchParams.delete("tinyidePanelView");
  }
  return target.href;
}

module.exports = {
  SCOPE_ID_PATTERN,
  PANEL_WINDOW_PATTERN,
  assertScopeId,
  assertPanelWindowReference,
  panelViewId,
  desktopWindowUrl,
};
