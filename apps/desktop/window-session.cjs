const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

/**
 * A janela principal do desktop precisa de identidade de sessão própria e
 * estável. Sem o parâmetro na URL ela cai no id "default" — exatamente o mesmo
 * que qualquer aba de navegador apontando para o servidor de desenvolvimento
 * usa. Como os dois hosts compartilham o diretório de estado do usuário
 * (`~/.config/tinyide/state`), o ponteiro de último workspace de um sobrescreve
 * o do outro e um reload passa a reabrir o projeto do host vizinho.
 *
 * O valor é literal, e não um UUID persistido, porque precisa sobreviver a
 * reinícios do app sem depender de leitura de estado antes de criar a janela.
 */
const DESKTOP_MAIN_SESSION_ID = "desktop";

function assertSessionId(sessionId) {
  const value = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!SESSION_ID_PATTERN.test(value)) throw new Error("Identificador de sessão inválido.");
  return value;
}

/**
 * Monta a URL de uma janela do desktop carregando a identidade da sessão e,
 * opcionalmente, o projeto a abrir. Toda janela criada pelo app passa por aqui:
 * é o único ponto que garante que nenhuma delas herde o id "default".
 */
function desktopWindowUrl(runtimeUrl, { sessionId, projectPath } = {}) {
  const target = new URL(runtimeUrl);
  target.searchParams.set("tinyideSession", assertSessionId(sessionId));
  const path = typeof projectPath === "string" ? projectPath.trim() : "";
  if (path) target.searchParams.set("tinyideOpenProject", `path:${path}`);
  else target.searchParams.delete("tinyideOpenProject");
  return target.href;
}

module.exports = {
  DESKTOP_MAIN_SESSION_ID,
  SESSION_ID_PATTERN,
  assertSessionId,
  desktopWindowUrl,
};
