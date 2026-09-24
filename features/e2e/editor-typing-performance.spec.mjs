import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

/**
 * Latência de digitação medida dentro da página, com teclas reais: do `keydown` até o segundo
 * quadro seguinte — o momento em que o glifo já está na tela. Inclui, portanto, a espera pelo
 * vsync (uns 16-33ms num monitor de 60Hz), e é sobre esse piso que os orçamentos abaixo foram
 * escolhidos. Os valores observados em desenvolvimento estão entre parênteses.
 *
 * O ponto não é cravar um número: é que digitar num arquivo grande não pode custar uma ordem de
 * grandeza a mais do que digitar num pequeno. Quando a camada de sintaxe realçava o arquivo
 * inteiro a cada tecla, um módulo de 2.000 linhas custava 640ms por caractere.
 */
const KEYSTROKE_BUDGET_MS = {
  medium: 150, // ~32ms
  large: 200,  // ~45ms
  huge: 260,   // ~60ms
};

function pythonModule(blocks) {
  const body = [];
  for (let index = 0; index < blocks; index += 1) {
    body.push(index % 7 === 0
      ? `# comentário de preenchimento da linha ${index}`
      : `def funcao_${index}(valor: int) -> str:\n    return f"resultado {valor} da linha ${index}"`);
  }
  return `${body.join("\n")}\n`;
}

/**
 * Docstrings espalhadas forçam o recorte da janela a recuar até a abertura do bloco. A prosa
 * dentro delas repete o que arquivos reais têm e o que quebrava o recorte: crases e apóstrofos
 * desemparelhados, aspas triplas citadas em comentário e strings continuadas com barra invertida.
 */
function pythonModuleWithDocstrings(blocks) {
  const body = [];
  for (let index = 0; index < blocks; index += 1) {
    body.push(`def funcao_${index}(valor: int) -> str:`);
    if (index % 5 === 0) {
      body.push(
        '    """',
        `    Processa o valor ${index} da integração.`,
        "",
        "    Filtra por (`modified_from`, `created_from' ou 'created_month') conforme o caso.",
        "    Retorna o texto formatado.",
        '    """',
      );
    }
    if (index % 11 === 0) body.push('    # docstrings usam """ para abrir e fechar');
    if (index % 13 === 0) {
      body.push(`    aviso = f"valor {valor} da linha ${index}: \\`, "        continuação da mensagem\"");
    }
    body.push(`    return f"resultado {valor} da linha ${index}"`, "");
  }
  return `${body.join("\n")}\n`;
}

/**
 * Cobertura de palavras-chave na janela materializada: `def` e `return` só aparecem em código no
 * módulo de teste, então toda ocorrência tem de estar num span de palavra-chave. Quando o recorte
 * começa dentro de uma docstring, elas caem dentro de um span de string e a cobertura despenca —
 * é exatamente a tela de uma cor só. O escopo predominante vai junto, para o log dizer no que o
 * texto se transformou quando falhar.
 */
async function keywordCoverageInWindow(window) {
  return window.evaluate(() => {
    const layer = document.querySelector(".syntax-layer");
    const rendered = layer.querySelector("[data-syntax-window-start]") ?? layer;
    const pattern = /\b(?:def|return)\b/g;
    const scopes = new Map();
    let highlighted = 0;
    let plain = 0;
    let characters = 0;
    const walker = document.createTreeWalker(rendered, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const scope = node.parentElement?.className?.match(/syntax-([\w-]+)/)?.[1] ?? "nenhum";
      const length = text.trim().length;
      characters += length;
      if (length > 0) scopes.set(scope, (scopes.get(scope) ?? 0) + length);
      const occurrences = text.match(pattern)?.length ?? 0;
      if (occurrences === 0) continue;
      if (scope === "keyword") highlighted += occurrences;
      else plain += occurrences;
    }
    const ranked = [...scopes.entries()].sort((left, right) => right[1] - left[1]);
    const total = highlighted + plain;
    return {
      characters,
      keywords: total,
      coverage: total === 0 ? 0 : highlighted / total,
      top: ranked[0]?.[0] ?? "nenhum",
      share: characters === 0 ? 1 : (ranked[0]?.[1] ?? 0) / characters,
    };
  });
}

async function installProbe(window, caretOffset = 0) {
  await window.evaluate((offset) => {
    const editor = document.querySelector("textarea.code-editor");
    editor.focus();
    const caret = Math.min(offset, editor.value.length);
    editor.setSelectionRange(caret, caret);
    window.__typingLatency = [];
    if (window.__typingProbeInstalled) return;
    window.__typingProbeInstalled = true;
    window.addEventListener("keydown", () => {
      const startedAt = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__typingLatency.push(performance.now() - startedAt);
      }));
    }, true);
  }, caretOffset);
}

async function readProbe(window) {
  return window.evaluate(() => {
    const samples = [...window.__typingLatency].sort((left, right) => left - right);
    return {
      median: samples[Math.floor(samples.length / 2)] ?? 0,
      worst: samples.at(-1) ?? 0,
      samples: samples.length,
    };
  });
}

async function measureTyping(window, text, caretOffset = 0) {
  await installProbe(window, caretOffset);
  await window.keyboard.type(text, { delay: 60 });
  await window.waitForTimeout(400);
  return readProbe(window);
}

test.describe("latência de digitação", () => {
  test("digitar em arquivo grande custa o mesmo que em arquivo pequeno", async () => {
    const workspace = await createWorkspace({
      "medio.py": pythonModule(1_000),
      "grande.py": pythonModule(4_000),
    });
    const ide = await launchIde(workspace.root);
    const { window } = ide;
    const typed = "abcdefghijklmnopqrst";
    try {
      await openProject(window);
      // Indexação da busca e runtimes de plugin assentam antes da medição.
      await window.waitForTimeout(6_000);

      await openFile(window, "medio.py");
      await window.locator("textarea.code-editor").waitFor({ timeout: 20_000 });
      const medium = await measureTyping(window, typed);

      await openFile(window, "grande.py");
      await window.locator("textarea.code-editor").waitFor({ timeout: 20_000 });
      const large = await measureTyping(window, typed);

      // O texto tem de estar na camada que o usuário lê, não só no valor do textarea.
      const rendered = await window.locator(".syntax-layer").first().textContent();
      expect(rendered?.startsWith(typed), "a camada de sintaxe ficou atrás do texto digitado").toBe(true);

      console.log(`[medida] medio: ${medium.median.toFixed(0)}ms | grande: ${large.median.toFixed(0)}ms`);
      expect(medium.samples).toBeGreaterThan(10);
      expect(
        medium.median,
        `arquivo médio: ${medium.median.toFixed(0)}ms por tecla (pior ${medium.worst.toFixed(0)}ms)`,
      ).toBeLessThan(KEYSTROKE_BUDGET_MS.medium);
      expect(
        large.median,
        `arquivo grande: ${large.median.toFixed(0)}ms por tecla (pior ${large.worst.toFixed(0)}ms)`,
      ).toBeLessThan(KEYSTROKE_BUDGET_MS.large);
    } finally {
      await ide.close();
      await workspace.dispose();
    }
  });

  /**
   * Um teto global desligava o realce acima de 500 KB — herança de quando cada tecla tokenizava o
   * arquivo inteiro. Com a janela de sintaxe o tokenizador só vê o recorte visível, então arquivos
   * grandes (um módulo Python de 14 mil linhas, por exemplo) precisam abrir realçados e continuar
   * respondendo à digitação.
   */
  test("arquivo acima do antigo teto abre realçado e continua respondendo", async () => {
    const source = pythonModuleWithDocstrings(9_000);
    expect(source.length, "o caso precisa ficar acima do antigo teto de 500 KB").toBeGreaterThan(500_000);
    const workspace = await createWorkspace({ "enorme.py": source });
    const ide = await launchIde(workspace.root);
    const { window } = ide;
    try {
      await openProject(window);
      await window.waitForTimeout(6_000);
      await openFile(window, "enorme.py");
      await window.locator("textarea.code-editor").waitFor({ timeout: 20_000 });

      const layer = window.locator(".syntax-layer").first();
      await layer.waitFor({ timeout: 20_000 });
      await expect(layer.locator("span.syntax-keyword").first()).toBeVisible({ timeout: 20_000 });

      // Digitar no meio do arquivo, não no topo: lá o recorte entregue ao tokenizador precisa
      // recuar até a abertura da docstring mais próxima, que é o caminho caro da janela.
      const huge = await measureTyping(window, "abcdefghijklmnopqrst", Math.floor(source.length / 2));
      await expect(layer.locator("span.syntax-keyword").first()).toBeVisible({ timeout: 20_000 });
      console.log(`[medida] enorme: mediana ${huge.median.toFixed(0)}ms, pior ${huge.worst.toFixed(0)}ms, amostras ${huge.samples}`);
      expect(huge.samples).toBeGreaterThan(10);
      expect(
        huge.median,
        `arquivo enorme: ${huge.median.toFixed(0)}ms por tecla (pior ${huge.worst.toFixed(0)}ms)`,
      ).toBeLessThan(KEYSTROKE_BUDGET_MS.huge);
    } finally {
      await ide.close();
      await workspace.dispose();
    }
  });

  /**
   * O recorte entregue ao tokenizador precisa começar num ponto em que ele esteja fora de
   * docstring, comentário e string. Quando começava no meio de uma delas, o delimitador de
   * fechamento virava abertura e a tela inteira se pintava de uma cor só — a falha aparecia ao
   * rolar, porque cada posição de rolagem escolhe um recorte diferente.
   */
  test("realce continua correto em cada posição de rolagem", async () => {
    const source = pythonModuleWithDocstrings(4_000);
    const workspace = await createWorkspace({ "rolagem.py": source });
    const ide = await launchIde(workspace.root);
    const { window } = ide;
    try {
      await openProject(window);
      await window.waitForTimeout(6_000);
      await openFile(window, "rolagem.py");
      await window.locator("textarea.code-editor").waitFor({ timeout: 20_000 });
      const layer = window.locator(".syntax-layer").first();
      await expect(layer.locator("span.syntax-keyword").first()).toBeVisible({ timeout: 20_000 });

      const observed = [];
      for (const fraction of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) {
        await window.locator(".highlight-editor").evaluate((scroller, ratio) => {
          scroller.scrollTop = Math.floor(scroller.scrollHeight * ratio);
        }, fraction);
        await window.waitForTimeout(400);
        const measurement = await keywordCoverageInWindow(window);
        observed.push({ fraction, ...measurement });
      }

      console.log(`[medida] rolagem: ${observed.map((item) => `${Math.round(item.fraction * 100)}%→${(item.coverage * 100).toFixed(0)}% de ${item.keywords} (predomina ${item.top} com ${(item.share * 100).toFixed(0)}%)`).join(" | ")}`);
      for (const item of observed) {
        const at = `${Math.round(item.fraction * 100)}% da rolagem`;
        expect(item.characters, `nada materializado em ${at}`).toBeGreaterThan(200);
        expect(item.keywords, `nenhum def/return na janela em ${at}`).toBeGreaterThan(5);
        expect(
          item.coverage,
          `em ${at}, só ${(item.coverage * 100).toFixed(0)}% dos def/return ficaram realçados (predomina "${item.top}", ${(item.share * 100).toFixed(0)}% do texto)`,
        ).toBe(1);
      }
    } finally {
      await ide.close();
      await workspace.dispose();
    }
  });
});
