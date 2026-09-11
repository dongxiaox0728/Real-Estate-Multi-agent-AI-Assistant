import type { RowDataPacket } from "mysql2";
import { pool } from "./mysql";
import type { PropertyListing } from "./shared-types";

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

export async function getCandidateListings(
  targetListingId: string
): Promise<PropertyListing[]> {
  const cleanedId = targetListingId.trim();

  if (!cleanedId) {
    throw new Error("Target listing ID cannot be empty.");
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
      AND L_ListingID <> ?
      AND L_Remarks IS NOT NULL
      AND TRIM(L_Remarks) <> ''
  `;

  const [rows] = await pool.query<PropertyListingRow[]>(
    sql,
    [
      "Active",
      cleanedId
    ]
  );

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