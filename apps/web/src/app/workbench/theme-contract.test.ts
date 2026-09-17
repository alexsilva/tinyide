import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WORKBENCH_THEME_CSS_VARIABLES } from "@tinyide/plugin-api";

// Metade do host no contrato de tema: cada token público precisa de um valor
// padrão no foundation.css (os temas nativos já são cobertos por tipos e por
// modules/themes). A outra metade — superfícies consumindo os tokens em vez de
// cores literais — é testada por cada plugin no próprio test/theme.test.js.
describe("workbench theme contract", () => {
  it("declara valor padrão de cada token público no foundation.css", () => {
    const stylesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../styles");
    const foundation = readFileSync(resolve(stylesDirectory, "foundation.css"), "utf8");
    const rootStart = foundation.indexOf(":root {");
    expect(rootStart).toBeGreaterThanOrEqual(0);
    const rootBlock = foundation.slice(rootStart, foundation.indexOf("}", rootStart));
    for (const cssVariable of Object.values(WORKBENCH_THEME_CSS_VARIABLES)) {
      expect(rootBlock, cssVariable).toMatch(new RegExp(`${cssVariable}\\s*:`));
    }
  });
});
