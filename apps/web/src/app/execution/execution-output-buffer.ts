export const MAX_EXECUTION_OUTPUT_CHARS = 256 * 1024;
export const EXECUTION_OUTPUT_TRUNCATED_MARKER = "[saída anterior descartada para limitar memória]";

function outputLength(chunks: readonly string[]): number {
  if (!chunks.length) return 0;
  return chunks.reduce((total, chunk) => total + chunk.length, 0) + chunks.length - 1;
}

function trimFirstChunkAtLineBoundary(value: string, removeChars: number): string {
  const sliced = value.slice(Math.min(removeChars, value.length));
  const nextLine = sliced.indexOf("\n");
  return nextLine >= 0 ? sliced.slice(nextLine + 1) : sliced;
}

function trimOutputChunksToBudget(chunks: string[], maxChars: number): void {
  let length = outputLength(chunks);
  let firstIndex = 0;
  while (firstIndex < chunks.length && length > maxChars) {
    const first = chunks[firstIndex]!;
    const overflow = length - maxChars;
    const remainingChunks = chunks.length - firstIndex;
    const separator = remainingChunks > 1 ? 1 : 0;
    if (first.length + separator <= overflow) {
      length -= first.length + separator;
      firstIndex += 1;
      continue;
    }
    const trimmed = trimFirstChunkAtLineBoundary(first, overflow);
    length -= first.length - trimmed.length;
    chunks[firstIndex] = trimmed;
    if (!trimmed) {
      if (remainingChunks > 1) length -= 1;
      firstIndex += 1;
    }
  }
  if (firstIndex > 0) {
    chunks.splice(0, firstIndex);
  }
}

export function appendExecutionOutput(
  current: readonly string[],
  additions: readonly string[],
  options: {
    readonly truncated?: boolean;
    readonly maxChars?: number;
  } = {},
): readonly string[] {
  const maxChars = Math.max(1024, options.maxChars ?? MAX_EXECUTION_OUTPUT_CHARS);
  const chunks = [
    ...current.filter(Boolean),
    ...(options.truncated ? [EXECUTION_OUTPUT_TRUNCATED_MARKER] : []),
    ...additions.filter(Boolean),
  ];
  if (outputLength(chunks) <= maxChars) return chunks;

  // Reserva espaço para o aviso antes de descartar a parte antiga. Assim um único
  // snapshot muito grande (caso do debugger) preserva a cauda mais recente em vez
  // de ser removido inteiro depois que o marcador é inserido.
  const retained = chunks.filter((chunk) => chunk !== EXECUTION_OUTPUT_TRUNCATED_MARKER);
  const retainedBudget = Math.max(0, maxChars - EXECUTION_OUTPUT_TRUNCATED_MARKER.length - 1);
  trimOutputChunksToBudget(retained, retainedBudget);
  return retained.length
    ? [EXECUTION_OUTPUT_TRUNCATED_MARKER, ...retained]
    : [EXECUTION_OUTPUT_TRUNCATED_MARKER];
}

export function executionOutputText(output: readonly string[]): string {
  return output.join("\n");
}
