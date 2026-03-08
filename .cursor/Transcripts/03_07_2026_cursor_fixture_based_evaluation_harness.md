# Fixture-based evaluation harness for AIC advice
_Exported on 3/7/2026 at 21:14:20 CST from Cursor (2.6.13)_

---

**User**

Objective
Create a fixture-based evaluation harness for AIC advice quality using 10 representative “golden prompts” modeled on prior high-quality conversations.

Requirements

Add tests/fixtures/journal_cases.json

Add eval/rubric.py

Add eval/run_eval.py

Each fixture must contain id, title, mode_expected, tags, input, rubric

Evaluation script must:

load fixtures

call generate_response()

save raw output

compute pass/fail rubric checks

write results to eval/outputs/eval_results.json

Important design rule

Do not append rubric instructions to the prompt text itself

Keep fixture input pure; rubric lives in fixture metadata and eval logic only

Success criteria

Script runs locally against all fixtures

Output file contains raw output and rubric scoring per case

Baseline can be saved before prompt/routing changes begin

"C:\Users\krivk\.cursor\Cursor Projects\AI Companion\tests\Fixtures\journal_cases.json"
"C:\Users\krivk\.cursor\Cursor Projects\AI Companion\eval\rubric.py"
"C:\Users\krivk\.cursor\Cursor Projects\AI Companion\eval\run_eval.py"

---

**Cursor**


Exploring the codebase to locate `generate_response`, any existing eval/fixtures, and the response shape so we can plan the fixture-based evaluation harness.



Reading the implementation and fixture structure in detail.



Checking project layout and how the eval script is run (working directory and imports):



Checking for an existing `eval/outputs` directory and how `rubric` is represented in the output:



Creating the plan.


---

**User**

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

---

**Cursor**


Implementing the plan step by step. Checking existing todos and starting work.



Paths are already robust. Adding run documentation and .gitkeep.



Adding a Windows run script for convenience:



Adding a Unix run script for cross-platform support:



Verifying setup and running the eval script:



Running the eval with correct PowerShell syntax:



Adding the repo root to PYTHONPATH so the `eval` package is found:



Updating run scripts to include the repo root in PYTHONPATH.



Reading the run scripts to fix PYTHONPATH:



Adding the repo root to PYTHONPATH so the `eval` package can be imported.



Running a quick import and fixture-load test to verify the setup:



Summary of what was implemented:

## Completed implementation

### 1. Fixture path
- Added `tests/fixtures/journal_cases.json` with 10 golden prompts (copied from `tests/Fixtures/`).
- Each fixture has `id`, `title`, `mode_expected`, `tags`, `input`, and `rubric`.

### 2. Path handling in `run_eval.py`
- Paths are resolved from the repo root via `Path(__file__).resolve().parent.parent`.
- Script works when run from the repo root or from `eval/`.

### 3. Run documentation and scripts
- **eval/README.md** – Prerequisites, run commands for Windows and Linux/macOS, and baseline capture.
- **eval/run.bat** – Windows batch script that sets `PYTHONPATH=aic-backend;.` and runs the eval.
- **eval/run.sh** – Bash script for Linux/macOS.

### 4. Output directory
- Added `eval/outputs/.gitkeep` so the outputs directory is tracked in git.

### PYTHONPATH fix
- `PYTHONPATH` now includes both `aic-backend` (for `app.llm.response`) and `.` (for the `eval` package).

### Verification
- Fixture loading works: 10 fixtures load from `tests/fixtures/journal_cases.json`.
- Full eval run was started in the background; it calls the LLM for each fixture and may take several minutes depending on the model.

**To run the eval:**
```powershell
# From repo root
$env:PYTHONPATH = "aic-backend;."; python eval/run_eval.py
```
Or use `eval/run.bat` (Windows) or `eval/run.sh` (Linux/macOS).

**To save a baseline:**
```powershell
Copy-Item eval/outputs/eval_results.json eval/outputs/baseline_results.json
```

---

**User**

Objective

Improve AIC advice quality for workplace/career reflective prompts by enforcing a fixed pragmatic advisory response scaffold.

Scope

Update prompt construction and routing only. No UI changes. No model swap. No major eval changes.

Requirements

Add a new response mode named advisor_workplace

Define its system prompt so outputs always use these exact sections:

What’s happening

What matters most

Two options with tradeoffs

What I’d do next

Talk track

Likelihood / reality check

Keep empathy brief and subordinate to analysis

Do not allow the response to end with only a question

Update routing logic so workplace/career/conflict/reputation-fear prompts go to advisor_workplace

Preserve existing journal behavior for softer non-workplace reflection

Optionally add a simple validator/retry if required sections are missing

Re-run eval fixtures and save updated results

Success criteria

Workplace fixtures show improved core_structure

Workplace fixtures include scripts more consistently

Reputation-fear fixtures include likelihood calibration more consistently

Responses feel more concrete and less generic

---

**Cursor**


Exploring the codebase to locate mode definitions, routing logic, and response generation.



Implementing the plan: creating a todo list and starting work.



Adding routing logic in routes.py: importing `is_workplace_prompt` and applying it when mode is journal.



Routing is in place. Adding an optional validator/retry for advisor_workplace. Checking response.py:



Adding an optional validator/retry in `response.py` using minimal inline checks to avoid importing `eval`:



Removing the duplicate function and adding retry logic to `generate_response`.



Adding retry logic to `generate_response`:



Verifying the implementation and removing the duplicate function.



Updating todos and running the eval.



Checking eval results and fixing the deprecation warning:



Fixing the deprecation warning and marking the final todo complete.



Fixing the datetime fix: use `timezone.utc` for compatibility.



Checking the current state and fixing the remaining issue:



Implementation is done. Summary:

## Summary of Changes

### 1. advisor_workplace system prompt ([aic-backend/app/llm/response.py](aic-backend/app/llm/response.py))
- Replaced the generic prompt with a fixed scaffold that requires:
  - What's happening
  - What matters most
  - Two options with tradeoffs
  - What I'd do next
  - Talk track
  - Likelihood / reality check
- Empathy kept short and secondary to analysis
- Explicit rule: do not end with only a question

### 2. Content-based routing ([aic-backend/app/llm/policy.py](aic-backend/app/llm/policy.py), [aic-backend/app/api/routes.py](aic-backend/app/api/routes.py))
- Added `WORKPLACE_ROUTING_KEYWORDS` (workplace, career, conflict, reputation, boss, coworker, etc.)
- Added `is_workplace_prompt(content)` to detect workplace/career/conflict/reputation-fear prompts
- In `post_chat_message`: when mode is `journal` and `is_workplace_prompt(request.content)`, mode is set to `advisor_workplace`
- Included `advisor_workplace` in `normalize_mode`’s allowed modes

### 3. Validator/retry ([aic-backend/app/llm/response.py](aic-backend/app/llm/response.py))
- Added `_has_required_advisor_sections()` to check for scaffold elements
- For `advisor_workplace`, if sections are missing, retries once with a stronger prompt appendix

### 4. Eval run
- Ran the eval harness; results saved to `eval/outputs/eval_results.json`
- Fixed deprecation warning in `run_eval.py` (switched from `datetime.utcnow()` to `datetime.now(timezone.utc)`)

### Eval results (workplace fixtures)
- **workplace_gemini_prompt_concern_01**: core_structure ✓, script_or_talk_track ✓, likelihood_calibration ✓, not_question_only_ending ✓ (4/5 checks)
- **workplace_modal_risk_01**: core_structure ✓, script_or_talk_track ✓, not_question_only_ending ✓ (3/4 checks)

Workplace fixtures now consistently use the scaffold and include scripts. Journal mode is unchanged for non-workplace prompts.

---

**User**

which file will tell me how the application chooses when to use the "journal" mode to guide the response

---

**Cursor**


Mode selection happens in two places:

1. **`aic-backend/app/api/routes.py`** – where the mode is chosen for each chat request:

```313:319:aic-backend/app/api/routes.py
@router.post("/chat")
def post_chat_message(request: ChatRequest) -> dict:
    mode = normalize_mode(request.mode)
    if detect_distress(request.content):
        mode = "crisis"
    elif mode == "journal" and is_workplace_prompt(request.content):
        mode = "advisor_workplace"
```

- `request.mode` defaults to `"journal"` (see `ChatRequest` around line 297).
- `normalize_mode` maps the requested mode to a valid one.
- Distress content overrides to `"crisis"`.
- Journal + workplace content overrides to `"advisor_workplace"`.

2. **`aic-backend/app/llm/policy.py`** – where `normalize_mode` and `is_workplace_prompt` are defined:

```41:46:aic-backend/app/llm/policy.py
def normalize_mode(mode: str | None) -> str:
    if not mode:
        return "journal"
    mode = mode.lower()
    if mode in {"journal", "coach", "exploration", "crisis", "advisor_workplace"}:
        return mode
    return "journal"
```

So **journal** is used when:
- The client sends `"journal"` or no mode, and
- The message is not distress (else → crisis), and
- The message is not workplace/career/conflict/reputation-fear (else → advisor_workplace).

The client’s mode selection UI is in the frontend (e.g. `aic-electron/renderer/`); the backend logic above is in `routes.py` and `policy.py`.

