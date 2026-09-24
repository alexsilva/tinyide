export const EDITOR_HISTORY_LIMIT = 500;
/**
 * Teto de memória do histórico de um documento. Cada passo guarda o texto inteiro, então o teto
 * também define quantos desfazimentos sobrevivem: num arquivo de 300 KB (600 KB por passo, em
 * UTF-16) são algumas dezenas. Com o valor anterior, de 8 MB, um arquivo desse tamanho perdia o
 * desfazer depois de dez teclas — barato em memória e caro no uso.
 */
export const EDITOR_HISTORY_BYTE_LIMIT = 32 * 1024 * 1024;

export interface EditorHistorySnapshot {
  readonly content: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export interface EditorHistory {
  readonly entries: readonly EditorHistorySnapshot[];
  readonly index: number;
}

export interface EditorHistoryNavigation {
  readonly history: EditorHistory;
  readonly snapshot?: EditorHistorySnapshot;
}

function normalizeSnapshot(snapshot: EditorHistorySnapshot): EditorHistorySnapshot {
  const selectionStart = Math.min(Math.max(0, snapshot.selectionStart), snapshot.content.length);
  const selectionEnd = Math.min(
    Math.max(selectionStart, snapshot.selectionEnd),
    snapshot.content.length,
  );
  return {
    content: snapshot.content,
    selectionStart,
    selectionEnd,
  };
}

function snapshotsEqual(left: EditorHistorySnapshot, right: EditorHistorySnapshot): boolean {
  return left.content === right.content
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd;
}

export function createEditorHistory(snapshot: EditorHistorySnapshot): EditorHistory {
  return {
    entries: [normalizeSnapshot(snapshot)],
    index: 0,
  };
}

export function recordEditorHistory(
  history: EditorHistory,
  snapshot: EditorHistorySnapshot,
  limit = EDITOR_HISTORY_LIMIT,
  byteLimit = EDITOR_HISTORY_BYTE_LIMIT,
): EditorHistory {
  const normalized = normalizeSnapshot(snapshot);
  const current = history.entries[history.index];
  if (current && snapshotsEqual(current, normalized)) return history;

  const forwardHistoryRemoved = history.entries.slice(0, history.index + 1);
  const entries = [...forwardHistoryRemoved, normalized];
  const entryLimit = Math.max(1, limit);
  const memoryLimit = Math.max(1, byteLimit);
  let retainedStart = Math.max(0, entries.length - entryLimit);
  let retainedBytes = 0;
  // Strings em JS são UTF-16 na representação comum. O orçamento é uma aproximação
  // deliberadamente conservadora, que impede um único arquivo grande de manter centenas
  // de cópias inteiras para sempre.
  for (let index = entries.length - 1; index >= retainedStart; index -= 1) {
    const entry = entries[index];
    if (!entry) continue;
    const entryBytes = entry.content.length * 2;
    if (index < entries.length - 1 && retainedBytes + entryBytes > memoryLimit) {
      retainedStart = index + 1;
      break;
    }
    retainedBytes += entryBytes;
  }
  const retainedEntries = entries.slice(retainedStart);
  return {
    entries: retainedEntries,
    index: retainedEntries.length - 1,
  };
}

export function undoEditorHistory(history: EditorHistory): EditorHistoryNavigation {
  if (history.index <= 0) return { history };
  const nextHistory = { ...history, index: history.index - 1 };
  const snapshot = nextHistory.entries[nextHistory.index];
  if (!snapshot) return { history };
  return {
    history: nextHistory,
    snapshot,
  };
}

export function redoEditorHistory(history: EditorHistory): EditorHistoryNavigation {
  if (history.index >= history.entries.length - 1) return { history };
  const nextHistory = { ...history, index: history.index + 1 };
  const snapshot = nextHistory.entries[nextHistory.index];
  if (!snapshot) return { history };
  return {
    history: nextHistory,
    snapshot,
  };
}
