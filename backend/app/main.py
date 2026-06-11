from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.mongodb import connect_to_mongo, close_mongo_connection
from app.db.redis import connect_to_redis, close_redis_connection
from app.routers import documents
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await connect_to_redis()
    yield
    await close_mongo_connection()
    await close_redis_connection()

app = FastAPI(title="Vaulbin", version="1.0.0", lifespan=lifespan)

# CORS – only allow your frontend (adjust origin for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Security headers (applied to every response)
app.add_middleware(SecurityHeadersMiddleware)

# Rate limiting – 60 requests per minute per IP per endpoint
app.add_middleware(RateLimitMiddleware, requests=60, window=60)

app.include_router(documents.router)

@app.get("/health")
async def health():
    return {"status": "ok"}