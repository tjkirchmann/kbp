#!/usr/bin/env python3
"""Static validator for the Alembic migration history.

Runs with no DB and no third-party deps — it just parses the `revision` /
`down_revision` declarations out of every file in alembic/versions/ and checks
the chain is sane. Used by CI to block PRs with a broken migration history.

Checks:
  1. Single head            — exactly one revision is nobody's down_revision.
  2. Chain integrity        — every down_revision points at a real revision;
                              no duplicate revision ids; no cycles.
  3. One migration per PR    — (only when --base-ref is given) the PR adds at
                              most one new migration file vs the base branch.

Exit code 0 = OK, 1 = problem (with a human-readable explanation).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

VERSIONS_DIR = Path(__file__).resolve().parent.parent / "alembic" / "versions"

REVISION_RE = re.compile(r'^revision(?:\s*:\s*[^=]+)?\s*=\s*["\']([^"\']+)["\']', re.M)
DOWN_RE = re.compile(
    r'^down_revision(?:\s*:\s*[^=]+)?\s*=\s*(?:["\']([^"\']+)["\']|None)', re.M
)


def parse_file(path: Path) -> tuple[str | None, str | None]:
    text = path.read_text()
    rev_m = REVISION_RE.search(text)
    down_m = DOWN_RE.search(text)
    revision = rev_m.group(1) if rev_m else None
    # down_m matches even for `None` (group(1) is None in that case)
    down = down_m.group(1) if down_m else None
    return revision, down


def collect() -> dict[str, dict]:
    nodes: dict[str, dict] = {}
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        if path.name == "__init__.py":
            continue
        revision, down = parse_file(path)
        if revision is None:
            fail(f"{path.name}: could not find a `revision = ...` declaration")
        if revision in nodes:
            fail(
                f"duplicate revision id {revision!r}: "
                f"{nodes[revision]['file']} and {path.name}"
            )
        nodes[revision] = {"down": down, "file": path.name}
    return nodes


def fail(msg: str) -> None:
    print(f"::error::migration history check failed: {msg}", file=sys.stderr)
    print(f"\n  ✗ {msg}\n", file=sys.stderr)
    sys.exit(1)


def check_chain(nodes: dict[str, dict]) -> None:
    if not nodes:
        fail("no migration files found in alembic/versions/")

    # 2a. every down_revision must reference a known revision (or None for base)
    for rev, info in nodes.items():
        down = info["down"]
        if down is not None and down not in nodes:
            fail(
                f"{info['file']}: down_revision {down!r} does not exist "
                f"(orphaned/deleted revision — broken chain)"
            )

    # 2b. exactly one base (down_revision is None)
    bases = [r for r, i in nodes.items() if i["down"] is None]
    if len(bases) != 1:
        fail(
            f"expected exactly one base migration (down_revision = None), "
            f"found {len(bases)}: {', '.join(nodes[b]['file'] for b in bases) or '(none)'}"
        )

    # 1. single head — a head is a revision that nobody points to as down_revision
    referenced = {i["down"] for i in nodes.values() if i["down"]}
    heads = [r for r in nodes if r not in referenced]
    if len(heads) != 1:
        listing = "\n      ".join(f"{h}  ({nodes[h]['file']})" for h in heads)
        fail(
            f"expected exactly one head, found {len(heads)} "
            f"(multiple heads — chains diverged and never merged):\n      {listing}"
        )

    # 2c. walk base→head to detect cycles / unreachable nodes
    seen = set()
    cur = heads[0]
    while cur is not None:
        if cur in seen:
            fail(f"cycle detected in migration chain at {cur!r}")
        seen.add(cur)
        cur = nodes[cur]["down"]
    if len(seen) != len(nodes):
        unreachable = set(nodes) - seen
        listing = ", ".join(nodes[r]["file"] for r in unreachable)
        fail(f"revisions not reachable from head (broken chain): {listing}")

    print(f"  ✓ single head: {heads[0]} ({nodes[heads[0]]['file']})")
    print(f"  ✓ chain intact: {len(nodes)} migrations, base→head linear")


def check_one_per_pr(base_ref: str) -> None:
    try:
        out = subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=A", f"{base_ref}...HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=VERSIONS_DIR.parent.parent,  # src/backend
        ).stdout
    except subprocess.CalledProcessError as e:
        fail(f"git diff against {base_ref} failed: {e.stderr.strip()}")

    added = [
        line
        for line in out.splitlines()
        if line.startswith("src/backend/alembic/versions/")
        and line.endswith(".py")
        and not line.endswith("__init__.py")
    ]
    if len(added) > 1:
        listing = "\n      ".join(Path(p).name for p in added)
        fail(
            f"this PR adds {len(added)} migration files; squash to one per PR "
            f"(see migration skill):\n      {listing}"
        )
    print(f"  ✓ one-per-PR: {len(added)} new migration(s) vs {base_ref}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--base-ref",
        help="base git ref (e.g. origin/main) to enforce one-migration-per-PR",
    )
    args = ap.parse_args()

    print("Checking migration history...")
    nodes = collect()
    check_chain(nodes)
    if args.base_ref:
        check_one_per_pr(args.base_ref)
    print("\nMigration history OK.")


if __name__ == "__main__":
    main()
