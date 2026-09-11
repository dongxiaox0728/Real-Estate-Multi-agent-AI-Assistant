import { MarketMetric } from "./market-metrics";
import { TrendMetric } from "./market-trend";
import { MarketConditionType } from "./market-condition";

export interface ParseMarketQueryOptions {
  supportedCities: string[];
}

export type ParsedMarketQuery =
  | {
      intent: "market_summary";
      city: string;
      propertyType: string;
      months: number;
    }
  | {
      intent: "market_metric";
      city: string;
      metric: MarketMetric;
      propertyType: string;
      months: number;
    }
  | {
      intent: "market_trend";
      city: string;
      metric: TrendMetric;
      propertyType: string;
      months: number;
    }
  | {
      intent: "market_condition";
      city: string;
      condition: MarketConditionType;
      propertyType: string;
      months: number;
    };

const DEFAULT_PROPERTY_TYPE = "Residential";
const DEFAULT_MONTHS = 12;

const BUYER_SELLER_PATTERNS = [
  /\bbuyer(?:'s|s)? market\b/i,
  /\bseller(?:'s|s)? market\b/i,
  /\bbuyers? or sellers? market\b/i,
  /\bsellers? or buyers? market\b/i,
];

const COMPETITIVENESS_PATTERNS = [
  /\bcompetitive\b/i,
  /\bcompetitiveness\b/i,
  /\bcompetition\b/i,
];

const GOOD_TIME_TO_BUY_PATTERNS = [
  /\bgood time to buy\b/i,
  /\bshould i buy\b/i,
  /\bworth buying\b/i,
  /\bbuy right now\b/i,
  /\bbuy now\b/i,
];

const TREND_PATTERNS = [
  /\btrend\b/i,
  /\bover time\b/i,
  /\bchanged?\b/i,
  /\bchanging\b/i,
  /\bincreas(?:e|ed|ing)\b/i,
  /\bdecreas(?:e|ed|ing)\b/i,
  /\bgoing up\b/i,
  /\bgoing down\b/i,
  /\brising\b/i,
  /\bfalling\b/i,
  /\bfaster\b/i,
  /\bslower\b/i,
  /\blonger to sell\b/i,
  /\bshorter to sell\b/i,
];

const SUMMARY_PATTERNS = [
  /\bmarket summary\b/i,
  /\bmarket overview\b/i,
  /\bhow is (?:the )?.*market\b/i,
  /\bwhat does (?:the )?.*market look like\b/i,
  /\bhow is housing\b/i,
  /\boverall market\b/i,
];

const METRIC_PATTERNS: Array<{
  metric: MarketMetric;
  patterns: RegExp[];
}> = [
  {
    metric: "price_per_sqft",
    patterns: [
      /\baverage price per square foot\b/i,
      /\baverage price per sqft\b/i,
      /\bprice per square foot\b/i,
      /\bprice per sqft\b/i,
      /\bprice\/sqft\b/i,
      /\bppsf\b/i,
    ],
  },
  {
    metric: "list_to_close_ratio",
    patterns: [
      /\blist[- ]to[- ]close ratio\b/i,
      /\bclose[- ]to[- ]list ratio\b/i,
      /\bsale[- ]to[- ]list ratio\b/i,
      /\bpercent of list price\b/i,
    ],
  },
  {
    metric: "avg_dom",
    patterns: [
      /\baverage days on market\b/i,
      /\bavg days on market\b/i,
      /\bdays on market\b/i,
      /\bhow long .* (?:stay|stays|remain|remains) on the market\b/i,
      /\bhow long .* take to sell\b/i,
      /\bdom\b/i,
    ],
  },
  {
    metric: "median_close_price",
    patterns: [
      /\bmedian (?:close |sale |sold |home )?price\b/i,
      /\bmedian price\b/i,
    ],
  },
  {
    metric: "avg_close_price",
    patterns: [
      /\baverage (?:close |sale |sold |home )?price\b/i,
      /\bavg (?:close |sale |sold |home )?price\b/i,
      /\bmean (?:close |sale |sold |home )?price\b/i,
      /\baverage price\b/i,
    ],
  },
  {
    metric: "sales_count",
    patterns: [
      /\bnumber of (?:homes|houses|properties) sold\b/i,
      /\bhow many (?:homes|houses|properties) sold\b/i,
      /\bsales count\b/i,
      /\bsold count\b/i,
      /\bsales volume\b/i,
    ],
  },
];

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCity(
  question: string,
  supportedCities: string[]
): string | null {
  const normalizedQuestion = normalizeText(question);

  const matches = supportedCities
    .map((city) => normalizeText(city))
    .filter(Boolean)
    .filter((city) => {
      const cityPattern = new RegExp(
        `\\b${escapeRegExp(city).replace(/\s+/g, "\\s+")}\\b`,
        "i"
      );
      return cityPattern.test(normalizedQuestion);
    })
    .sort((a, b) => b.length - a.length);

  return matches[0] ?? null;
}

function parseMonths(question: string): number {
  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  const parseNumber = (value: string): number => {
    return /^\d+$/.test(value) ? Number(value) : numberWords[value.toLowerCase()];
  };

  const monthMatch = question.match(
    /\b(?:last|past|previous|over the last|over the past)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+months?\b/i
  );

  if (monthMatch) {
    return Math.max(1, parseNumber(monthMatch[1]));
  }

  const compactMonthMatch = question.match(/\b(\d+)[- ]month\b/i);

  if (compactMonthMatch) {
    return Math.max(1, Number(compactMonthMatch[1]));
  }

  const yearMatch = question.match(
    /\b(?:last|past|previous|over the last|over the past)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b/i
  );

  if (yearMatch) {
    return Math.max(1, parseNumber(yearMatch[1])) * 12;
  }

  if (
    /\b(?:last|past|previous|over the last|over the past)\s+year\b/i.test(
      question
    )
  ) {
    return 12;
  }

  return DEFAULT_MONTHS;
}

function matchesAny(
  question: string,
  patterns: RegExp[]
): boolean {
  return patterns.some((pattern) => pattern.test(question));
}

function detectMetric(
  question: string
): MarketMetric | null {
  for (const definition of METRIC_PATTERNS) {
    if (
      definition.patterns.some((pattern) =>
        pattern.test(question)
      )
    ) {
      return definition.metric;
    }
  }

  return null;
}

function detectTrendMetric(
  question: string,
  detectedMetric: MarketMetric | null
): TrendMetric | null {
  if (
    /\blist[- ]to[- ]original(?:[- ]price)? ratio\b/i.test(question) ||
    /\boriginal list price ratio\b/i.test(question) ||
    /\blist(?:ing)?[- ]to[- ]original\b/i.test(question)
  ) {
    return "list_to_original_price_ratio";
  }

  if (
    detectedMetric === "price_per_sqft" ||
    /\bprice per (?:square foot|sqft)\b/i.test(question)
  ) {
    return "price_per_sqft";
  }

  if (
    detectedMetric === "avg_dom" ||
    /\bdom\b/i.test(question) ||
    /\bdays on market\b/i.test(question) ||
    /\b(?:faster|slower|longer|shorter).*sell\b/i.test(question)
  ) {
    return "avg_dom";
  }

  if (
    detectedMetric === "sales_count" ||
    /\bsales(?: count| volume)?\b/i.test(question)
  ) {
    return "sales_count";
  }

  if (
    detectedMetric === "avg_close_price" ||
    detectedMetric === "median_close_price" ||
    /\bclose\s*price\b/i.test(question) ||
    /\bhome prices?\b/i.test(question) ||
    /\bsale prices?\b/i.test(question) ||
    /\bsold prices?\b/i.test(question) ||
    /\bprices?\b/i.test(question)
  ) {
    return "close_price";
  }

  return null;
}

function detectCondition(
  question: string
): MarketConditionType | null {
  if (matchesAny(question, GOOD_TIME_TO_BUY_PATTERNS)) {
    return "good_time_to_buy";
  }

  if (matchesAny(question, BUYER_SELLER_PATTERNS)) {
    return "buyer_seller_market";
  }

  if (matchesAny(question, COMPETITIVENESS_PATTERNS)) {
    return "competitiveness";
  }

  return null;
}

export function parseMarketQuery(
  question: string,
  options: ParseMarketQueryOptions
): ParsedMarketQuery {
  const normalizedQuestion = normalizeText(question);

  if (!normalizedQuestion) {
    throw new Error("A market question is required.");
  }

  if (
    !options.supportedCities ||
    options.supportedCities.length === 0
  ) {
    throw new Error(
      "At least one supported city is required to parse a market query."
    );
  }

  const city = findCity(
    normalizedQuestion,
    options.supportedCities
  );

  if (!city) {
    throw new Error(
      "No supported city was found in the market question."
    );
  }

  const propertyType = DEFAULT_PROPERTY_TYPE;
  const months = parseMonths(normalizedQuestion);

  const condition = detectCondition(normalizedQuestion);

  if (condition) {
    return {
      intent: "market_condition",
      city,
      condition,
      propertyType,
      // good_time_to_buy always uses the most recent 3 months
      months: condition === "good_time_to_buy" ? 3 : months,
    };
  }

  const detectedMetric = detectMetric(normalizedQuestion);

  if (matchesAny(normalizedQuestion, TREND_PATTERNS)) {
    const trendMetric = detectTrendMetric(
      normalizedQuestion,
      detectedMetric
    );

    if (!trendMetric) {
      throw new Error(
        "A trend question was detected, but no supported trend metric was found."
      );
    }

    return {
      intent: "market_trend",
      city,
      metric: trendMetric,
      propertyType,
      months,
    };
  }

  if (detectedMetric) {
    return {
      intent: "market_metric",
      city,
      metric: detectedMetric,
      propertyType,
      months,
    };
  }

  if (
    matchesAny(normalizedQuestion, SUMMARY_PATTERNS) ||
    /\b(?:housing|real estate|property) market\b/i.test(
      normalizedQuestion
    )
  ) {
    return {
      intent: "market_summary",
      city,
      propertyType,
      months,
    };
  }

  throw new Error(
    "The question does not match a supported market-analysis type."
  );
}
