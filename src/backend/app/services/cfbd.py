import time
import httpx
from app.core.config import settings

CFBD_BASE = "https://api.collegefootballdata.com"

_cache: dict[int, tuple[list[dict], float]] = {}
CACHE_TTL = 900  # 15 minutes


async def fetch_games(year: int) -> list[dict]:
    now = time.monotonic()
    if year in _cache:
        data, ts = _cache[year]
        if now - ts < CACHE_TTL:
            return data
    headers = {"Authorization": f"Bearer {settings.cfbd_api_key}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{CFBD_BASE}/games",
            params={"year": year},
            headers=headers,
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
    _cache[year] = (data, now)
    return data


async def fetch_teams() -> list[dict]:
    headers = {"Authorization": f"Bearer {settings.cfbd_api_key}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{CFBD_BASE}/teams",
            headers=headers,
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()
