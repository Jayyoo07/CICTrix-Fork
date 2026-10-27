"""Enqueue finalized IPCRs into the competency assessment queue, one cycle at a time.

Plan: docs/plans/2026-10-27-sor-previous-semester-competency.md (Step 5)

Why an enqueue batch script:
Instead of running assessment synchronously in-process, this script enqueues
finalized IPCRs into `competency_assessment_runs` (`stage = 'assessing'`).
The queue runner (`run_competency_queue.py`) then processes them with durable
state, retry handling, and error tracking.

Setup (backend/.env, gitignored — see backend/.env.example):
    SUPABASE_URL=
    SUPABASE_KEY=
    SUPABASE_SERVICE_ROLE_KEY=
    JWT_SECRET_KEY=
    GEMINI_API_KEY=

Usage:
    python run_competency_batch.py --cycle 6 --dry-run          # list targets only
    python run_competency_batch.py --cycle 6 --limit 1          # enqueue one employee
    python run_competency_batch.py --cycle 6                    # enqueue the whole cycle
    python run_competency_batch.py --cycle 6 --force            # re-enqueue everyone
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List, Set

# Ensure sys.stdout handles UTF-8 on Windows
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Make `app` importable when the script is run from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from app.core.config import settings
    from app.core.supabase_client import db
except Exception as exc:  # noqa: BLE001 - configuration errors must read clearly
    print(f"Could not start: {exc}\n")
    print("Fill backend/.env from backend/.env.example first (SUPABASE_URL,")
    print("SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET_KEY, GEMINI_API_KEY).")
    raise SystemExit(2) from exc


def get_service_db():
    return db.get_service_client()


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Batch-enqueue IPCRs into competency assessment runs.")
    ap.add_argument("--cycle", type=int, required=True, help="performance_cycles.id")
    ap.add_argument("--limit", type=int, default=0, help="stop after N employees (0 = all)")
    ap.add_argument("--employee", default="", help="target one employees.id (uuid)")
    ap.add_argument("--dry-run", action="store_true", help="list the work without modifying database")
    ap.add_argument("--force", action="store_true", help="re-enqueue IPCRs already completed")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    client = get_service_db()

    cycle_rows = (
        client.table("performance_cycles")
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
        client.table("target_settings")
        .select("id, employee_id, cycle_id")
        .eq("cycle_id", args.cycle)
        .eq("status", "approved")
        .eq("phase2_status", "completed")
    )
    if args.employee:
        query = query.eq("employee_id", args.employee)
    rows = query.execute().data or []
    if not rows:
        print("No finalized IPCR target settings found for this cycle.")
        return 0

    done_targets: Set[str] = set()
    if not args.force:
        # Check existing completed runs in competency_assessment_runs
        runs = (
            client.table("competency_assessment_runs")
            .select("target_setting_id, status")
            .eq("cycle_id", args.cycle)
            .eq("stage", "assessing")
            .execute()
        ).data or []
        for r in runs:
            if r.get("status") in ("complete", "pending", "running"):
                done_targets.add(str(r["target_setting_id"]))

        # Also check employee_competencies for already assessed employees
        existing_comps = (
            client.table("employee_competencies")
            .select("employee_id")
            .eq("cycle_id", args.cycle)
            .execute()
        ).data or []
        assessed_employees = {str(r["employee_id"]) for r in existing_comps}
    else:
        assessed_employees = set()

    pending_rows = [
        r for r in rows
        if str(r["id"]) not in done_targets and str(r["employee_id"]) not in assessed_employees
    ]

    if args.limit and args.limit > 0:
        pending_rows = pending_rows[: args.limit]

    print(
        f"{len(rows)} finalized IPCR(s); {len(rows) - len(pending_rows)} already queued or assessed; "
        f"{len(pending_rows)} to enqueue."
    )

    if args.dry_run or not pending_rows:
        for r in pending_rows:
            print(f"  would enqueue assessing run for employee {r['employee_id']} (target_setting {r['id']})")
        return 0

    enqueued_count = 0
    for r in pending_rows:
        payload = {
            "target_setting_id": r["id"],
            "employee_id": r["employee_id"],
            "cycle_id": r["cycle_id"],
            "stage": "assessing",
            "status": "pending",
            "attempts": 0,
            "last_error": None,
        }
        client.table("competency_assessment_runs").upsert(
            [payload],
            on_conflict="target_setting_id,stage"
        ).execute()
        enqueued_count += 1
        print(f"  enqueued target_setting {r['id']} (employee {r['employee_id']})")

    print(f"\nSuccessfully enqueued {enqueued_count} run(s) into competency_assessment_runs.")
    print("To process them, run:\n    python run_competency_queue.py --once")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
