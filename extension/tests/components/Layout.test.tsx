import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Layout from "../../src/sidepanel/components/Layout";
import { PageHeading } from "../../src/sidepanel/components/UI";

function CurrentRoute() {
  const { pathname, search, hash, state } = useLocation();
  return <output data-testid="route">{JSON.stringify({ pathname, search, hash, state })}</output>;
}

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

  it.each(["/scrape", "/materials", "/drafts/new"])(
    "returns from settings to %s with the original route state",
    (pathname) => {
      render(
        <MemoryRouter initialEntries={[{
          pathname,
          search: "?view=recent",
          hash: "#details",
          state: { seed: { status: "idea" } },
        }]}>
          <PageHeading title="当前页面" />
          <CurrentRoute />
        </MemoryRouter>,
      );
      const original = screen.getByTestId("route").textContent;
      fireEvent.click(screen.getByRole("link", { name: "设置" }));
      expect(screen.getByTestId("route")).toHaveTextContent('"pathname":"/settings"');
      fireEvent.click(screen.getByRole("link", { name: "设置" }));
      expect(screen.getByTestId("route").textContent).toBe(original);
    },
  );

  it("returns to collection when settings was opened directly", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PageHeading title="设置" />
        <CurrentRoute />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "设置" }));
    expect(screen.getByTestId("route")).toHaveTextContent('"pathname":"/scrape"');
  });
});
