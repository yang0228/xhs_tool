import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import Analytics from "../../src/sidepanel/pages/Analytics";
let saved: any;
beforeEach(() => {
  saved = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      if (init?.method === "POST") {
        saved = JSON.parse(init.body);
        return Response.json(saved);
      }
      return Response.json({
        posts: [
          {
            post_id: "p1",
            published_at: "2026-09-25T10:00:00Z",
            xhs_post_url: "https://www.xiaohongshu.com/explore/test",
            latest: {
              view_count: 120,
              like_count: 8,
              comment_count: 3,
              collect_count: 6,
              share_count: 2,
            },
            history: [],
          },
        ],
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows recorded metrics and saves a new measurement", async () => {
  render(<Analytics />);
  await screen.findByDisplayValue(120);
  expect(screen.getByText("120")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("阅读"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "保存本次数据" }));
  await waitFor(() =>
    expect(saved).toEqual({
      view_count: 200,
      like_count: 8,
      comment_count: 3,
      collect_count: 6,
      share_count: 2,
    }),
  );
});
it("rejects negative metrics without submitting them", async () => {
  render(<Analytics />);
  await screen.findByDisplayValue(120);
  fireEvent.change(screen.getByLabelText("阅读"), { target: { value: "-1" } });
  fireEvent.click(screen.getByRole("button", { name: "保存本次数据" }));
  await screen.findByRole("alert");
  expect(saved).toBeNull();
});
