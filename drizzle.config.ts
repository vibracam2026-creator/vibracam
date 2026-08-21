import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const url = new URL(connectionString);

const sslMode = (
  url.searchParams.get("ssl-mode") ??
  url.searchParams.get("sslmode") ??
  ""
).toLowerCase();

// mysql2/Drizzle Kit does not use the MySQL CLI-style ssl-mode option.
url.searchParams.delete("ssl-mode");
url.searchParams.delete("sslmode");

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

    ssl: {
      rejectUnauthorized: false,
    },
  },
});
