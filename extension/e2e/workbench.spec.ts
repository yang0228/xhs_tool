import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { test, expect } from "./fixtures";
import { getExtensionId, openSidePanel } from "./helpers";

test("personal creation loop includes evidence, real Canvas, ZIP, snapshot and review", async ({
  context,
}) => {
  const page = await openSidePanel(context, await getExtensionId(context));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "读取创作档案" }).click();
  await page.getByLabel("内容定位", { exact: true }).fill("分享个人效率实践");
  await page
    .getByLabel("语气与风格", { exact: true })
    .fill("简洁、真诚，不夸大");
  await page.getByRole("button", { name: "保存创作档案" }).click();
  await expect(page.getByText("创作档案已加密保存")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "允许 RAG 保存所选素材的明文副本" })
    .check();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "采集", exact: true })
    .click();
  await page.getByRole("button", { name: "手动粘贴" }).click();
  await page.getByLabel("素材标题", { exact: true }).fill("我的清单实践");
  await page
    .getByLabel("素材正文", { exact: true })
    .fill(
      "我会先写清单，安排执行时间，再记录完成情况。这是个人实践，不代表所有人的结果。",
    );
  await page.getByRole("button", { name: "保存素材", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "前往素材库", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "创作", exact: true })
    .click();
  await page.getByRole("link", { name: "新建", exact: true }).click();
  await page.getByLabel("创作状态", { exact: true }).selectOption("idea");
  await page.locator("#draft-title").fill("清单怎样帮助我安排一天");
  await page.getByText("填写单篇简报", { exact: true }).click();
  await page
    .getByLabel("核心观点", { exact: true })
    .fill("以自己的执行记录作为依据");
  await page.getByRole("button", { name: "使用个人风格" }).click();
  await expect(page.getByText(/已采用风格快照/)).toBeVisible();
  await page.getByPlaceholder("输入标签，回车添加").fill("效率");
  await page.getByPlaceholder("输入标签，回车添加").press("Enter");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^已保存$/ }),
  ).toBeVisible();
  await expect(page.locator("#draft-content")).toHaveValue("");
  await page.getByRole("button", { name: "生成带引用正文" }).click();
  await expect(
    page.getByRole("button", { name: "采用带引用建议" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "采用带引用建议" }).click();
  await expect(page.locator("#draft-content")).toHaveValue(/清单.*\[1\]/);
  await page.getByLabel("创作状态", { exact: true }).selectOption("ready");
  await page
    .getByRole("button", { name: "从当前标题和正文生成", exact: true })
    .click();
  await expect(page.getByLabel("第 1 页标题", { exact: true })).toHaveValue(
    "清单怎样帮助我安排一天",
  );
  await page.getByRole("button", { name: "生成预览", exact: true }).click();
  await expect(page.getByAltText("第 1 页卡片预览")).toBeVisible();
  await expect(page.getByAltText("第 2 页卡片预览")).toBeVisible();
  await page
    .getByAltText("第 1 页卡片预览")
    .screenshot({ path: "/tmp/xhs-workbench-cover.png" });
  await page
    .getByAltText("第 2 页卡片预览")
    .screenshot({ path: "/tmp/xhs-workbench-body.png" });
  await page.screenshot({
    path: "/tmp/xhs-workbench-editor-390.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "准备发布 →", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "我已逐条核对本篇素材引用" })
    .check();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整发布包 ZIP", exact: true })
    .click();
  const zipped = await download;
  await zipped.saveAs("/tmp/xhs-workbench-publication.zip");
  const files = unzipSync(readFileSync("/tmp/xhs-workbench-publication.zip"));
  expect(strFromU8(files["title.txt"])).toBe("清单怎样帮助我安排一天");
  expect(strFromU8(files["sources.md"])).toContain("我的清单实践");
  expect(Array.from(files["01.png"].slice(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  expect(files["02.png"].byteLength).toBeGreaterThan(1000);
  const publishedAt = await page.evaluate(() => {
    const d = new Date(Date.now() - 25 * 3600000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  await page.getByLabel("实际发布时间", { exact: true }).fill(publishedAt);
  await page
    .getByLabel("已发布链接", { exact: true })
    .fill("https://xhslink.com/a/workbench");
  await page.getByRole("button", { name: "记录发布", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看发布快照", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看发布快照", exact: true }).click();
  await expect(page.getByText("发布时素材依据", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "数据复盘", exact: true }).click();
  await page.getByLabel("阅读", { exact: true }).fill("100");
  const observed = await page.evaluate(() => {
    const d = new Date(Date.now() - 3600000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  await page
    .getByLabel("数据观察时间（留空为现在）", { exact: true })
    .fill(observed);
  await page.getByRole("button", { name: "保存本次数据", exact: true }).click();
  await expect(page.getByLabel("阅读", { exact: true })).toHaveValue("100");
  await page.getByText("从 CSV 导入指标", { exact: true }).click();
  const observedIso = await page.evaluate(
    (value) =>
      new Date(new Date(value).getTime() + 24 * 3600000 + 120000).toISOString(),
    publishedAt,
  );
  await page
    .getByLabel("CSV 内容", { exact: true })
    .fill(
      "xhs_post_url,collected_at,view_count,like_count,comment_count,share_count,collect_count\nhttps://xhslink.com/a/workbench," +
        observedIso +
        ",120,6,2,1,3",
    );
  await page
    .getByRole("button", { name: "预览并校验 CSV", exact: true })
    .click();
  await expect(
    page.getByText("通过 1 行 · 错误 0 行 · 重复 0 行", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认导入 CSV", exact: true }).click();
  await expect(
    page.getByText("已导入 1 条，跳过 0 条重复记录", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "生成复盘建议", exact: true }).click();
  await expect(page.getByText("清单的进阶实践", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "/tmp/xhs-workbench-review-wide.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("link", { name: "转为新选题", exact: true }).click();
  await expect(page.locator("#draft-title")).toHaveValue("清单的进阶实践");
  await expect(page.getByLabel("创作状态", { exact: true })).toHaveValue(
    "idea",
  );
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^已保存$/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "全部草稿", exact: true }).click();
  const published = page
    .locator("article")
    .filter({ hasText: "清单怎样帮助我安排一天" });
  await published.getByRole("button", { name: "删除", exact: true }).click();
  await published
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(1);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "发布", exact: true })
    .click();
  await page.getByRole("button", { name: "查看发布快照", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "清单怎样帮助我安排一天", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "预览历史图文", exact: true }).click();
  await expect(
    page.getByAltText("发布时图文 1", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("publication originals remain ordered and downloadable after deleting the draft", async ({
  context,
}) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await context.route("https://images.test/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      body: png,
    }),
  );
  await context.route("http://localhost:8000/api/images**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("download-url")
      ? { download_url: "https://images.test/" + path.split("/").at(-2) }
      : {
          items: ["first", "second"].map((id) => ({
            id,
            user_id: "test-user",
            original_filename: id + ".png",
            mime_type: "image/png",
            created_at: new Date().toISOString(),
          })),
          total: 2,
          page: 1,
        };
    return route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(data),
    });
  });
  const page = await openSidePanel(context, await getExtensionId(context));
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "创作", exact: true })
    .click();
  await page.getByRole("link", { name: "新建", exact: true }).click();
  await page.getByLabel("创作状态", { exact: true }).selectOption("idea");
  await page.locator("#draft-title").fill("保留两张原图");
  await page.locator("#draft-content").fill("发布时的图片应当按顺序保留。");
  await page.getByRole("button", { name: "选择配图", exact: true }).click();
  await page
    .getByRole("button", { name: "选择图片 second.png", exact: true })
    .click();
  await page
    .getByRole("button", { name: "选择图片 first.png", exact: true })
    .click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^已保存$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "准备发布 →", exact: true }).click();
  await page
    .getByLabel("已发布链接", { exact: true })
    .fill("https://xhslink.com/a/originals");
  await page.getByRole("button", { name: "记录发布", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看发布快照", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "创作", exact: true })
    .click();
  const published = page.locator("article").filter({ hasText: "保留两张原图" });
  await published.getByRole("button", { name: "删除", exact: true }).click();
  await published
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "发布", exact: true })
    .click();
  await page.getByRole("button", { name: "查看发布快照", exact: true }).click();
  const signatures: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/download-url"))
      signatures.push(new URL(request.url()).pathname);
  });
  await page.getByRole("button", { name: "查看发布原图", exact: true }).click();
  await expect(page.getByAltText("发布原图 2", { exact: true })).toBeVisible();
  expect(signatures).toEqual([
    "/api/images/second/download-url",
    "/api/images/first/download-url",
  ]);
  expect(
    await page
      .getByAltText("发布原图 1", { exact: true })
      .evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth === 1,
      ),
  ).toBe(true);
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载原图 2", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("original-02.png");
  expect(readFileSync((await download.path())!)).toEqual(png);
});
