from procrastinate import App, PsycopgConnector

from app.core.config import settings

# Procrastinate runs its own psycopg v3 connection pool, independent of the
# SQLAlchemy asyncpg engine in app.core.database. psycopg wants a plain libpq
# DSN, so strip any SQLAlchemy driver suffix (e.g. postgresql+asyncpg://).
_conninfo = settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)

# import_paths tells the worker (and the API process) which modules define
# tasks, so they get registered without being imported at every call site.
procrastinate_app = App(
    connector=PsycopgConnector(conninfo=_conninfo),
    import_paths=[
        "app.tasks.cfbd_sync",
        # cfbd dimensions migrated to a Temporal workflow (app/temporal/cfbd_dims/).
        "app.tasks.cfbd_facts",
        "app.tasks.cfbd_plays",
        "app.tasks.espn_poller",
    ],
)
