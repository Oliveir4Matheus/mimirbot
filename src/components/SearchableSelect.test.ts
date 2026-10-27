import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchableSelect, filterOptions } from "./SearchableSelect";

const options = [
  { value: "", label: "General" },
  { value: "legal", label: "Jurídico" },
  { value: "finance", label: "Finance" },
  { value: "ops", label: "Operações" },
];

describe("filterOptions", () => {
  it("returns every option for an empty or blank search", () => {
    expect(filterOptions(options, "")).toEqual(options);
    expect(filterOptions(options, "   ")).toEqual(options);
  });

  it("matches without regard to case or accents", () => {
    expect(filterOptions(options, "juri").map((option) => option.value)).toEqual(["legal"]);
    expect(filterOptions(options, "OPERACOES").map((option) => option.value)).toEqual(["ops"]);
    expect(filterOptions(options, "fin").map((option) => option.value)).toEqual(["finance"]);
  });

  it("matches anywhere in the label and can match nothing", () => {
    expect(filterOptions(options, "ral").map((option) => option.value)).toEqual([""]);
    expect(filterOptions(options, "zzz")).toEqual([]);
  });

  it("returns a copy, never the caller's array", () => {
    expect(filterOptions(options, "")).not.toBe(options);
  });
});

describe("SearchableSelect", () => {
  const render = (value: string) => renderToStaticMarkup(createElement(SearchableSelect, {
    value, options, onChange: () => {}, ariaLabel: "Department", searchLabel: "Search departments", emptyLabel: "None found",
  }));

  it("shows the chosen option on a closed trigger and keeps the list unmounted", () => {
    const html = render("legal");
    expect(html).toContain("Jurídico");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="listbox"');
  });

  it("shows the empty-valued option too (General)", () => {
    expect(render("")).toContain("General");
  });
});
