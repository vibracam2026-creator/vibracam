import fs from "node:fs/promises";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();
const url = new URL(process.env.DATABASE_URL);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  multipleStatements: false,
});
const files = [
  "drizzle/0009_wonderful_midnight_sun.sql",
  "drizzle/0010_safe_moon_knight.sql",
];
const ignoredCodes = new Set([1050, 1060, 1061, 1091]);
const results = [];
for (const file of files) {
  const raw = await fs.readFile(file, "utf8");
  const statements = raw.replaceAll(/--> statement-breakpoint/g, "").split(";").map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    try {
      await connection.query(statement);
      results.push({ file, status: "applied" });
    } catch (error) {
      if (ignoredCodes.has(error.errno)) {
        results.push({ file, status: "already_present", code: error.errno });
      } else {
        throw new Error(`${file}: ${error.message}`);
      }
    }
  }
}
await connection.end();
console.log(JSON.stringify({ files, statements: results.length, results }, null, 2));
