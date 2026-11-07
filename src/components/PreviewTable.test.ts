import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PreviewTable } from "./PreviewTable";

function render(props: Partial<Parameters<typeof PreviewTable>[0]> = {}) {
  return renderToStaticMarkup(createElement(PreviewTable, {
    columns: ["Name", "Amount"],
    rows: [["Alpha", "10"], ["Beta", "2"]],
    query: "",
    ariaLabel: "Data",
    ...props,
  }));
}

describe("preview table", () => {
  it("renders the summary, headers and rows", () => {
    const html = render();
    expect(html).toContain("2 of 2 rows");
    expect(html).toContain("2 columns");
    expect(html).toContain("Name");
    expect(html).toContain("Amount");
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain("Filter Name");
  });

  it("shows the no-match state", () => {
    expect(render({ query: "missing" })).toContain("No rows match the filters.");
  });

  it("shows the empty state", () => {
    expect(render({ rows: [] })).toContain("This table has no data rows.");
  });
});
