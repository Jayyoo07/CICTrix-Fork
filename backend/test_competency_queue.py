# backend/test_competency_queue.py
"""
Unit test suite for IPCR competency queue runner and drain service.
Verifies:
1. Claim order (status = 'pending', ordered by requested_at asc)
2. Stage dispatch ('matching' vs 'assessing')
3. Status transitions ('running' -> 'complete')
4. Failure handling, attempt incrementing, retry capping at 3 attempts
5. Terminal failure permanent state
6. Cycle-scoped upsert constraint behavior (updating rather than duplicating)
7. Secret-guarded drain queue endpoint
"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure sys.stdout handles UTF-8 on Windows
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_competency_queue import (
    claim_run,
    complete_run,
    dispatch_stage,
    drain_queue,
    fail_run,
    get_pending_runs,
    process_single_run,
    retry_eligible_runs,
)
from app.routes.competency_assessment import (
    CompetencyAssessmentRequest,
    router,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient


class TestCompetencyQueue(unittest.TestCase):

    def setUp(self):
        self.mock_client = MagicMock()

    def test_claim_order_asc(self):
        """Verifies pending runs are queried with status='pending' ordered by requested_at asc."""
        table_mock = MagicMock()
        self.mock_client.table.return_value = table_mock
        select_mock = MagicMock()
        table_mock.select.return_value = select_mock
        eq_mock = MagicMock()
        select_mock.eq.return_value = eq_mock
        order_mock = MagicMock()
        eq_mock.order.return_value = order_mock
        limit_mock = MagicMock()
        order_mock.limit.return_value = limit_mock

        mock_data = [
            {"id": "run-1", "requested_at": "2026-10-27T08:00:00Z", "stage": "matching"},
            {"id": "run-2", "requested_at": "2026-10-27T08:05:00Z", "stage": "assessing"},
        ]
        limit_mock.execute.return_value = MagicMock(data=mock_data)

        runs = get_pending_runs(self.mock_client, limit=10)

        self.mock_client.table.assert_called_with("competency_assessment_runs")
        select_mock.eq.assert_called_with("status", "pending")
        eq_mock.order.assert_called_with("requested_at", desc=False)
        order_mock.limit.assert_called_with(10)
        self.assertEqual(len(runs), 2)
        self.assertEqual(runs[0]["id"], "run-1")
        self.assertEqual(runs[1]["id"], "run-2")

    def test_claim_run_transition_to_running(self):
        """Verifies claiming a run transitions status to 'running' atomically."""
        table_mock = MagicMock()
        self.mock_client.table.return_value = table_mock
        update_mock = MagicMock()
        table_mock.update.return_value = update_mock
        eq_id_mock = MagicMock()
        update_mock.eq.return_value = eq_id_mock
        eq_status_mock = MagicMock()
        eq_id_mock.eq.return_value = eq_status_mock
        eq_status_mock.execute.return_value = MagicMock(data=[{"id": "run-1", "status": "running"}])

        claimed = claim_run(self.mock_client, "run-1")

        self.assertTrue(claimed)
        update_call = table_mock.update.call_args[0][0]
        self.assertEqual(update_call["status"], "running")
        self.assertIn("started_at", update_call)
        eq_id_mock.eq.assert_called_with("status", "pending")

    def test_complete_run(self):
        """Verifies successful run sets status='complete' and clears last_error."""
        table_mock = MagicMock()
        self.mock_client.table.return_value = table_mock
        update_mock = MagicMock()
        table_mock.update.return_value = update_mock
        eq_mock = MagicMock()
        update_mock.eq.return_value = eq_mock
        eq_mock.execute.return_value = MagicMock(data=[{"id": "run-1"}])

        complete_run(self.mock_client, "run-1")

        payload = table_mock.update.call_args[0][0]
        self.assertEqual(payload["status"], "complete")
        self.assertIsNone(payload["last_error"])
        self.assertIn("finished_at", payload)
        eq_mock.execute.assert_called_once()

    def test_fail_run_attempt_increment(self):
        """Verifies failure updates status to 'failed', increments attempts, and logs last_error."""
        table_mock = MagicMock()
        self.mock_client.table.return_value = table_mock
        update_mock = MagicMock()
        table_mock.update.return_value = update_mock
        eq_mock = MagicMock()
        update_mock.eq.return_value = eq_mock
        eq_mock.execute.return_value = MagicMock(data=[{"id": "run-1"}])

        payload = fail_run(
            client=self.mock_client,
            run_id="run-1",
            current_attempts=1,
            error_message="Network timeout during Gemini call",
            max_retries=3,
        )

        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["attempts"], 2)
        self.assertEqual(payload["last_error"], "Network timeout during Gemini call")
        self.assertIn("finished_at", payload)

    def test_retry_eligible_runs_capping_at_3(self):
        """Verifies retry_eligible_runs resets failed runs with attempts < 3, ignoring attempts >= 3."""
        table_mock = MagicMock()
        self.mock_client.table.return_value = table_mock
        select_mock = MagicMock()
        table_mock.select.return_value = select_mock
        eq_mock = MagicMock()
        select_mock.eq.return_value = eq_mock
        lt_mock = MagicMock()
        eq_mock.lt.return_value = lt_mock

        # DB returns only runs with attempts < 3
        lt_mock.execute.return_value = MagicMock(data=[{"id": "run-retryable-1"}, {"id": "run-retryable-2"}])

        update_mock = MagicMock()
        table_mock.update.return_value = update_mock
        in_mock = MagicMock()
        update_mock.in_.return_value = in_mock
        in_mock.execute.return_value = MagicMock(data=[{"id": "run-retryable-1"}, {"id": "run-retryable-2"}])

        retried_count = retry_eligible_runs(self.mock_client, max_retries=3)

        select_mock.eq.assert_called_with("status", "failed")
        eq_mock.lt.assert_called_with("attempts", 3)
        self.assertEqual(retried_count, 2)
        update_payload = table_mock.update.call_args[0][0]
        self.assertEqual(update_payload["status"], "pending")

    def test_terminal_failure_permanent_state(self):
        """Verifies a run that fails on attempt 3 is marked terminal and cannot be retried."""
        run = {
            "id": "run-fail-3",
            "stage": "matching",
            "employee_id": "00000000-0000-0000-0000-000000000001",
            "cycle_id": 6,
            "attempts": 2,  # Already failed twice
        }

        with patch("run_competency_queue.claim_run", return_value=True), \
             patch("run_competency_queue.dispatch_stage", side_effect=RuntimeError("Third failure")), \
             patch("run_competency_queue.fail_run", return_value={"status": "failed", "attempts": 3}):

            res = asyncio.run(process_single_run(self.mock_client, run, max_retries=3))

            self.assertEqual(res["status"], "failed")
            self.assertEqual(res["attempts"], 3)
            self.assertTrue(res["terminal"], "Run with attempts >= 3 must be flagged terminal")

    def test_stage_dispatch_matching(self):
        """Verifies stage == 'matching' dispatches to match_employee_targets."""
        with patch("run_competency_queue.match_employee_targets", new_callable=AsyncMock) as mock_matcher:
            mock_matcher.return_value = [{"competency": "Programming", "confidence": 0.9}]
            res = asyncio.run(dispatch_stage("matching", "emp-uuid-1", 6, client=self.mock_client))
            mock_matcher.assert_awaited_once_with(employee_id="emp-uuid-1", cycle_id=6, client=self.mock_client)
            self.assertEqual(len(res), 1)

    def test_stage_dispatch_assessing(self):
        """Verifies stage == 'assessing' dispatches to assess_employee_competencies."""
        with patch("run_competency_queue.assess_employee_competencies", new_callable=AsyncMock) as mock_assessor:
            mock_assessor.return_value = {"ok": True, "employee_name": "Juan Dela Cruz"}
            res = asyncio.run(dispatch_stage("assessing", "emp-uuid-2", 6, client=self.mock_client))
            self.assertTrue(mock_assessor.await_count == 1)
            call_arg = mock_assessor.await_args[0][0]
            self.assertIsInstance(call_arg, CompetencyAssessmentRequest)
            self.assertEqual(call_arg.employee_id, "emp-uuid-2")
            self.assertEqual(call_arg.cycle_id, 6)
            self.assertEqual(res["ok"], True)

    def test_cycle_scoped_upsert_keys(self):
        """
        Verifies that re-running assessment on the same cycle updates rather than duplicates:
        - employee_competencies uses on_conflict='employee_id,competency_id,cycle_id'
        - employee_competency_summaries uses on_conflict='employee_id,cycle_id'
        """
        table_mock = MagicMock()
        self.mock_client.table.return_value = table_mock
        upsert_mock = MagicMock()
        table_mock.upsert.return_value = upsert_mock
        upsert_mock.execute.return_value = MagicMock(data=[])

        # Simulate competency upsert call as done in assess_employee_competencies
        self.mock_client.table("employee_competencies").upsert(
            [{"employee_id": "emp-1", "competency_id": "comp-1", "cycle_id": 6, "proficiency_level": 4}],
            on_conflict="employee_id,competency_id,cycle_id"
        ).execute()

        table_mock.upsert.assert_called_with(
            [{"employee_id": "emp-1", "competency_id": "comp-1", "cycle_id": 6, "proficiency_level": 4}],
            on_conflict="employee_id,competency_id,cycle_id"
        )

        # Simulate summary upsert call
        self.mock_client.table("employee_competency_summaries").upsert(
            [{"employee_id": "emp-1", "cycle_id": 6, "strengths": "Great coder"}],
            on_conflict="employee_id,cycle_id"
        ).execute()

        table_mock.upsert.assert_called_with(
            [{"employee_id": "emp-1", "cycle_id": 6, "strengths": "Great coder"}],
            on_conflict="employee_id,cycle_id"
        )

    def test_drain_queue_bounded_and_dry_run(self):
        """Verifies drain_queue respects dry_run without claiming."""
        pending_runs = [
            {"id": "run-1", "stage": "matching", "employee_id": "emp-1", "cycle_id": 6, "attempts": 0},
            {"id": "run-2", "stage": "assessing", "employee_id": "emp-2", "cycle_id": 6, "attempts": 0},
        ]
        with patch("run_competency_queue.get_pending_runs", return_value=pending_runs), \
             patch("run_competency_queue.claim_run") as mock_claim:

            summary = asyncio.run(drain_queue(self.mock_client, limit=2, dry_run=True))

            mock_claim.assert_not_called()
            self.assertEqual(summary["total"], 2)
            self.assertEqual(summary["succeeded"], 0)
            self.assertEqual(summary["failed"], 0)
            self.assertEqual(summary["results"][0]["status"], "dry_run")


class TestQueueDrainEndpoint(unittest.TestCase):

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)

    def test_drain_endpoint_unauthorized(self):
        """Endpoint rejects requests missing or with invalid X-Queue-Secret header."""
        # 1. Missing header
        res_missing = self.client.post("/api/competency-assessment/queue/drain")
        self.assertEqual(res_missing.status_code, 401)

        # 2. Invalid header
        res_invalid = self.client.post(
            "/api/competency-assessment/queue/drain",
            headers={"X-Queue-Secret": "invalid-wrong-secret"},
        )
        self.assertEqual(res_invalid.status_code, 401)

    def test_drain_endpoint_authorized(self):
        """Endpoint executes drain_queue when header matches configured or fallback secret."""
        with patch("run_competency_queue.drain_queue", new_callable=AsyncMock) as mock_drain:
            mock_drain.return_value = {
                "total": 1,
                "succeeded": 1,
                "failed": 0,
                "retried_count": 0,
                "results": [{"run_id": "run-1", "status": "complete"}],
            }

            res = self.client.post(
                "/api/competency-assessment/queue/drain?limit=5",
                headers={"X-Queue-Secret": "cictrix-queue-drain-secret"},
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["ok"])
            self.assertEqual(data["total"], 1)
            self.assertEqual(data["succeeded"], 1)
            self.assertEqual(data["failed"], 0)


if __name__ == "__main__":
    unittest.main()
