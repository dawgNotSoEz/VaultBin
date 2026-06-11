from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from app.db.redis import get_redis
import time

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests: int = 30, window: int = 60):
        super().__init__(app)
        self.requests = requests   # max requests
        self.window = window       # seconds

    async def dispatch(self, request: Request, call_next):
        redis = get_redis()
        client_ip = request.client.host
        key = f"rate:{client_ip}:{request.url.path}"

        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, self.window)

        if current > self.requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Try again later."},
                headers={"Retry-After": str(self.window)}
            )

        return await call_next(request)