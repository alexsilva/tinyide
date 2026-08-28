import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("desktop package includes plugin root icons", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  expect(packageJson.build.files).toContain("plugins/*/icon.*");
});

test("desktop package never includes plugin node_modules and ships MCP Server only from dist", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  expect(packageJson.build.files).toContain("!plugins/*/node_modules/**/*");
  expect(packageJson.build.files).toContain("!plugins/mcp-server/src/**/*");
  expect(packageJson.build.files).toContain("plugins/*/dist/**/*");
});

test("desktop package disables Node debugging entry points", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  expect(packageJson.build.electronFuses).toMatchObject({
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    grantFileProtocolExtraPrivileges: false,
  });
  expect(packageJson.build.files).toContain("!**/*.map");
});
