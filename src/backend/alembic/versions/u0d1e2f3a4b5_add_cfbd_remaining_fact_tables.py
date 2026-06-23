"""add remaining CFBD fact tables (calendar, records, ratings, season/player
stats, talent, recruiting, returning production, game media/weather/player
stats, drives)

Completes the cfbd_facts roadmap: every season- and week-batched CFBD fact
endpoint now materializes into its own table, synced by the existing daily
cfbd_facts task via the shared cfbd_fact_coverage cursor (no new schedule).
Play-by-play (cfbd_plays/cfbd_play_stats) is added separately in the next
revision because it runs on its own cron-less task.

Revision ID: u0d1e2f3a4b5
Revises: t9c0d1e2f3a4
Create Date: 2026-06-17 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "u0d1e2f3a4b5"
down_revision: str | None = "t9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cfbd_calendar",
        sa.Column("season", sa.Integer(), primary_key=True),
        sa.Column("season_type", sa.String(), primary_key=True),
        sa.Column("week", sa.Integer(), primary_key=True),
        sa.Column("start_date", sa.String(), nullable=True),
        sa.Column("end_date", sa.String(), nullable=True),
        sa.Column("first_game_start", sa.String(), nullable=True),
        sa.Column("last_game_start", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_team_records",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), nullable=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("division", sa.String(), nullable=True),
        sa.Column("expected_wins", sa.Float(), nullable=True),
        sa.Column("total_games", sa.Integer(), nullable=True),
        sa.Column("total_wins", sa.Integer(), nullable=True),
        sa.Column("total_losses", sa.Integer(), nullable=True),
        sa.Column("total_ties", sa.Integer(), nullable=True),
        sa.Column("conference_games", sa.Integer(), nullable=True),
        sa.Column("conference_wins", sa.Integer(), nullable=True),
        sa.Column("conference_losses", sa.Integer(), nullable=True),
        sa.Column("conference_ties", sa.Integer(), nullable=True),
        sa.Column("home_games", sa.Integer(), nullable=True),
        sa.Column("home_wins", sa.Integer(), nullable=True),
        sa.Column("home_losses", sa.Integer(), nullable=True),
        sa.Column("home_ties", sa.Integer(), nullable=True),
        sa.Column("away_games", sa.Integer(), nullable=True),
        sa.Column("away_wins", sa.Integer(), nullable=True),
        sa.Column("away_losses", sa.Integer(), nullable=True),
        sa.Column("away_ties", sa.Integer(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_sp_ratings",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("ranking", sa.Integer(), nullable=True),
        sa.Column("second_order_wins", sa.Float(), nullable=True),
        sa.Column("sos", sa.Float(), nullable=True),
        sa.Column("offense_rating", sa.Float(), nullable=True),
        sa.Column("offense_ranking", sa.Integer(), nullable=True),
        sa.Column("defense_rating", sa.Float(), nullable=True),
        sa.Column("defense_ranking", sa.Integer(), nullable=True),
        sa.Column("special_teams_rating", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_srs_ratings",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("division", sa.String(), nullable=True),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("ranking", sa.Integer(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_elo_ratings",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("elo", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_fpi_ratings",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("fpi", sa.Float(), nullable=True),
        sa.Column("efficiency_overall", sa.Float(), nullable=True),
        sa.Column("efficiency_offense", sa.Float(), nullable=True),
        sa.Column("efficiency_defense", sa.Float(), nullable=True),
        sa.Column("efficiency_special_teams", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_team_season_stats",
        sa.Column("season", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("stat_name", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("stat_value", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_team_season_adv_stats",
        sa.Column("season", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("stat", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("value", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_player_season_stats",
        sa.Column("season", sa.Integer(), primary_key=True),
        sa.Column("player_id", sa.String(), primary_key=True),
        sa.Column("category", sa.String(), primary_key=True),
        sa.Column("stat_type", sa.String(), primary_key=True),
        sa.Column("player", sa.String(), nullable=True),
        sa.Column("team", sa.String(), nullable=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("stat", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_team_talent",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("school", sa.String(), primary_key=True),
        sa.Column("talent", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_recruiting_teams",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("points", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_recruiting_players",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), nullable=True),
        sa.Column("recruit_type", sa.String(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("ranking", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("school", sa.String(), nullable=True),
        sa.Column("committed_to", sa.String(), nullable=True),
        sa.Column("position", sa.String(), nullable=True),
        sa.Column("height", sa.Float(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column("stars", sa.Integer(), nullable=True),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("city", sa.String(), nullable=True),
        sa.Column("state_province", sa.String(), nullable=True),
        sa.Column("country", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_recruiting_groups",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("position_group", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("average_rating", sa.Float(), nullable=True),
        sa.Column("total_rating", sa.Float(), nullable=True),
        sa.Column("commits", sa.Integer(), nullable=True),
        sa.Column("average_stars", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_returning_production",
        sa.Column("season", sa.Integer(), primary_key=True),
        sa.Column("team", sa.String(), primary_key=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("total_ppa", sa.Float(), nullable=True),
        sa.Column("total_passing_ppa", sa.Float(), nullable=True),
        sa.Column("total_rushing_ppa", sa.Float(), nullable=True),
        sa.Column("total_receiving_ppa", sa.Float(), nullable=True),
        sa.Column("percent_ppa", sa.Float(), nullable=True),
        sa.Column("percent_passing_ppa", sa.Float(), nullable=True),
        sa.Column("percent_rushing_ppa", sa.Float(), nullable=True),
        sa.Column("percent_receiving_ppa", sa.Float(), nullable=True),
        sa.Column("usage", sa.Float(), nullable=True),
        sa.Column("passing_usage", sa.Float(), nullable=True),
        sa.Column("rushing_usage", sa.Float(), nullable=True),
        sa.Column("receiving_usage", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_game_media",
        sa.Column("game_id", sa.Integer(), primary_key=True),
        sa.Column("media_type", sa.String(), primary_key=True),
        sa.Column("outlet", sa.String(), primary_key=True),
        sa.Column("season", sa.Integer(), nullable=True),
        sa.Column("week", sa.Integer(), nullable=True),
        sa.Column("season_type", sa.String(), nullable=True),
        sa.Column("start_time", sa.String(), nullable=True),
        sa.Column("is_start_time_tbd", sa.Boolean(), nullable=True),
        sa.Column("home_team", sa.String(), nullable=True),
        sa.Column("away_team", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_game_weather",
        sa.Column("game_id", sa.Integer(), primary_key=True),
        sa.Column("season", sa.Integer(), nullable=True),
        sa.Column("week", sa.Integer(), nullable=True),
        sa.Column("season_type", sa.String(), nullable=True),
        sa.Column("start_time", sa.String(), nullable=True),
        sa.Column("game_indoors", sa.Boolean(), nullable=True),
        sa.Column("home_team", sa.String(), nullable=True),
        sa.Column("away_team", sa.String(), nullable=True),
        sa.Column("venue_id", sa.Integer(), nullable=True),
        sa.Column("venue", sa.String(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("dew_point", sa.Float(), nullable=True),
        sa.Column("humidity", sa.Float(), nullable=True),
        sa.Column("precipitation", sa.Float(), nullable=True),
        sa.Column("snowfall", sa.Float(), nullable=True),
        sa.Column("wind_direction", sa.Float(), nullable=True),
        sa.Column("wind_speed", sa.Float(), nullable=True),
        sa.Column("pressure", sa.Float(), nullable=True),
        sa.Column("weather_condition_code", sa.Integer(), nullable=True),
        sa.Column("weather_condition", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_game_player_stats",
        sa.Column("game_id", sa.Integer(), primary_key=True),
        sa.Column("player_id", sa.String(), primary_key=True),
        sa.Column("category", sa.String(), primary_key=True),
        sa.Column("stat_type", sa.String(), primary_key=True),
        sa.Column("player", sa.String(), nullable=True),
        sa.Column("team", sa.String(), nullable=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("home_away", sa.String(), nullable=True),
        sa.Column("stat", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_drives",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("game_id", sa.Integer(), nullable=True),
        sa.Column("offense", sa.String(), nullable=True),
        sa.Column("offense_conference", sa.String(), nullable=True),
        sa.Column("defense", sa.String(), nullable=True),
        sa.Column("defense_conference", sa.String(), nullable=True),
        sa.Column("drive_number", sa.Integer(), nullable=True),
        sa.Column("scoring", sa.Boolean(), nullable=True),
        sa.Column("start_period", sa.Integer(), nullable=True),
        sa.Column("start_yardline", sa.Integer(), nullable=True),
        sa.Column("start_yards_to_goal", sa.Integer(), nullable=True),
        sa.Column("end_period", sa.Integer(), nullable=True),
        sa.Column("end_yardline", sa.Integer(), nullable=True),
        sa.Column("end_yards_to_goal", sa.Integer(), nullable=True),
        sa.Column("plays", sa.Integer(), nullable=True),
        sa.Column("yards", sa.Integer(), nullable=True),
        sa.Column("drive_result", sa.String(), nullable=True),
        sa.Column("is_home_offense", sa.Boolean(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("cfbd_drives")
    op.drop_table("cfbd_game_player_stats")
    op.drop_table("cfbd_game_weather")
    op.drop_table("cfbd_game_media")
    op.drop_table("cfbd_returning_production")
    op.drop_table("cfbd_recruiting_groups")
    op.drop_table("cfbd_recruiting_players")
    op.drop_table("cfbd_recruiting_teams")
    op.drop_table("cfbd_team_talent")
    op.drop_table("cfbd_player_season_stats")
    op.drop_table("cfbd_team_season_adv_stats")
    op.drop_table("cfbd_team_season_stats")
    op.drop_table("cfbd_fpi_ratings")
    op.drop_table("cfbd_elo_ratings")
    op.drop_table("cfbd_srs_ratings")
    op.drop_table("cfbd_sp_ratings")
    op.drop_table("cfbd_team_records")
    op.drop_table("cfbd_calendar")
