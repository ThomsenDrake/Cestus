import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readStaticUiFile } from "../src/static-files.js";

let dir: string | undefined;

afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("readStaticUiFile", () => {
  it("serves index.html for the app root", () => {
    dir = mkdtempSync(join(tmpdir(), "cestus-static-"));
    writeFileSync(join(dir, "index.html"), "<main>Cestus</main>");

    const response = readStaticUiFile(dir, "/");

    expect(response).toEqual({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: Buffer.from("<main>Cestus</main>")
    });
  });

  it("serves asset JS with a stable content type", () => {
    dir = mkdtempSync(join(tmpdir(), "cestus-static-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets/app.js"), "console.log('ok');");

    const response = readStaticUiFile(dir, "/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.contentType).toBe("text/javascript; charset=utf-8");
    expect(response.body.toString("utf8")).toBe("console.log('ok');");
  });

  it("blocks path traversal", () => {
    dir = mkdtempSync(join(tmpdir(), "cestus-static-"));
    writeFileSync(join(dir, "index.html"), "<main>Cestus</main>");

    expect(readStaticUiFile(dir, "/../package.json")).toEqual({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: Buffer.from("Not found")
    });
  });
});
