import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IMPORTANT:
 * These mock paths must exactly match the import strings used by
 * src/orchestrator.ts.
 */

vi.mock("../src/intent-classifier", () => ({
  classifyIntent: vi.fn(),
}));

vi.mock("../../property-search-agent/src/active-listing-orchestration", () => ({
  handleActiveListingConversation: vi.fn(),
}));

vi.mock("../../market-analysis-agent/src/answer-market-question", () => ({
  answerMarketQuestion: vi.fn(),
}));

vi.mock("../../recommendation-engine-agent/src/recommendation-orchestrator", () => ({
  recommendListings: vi.fn(),
}));

vi.mock("../../RAG-knowledge-agent/src/final-orchestrator", () => ({
  buildKnowledgeIndex: vi.fn(),
  answerKnowledgeQuestion: vi.fn(),
}));

import { classifyIntent } from "../src/intent-classifier";
import { orchestrate } from "../src/orchestrator";

import { handleActiveListingConversation } from "../../property-search-agent/src/active-listing-orchestration";
import { answerMarketQuestion } from "../../market-analysis-agent/src/answer-market-question";
import { recommendListings } from "../../recommendation-engine-agent/src/recommendation-orchestrator";
import {
  buildKnowledgeIndex,
  answerKnowledgeQuestion,
} from "../../RAG-knowledge-agent/src/final-orchestrator";

const mockedClassifyIntent = vi.mocked(classifyIntent);
const mockedPropertySearch = vi.mocked(handleActiveListingConversation);
const mockedMarketQuestion = vi.mocked(answerMarketQuestion);
const mockedRecommendListings = vi.mocked(recommendListings);
const mockedBuildKnowledgeIndex = vi.mocked(buildKnowledgeIndex);
const mockedAnswerKnowledgeQuestion = vi.mocked(answerKnowledgeQuestion);

describe("Week 9 multi-agent orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes a property-search intent only to the property search agent", async () => {
    mockedClassifyIntent.mockResolvedValue({
      primaryIntent: "property_search",
      intents: ["property_search"],
    });

    mockedPropertySearch.mockResolvedValue({
      status: "search",
      response: "Found 3 matching homes.",
    });

    const result = await orchestrate(
      "Find me homes in Pasadena",
      "user-123"
    );

    expect(mockedPropertySearch).toHaveBeenCalledTimes(1);
    expect(mockedPropertySearch).toHaveBeenCalledWith({
      query: "Find me homes in Pasadena",
      userId: "user-123",
    });

    expect(mockedMarketQuestion).not.toHaveBeenCalled();
    expect(mockedRecommendListings).not.toHaveBeenCalled();
    expect(mockedAnswerKnowledgeQuestion).not.toHaveBeenCalled();

    expect(result.primaryIntent).toBe("property_search");
    expect(result.intents).toEqual(["property_search"]);
    expect(result.response).toContain("Found 3 matching homes.");
  });

  it("routes a market-analysis intent only to the market agent", async () => {
    mockedClassifyIntent.mockResolvedValue({
      primaryIntent: "market_analysis",
      intents: ["market_analysis"],
    });

    mockedMarketQuestion.mockResolvedValue(
      "Pasadena prices increased over the last 12 months."
    );

    const result = await orchestrate(
      "Are prices rising in Pasadena?",
      "user-123"
    );

    expect(mockedMarketQuestion).toHaveBeenCalledTimes(1);
    expect(mockedMarketQuestion).toHaveBeenCalledWith(
      "Are prices rising in Pasadena?"
    );

    expect(mockedPropertySearch).not.toHaveBeenCalled();
    expect(mockedRecommendListings).not.toHaveBeenCalled();
    expect(mockedAnswerKnowledgeQuestion).not.toHaveBeenCalled();

    expect(result.primaryIntent).toBe("market_analysis");
    expect(result.response).toContain(
      "Pasadena prices increased over the last 12 months."
    );
  });

  it("routes a recommendation intent and extracts the 10-digit listing ID", async () => {
    mockedClassifyIntent.mockResolvedValue({
      primaryIntent: "recommendation",
      intents: ["recommendation"],
    });

    mockedRecommendListings.mockResolvedValue([] as any);

    const result = await orchestrate(
      "Show me listings similar to 1234567890",
      "user-123"
    );

    expect(mockedRecommendListings).toHaveBeenCalledTimes(1);
    expect(mockedRecommendListings).toHaveBeenCalledWith("1234567890");

    expect(mockedPropertySearch).not.toHaveBeenCalled();
    expect(mockedMarketQuestion).not.toHaveBeenCalled();
    expect(mockedAnswerKnowledgeQuestion).not.toHaveBeenCalled();

    expect(result.primaryIntent).toBe("recommendation");
  });

  it("routes a knowledge intent only to the RAG agent", async () => {
    mockedClassifyIntent.mockResolvedValue({
      primaryIntent: "knowledge",
      intents: ["knowledge"],
    });

    const fakeIndex = [{ id: "chunk-1" }] as any;

    mockedBuildKnowledgeIndex.mockResolvedValue(fakeIndex);
    mockedAnswerKnowledgeQuestion.mockResolvedValue(
      "DOM means Days on Market."
    );

    const result = await orchestrate(
      "What does DOM mean?",
      "user-123"
    );

    expect(mockedBuildKnowledgeIndex).toHaveBeenCalledTimes(1);
    expect(mockedAnswerKnowledgeQuestion).toHaveBeenCalledTimes(1);
    expect(mockedAnswerKnowledgeQuestion).toHaveBeenCalledWith(
      "What does DOM mean?",
      fakeIndex
    );

    expect(mockedPropertySearch).not.toHaveBeenCalled();
    expect(mockedMarketQuestion).not.toHaveBeenCalled();
    expect(mockedRecommendListings).not.toHaveBeenCalled();

    expect(result.primaryIntent).toBe("knowledge");
    expect(result.response).toContain("DOM means Days on Market.");
  });

  it("runs property search and market analysis for a mixed-intent query", async () => {
    mockedClassifyIntent.mockResolvedValue({
      primaryIntent: "mixed",
      intents: ["property_search", "market_analysis"],
    });

    mockedPropertySearch.mockResolvedValue({
      status: "search",
      response: "Found affordable homes in Pasadena.",
    });

    mockedMarketQuestion.mockResolvedValue(
      "Pasadena prices are currently rising."
    );

    const result = await orchestrate(
      "Find me affordable homes in Pasadena and tell me whether prices are rising.",
      "user-123"
    );

    expect(mockedPropertySearch).toHaveBeenCalledTimes(1);
    expect(mockedMarketQuestion).toHaveBeenCalledTimes(1);

    expect(result.primaryIntent).toBe("mixed");
    expect(result.intents).toEqual([
      "property_search",
      "market_analysis",
    ]);

    expect(result.results.property_search).toBeDefined();
    expect(result.results.market_analysis).toBeDefined();

    expect(result.response).toContain(
      "Found affordable homes in Pasadena."
    );
    expect(result.response).toContain(
      "Pasadena prices are currently rising."
    );
  });

  it("runs knowledge and market analysis for another mixed-intent query", async () => {
    mockedClassifyIntent.mockResolvedValue({
      primaryIntent: "mixed",
      intents: ["knowledge", "market_analysis"],
    });

    const fakeIndex = [{ id: "chunk-1" }] as any;

    mockedBuildKnowledgeIndex.mockResolvedValue(fakeIndex);
    mockedAnswerKnowledgeQuestion.mockResolvedValue(
      "DOM means Days on Market."
    );
    mockedMarketQuestion.mockResolvedValue(
      "The average DOM in Irvine is 24 days."
    );

    const result = await orchestrate(
      "Explain DOM and tell me the average DOM in Irvine.",
      "user-123"
    );

    expect(mockedAnswerKnowledgeQuestion).toHaveBeenCalledTimes(1);
    expect(mockedMarketQuestion).toHaveBeenCalledTimes(1);

    expect(result.primaryIntent).toBe("mixed");
    expect(result.intents).toEqual([
      "knowledge",
      "market_analysis",
    ]);

    expect(result.response).toContain("DOM means Days on Market.");
    expect(result.response).toContain(
      "The average DOM in Irvine is 24 days."
    );
  });

  it("returns the fallback response for an unknown intent", async () => {
    mockedClassifyIntent.mockResolvedValue({
      primaryIntent: "unknown",
      intents: ["unknown"],
    });

    const result = await orchestrate(
      "Tell me a joke",
      "user-123"
    );

    expect(mockedPropertySearch).not.toHaveBeenCalled();
    expect(mockedMarketQuestion).not.toHaveBeenCalled();
    expect(mockedRecommendListings).not.toHaveBeenCalled();
    expect(mockedAnswerKnowledgeQuestion).not.toHaveBeenCalled();

    expect(result.primaryIntent).toBe("unknown");
    expect(result.results).toEqual({});
    expect(result.response).toContain("I'm not sure how to help");
  });

  it("rejects a blank userId because property search session memory requires a stable user ID", async () => {
    await expect(
      orchestrate("Find me a home in Irvine", "   ")
    ).rejects.toThrow("orchestrate requires a stable userId.");
  });

  it("handles a blank query without calling the classifier or any agent", async () => {
    const result = await orchestrate("   ", "user-123");

    expect(mockedClassifyIntent).not.toHaveBeenCalled();
    expect(mockedPropertySearch).not.toHaveBeenCalled();
    expect(mockedMarketQuestion).not.toHaveBeenCalled();
    expect(mockedRecommendListings).not.toHaveBeenCalled();
    expect(mockedAnswerKnowledgeQuestion).not.toHaveBeenCalled();

    expect(result.primaryIntent).toBe("unknown");
    expect(result.response).toBe("Please enter a request.");
  });
});
