import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

/**
 * Latência de digitação no terminal, medida dentro da página: do `keydown` até o eco
 * do caractere aparecer nas linhas do xterm. O cenário que importa é o de várias
 * sessões abertas ao mesmo tempo (várias abas, várias janelas): o Chromium limita a
 * seis as conexões HTTP/1.1 simultâneas por origem, e cada sessão que mantém um
 * long-poll aberto ocupa uma delas. Com a fila cheia, o POST de cada tecla esperava
 * um long-poll devolver — até dez segundos por tecla em shells ociosos.
 */
const KEYSTROKE_BUDGET_MS = {
  single: 150,
  crowdedMedian: 200,
  crowdedP90: 400,
};
const CROWDED_SESSION_COUNT = 7;
const KEYSTROKE_TIMEOUT_MS = 12_000;

function percentile(samples, fraction) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function activeScreen(window) {
  return window.locator(".tinyide-terminal-session:not([hidden]) .xterm-screen").first();
}

async function waitForPrompt(window) {
  const screen = activeScreen(window);
  await screen.waitFor({ timeout: 30_000 });
  await expect.poll(
    () => screen.innerText(),
    { timeout: 30_000, message: "o terminal deveria desenhar o prompt" },
  ).not.toBe("");
  return screen;
}

/**
 * Digita `text` tecla a tecla no terminal ativo e devolve a latência de cada eco.
 * A sonda é armada — e a armação aguardada — antes de a tecla ser enviada: o
 * evento de teclado chega ao renderer por outro caminho que o `evaluate`, e sem
 * essa ordem o `keydown` real podia passar antes de o listener existir.
 */
async function measureTyping(window, text) {
  const latencies = [];
  let typed = "";
  for (const character of text) {
    typed += character;
    await window.evaluate(({ expected, timeoutMs }) => {
      const rows = document.querySelector(".tinyide-terminal-session:not([hidden]) .xterm-rows");
      window.__terminalProbe = new Promise((resolve) => {
        let pressedAt;
        const onKeyDown = () => {
          pressedAt = performance.now();
          document.removeEventListener("keydown", onKeyDown, true);
        };
        document.addEventListener("keydown", onKeyDown, true);
        const armedAt = performance.now();
        const tick = () => {
          const text = rows?.textContent ?? "";
          if (pressedAt !== undefined && text.includes(expected)) {
            resolve({ latency: performance.now() - pressedAt });
            return;
          }
          if (performance.now() - armedAt > timeoutMs) {
            document.removeEventListener("keydown", onKeyDown, true);
            resolve({ latency: Number.POSITIVE_INFINITY, pressed: pressedAt !== undefined, tail: text.trim().slice(-160) });
            return;
          }
          setTimeout(tick, 2);
        };
        tick();
      });
    }, { expected: typed, timeoutMs: KEYSTROKE_TIMEOUT_MS });
    await window.keyboard.press(character);
    const sample = await window.evaluate(() => window.__terminalProbe);
    if (!Number.isFinite(sample.latency)) {
      console.log(`[medida] eco de "${typed}" não apareceu (tecla registrada: ${sample.pressed}); fim das linhas: ${JSON.stringify(sample.tail)}`);
    }
    latencies.push(sample.latency);
  }
  return latencies;
}

function describe(samples) {
  if (!samples.length) return "nenhuma amostra";
  return `mediana ${percentile(samples, 0.5).toFixed(0)}ms, p90 ${percentile(samples, 0.9).toFixed(0)}ms, máx ${Math.max(...samples).toFixed(0)}ms`;
}

test.describe("latência de digitação no terminal", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({});
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("digitar continua imediato com várias sessões abertas", async () => {
    test.setTimeout(300_000);
    const { window } = ide;

    // Tempo que cada POST de tecla passou na fila do Chromium antes de sair pelo socket.
    const inputQueueWaits = [];
    const onFinished = (request) => {
      if (request.method() !== "POST" || !/\/plugin-api\/tinyide\.terminal\/sessions\/[^/]+\/input$/.test(request.url())) return;
      const timing = request.timing();
      if (timing.requestStart >= 0) inputQueueWaits.push(timing.requestStart);
    };
    window.on("requestfinished", onFinished);

    try {
      await window.getByLabel("Exibir TERMINAL").first().click();
      let screen = await waitForPrompt(window);
      await screen.click();
      const single = await measureTyping(window, "abcdefghij");
      await window.keyboard.press("Control+C");
      console.log(`[medida] terminal único: ${describe(single)}`);

      const newTerminal = window.getByRole("button", { name: "Novo terminal" });
      for (let index = 1; index < CROWDED_SESSION_COUNT; index += 1) {
        await newTerminal.click();
        screen = await waitForPrompt(window);
      }
      await screen.click();
      const singleQueueWaits = inputQueueWaits.splice(0);
      const crowded = await measureTyping(window, "klmnop");
      await window.keyboard.press("Control+C");
      console.log(
        `[medida] ${CROWDED_SESSION_COUNT} terminais: ${describe(crowded)}; `
        + `POSTs de tecla pelo pool HTTP: ${singleQueueWaits.length} antes (fila ${describe(singleQueueWaits)}), `
        + `${inputQueueWaits.length} depois (fila ${describe(inputQueueWaits)})`,
      );

      expect(percentile(single, 0.5), `terminal único: ${describe(single)}`).toBeLessThan(KEYSTROKE_BUDGET_MS.single);
      expect(percentile(crowded, 0.5), `${CROWDED_SESSION_COUNT} terminais: ${describe(crowded)}`)
        .toBeLessThan(KEYSTROKE_BUDGET_MS.crowdedMedian);
      expect(percentile(crowded, 0.9), `${CROWDED_SESSION_COUNT} terminais: ${describe(crowded)}`)
        .toBeLessThan(KEYSTROKE_BUDGET_MS.crowdedP90);
    } finally {
      window.off("requestfinished", onFinished);
    }
  });
});
