import { describe, expect, it } from "vitest";
import {
  collectExternalFileCandidates,
  dataTransferHasExternalFiles,
  openDocumentFromExternalFile,
} from "./external-file-open";

function mockDataTransfer(files: File[]): DataTransfer {
  const items = files.map((file) => ({
    kind: "file" as const,
    type: file.type,
    getAsFile: () => file,
  }));
  return {
    files: files as unknown as FileList,
    items: items as unknown as DataTransferItemList,
    types: ["Files"],
    dropEffect: "none",
    effectAllowed: "all",
    getData: () => "",
    setData: () => undefined,
    clearData: () => undefined,
    setDragImage: () => undefined,
  } as DataTransfer;
}

describe("external-file-open", () => {
  it("detecta arquivos no DataTransfer", () => {
    const file = new File(["print(1)\n"], "script.py", { type: "text/x-python" });
    expect(dataTransferHasExternalFiles(mockDataTransfer([file]))).toBe(true);
    expect(dataTransferHasExternalFiles(mockDataTransfer([]))).toBe(false);
  });

  it("coleta candidatos e abre documento de texto externo", async () => {
    const file = new File(["print('hello')\n"], "hello.py", { type: "text/x-python" });
    const candidates = await collectExternalFileCandidates(
      mockDataTransfer([file]),
      () => "/tmp/hello.py",
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.absolutePath).toBe("/tmp/hello.py");

    const document = await openDocumentFromExternalFile(candidates[0]!);
    expect(document.name).toBe("hello.py");
    expect(document.path).toBe("/tmp/hello.py");
    expect(document.kind).toBe("text");
    expect(document.content).toContain("print");
  });
});
