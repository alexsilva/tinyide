const SCOPE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,95}$/;

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

function desktopWindowUrl(runtimeUrl, { scopeId, projectPath } = {}) {
  const target = new URL(runtimeUrl);
  // A ausência de escopo é legítima (janela sem projeto); um escopo presente e
  // malformado não é — silenciá-lo abriria a janela na raiz, sem estado, sem
  // que ninguém percebesse.
  target.pathname = scopeId === undefined ? "/" : `/w/${assertScopeId(scopeId)}/`;
  const path = typeof projectPath === "string" ? projectPath.trim() : "";
  if (path) target.searchParams.set("tinyideOpenProject", `path:${path}`);
  else target.searchParams.delete("tinyideOpenProject");
  return target.href;
}

module.exports = {
  SCOPE_ID_PATTERN,
  assertScopeId,
  desktopWindowUrl,
};
