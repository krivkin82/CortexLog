Yes. The least-rewiring approach is: do not rebuild the whole orchestration system yet. Add a small “scaffold profile” layer that can be selected at runtime.

Right now your backend appears to have one main path:

`routes.py`
→ `generate_response(...)`
→ `orchestrate_response(...)`
→ classify contract
→ generate with contract
→ validate/retry

And for journal reflections specifically:

`/journal/reflect`
→ builds `reflect_prompt`
→ calls `generate_response(reflect_prompt, "journal", ...)`

That means you currently do not really have “Gemma raw vs Gemma scaffold A vs Gemma scaffold B.” You have one hardwired scaffold path.

The minimal technical fix is to introduce scaffold profiles.

## Recommended minimal architecture

Add a new concept:

```text
scaffold_version:
  current
  raw
  sharp_reflection
  structural_critic
  socratic
```

Then allow the API to pass that value into the response path.

You do not need a database migration at first. You can hardcode the scaffold profiles in one backend file and later move them to JSON/YAML/settings once the design settles.

## Important finding in your current code

This bit is probably a major culprit:

```python
def _asks_commiseration_project(user_message: str) -> bool:
    t = _message_lower(user_message)
    return (
        any(p in t for p in ("frustrated", "irritated", "annoyed", "overcooked"))
        and any(p in t for p in ("app", "software", "responses", "journal", "cortexlog"))
    )
```

Then:

```python
if _asks_commiseration_project(user_message):
    return ResponseContract(
        requested_action="listen",
        subject_matter="project_work",
        primary_intent="commiseration",
        domain="software_product_design",
        engagement_style="warm_commiserating",
        output_shape="commiseration_only",
        ...
    )
```

Your test prompt contains:

```text
worked on my AI journal app
felt frustrated
responses still feel shallow
```

So the harness may be detecting this as “commiseration about project frustration” and routing it toward `commiseration_only`.

That is exactly the wrong classification for this test. You explicitly asked:

```text
Don't be generic. Help me understand what's going on and suggest one concrete next step.
```

So the harness may be overriding a sharp analytical request into a soft supportive response shape.

This is a great bug/finding.

## The smallest useful change

Add a scaffold override that can bypass or reshape the response contract.

For testing, I would add three modes:

```text
current
raw
sharp
```

Where:

* `current` = your existing response contract orchestrator
* `raw` = send only the user prompt to the model, no contract classifier
* `sharp` = use a lightweight system prompt focused on tension, hidden assumption, and one next step

This gives you immediate A/B/C testing without changing the whole app.

## Suggested backend change

Create a new file:

```text
app/llm/scaffolds.py
```

Example:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


ScaffoldVersion = Literal[
    "current",
    "raw",
    "sharp_reflection",
    "structural_critic",
    "socratic"
]


@dataclass(frozen=True)
class ScaffoldProfile:
    id: str
    label: str
    system_prompt: str
    bypass_contract: bool = False
    temperature: float | None = None
    max_tokens: int | None = None


SCAFFOLDS: dict[str, ScaffoldProfile] = {
    "current": ScaffoldProfile(
        id="current",
        label="Current CortexLog Contract",
        system_prompt="",
        bypass_contract=False,
    ),

    "raw": ScaffoldProfile(
        id="raw",
        label="Raw Model",
        system_prompt="",
        bypass_contract=True,
    ),

    "sharp_reflection": ScaffoldProfile(
        id="sharp_reflection",
        label="Sharp Reflection",
        bypass_contract=True,
        temperature=0.75,
        max_tokens=900,
        system_prompt=(
            "You are a sharp journal reflection engine. "
            "Do not summarize the entry. Do not provide generic encouragement. "
            "Identify the most important tension, contradiction, or hidden assumption. "
            "Explain what may be going on in plain language. "
            "Offer exactly one concrete next step. "
            "Be thoughtful, specific, and willing to make an interpretive claim."
        ),
    ),

    "structural_critic": ScaffoldProfile(
        id="structural_critic",
        label="Structural Critic",
        bypass_contract=True,
        temperature=0.75,
        max_tokens=1000,
        system_prompt=(
            "You are a structural critic for journal entries. "
            "Your job is to identify the structure beneath the entry: "
            "the implied assumption, the unresolved tension, and the practical bottleneck. "
            "Avoid therapy-speak. Avoid generic validation. "
            "Name the core issue directly and give one concrete next step."
        ),
    ),

    "socratic": ScaffoldProfile(
        id="socratic",
        label="Socratic",
        bypass_contract=True,
        temperature=0.7,
        max_tokens=700,
        system_prompt=(
            "You are a Socratic journal companion. "
            "Do not answer with a broad reflection. "
            "Identify the key tension in the entry, then ask one pointed question "
            "that would help the user discover the next layer. "
            "Include one sentence explaining why that question matters."
        ),
    ),
}


def get_scaffold(scaffold_version: str | None) -> ScaffoldProfile:
    if not scaffold_version:
        return SCAFFOLDS["current"]
    return SCAFFOLDS.get(scaffold_version, SCAFFOLDS["current"])


def list_scaffolds() -> list[dict]:
    return [
        {
            "id": s.id,
            "label": s.label,
            "bypass_contract": s.bypass_contract,
        }
        for s in SCAFFOLDS.values()
    ]
```

## Then update `response.py`

Current:

```python
def generate_response(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
) -> Dict[str, Any]:
```

Change to:

```python
def generate_response(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
    scaffold_version: str | None = None,
) -> Dict[str, Any]:
```

Then:

```python
result = orchestrate_response(
    user_message=user_message,
    mode_hint=mode,
    retrieved_context=retrieved_context,
    session_id=session_id,
    scaffold_version=scaffold_version,
)
```

## Then update `orchestrate_response`

At the top of `response_contract.py`, import:

```python
from app.llm.scaffolds import get_scaffold
```

Change function signature:

```python
def orchestrate_response(
    user_message: str,
    mode_hint: str | None = None,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
    scaffold_version: str | None = None,
) -> dict[str, Any]:
```

Then near the top:

```python
scaffold = get_scaffold(scaffold_version)

if scaffold.bypass_contract:
    messages = []

    if scaffold.system_prompt:
        messages.append({"role": "system", "content": scaffold.system_prompt})

    if retrieved_context:
        context_block = "\n\n".join(retrieved_context[:5])
        messages.append({
            "role": "system",
            "content": f"Relevant prior context, use only if genuinely helpful:\n{context_block}",
        })

    messages.append({"role": "user", "content": user_message})

    response_text = chat_completion(
        messages,
        temperature=scaffold.temperature,
        max_tokens=scaffold.max_tokens,
    )

    return {
        "text": response_text,
        "debug": {
            "scaffold_version": scaffold.id,
            "bypass_contract": True,
        },
    }
```

Then let the existing current path continue unchanged.

This gives you a clean switch without ripping out the existing orchestrator.

## Then update API request models

For chat:

```python
class ChatRequest(BaseModel):
    content: str
    mode: str = "journal"
    session_id: str | None = None
    scaffold_version: str | None = None
```

Then pass it:

```python
response_payload = generate_response(
    request.content,
    mode,
    retrieved_context=[match["content"] for match in retrieval_result.get("matches", [])],
    session_id=request.session_id,
    scaffold_version=request.scaffold_version,
)
```

For journal reflection:

```python
class JournalReflectRequest(BaseModel):
    entry_id: str | None = None
    scaffold_version: str | None = None
```

Then:

```python
payload = generate_response(
    reflect_prompt,
    "journal",
    retrieved_context=retrieved_context,
    session_id=None,
    scaffold_version=req.scaffold_version,
)
```

## I would also change the journal reflect prompt

Right now this wrapper:

```python
reflect_prompt = (
    "Reflect on this journal entry only. Name explicit themes or tensions, "
    "connect ideas where it helps, and offer a concise synthesis—no platitudes. "
    "Do not diagnose. Do not end with a stock question about feelings; substance first.\n\n"
    f"{entry_content}"
)
```

This may itself be contaminating the test.

For scaffold testing, I would pass the raw entry into the selected scaffold and let the scaffold decide how to frame it.

So for `raw`, `sharp_reflection`, `structural_critic`, and `socratic`, use:

```python
reflect_prompt = entry_content
```

For `current`, keep the existing wrapper.

You can implement that simply:

```python
if req.scaffold_version and req.scaffold_version != "current":
    reflect_prompt = entry_content
else:
    reflect_prompt = (
        "Reflect on this journal entry only. Name explicit themes or tensions, "
        "connect ideas where it helps, and offer a concise synthesis—no platitudes. "
        "Do not diagnose. Do not end with a stock question about feelings; substance first.\n\n"
        f"{entry_content}"
    )
```

That is important because otherwise you are not testing the scaffold cleanly. You are testing scaffold plus old reflection wrapper.

## Add a scaffold listing endpoint

In `llm_routes.py`:

```python
from app.llm.scaffolds import list_scaffolds
```

Then:

```python
@router.get("/llm/scaffolds")
def llm_scaffolds() -> dict:
    return {"scaffolds": list_scaffolds()}
```

This lets the UI populate a dropdown later.

## Best testing endpoint: do not save results

I would add a dedicated endpoint that tests multiple scaffold versions against the same prompt without saving anything to the journal.

Example:

```python
class ScaffoldCompareRequest(BaseModel):
    prompt: str
    mode: str = "journal"
    scaffold_versions: list[str] = ["current", "raw", "sharp_reflection", "structural_critic", "socratic"]


@router.post("/llm/scaffold-compare")
def scaffold_compare(request: ScaffoldCompareRequest) -> dict:
    results = []

    for scaffold_version in request.scaffold_versions:
        try:
            payload = generate_response(
                request.prompt,
                request.mode,
                retrieved_context=[],
                session_id=None,
                scaffold_version=scaffold_version,
            )
            results.append({
                "scaffold_version": scaffold_version,
                "text": payload.get("text") or "",
                "debug": payload.get("debug") or {},
            })
        except Exception as e:
            results.append({
                "scaffold_version": scaffold_version,
                "error": str(e),
            })

    return {"results": results}
```

This is probably the most useful immediate feature.

Then you can run one prompt through:

* same model
* same temperature where possible
* same prompt
* different scaffold only

That isolates the scaffold effect.

## What I would not do yet

I would not start by building:

* database-backed scaffold editor
* full UI management screen
* prompt version history
* eval dashboard
* multi-agent comparison
* automatic scoring

Those are all reasonable later. Right now they would distract from the core question: which scaffold shape makes the response better?

## Best first set of scaffold profiles

I’d test these five:

### 1. current

Your existing contract system.

Purpose: baseline.

### 2. raw

No scaffold, no classifier, no validation.

Purpose: model capability baseline.

### 3. sharp_reflection

Find tension, hidden assumption, one concrete next step.

Purpose: likely best fit for your desired journal experience.

### 4. structural_critic

More analytical, less emotionally supportive.

Purpose: tests whether “critical mode” produces better depth.

### 5. socratic

One pointed question instead of an essay.

Purpose: tests Qwen’s insight that the journal may work better as a provocation engine than a reflection generator.

## The likely bug to fix even before profiles

This heuristic is too blunt:

```python
_asks_commiseration_project
```

It currently treats “frustrated + app/journal/responses” as commiseration.

But your actual prompt includes a clear instruction:

```text
Help me understand what's going on and suggest one concrete next step.
```

So this should override commiseration.

At minimum, modify the heuristic:

```python
def _asks_commiseration_project(user_message: str) -> bool:
    t = _message_lower(user_message)

    analytical_override = any(
        p in t
        for p in (
            "help me understand",
            "what's going on",
            "whats going on",
            "suggest one concrete next step",
            "concrete next step",
            "don't be generic",
            "do not be generic",
            "analyze",
            "diagnose",
        )
    )

    if analytical_override:
        return False

    return (
        any(p in t for p in ("frustrated", "irritated", "annoyed", "overcooked"))
        and any(p in t for p in ("app", "software", "responses", "journal", "cortexlog"))
    )
```

This is a small change and likely directly relevant to the bad response you saw.

## My recommended implementation order

1. Add `scaffolds.py`
2. Add `scaffold_version` parameter through:

   * `generate_response`
   * `orchestrate_response`
   * `ChatRequest`
   * `JournalReflectRequest`
3. Add bypass path for scaffold profiles
4. Add `/llm/scaffolds`
5. Add `/llm/scaffold-compare`
6. Patch `_asks_commiseration_project` to respect analytical override phrases

That is the smallest clean change set.

## The technical philosophy

Do not make scaffold versions deeply integrated yet.

Make them lightweight, selectable overlays:

```text
model stays same
provider stays same
retrieval can stay same or be disabled
only scaffold changes
```

That gives you an actual experiment.

The thing you want to measure is:

```text
same prompt + same model + different scaffold = quality delta
```

Once you can measure that, the rest becomes much easier.
