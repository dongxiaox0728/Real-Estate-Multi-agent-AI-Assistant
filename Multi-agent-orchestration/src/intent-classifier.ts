import OpenAI from "openai";

export type AgentIntent =
  | "property_search"
  | "recommendation"
  | "knowledge"
  | "market_analysis"
  | "email"
  | "mixed"
  | "unknown";

export type RunnableAgentIntent = Exclude<
  AgentIntent,
  "mixed" | "unknown" | "email"
>;

export type ActionIntent = "email";
export type TaskIntent = RunnableAgentIntent | ActionIntent;

export interface IntentTask {
  intent: TaskIntent;
  query: string;
}

export interface IntentClassificationResult {
  primaryIntent: AgentIntent;
  intents: AgentIntent[];
  tasks: IntentTask[];
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const INTENT_MODEL =
  process.env.INTENT_CLASSIFIER_MODEL ?? "gpt-4.1-mini";

const LISTING_ID_PATTERN = /\b\d{10}\b/;

function containsListingId(query: string): boolean {
  return LISTING_ID_PATTERN.test(query);
}

function isTaskIntent(value: string): value is TaskIntent {
  return (
    value === "property_search" ||
    value === "recommendation" ||
    value === "knowledge" ||
    value === "market_analysis" ||
    value === "email"
  );
}

function mergeTasks(tasks: IntentTask[]): IntentTask[] {
  const merged = new Map<TaskIntent, string[]>();

  for (const task of tasks) {
    const query = task.query.trim();

    if (!query) {
      continue;
    }

    const existing = merged.get(task.intent) ?? [];
    existing.push(query);
    merged.set(task.intent, existing);
  }

  return Array.from(merged.entries()).map(([intent, queries]) => ({
    intent,
    query: [...new Set(queries)].join(" "),
  }));
}

async function classifyAndDecomposeQuery(
  query: string
): Promise<IntentTask[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required for semantic intent classification."
    );
  }

  const response = await openai.chat.completions.create({
    model: INTENT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
You are an intent classifier and query decomposer for a real-estate multi-agent system.

Your job has TWO parts:
1. Detect every intent present in the user's request.
2. Rewrite the request into one focused subquery for each detected intent.

Each subquery must contain ONLY the information needed by that intent's agent.
Do not send unrelated parts of a mixed request to an agent.
Preserve important constraints such as location, price, bedrooms, bathrooms,
property type, dates, metrics, amenities, and listing IDs.

Supported intents:

1. property_search
The user wants to find, search, browse, or see real-estate listings or properties
that match requested criteria.

Examples:
- "Find me a house in Irvine under $1 million."
- "Show me 3-bedroom homes with a pool."
- "I'm looking for condos near downtown."

2. recommendation
The user wants recommendations or similar listings based on a specific 10-digit
listing ID. The recommendation subquery must keep the listing ID.

Examples:
- "Find homes similar to listing 1234567890."
- "Recommend properties like 9876543210."

3. knowledge
The user asks for a definition, explanation, meaning, or conceptual understanding
of a real-estate term, process, document, rule, or concept.

Examples:
- "What does DOM mean?"
- "Explain escrow."
- "How does a mortgage work?"
- "What is an MLS?"

4. market_analysis
The user asks for data-driven real-estate market information such as statistics,
calculations, summaries, comparisons, trends, changes over time, sales activity,
pricing metrics, or market conditions.

Examples:
- "What is the average close price in Los Angeles?"
- "Are prices rising in Irvine?"
- "Give me a market summary for Pasadena."
- "What is the average DOM in Irvine?"

5. email
The user wants the system to email real-estate information, a current result,
or the previous assistant result. This is an action intent. Preserve any recipient
email address exactly as provided. Do not invent an email address.

Examples:
- "Email this to me at alex@example.com."
- "Send these listings to alex@example.com."
- "Email the market report to alex@example.com."
- "Find homes in Irvine and email the results to alex@example.com."
- "alex@example.com" when the user is providing a requested recipient address.

Important email behavior:
- "Email this to me" => email
- "Find homes in Irvine and email them to me" => property_search + email
- "Give me the Irvine market trend and email it to alex@example.com" => market_analysis + email
- For mixed requests, the email subquery should refer to the result produced by the other intent, not repeat unrelated search criteria.
- Preserve a recipient address if one is present.
- Never invent a recipient address.
- Approval and cancellation are enforced by the orchestrator for safety.

Important distinctions:
- "What is close price?" => knowledge
- "What is the average close price in Los Angeles?" => market_analysis
- "What is DOM?" => knowledge
- "What is the average DOM in Irvine?" => market_analysis
- A request may contain multiple intents even if it is only one sentence.
- A 10-digit listing ID by itself does not mean property_search.
- If a user asks about a listing ID AND separately asks to search for other homes,
  return both recommendation and property_search.
- Do not include a property-search request inside a knowledge subquery.
- Do not include a knowledge request inside a property-search subquery.
- Do not include market-analysis content inside a knowledge subquery.
- Do not include the email action inside another agent's subquery. Return a separate email task.
- Do not invent constraints that the user did not provide.

Example mixed request:
User: "Find me homes in Irvine under $900k and explain what DOM means."
Return:
{
  "tasks": [
    {
      "intent": "property_search",
      "query": "Find me homes in Irvine under $900k."
    },
    {
      "intent": "knowledge",
      "query": "Explain what DOM means."
    }
  ]
}

Example email mixed request:
User: "Show me 3-bedroom homes in Irvine and email the results to alex@example.com."
Return:
{
  "tasks": [
    {
      "intent": "property_search",
      "query": "Show me 3-bedroom homes in Irvine."
    },
    {
      "intent": "email",
      "query": "Email the resulting property-search response to alex@example.com."
    }
  ]
}

Example three-intent request:
User: "Show me 3-bedroom homes in Irvine, tell me if prices are rising there, and explain escrow."
Return:
{
  "tasks": [
    {
      "intent": "property_search",
      "query": "Show me 3-bedroom homes in Irvine."
    },
    {
      "intent": "market_analysis",
      "query": "Are home prices rising in Irvine?"
    },
    {
      "intent": "knowledge",
      "query": "Explain escrow."
    }
  ]
}

Return ONLY valid JSON with this shape:
{
  "tasks": [
    {
      "intent": "property_search | recommendation | knowledge | market_analysis | email",
      "query": "focused subquery"
    }
  ]
}

If none of the supported intents apply, return:
{"tasks":[]}
        `.trim(),
      },
      {
        role: "user",
        content: query,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as {
      tasks?: Array<{ intent?: string; query?: string }>;
    };

    const tasks: IntentTask[] = [];

    for (const task of parsed.tasks ?? []) {
      if (
        !task.intent ||
        !isTaskIntent(task.intent) ||
        typeof task.query !== "string" ||
        !task.query.trim()
      ) {
        continue;
      }

      if (
        task.intent === "recommendation" &&
        !containsListingId(task.query)
      ) {
        continue;
      }

      tasks.push({
        intent: task.intent,
        query: task.query.trim(),
      });
    }

    return mergeTasks(tasks);
  } catch {
    console.warn(
      "Intent classifier returned invalid JSON:",
      raw
    );
    return [];
  }
}

function buildClassificationResult(
  tasks: IntentTask[]
): IntentClassificationResult {
  const mergedTasks = mergeTasks(tasks);
  const intents = mergedTasks.map((task) => task.intent);

  if (intents.length === 0) {
    return {
      primaryIntent: "unknown",
      intents: ["unknown"],
      tasks: [],
    };
  }

  if (intents.length > 1) {
    return {
      primaryIntent: "mixed",
      intents,
      tasks: mergedTasks,
    };
  }

  return {
    primaryIntent: intents[0],
    intents,
    tasks: mergedTasks,
  };
}

export async function classifyIntent(
  query: string
): Promise<IntentClassificationResult> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      primaryIntent: "unknown",
      intents: ["unknown"],
      tasks: [],
    };
  }

  const tasks = await classifyAndDecomposeQuery(trimmedQuery);

  if (
    containsListingId(trimmedQuery) &&
    !tasks.some((task) => task.intent === "recommendation")
  ) {
    tasks.push({
      intent: "recommendation",
      query: trimmedQuery,
    });
  }

  return buildClassificationResult(tasks);
}
