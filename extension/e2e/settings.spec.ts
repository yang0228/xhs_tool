import { test, expect } from "./fixtures";
import { getExtensionId, openSidePanel } from "./helpers";
test("persists settings and verifies the selected identity", async ({
  context,
}) => {
  const page = await openSidePanel(context, await getExtensionId(context));
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue(
    "test-key",
  );
  await page.getByRole("button", { name: "测试连接与身份" }).click();
  await expect(page.getByRole("status")).toContainText("身份验证通过");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByRole("status")).toContainText("设置已保存");
  await page.screenshot({ path: "/tmp/xhs-tool-settings.png", fullPage: true });
});
