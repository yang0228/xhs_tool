import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Layout from "../../src/sidepanel/components/Layout";

describe("Layout", () => {
  it("renders header with app name", () => {
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(screen.getByText("XHS Tool")).toBeInTheDocument();
  });

  it("renders NavBar", () => {
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(screen.getByText("抓取")).toBeInTheDocument();
  });

  it("renders main content area", () => {
    const { container } = render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(container.querySelector("main")).toBeInTheDocument();
  });
});
