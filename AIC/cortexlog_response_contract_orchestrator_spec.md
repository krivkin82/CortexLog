# CortexLog Response Contract Orchestrator — Implementation Spec

## Objective

Replace persona/mode routing with a response contract architecture.

CortexLog should not maintain an ever-growing list of personas such as journal companion, workplace advisor, product owner, relationship coach, technical architect, and so on. Instead, each user entry should be classified into a response contract that tells the model what kind of help is being requested, what domain the entry belongs to, what engagement style fits, what stakes are involved, and what answer shape should be used.

The result should be an AI journal that adapts to the entry instead of forcing the entry into a preselected persona.

## Current Problem

The current persona/mode approach is brittle.

Example failure case:

The user wrote a journal entry about needing multiple local profiles/accounts in CortexLog so they could keep a private journal separate from a demo/shareable journal. The user explicitly asked for pragmatic, direct engagement rather than emotional analysis.

The AI responded with an abstract reflection about privacy, vulnerability, personal growth, and duality. The response was polished, but it was the wrong kind of response.

The correct response should have treated the entry as a software/product design note and discussed profile boundaries, database scoping, retrieval separation, and the smallest useful implementation path.

## Design Principle

Build around response contracts, not personas.

A response contract answers:

- What is the user trying to do?
- What domain are they operating in?
- How do they want to be engaged?
- How serious or high-stakes is this?
- What shape should the response take?
- What should the response emphasize?

The response contract should become the primary behavior-shaping input for the final answer.

## High-Level Flow

1. Receive user entry/message.
2. Build recent conversation context.
3. Run response contract classification.
4. Generate final response using:
   - original user message
   - recent conversation context
   - retrieved context if available
   - response contract
5. Validate whether the response fits the contract.
6. Retry once if there is a clear mismatch.
7. Return final response.
8. Log the contract and validation result for debugging.

## Important Architectural Change

Remove persona-routing as the main architecture.

Existing modes such as `journal`, `coach`, `exploration`, `crisis`, and `advisor_workplace` should no longer be the primary routing system.

If preserving existing mode values is useful for UI/backward compatibility, treat the existing mode as a weak hint only.

Example:

- `journal` may suggest that reflective or sense-making responses are often appropriate.
- But if the user asks for pragmatic technical advice inside a journal entry, the response contract should override the mode hint.
- `advisor_workplace` can eventually be retired or converted into a response contract pattern.

## New Core Module

Create a new orchestrator module.


Responsibilities:

- classify the response contract
- build the final response prompt
- validate response fit
- retry once when the response clearly misses the contract
- expose debugging metadata in dev mode/logs

## Response Contract Schema

Use Pydantic if the project already uses it. Otherwise use a dataclass or TypedDict.

Suggested schema:

```python
class ResponseContract:
    primary_intent: str
    domain: str
    engagement_style: str
    stakes: str
    output_shape: str
    emphasis: list[str]
    needs_clarifying_question: bool
    confidence: float
    reason: str
    user_override_detected: bool
    override_summary: str | None
```

Use positive instruction fields instead of negative/anti-instruction fields. Prefer `emphasis` over `avoid`.

## Supported Values

### primary_intent

```text
reflection
sense_making
practical_advice
decision_support
technical_reasoning
research_explanation
planning
social_wording
memory_recall
comparison_over_time
commiseration
```

### domain

```text
personal
workplace
software_product_design
technical_debugging
relationships
health_wellness
finance
philosophy
history_research
household_family
creative
unknown
```

### engagement_style

```text
reflective
direct_pragmatic
analytical
warm_commiserating
challenging_but_kind
explanatory
brainstorming
concise
```

### stakes

```text
low
medium
high
acute
```

Guidance:

- `low`: ordinary reflection, low-risk planning, product ideas, creative exploration
- `medium`: interpersonal, workplace, family, money, health, or reputational consequences
- `high`: serious legal, medical, financial, employment, or safety implications
- `acute`: immediate safety crisis or serious risk of harm

### output_shape

```text
short_reflection
grounding_analysis
options_with_tradeoffs
implementation_recommendation
step_by_step_plan
talk_track
research_summary
decision_memo
debugging_guidance
pattern_observation
commiseration_only
```

### emphasis

Use this field to positively instruct what the response should do.

Suggested values:

```text
focus_on_practical_next_steps
separate_facts_from_interpretation
provide_concrete_examples
name_the_core_tradeoff
include_two_options_with_tradeoffs
include_recommended_next_step
include_talk_track
calibrate_likelihoods
explain_for_beginner
connect_to_user_context
keep_response_brief
offer_grounded_challenge
use_warmth_and_solidarity
surface_recurring_pattern
provide_architecture_guidance
provide_debugging_sequence
```

## User Intent Override

Explicit user instructions about response style or focus should strongly influence the contract.

Examples:

- “Be practical.”
- “Don’t focus on my emotions.”
- “Just listen.”
- “Give me architecture feedback.”
- “Challenge me.”
- “Keep it brief.”
- “Help me plan.”
- “Give me a script.”
- “Explain it like I’m new to this.”
- “Tell me what to do next.”

Example when an override is detected:

```json
{
  "user_override_detected": true,
  "override_summary": "User explicitly requested pragmatic, direct engagement rather than emotional analysis.",
  "engagement_style": "direct_pragmatic",
  "output_shape": "implementation_recommendation",
  "emphasis": [
    "focus_on_practical_next_steps",
    "provide_architecture_guidance",
    "provide_concrete_examples",
    "include_recommended_next_step"
  ]
}
```

The final generation prompt must treat this as high-priority.

## Pass 1 — Contract Classification

Before generating the final response, call the LLM once to classify the current user entry and recent context.

The classifier must output JSON only.

Classifier system prompt:

```text
You are the CortexLog response contract classifier.

Your job is to determine what kind of response would be most useful for the user's current entry.

Classify the entry into a response contract using the required JSON schema.

Focus on the user's explicit request, the practical job implied by the entry, the domain, the stakes, and the answer shape that would best serve them.

When the user explicitly asks for a style or focus, reflect that in user_override_detected and override_summary.

Use positive emphasis instructions that tell the response generator what to do.

Return valid JSON only.
```

Classifier user prompt template:

```text
Recent conversation context:
{recent_context}

Current user entry:
{user_message}

Return a JSON response contract with this schema:
{
  "primary_intent": "...",
  "domain": "...",
  "engagement_style": "...",
  "stakes": "...",
  "output_shape": "...",
  "emphasis": ["..."],
  "needs_clarifying_question": false,
  "confidence": 0.0,
  "reason": "...",
  "user_override_detected": false,
  "override_summary": null
}
```

Example classification for the profile/account failure case:

```json
{
  "primary_intent": "technical_reasoning",
  "domain": "software_product_design",
  "engagement_style": "direct_pragmatic",
  "stakes": "low",
  "output_shape": "implementation_recommendation",
  "emphasis": [
    "focus_on_practical_next_steps",
    "provide_architecture_guidance",
    "provide_concrete_examples",
    "name_the_core_tradeoff",
    "include_recommended_next_step"
  ],
  "needs_clarifying_question": false,
  "confidence": 0.9,
  "reason": "The user is asking for pragmatic feedback on a CortexLog architecture/product design issue and explicitly says not to focus on emotions.",
  "user_override_detected": true,
  "override_summary": "User explicitly requested pragmatic, direct engagement rather than emotional analysis."
}
```

## Pass 2 — Final Response Generation

Generate the final response using the response contract.

The final generation prompt should not expose the contract JSON to the user.

Generation system prompt:

```text
You are CortexLog, an AI journal companion and advisor.

Generate the response according to the response contract.

The contract defines the kind of help the user is asking for. Follow it closely.

If the contract calls for practical, technical, analytical, or decision-oriented help, provide that kind of help directly.

If the contract calls for reflection, witnessing, commiseration, or sense-making, provide that kind of response.

Respect explicit user overrides about tone, style, and focus.

Use the emphasis list as positive guidance for what the response should contain.

Preserve the user's agency and dignity. Be clear, grounded, and useful.
```

Generation prompt should include:

```text
Response contract:
{contract_json}

Retrieved context, if any:
{retrieved_context}

User entry:
{user_message}
```

## Pass 3 — Response Fit Validation

After final response generation, validate whether the response appears to match the response contract.

Use simple code heuristics first. Do not build a complex LLM judge yet unless needed later.

Validator responsibilities:

- confirm the response matches the intended output shape
- confirm explicit user overrides were respected
- confirm key emphasis items are represented
- retry once if there is a clear mismatch

Examples of simple heuristics:

### implementation_recommendation

If `output_shape == "implementation_recommendation"`, response should contain practical implementation language, such as:

```text
implement
table
field
profile
setting
step
database
scope
architecture
risk
```

Also allow overlap with nouns from the user’s message.

### options_with_tradeoffs

If `output_shape == "options_with_tradeoffs"`, response should include:

- at least two options/paths
- tradeoff language such as upside, downside, risk, cost, benefit, when it makes sense

### talk_track

If emphasis includes `include_talk_track`, response should include a phrase such as:

```text
You could say:
Here is a way to frame it:
I would phrase it like:
```

### calibrate_likelihoods

If emphasis includes `calibrate_likelihoods`, response should include terms such as:

```text
likely
unlikely
in most cases
the odds are
low probability
higher probability
```

### keep_response_brief

If emphasis includes `keep_response_brief`, response should be relatively concise.

## Retry Behavior

If validation fails, retry once.

Corrective prompt should be positive and specific.

Example corrective appendix:

```text
The previous response did not fully match the response contract because <details of mismatch>.

Rewrite the response using the contract more directly.

Focus especially on:
{missing_or_weak_emphasis_items}

Use the requested output shape:
{output_shape}

Respect this user override:
{override_summary}
```

Only retry once. Return the retry result.

## Logging / Debugging

In dev mode, log the response contract and validation metadata.

Suggested debug metadata:

```json
{
  "contract": {},
  "validation_passed": true,
  "retry_used": false,
  "validation_reason": null
}
```

This metadata should make it clear whether a bad answer was caused by:

- bad classification
- weak generation
- insufficient validation
- retrieval/context contamination

Do not show this debug object to the user by default.

## Integration With Existing Code

Update the response generation flow so `generate_response()` uses the orchestrator.

Current existing modes should be treated as compatibility hints, not final routing decisions.

Suggested flow:

```python
def generate_response(user_message, mode, retrieved_context=None, session_id=None):
    recent_context = load_recent_context(session_id)
    contract = classify_response_contract(
        user_message=user_message,
        recent_context=recent_context,
        mode_hint=mode,
        retrieved_context=retrieved_context,
    )

    response_text = generate_with_contract(
        user_message=user_message,
        recent_context=recent_context,
        retrieved_context=retrieved_context,
        contract=contract,
    )

    validation = validate_response_fit(
        response_text=response_text,
        contract=contract,
        user_message=user_message,
    )

    if not validation.passed:
        response_text = retry_with_contract_correction(...)

    return {
        "text": response_text,
        "debug": {
            "contract": contract,
            "validation": validation,
        }
    }
```

If the API cannot expose debug metadata yet, log it server-side.

## Specific Acceptance Test

Given this user entry:

```text
I got the AI journal to work again using npm run dev rather than repacking the .exe every time. I’m realizing I may need a second account/profile so I can keep a private journal separate from a demo/shareable journal. Maybe it’s one more column in a table like user_name? Let me know your thoughts not so much on my emotions, but in pragmatic, direct engagement terms.
```

Expected contract:

```json
{
  "primary_intent": "technical_reasoning",
  "domain": "software_product_design",
  "engagement_style": "direct_pragmatic",
  "stakes": "low",
  "output_shape": "implementation_recommendation",
  "emphasis": [
    "focus_on_practical_next_steps",
    "provide_architecture_guidance",
    "provide_concrete_examples",
    "name_the_core_tradeoff",
    "include_recommended_next_step"
  ],
  "needs_clarifying_question": false,
  "user_override_detected": true
}
```

Expected response content:

- discuss profile/account separation
- explain why `profile_id` or `workspace_id` is better than `user_name`
- identify which data needs to be scoped:
  - journal entries
  - chat sessions
  - memories
  - retrieved context
  - settings/model preferences
  - imported documents
- explain the privacy leak risk if retrieval is not profile-scoped
- recommend smallest useful implementation path
- keep the answer practical and direct

## Additional Acceptance Criteria

1. The response contract architecture replaces persona-routing as the primary response selection mechanism.
2. Existing mode values are preserved only as weak compatibility hints.
3. The system strongly respects explicit user style/focus instructions.
4. The system can produce practical technical guidance inside a journal entry without requiring a special product-owner persona.
5. The system can still produce reflective, warm, or commiserating responses when the user’s entry calls for that.
6. The system uses positive behavior instructions as the main guidance mechanism.
7. The system logs the response contract for debugging.
8. The system retries once when the generated response clearly fails to match the contract.

## Non-Goals

- Do not build a large persona taxonomy.
- Do not add a complex UI for contract selection yet.
- Do not expose response contract JSON to the user by default.
- Do not build a full LLM-as-judge validation system in this pass.
- Do not remove existing UI mode controls unless necessary for implementation.
- Do not change retrieval architecture in this task.

## End State

CortexLog should choose responses by understanding the job the current entry is asking it to perform.

The final system should feel adaptive:

- practical when the user asks for practical help
- reflective when the user is reflecting
- warm when the user needs solidarity
- analytical when the user is reasoning through a situation
- concise when the user asks for brevity
- concrete when the user asks for next steps

This is the scalable path for beta users with unpredictable journal content.
