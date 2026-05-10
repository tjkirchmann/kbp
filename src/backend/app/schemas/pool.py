from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PoolCreate(BaseModel):
    name: str
    season_year: int


class PoolSchema(BaseModel):
    id: int
    name: str
    season_year: int
    is_featured: bool
    submissions_open: bool
    game_count: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PoolGameSchema(BaseModel):
    id: int
    cfbd_game_id: int
    sort_order: int
    home_team: str
    away_team: str
    start_date: datetime
    start_time_tbd: bool = False
    bowl_name: str | None = None
    season_type: str = 'postseason'
    home_classification: str | None = None
    away_classification: str | None = None
    home_conference: str | None = None
    away_conference: str | None = None
    conference_game: bool = False
    neutral_site: bool = False
    completed: bool = False
    home_score: int | None = None
    away_score: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, **kwargs):
        cg = obj.cfbd_game
        return cls(
            id=obj.id,
            cfbd_game_id=obj.cfbd_game_id,
            sort_order=obj.sort_order,
            home_team=cg.home_team,
            away_team=cg.away_team,
            start_date=cg.start_date,
            start_time_tbd=cg.start_time_tbd,
            bowl_name=cg.bowl_name,
            season_type=cg.season_type,
            home_classification=cg.home_classification,
            away_classification=cg.away_classification,
            home_conference=cg.home_conference,
            away_conference=cg.away_conference,
            conference_game=cg.conference_game,
            neutral_site=cg.neutral_site,
            completed=cg.completed,
            home_score=cg.home_score,
            away_score=cg.away_score,
        )


class CfbdGameSchema(BaseModel):
    id: int
    home_team: str
    away_team: str
    start_date: str
    start_time_tbd: bool
    bowl_name: str | None
    season_type: str
    home_classification: str | None
    away_classification: str | None
    home_conference: str | None
    away_conference: str | None
    conference_game: bool
    neutral_site: bool
    completed: bool
    home_score: int | None = None
    away_score: int | None = None


class PoolDetailSchema(BaseModel):
    id: int
    name: str
    season_year: int
    is_featured: bool
    submissions_open: bool
    submissions_due_at: datetime | None
    game_count: int
    created_at: datetime
    games: list[PoolGameSchema]
    model_config = ConfigDict(from_attributes=True)


class PoolPatch(BaseModel):
    is_featured: bool | None = None
    submissions_open: bool | None = None


class PoolGameAdd(BaseModel):
    cfbd_game_ids: list[int]
