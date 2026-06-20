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

# Per-season fact endpoints fetched a whole season at a time (year=). cfbd_facts
# only calls these for seasons it's missing (see app/tasks/cfbd_facts.py).
_FACT_ENDPOINTS = {
    "lines": "/lines",
    "rankings": "/rankings",
    "calendar": "/calendar",
    "records": "/records",
    "sp_ratings": "/ratings/sp",
    "srs_ratings": "/ratings/srs",
    "elo_ratings": "/ratings/elo",
    "fpi_ratings": "/ratings/fpi",
    "team_season_stats": "/stats/season",
    "team_season_adv_stats": "/stats/season/advanced",
    "player_season_stats": "/stats/player/season",
    "talent": "/talent",
    "recruiting_teams": "/recruiting/teams",
    "recruiting_players": "/recruiting/players",
    "returning_production": "/player/returning",
}

# Year-range fact endpoints — same as above but parameterized by startYear/endYear
# rather than a single year=. We pass startYear=endYear=year for one-season pulls.
_FACT_YEAR_RANGE_ENDPOINTS = {
    "recruiting_groups": "/recruiting/groups",
}

# Fact endpoints fetched a season at a time but paged across both season types
# (year + seasonType, no week required) and concatenated (see _fetch_by_season_type).
_FACT_SEASONTYPE_ENDPOINTS = {
    "drives": "/drives",
    "game_media": "/games/media",
}

# Fact endpoints CFBD won't serve year-only — they require a week filter, so we
# page week-by-week across both season types and concatenate (see _fetch_by_week).
_FACT_WEEKLY_ENDPOINTS = {
    "game_team_stats": "/games/teams",
    "game_player_stats": "/games/players",
    "game_weather": "/games/weather",
    # High-volume play-by-play — only the cron-less cfbd_plays task fetches these.
    "plays": "/plays",
    "play_stats": "/plays/stats",
}
_MAX_WEEK = 25  # safety cap; the loop stops earlier on the first empty week


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
        if endpoint in _FACT_ENDPOINTS:
            query = {"year": params["year"]}
            if params.get("season_type"):
                query["seasonType"] = params["season_type"]
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{CFBD_BASE}{_FACT_ENDPOINTS[endpoint]}",
                    params=query,
                    headers=self._headers(),
                    timeout=60.0,  # full-season fact payloads can be large
                )
                resp.raise_for_status()
                return resp.json()
        if endpoint in _FACT_YEAR_RANGE_ENDPOINTS:
            year = params["year"]
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{CFBD_BASE}{_FACT_YEAR_RANGE_ENDPOINTS[endpoint]}",
                    params={"startYear": year, "endYear": year},
                    headers=self._headers(),
                    timeout=60.0,
                )
                resp.raise_for_status()
                return resp.json()
        if endpoint in _FACT_SEASONTYPE_ENDPOINTS:
            return await self._fetch_by_season_type(
                _FACT_SEASONTYPE_ENDPOINTS[endpoint], params["year"]
            )
        if endpoint in _FACT_WEEKLY_ENDPOINTS:
            return await self._fetch_by_week(
                _FACT_WEEKLY_ENDPOINTS[endpoint], params["year"]
            )
        raise ValueError(f"Unknown CFBD endpoint: {endpoint}")

    async def _fetch_by_season_type(self, path: str, year: int) -> list[dict]:
        """Fetch a year-scoped endpoint once per season type and concatenate.

        For endpoints that accept year + seasonType (no week required), one call
        per season type covers the whole year — far fewer calls than week paging
        while still capturing postseason (bowl) data the regular-season default
        would miss.
        """
        out: list[dict] = []
        async with httpx.AsyncClient() as client:
            for season_type in ("regular", "postseason"):
                resp = await client.get(
                    f"{CFBD_BASE}{path}",
                    params={"year": year, "seasonType": season_type},
                    headers=self._headers(),
                    timeout=60.0,
                )
                resp.raise_for_status()
                data = resp.json()
                if data:
                    out.extend(data)
        return out

    async def _fetch_by_week(self, path: str, year: int) -> list[dict]:
        """Page a week-keyed fact endpoint across regular + postseason for a year.

        CFBD rejects these endpoints year-only (400), so we walk weeks per season
        type and stop each at the first empty week. Returns one flat list; each
        item keeps its own season/seasonType/week so downstream syncers don't care
        the data was paged.
        """
        out: list[dict] = []
        async with httpx.AsyncClient() as client:
            for season_type in ("regular", "postseason"):
                for week in range(1, _MAX_WEEK + 1):
                    resp = await client.get(
                        f"{CFBD_BASE}{path}",
                        params={"year": year, "seasonType": season_type, "week": week},
                        headers=self._headers(),
                        timeout=60.0,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    if not data:  # first empty week ends this season type
                        break
                    out.extend(data)
        return out


cfbd_provider = CfbdProvider()


async def fetch_teams() -> list[dict]:
    """Backward-compat shim re-exported via app/services/cfbd.py."""
    return await cfbd_provider.fetch("teams")


async def fetch_games(year: int) -> list[dict]:
    """Backward-compat shim."""
    return await cfbd_provider.fetch("games", year=year)
