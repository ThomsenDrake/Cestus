import { describe, expect, it } from "vitest";
import { ingestionMediaTypeForPath } from "../src/media-type.js";

describe("ingestionMediaTypeForPath", () => {
  it.each([
    ["record.json", "application/json"],
    ["notes.md", "text/markdown"],
    ["notes.markdown", "text/markdown"],
    ["record.yaml", "application/yaml"],
    ["record.yml", "application/yaml"],
    ["rows.csv", "text/csv"],
    ["notes.txt", "text/plain"],
    ["page.html", "text/html"],
    ["page.htm", "text/html"],
    ["source.pdf", "application/pdf"],
    ["opaque.bin", "application/octet-stream"]
  ])("classifies %s as %s", (sourcePath, expectedMediaType) => {
    expect(ingestionMediaTypeForPath(sourcePath)).toBe(expectedMediaType);
  });
});
