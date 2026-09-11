import { RowDataPacket } from "mysql2";
import { pool } from "./mysql";
import { PropertyListing } from "./shared-types";

interface PropertyListingRow extends RowDataPacket {
  listingId: string;
  propertyType: string | null;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  SquareFeet: number | null;
  yearBuilt: number | null;
  price: number | null;
  remarks: string | null;
}

/**
 * Fetch one deterministic batch of active listings.
 *
 * `limit` controls the batch size and `offset` controls where the batch starts.
 * The ORDER BY is important so pagination is stable across batches.
 */
export async function getActiveListings(
  limit = 100,
  offset = 0
): Promise<PropertyListing[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("The listing limit must be a positive integer.");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("The listing offset must be a non-negative integer.");
  }

  const sql = `
    SELECT
      L_ListingID AS listingId,
      L_Type_ AS propertyType,
      L_City AS city,
      L_Keyword2 AS bedrooms,
      LM_Dec_3 AS bathrooms,
      LM_Int2_3 AS SquareFeet,
      YearBuilt AS yearBuilt,
      L_SystemPrice AS price,
      L_Remarks AS remarks
    FROM rets_property
    WHERE L_Status = ?
      AND L_Remarks IS NOT NULL
      AND TRIM(L_Remarks) <> ''
    ORDER BY L_ListingID
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<PropertyListingRow[]>(sql, [
    "Active",
    limit,
    offset,
  ]);

  return rows.map((row) => ({
    listingId: String(row.listingId),
    propertyType: row.propertyType,
    city: row.city,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    SquareFeet: row.SquareFeet,
    yearBuilt: row.yearBuilt,
    price: row.price,
    remarks: row.remarks,
  }));
}
