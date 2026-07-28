import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("desktop package includes plugin root icons", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  expect(packageJson.build.files).toContain("plugins/*/icon.*");
});
