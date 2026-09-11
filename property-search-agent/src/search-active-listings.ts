import { query } from "./mysql";
import type {
  ListingRow,
  PropertyFilters,
} from "./parse-structure";

export async function searchActiveListings(
  filters: PropertyFilters,
  page = 1,
  limit = 10
): Promise<ListingRow[]> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const offset = (safePage - 1) * safeLimit;

  let sql = `
    SELECT
      L_ListingID AS id,
      L_DisplayId AS displayId,
      L_Address AS address,
      L_City AS city,
      L_Zip AS zip,
      L_SystemPrice AS price,
      L_Keyword2 AS beds,
      LM_Dec_3 AS baths,
      LM_Int2_3 AS sqft,
      L_Type_ AS propertyType,
      L_Status AS status,
      LMD_MP_Latitude AS latitude,
      LMD_MP_Longitude AS longitude,
      YearBuilt AS yearBuilt,
      DaysOnMarket AS daysOnMarket,
      AssociationFee AS hoa,
      PoolPrivateYN AS pool,
      ViewYN AS hasView,
      PhotoCount AS photoCount,
      LA1_UserFirstName AS agentFirstName,
      LA1_UserLastName AS agentLastName,
      LO1_OrganizationName AS officeName
    FROM rets_property
    WHERE L_Status = 'Active'
  `;

  const params: unknown[] = [];

  // City
  if (filters.city) {
    sql += " AND L_City = ?";
    params.push(filters.city);
  }

  // Price
  if (filters.minPrice !== undefined) {
    sql += " AND L_SystemPrice >= ?";
    params.push(filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    sql += " AND L_SystemPrice <= ?";
    params.push(filters.maxPrice);
  }

  // Bedrooms
  if (filters.minBeds !== undefined) {
    sql += " AND L_Keyword2 >= ?";
    params.push(filters.minBeds);
  }

  if (filters.maxBeds !== undefined) {
    sql += " AND L_Keyword2 <= ?";
    params.push(filters.maxBeds);
  }

  // Bathrooms
  if (filters.minBaths !== undefined) {
    sql += " AND LM_Dec_3 >= ?";
    params.push(filters.minBaths);
  }

  if (filters.maxBaths !== undefined) {
    sql += " AND LM_Dec_3 <= ?";
    params.push(filters.maxBaths);
  }

  // Square footage
  if (filters.minSqft !== undefined) {
    sql += " AND LM_Int2_3 >= ?";
    params.push(filters.minSqft);
  }

  if (filters.maxSqft !== undefined) {
    sql += " AND LM_Int2_3 <= ?";
    params.push(filters.maxSqft);
  }

  // HOA
  if (filters.minHOA !== undefined) {
    sql += " AND AssociationFee >= ?";
    params.push(filters.minHOA);
  }

  if (filters.maxHOA !== undefined) {
    sql += " AND AssociationFee <= ?";
    params.push(filters.maxHOA);
  }

  // Property type
  if (filters.propertyType) {
    sql += " AND L_Type_ = ?";
    params.push(filters.propertyType);
  }

  // Pool
  if (filters.pool !== undefined) {
    sql += " AND PoolPrivateYN = ?";
    params.push(filters.pool);
  }

  // View
  if (filters.hasView !== undefined) {
    sql += " AND ViewYN = ?";
    params.push(filters.hasView);
  }

  sql += ` ORDER BY L_SystemPrice ASC LIMIT ${safeLimit} OFFSET ${offset}`;


  if (params.some((value) => value === undefined)) {
    throw new Error("SQL parameters contain undefined");
  }

  return query<ListingRow>(sql, params);
}