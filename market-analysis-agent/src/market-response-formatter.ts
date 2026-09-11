import { MarketAnalyticsResult } from "./question-type-router";
import { MarketSummaryResult } from "./market-summary";
import {
  MarketMetric,
  MarketMetricResult,
} from "./market-metrics";
import {
  MarketTrendResult,
  SlopeUnit,
  TrendMetric,
} from "./market-trend";
import {
  BuyerIndicator,
  BuyerFavorabilityRating,
  BuyerSellerMarketResult,
  CompetitivenessResult,
  GoodTimeToBuyResult,
  MarketConditionResult,
} from "./market-condition";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | null): string {
  return value === null
    ? "not available"
    : currencyFormatter.format(value);
}

export function formatNumber(value: number | null): string {
  return value === null
    ? "not available"
    : numberFormatter.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null
    ? "not available"
    : `${numberFormatter.format(value)}%`;
}

function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

export function formatMonth(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return month;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function marketMetricLabel(metric: MarketMetric): string {
  const labels: Record<MarketMetric, string> = {
    avg_close_price: "Average close price",
    median_close_price: "Median close price",
    avg_dom: "Average days on market",
    list_to_close_ratio: "Average list-to-close price ratio",
    price_per_sqft: "Average price per square foot",
    sales_count: "Sales count",
  };

  return labels[metric];
}

function marketMetricEmoji(metric: MarketMetric): string {
  const emojis: Record<MarketMetric, string> = {
    avg_close_price: "💰",
    median_close_price: "💵",
    avg_dom: "📅",
    list_to_close_ratio: "📈",
    price_per_sqft: "📐",
    sales_count: "🏠",
  };

  return emojis[metric];
}

function trendMetricLabel(metric: TrendMetric): string {
  const labels: Record<TrendMetric, string> = {
    close_price: "Average close price",
    avg_dom: "Average days on market",
    price_per_sqft: "Average price per square foot",
    sales_count: "Sales count",
    list_to_original_price_ratio:
      "List-to-original-price ratio",
  };

  return labels[metric];
}

function trendMetricEmoji(metric: TrendMetric): string {
  const emojis: Record<TrendMetric, string> = {
    close_price: "💰",
    avg_dom: "📅",
    price_per_sqft: "📐",
    sales_count: "🏠",
    list_to_original_price_ratio: "📈",
  };

  return emojis[metric];
}

function formatMarketMetricValue(
  metric: MarketMetric,
  value: number | null
): string {
  if (value === null) {
    return "not available";
  }

  switch (metric) {
    case "avg_close_price":
    case "median_close_price":
      return formatCurrency(value);

    case "avg_dom":
      return `${formatNumber(value)} days`;

    case "list_to_close_ratio":
      return formatPercent(value);

    case "price_per_sqft":
      return `${formatCurrency(value)} per square foot`;

    case "sales_count":
      return `${formatInteger(value)} sales`;
  }
}

function formatTrendValue(
  metric: TrendMetric,
  value: number
): string {
  switch (metric) {
    case "close_price":
      return formatCurrency(value);

    case "avg_dom":
      return `${formatNumber(value)} days`;

    case "price_per_sqft":
      return `${formatCurrency(value)} per square foot`;

    case "sales_count":
      return `${formatInteger(value)} sales`;

    case "list_to_original_price_ratio":
      return formatNumber(value);
  }
}

function formatSlope(
  slope: number | null,
  unit: SlopeUnit | string | null
): string {
  if (slope === null) {
    return "not available";
  }

  const sign = slope > 0 ? "+" : "";
  const rawValue = `${sign}${numberFormatter.format(slope)}`;

  switch (unit) {
    case "dollars_per_month":
      return `${sign}${currencyFormatter.format(slope)} per month`;

    case "days_per_month":
      return `${rawValue} days per month`;

    case "dollars_per_sqft_per_month":
      return `${sign}${currencyFormatter.format(slope)} per square foot per month`;

    case "sales_per_month":
      return `${rawValue} sales per month`;

    case null:
      return rawValue;

    default:
      return rawValue;
  }
}

function formatSummary(
  result: MarketSummaryResult
): string {
  const city = result.city ?? "the selected market";

  return [
    `Over the past ${result.months} months in ${city}:`,
    "",
    `🏠 Homes sold: ${formatInteger(result.salesCount)}`,
    `💰 Average close price: ${formatCurrency(result.avgClosePrice)}`,
    `💵 Median close price: ${formatCurrency(result.medianClosePrice)}`,
    `📅 Average days on market: ${formatNumber(result.avgDaysOnMarket)} days`,
    `📈 Average list-to-close ratio: ${formatPercent(result.avgListToCloseRatio)}`,
    `📐 Average price per square foot: ${formatCurrency(result.avgPricePerSqft)}`,
  ].join("\n");
}

function formatMetric(
  result: MarketMetricResult
): string {
  const label = marketMetricLabel(result.metric);
  const value = formatMarketMetricValue(
    result.metric,
    result.value
  );

  return [
    `Over the past ${result.months} months in ${result.city}:`,
    "",
    `${marketMetricEmoji(result.metric)} ${label}: ${value}`,
  ].join("\n");
}

function formatTrend(
  result: MarketTrendResult
): string {
  if (result.monthlyData.length === 0) {
    return `No valid monthly data was available for the ${trendMetricLabel(
      result.metric
    ).toLowerCase()} in ${result.city} over the past ${result.months} months.`;
  }

  const emoji = trendMetricEmoji(result.metric);
  const monthlyLines = result.monthlyData.map(
    (row) =>
      `${emoji} ${formatMonth(row.month)}: ${formatTrendValue(
        result.metric,
        row.value
      )}`
  );

  const slopeText = formatSlope(
    result.slope,
    result.slopeUnit
  );

  return [
    `${trendMetricLabel(result.metric)} in ${result.city} over the past ${result.months} months:`,
    "",
    ...monthlyLines,
    "",
    `📊 Linear-regression slope: ${slopeText}`,
  ].join("\n");
}

function formatBuyerSellerMarket(
  result: BuyerSellerMarketResult
): string {
  if (
    result.marketType === "insufficient_data" ||
    result.avgDaysOnMarket === null
  ) {
    return `There was not enough valid days-on-market data to classify ${result.city} as a buyer's, seller's, or balanced market.`;
  }

  const marketLabels = {
    sellers_market: "seller's market",
    balanced_market: "balanced market",
    buyers_market: "buyer's market",
  } as const;

  return [
    `${result.city} is a *${marketLabels[result.marketType]}*.`,
    "",
    `📅 Average days on market: ${formatNumber(result.avgDaysOnMarket)} days`,
    "",
    "Rules used:",
    "• Under 30 days → Seller's market",
    "• 30–60 days → Balanced market",
    "• Over 60 days → Buyer's market",
  ].join("\n");
}

function formatCompetitiveness(
  result: CompetitivenessResult
): string {
  if (
    result.competitiveness === "insufficient_data" ||
    result.listToOriginalPriceRatio === null
  ) {
    return `There was not enough valid list-to-original-price data to assess market competitiveness in ${result.city}.`;
  }

  const ratio = formatNumber(
    result.listToOriginalPriceRatio
  );
  const classification =
    result.competitiveness === "competitive"
      ? "competitive"
      : "not classified as competitive";

  return [
    `${result.city} is *${classification}* under this rule.`,
    "",
    `📈 Average list-to-original-price ratio: ${ratio}`,
    "",
    "Rules used:",
    "• Ratio above 1 → Competitive",
    "• Ratio of 1 or below → Not competitive",
  ].join("\n");
}

function ratingText(
  rating: BuyerFavorabilityRating
): string {
  const labels: Record<BuyerFavorabilityRating, string> = {
    wonderful: "wonderful",
    good: "good",
    somewhat_good: "somewhat good",
    not_so_great: "not so great",
    worst: "poor",
  };

  return labels[rating];
}

function indicatorLabel(
  metric: BuyerIndicator["metric"]
): string {
  const labels: Record<
    BuyerIndicator["metric"],
    string
  > = {
    close_price: "Close price",
    avg_dom: "Average days on market",
    price_per_sqft: "Price per square foot",
    list_to_original_price_ratio:
      "List-to-original-price ratio",
    sales_count: "Sales count",
  };

  return labels[metric];
}

function formatGoodTimeToBuy(
  result: GoodTimeToBuyResult
): string {
  const indicatorLines = result.indicators.map((indicator) => {
    const status = indicator.favorable
      ? "✅ Buyer-favorable"
      : "❌ Not buyer-favorable";

    return `${status} — ${indicatorLabel(
      indicator.metric
    )}: slope ${formatSlope(
      indicator.slope,
      indicator.slopeUnit
    )}`;
  });

  return [
    `Based on the most recent 3 months, ${result.city} scored *${result.score}/5* on the buyer-favorability indicators, rated *${ratingText(result.rating)}*.`,
    "",
    ...indicatorLines,
    "",
    "Buyer-favorable rules:",
    "• Close-price slope < 0",
    "• Average-DOM slope > 0",
    "• Price-per-square-foot slope < 0",
    "• List-to-original-price-ratio slope < 0",
    "• Sales-count slope < 0",
    "",
    "Rating rules:",
    "• 5 → Wonderful",
    "• 4 → Good",
    "• 3 → Somewhat good",
    "• 2 → Not so great",
    "• 0–1 → Poor",
  ].join("\n");
}

function formatCondition(
  result: MarketConditionResult
): string {
  switch (result.condition) {
    case "buyer_seller_market":
      return formatBuyerSellerMarket(result);

    case "competitiveness":
      return formatCompetitiveness(result);

    case "good_time_to_buy":
      return formatGoodTimeToBuy(result);

    default: {
      const exhaustiveCheck: never = result;
      throw new Error(
        `Unsupported market condition result: ${JSON.stringify(
          exhaustiveCheck
        )}`
      );
    }
  }
}

function isConditionResult(
  result: MarketAnalyticsResult
): result is MarketConditionResult {
  return "condition" in result;
}

function isTrendResult(
  result: MarketAnalyticsResult
): result is MarketTrendResult {
  return (
    "slope" in result &&
    "monthlyData" in result
  );
}

function isMetricResult(
  result: MarketAnalyticsResult
): result is MarketMetricResult {
  return (
    "metric" in result &&
    "value" in result &&
    !("slope" in result)
  );
}

/**
 * Converts a structured market analytics result into user-facing text.
 *
 * The new analytics result objects no longer contain an "intent" field,
 * so the formatter identifies the result shape and delegates to the
 * correct formatter.
 */
export function formatMarketResponse(
  result: MarketAnalyticsResult
): string {
  if (isConditionResult(result)) {
    return formatCondition(result);
  }

  if (isTrendResult(result)) {
    return formatTrend(result);
  }

  if (isMetricResult(result)) {
    return formatMetric(result);
  }

  return formatSummary(result as MarketSummaryResult);
}
