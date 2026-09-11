import { query } from "./mysql";
import { RowDataPacket } from "mysql2/promise";

export type TrendMetric =
  | "close_price"
  | "avg_dom"
  | "price_per_sqft"
  | "sales_count"
  | "list_to_original_price_ratio";

export type SlopeUnit =
  | "dollars_per_month"
  | "days_per_month"
  | "dollars_per_sqft_per_month"
  | "sales_per_month";

export interface MarketTrendInput {
  city: string;
  metric: TrendMetric;
  propertyType?: string;
  months?: number;
}

export interface MonthlyTrendData {
  month: string;
  value: number;
}

export interface MarketTrendResult {
  city: string;
  metric: TrendMetric;
  propertyType: string;
  months: number;
  slope: number | null;
  slopeUnit: SlopeUnit | null;
  monthlyData: MonthlyTrendData[];
}

interface MonthlyTrendRow extends RowDataPacket {
  month: string;
  value: number | string | null;
}

function getSlopeUnit(metric: TrendMetric): SlopeUnit | null {
  switch (metric) {
    case "close_price":
      return "dollars_per_month";

    case "avg_dom":
      return "days_per_month";

    case "price_per_sqft":
      return "dollars_per_sqft_per_month";

    case "sales_count":
      return "sales_per_month";

    case "list_to_original_price_ratio":
      return null;
  }
}

function calculateSlope(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const n = values.length;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];

    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

export async function getMarketTrend(
  input: MarketTrendInput
): Promise<MarketTrendResult> {
  const {
    city,
    metric,
    propertyType = "Residential",
    months = 12,
  } = input;

  // 1. Build WHERE conditions
  const conditions: string[] = [];
  const params: any[] = [];

  if (city) {
    conditions.push("City = ?");
    params.push(city);
  }

  if (propertyType) {
    conditions.push("PropertyType = ?");
    params.push(propertyType);
  }

  if (months) {
    // Use the most recent month available in the dataset for this city/property type
    // instead of the current calendar date. This keeps historical/static datasets usable.
    const lookbackMonths = Math.max(0, months - 1);

    conditions.push(`
      CloseDate >= DATE_SUB(
        DATE_FORMAT(
          (
            SELECT MAX(latest.CloseDate)
            FROM california_sold AS latest
            WHERE latest.City = ?
              AND latest.PropertyType = ?
          ),
          '%Y-%m-01'
        ),
        INTERVAL ? MONTH
      )
    `);

    params.push(city, propertyType, lookbackMonths);
  }

  const whereClause = conditions.join(" AND ");

  // 2. Build the monthly query for the requested trend metric
  let trendSql: string;

  switch (metric) {
    case "close_price":
      trendSql = `
        SELECT
          DATE_FORMAT(CloseDate, '%Y-%m') AS month,
          AVG(ClosePrice) AS value
        FROM california_sold
        WHERE ${whereClause}
          AND ClosePrice IS NOT NULL
        GROUP BY DATE_FORMAT(CloseDate, '%Y-%m')
        ORDER BY month
      `;
      break;

    case "avg_dom":
      trendSql = `
        SELECT
          DATE_FORMAT(CloseDate, '%Y-%m') AS month,
          AVG(DaysOnMarket) AS value
        FROM california_sold
        WHERE ${whereClause}
          AND DaysOnMarket IS NOT NULL
        GROUP BY DATE_FORMAT(CloseDate, '%Y-%m')
        ORDER BY month
      `;
      break;

    case "price_per_sqft":
      trendSql = `
        SELECT
          DATE_FORMAT(CloseDate, '%Y-%m') AS month,
          AVG(ClosePrice / NULLIF(LivingArea, 0)) AS value
        FROM california_sold
        WHERE ${whereClause}
          AND ClosePrice IS NOT NULL
          AND LivingArea IS NOT NULL
        GROUP BY DATE_FORMAT(CloseDate, '%Y-%m')
        ORDER BY month
      `;
      break;

    case "sales_count":
      trendSql = `
        SELECT
          DATE_FORMAT(CloseDate, '%Y-%m') AS month,
          COUNT(*) AS value
        FROM california_sold
        WHERE ${whereClause}
        GROUP BY DATE_FORMAT(CloseDate, '%Y-%m')
        ORDER BY month
      `;
      break;

    case "list_to_original_price_ratio":
      trendSql = `
        SELECT
          DATE_FORMAT(CloseDate, '%Y-%m') AS month,
          AVG(ClosePrice / NULLIF(OriginalListPrice, 0)) AS value
        FROM california_sold
        WHERE ${whereClause}
          AND ClosePrice IS NOT NULL
          AND OriginalListPrice IS NOT NULL
        GROUP BY DATE_FORMAT(CloseDate, '%Y-%m')
        ORDER BY month
      `;
      break;

    default: {
      const exhaustiveCheck: never = metric;
      throw new Error(`Unsupported market trend metric: ${exhaustiveCheck}`);
    }
  }

  // 3. Run the monthly trend query
  const rows = await query<MonthlyTrendRow>(trendSql, params);

  // 4. Convert query results to clean numeric monthly data
  const monthlyData: MonthlyTrendData[] = rows
    .filter((row) => row.value !== null)
    .map((row) => ({
      month: row.month,
      value: Number(row.value),
    }))
    .filter((row) => Number.isFinite(row.value));

  // 5. Calculate the linear regression slope
  const values = monthlyData.map((row) => row.value);
  const slope = calculateSlope(values);

  // 6. Return the data and slope without classifying the trend
  return {
    city,
    metric,
    propertyType,
    months,
    slope,
    slopeUnit: getSlopeUnit(metric),
    monthlyData,
  };
}
