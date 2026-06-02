from __future__ import annotations
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import ai, analytics, auth, drafts, images, materials, publish

logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="XHS Tool API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
app.include_router(drafts.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(publish.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")


@app.on_event("startup")
async def startup():
    logger.info("XHS Tool API starting...")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
