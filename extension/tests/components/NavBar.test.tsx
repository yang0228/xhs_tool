import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NavBar from "../../src/sidepanel/components/NavBar";
describe("creator navigation", () => {
  it("links collection, library, creation and publishing to their routes", () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    );
    for (const [name, path] of [
      ["采集", "/scrape"],
      ["素材库", "/materials"],
      ["创作", "/drafts"],
      ["发布", "/publish"],
    ])
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", path);
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });
  it("keeps the library selected on the image subpage", () => {
    render(
      <MemoryRouter initialEntries={["/images"]}>
        <NavBar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "素材库" })).toHaveClass("active");
  });
});
