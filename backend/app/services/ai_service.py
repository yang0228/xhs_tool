from __future__ import annotations
import logging
from typing import AsyncIterator
from anthropic import AsyncAnthropic
from ..config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPTS = {
    "summarize": "你是一个专业的内容摘要助手。请用简洁的中文总结内容，提取3-5个关键要点。适合小红书风格，语言生动有吸引力。",
    "titles": "你是一个小红书爆款标题生成器。请根据内容生成吸引眼球的标题（20字以内），使用emoji，语气活泼。",
    "rewrite": "你是一个小红书内容创作助手。请用小红书风格改写内容：短段落、加emoji、口语化、有互动感。保持原意但让表达更生动。",
    "polish": "你是一个文字润色专家。请润色以下内容，使其更流畅优美，同时保持小红书风格：简洁、有节奏感、适当使用emoji。",
    "outline": "你是一个内容策划专家。请根据提供的素材，生成一个结构化的小红书文章大纲。每个章节包含标题和要点。",
}

class AIService:
    def __init__(self):
        self.client = AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            base_url=settings.anthropic_base_url,
        )
        self.model = settings.ai_model_default
        logger.info(f"AI Service initialized: model={self.model}, base_url={settings.anthropic_base_url}")

    async def summarize(self, content: str, max_length: int | None = None) -> dict:
        length_hint = f"摘要控制在{max_length}字以内。" if max_length else "摘要控制在200字以内。"
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=SYSTEM_PROMPTS["summarize"],
            messages=[{"role": "user", "content": f"{length_hint}\n\n内容：\n{content}"}],
        )
        text = response.content[0].text
        lines = [l.strip("- 1234567890.、") for l in text.split("\n") if l.strip()]
        summary = lines[0] if lines else text
        key_points = lines[1:6] if len(lines) > 1 else [text]
        return {"summary": summary, "key_points": key_points}

    async def generate_titles(self, content: str, count: int = 5) -> list[str]:
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=512,
            system=SYSTEM_PROMPTS["titles"],
            messages=[{"role": "user", "content": f"请生成{count}个标题（每个20字以内）：\n\n{content[:2000]}"}],
        )
        text = response.content[0].text
        titles = [l.strip("- 1234567890.、 ") for l in text.split("\n") if l.strip() and len(l.strip()) > 2]
        return titles[:count]

    async def rewrite_stream(self, content: str, style: str | None = None, instruction: str | None = None) -> AsyncIterator[str]:
        style_hint = f"风格要求：{style}\n" if style else ""
        inst_hint = f"特别要求：{instruction}\n" if instruction else ""
        system = f"{SYSTEM_PROMPTS['rewrite']}\n{style_hint}{inst_hint}"
        async with self.client.messages.stream(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": content}],
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta" and event.delta.type == "text_delta":
                    yield event.delta.text

    async def polish(self, content: str) -> str:
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=SYSTEM_PROMPTS["polish"],
            messages=[{"role": "user", "content": content}],
        )
        return response.content[0].text

    async def generate_outline(self, materials: list[dict]) -> list[dict]:
        material_texts = "\n\n---\n\n".join(
            f"素材{i+1}：{m.get('title', '无标题')}\n{m.get('content', '')[:1000]}"
            for i, m in enumerate(materials)
        )
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=SYSTEM_PROMPTS["outline"],
            messages=[{"role": "user", "content": f"请根据以下素材生成大纲：\n\n{material_texts}"}],
        )
        text = response.content[0].text
        sections = []
        for line in text.split("\n"):
            line = line.strip()
            if line and ("#" in line or "章" in line or "节" in line or "部分" in line):
                sections.append({"section": line.strip("# "), "key_points": []})
            elif sections and line:
                sections[-1]["key_points"].append(line.strip("- "))
        return sections if sections else [{"section": "大纲", "key_points": [text]}]
