import { resolve } from "node:path";
import { config } from "dotenv";
import mysql, { RowDataPacket } from "mysql2/promise";

config({ path: resolve(__dirname, "../../.env"), quiet: true });

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function query<T extends RowDataPacket>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const [rows] = await pool.execute<T[]>(sql, params);
  return rows;
}

export async function testConnection(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
    console.log("MySQL connection successful.");
  } finally {
    connection.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
