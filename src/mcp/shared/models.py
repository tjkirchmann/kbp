"""
Table metadata registry for all 32 CFBD tables.

Each entry describes a table's columns, types, primary key, and whether
it uses an EAV (Entity-Attribute-Value) layout. This registry drives:

- Table/column validation in the query builder
- The list_tables tool
- The list_stat_names tool (for EAV tables)
- The list_seasons tool (tables with season/year columns)

Column types map to the SQLAlchemy types used in the ORM models:
  Integer  → int
  Float    → float
  String   → str
  Boolean  → bool
  DateTime → datetime
  PG_ARRAY(String) → list[str]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ColType = Literal["int", "float", "str", "bool", "datetime", "list[str]"]


@dataclass
class ColumnInfo:
    name: str
    type: ColType
    primary_key: bool = False
    nullable: bool = True


@dataclass
class TableInfo:
    name: str                     # PostgreSQL table name (e.g. "cfbd_games")
    description: str              # Human-readable description
    columns: list[ColumnInfo]     # Ordered column definitions
    eav: bool = False             # True if this is an EAV/long-format table
    dimension: bool = False       # True if this is a dimension (reference) table
    # For tables with season/year columns, these are the column names to use
    # for list_seasons lookups.
    season_columns: list[str] = field(default_factory=list)

    @property
    def column_names(self) -> list[str]:
        return [c.name for c in self.columns]

    @property
    def primary_keys(self) -> list[str]:
        return [c.name for c in self.columns if c.primary_key]


# ── Column helper ───────────────────────────────────────────────────────────


def col(
    name: str,
    type: ColType,
    pk: bool = False,
    nullable: bool = True,
) -> ColumnInfo:
    return ColumnInfo(name=name, type=type, primary_key=pk, nullable=nullable)


# ── Table definitions ───────────────────────────────────────────────────────

TABLES: list[TableInfo] = [
    # ═══════════════════════════════════════════════════════════════════════
    # DIMENSION TABLES (slowly-changing reference data, nightly sync)
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_teams",
        description="College football teams (dimension table)",
        dimension=True,
        columns=[
            col("id", "int", pk=True),
            col("school", "str", nullable=False),
            col("mascot", "str"),
            col("abbreviation", "str"),
            col("color", "str"),
            col("alt_color", "str"),
            col("logos", "list[str]"),
            col("conference", "str"),
            col("division", "str"),
            col("classification", "str"),
            col("twitter", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
    ),
    TableInfo(
        name="cfbd_conferences",
        description="Conference definitions (dimension table)",
        dimension=True,
        columns=[
            col("id", "int", pk=True),
            col("name", "str", nullable=False),
            col("short_name", "str"),
            col("abbreviation", "str"),
            col("classification", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
    ),
    TableInfo(
        name="cfbd_venues",
        description="Stadium and venue details (dimension table)",
        dimension=True,
        columns=[
            col("id", "int", pk=True),
            col("name", "str", nullable=False),
            col("city", "str"),
            col("state", "str"),
            col("zip", "str"),
            col("country_code", "str"),
            col("timezone", "str"),
            col("latitude", "float"),
            col("longitude", "float"),
            col("elevation", "str"),
            col("capacity", "int"),
            col("construction_year", "int"),
            col("grass", "bool"),
            col("dome", "bool"),
            col("last_synced_at", "datetime", nullable=False),
        ],
    ),
    TableInfo(
        name="cfbd_coaches",
        description="Coaching staff (dimension table)",
        dimension=True,
        columns=[
            col("coach_id", "str", pk=True),
            col("first_name", "str"),
            col("last_name", "str"),
            col("hire_date", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
    ),
    TableInfo(
        name="cfbd_coach_seasons",
        description="Coach performance by season (dimension table)",
        dimension=True,
        columns=[
            col("coach_id", "str", pk=True),
            col("school", "str", pk=True),
            col("year", "int", pk=True),
            col("games", "int"),
            col("wins", "int"),
            col("losses", "int"),
            col("ties", "int"),
            col("preseason_rank", "int"),
            col("postseason_rank", "int"),
            col("srs", "float"),
            col("sp_overall", "float"),
            col("sp_offense", "float"),
            col("sp_defense", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_draft_positions",
        description="NFL draft position types (dimension table)",
        dimension=True,
        columns=[
            col("name", "str", pk=True),
            col("abbreviation", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
    ),
    TableInfo(
        name="cfbd_draft_teams",
        description="NFL draft team info (dimension table)",
        dimension=True,
        columns=[
            col("display_name", "str", pk=True),
            col("location", "str"),
            col("nickname", "str"),
            col("logo", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
    ),
    # ═══════════════════════════════════════════════════════════════════════
    # FACT TABLES — Games & game-related
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_games",
        description="Game results and metadata (live-updating, every 15 min)",
        columns=[
            col("id", "int", pk=True),
            col("home_team", "str", nullable=False),
            col("away_team", "str", nullable=False),
            col("start_date", "datetime", nullable=False),
            col("start_time_tbd", "bool", nullable=False),
            col("week", "int"),
            col("bowl_name", "str"),
            col("season_type", "str", nullable=False),
            col("season_year", "int", nullable=False),
            col("home_classification", "str"),
            col("away_classification", "str"),
            col("home_conference", "str"),
            col("away_conference", "str"),
            col("conference_game", "bool", nullable=False),
            col("neutral_site", "bool", nullable=False),
            col("completed", "bool", nullable=False),
            col("home_score", "int"),
            col("away_score", "int"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season_year"],
    ),
    TableInfo(
        name="cfbd_betting_lines",
        description="Betting lines per game per sportsbook provider",
        columns=[
            col("game_id", "int", pk=True),
            col("provider", "str", pk=True),
            col("season", "int", nullable=False),
            col("season_type", "str", nullable=False),
            col("week", "int"),
            col("home_team_id", "int"),
            col("home_team", "str"),
            col("away_team_id", "int"),
            col("away_team", "str"),
            col("spread", "float"),
            col("spread_open", "float"),
            col("over_under", "float"),
            col("over_under_open", "float"),
            col("home_moneyline", "int"),
            col("away_moneyline", "int"),
            col("formatted_spread", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    TableInfo(
        name="cfbd_game_media",
        description="Broadcast/media coverage per game",
        columns=[
            col("game_id", "int", pk=True),
            col("media_type", "str", pk=True),
            col("outlet", "str", pk=True),
            col("season", "int"),
            col("week", "int"),
            col("season_type", "str"),
            col("start_time", "str"),
            col("is_start_time_tbd", "bool"),
            col("home_team", "str"),
            col("away_team", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    TableInfo(
        name="cfbd_game_weather",
        description="Weather conditions for each game",
        columns=[
            col("game_id", "int", pk=True),
            col("season", "int"),
            col("week", "int"),
            col("season_type", "str"),
            col("start_time", "str"),
            col("game_indoors", "bool"),
            col("home_team", "str"),
            col("away_team", "str"),
            col("venue_id", "int"),
            col("venue", "str"),
            col("temperature", "float"),
            col("dew_point", "float"),
            col("humidity", "float"),
            col("precipitation", "float"),
            col("snowfall", "float"),
            col("wind_direction", "float"),
            col("wind_speed", "float"),
            col("pressure", "float"),
            col("weather_condition_code", "int"),
            col("weather_condition", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    # ═══════════════════════════════════════════════════════════════════════
    # FACT TABLES — Ratings
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_rankings",
        description="Poll rankings per week per poll",
        columns=[
            col("season", "int", pk=True),
            col("season_type", "str", pk=True),
            col("week", "int", pk=True),
            col("poll", "str", pk=True),
            col("team_id", "int", pk=True),
            col("school", "str"),
            col("conference", "str"),
            col("rank", "int"),
            col("first_place_votes", "int"),
            col("points", "int"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    TableInfo(
        name="cfbd_sp_ratings",
        description="SP+ advanced ratings by season and team",
        columns=[
            col("year", "int", pk=True),
            col("team", "str", pk=True),
            col("conference", "str"),
            col("rating", "float"),
            col("ranking", "int"),
            col("second_order_wins", "float"),
            col("sos", "float"),
            col("offense_rating", "float"),
            col("offense_ranking", "int"),
            col("defense_rating", "float"),
            col("defense_ranking", "int"),
            col("special_teams_rating", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_srs_ratings",
        description="Simple Rating System ratings by season and team",
        columns=[
            col("year", "int", pk=True),
            col("team", "str", pk=True),
            col("conference", "str"),
            col("division", "str"),
            col("rating", "float"),
            col("ranking", "int"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_elo_ratings",
        description="Elo ratings by season and team",
        columns=[
            col("year", "int", pk=True),
            col("team", "str", pk=True),
            col("conference", "str"),
            col("elo", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_fpi_ratings",
        description="Football Power Index ratings by season and team",
        columns=[
            col("year", "int", pk=True),
            col("team", "str", pk=True),
            col("conference", "str"),
            col("fpi", "float"),
            col("efficiency_overall", "float"),
            col("efficiency_offense", "float"),
            col("efficiency_defense", "float"),
            col("efficiency_special_teams", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    # ═══════════════════════════════════════════════════════════════════════
    # FACT TABLES — Season team data
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_calendar",
        description="Season calendar (week date windows)",
        columns=[
            col("season", "int", pk=True),
            col("season_type", "str", pk=True),
            col("week", "int", pk=True),
            col("start_date", "str"),
            col("end_date", "str"),
            col("first_game_start", "str"),
            col("last_game_start", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    TableInfo(
        name="cfbd_team_records",
        description="Win/loss records per team per season",
        columns=[
            col("year", "int", pk=True),
            col("team_id", "int", pk=True),
            col("team", "str"),
            col("conference", "str"),
            col("division", "str"),
            col("expected_wins", "float"),
            col("total_games", "int"),
            col("total_wins", "int"),
            col("total_losses", "int"),
            col("total_ties", "int"),
            col("conference_games", "int"),
            col("conference_wins", "int"),
            col("conference_losses", "int"),
            col("conference_ties", "int"),
            col("home_games", "int"),
            col("home_wins", "int"),
            col("home_losses", "int"),
            col("home_ties", "int"),
            col("away_games", "int"),
            col("away_wins", "int"),
            col("away_losses", "int"),
            col("away_ties", "int"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_team_talent",
        description="247Sports team talent composite scores",
        columns=[
            col("year", "int", pk=True),
            col("school", "str", pk=True),
            col("talent", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_returning_production",
        description="Returning production metrics by season and team",
        columns=[
            col("season", "int", pk=True),
            col("team", "str", pk=True),
            col("conference", "str"),
            col("total_ppa", "float"),
            col("total_passing_ppa", "float"),
            col("total_rushing_ppa", "float"),
            col("total_receiving_ppa", "float"),
            col("percent_ppa", "float"),
            col("percent_passing_ppa", "float"),
            col("percent_rushing_ppa", "float"),
            col("percent_receiving_ppa", "float"),
            col("usage", "float"),
            col("passing_usage", "float"),
            col("rushing_usage", "float"),
            col("receiving_usage", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    # ═══════════════════════════════════════════════════════════════════════
    # FACT TABLES — EAV stats (Entity-Attribute-Value / long format)
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_game_team_stats",
        description="Team box-score stats per game (EAV: one row per stat category)",
        eav=True,
        columns=[
            col("game_id", "int", pk=True),
            col("team_id", "int", pk=True),
            col("category", "str", pk=True),
            col("team", "str"),
            col("conference", "str"),
            col("home_away", "str"),
            col("points", "int"),
            col("stat", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=[],
    ),
    TableInfo(
        name="cfbd_team_season_stats",
        description="Team season stats (EAV: one row per stat category)",
        eav=True,
        columns=[
            col("season", "int", pk=True),
            col("team", "str", pk=True),
            col("stat_name", "str", pk=True),
            col("conference", "str"),
            col("stat_value", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    TableInfo(
        name="cfbd_team_season_adv_stats",
        description="Advanced team season stats (EAV: one row per stat)",
        eav=True,
        columns=[
            col("season", "int", pk=True),
            col("team", "str", pk=True),
            col("stat", "str", pk=True),
            col("conference", "str"),
            col("value", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    TableInfo(
        name="cfbd_player_season_stats",
        description="Player season stats (EAV: one row per player/stat combination)",
        eav=True,
        columns=[
            col("season", "int", pk=True),
            col("player_id", "str", pk=True),
            col("category", "str", pk=True),
            col("stat_type", "str", pk=True),
            col("player", "str"),
            col("team", "str"),
            col("conference", "str"),
            col("stat", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    TableInfo(
        name="cfbd_game_player_stats",
        description="Player box-score stats per game (EAV: one row per player/stat)",
        eav=True,
        columns=[
            col("game_id", "int", pk=True),
            col("player_id", "str", pk=True),
            col("category", "str", pk=True),
            col("stat_type", "str", pk=True),
            col("player", "str"),
            col("team", "str"),
            col("conference", "str"),
            col("home_away", "str"),
            col("stat", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=[],
    ),
    TableInfo(
        name="cfbd_play_stats",
        description="Play-by-play stats per athlete (EAV: one row per play/athlete/stat)",
        eav=True,
        columns=[
            col("play_id", "str", pk=True),
            col("athlete_id", "str", pk=True),
            col("stat_type", "str", pk=True),
            col("game_id", "int"),
            col("season", "int"),
            col("week", "int"),
            col("team", "str"),
            col("conference", "str"),
            col("opponent", "str"),
            col("athlete_name", "str"),
            col("stat", "int"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    # ═══════════════════════════════════════════════════════════════════════
    # FACT TABLES — Recruiting
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_recruiting_teams",
        description="Team recruiting class rankings",
        columns=[
            col("year", "int", pk=True),
            col("team", "str", pk=True),
            col("rank", "int"),
            col("points", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_recruiting_players",
        description="Individual recruit profiles",
        columns=[
            col("id", "int", pk=True),
            col("athlete_id", "int"),
            col("recruit_type", "str"),
            col("year", "int"),
            col("ranking", "int"),
            col("name", "str"),
            col("school", "str"),
            col("committed_to", "str"),
            col("position", "str"),
            col("height", "float"),
            col("weight", "float"),
            col("stars", "int"),
            col("rating", "float"),
            col("city", "str"),
            col("state_province", "str"),
            col("country", "str"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    TableInfo(
        name="cfbd_recruiting_groups",
        description="Position-group recruiting summaries per team",
        columns=[
            col("year", "int", pk=True),
            col("team", "str", pk=True),
            col("position_group", "str", pk=True),
            col("conference", "str"),
            col("average_rating", "float"),
            col("total_rating", "float"),
            col("commits", "int"),
            col("average_stars", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["year"],
    ),
    # ═══════════════════════════════════════════════════════════════════════
    # FACT TABLES — Drives & Plays
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_drives",
        description="Drive-level data per game",
        columns=[
            col("id", "str", pk=True),
            col("game_id", "int"),
            col("offense", "str"),
            col("offense_conference", "str"),
            col("defense", "str"),
            col("defense_conference", "str"),
            col("drive_number", "int"),
            col("scoring", "bool"),
            col("start_period", "int"),
            col("start_yardline", "int"),
            col("start_yards_to_goal", "int"),
            col("end_period", "int"),
            col("end_yardline", "int"),
            col("end_yards_to_goal", "int"),
            col("plays", "int"),
            col("yards", "int"),
            col("drive_result", "str"),
            col("is_home_offense", "bool"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=[],
    ),
    TableInfo(
        name="cfbd_plays",
        description="Individual plays (play-by-play data)",
        columns=[
            col("id", "str", pk=True),
            col("game_id", "int"),
            col("drive_id", "str"),
            col("season", "int"),
            col("week", "int"),
            col("season_type", "str"),
            col("offense", "str"),
            col("offense_conference", "str"),
            col("defense", "str"),
            col("defense_conference", "str"),
            col("home", "str"),
            col("away", "str"),
            col("offense_score", "int"),
            col("defense_score", "int"),
            col("period", "int"),
            col("yard_line", "int"),
            col("yards_to_goal", "int"),
            col("down", "int"),
            col("distance", "int"),
            col("scoring", "bool"),
            col("yards_gained", "int"),
            col("play_type", "str"),
            col("play_text", "str"),
            col("ppa", "float"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season"],
    ),
    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL
    # ═══════════════════════════════════════════════════════════════════════
    TableInfo(
        name="cfbd_fact_coverage",
        description="Internal sync coverage cursor (not user-facing)",
        columns=[
            col("endpoint", "str", pk=True),
            col("season_year", "int", pk=True),
            col("complete", "bool", nullable=False),
            col("row_count", "int"),
            col("last_synced_at", "datetime", nullable=False),
        ],
        season_columns=["season_year"],
    ),
]

# ═══════════════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════════════
# Join relationships (curated, semantic join paths)
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class JoinRelationship:
    """A known, meaningful join path between two CFBD tables."""
    from_table: str
    from_column: str
    to_table: str
    to_column: str
    description: str = ""

    @property
    def on_clause(self) -> str:
        return f"{self.from_table}.{self.from_column} = {self.to_table}.{self.to_column}"

    def matches(self, on_clause: str) -> bool:
        """Check if this relationship matches a given ON clause (order-insensitive)."""
        parts = [p.strip() for p in on_clause.split("=")]
        if len(parts) != 2:
            return False
        forward = f"{self.from_table}.{self.from_column} = {self.to_table}.{self.to_column}"
        reverse = f"{self.to_table}.{self.to_column} = {self.from_table}.{self.from_column}"
        candidate = " = ".join(parts)
        return candidate == forward or candidate == reverse


# Curated join relationships. Only meaningful semantic joins are included —
# no algorithmic column-name matching (too noisy with generic names like
# "season", "conference", "team").
#
# Categories:
#   1. Dimension joins: fact/dim tables → reference tables (teams, venues, etc.)
#   2. Fact-to-fact: game-centric chains (game_id, drive_id, play_id)
#   3. Season-level: join on (year, team) or (season, team) pairs

JOIN_RELATIONSHIPS: list[JoinRelationship] = [
    # ── Team dimension joins ────────────────────────────────────────────
    JoinRelationship("cfbd_betting_lines", "home_team_id", "cfbd_teams", "id",
                     "Betting line home team → team detail"),
    JoinRelationship("cfbd_betting_lines", "away_team_id", "cfbd_teams", "id",
                     "Betting line away team → team detail"),
    JoinRelationship("cfbd_betting_lines", "home_team", "cfbd_teams", "school",
                     "Betting line home team name → team detail"),
    JoinRelationship("cfbd_betting_lines", "away_team", "cfbd_teams", "school",
                     "Betting line away team name → team detail"),
    JoinRelationship("cfbd_rankings", "team_id", "cfbd_teams", "id",
                     "Ranking team → team detail"),
    JoinRelationship("cfbd_team_records", "team_id", "cfbd_teams", "id",
                     "Team record → team detail"),
    JoinRelationship("cfbd_team_records", "team", "cfbd_teams", "school",
                     "Team record name → team detail"),
    JoinRelationship("cfbd_game_team_stats", "team_id", "cfbd_teams", "id",
                     "Game team stat → team detail"),
    JoinRelationship("cfbd_game_team_stats", "team", "cfbd_teams", "school",
                     "Game team stat name → team detail"),
    JoinRelationship("cfbd_sp_ratings", "team", "cfbd_teams", "school",
                     "SP+ rating team → team detail"),
    JoinRelationship("cfbd_srs_ratings", "team", "cfbd_teams", "school",
                     "SRS rating team → team detail"),
    JoinRelationship("cfbd_elo_ratings", "team", "cfbd_teams", "school",
                     "Elo rating team → team detail"),
    JoinRelationship("cfbd_fpi_ratings", "team", "cfbd_teams", "school",
                     "FPI rating team → team detail"),
    JoinRelationship("cfbd_team_season_stats", "team", "cfbd_teams", "school",
                     "Team season stat → team detail"),
    JoinRelationship("cfbd_team_season_adv_stats", "team", "cfbd_teams", "school",
                     "Advanced team stat → team detail"),
    JoinRelationship("cfbd_returning_production", "team", "cfbd_teams", "school",
                     "Returning production → team detail"),
    JoinRelationship("cfbd_recruiting_teams", "team", "cfbd_teams", "school",
                     "Recruiting team ranking → team detail"),
    JoinRelationship("cfbd_recruiting_groups", "team", "cfbd_teams", "school",
                     "Recruiting group → team detail"),
    JoinRelationship("cfbd_team_talent", "school", "cfbd_teams", "school",
                     "Team talent → team detail"),
    JoinRelationship("cfbd_coach_seasons", "school", "cfbd_teams", "school",
                     "Coach season → team detail"),

    # ── Game table → team dimension (home/away) ──────────────────────────
    JoinRelationship("cfbd_games", "home_team", "cfbd_teams", "school",
                     "Game home team → team detail"),
    JoinRelationship("cfbd_games", "away_team", "cfbd_teams", "school",
                     "Game away team → team detail"),
    JoinRelationship("cfbd_game_media", "home_team", "cfbd_teams", "school",
                     "Media home team → team detail"),
    JoinRelationship("cfbd_game_media", "away_team", "cfbd_teams", "school",
                     "Media away team → team detail"),
    JoinRelationship("cfbd_game_weather", "home_team", "cfbd_teams", "school",
                     "Weather home team → team detail"),
    JoinRelationship("cfbd_game_weather", "away_team", "cfbd_teams", "school",
                     "Weather away team → team detail"),

    # ── Drive/Play offensive/defensive team ──────────────────────────────
    JoinRelationship("cfbd_drives", "offense", "cfbd_teams", "school",
                     "Drive offense → team detail"),
    JoinRelationship("cfbd_drives", "defense", "cfbd_teams", "school",
                     "Drive defense → team detail"),
    JoinRelationship("cfbd_plays", "offense", "cfbd_teams", "school",
                     "Play offense → team detail"),
    JoinRelationship("cfbd_plays", "defense", "cfbd_teams", "school",
                     "Play defense → team detail"),
    JoinRelationship("cfbd_plays", "home", "cfbd_teams", "school",
                     "Play home team → team detail"),
    JoinRelationship("cfbd_plays", "away", "cfbd_teams", "school",
                     "Play away team → team detail"),

    # ── Conference dimension joins ──────────────────────────────────────
    JoinRelationship("cfbd_teams", "conference", "cfbd_conferences", "name",
                     "Team conference → conference detail"),
    JoinRelationship("cfbd_sp_ratings", "conference", "cfbd_conferences", "name",
                     "SP+ conference → conference detail"),
    JoinRelationship("cfbd_srs_ratings", "conference", "cfbd_conferences", "name",
                     "SRS conference → conference detail"),
    JoinRelationship("cfbd_elo_ratings", "conference", "cfbd_conferences", "name",
                     "Elo conference → conference detail"),
    JoinRelationship("cfbd_fpi_ratings", "conference", "cfbd_conferences", "name",
                     "FPI conference → conference detail"),

    # ── Venue dimension joins ───────────────────────────────────────────
    JoinRelationship("cfbd_game_weather", "venue_id", "cfbd_venues", "id",
                     "Game weather venue → venue detail"),

    # ── Coach dimension joins ───────────────────────────────────────────
    JoinRelationship("cfbd_coach_seasons", "coach_id", "cfbd_coaches", "coach_id",
                     "Coach season → coach detail"),

    # ── Fact-to-fact: game-centric chains ────────────────────────────────
    JoinRelationship("cfbd_betting_lines", "game_id", "cfbd_games", "id",
                     "Betting lines → game detail"),
    JoinRelationship("cfbd_game_team_stats", "game_id", "cfbd_games", "id",
                     "Game team stats → game detail"),
    JoinRelationship("cfbd_game_player_stats", "game_id", "cfbd_games", "id",
                     "Game player stats → game detail"),
    JoinRelationship("cfbd_game_media", "game_id", "cfbd_games", "id",
                     "Game media → game detail"),
    JoinRelationship("cfbd_game_weather", "game_id", "cfbd_games", "id",
                     "Game weather → game detail"),
    JoinRelationship("cfbd_drives", "game_id", "cfbd_games", "id",
                     "Drives → game detail"),
    JoinRelationship("cfbd_plays", "game_id", "cfbd_games", "id",
                     "Plays → game detail"),
    JoinRelationship("cfbd_play_stats", "game_id", "cfbd_games", "id",
                     "Play stats → game detail"),

    # ── Fact-to-fact: drive/play chains ─────────────────────────────────
    JoinRelationship("cfbd_plays", "drive_id", "cfbd_drives", "id",
                     "Plays → drive detail"),
    JoinRelationship("cfbd_play_stats", "play_id", "cfbd_plays", "id",
                     "Play stats → play detail"),

    # ── Season-level joins (same year + team) ───────────────────────────
    # Allow joining rating tables to each other and to team records
    JoinRelationship("cfbd_sp_ratings", "year", "cfbd_srs_ratings", "year",
                     "SP+ ↔ SRS: join on year (pair with team filter)"),
    JoinRelationship("cfbd_sp_ratings", "year", "cfbd_elo_ratings", "year",
                     "SP+ ↔ Elo: join on year (pair with team filter)"),
    JoinRelationship("cfbd_sp_ratings", "year", "cfbd_fpi_ratings", "year",
                     "SP+ ↔ FPI: join on year (pair with team filter)"),
    JoinRelationship("cfbd_sp_ratings", "year", "cfbd_team_records", "year",
                     "SP+ ↔ Team records: join on year (pair with team filter)"),
    JoinRelationship("cfbd_team_season_stats", "season", "cfbd_team_records", "year",
                     "Season stats ↔ Team records (pair with team filter)"),
]


def get_relationships(table_name: str) -> dict[str, list[dict]]:
    """Return join paths for a given table.

    Returns {'joins_from': [...], 'joins_to': [...]} where:
    - joins_from: this table's columns that join TO other tables
    - joins_to: other tables' columns that join TO this table
    """
    joins_from: list[dict] = []
    joins_to: list[dict] = []
    seen_from: set[str] = set()
    seen_to: set[str] = set()

    for r in JOIN_RELATIONSHIPS:
        if r.from_table == table_name:
            key = f"{r.from_column}→{r.to_table}.{r.to_column}"
            if key not in seen_from:
                seen_from.add(key)
                joins_from.append({
                    "from_column": r.from_column,
                    "to_table": r.to_table,
                    "to_column": r.to_column,
                    "on_clause": r.on_clause,
                    "description": r.description,
                })
        if r.to_table == table_name:
            key = f"{r.from_table}.{r.from_column}→{r.to_column}"
            if key not in seen_to:
                seen_to.add(key)
                joins_to.append({
                    "from_table": r.from_table,
                    "from_column": r.from_column,
                    "to_column": r.to_column,
                    "on_clause": r.on_clause,
                    "description": r.description,
                })

    return {"table": table_name, "joins_from": joins_from, "joins_to": joins_to}


# ═══════════════════════════════════════════════════════════════════════════
# Lookup helpers
# ═══════════════════════════════════════════════════════════════════════════

_TABLE_MAP: dict[str, TableInfo] = {t.name: t for t in TABLES}


def get_table(name: str) -> TableInfo | None:
    """Look up a table definition by name."""
    return _TABLE_MAP.get(name)


def list_tables() -> list[TableInfo]:
    """Return all registered table definitions."""
    return list(TABLES)


def get_user_tables() -> list[TableInfo]:
    """Return tables intended for user-facing tools (exclude internal)."""
    return [t for t in TABLES if t.name != "cfbd_fact_coverage"]
