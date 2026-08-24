import type { BrowserFileHandle, OpenDocument } from "../browser-filesystem";
import { inspectBrowserFile, readFileDocument } from "../browser-filesystem";

export interface ExternalFileOpenCandidate {
  readonly file: File;
  readonly handle?: BrowserFileHandle;
  /** Caminho absoluto no host desktop, quando disponível. */
  readonly absolutePath?: string;
}

interface DataTransferItemWithHandle extends DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

function isFileSystemFileHandle(handle: FileSystemHandle): handle is FileSystemFileHandle {
  return handle.kind === "file";
}

/**
 * Extrai candidatos de arquivo de um DataTransfer de arrastar/soltar do SO.
 * Prefere FileSystemFileHandle (navegador) e caminho absoluto (desktop Electron).
 */
export async function collectExternalFileCandidates(
  dataTransfer: DataTransfer,
  getAbsolutePath?: (file: File) => string | undefined,
): Promise<readonly ExternalFileOpenCandidate[]> {
  const candidates: ExternalFileOpenCandidate[] = [];
  const seen = new Set<string>();

  const items = Array.from(dataTransfer.items ?? []);
  if (items.length) {
    for (const item of items) {
      if (item.kind !== "file") continue;
      const withHandle = item as DataTransferItemWithHandle;
      let handle: BrowserFileHandle | undefined;
      let file: File | null = item.getAsFile();

      if (typeof withHandle.getAsFileSystemHandle === "function") {
        try {
          const systemHandle = await withHandle.getAsFileSystemHandle();
          if (systemHandle && isFileSystemFileHandle(systemHandle)) {
            handle = systemHandle as unknown as BrowserFileHandle;
            file = await systemHandle.getFile();
          }
        } catch {
          // Fallback para File puro quando o handle não está disponível.
        }
      }

      if (!file) continue;
      const absolutePath = getAbsolutePath?.(file)?.trim() || undefined;
      const key = absolutePath ?? `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        file,
        ...(handle ? { handle } : {}),
        ...(absolutePath ? { absolutePath } : {}),
      });
    }
  }

  if (!candidates.length) {
    for (const file of Array.from(dataTransfer.files ?? [])) {
      const absolutePath = getAbsolutePath?.(file)?.trim() || undefined;
      const key = absolutePath ?? `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        file,
        ...(absolutePath ? { absolutePath } : {}),
      });
    }
  }

  return candidates;
}

export function dataTransferHasExternalFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length) return true;
  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
}

/**
 * Monta um OpenDocument a partir de um arquivo externo (fora do workspace).
 * Com handle, permite salvar de volta; com caminho absoluto (desktop), plugins
 * de execução podem localizar o arquivo no disco.
 */
export async function openDocumentFromExternalFile(
  candidate: ExternalFileOpenCandidate,
): Promise<OpenDocument> {
  if (candidate.handle) {
    return readFileDocument(
      candidate.handle,
      candidate.absolutePath,
      undefined,
    );
  }

  const inspection = await inspectBrowserFile(candidate.file);
  const content = inspection.kind === "text" ? await candidate.file.text() : "";
  const id = candidate.absolutePath ?? `external:${candidate.file.name}:${candidate.file.size}:${candidate.file.lastModified}`;

  return {
    id,
    name: candidate.file.name,
    ...(candidate.absolutePath ? { path: candidate.absolutePath } : {}),
    kind: inspection.kind,
    mediaType: inspection.mediaType,
    size: inspection.size,
    content,
    savedContent: content,
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
  };
}
