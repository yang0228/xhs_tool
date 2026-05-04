import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  buildPublicationZip,
  paginateCards,
  renderCards,
  type CardDesign,
} from "../../../src/sidepanel/lib/cards";
import { chrome } from "../../mocks/chrome";

const identity = { backendUrl: "https://api.test/api", apiKey: "owner-key" };
const design: CardDesign = {
  template: "checklist",
  palette: "rose",
  source_signature: "source",
  pages: [
    { title: "封面", body: "" },
    { title: "正文", body: "第一段\n\n第二段" },
  ],
};

// Canvas pixels and image decoding need the real browser acceptance check. Here the
// drawing boundary is replaced; pagination, validation, fetch and ZIP stay real.
function installCanvas() {
  let serial = 0;
  const context = {
    measureText: (text: string) => ({
      width:
        [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text)]
          .length * 42,
    }),
    fillRect() {},
    fillText() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    strokeRect() {},
    drawImage() {},
    save() {},
    restore() {},
    rect() {},
    clip() {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    function (callback) {
      callback(new Blob([`png-${++serial}`], { type: "image/png" }));
    },
  );
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
  });
}

beforeEach(async () => {
  await chrome.storage.local.set({ settings: identity });
  installCanvas();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("card pagination", () => {
  it("keeps paragraphs, long words and whole emoji when a page fills", () => {
    const text =
      "开头\n\n" + "longword".repeat(60) + "👩🏽‍💻".repeat(10) + "\n结尾";
    const pages = paginateCards(
      "标题",
      text,
      (s) =>
        [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(s)]
          .length * 42,
    );
    expect(pages[0]).toEqual({ title: "标题", body: "" });
    expect(pages.length).toBeGreaterThan(2);
    expect(
      pages
        .slice(1)
        .map((p) => p.body)
        .join(""),
    ).toBe(text);
    for (const p of pages) {
      expect(p.body).not.toMatch(/^\u200d|\u200d$/);
      expect(p.body).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  it("honors explicit page breaks without printing the marker", () => {
    const pages = paginateCards(
      "标题",
      "甲\n\n乙\n<!-- pagebreak -->\n丙\f丁",
      () => 10,
    );
    expect(pages.map((p) => p.body)).toEqual(["", "甲\n\n乙", "丙", "丁"]);
  });

  it("rejects unrenderable graphemes instead of silently clipping them", () => {
    expect(() => paginateCards("标题", "字", () => 5000)).toThrow(/宽|容纳/);
  });
});

describe("card rendering safety", () => {
  it("waits for font readiness before returning PNGs", async () => {
    let ready!: () => void;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => {
          ready = resolve;
        }),
        load: () => Promise.resolve([]),
      },
    });
    let finished = false;
    const pending = renderCards(design).then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    ready();
    expect((await pending).map((b) => b.type)).toEqual([
      "image/png",
      "image/png",
    ]);
  });

  it("rejects overlong titles and manually overfilled pages", async () => {
    await expect(
      renderCards({
        ...design,
        pages: [{ title: "标题".repeat(200), body: "" }],
      }),
    ).rejects.toThrow(/第 1 页.*标题.*溢出/);
    await expect(
      renderCards({
        ...design,
        pages: [{ title: "短标题", body: "正文\n".repeat(100) }],
      }),
    ).rejects.toThrow(/第 1 页.*正文.*溢出/);
  });

  it("rejects failed image decoding after obtaining a fresh authorized URL", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.startsWith(identity.backendUrl)
        ? Response.json({ download_url: "https://images.test/fresh" })
        : new Response(new Uint8Array([1, 2]), {
            headers: { "Content-Type": "image/png" },
          }),
    );
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("broken image");
    });
    await expect(
      renderCards(
        {
          ...design,
          pages: [{ title: "封面", body: "", image_id: "picture" }],
        },
        identity,
      ),
    ).rejects.toThrow(/图片.*(解码|加载)/);
  });

  it("does not export when a requested font fails to load", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        load: () => Promise.reject(new Error("font network failure")),
      },
    });
    await expect(renderCards(design)).rejects.toThrow(/字体加载失败/);
  });
});

describe("publication ZIP", () => {
  it("freezes UTF-8 text, source snapshots, ordered cards and unembedded originals", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === identity.backendUrl + "/images/selected/download-url")
        return Response.json({ download_url: "https://images.test/selected" });
      if (url === "https://images.test/selected")
        return new Response("original", {
          headers: { "Content-Type": "image/jpeg" },
        });
      throw new Error("unexpected URL " + url);
    });
    const blob = await buildPublicationZip(
      {
        title: "有依据的标题",
        content: "正文 👩🏽‍💻",
        image_ids: ["selected", "selected"],
        context: {
          cards: design,
          references: [
            {
              title: "资料",
              url: "https://example.test/source",
              content: "原始摘录",
            },
          ],
        },
      },
      identity,
    );
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual([
      "title.txt",
      "content.txt",
      "sources.md",
      "01.png",
      "02.png",
      "03.jpg",
    ]);
    expect(strFromU8(files["title.txt"])).toBe("有依据的标题");
    expect(strFromU8(files["content.txt"])).toBe("正文 👩🏽‍💻");
    expect(strFromU8(files["sources.md"])).toContain("原始摘录");
    expect(strFromU8(files["sources.md"])).toContain(
      "https://example.test/source",
    );
    expect(strFromU8(files["01.png"])).toBe("png-1");
    expect(strFromU8(files["02.png"])).toBe("png-2");
    expect(strFromU8(files["03.jpg"])).toBe("original");
  });

  it("does not return a partial archive when a later image fails twice", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.startsWith(identity.backendUrl))
        return Response.json({
          download_url:
            "https://images.test/" + (url.includes("good") ? "good" : "bad"),
        });
      return url.endsWith("good")
        ? new Response("image", { headers: { "Content-Type": "image/png" } })
        : new Response("expired", { status: 403 });
    });
    await expect(
      buildPublicationZip(
        { title: "标题", content: "正文", image_ids: ["good", "bad"] },
        identity,
      ),
    ).rejects.toThrow(/图片.*下载/);
  });

  it("refreshes an expired signed URL once and includes the recovered image", async () => {
    let signatures = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.startsWith(identity.backendUrl))
        return Response.json({
          download_url: `https://images.test/${++signatures}`,
        });
      return url.endsWith("/1")
        ? new Response("expired", { status: 403 })
        : new Response("recovered", {
            headers: { "Content-Type": "image/webp" },
          });
    });
    const result = await buildPublicationZip(
      { title: "标题", content: "正文", image_ids: ["image"] },
      identity,
    );
    expect(
      strFromU8(
        unzipSync(new Uint8Array(await result.arrayBuffer()))["01.webp"],
      ),
    ).toBe("recovered");
  });

  it("rejects an oversized download before consuming its body", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.startsWith(identity.backendUrl)
        ? Response.json({ download_url: "https://images.test/huge" })
        : new Response("tiny body", {
            headers: {
              "Content-Type": "image/png",
              "Content-Length": String(101 * 1024 * 1024),
            },
          }),
    );
    await expect(
      buildPublicationZip(
        { title: "标题", content: "正文", image_ids: ["huge"] },
        identity,
      ),
    ).rejects.toThrow(/100 MB/);
  });

  it("counts the text files toward the shared download budget", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.startsWith(identity.backendUrl)
        ? Response.json({ download_url: "https://images.test/almost-limit" })
        : new Response("small actual payload", {
            headers: {
              "Content-Type": "image/png",
              "Content-Length": String(99 * 1024 * 1024),
            },
          }),
    );
    await expect(
      buildPublicationZip(
        {
          title: "标题",
          content: "a".repeat(2 * 1024 * 1024),
          image_ids: ["almost"],
        },
        identity,
      ),
    ).rejects.toThrow(/100 MB/);
  });

  it("rejects an oversized streamed image even without a Content-Length header", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.startsWith(identity.backendUrl))
        return Response.json({ download_url: "https://images.test/stream" });
      let sent = 0;
      const chunk = new Uint8Array(2 * 1024 * 1024);
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (sent++ < 51) controller.enqueue(chunk);
            else controller.close();
          },
        }),
        { headers: { "Content-Type": "image/png" } },
      );
    });
    await expect(
      buildPublicationZip(
        { title: "标题", content: "正文", image_ids: ["stream"] },
        identity,
      ),
    ).rejects.toThrow(/100 MB/);
  });

  it("omits the original once it is embedded into a numbered card", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.startsWith(identity.backendUrl)
        ? Response.json({ download_url: "https://images.test/picture" })
        : new Response("original", {
            headers: { "Content-Type": "image/jpeg" },
          }),
    );
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 300,
      height: 200,
      close() {},
    }));
    const blob = await buildPublicationZip(
      {
        title: "标题",
        content: "正文",
        image_ids: ["picture"],
        context: {
          cards: {
            ...design,
            pages: [{ title: "封面", body: "", image_id: "picture" }],
          },
        },
      },
      identity,
    );
    expect(
      Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))),
    ).toEqual(["title.txt", "content.txt", "sources.md", "01.png"]);
  });

  it("keeps the clicked document version if its object changes during export", async () => {
    const doc = {
      title: "点击时的标题",
      content: "点击时的正文",
      image_ids: ["picture"],
    };
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.startsWith(identity.backendUrl)) {
        await gate;
        return Response.json({ download_url: "https://images.test/picture" });
      }
      return new Response("original", {
        headers: { "Content-Type": "image/png" },
      });
    });
    const pending = buildPublicationZip(doc, identity);
    doc.title = "导出后的修改";
    doc.content = "新正文";
    resume();
    const files = unzipSync(
      new Uint8Array(await (await pending).arrayBuffer()),
    );
    expect(strFromU8(files["title.txt"])).toBe("点击时的标题");
    expect(strFromU8(files["content.txt"])).toBe("点击时的正文");
  });

  it("blocks an export after the selected account changes", async () => {
    await chrome.storage.local.set({
      settings: { ...identity, apiKey: "another-owner" },
    });
    vi.stubGlobal("fetch", async (url: string) =>
      url.startsWith(identity.backendUrl)
        ? Response.json({ download_url: "https://images.test/picture" })
        : new Response("image", { headers: { "Content-Type": "image/png" } }),
    );
    await expect(
      buildPublicationZip(
        { title: "标题", content: "正文", image_ids: ["picture"] },
        identity,
      ),
    ).rejects.toThrow(/账户或后端已切换/);
  });
});
