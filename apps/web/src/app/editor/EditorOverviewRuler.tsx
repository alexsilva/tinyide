import { memo, useState } from "react";
import type { TextEditorLineDecoration, TextEditorLineDecorationKind } from "@tinyide/plugin-api";

/** Trecho contíguo do arquivo com o mesmo tipo de decoração: um alvo na faixa de visão geral. */
export interface EditorOverviewMark {
  readonly kind: TextEditorLineDecorationKind;
  /** Primeira e última linha do arquivo (base 1) cobertas pela marca. */
  readonly startLine: number;
  readonly endLine: number;
  readonly label?: string;
}

/**
 * Funde decorações de linhas consecutivas e do mesmo kind numa única marca. Os providers publicam
 * uma decoração por linha; na faixa, um bloco de 40 linhas alteradas precisa ser um alvo só, e não
 * 40 botões sobrepostos. Remoções não se fundem: cada uma marca um ponto entre duas linhas.
 */
export function editorOverviewMarks(decorations: readonly TextEditorLineDecoration[]): EditorOverviewMark[] {
  const sorted = decorations
    .filter((decoration) => Number.isInteger(decoration.line) && decoration.line >= 1)
    .sort((left, right) => left.line - right.line);
  const openByKind = new Map<TextEditorLineDecorationKind, { endLine: number }>();
  const marks: EditorOverviewMark[] = [];
  for (const decoration of sorted) {
    const open = openByKind.get(decoration.kind);
    const contiguous = decoration.kind === "deleted"
      ? open?.endLine === decoration.line
      : open !== undefined && decoration.line <= open.endLine + 1;
    if (open && contiguous) {
      open.endLine = Math.max(open.endLine, decoration.line);
      continue;
    }
    const label = decoration.tooltip ?? decoration.label;
    const mark = {
      kind: decoration.kind,
      startLine: decoration.line,
      endLine: decoration.line,
      ...(label ? { label } : {}),
    };
    openByKind.set(decoration.kind, mark);
    marks.push(mark);
  }
  return marks;
}

function markRangeLabel(mark: EditorOverviewMark): string {
  return mark.startLine === mark.endLine
    ? `Linha ${mark.startLine}`
    : `Linhas ${mark.startLine}-${mark.endLine}`;
}

function markTitle(mark: EditorOverviewMark): string {
  const range = markRangeLabel(mark);
  return mark.label ? `${mark.label}\n${range}` : range;
}

/**
 * Distância vertical, em pixels, até onde o ponteiro ainda "puxa" a marca mais próxima. Uma marca
 * de uma linha tem 3-4px; sem essa tolerância o clique exige mirar no pixel exato da barra.
 */
export const EDITOR_OVERVIEW_SNAP_PX = 10;

/**
 * Índice da marca mais próxima de `clientY` dentro da tolerância, ou -1. Mede os retângulos já
 * renderizados (os filhos da faixa estão na ordem de `marks`); em empate vence a última, que é a
 * pintada por cima, igual ao hit-test do navegador.
 */
function nearestMarkIndex(ruler: HTMLElement, clientY: number): number {
  let nearest = -1;
  let nearestDistance = EDITOR_OVERVIEW_SNAP_PX;
  Array.from(ruler.children).forEach((child, index) => {
    const rect = child.getBoundingClientRect();
    const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (distance <= nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

export interface EditorOverviewRulerProps {
  readonly marks: readonly EditorOverviewMark[];
  /** Linhas visíveis do editor (após dobras): a faixa representa a mesma altura que a rolagem. */
  readonly lineCount: number;
  readonly visibleLineByFileLine: readonly number[] | undefined;
  readonly onNavigate: (fileLine: number) => void;
}

/**
 * Faixa de visão geral ao lado da scrollbar: cada marca fica na altura proporcional do seu trecho
 * no documento e leva o editor até ele. Não depende da rolagem, então não re-renderiza ao rolar.
 */
export const EditorOverviewRuler = memo(function EditorOverviewRuler({
  marks,
  lineCount,
  visibleLineByFileLine,
  onNavigate,
}: EditorOverviewRulerProps) {
  // Marca sob o ponteiro ou a mais próxima dele: recebe o destaque e o clique em qualquer ponto da
  // faixa ao redor. Só muda com o mouse sobre a faixa, então rolar o editor continua sem render.
  const [hotIndex, setHotIndex] = useState(-1);
  const hotMark = marks[hotIndex];
  const total = Math.max(1, lineCount);
  // Decorações chegam com atraso em relação ao buffer; uma linha além do fim (documento encurtado,
  // remoção no final do arquivo) fica presa na última posição em vez de sair da faixa.
  const position = (fileLine: number) => Math.min(total, visibleLineByFileLine?.[fileLine - 1] ?? fileLine);
  return (
    <div
      className={`editor-overview-ruler${hotMark ? " is-pointing" : ""}`}
      role="group"
      aria-label="Visão geral do documento"
      title={hotMark ? markTitle(hotMark) : undefined}
      onMouseMove={(event) => setHotIndex(nearestMarkIndex(event.currentTarget, event.clientY))}
      onMouseLeave={() => setHotIndex(-1)}
      // Sem roubar o foco no mousedown: a navegação devolve o foco ao editor já posicionado.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const mark = marks[nearestMarkIndex(event.currentTarget, event.clientY)];
        if (mark) onNavigate(mark.startLine);
      }}
    >
      {marks.map((mark, index) => {
        const start = position(mark.startLine);
        const end = Math.max(start, position(mark.endLine));
        const range = markRangeLabel(mark);
        return (
          <button
            key={`${mark.kind}:${mark.startLine}:${mark.endLine}`}
            className={`editor-overview-ruler__mark is-${mark.kind}${index === hotIndex ? " is-hot" : ""}`}
            type="button"
            tabIndex={-1}
            style={{
              top: `${((start - 1) / total) * 100}%`,
              ...(mark.kind === "deleted" ? {} : { height: `${((end - start + 1) / total) * 100}%` }),
            }}
            title={markTitle(mark)}
            aria-label={`Ir para ${range.toLocaleLowerCase()}${mark.label ? `: ${mark.label}` : ""}`}
            // O clique direto na marca é dela (inclusive o de tecnologia assistiva, sem coordenadas);
            // a faixa só resolve os cliques que caem no vão ao redor.
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(mark.startLine);
            }}
          />
        );
      })}
    </div>
  );
});
