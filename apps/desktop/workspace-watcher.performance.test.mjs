import {createRequire} from "node:module";
import {describe, expect, it} from "vitest";

const require = createRequire(import.meta.url);
const {createGitignoreFilter, ignoredWorkspacePath} = require("./workspace-watcher.cjs");

/**
 * O filtro roda para cada entrada do scan inicial do chokidar — em workspace
 * grande são centenas de milhares de chamadas no processo principal do
 * Electron. O orçamento segura a complexidade por caminho; o cenário inclui os
 * dois agravantes reais: diretórios extras com curinga e `.gitignore` aninhado.
 */
describe("workspace watcher filter performance", () => {
  it("filtra 60.000 caminhos com extras com curinga e .gitignore aninhado dentro do orçamento", () => {
    const root = "/workspace";
    const gitignore = createGitignoreFilter(root, {
      readGitignore: (path) => {
        if (path === "/workspace/.gitignore") {
          return "*.log\nmedia/\ndist/\n.env\ndocs/**/generated\n!docs/keep/generated\n";
        }
        if (path === "/workspace/backend/.gitignore") return "uploads/\n";
        return undefined;
      },
    });
    const extraIgnored = new Set(["*.bak", "legacy", "tmp-*"]);

    const paths = [];
    for (let index = 0; index < 60_000; index += 1) {
      const depth = 1 + (index % 6);
      const segments = [];
      for (let level = 0; level < depth; level += 1) segments.push(`dir${(index + level) % 40}`);
      segments.push(index % 9 === 0 ? `file${index}.log` : `file${index}.ts`);
      paths.push(`/workspace/${segments.join("/")}`);
    }

    let ignored = 0;
    const startedAt = performance.now();
    for (const path of paths) {
      if (ignoredWorkspacePath(root, path, extraIgnored, gitignore)) ignored += 1;
    }
    const duration = performance.now() - startedAt;

    expect(ignored).toBeGreaterThan(0);
    expect(ignored).toBeLessThan(paths.length);
    expect(duration).toBeLessThan(400);
  });
});
