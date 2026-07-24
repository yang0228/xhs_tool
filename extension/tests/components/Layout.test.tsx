import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "../../src/sidepanel/components/Layout";
import { PageHeading } from "../../src/sidepanel/components/UI";

describe("Layout", () => {
  it("keeps the settings and standalone view controls in the page heading", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<PageHeading eyebrow="COLLECT / 采集" title="采集" />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "在独立标签页打开" })).toBeInTheDocument();
  });

  it("renders NavBar", () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "采集" })).toBeInTheDocument();
  });

  it("renders main content area", () => {
    const { container } = render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );
    expect(container.querySelector("main")).toBeInTheDocument();
  });

});
