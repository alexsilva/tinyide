import { FileWarning, Image as ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { OpenDocument } from "../../browser-filesystem";
import { readOpenDocumentBlob } from "../workbench-plugin-hosts";

export function NativeImageEditor({ document }: { readonly document: OpenDocument }) {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();
  const [dimensions, setDimensions] = useState<string>();

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    setSource(undefined);
    setError(undefined);
    setDimensions(undefined);
    void readOpenDocumentBlob(document)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch((cause) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document.id, document.handle, document.size, document.mediaType]);

  return (
    <section className="resource-editor resource-editor--image" data-resource-kind="image">
      <div className="resource-editor__viewport">
        {source ? (
          <img
            src={source}
            alt={document.name}
            onLoad={(event) => {
              const image = event.currentTarget;
              setDimensions(`${image.naturalWidth} × ${image.naturalHeight}`);
            }}
          />
        ) : error ? (
          <div className="resource-editor__message is-error"><FileWarning size={34} /><strong>Não foi possível exibir a imagem.</strong><p>{error}</p></div>
        ) : (
          <div className="resource-editor__message"><ImageIcon size={34} /><strong>Carregando imagem…</strong></div>
        )}
      </div>
      <footer className="resource-editor__meta">
        <span>{document.mediaType}</span>
        {dimensions ? <span>{dimensions}</span> : null}
        <span>{formatByteSize(document.size)}</span>
      </footer>
    </section>
  );
}

function formatByteSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

export function UnsupportedBinaryEditor({ document }: { readonly document: OpenDocument }) {
  return (
    <section className="resource-editor resource-editor--unsupported" data-resource-kind="binary">
      <div className="resource-editor__message">
        <FileWarning size={38} />
        <strong>Este arquivo não pode ser aberto no editor.</strong>
        <p>Nenhum plugin instalado oferece um visualizador para este formato binário.</p>
        <small>{document.mediaType} · {formatByteSize(document.size)}</small>
      </div>
    </section>
  );
}

