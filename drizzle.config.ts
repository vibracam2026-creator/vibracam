import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const url = new URL(connectionString);
const sslMode = (url.searchParams.get("ssl-mode") ?? "").toLowerCase();

// mysql2/Drizzle Kit does not accept the MySQL CLI-style `ssl-mode`
// connection option. Convert it to Drizzle's native `ssl` option instead.
url.searchParams.delete("ssl-mode");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ssl: sslMode === "required" ? {} : undefined,
  },
});
