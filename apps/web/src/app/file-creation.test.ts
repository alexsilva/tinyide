import { describe, expect, it } from "vitest";
import {
  ensureFileCreationExtension,
  fileCreationOptions,
  nextUntitledFileName,
  TEXT_FILE_CREATION_OPTION,
} from "./file-creation";

describe("file creation", () => {
  it("keeps text as the core type and appends active plugin types", () => {
    const python = { id: "python", label: "Arquivo Python", extension: ".py" as const };
    expect(fileCreationOptions([])).toEqual([TEXT_FILE_CREATION_OPTION]);
    expect(fileCreationOptions([python])).toEqual([TEXT_FILE_CREATION_OPTION, python]);
  });

  it("uses txt for generic untitled documents", () => {
    expect(nextUntitledFileName([])).toBe("sem-titulo.txt");
    expect(nextUntitledFileName(["sem-titulo.txt"])).toBe("sem-titulo-2.txt");
  });

  it("uses only the explicitly selected plugin extension", () => {
    expect(nextUntitledFileName([], ".py")).toBe("sem-titulo.py");
    expect(nextUntitledFileName(["sem-titulo.py"], ".py")).toBe("sem-titulo-2.py");
  });

  it("adds a required extension without duplicating it", () => {
    expect(ensureFileCreationExtension("main", ".py")).toBe("main.py");
    expect(ensureFileCreationExtension("MAIN.PY", ".py")).toBe("MAIN.PY");
  });
});
