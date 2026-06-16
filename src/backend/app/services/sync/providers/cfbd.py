import time
from typing import Any

import httpx

from app.core.config import settings
from app.services.sync.providers.base import SyncProvider

CFBD_BASE = "https://api.collegefootballdata.com"

_games_cache: dict[int, tuple[list[dict], float]] = {}
GAMES_CACHE_TTL = 900  # 15 minutes

# Slowly-changing dimension endpoints: global, no required params, plain GET.
# Maps the fetch() endpoint key to its CFBD path.
_DIM_ENDPOINTS = {
    "teams": "/teams",
    "conferences": "/conferences",
    "venues": "/venues",
    "coaches": "/coaches",
    "draft_positions": "/draft/positions",
    "draft_teams": "/draft/teams",
}


class CfbdProvider(SyncProvider):
    name = "cfbd"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {settings.cfbd_api_key}"}

    async def fetch(self, endpoint: str, **params: Any) -> Any:
        if endpoint in _DIM_ENDPOINTS:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{CFBD_BASE}{_DIM_ENDPOINTS[endpoint]}",
                    headers=self._headers(),
                    timeout=30.0,
                )
                resp.raise_for_status()
                return resp.json()
        if endpoint == "games":
            year = params["year"]
            query: dict[str, Any] = {"year": year}
            if "season_type" in params and params["season_type"]:
                query["seasonType"] = params["season_type"]

            now = time.monotonic()
            cache_key = year if "season_type" not in params else None
            if cache_key is not None and cache_key in _games_cache:
                data, ts = _games_cache[cache_key]
                if now - ts < GAMES_CACHE_TTL:
                    return data

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{CFBD_BASE}/games",
                    params=query,
                    headers=self._headers(),
                    timeout=15.0,
                )
                resp.raise_for_status()
                data = resp.json()
            if cache_key is not None:
                _games_cache[cache_key] = (data, now)
            return data
        raise ValueError(f"Unknown CFBD endpoint: {endpoint}")


cfbd_provider = CfbdProvider()


async def fetch_teams() -> list[dict]:
    """Backward-compat shim re-exported via app/services/cfbd.py."""
    return await cfbd_provider.fetch("teams")


async def fetch_games(year: int) -> list[dict]:
    """Backward-compat shim."""
    return await cfbd_provider.fetch("games", year=year)
