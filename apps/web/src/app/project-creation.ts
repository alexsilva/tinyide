const INVALID_PROJECT_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/;
const WINDOWS_RESERVED_PROJECT_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/**
 * Mantém o nome portável entre os hosts suportados. A pasta é sempre filha do
 * local escolhido, então separadores e segmentos relativos nunca são aceitos.
 */
export function normalizedProjectName(value: string): string {
  return value.trim();
}

export function projectNameError(value: string): string | undefined {
  const name = normalizedProjectName(value);
  if (!name) return "Informe o nome do projeto.";
  if (name.length > 120) return "Use no máximo 120 caracteres.";
  if (name === "." || name === "..") return "Escolha um nome de pasta válido.";
  if (INVALID_PROJECT_NAME_CHARACTERS.test(name)) return "O nome contém caracteres que não podem ser usados em uma pasta.";
  if (/[. ]$/.test(name)) return "O nome não pode terminar com ponto ou espaço.";
  if (WINDOWS_RESERVED_PROJECT_NAMES.test(name)) return "Esse nome é reservado pelo sistema operacional.";
  return undefined;
}
