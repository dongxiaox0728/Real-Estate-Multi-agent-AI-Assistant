import {
  classifyIntent,
  type AgentIntent,
  type IntentClassificationResult,
  type IntentTask,
  type RunnableAgentIntent,
} from "./intent-classifier";

import { handleActiveListingConversation } from "../../property-search-agent/src/active-listing-orchestration";
import { clearSession } from "../../property-search-agent/src/session-memory";
import { answerMarketQuestion } from "../../market-analysis-agent/src/answer-market-question";
import {
  recommendListings,
  type RecommendationResult,
} from "../../recommendation-engine-agent/src/recommendation-orchestrator";
import { answerKnowledgeQuestion } from "../../RAG-knowledge-agent/src/final-orchestrator";
import {
  createEmailDraft,
  approveEmailDraft,
  cancelEmailDraft,
  sendApprovedEmail,
  savePendingEmailDraft,
  getPendingEmailDraft,
  deletePendingEmailDraft,
} from "./email/email-tools";
import type { EmailDraft } from "./email/email-type";
import { formatEmail } from "./email/email-formatter";

type RunnableIntent = RunnableAgentIntent;

export interface OrchestratorResult {
  primaryIntent: AgentIntent;
  intents: AgentIntent[];
  results: Partial<Record<RunnableIntent, string>>;
  response: string;
}

type ActivePropertyConversation = {
  pendingTasks: IntentTask[];
};

const activePropertyConversations =
  new Map<string, ActivePropertyConversation>();

type LastResponse = {
  content: string;
  sourceIntent: AgentIntent;
};

const lastResponses = new Map<string, LastResponse>();

const LISTING_ID_PATTERN = /\b\d{10}\b/;
const EMAIL_ADDRESS_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function extractListingId(query: string): string {
  const match = query.match(LISTING_ID_PATTERN);

  if (!match) {
    throw new Error(
      "Recommendation intent was detected, but no 10-digit listing ID was found."
    );
  }

  return match[0];
}

function extractEmailAddress(query: string): string | null {
  const match = query.match(EMAIL_ADDRESS_PATTERN);
  return match ? match[0] : null;
}

function isEmailApproval(query: string): boolean {
  return /^(yes|yes send it|send it|send|approve|confirm)$/i.test(
    query.trim()
  );
}

function isEmailCancellation(query: string): boolean {
  return /^(no|cancel|cancel it|don't send|do not send|no thanks)$/i.test(
    query.trim()
  );
}

function extractLabeledSection(
  query: string,
  label: string,
  nextLabels: string[]
): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedNextLabels = nextLabels.map((nextLabel) =>
    nextLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const endPattern =
    escapedNextLabels.length > 0
      ? `(?=\\s+(?:${escapedNextLabels.join("|")}):|$)`
      : "$";
  const match = query.match(
    new RegExp(`${escapedLabel}:\\s*([\\s\\S]*?)${endPattern}`, "i")
  );

  return match?.[1]?.trim() || null;
}

function createDraftFromReconstructedApproval(
  query: string
): EmailDraft | null {
  if (
    !(
      /approves?\s+sending|send(?:ing)?\s+this\s+exact\s+pending\s+email/i.test(
        query
      ) ||
      /EMAIL ACTION:\s*send the exact previously previewed email now/i.test(
        query
      ) ||
      /EMAIL REQUEST:\s*send this exact approved email/i.test(
        query
      )
    )
  ) {
    return null;
  }

  const to = extractEmailAddress(query);
  const subject = extractLabeledSection(query, "Subject", ["Body"]);
  const body = extractLabeledSection(query, "Body", []);

  if (!to || !subject || !body) {
    return null;
  }

  return createEmailDraft(to, subject, body);
}

function inferEmailSourceIntent(content: string): AgentIntent {
  if (/matching homes|listed by|beds|baths|sqft|Condominium/i.test(content)) {
    return "property_search";
  }

  if (/similar listings|match score|recommended/i.test(content)) {
    return "recommendation";
  }

  if (/market|close price|price per square foot|trend/i.test(content)) {
    return "market_analysis";
  }

  if (/DOM|Days on Market|escrow|MLS|HOA|contingent|pending/i.test(content)) {
    return "knowledge";
  }

  return "unknown";
}

async function handlePlainEmailState(
  query: string,
  userId: string
): Promise<OrchestratorResult | null> {
  if (!/EMAIL REQUEST:/i.test(query)) {
    return null;
  }

  if (
    /USER CANCELLATION:\s*yes/i.test(query) &&
    /EMAIL REQUEST:\s*cancel this pending email/i.test(query)
  ) {
    return {
      primaryIntent: "email",
      intents: ["email"],
      results: {},
      response: "Email cancelled. I won't send it.",
    };
  }

  const body = extractLabeledSection(query, "BODY", [
    "USER APPROVAL",
    "USER CANCELLATION",
    "EMAIL REQUEST",
  ]);

  if (
    /USER APPROVAL:\s*yes/i.test(query) &&
    /EMAIL REQUEST:\s*send this exact approved email/i.test(query)
  ) {
    const to = extractEmailAddress(query);
    const subject = extractLabeledSection(query, "SUBJECT", [
      "BODY",
      "USER APPROVAL",
      "EMAIL REQUEST",
    ]);

    if (!to || !subject || !body) {
      return null;
    }

    const approvedDraft = approveEmailDraft(
      createEmailDraft(to, subject, body)
    );
    const sentDraft = await sendApprovedEmail(approvedDraft);
    deletePendingEmailDraft(userId);

    return {
      primaryIntent: "email",
      intents: ["email"],
      results: {},
      response: `Email sent to ${sentDraft.to}.`,
    };
  }

  if (!/EMAIL REQUEST:\s*create a draft/i.test(query)) {
    return null;
  }

  if (!body) {
    return null;
  }

  const recipient = extractEmailAddress(query);

  if (!recipient) {
    return {
      primaryIntent: "email",
      intents: ["email"],
      results: {},
      response:
        "Sure, what email address would you like me to send it to?",
    };
  }

  const formattedEmail = formatEmail(body, inferEmailSourceIntent(body));
  const draft = createEmailDraft(
    recipient,
    formattedEmail.subject,
    formattedEmail.body
  );
  savePendingEmailDraft(userId, draft);

  return {
    primaryIntent: "email",
    intents: ["email"],
    results: {},
    response: buildEmailPreview(draft),
  };
}

function createEmailDraftFromStructuredContext(
  query: string,
  userId: string
): OrchestratorResult | null {
  if (!/EMAIL ACTION:/i.test(query) || !/EMAIL CONTEXT ONLY:/i.test(query)) {
    return null;
  }

  const content = extractLabeledSection(query, "EMAIL CONTEXT ONLY", []);

  if (!content) {
    return null;
  }

  const recipient = extractEmailAddress(query);

  if (!recipient) {
    return {
      primaryIntent: "email",
      intents: ["email"],
      results: {},
      response:
        "Sure, what email address would you like me to send it to?",
    };
  }

  const formattedEmail = formatEmail(content, inferEmailSourceIntent(content));
  const draft = createEmailDraft(
    recipient,
    formattedEmail.subject,
    formattedEmail.body
  );
  savePendingEmailDraft(userId, draft);

  return {
    primaryIntent: "email",
    intents: ["email"],
    results: {},
    response: buildEmailPreview(draft),
  };
}

function rememberResponse(
  userId: string,
  response: string,
  sourceIntent: AgentIntent
): void {
  const trimmed = response.trim();

  if (trimmed) {
    lastResponses.set(userId, {
      content: trimmed,
      sourceIntent,
    });
  }
}

function buildEmailPreview(draft: EmailDraft): string {
  return [
    "📧 Email Preview",
    "",
    `To: ${draft.to}`,
    `Subject: ${draft.subject}`,
    "",
    draft.body,
    "",
    'Reply "yes" to send or "no" to cancel.',
  ].join("\n");
}

function formatCurrency(
  value: number | null | undefined
): string {
  if (value === null || value === undefined) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(
  value: number | null | undefined
): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return value.toLocaleString("en-US");
}

function formatPropertyType(value: string | null): string {
  if (!value) {
    return "Property type unavailable";
  }

  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRecommendations(
  recommendations: RecommendationResult[]
): string {
  if (recommendations.length === 0) {
    return "I couldn't find any similar listings.";
  }

  const cards = recommendations.map((listing, index) => {
    const details: string[] = [];

    if (
      listing.bedrooms !== null ||
      listing.bathrooms !== null ||
      listing.SquareFeet !== null
    ) {
      details.push(
        `🛏 ${listing.bedrooms ?? "N/A"} beds · ` +
        `🛁 ${listing.bathrooms ?? "N/A"} baths · ` +
        `📐 ${formatNumber(listing.SquareFeet)} sqft`
      );
    }

    return [
      `🏠 *${index + 1}. Listing ${listing.listingId}*`,
      listing.city
        ? `📍 ${listing.city}`
        : "",
      `💰 *${formatCurrency(listing.price)}*`,
      ...details,
      listing.propertyType || listing.yearBuilt
        ? `🏘️ ${formatPropertyType(listing.propertyType)}${
            listing.yearBuilt
              ? ` · Built ${listing.yearBuilt}`
              : ""
          }`
        : "",
      `🎯 Match score: *${listing.similarityScore.toFixed(1)}/100*`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    `I found ${recommendations.length} similar listings:`,
    "",
    cards.join("\n\n"),
  ].join("\n");
}

async function runAgentForTask(
  task: IntentTask,
  userId: string
): Promise<string> {
  switch (task.intent) {
    case "property_search": {
      const result = await handleActiveListingConversation({
        query: task.query,
        userId,
      });

      return result.response;
    }

    case "market_analysis":
      return answerMarketQuestion(task.query);

    case "recommendation": {
      const listingId = extractListingId(task.query);
      const recommendations = await recommendListings(listingId);

      return formatRecommendations(recommendations);
    }

    case "knowledge":
      return answerKnowledgeQuestion(task.query);

    case "email":
      throw new Error(
        "Email tasks must be handled after content-generation tasks."
      );
  }
}

function formatCombinedResponse(
  results: Partial<Record<RunnableIntent, string>>
): string {
  const entries = (
    Object.entries(results) as [RunnableIntent, string | undefined][]
  ).filter(([, response]) => response?.trim());

  if (entries.length === 0) {
    return "";
  }

  if (entries.length === 1) {
    return entries[0][1]!.trim();
  }

  return entries
    .map(([, response]) => response!.trim())
    .join("\n\n");
}

async function runPendingTasks(
  tasks: IntentTask[],
  userId: string,
  results: Partial<Record<RunnableIntent, string>>
): Promise<void> {
  for (const task of tasks) {
    if (
      task.intent === "property_search" ||
      task.intent === "email"
    ) {
      continue;
    }

    results[task.intent] = await runAgentForTask(
      task,
      userId
    );
  }
}

function runnableIntentsFromTasks(
  tasks: IntentTask[]
): RunnableIntent[] {
  return tasks
    .filter(
      (task): task is IntentTask & { intent: RunnableIntent } =>
        task.intent !== "email"
    )
    .map((task) => task.intent);
}

function allIntentsFromTasks(tasks: IntentTask[]): AgentIntent[] {
  return tasks.map((task) => task.intent);
}

function createEmailDraftFromTask(
  emailTask: IntentTask,
  userId: string,
  content: string,
  sourceIntent: AgentIntent
): OrchestratorResult {
  const recipient = extractEmailAddress(emailTask.query);

  if (!recipient) {
    rememberResponse(userId, content, sourceIntent);

    return {
      primaryIntent: "email",
      intents: ["email"],
      results: {},
      response:
        "Sure, what email address would you like me to send it to?",
    };
  }

  const formattedEmail = formatEmail(content, sourceIntent);

  const draft = createEmailDraft(
    recipient,
    formattedEmail.subject,
    formattedEmail.body
  );

  savePendingEmailDraft(userId, draft);

  return {
    primaryIntent: "email",
    intents: ["email"],
    results: {},
    response: buildEmailPreview(draft),
  };
}

async function handlePendingEmailApproval(
  query: string,
  userId: string
): Promise<OrchestratorResult | null> {
  // IMPORTANT:
  // Always prefer the exact persisted draft first.
  // OpenClaw may reconstruct/serialize approval prompts and flatten whitespace,
  // so rebuilding the email body from the query can destroy line breaks.
  const pendingDraft = getPendingEmailDraft(userId);

  if (pendingDraft) {
    // Plain local CLI approval, e.g. "yes", "send it", "approve"
    if (isEmailApproval(query)) {
      const approvedDraft = approveEmailDraft(pendingDraft);
      const sentDraft = await sendApprovedEmail(approvedDraft);

      deletePendingEmailDraft(userId);

      return {
        primaryIntent: "email",
        intents: ["email"],
        results: {},
        response: `✅ Email sent to ${sentDraft.to}.`,
      };
    }

    // OpenClaw may transform a simple approval into a structured instruction.
    // If it clearly means "send the pending email", still send the SAVED draft,
    // never a draft reconstructed from the transformed query.
    if (
      /approves?\s+sending|send(?:ing)?\s+this\s+exact\s+pending\s+email/i.test(
        query
      ) ||
      /EMAIL ACTION:\s*send the exact previously previewed email now/i.test(
        query
      ) ||
      /EMAIL REQUEST:\s*send this exact approved email/i.test(query) ||
      /USER APPROVAL:\s*yes/i.test(query)
    ) {
      const approvedDraft = approveEmailDraft(pendingDraft);
      const sentDraft = await sendApprovedEmail(approvedDraft);

      deletePendingEmailDraft(userId);

      return {
        primaryIntent: "email",
        intents: ["email"],
        results: {},
        response: `✅ Email sent to ${sentDraft.to}.`,
      };
    }

    if (
      isEmailCancellation(query) ||
      /USER CANCELLATION:\s*yes/i.test(query) ||
      /EMAIL REQUEST:\s*cancel this pending email/i.test(query)
    ) {
      cancelEmailDraft(pendingDraft);
      deletePendingEmailDraft(userId);

      return {
        primaryIntent: "email",
        intents: ["email"],
        results: {},
        response: "Email cancelled. I won't send it.",
      };
    }

    return {
      primaryIntent: "email",
      intents: ["email"],
      results: {},
      response:
        'You have an email waiting for approval. Reply "yes" to send it or "no" to cancel it.',
    };
  }

  // Fallback only when there is genuinely no saved draft.
  // This keeps compatibility with reconstructed OpenClaw requests, but avoids
  // using reconstruction during the normal preview -> approval flow.
  const reconstructedDraft = createDraftFromReconstructedApproval(query);

  if (reconstructedDraft) {
    const approvedDraft = approveEmailDraft(reconstructedDraft);
    const sentDraft = await sendApprovedEmail(approvedDraft);

    return {
      primaryIntent: "email",
      intents: ["email"],
      results: {},
      response: `Email sent to ${sentDraft.to}.`,
    };
  }

  return null;
}

export async function orchestrate(
  query: string,
  userId: string
): Promise<OrchestratorResult> {
  const trimmedQuery = query.trim();
  const trimmedUserId = userId.trim();

  if (!trimmedQuery) {
    return {
      primaryIntent: "unknown",
      intents: ["unknown"],
      results: {},
      response: "Please enter a request.",
    };
  }

  if (!trimmedUserId) {
    throw new Error("orchestrate requires a stable userId.");
  }

  // Check persisted pending email state BEFORE any OpenClaw-specific
  // reconstructed/plain-text email handling. This guarantees that approval
  // sends the exact saved draft body with its original line breaks.
  const pendingEmailResult = await handlePendingEmailApproval(
    trimmedQuery,
    trimmedUserId
  );

  if (pendingEmailResult) {
    return pendingEmailResult;
  }

  const plainEmailStateResult = await handlePlainEmailState(
    trimmedQuery,
    trimmedUserId
  );

  if (plainEmailStateResult) {
    return plainEmailStateResult;
  }

  const structuredEmailResult =
    createEmailDraftFromStructuredContext(trimmedQuery, trimmedUserId);

  if (structuredEmailResult) {
    return structuredEmailResult;
  }

  const activeConversation =
    activePropertyConversations.get(trimmedUserId);

  if (activeConversation) {
    const propertyResult =
      await handleActiveListingConversation({
        query: trimmedQuery,
        userId: trimmedUserId,
      });

    const allIntents: AgentIntent[] = [
      "property_search",
      ...allIntentsFromTasks(activeConversation.pendingTasks),
    ];

    const results: Partial<Record<RunnableIntent, string>> = {
      property_search: propertyResult.response,
    };

    if (propertyResult.status === "question") {
      return {
        primaryIntent:
          activeConversation.pendingTasks.length > 0
            ? "mixed"
            : "property_search",
        intents: allIntents,
        results,
        response: propertyResult.response,
      };
    }

    activePropertyConversations.delete(trimmedUserId);

    if (propertyResult.status === "reset") {
      return {
        primaryIntent: "property_search",
        intents: ["property_search"],
        results,
        response: propertyResult.response,
      };
    }

    await runPendingTasks(
      activeConversation.pendingTasks,
      trimmedUserId,
      results
    );

    const contentResponse = formatCombinedResponse(results);
    const remainingContentTasks = activeConversation.pendingTasks.filter(
      (task) => task.intent !== "email"
    );
    const sourceIntent: AgentIntent =
      remainingContentTasks.length > 0 ? "mixed" : "property_search";

    rememberResponse(
      trimmedUserId,
      contentResponse,
      sourceIntent
    );

    const emailTask = activeConversation.pendingTasks.find(
      (task) => task.intent === "email"
    );

    if (emailTask) {
      const emailResult = createEmailDraftFromTask(
        emailTask,
        trimmedUserId,
        contentResponse,
        sourceIntent
      );

      return {
        primaryIntent: "mixed",
        intents: allIntents,
        results,
        response: `${contentResponse}\n\n${emailResult.response}`,
      };
    }

    return {
      primaryIntent:
        activeConversation.pendingTasks.length > 0
          ? "mixed"
          : "property_search",
      intents: allIntents,
      results,
      response: contentResponse,
    };
  }

  const classification: IntentClassificationResult =
    await classifyIntent(trimmedQuery);

  if (classification.primaryIntent === "unknown") {
    return {
      primaryIntent: "unknown",
      intents: ["unknown"],
      results: {},
      response:
        "I'm not sure how to help with that. Try asking about property searches, similar listings, real-estate concepts, market trends, or emailing a result.",
    };
  }

  const tasks = classification.tasks;

  if (tasks.length === 0) {
    return {
      primaryIntent: "unknown",
      intents: ["unknown"],
      results: {},
      response:
        "I'm not sure how to help with that. Try asking about property searches, similar listings, real-estate concepts, market trends, or emailing a result.",
    };
  }

  const allIntents = allIntentsFromTasks(tasks);
  const contentIntents = runnableIntentsFromTasks(tasks);
  const results: Partial<Record<RunnableIntent, string>> = {};
  const emailTask = tasks.find(
    (task) => task.intent === "email"
  );
  const propertyTask = tasks.find(
    (task) => task.intent === "property_search"
  );

  if (propertyTask) {
    clearSession(trimmedUserId);

    const propertyResult =
      await handleActiveListingConversation({
        query: propertyTask.query,
        userId: trimmedUserId,
      });

    results.property_search = propertyResult.response;

    const pendingTasks = tasks.filter(
      (task) => task.intent !== "property_search"
    );

    if (propertyResult.status === "question") {
      activePropertyConversations.set(trimmedUserId, {
        pendingTasks,
      });

      return {
        primaryIntent:
          pendingTasks.length > 0
            ? "mixed"
            : "property_search",
        intents: allIntents,
        results,
        response: propertyResult.response,
      };
    }

    if (propertyResult.status === "reset") {
      activePropertyConversations.delete(trimmedUserId);

      return {
        primaryIntent: "property_search",
        intents: ["property_search"],
        results,
        response: propertyResult.response,
      };
    }

    await runPendingTasks(
      pendingTasks,
      trimmedUserId,
      results
    );

    const contentResponse = formatCombinedResponse(results);
    rememberResponse(
      trimmedUserId,
      contentResponse,
      pendingTasks.filter((task) => task.intent !== "email").length > 0
        ? "mixed"
        : "property_search"
    );

    if (emailTask) {
      const emailResult = createEmailDraftFromTask(
        emailTask,
        trimmedUserId,
        contentResponse,
        pendingTasks.filter((task) => task.intent !== "email").length > 0
          ? "mixed"
          : "property_search"
      );

      return {
        primaryIntent: "mixed",
        intents: allIntents,
        results,
        response: `${contentResponse}\n\n${emailResult.response}`,
      };
    }

    return {
      primaryIntent:
        pendingTasks.length > 0
          ? "mixed"
          : "property_search",
      intents: allIntents,
      results,
      response: contentResponse,
    };
  }

  for (const task of tasks) {
    if (task.intent === "email") {
      continue;
    }

    results[task.intent] = await runAgentForTask(
      task,
      trimmedUserId
    );
  }

  const currentResponse = formatCombinedResponse(results);

  const currentSourceIntent: AgentIntent =
    contentIntents.length > 1
      ? "mixed"
      : contentIntents.length === 1
        ? contentIntents[0]
        : "unknown";

  if (currentResponse) {
    rememberResponse(trimmedUserId, currentResponse, currentSourceIntent);
  }

  if (emailTask) {
    const previousResponse = lastResponses.get(trimmedUserId);
    const contentToEmail = currentResponse || previousResponse?.content;
    const sourceIntent = currentResponse
      ? currentSourceIntent
      : previousResponse?.sourceIntent ?? "unknown";

    if (!contentToEmail) {
      return {
        primaryIntent: "email",
        intents: ["email"],
        results: {},
        response:
          "I don't have a previous result to email yet. Ask me a property, market, recommendation, or real-estate question first.",
      };
    }

    const emailResult = createEmailDraftFromTask(
      emailTask,
      trimmedUserId,
      contentToEmail,
      sourceIntent
    );

    if (contentIntents.length > 0) {
      return {
        primaryIntent: "mixed",
        intents: allIntents,
        results,
        response: `${currentResponse}\n\n${emailResult.response}`,
      };
    }

    return emailResult;
  }

  return {
    primaryIntent:
      tasks.length > 1
        ? "mixed"
        : tasks[0].intent,
    intents: allIntents,
    results,
    response: currentResponse,
  };
}
