from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    multiplier: int = 1
    playoff_slot: str | None = None
    home_team: str
    away_team: str
    start_date: datetime
    start_time_tbd: bool = False
    week: int | None = None
    bowl_name: str | None = None
    season_type: str = "postseason"
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
            multiplier=obj.multiplier,
            playoff_slot=obj.playoff_slot,
            home_team=cg.home_team,
            away_team=cg.away_team,
            start_date=cg.start_date,
            start_time_tbd=cg.start_time_tbd,
            week=cg.week,
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
    week: int | None = None
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


class PoolQuestionSchema(BaseModel):
    id: int
    prompt: str
    question_type: str
    sort_order: int
    required: bool
    model_config = ConfigDict(from_attributes=True)


class PoolQuestionInput(BaseModel):
    prompt: str
    question_type: str
    required: bool = False


class PoolQuestionsUpdate(BaseModel):
    questions: list[PoolQuestionInput]


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
    questions: list[PoolQuestionSchema] = []
    model_config = ConfigDict(from_attributes=True)


class PoolPatch(BaseModel):
    is_featured: bool | None = None
    submissions_open: bool | None = None


class PoolGameAdd(BaseModel):
    cfbd_game_ids: list[int]


class PublicPoolSchema(BaseModel):
    id: int
    name: str
    season_year: int
    is_featured: bool
    submissions_open: bool
    submissions_due_at: datetime | None
    requires_password: bool

    @classmethod
    def from_pool(cls, pool) -> "PublicPoolSchema":
        return cls(
            id=pool.id,
            name=pool.name,
            season_year=pool.season_year,
            is_featured=pool.is_featured,
            submissions_open=pool.submissions_open,
            submissions_due_at=pool.submissions_due_at,
            requires_password=pool.password_hash is not None,
        )


class SubmissionCreate(BaseModel):
    on_behalf_of_name: str
    on_behalf_of_email: str | None = None


class PasswordVerify(BaseModel):
    password: str


class TeamMetaSchema(BaseModel):
    school: str
    mascot: str | None = None
    color: str | None = None
    alt_color: str | None = None
    logos: list[str] | None = None


class PoolGameWithTeamsSchema(PoolGameSchema):
    home_team_meta: TeamMetaSchema | None = None
    away_team_meta: TeamMetaSchema | None = None


class GamePickUpsert(BaseModel):
    picked_winner: str
    picked_margin: int = Field(ge=1)


class GamePickSchema(BaseModel):
    id: int
    pool_game_id: int
    picked_winner: str
    picked_margin: int
    model_config = ConfigDict(from_attributes=True)


class SubmissionAnswerSchema(BaseModel):
    question_id: int
    answer_text: str | None = None
    model_config = ConfigDict(from_attributes=True)


class SubmissionAnswerInput(BaseModel):
    question_id: int
    answer_text: str | None = None


class SubmissionAnswersUpdate(BaseModel):
    answers: list[SubmissionAnswerInput]


class MySubmissionSchema(BaseModel):
    id: int
    on_behalf_of_name: str
    created_at: datetime
    is_locked: bool
    submitted_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class BracketAssignmentItem(BaseModel):
    pool_game_id: int
    playoff_slot: str | None


class PoolGamesBracketUpdate(BaseModel):
    assignments: list[BracketAssignmentItem]


class MultiplierItem(BaseModel):
    pool_game_id: int
    multiplier: int


class PoolGamesMultiplierUpdate(BaseModel):
    multipliers: list[MultiplierItem]
