import { test, expect } from "./fixtures";
import { getExtensionId, openSidePanel } from "./helpers";
test("real extension loads and navigation works at narrow width", async ({
  context,
}) => {
  const id = await getExtensionId(context);
  const page = await openSidePanel(context, id);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("button", { name: "抓取当前页面内容" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/xhs-tool-collection.png",
    fullPage: true,
  });
  for (const name of ["素材库", "创作", "发布", "采集"])
    await page
      .getByRole("navigation")
      .getByRole("link", { name, exact: true })
      .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
