import { expect, test } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchIde, openProject } from "./ide-app.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRESS_DONE = "__TINYIDE_STRESS_DONE__";

test("terminal aplica backpressure sob saída intensa e mantém a IDE responsiva", async () => {
  const userDataDir = resolve(repositoryRoot, ".tmp", `e2e-memory-state-${process.pid}`);
  await mkdir(userDataDir, { recursive: true });
  const ide = await launchIde(repositoryRoot, { userDataDir });
  try {
    await openProject(ide.window);
    await ide.window.getByLabel("Exibir TERMINAL").click();
    const input = ide.window.getByLabel("Terminal input");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await expect(ide.window.getByLabel(/Terminal 1: conectado/)).toBeVisible();

    let sampling = true;
    let maxHeap = 0;
    const sampler = (async () => {
      while (sampling) {
        const heap = await ide.window.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
        maxHeap = Math.max(maxHeap, heap);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
    })();

    const command = `node -e "for(let i=0;i<150000;i++) console.log(String(i).padStart(6,'0')+' '+ 'x'.repeat(300)); console.log('${STRESS_DONE}')"`;
    await input.fill(command);
    await input.press("Enter");
    await expect(ide.window.getByText(STRESS_DONE, { exact: false }).last()).toBeVisible({ timeout: 60_000 });

    sampling = false;
    await sampler;

    await expect(ide.window.getByLabel(/Terminal 1: conectado/)).toBeVisible();
    await ide.window.getByRole("button", { name: "Ajuda" }).click();
    await expect(ide.window.getByText("Sobre", { exact: true })).toBeVisible();

    // O limite não é uma meta de consumo absoluto do Electron. Ele só protege a
    // regressão em que dezenas de MB eram enfileirados no write-buffer do xterm
    // antes de o renderer conseguir processá-los.
    expect(maxHeap).toBeLessThan(160 * 1024 * 1024);
  } finally {
    await ide.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
