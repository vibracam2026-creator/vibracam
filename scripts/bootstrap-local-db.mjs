import dotenv from "dotenv";
import { spawnSync } from "node:child_process";

dotenv.config();
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL is required");
const url = new URL(raw);
const database = url.pathname.replace(/^\//, "");
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const host = url.hostname;
const port = Number(url.port || 3306);
if (!database || !user || !password || host !== "localhost") {
  throw new Error("This bootstrap script only supports a local DATABASE_URL with credentials");
}

const quote = (value) => `\`${String(value).replaceAll("`", "``")}\``;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = [
  `CREATE DATABASE IF NOT EXISTS ${quote(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  `CREATE USER IF NOT EXISTS ${literal(user)}@${literal(host)} IDENTIFIED BY ${literal(password)};`,
  `ALTER USER ${literal(user)}@${literal(host)} IDENTIFIED BY ${literal(password)};`,
  `GRANT ALL PRIVILEGES ON ${quote(database)}.* TO ${literal(user)}@${literal(host)};`,
  "FLUSH PRIVILEGES;",
].join("\\n");
const result = spawnSync("sudo", ["mariadb", "--protocol=socket", "--user=root"], { input: sql, encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || "MariaDB bootstrap failed");
console.log(JSON.stringify({ database, user, host, port, configured: true }, null, 2));
