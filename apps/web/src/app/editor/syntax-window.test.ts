import { describe, expect, it } from "vitest";
import { resolveSyntaxSlice, type SyntaxDialect } from "./syntax-window";

const LINE = "const valor = calcular(argumento);\n";

function document(lines: number, marker = ""): string {
  return `${marker}${LINE.repeat(lines)}`;
}

describe("resolveSyntaxSlice", () => {
  it("devolve o documento inteiro quando a janela já o cobre", () => {
    const source = document(10);
    expect(resolveSyntaxSlice(source, 0, source.length)).toEqual({ start: 0, end: source.length });
  });

  it("recorta a janela alinhada ao início e ao fim das linhas", () => {
    const source = document(100);
    const windowStart = LINE.length * 40 + 5;
    const windowEnd = LINE.length * 45 + 3;
    const slice = resolveSyntaxSlice(source, windowStart, windowEnd, "c-like");

    expect(slice.start).toBe(LINE.length * 40);
    expect(slice.end).toBe(LINE.length * 46);
    expect(slice.end - slice.start).toBeLessThan(source.length / 10);
  });

  it("recua até a abertura de um comentário de bloco que engole a janela", () => {
    const prefix = document(20);
    const comment = `/*\n${"comentário longo\n".repeat(50)}`;
    const source = `${prefix}${comment}*/\n${document(20)}`;
    const windowStart = prefix.length + comment.length / 2;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 100, "c-like");

    expect(slice.start).toBe(prefix.length);
    expect(source.slice(slice.start, slice.start + 2)).toBe("/*");
  });

  it("não recua quando o comentário de bloco anterior já foi fechado", () => {
    const prefix = `${document(5)}/* comentário curto */\n`;
    const source = `${prefix}${document(80)}`;
    const windowStart = prefix.length + LINE.length * 40;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + LINE.length * 3, "c-like");

    expect(slice.start).toBe(windowStart);
  });

  it("recua até a abertura de uma docstring aberta acima da janela", () => {
    const prefix = "def f():\n";
    const docstring = `    """\n${"    documentação\n".repeat(60)}`;
    const source = `${prefix}${docstring}    """\n${document(10)}`;
    const windowStart = prefix.length + docstring.length / 2;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 80, "python");

    expect(slice.start).toBe(prefix.length);
  });

  it("estende o fim até fechar um bloco que abre dentro da janela", () => {
    const prefix = document(30);
    const source = `${prefix}<!--\n${"marcação comentada\n".repeat(40)}-->\n${document(10)}`;
    const windowEnd = prefix.length + 20;

    const slice = resolveSyntaxSlice(source, prefix.length, windowEnd, "markup");

    expect(source.slice(slice.start, slice.end)).toContain("-->");
  });

  it("estende o fim até fechar uma cerca de markdown aberta na janela", () => {
    const prefix = "# título\n\n";
    const fence = `\`\`\`js\n${"const x = 1;\n".repeat(40)}`;
    const source = `${prefix}${fence}\`\`\`\n${document(5)}`;

    const slice = resolveSyntaxSlice(source, prefix.length, prefix.length + 12, "markdown");

    expect(source.slice(slice.start, slice.end).match(/```/g)).toHaveLength(2);
  });

  it("mantém um template literal aberto acima da janela dentro do recorte", () => {
    const prefix = "const consulta = `\n";
    const body = "  linha do template\n".repeat(40);
    const source = `${document(5)}${prefix}${body}\`;\n`;
    const windowStart = source.indexOf(body) + body.length / 2;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 40, "c-like");

    expect(slice.start).toBe(source.indexOf(prefix));
  });

  it("nunca devolve um recorte menor que a janela pedida", () => {
    const source = document(200);
    const windowStart = LINE.length * 100;
    const windowEnd = LINE.length * 120;

    const slice = resolveSyntaxSlice(source, windowStart, windowEnd, "c-like");

    expect(slice.start).toBeLessThanOrEqual(windowStart);
    expect(slice.end).toBeGreaterThanOrEqual(windowEnd);
  });

  it("recua o quanto for preciso quando o construto abre muito acima do teto de contexto", () => {
    // Entregar menos contexto do que o construto exige pintaria a tela inteira como comentário —
    // a correção vale mais que a economia, e um comentário desse tamanho é patológico.
    const filler = `${"x".repeat(80)}\n`.repeat(2_000);
    const source = `/*\n${filler}*/\nfim\n`;
    const windowStart = source.length - 10;

    const slice = resolveSyntaxSlice(source, windowStart, source.length, "c-like");

    expect(slice.start).toBe(0);
  });

  it("limita o contexto à frente quando o construto não fecha dentro do teto", () => {
    const filler = `${"x".repeat(80)}\n`.repeat(2_000);
    const source = `${document(5)}/*\n${filler}*/\nfim\n`;
    const windowStart = source.indexOf("/*");

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 200, "c-like");

    expect(slice.end - windowStart).toBeLessThanOrEqual(64 * 1024 + 200);
  });
});

describe("resolveSyntaxSlice: o que não pode ser confundido com abertura", () => {
  it("ignora aspas triplas citadas dentro de um comentário Python", () => {
    const prefix = 'x = 1\n# use """ para documentar\ny = 2\n';
    const source = `${prefix}${"z = 3\n".repeat(60)}`;
    const windowStart = prefix.length + 60;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 40, "python");

    expect(slice.start).toBe(windowStart);
  });

  it("ignora crases de prosa dentro de uma docstring Python", () => {
    // Caso real: a docstring cita `created_from' com crase e apóstrofo desemparelhados. A paridade
    // de delimitadores recuava o recorte para dentro da docstring e o arquivo inteiro virava string.
    const docstring = [
      'def consultar(filtros):',
      '    """Filtra pedidos.',
      "",
      "    (`modified_from`, `created_from' ou 'created_month'). Nesses casos, algumas",
      "    integrações não aceitam o filtro e o pedido é ignorado.",
      '    """',
      "",
    ].join("\n");
    const body = "    return filtros\n".repeat(80);
    const source = `${docstring}${body}`;
    const windowStart = docstring.length + 200;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 300, "python");

    expect(slice.start).toBe(source.lastIndexOf("\n", windowStart - 1) + 1);
  });

  it("acompanha uma string de aspa simples continuada com barra invertida", () => {
    // Uma f-string de aspa única atravessa linhas quando a quebra é escapada: no início de cada
    // linha continuada o tokenizador ainda está dentro da string.
    const prefix = "logger.error(\n";
    const literal = `    f"mensagem longa: \\\n${"    -detalhe do item\\\n".repeat(40)}    "\n`;
    const source = `${prefix}${literal})\n${document(10)}`;
    const windowStart = prefix.length + 200;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 120, "python");

    expect(slice.start).toBe(source.indexOf('    f"'));
  });

  it("ignora um /* citado dentro de comentário de linha", () => {
    const prefix = `${document(3)}// abre com /* e nunca fecha\n`;
    const source = `${prefix}${document(60)}`;
    const windowStart = prefix.length + LINE.length * 30;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + LINE.length * 2, "c-like");

    expect(slice.start).toBe(windowStart);
  });

  it("ignora aspas de prosa em markdown", () => {
    const prefix = `# Título\n\nA ideia do autor' não fecha aspa.\n`;
    const source = `${prefix}${"texto comum\n".repeat(60)}`;
    const windowStart = prefix.length + 100;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 60, "markdown");

    expect(slice.start).toBe(source.lastIndexOf("\n", windowStart - 1) + 1);
  });

  it("não fecha a docstring num delimitador escapado", () => {
    const prefix = "def f():\n";
    const docstring = `    """\n    exemplo com aspas escapadas: \\"""\n${"    texto\n".repeat(40)}`;
    const source = `${prefix}${docstring}    """\n${document(10)}`;
    const windowStart = prefix.length + docstring.length / 2;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 60, "python");

    expect(slice.start).toBe(prefix.length);
  });

  it("mantém o recorte quando o construto nunca fecha", () => {
    const prefix = `${document(5)}/* comentário sem fim\n`;
    const source = `${prefix}${document(60)}`;
    const windowStart = prefix.length + LINE.length * 30;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + LINE.length * 2, "c-like");

    expect(slice.start).toBe(source.indexOf("/*"));
    expect(slice.end).toBeLessThanOrEqual(source.length);
  });

  it("uma aspa que não fecha na própria linha morre na quebra", () => {
    const prefix = "x = 'aspa solta que ninguém fechou\ny = 2\n";
    const source = `${prefix}${"z = 3\n".repeat(60)}`;
    const windowStart = prefix.length + 60;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 40, "python");

    expect(slice.start).toBe(windowStart);
  });

  it("acompanha uma string sem fechamento até o fim do documento", () => {
    const prefix = "def f():\n    texto = 'sem fechar \\\n";
    const source = `${prefix}    continuação sem aspas`;

    const slice = resolveSyntaxSlice(source, prefix.length, source.length, "python");

    expect(slice.start).toBe(source.indexOf("    texto"));
  });

  it("no dialeto genérico, cerquilha só comenta a partir da indentação", () => {
    // Na indentação a linha é comentário e a crase dentro dela não abre nada.
    const commented = `${document(3)}  # nota com \` crase solta\n`;
    const commentedSource = `${commented}${document(40)}`;
    const afterComment = commented.length + LINE.length * 20;

    expect(resolveSyntaxSlice(commentedSource, afterComment, afterComment + LINE.length, "generic").start)
      .toBe(afterComment);

    // No meio da linha ela não comenta nada — o que vem depois continua valendo, e o recorte
    // prefere recuar de mais a de menos: entregar contexto sobrando só custa tempo.
    const inline = `${document(3)}valor = 10 # nota com \` crase solta\n`;
    const inlineSource = `${inline}${document(40)}`;
    const afterInline = inline.length + LINE.length * 20;

    expect(resolveSyntaxSlice(inlineSource, afterInline, afterInline + LINE.length, "generic").start)
      .toBe(inlineSource.indexOf("valor = 10"));
  });

  it("dispensa a varredura em dialetos sem construto multi-linha", () => {
    const prefix = `# configuração\nchave = "valor\n`;
    const source = `${prefix}${"outra = 1\n".repeat(60)}`;
    const windowStart = prefix.length + 100;

    const slice = resolveSyntaxSlice(source, windowStart, windowStart + 40, "hash");

    expect(slice.start).toBe(source.lastIndexOf("\n", windowStart - 1) + 1);
  });
});

/**
 * Tokenizador de referência com as regras que o realçador de Python aplica: comentário até o fim
 * da linha, strings de aspa tripla e de aspa única (com escapes). A propriedade exercida é a razão
 * de existir do recorte — realçar o recorte tem de dar o mesmo resultado que realçar o arquivo.
 */
function tokenizePython(source: string): string[] {
  const scopes = new Array<string>(source.length).fill("");
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "#") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      scopes.fill("comment", index, stop);
      index = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      const triple = source.slice(index, index + 3) === char.repeat(3);
      const delimiter = triple ? char.repeat(3) : char;
      let cursor = index + delimiter.length;
      let end = source.length;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (!triple && source[cursor] === "\n") {
          end = cursor;
          break;
        }
        if (source.slice(cursor, cursor + delimiter.length) === delimiter) {
          end = cursor + delimiter.length;
          break;
        }
        cursor += 1;
      }
      scopes.fill("string", index, end);
      index = end;
      continue;
    }
    index += 1;
  }
  return scopes;
}

describe("recorte e documento inteiro produzem o mesmo realce", () => {
  const PARAGRAPHS = [
    'def calcular(valor):\n    """Resolve o cálculo via `_helper`, com o pack de cada item.\n\n    O filtro (`modified_from`, `created_from\' ou \'created_month\') muda o escopo.\n    """\n    return valor * 2\n',
    "# comentário citando \"\"\" e ''' no meio da prosa\nx = 1\n",
    'mensagem = f"linha longa: \\\n    continuação da linha\\\n    fim"\n',
    "dados = {\n    \"chave\": 'valor',\n    'outra': \"texto com # cerquilha\",\n}\n",
    'texto = """\nbloco\nde\ntexto\n"""\n',
    "if valor:\n    raise ValueError('mensagem')\n",
    "sql = '''\nSELECT *\nFROM tabela\n'''\n",
  ];

  function fixture(repetitions: number): string {
    const parts: string[] = [];
    for (let index = 0; index < repetitions; index += 1) {
      parts.push(PARAGRAPHS[index % PARAGRAPHS.length] ?? "");
    }
    return parts.join("\n");
  }

  it("bate em toda posição de rolagem de um arquivo Python", () => {
    const source = fixture(400);
    const reference = tokenizePython(source);
    const lineStarts = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") lineStarts.push(index + 1);
    }

    const divergences: string[] = [];
    for (let top = 0; top < lineStarts.length; top += 1) {
      const windowStart = lineStarts[top] ?? 0;
      const windowEnd = lineStarts[Math.min(top + 80, lineStarts.length - 1)] ?? source.length;
      const slice = resolveSyntaxSlice(source, windowStart, windowEnd, "python");
      const sliced = tokenizePython(source.slice(slice.start, slice.end));
      for (let index = windowStart; index < windowEnd; index += 1) {
        if (sliced[index - slice.start] !== reference[index]) {
          divergences.push(`linha ${top + 1}, offset ${index}: ${reference[index] || "nenhum"} virou ${sliced[index - slice.start] || "nenhum"}`);
          break;
        }
      }
    }

    expect(divergences.slice(0, 5)).toEqual([]);
  });

  it("cobre todos os dialetos com construtos multi-linha", () => {
    const cases: readonly { dialect: SyntaxDialect; source: string }[] = [
      { dialect: "c-like", source: `${"const x = 1;\n".repeat(30)}/* bloco\nde comentário\n*/\nconst y = \`template\nmulti\nlinha\`;\n${"const z = 2;\n".repeat(30)}` },
      { dialect: "markup", source: `${"<p>texto</p>\n".repeat(30)}<!-- comentário\nde marcação -->\n${"<p>fim</p>\n".repeat(30)}` },
      { dialect: "markdown", source: `${"parágrafo comum\n".repeat(20)}\`\`\`python\ncódigo\n\`\`\`\n${"outro parágrafo\n".repeat(20)}` },
      { dialect: "stylesheet", source: `${".a { color: #fff; }\n".repeat(20)}/* nota\nlonga */\n${".b { color: #000; }\n".repeat(20)}` },
    ];

    for (const { dialect, source } of cases) {
      for (let at = 0; at < source.length; at += 40) {
        const slice = resolveSyntaxSlice(source, at, Math.min(source.length, at + 400), dialect);
        expect(slice.start).toBeLessThanOrEqual(at);
        expect(slice.end).toBeGreaterThanOrEqual(Math.min(source.length, at + 400));
      }
    }
  });
});
