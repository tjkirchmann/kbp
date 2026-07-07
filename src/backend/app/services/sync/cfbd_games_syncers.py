"""CFBD games syncer — row/hash mappers for the games fact table.

Extracted from ``app/temporal/cfbd_games/activities.py`` so the row/hash mapping
functions are shared between Temporal activities and any other caller.
"""

from datetime import UTC, datetime


# asyncpg/psycopg cap statements at 32767 bind params; keep batches under that.
GAME_COLS = 18
GAME_BATCH = 32767 // GAME_COLS


def game_row(g: dict, year: int) -> dict:
    raw_date = g.get("startDate", "")
    try:
        start_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except (ValueError, AttributeError):
        start_date = datetime.now(UTC).replace(tzinfo=None)
    return {
        "id": g["id"],
        "home_team": g.get("homeTeam", ""),
        "away_team": g.get("awayTeam", ""),
        "start_date": start_date,
        "start_time_tbd": g.get("startTimeTBD", False),
        "bowl_name": g.get("notes") or None,
        "season_type": g.get("seasonType", "regular"),
        "season_year": year,
        "home_classification": g.get("homeClassification") or None,
        "away_classification": g.get("awayClassification") or None,
        "home_conference": g.get("homeConference") or None,
        "away_conference": g.get("awayConference") or None,
        "conference_game": g.get("conferenceGame", False),
        "neutral_site": g.get("neutralSite", False),
        "completed": bool(g.get("completed", False)),
        "home_score": g.get("homePoints"),
        "away_score": g.get("awayPoints"),
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def game_hash_fields(g: dict) -> dict:
    return {
        "homeTeam": g.get("homeTeam"),
        "awayTeam": g.get("awayTeam"),
        "startDate": g.get("startDate"),
        "completed": g.get("completed"),
        "homePoints": g.get("homePoints"),
        "awayPoints": g.get("awayPoints"),
        "notes": g.get("notes"),
        "seasonType": g.get("seasonType"),
    }
