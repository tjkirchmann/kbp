"""
Public MCP server — Streamable HTTP transport.

Exposes 7 parameterized query + lookup tools for paying subscribers.
Auth is a TODO stub — the X-API-Key header is accepted but not validated
in this MVP.

Usage (development):
    python -m public_server.server

Environment:
    MCP_DATABASE_URL — Postgres connection string (read-only user)
    MCP_HOST — bind host (default: 0.0.0.0)
    MCP_PORT — bind port (default: 8082)
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

# Ensure the shared package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from shared.tools import (
    search_teams,
    search_conferences,
    search_venues,
    list_seasons,
    list_stat_names,
    list_tables,
    explore_relationships,
    query_cfbd,
)

# ═══════════════════════════════════════════════════════════════════════════
# Server definition
# ═══════════════════════════════════════════════════════════════════════════

server = Server("cfbd-mcp-public")

# ═══════════════════════════════════════════════════════════════════════════
# Tool registry
# ═══════════════════════════════════════════════════════════════════════════

TOOLS = [
    Tool(
        name="search_teams",
        description="Search for CFBD college football teams by name, mascot, conference, or abbreviation. Returns team IDs needed for other queries.",
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search text — matches school, mascot, or abbreviation. Case-insensitive. Leave empty to list all.",
                },
                "conference": {
                    "type": "string",
                    "description": "Optional: filter by conference name (e.g. 'SEC', 'Big Ten').",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 50, max 100).",
                    "default": 50,
                },
            },
        },
    ),
    Tool(
        name="search_conferences",
        description="Search for CFBD conferences by name, short name, or abbreviation.",
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search text. Leave empty to list all conferences.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 50).",
                    "default": 50,
                },
            },
        },
    ),
    Tool(
        name="search_venues",
        description="Search for CFBD stadiums/venues by name, city, or state.",
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search text — matches venue name.",
                },
                "city": {
                    "type": "string",
                    "description": "Optional: filter by city.",
                },
                "state": {
                    "type": "string",
                    "description": "Optional: filter by state (e.g. 'TX').",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 50).",
                    "default": 50,
                },
            },
        },
    ),
    Tool(
        name="list_seasons",
        description="List all distinct season/year values available in a CFBD table. Use this to discover what years of data exist before querying.",
        inputSchema={
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "CFBD table name (e.g. 'cfbd_sp_ratings', 'cfbd_team_records').",
                },
            },
            "required": ["table_name"],
        },
    ),
    Tool(
        name="list_stat_names",
        description="List distinct stat names/categories in an EAV (Entity-Attribute-Value) stat table. Use this to discover available stat categories before filtering on them.",
        inputSchema={
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "EAV table name (e.g. 'cfbd_team_season_stats', 'cfbd_game_player_stats').",
                },
                "query": {
                    "type": "string",
                    "description": "Optional search filter for stat names.",
                },
            },
            "required": ["table_name"],
        },
    ),
    Tool(
        name="list_tables",
        description="List all available CFBD tables with descriptions, column names, and types. Start here to understand what data is available.",
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ),
    Tool(
        name="explore_relationships",
        description="Show valid join paths for a CFBD table. Returns which columns join to other tables and which tables join to this one. Use this before constructing joins in query_cfbd.",
        inputSchema={
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "CFBD table name (e.g. 'cfbd_games', 'cfbd_plays').",
                },
            },
            "required": ["table_name"],
        },
    ),
    Tool(
        name="query_cfbd",
        description="Execute a parameterized query against CFBD tables with optional INNER JOINs. Supports filtering, aggregation (sum/avg/count/min/max), grouping, and ordering. All values are parameterized — no SQL injection risk. When joins are present, ALL column refs must use 'table.column' notation.",
        inputSchema={
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "description": "Primary CFBD table name (required). Use list_tables to see available tables.",
                },
                "joins": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "table": {"type": "string", "description": "Table to join."},
                            "on": {"type": "string", "description": "ON clause in 'table.column = table.column' format."},
                            "type": {"type": "string", "enum": ["inner"], "description": "Join type (only 'inner' supported)."},
                        },
                        "required": ["table", "on"],
                    },
                    "description": "Optional INNER JOINs. Use explore_relationships to discover valid join paths. When joins are present, all column refs in select/filters/group_by/order_by must use 'table.column' notation.",
                },
                "select": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Columns to return. Use 'table.column' when joins present. Supports aggregation: sum(col), avg(col), min(col), max(col), count(*). Default: all columns.",
                },
                "filters": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "column": {"type": "string", "description": "Use 'table.column' when joins present."},
                            "op": {
                                "type": "string",
                                "enum": ["eq", "neq", "gt", "gte", "lt", "lte", "in", "like", "between", "is_null", "is_not_null"],
                            },
                            "value": {},
                        },
                        "required": ["column", "op"],
                    },
                    "description": "Filter conditions. Op 'in' expects a list value, 'between' expects [low, high], 'like' is case-insensitive ILIKE.",
                },
                "group_by": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Columns to group by (required when using aggregations).",
                },
                "order_by": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Columns to order by. Prefix with '-' for descending (e.g. '-rating').",
                },
            },
            "required": ["table"],
        },
    ),
]


@server.list_tools()
async def handle_list_tools() -> list[Tool]:
    return TOOLS


@server.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Route tool calls to implementations."""
    try:
        result = await _dispatch(name, arguments)
        return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]
    except ValueError as e:
        return [TextContent(type="text", text=json.dumps({"error": str(e)}, indent=2))]
    except Exception as e:
        return [
            TextContent(
                type="text",
                text=json.dumps({"error": f"Unexpected error: {e}"}, indent=2),
            )
        ]


async def _dispatch(name: str, args: dict[str, Any]) -> Any:
    """Dispatch tool name to implementation function."""
    match name:
        case "search_teams":
            return await search_teams(
                query=args.get("query", ""),
                conference=args.get("conference", ""),
                limit=args.get("limit", 50),
            )
        case "search_conferences":
            return await search_conferences(
                query=args.get("query", ""),
                limit=args.get("limit", 50),
            )
        case "search_venues":
            return await search_venues(
                query=args.get("query", ""),
                city=args.get("city", ""),
                state=args.get("state", ""),
                limit=args.get("limit", 50),
            )
        case "list_seasons":
            return await list_seasons(args["table_name"])
        case "list_stat_names":
            return await list_stat_names(
                table_name=args["table_name"],
                query=args.get("query", ""),
            )
        case "list_tables":
            return await list_tables()
        case "explore_relationships":
            return await explore_relationships(args["table_name"])
        case "query_cfbd":
            return await query_cfbd(
                table=args["table"],
                select=args.get("select"),
                filters=args.get("filters"),
                group_by=args.get("group_by"),
                order_by=args.get("order_by"),
                joins=args.get("joins"),
            )
        case _:
            raise ValueError(f"Unknown tool: {name}")


# ═══════════════════════════════════════════════════════════════════════════
# Entry point — Streamable HTTP
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    """Run the public MCP server via Streamable HTTP."""
    # Try Streamable HTTP first (newer mcp versions), fall back to stdio for dev
    try:
        from mcp.server.streamable_http import run_streamable_http_server

        host = os.environ.get("MCP_HOST", "0.0.0.0")
        port = int(os.environ.get("MCP_PORT", "8082"))
        print(f"Starting CFBD MCP public server on {host}:{port} (Streamable HTTP)")
        run_streamable_http_server(server, host=host, port=port)
    except ImportError:
        # Fallback: stdio (useful for local testing)
        import asyncio
        print("Streamable HTTP not available — falling back to stdio transport")
        print("Install a newer mcp package for HTTP support.")

        async def run_stdio():
            async with stdio_server() as (read, write):
                await server.run(read, write, server.create_initialization_options())

        asyncio.run(run_stdio())


if __name__ == "__main__":
    main()
