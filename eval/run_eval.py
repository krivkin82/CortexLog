from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone

from eval.rubric import score_output
from app.llm.response import generate_response

_REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_PATH = _REPO_ROOT / "tests" / "fixtures" / "journal_cases.json"
OUTPUT_PATH = _REPO_ROOT / "eval" / "outputs" / "eval_results.json"


def load_fixtures() -> list[dict]:
    with FIXTURE_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def run_case(case: dict) -> dict:
    model_result = generate_response(
        user_message=case["input"],
        mode=case["mode_expected"],
        retrieved_context=None,
        session_id=None
    )

    output_text = model_result.get("text", "").strip()
    score = score_output(output_text, case["rubric"])

    return {
        "id": case["id"],
        "title": case["title"],
        "mode_expected": case["mode_expected"],
        "tags": case.get("tags", []),
        "input_preview": case["input"][:300],
        "raw_output": output_text,
        "score": score
    }


def summarize(results: list[dict]) -> dict:
    total_cases = len(results)
    total_checks = 0
    total_passed = 0
    total_failed = 0

    for r in results:
        total_checks += r["score"]["passed"] + r["score"]["failed"]
        total_passed += r["score"]["passed"]
        total_failed += r["score"]["failed"]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total_cases": total_cases,
        "total_checks": total_checks,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "overall_pass_rate": round(total_passed / total_checks, 3) if total_checks else 1.0
    }


def main() -> None:
    fixtures = load_fixtures()
    results = [run_case(case) for case in fixtures]

    payload = {
        "summary": summarize(results),
        "results": results
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"Wrote results to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()