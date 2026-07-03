/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("ui.sh picker scaffolding", () => {
  it("does not expose a remaining picker decision point in the React workspace", () => {
    const { container } = render(<App />);
    const picks = [...container.querySelectorAll("[data-uidotsh-pick]")];

    expect(picks).toHaveLength(0);
  });

  it("injects the ui.sh picker toolbar once in the Vite root document", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html.match(/https:\/\/ui\.sh\/ui-picker\.js/g)).toHaveLength(1);
  });
});
