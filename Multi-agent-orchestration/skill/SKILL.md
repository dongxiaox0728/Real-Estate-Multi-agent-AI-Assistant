---
name: multi-agent-orchestration
description: >
  Single entry point for all supported real-estate requests in OpenClaw,
  including active property searches, market analysis, similar-listing
  recommendations, real-estate knowledge questions, terminology and
  abbreviation questions, mixed requests, and follow-up answers to
  clarification questions from an unfinished real-estate workflow. Questions
  such as "What does DOM mean?", "What is MLS?", "What is HOA?", and
  "What is a comp?" must be treated as supported real-estate knowledge
  requests and routed through this skill rather than answered from general
  model knowledge. Use the OpenClaw conversation history to continue unfinished
  workflows across turns. The skill also supports email requests for sending
  generated real-estate results through a draft-preview-approve-send workflow.
  The TypeScript orchestrator remains the source of truth for intent
  classification, routing, agent execution, email workflow control, and final
  output.
---

# Multi-Agent Real Estate Orchestrator

Use this skill as the only user-facing entry point for supported real-estate
requests.

Do not directly invoke the property-search, california-market-analytics,
recommendation-engine, or rag-knowledge-agent OpenClaw skills when this
orchestration skill is available. Those are internal components of the
TypeScript orchestrator.

## Skill Selection and Trigger Rules

OpenClaw must select this orchestration skill for any query that can reasonably
be interpreted as a real-estate request, including short terminology or
abbreviation questions that may also have meanings in other domains.

Examples that must invoke this skill include:

- `What does DOM mean?`
- `What is DOM?`
- `What does MLS mean?`
- `What is HOA?`
- `What is a comp?`
- `What does contingent mean?`
- `What does pending mean?`
- `What is list price?`
- `What is price per square foot?`
- `Explain cap rate.`
- `Email this to me.`
- `Email these listings to me at user@example.com.`
- `Give me the Irvine market trend and email it to user@example.com.`

Do not assume a programming, manufacturing, finance, or other general-domain
meaning for an ambiguous acronym when that acronym also has a common
real-estate meaning. When this skill is selected, pass the user's original
query to the orchestration CLI and let the TypeScript classifier and knowledge
agent determine the intended real-estate answer.

For example, a standalone query such as `What does DOM mean?` is a supported
real-estate knowledge request for this skill. OpenClaw must invoke the
orchestration CLI instead of directly answering `Document Object Model` from
general model knowledge.

## Supported Capabilities

The orchestrator handles:

- Property search: active listings based on location, price, bedrooms,
  bathrooms, property type, amenities, and other listing requirements.
- Market analysis: data-driven questions about prices, trends, sales activity,
  market conditions, and related metrics.
- Recommendation: similar listings based on a supported 10-digit listing ID.
- Knowledge: conceptual real-estate questions, terminology, abbreviations,
  definitions, and industry concepts answered through the RAG knowledge system.
  This explicitly includes short questions such as `What does DOM mean?`,
  `What is MLS?`, `What is HOA?`, and `What is a comp?`.
- Mixed intent: decomposes one request into intent-specific subqueries, runs
  the appropriate internal agents sequentially, and combines their results.
- Multi-turn clarification: continues an unfinished request across OpenClaw
  chat turns by using the conversation history to reconstruct the full working
  request before each one-shot CLI invocation.
- Email service: recognizes email requests through the TypeScript intent
  classifier, supports email-only follow-ups such as `Email this to me`, and
  supports mixed requests such as `Find me homes in Irvine and email them to
  user@example.com`. The orchestrator determines whether the email should use
  the current generated result or the most recent relevant result.
- Email safety workflow: formats the selected content for email, creates a
  pending draft, returns an email preview, requires explicit user approval
  before sending, and supports cancellation. An email must never be sent before
  the user explicitly approves the pending draft.

## Email Workflow Rules

Email is an action handled by the TypeScript classifier and orchestrator, not a
replacement for the existing property-search, market-analysis, recommendation,
or knowledge agents.

For email requests:

- Pass the user's email request through the orchestration CLI like any other
  supported real-estate request.
- Do not generate or send an email directly from OpenClaw.
- Let the TypeScript classifier identify the `email` intent and any accompanying
  content intent.
- For a mixed request such as `Give me the Irvine market trend and email it to
  user@example.com`, the content-generating intent must run first and the
  resulting content is then used for the email workflow.
- For an email-only follow-up such as `Email this to me`, `this` refers to the
  most recent completed real-estate response in the current OpenClaw
  conversation.
- Do NOT reconstruct or rerun the original real-estate question for an
  email-only follow-up.
- Do NOT repeat the previous real-estate answer in the WhatsApp reply before
  asking for the recipient or showing the email preview.
- Keep all email content passed between OpenClaw and the CLI as plain text.
- If the recipient email address is missing, return the orchestrator's request
  for an email address exactly as produced.
- When the orchestrator returns an email preview, return the full preview
  exactly as produced.
- Never treat an email preview as permission to send.
- Sending requires explicit approval such as `yes`, `send it`, `approve`, or
  `confirm`.
- A cancellation such as `no`, `cancel`, or `don't send` must not result in an
  email being sent.
- Never expose email credentials, app passwords, environment variables, or
  other secrets in the user-facing response.

## OpenClaw Execution Rules

For every supported real-estate request, including short terminology and
abbreviation questions, OpenClaw must use the TypeScript multi-agent
orchestration workflow instead of answering the request itself.

- Execute the local orchestration CLI from the actual
  `Multi-agent-orchestration` project directory.
- Use a one-shot CLI invocation for every turn.
- Never launch the CLI and wait for interactive stdin.
- Do not pass a userId argument.
- Treat the TypeScript orchestrator output as the source of truth.
- Do not replace the CLI output with Web Search, general model knowledge, or a
  separately generated answer.
- Do not directly invoke the four internal real-estate skills.
- If command execution fails, report the execution failure instead of
  fabricating a real-estate answer.

## Conversation Continuation Rules

The OpenClaw conversation history is the persistent state for multi-turn
workflows because each CLI invocation is one-shot and exits after producing one
response. Do not rely on in-memory TypeScript Maps surviving across WhatsApp
turns.

There are TWO different kinds of continuation behavior.

### 1. Unfinished real-estate clarification

A real-estate workflow is unfinished when the latest orchestration response is
a clarification question that must be answered before the original request can
be completed.

Examples include:

- `What price range are you looking for?`
- `How many bedrooms are you looking for?`
- `How many bathrooms do you want?`
- `Which city are you interested in?`
- `What property type are you looking for?`

For these clarification workflows:

1. Read the previous turns in the current OpenClaw conversation.
2. Keep the user's original real-estate request in context.
3. Keep every clarification answer the user has already supplied.
4. Identify the outstanding clarification question from the previous
   orchestration response.
5. Determine whether the user's current message answers that outstanding
   question.
6. If it does, treat the current message as a continuation even when it is only
   a short answer.
7. Reconstruct one complete, self-contained working query containing the
   original request and all still-relevant clarification answers.
8. Invoke the one-shot orchestration CLI with that reconstructed working query.
9. Do NOT pass only the short clarification answer to the CLI.
10. Repeat until the original real-estate request is complete.

### 2. Email workflow state

Email follow-ups use OpenClaw conversation history only to preserve the pending
email state across separate one-shot CLI invocations.

Do NOT reconstruct the original real-estate question after its answer has
already been completed. Reconstruct only the plain-text email state needed for
the next email action.

#### Email-only follow-up

If the user says `Email this to me`, `Send that to my email`, or similar:

- `this`, `that`, and `it` refer to the most recent completed real-estate
  response.
- Use the exact previous CLI response as the email body content.
- Preserve every emoji exactly.
- Preserve every newline and blank line exactly.
- Preserve bullets, list structure, spacing, punctuation, numbers, currency
  formatting, and plain-text/Markdown formatting exactly.
- Do not convert list items into prose.
- Do not summarize, paraphrase, normalize whitespace, flatten, regenerate, or
  otherwise rewrite the previous response before passing it to the CLI.
- Do not rerun its original property-search, market-analysis, recommendation,
  or knowledge agent.
- Do not show that previous response again in WhatsApp unless it is inside the
  email preview.

If no recipient is known, invoke the CLI so the orchestrator asks for the email
address.

#### Waiting for recipient

If the previous CLI response asked:

`Sure, what email address would you like me to send it to?`

and the user replies with an email address, do NOT pass only the bare email
address to the CLI.

Reconstruct only the pending email state in plain text:

`RECIPIENT: user@example.com`

`BODY: <most recent completed real-estate response>`

`EMAIL REQUEST: create a draft for this recipient using this body.`

Do not include or rerun the original real-estate question. The CLI should return
only the email preview.

#### Waiting for approval

If the previous CLI response was an email preview ending with:

`Reply "yes" to send or "no" to cancel.`

the exact pending email draft has already been persisted by the TypeScript
orchestrator.

For approval:

- Pass the user's approval message directly to the CLI.
- Examples include `yes`, `send it`, `approve`, or `confirm`.
- Do NOT reconstruct the recipient, subject, body, previous real-estate result,
  or email preview.
- Do NOT regenerate, summarize, paraphrase, flatten, normalize whitespace, or
  otherwise alter the pending email body.
- The TypeScript orchestrator must load the persisted pending draft and send
  that exact saved body.

Example:

```powershell
npx tsx src/cli.ts "yes"
```

For cancellation:

- Pass the user's cancellation message directly to the CLI.
- Examples include `no`, `cancel`, or `don't send`.
- Do NOT reconstruct the pending email.

Example:

```powershell
npx tsx src/cli.ts "no"
```

The approval/cancellation turn must not rerun any content-generating agent and
must not reconstruct any pending email details from conversation text.

Once the email is sent or cancelled, the email workflow is complete and the
pending email state must no longer be carried into later turns.

If the user clearly changes topics instead of answering an outstanding
clarification, recipient request, or approval prompt, treat the new message as
a new request rather than forcing it into the prior workflow.

## Working Query Reconstruction

The reconstructed query must preserve the meaning of the original request and
accumulate accepted clarification answers.

Example:

Original user request:

`What does DOM mean and find me homes in Irvine`

CLI response:

`What price range are you looking for?`

User reply:

`Under $900k`

Do NOT invoke:

```powershell
npx tsx src/cli.ts "Under $900k"
```

Instead reconstruct and invoke:

```powershell
npx tsx src/cli.ts "What does DOM mean and find me homes in Irvine under $900k"
```

If the next CLI response is:

`How many bedrooms are you looking for?`

and the user replies:

`At least 3`

invoke:

```powershell
npx tsx src/cli.ts "What does DOM mean and find me homes in Irvine under $900k with at least 3 bedrooms"
```

If the next CLI response is:

`How many bathrooms do you want?`

and the user replies:

`2`

invoke:

```powershell
npx tsx src/cli.ts "What does DOM mean and find me homes in Irvine under $900k with at least 3 bedrooms and 2 bathrooms"
```

This reconstruction must preserve every still-relevant intent from the original
request. In the example above, `What does DOM mean` must remain in the working
query on every continuation turn so that the knowledge intent is still
completed after the property-search requirements are satisfied.

Do not silently invent missing criteria. Only add information that came from
the user's messages.

## Routing Behavior

The OpenClaw skill must not perform the TypeScript agent routing itself.

OpenClaw may use conversation history only to:

- recognize that the current message continues an unfinished real-estate
  clarification workflow,
- reconstruct the cumulative working query for unfinished clarification
  workflows,
- recognize when an email follow-up refers to a previously completed
  real-estate response,
- preserve the exact previous CLI response when creating a new email draft,
  including emojis, newlines, blank lines, list structure, and spacing,
- carry forward recipient/body information only until the draft is created,
- once a pending draft exists, pass approval/cancellation messages directly to
  the CLI and let the TypeScript orchestrator load the persisted draft.

After reconstruction, the TypeScript classifier and orchestrator determine the
actual intents, subqueries, agent calls, and final response.

For a new complete request, pass the user's current message as-is.

For an unfinished real-estate clarification, pass the reconstructed cumulative
working query.

For an email follow-up, do not reconstruct or rerun the original real-estate
question.

When waiting for a recipient, carry forward the exact completed real-estate
response as the BODY, preserving emojis, newlines, blank lines, list structure,
spacing, punctuation, and formatting exactly.

When waiting for approval or cancellation, pass the user's message directly to
the CLI, for example `yes`, `send it`, `approve`, `no`, or `cancel`. Do not
include or reconstruct the recipient, subject, body, or preview because the
TypeScript orchestrator already persisted the exact pending draft.

## Invocation

Run the orchestration CLI from the project directory:

```powershell
cd C:\Users\xdx20\IDX-AI-Engineer\Multi-agent-orchestration
npx tsx src/cli.ts "<working-query>"
```

`<working-query>` means:

- the current message as-is for a new request,
- the reconstructed cumulative request for an unfinished real-estate
  clarification turn,
- the reconstructed recipient/body state only while waiting for a recipient,
  with the BODY copied exactly from the previous CLI response, or
- the user's approval/cancellation message as-is when a persisted email draft is
  waiting for approval.

Each invocation processes exactly one query, prints one response, and exits.

Do not invoke:

```powershell
npx tsx src/cli.ts
```

and wait for the user to type into stdin.

## Output Preservation Rules

The CLI stdout is the final user-facing response.

After a successful CLI execution:

- Return the complete stdout.
- Do not summarize it.
- Do not shorten it.
- Do not paraphrase it.
- Do not rewrite it.
- Do not remove sections.
- Do not add a replacement answer before or after it.
- Preserve Property Search, Market Analysis, Recommendations, and Knowledge
  sections exactly as produced by the orchestrator.
- Preserve email previews, email-address clarification prompts, email approval
  prompts, sent confirmations, and cancellation confirmations exactly as
  produced by the orchestrator.
- If the CLI returns a clarification question, return only that clarification
  question.
- Do not replace any CLI output with Web Search results.

Treat the CLI output as the final answer, not as source material for generating
another answer.
