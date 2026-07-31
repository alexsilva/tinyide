import { describe, expect, it } from "vitest";
import { classifyOpenedDirectory, projectHistoryInternals } from "./project-history";

describe("project history", () => {
  it("classifies common project roots", () => {
    expect(classifyOpenedDirectory([{ name: "package.json", path: "package.json", kind: "file" }])).toBe("project");
    expect(classifyOpenedDirectory([{ name: "docs", path: "docs", kind: "directory" }])).toBe("directory");
  });

  it("normalizes and orders recent entries", () => {
    expect(projectHistoryInternals.normalizeRecentProjects([
      { id: "old", name: "Old", kind: "project", lastOpenedAt: 1 },
      { id: "new", name: "New", kind: "directory", lastOpenedAt: 2 },
      { id: "bad", name: "Bad", kind: "other", lastOpenedAt: 3 },
    ])).toEqual([
      { id: "new", name: "New", kind: "directory", lastOpenedAt: 2 },
      { id: "old", name: "Old", kind: "project", lastOpenedAt: 1 },
    ]);
  });
});
