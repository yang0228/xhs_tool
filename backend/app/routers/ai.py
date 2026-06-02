from __future__ import annotations
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from ..dependencies import get_current_user
from ..models.user import User
from ..schemas.ai import (
    GenerateTitlesRequest, GenerateTitlesResponse,
    OutlineRequest, OutlineResponse,
    PolishRequest, PolishResponse,
    RewriteRequest, SummarizeRequest, SummarizeResponse,
)
from ..services.ai_service import AIService

router = APIRouter(prefix="/ai", tags=["ai"])

@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(body: SummarizeRequest, user: User = Depends(get_current_user)):
    service = AIService()
    result = await service.summarize(body.content, body.max_length)
    return result

@router.post("/generate-titles", response_model=GenerateTitlesResponse)
async def generate_titles(body: GenerateTitlesRequest, user: User = Depends(get_current_user)):
    service = AIService()
    titles = await service.generate_titles(body.content, body.count)
    return GenerateTitlesResponse(titles=titles)

@router.post("/rewrite")
async def rewrite(body: RewriteRequest, user: User = Depends(get_current_user)):
    service = AIService()
    async def event_stream():
        async for chunk in service.rewrite_stream(body.content, body.style, body.instruction):
            data = json.dumps({"chunk": chunk})
            yield f"data: {data}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")

@router.post("/polish", response_model=PolishResponse)
async def polish(body: PolishRequest, user: User = Depends(get_current_user)):
    service = AIService()
    polished = await service.polish(body.content)
    return PolishResponse(polished=polished)

@router.post("/outline", response_model=OutlineResponse)
async def outline(body: OutlineRequest, user: User = Depends(get_current_user)):
    service = AIService()
    result = await service.generate_outline(body.materials)
    return OutlineResponse(outline=result)
