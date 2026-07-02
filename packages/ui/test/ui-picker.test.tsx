/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("ui.sh picker scaffolding", () => {
  it("exposes the approved picker decision points with one visible option each", () => {
    const { container } = render(<App />);
    const picks = [...container.querySelectorAll("[data-uidotsh-pick]")];

    expect(picks.map((pick) => pick.getAttribute("data-uidotsh-pick"))).toStrictEqual([
      "Status strip treatment",
      "Queue density",
      "Right rail treatment"
    ]);

    for (const pick of picks) {
      const options = [...pick.querySelectorAll("[data-uidotsh-option]")];
      expect(options).toHaveLength(3);
      expect(options.filter((option) => !option.hasAttribute("hidden"))).toHaveLength(1);
      expect(options.every((option) => option.classList.contains("contents"))).toBe(true);
    }
  });

  it("injects the ui.sh picker toolbar once in the Vite root document", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html.match(/https:\/\/ui\.sh\/ui-picker\.js/g)).toHaveLength(1);
  });
});
