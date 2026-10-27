"""Run the IPCR competency matcher + assessor over finalized IPCRs, one cycle at a time.

Plan: docs/plans/2026-10-27-sor-competency-breakdown.md

Why a batch runner: the endpoints live in the FastAPI app, but nothing in the
front end calls them, so `ipcr_competency_matches` and `employee_competencies`
have never been populated in production — which is why Summary of Ratings shows
"No competency breakdown available" for every employee. This drives the same
route function in-process, sequentially, with a resumable skip list.

Setup (backend/.env, gitignored — see backend/.env.example):
    SUPABASE_URL=
    SUPABASE_KEY=
    SUPABASE_SERVICE_ROLE_KEY=
    JWT_SECRET_KEY=
    GEMINI_API_KEY=

Usage:
    python run_competency_batch.py --cycle 6 --dry-run          # list targets only
    python run_competency_batch.py --cycle 6 --limit 1          # one employee
    python run_competency_batch.py --cycle 6                    # the whole cycle
    python run_competency_batch.py --cycle 6 --force            # re-assess everyone

Each employee costs one matcher call (only when that cycle has no matches yet)
and one assessment call. Existing assessments for the cycle are skipped unless
--force is passed.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

# Make `app` importable when the script is run from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from app.core.config import settings
    from app.routes.competency_assessment import (
        CompetencyAssessmentRequest,
        assess_employee_competencies,
    )
    from fastapi import HTTPException
except Exception as exc:  # noqa: BLE001 - configuration errors must read clearly
    print(f"Could not start: {exc}\n")
    print("Fill backend/.env from backend/.env.example first (SUPABASE_URL,")
    print("SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET_KEY, GEMINI_API_KEY).")
    raise SystemExit(2) from exc


def service_db():
    from supabase import create_client

    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Batch-run the IPCR competency assessor.")
    ap.add_argument("--cycle", type=int, required=True, help="performance_cycles.id")
    ap.add_argument("--limit", type=int, default=0, help="stop after N employees (0 = all)")
    ap.add_argument("--employee", default="", help="assess one employees.id (uuid)")
    ap.add_argument("--dry-run", action="store_true", help="list the work, call nothing")
    ap.add_argument("--force", action="store_true", help="re-assess employees already done")
    ap.add_argument("--sleep", type=float, default=1.0, help="seconds between employees")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    db = service_db()

    if not settings.GEMINI_API_KEY:
        print("GEMINI_API_KEY is unset in backend/.env — matching and assessment need it.")
        return 2

    cycle_rows = (
        db.table("performance_cycles")
        .select("id, title, start_date, end_date")
        .eq("id", args.cycle)
        .limit(1)
        .execute()
    ).data or []
    if not cycle_rows:
        print(f"No performance_cycles row with id {args.cycle}.")
        return 2
    print(f"Cycle {args.cycle}: {cycle_rows[0]['title']}")

    query = (
        db.table("target_settings")
        .select("employee_id")
        .eq("cycle_id", args.cycle)
        .eq("status", "approved")
        .eq("phase2_status", "completed")
    )
    if args.employee:
        query = query.eq("employee_id", args.employee)
    rows = query.execute().data or []
    employee_ids = [str(r["employee_id"]) for r in rows]

    done: set[str] = set()
    if not args.force:
        existing = (
            db.table("employee_competencies")
            .select("employee_id")
            .eq("cycle_id", args.cycle)
            .execute()
        ).data or []
        done = {str(r["employee_id"]) for r in existing}

    pending = [e for e in employee_ids if e not in done]
    if args.limit:
        pending = pending[: args.limit]

    print(
        f"{len(employee_ids)} finalized IPCR(s); {len(done)} already assessed; "
        f"{len(pending)} to run."
    )
    if args.dry_run or not pending:
        for e in pending:
            print(f"  would assess {e}")
        return 0

    ok = failed = 0
    started = time.time()
    for i, employee_id in enumerate(pending, start=1):
        try:
            asyncio.run(
                assess_employee_competencies(
                    CompetencyAssessmentRequest(employee_id=employee_id, cycle_id=args.cycle)
                )
            )
            ok += 1
            print(f"[{i}/{len(pending)}] ok      {employee_id}")
        except HTTPException as exc:
            failed += 1
            print(f"[{i}/{len(pending)}] FAILED  {employee_id}: {exc.status_code} {exc.detail}")
        except Exception as exc:  # noqa: BLE001 - keep the batch going, report at the end
            failed += 1
            print(f"[{i}/{len(pending)}] FAILED  {employee_id}: {exc}")
        if args.sleep and i < len(pending):
            time.sleep(args.sleep)

    # Belt and braces: the trigger on ipcr_competency_matches already tags the
    # mirrored rows; this re-syncs every row once in case any were missed.
    try:
        sync = db.rpc("sync_ipcr_performance_competencies", {}).execute()
        print(f"Re-synced mirrored competency tags: {sync.data} row(s).")
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: could not run sync_ipcr_performance_competencies: {exc}")

    matches = (
        db.table("ipcr_competency_matches")
        .select("id", count="exact")
        .eq("rating_period", str(args.cycle))
        .execute()
    )
    comps = (
        db.table("employee_competencies")
        .select("id", count="exact")
        .eq("cycle_id", args.cycle)
        .execute()
    )
    print(
        f"\nDone in {time.time() - started:.0f}s — {ok} assessed, {failed} failed.\n"
        f"Cycle {args.cycle} now holds {matches.count or 0} competency match(es) and "
        f"{comps.count or 0} employee competency row(s)."
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
