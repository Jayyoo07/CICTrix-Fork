"""Run the IPCR competency queue runner to process background matching & assessment runs.

Plan: docs/plans/2026-10-27-sor-previous-semester-competency.md (Step 5)

Why a queue runner:
Target setting approval (Phase 1) enqueues `matching`, and evaluation approval
(Phase 2) enqueues `assessing` in `competency_assessment_runs`. This runner
claims pending runs in FIFO order (`requested_at asc`), dispatches to the
corresponding stage, records attempt count and last error, and retires failed jobs
after 3 attempts.

Usage:
    python run_competency_queue.py --once                   # single batch, then exit
    python run_competency_queue.py --once --limit 10        # process up to 10 jobs
    python run_competency_queue.py --dry-run                # show pending jobs without processing
    python run_competency_queue.py --retry-failed           # reset failed runs (<3 attempts) to pending
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure sys.stdout handles UTF-8 on Windows
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Make `app` importable when script is executed directly
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from app.core.config import settings
    from app.core.supabase_client import db
    from app.routes.competency_assessment import (
        CompetencyAssessmentRequest,
        assess_employee_competencies,
        match_employee_targets,
    )
except Exception as exc:  # noqa: BLE001
    print(f"Could not load application dependencies: {exc}\n")
    print("Ensure backend/.env is populated.")
    raise SystemExit(2) from exc


def get_service_db():
    return db.get_service_client()


def get_pending_runs(client, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Claims pending runs from competency_assessment_runs table
    where status = 'pending', ordered by requested_at asc.
    """
    query = (
        client.table("competency_assessment_runs")
        .select("*")
        .eq("status", "pending")
        .order("requested_at", desc=False)
    )
    if limit is not None and limit > 0:
        query = query.limit(limit)
    res = query.execute()
    return res.data or []


def claim_run(client, run_id: str) -> bool:
    """
    Atomically claim a pending run by transitioning status to 'running'
    and setting started_at timestamp.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    res = (
        client.table("competency_assessment_runs")
        .update({"status": "running", "started_at": now_iso})
        .eq("id", run_id)
        .eq("status", "pending")
        .execute()
    )
    return bool(res.data)


def complete_run(client, run_id: str) -> None:
    """
    Marks a run as complete upon successful stage processing.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    client.table("competency_assessment_runs").update({
        "status": "complete",
        "finished_at": now_iso,
        "last_error": None,
    }).eq("id", run_id).execute()


def fail_run(
    client,
    run_id: str,
    current_attempts: int,
    error_message: str,
    max_retries: int = 3,
) -> Dict[str, Any]:
    """
    Updates status to 'failed' on exception with last_error and attempts = attempts + 1.
    Max 3 attempts before leaving in 'failed' status permanently.
    """
    new_attempts = (current_attempts or 0) + 1
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": "failed",
        "attempts": new_attempts,
        "last_error": error_message,
        "finished_at": now_iso,
    }
    client.table("competency_assessment_runs").update(payload).eq("id", run_id).execute()
    return payload


def retry_eligible_runs(client, max_retries: int = 3) -> int:
    """
    Resets failed runs with attempts < max_retries back to 'pending'.
    Runs with attempts >= max_retries remain 'failed' permanently.
    """
    res = (
        client.table("competency_assessment_runs")
        .select("id")
        .eq("status", "failed")
        .lt("attempts", max_retries)
        .execute()
    )
    failed_rows = res.data or []
    if not failed_rows:
        return 0
    ids = [r["id"] for r in failed_rows]
    client.table("competency_assessment_runs").update({
        "status": "pending"
    }).in_("id", ids).execute()
    return len(ids)


async def dispatch_stage(
    stage: str,
    employee_id: str,
    cycle_id: Optional[int],
    client: Optional[Any] = None,
) -> Any:
    """
    Dispatches run based on stage:
    - if stage == 'matching': calls match_employee_targets(employee_id, cycle_id)
    - if stage == 'assessing': calls assess_employee_competencies(CompetencyAssessmentRequest(employee_id=employee_id, cycle_id=cycle_id))
    """
    if stage == "matching":
        return await match_employee_targets(employee_id=employee_id, cycle_id=cycle_id, client=client)
    elif stage == "assessing":
        req = CompetencyAssessmentRequest(employee_id=employee_id, cycle_id=cycle_id)
        return await assess_employee_competencies(req)
    else:
        raise ValueError(f"Unknown queue stage: {stage}")


async def process_single_run(
    client,
    run: Dict[str, Any],
    max_retries: int = 3,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Process a single claimed run:
    1. Mark running
    2. Dispatch by stage
    3. Complete or fail with attempt increment
    """
    run_id = str(run["id"])
    stage = run.get("stage", "")
    employee_id = str(run.get("employee_id", ""))
    cycle_id = run.get("cycle_id")
    current_attempts = run.get("attempts") or 0

    if dry_run:
        print(f"  [dry-run] Would process run {run_id} ({stage}) for employee {employee_id}, cycle {cycle_id}")
        return {
            "run_id": run_id,
            "status": "dry_run",
            "stage": stage,
            "employee_id": employee_id,
            "cycle_id": cycle_id,
        }

    claimed = claim_run(client, run_id)
    if not claimed:
        return {
            "run_id": run_id,
            "status": "skipped",
            "reason": "already_claimed_or_not_pending",
        }

    try:
        await dispatch_stage(stage=stage, employee_id=employee_id, cycle_id=cycle_id, client=client)
        complete_run(client, run_id)
        print(f"  [ok] Run {run_id} ({stage}) completed for employee {employee_id}")
        return {
            "run_id": run_id,
            "status": "complete",
            "stage": stage,
            "employee_id": employee_id,
            "cycle_id": cycle_id,
        }
    except Exception as exc:
        err_msg = str(exc)
        fail_payload = fail_run(
            client=client,
            run_id=run_id,
            current_attempts=current_attempts,
            error_message=err_msg,
            max_retries=max_retries,
        )
        attempts = fail_payload["attempts"]
        is_terminal = attempts >= max_retries
        status_desc = "PERMANENTLY FAILED" if is_terminal else f"failed (attempt {attempts}/{max_retries})"
        print(f"  [failed] Run {run_id} ({stage}) {status_desc}: {err_msg}")
        return {
            "run_id": run_id,
            "status": "failed",
            "stage": stage,
            "employee_id": employee_id,
            "cycle_id": cycle_id,
            "attempts": attempts,
            "error": err_msg,
            "terminal": is_terminal,
        }


async def drain_queue(
    client,
    limit: Optional[int] = None,
    retry_failed: bool = False,
    max_retries: int = 3,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Claims and drains pending jobs from competency_assessment_runs table.
    """
    retried_count = 0
    if retry_failed and not dry_run:
        retried_count = retry_eligible_runs(client, max_retries=max_retries)
        if retried_count > 0:
            print(f"Re-enqueued {retried_count} failed job(s) for retry.")

    pending_runs = get_pending_runs(client, limit=limit)
    if not pending_runs:
        return {
            "total": 0,
            "succeeded": 0,
            "failed": 0,
            "retried_count": retried_count,
            "results": [],
        }

    print(f"Found {len(pending_runs)} pending run(s) to process.")
    results = []
    for run in pending_runs:
        res = await process_single_run(
            client=client,
            run=run,
            max_retries=max_retries,
            dry_run=dry_run,
        )
        results.append(res)

    succeeded = sum(1 for r in results if r.get("status") == "complete")
    failed = sum(1 for r in results if r.get("status") == "failed")
    return {
        "total": len(results),
        "succeeded": succeeded,
        "failed": failed,
        "retried_count": retried_count,
        "results": results,
    }


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Competency assessment queue runner.")
    ap.add_argument("--once", action="store_true", help="run single batch/iteration and exit")
    ap.add_argument("--limit", type=int, default=0, help="max jobs to process per iteration (0 = all pending)")
    ap.add_argument("--dry-run", action="store_true", help="inspect pending jobs without modifying")
    ap.add_argument("--retry-failed", action="store_true", help="reset eligible failed runs (< 3 attempts) to pending")
    ap.add_argument("--poll-interval", type=float, default=10.0, help="sleep seconds between iterations when not in --once mode")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    client = get_service_db()
    limit = args.limit if args.limit > 0 else None

    print(f"Competency Queue Runner started (once={args.once}, limit={args.limit}, dry_run={args.dry_run})")

    if args.once or args.dry_run:
        summary = asyncio.run(
            drain_queue(
                client=client,
                limit=limit,
                retry_failed=args.retry_failed,
                dry_run=args.dry_run,
            )
        )
        print(f"\nDone: {summary['succeeded']} succeeded, {summary['failed']} failed out of {summary['total']} processed.")
        return 1 if summary["failed"] > 0 else 0

    # Continuous polling loop
    try:
        while True:
            summary = asyncio.run(
                drain_queue(
                    client=client,
                    limit=limit,
                    retry_failed=args.retry_failed,
                    dry_run=args.dry_run,
                )
            )
            if summary["total"] > 0:
                print(f"Batch processed: {summary['succeeded']} succeeded, {summary['failed']} failed.")
            time.sleep(args.poll_interval)
    except KeyboardInterrupt:
        print("\nQueue runner stopped by user.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
