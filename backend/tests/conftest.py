import pytest_asyncio
import httpx
import os

# Base URL of the backend API (inside docker network it's "http://backend:8000",
# outside it's "http://localhost:8000". We check an env var or default to localhost.
API_BASE = os.environ.get("API_BASE", "http://localhost:8000")

@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(base_url=API_BASE) as ac:
        yield ac