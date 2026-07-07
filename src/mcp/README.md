# CFBD MCP Servers

Two MCP (Model Context Protocol) servers that expose the CFBD Postgres tables as queryable tools.

## Architecture

```
src/mcp/
├── shared/              # Shared modules (both servers)
│   ├── db.py            # Read-only asyncpg connection
│   ├── models.py        # Table/column metadata registry (32 tables)
│   ├── query_builder.py # Parameterized SQL query builder
│   ├── security.py      # SQL guardrails (SELECT-only, cfbd_* only)
│   └── tools.py         # All 8 tool implementations
├── public_server/       # Streamable HTTP (Docker)
│   ├── server.py        # 7 shared tools, auth TODO stub
│   └── Dockerfile
└── private_server/      # stdio (local)
    ├── server.py        # 7 shared + execute_sql tool
    └── results/         # CSV export directory
```

## Public Server

Streamable HTTP transport. Runs in Docker. For paying subscribers (auth TBD).

```bash
make mcp-public        # Start (requires running db)
make mcp-public-logs   # Tail logs
```

Accessible at `http://localhost:8082`.

### Tools (7)

| Tool | Description |
|------|-------------|
| `search_teams` | Find teams by name, school, conference, abbreviation |
| `search_conferences` | Find conferences |
| `search_venues` | Find venues by name, city, state |
| `list_seasons` | Available seasons for a table |
| `list_stat_names` | Stat categories for EAV tables |
| `list_tables` | All CFBD tables with columns |
| `query_cfbd` | Parameterized query builder |

## Private Server

stdio transport. Runs locally. Connects to the Docker Postgres at `localhost:5432`.

```bash
make mcp-private
```

Configure in Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cfbd-private": {
      "command": "uv",
      "args": ["run", "python", "-m", "private_server.server"],
      "cwd": "/path/to/kbp/src/mcp"
    }
  }
}
```

### Additional tool

| Tool | Description |
|------|-------------|
| `execute_sql` | Raw SELECT (cfbd_* only, 60s timeout, optional CSV export) |

## query_cfbd Usage

The main tool for data exploration. Supports filtering, aggregation, grouping, and ordering.

```json
{
  "table": "cfbd_sp_ratings",
  "select": ["team", "rating", "offense_rating", "defense_rating"],
  "filters": [
    {"column": "year", "op": "gte", "value": 2020},
    {"column": "conference", "op": "eq", "value": "SEC"}
  ],
  "order_by": ["-rating"],
  "limit": 25
}
```

**Filter operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `like`, `between`, `is_null`, `is_not_null`

**Aggregations**: `sum(col)`, `avg(col)`, `min(col)`, `max(col)`, `count(*)`

**Ordering**: prefix with `-` for descending (e.g. `-rating`)

**Row limit**: capped at 1000.

## Database

Both servers use a read-only Postgres user (`mcp_readonly`) created by the `mcp-db-setup` one-shot service on first `make up`. Grants are:

- `SELECT` on all tables in `public` schema
- `DEFAULT PRIVILEGES` for future tables

Connection is via `MCP_DATABASE_URL` env var (see `.env.example`).

## Security

- **Read-only enforcement**: `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` on every connection.
- **Parameterized queries**: `query_cfbd` uses asyncpg bind parameters (`$1, $2, ...`). No string interpolation.
- **execute_sql guardrails**: SELECT-only, cfbd_* tables only, 60s timeout.
- **Identifier validation**: Column/table names validated against the metadata registry.
