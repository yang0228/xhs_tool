import { zipSync, strToU8 } from "fflate";
import { apiGet, assertIdentity, type ApiIdentity } from "./api";

export type CardTemplate = "checklist" | "steps";
export type CardPage = { title: string; body: string; image_id?: string };
export type CardDesign = {
  template: CardTemplate;
  palette: "rose" | "ink" | "sage";
  pages: CardPage[];
  source_signature: string;
};
export type PublicationDocument = {
  title: string;
  content: string;
  image_ids: string[];
  context?: {
    references?: Array<{ title: string; url?: string | null; content: string }>;
    cards?: CardDesign;
  };
};

const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_CARD_PAGES = 100;
const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const BODY_FONT = `42px ${FONT}`;
const BODY_WIDTH = 800;
const BODY_LINES = 14;
const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
const colors = {
  rose: {
    background: "#fff7f2",
    ink: "#422932",
    accent: "#b73c58",
    soft: "#f5dfdc",
  },
  ink: {
    background: "#f4f4ef",
    ink: "#222c3b",
    accent: "#36577e",
    soft: "#dce4eb",
  },
  sage: {
    background: "#f4f7ef",
    ink: "#293c31",
    accent: "#49745b",
    soft: "#dce8d7",
  },
};
const imageExtensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function canvasContext(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器无法创建画布，请使用支持 Canvas 的浏览器。");
  return [canvas, ctx];
}

// Each line retains its original characters, including paragraph newlines, so
// rejoining a paginated body never loses punctuation, spaces or emoji clusters.
function wrap(
  text: string,
  measure: (text: string) => number,
  width: number,
): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let line = "";
  for (const { segment } of segmenter.segment(text)) {
    if (segment === "\n") {
      lines.push(line + "\n");
      line = "";
    } else {
      if (measure(segment) > width)
        throw new Error("单个字符过宽，当前卡片无法容纳。");
      if (line && measure(line + segment) > width) {
        lines.push(line);
        line = "";
      }
      line += segment;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function cardSourceSignature(
  title: string,
  content: string,
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([title, content])),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function paginateCards(
  title: string,
  content: string,
  measure?: (text: string) => number,
): CardPage[] {
  if (!title.trim()) throw new Error("请先填写标题。");
  if (!content.trim()) throw new Error("请先填写正文。");
  if (!measure) {
    const [, ctx] = canvasContext();
    ctx.font = BODY_FONT;
    measure = (text) => ctx.measureText(text).width;
  }
  const pages: CardPage[] = [{ title, body: "" }];
  const sections = content
    .replace(/\r\n?/g, "\n")
    .split(/\n?<!--\s*pagebreak\s*-->\n?|\f/);
  for (const section of sections) {
    const lines = wrap(section, measure, BODY_WIDTH);
    for (let i = 0; i < lines.length; i += BODY_LINES) {
      if (pages.length >= MAX_CARD_PAGES)
        throw new Error(
          "图文卡片最多 100 页，请将正文拆成多篇；原文未被截断。",
        );
      pages.push({
        title: `正文 ${pages.length}`,
        body: lines.slice(i, i + BODY_LINES).join(""),
      });
    }
  }
  return pages;
}

async function readyFonts(): Promise<void> {
  if (!document.fonts)
    throw new Error("无法等待字体加载，请更新浏览器后重试。");
  try {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load(BODY_FONT),
      document.fonts.load(`700 84px ${FONT}`),
      document.fonts.load(`700 58px ${FONT}`),
    ]);
  } catch {
    throw new Error("字体加载失败，请重试后再导出。");
  }
}

function checkSize(size: number): void {
  if (size > MAX_BYTES)
    throw new Error("发布包文件总大小超过 100 MB，请减少图片或卡片。");
}

export async function downloadImage(
  id: string,
  identity?: ApiIdentity,
  remaining = MAX_BYTES,
): Promise<Blob> {
  // A failed signed URL is never persisted. Ask the authorized API for a new URL
  // on each export, and refresh once if the object store says it has expired.
  for (let attempt = 0; attempt < 2; attempt++) {
    const signed = await apiGet<{ download_url: string }>(
      `/images/${encodeURIComponent(id)}/download-url`,
      undefined,
      identity,
    );
    if (!/^https?:\/\//i.test(signed.download_url))
      throw new Error("图片下载地址无效。");
    let response: Response;
    try {
      response = await fetch(signed.download_url, {
        mode: "cors",
        credentials: "omit",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("图片下载失败，请检查网络和图片跨域授权后重试。");
    }
    if (!response.ok) {
      if (attempt === 0 && (response.status === 401 || response.status === 403))
        continue;
      throw new Error(`图片下载失败 (${response.status})，未生成发布包。`);
    }
    const mime =
      response.headers
        .get("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() || "";
    if (!imageExtensions[mime])
      throw new Error("图片下载类型不受支持，仅支持 PNG、JPEG、WebP、GIF。");
    const declaredSize = Number(response.headers.get("Content-Length"));
    checkSize(
      MAX_BYTES -
        remaining +
        (Number.isFinite(declaredSize) ? declaredSize : 0),
    );
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    if (!response.body) throw new Error("图片下载失败，响应为空。");
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        checkSize(MAX_BYTES - remaining + size);
        chunks.push(new Uint8Array(value));
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (!size) throw new Error("图片下载失败，文件为空。");
    if (identity) await assertIdentity(identity);
    return new Blob(chunks, { type: mime });
  }
  throw new Error("图片下载失败，请重试。");
}

async function decodeImage(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => {},
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    throw new Error("图片解码失败，请更换配图后重试。");
  }
}

function paintText(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
): void {
  lines.forEach((line, i) =>
    ctx.fillText(line.replace(/\n$/, ""), x, y + i * lineHeight),
  );
}

export async function renderCards(
  design: CardDesign,
  identity?: ApiIdentity,
): Promise<Blob[]> {
  const frozen = structuredClone(design);
  if (
    !frozen.pages?.length ||
    !colors[frozen.palette] ||
    !["checklist", "steps"].includes(frozen.template)
  )
    throw new Error("卡片参数无效，请重新生成。");
  await readyFonts();
  const blobs: Blob[] = [];
  const images = new Map<string, Blob>();
  let total = 0;
  for (const [index, page] of frozen.pages.entries()) {
    const [canvas, ctx] = canvasContext();
    const palette = colors[frozen.palette];
    const cover = index === 0;
    const lineHeight = cover ? 112 : 80;
    const titleY = cover ? 260 : 190;
    ctx.font = `700 ${cover ? 84 : 58}px ${FONT}`;
    const titleLines = wrap(
      page.title.replace(/\r\n?/g, "\n"),
      (t) => ctx.measureText(t).width,
      888,
    );
    if (titleLines.length > (cover ? (page.image_id ? 4 : 7) : 2))
      throw new Error(`第 ${index + 1} 页标题溢出，请缩短或拆分标题。`);
    const bodyY = titleY + titleLines.length * lineHeight + 48;
    const bodyBottom = page.image_id ? 890 : 1260;
    ctx.font = BODY_FONT;
    const bodyLines = wrap(
      page.body.replace(/\r\n?/g, "\n"),
      (t) => ctx.measureText(t).width,
      BODY_WIDTH,
    );
    if (
      bodyLines.length &&
      bodyY + (bodyLines.length - 1) * 60 + 52 > bodyBottom
    )
      throw new Error(`第 ${index + 1} 页正文溢出，请拆页或减少文字。`);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, 1080, 1440);
    ctx.textBaseline = "top";
    ctx.fillStyle = palette.accent;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(
      cover
        ? "创作手记  /  NOTES"
        : frozen.template === "checklist"
          ? "把要点写清楚  /  CHECKLIST"
          : "一步一步来  /  STEPS",
      96,
      98,
    );
    ctx.fillRect(96, cover ? 180 : 150, cover ? 120 : 888, 5);
    ctx.fillStyle = palette.ink;
    ctx.font = `700 ${cover ? 84 : 58}px ${FONT}`;
    paintText(ctx, titleLines, 96, titleY, lineHeight);
    ctx.font = BODY_FONT;
    if (cover) {
      paintText(ctx, bodyLines, 96, bodyY, 60);
    } else {
      let paragraphStart = true;
      let number = 0;
      bodyLines.forEach((line, i) => {
        const y = bodyY + i * 60;
        if (line.trim() && paragraphStart) {
          ctx.fillStyle = palette.accent;
          if (frozen.template === "checklist") {
            ctx.lineWidth = 3;
            ctx.strokeStyle = palette.accent;
            ctx.strokeRect(96, y + 10, 24, 24);
          } else {
            ctx.fillStyle = palette.soft;
            ctx.fillRect(88, y + 2, 64, 48);
            ctx.fillStyle = palette.accent;
            ctx.font = `700 26px ${FONT}`;
            ctx.fillText(String(++number).padStart(2, "0"), 101, y + 12);
            ctx.font = BODY_FONT;
          }
        }
        ctx.fillStyle = palette.ink;
        ctx.fillText(line.replace(/\n$/, ""), 176, y);
        paragraphStart = line.endsWith("\n");
      });
    }
    if (page.image_id) {
      if (!images.has(page.image_id))
        images.set(page.image_id, await downloadImage(page.image_id, identity));
      const img = await decodeImage(images.get(page.image_id)!);
      try {
        if (!img.width || !img.height) throw new Error("图片尺寸无效。");
        // Contain preserves the whole supplied image instead of cropping facts.
        const scale = Math.min(888 / img.width, 350 / img.height);
        ctx.drawImage(
          img.source,
          96 + (888 - img.width * scale) / 2,
          940 + (350 - img.height * scale) / 2,
          img.width * scale,
          img.height * scale,
        );
      } finally {
        img.close();
      }
    }
    ctx.fillStyle = palette.accent;
    ctx.font = `24px ${FONT}`;
    ctx.fillText(
      `${String(index + 1).padStart(2, "0")}  /  ${String(frozen.pages.length).padStart(2, "0")}`,
      96,
      1340,
    );
    let blob: Blob | null;
    try {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
    } catch {
      throw new Error(`第 ${index + 1} 页 PNG 导出失败，请检查配图跨域授权。`);
    }
    if (!blob) throw new Error(`第 ${index + 1} 页 PNG 导出失败。`);
    total += blob.size;
    checkSize(total);
    blobs.push(blob);
  }
  return blobs;
}

export async function buildPublicationZip(
  doc: PublicationDocument,
  identity?: ApiIdentity,
): Promise<Blob> {
  const frozen = structuredClone(doc);
  if (!frozen.title.trim() || !frozen.content.trim())
    throw new Error("标题和正文不能为空。");
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  const add = (name: string, bytes: Uint8Array) => {
    total += bytes.byteLength;
    checkSize(total);
    files[name] = bytes;
  };
  add("title.txt", strToU8(frozen.title));
  add("content.txt", strToU8(frozen.content));
  add(
    "sources.md",
    strToU8(
      frozen.context?.references?.length
        ? frozen.context.references
            .map(
              (r, i) =>
                `## ${i + 1}. ${r.title}\n\n${r.url || "未记录来源链接"}\n\n${r.content}`,
            )
            .join("\n\n---\n\n")
        : "未附引用来源。\n",
    ),
  );
  let number = 0;
  const embedded = new Set<string>();
  if (frozen.context?.cards) {
    for (const p of frozen.context.cards.pages)
      if (p.image_id) embedded.add(p.image_id);
    for (const png of await renderCards(frozen.context.cards, identity)) {
      add(
        `${String(++number).padStart(2, "0")}.png`,
        new Uint8Array(await png.arrayBuffer()),
      );
    }
  }
  // Card PNGs come first. Append selected originals not already flattened into a
  // card, in selection order; generated numeric names cannot contain paths.
  for (const id of new Set(frozen.image_ids)) {
    if (embedded.has(id)) continue;
    const image = await downloadImage(id, identity, MAX_BYTES - total);
    add(
      `${String(++number).padStart(2, "0")}.${imageExtensions[image.type]}`,
      new Uint8Array(await image.arrayBuffer()),
    );
  }
  const bytes = zipSync(files, { level: 0 }); // PNGs and originals are already compressed.
  checkSize(bytes.byteLength);
  return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/\u0000-\u001f<>:"|?*]/g, "_");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
