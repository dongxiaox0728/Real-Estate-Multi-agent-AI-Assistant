# Property Search Agent

Use this skill when a user wants to find active property listings using structured listing filters.

This skill only searches active listings from `rets_property`. It does not handle sold comparables or market analytics.

Use the market analytics agent for aggregated market questions such as average prices, trends, sales volume, days on market, and buyer-versus-seller conditions.

## Inputs

- `query`: The user's current property-search message.
- `userId`: A stable identifier for the user. For WhatsApp, use the sender or peer ID supplied by the channel integration.

## Behavior

1. Parse structured property preferences from the user's current message.
2. Use the session's `pendingField` as fallback context when a short reply depends on the agent's previous question.
3. Merge newly detected preferences with the user's saved session without overwriting previously stored filters with `undefined`.
4. Before the first search, collect the required core and common fields:
   - city
   - price range
   - property type
   - bedroom preference
   - bathroom preference
5. Do not proactively ask for optional filters. If the user provides them, preserve them in the session and apply them to the search.
6. Once the core and common fields are complete, search active listings in `rets_property`.
7. Format returned listings using the active-listing property-card format.
8. After the first search, treat later filter-bearing messages as refinements:
   - merge the new filter into the existing session
   - immediately rerun the active-listing search
   - return the updated results in property-card format
9. Preserve all prior search preferences unless the user explicitly changes them or resets the session.
10. Clear the session when the user says `reset`, `clear`, or `start over`.
11. Ask only ONE follow-up question at a time. Do not combine multiple missing fields into one question. The conversation manager determines which single field should be requested next.
12. Do not independently generate or summarize missing-field questions from this document. Use the response returned by the TypeScript workflow as the user-facing response.

## Supported Search Fields

### Core fields

- city
- minimum price
- maximum price
- property type

### Common refinement fields

- minimum bedrooms
- maximum bedrooms
- minimum bathrooms
- maximum bathrooms

### Optional refinement fields

- minimum square footage
- maximum square footage
- minimum HOA
- maximum HOA
- pool preference
- view preference

Optional refinement fields are not required before the first search. They are applied whenever the user provides them.

## Pending Field Behavior

`pendingField` stores the field that the agent is currently waiting for after asking a follow-up question.

Supported pending fields:

- `city`
- `price`
- `propertyType`
- `beds`
- `baths`

The normal structured parser runs first. `pendingField` is only used as fallback context for short or ambiguous replies.

Examples:

```text
Agent: What price range are you looking for?
User: 1.2M
```

The parser interprets `1.2M` as a maximum price because `pendingField` is `price`.

```text
Agent: How many bedrooms are you looking for?
User: 3
```

The parser interprets `3` as the bedroom preference because `pendingField` is `beds`.

## Session Memory

Each user's session stores:

- `filters`: accumulated `PropertyFilters`
- `pendingField`: the field currently being requested, or `null`
- `lastResults`: the most recently returned active listings
- `conversationStep`: the current conversation turn count
- `hasSearched`: whether the first search has already completed

A stable `userId` must be reused for every message from the same user.

## Execution Flow

The implementation follows this sequence:

1. `active-listing-orchestration.ts`
2. `conversation-manager.ts`
3. `session-memory.ts`
4. `parse-property-query.ts`
5. `search-active-listings.ts`
6. `property-cards.ts`

The local CLI entrypoint is `src/cli.ts`.

## OpenClaw Execution Rules

For every active-listing request, OpenClaw must use the TypeScript property-search workflow instead of handling the conversation itself.

- Execute the local property-search agent through `src/cli.ts` from the actual `property-search-agent` project directory.
- Pass the user's current message into the workflow and reuse the same stable `userId` for every turn from the same sender.
- Treat the response produced by `handleActiveListingConversation` as the source of truth.
- Return that response to the user without replacing it with a separately generated follow-up question.
- Do not inspect the list of missing fields in this `SKILL.md` and ask for several of them at once.
- If the workflow returns a question, return only that one question.
- If the workflow returns search results, return the formatted property-card response.
- If command execution fails, report the execution failure instead of fabricating a property-search response from the instructions in this file.

The intended conversational behavior is:

```text
User: Find me homes in Los Angeles
Agent: What price range are you looking for?

User: Under 1.2M
Agent: What property type do you prefer—single family, condo, townhouse, or another type?

User: condo
Agent: How many bedrooms are you looking for?

User: 3
Agent: How many bathrooms are you looking for?

User: 2
Agent: [property cards]
```

### First-search flow

```text
User message
    ↓
active-listing-orchestration.ts
    ↓
conversation-manager.ts
    ↓
parse-property-query.ts
    ↓
session-memory.ts
    ↓
missing core/common field?
    ├── yes → ask follow-up and store pendingField
    └── no  → search-active-listings.ts
                  ↓
              rets_property
                  ↓
              property-cards.ts
```

### Post-search refinement flow

```text
User refinement
    ↓
parse new filter
    ↓
merge with existing session filters
    ↓
hasSearched = true
    ↓
search-active-listings.ts
    ↓
property-cards.ts
    ↓
return updated property cards
```

## OpenClaw Session Identity

The CLI attempts to read channel context from:

```text
OPENCLAW_CHANNEL_CONTEXT
```

When that environment variable contains JSON channel metadata, the CLI tries these fields in order:

1. `senderId`
2. `userId`
3. `peerId`
4. `from`
5. `channelId`

The selected value is passed to the orchestration entrypoint as:

```ts
const result = await handleActiveListingConversation({
  query: incomingMessageText,
  userId: stableSenderId,
});

return result.response;
```

The same sender must receive the same `userId` on every turn. Do not use a timestamp, random value, or per-message ID.

## Local Testing

From the `property-search-agent` directory, run:

```bash
npm run cli
```

or:

```bash
npx tsx src/cli.ts
```

Example first-search conversation:

```text
Find me condos in Los Angeles
1.2M
3
2
```

After the first search returns property cards, the user can continue refining:

```text
Only show listings with a pool
HOA under 500
Under 1500 sqft
```

Each recognized refinement should rerun the active-listing search and return a new set of property cards.

Use `reset`, `clear`, or `start over` to begin a new search session.

## Limitation

The current session store uses an in-memory `Map`. It persists only while the Node.js process remains running. If OpenClaw starts a new process for every message, session memory must be moved to MySQL, a JSON file, Redis, or another persistent store.
