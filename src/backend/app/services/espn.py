import httpx

ESPN_BOXSCORE_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event={event_id}"


async def fetch_espn_boxscore(event_id: str) -> dict:
    url = ESPN_BOXSCORE_URL.format(event_id=event_id)
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=15.0)
        resp.raise_for_status()
        return resp.json()


def extract_espn_scores(payload: dict) -> dict:
    comp = payload["header"]["competitions"][0]
    status_type = comp["status"]["type"]
    competitors = {c["homeAway"]: c for c in comp["competitors"]}
    return {
        "status_state": status_type["state"],
        "status_detail": status_type.get("detail"),
        "period": comp["status"].get("period"),
        "clock": comp["status"].get("displayClock"),
        "home_score": int(competitors["home"]["score"]) if competitors.get("home") and competitors["home"].get("score") is not None else None,
        "away_score": int(competitors["away"]["score"]) if competitors.get("away") and competitors["away"].get("score") is not None else None,
    }
