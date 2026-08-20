import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2/promise";

const migrationDirectory = join(process.cwd(), "drizzle");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply VibaCam migrations.");
}

const connection = await mysql.createConnection({
  uri: databaseUrl,
  multipleStatements: true,
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS __vibracam_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrations = (await readdir(migrationDirectory))
    .filter(name => /^\d+_.*\.sql$/.test(name))
    .sort();

  for (const filename of migrations) {
    const [appliedRows] = await connection.query(
      "SELECT filename FROM __vibracam_migrations WHERE filename = ? LIMIT 1",
      [filename]
    );

    if (Array.isArray(appliedRows) && appliedRows.length > 0) {
      console.log(`Skipping ${filename}; already applied.`);
      continue;
    }

    const sql = await readFile(join(migrationDirectory, filename), "utf8");
    const statements = filename === "0016_message_enhancements.sql"
      ? [
          "ALTER TABLE `messages` MODIFY COLUMN `kind` enum('text','gif','sticker','audio') NOT NULL DEFAULT 'text'",
          "ALTER TABLE `messages` ADD COLUMN `replyToId` int NULL AFTER `mediaKey`",
          "ALTER TABLE `messages` ADD COLUMN `editedAt` timestamp NULL AFTER `replyToId`",
          "ALTER TABLE `messages` ADD COLUMN `deletedAt` timestamp NULL AFTER `editedAt`",
          "ALTER TABLE `chatGroupMessages` MODIFY COLUMN `kind` enum('text','gif','sticker','audio') NOT NULL DEFAULT 'text'",
          "ALTER TABLE `chatGroupMessages` ADD COLUMN `replyToId` int NULL AFTER `mediaKey`",
          "ALTER TABLE `chatGroupMessages` ADD COLUMN `editedAt` timestamp NULL AFTER `replyToId`",
          "ALTER TABLE `chatGroupMessages` ADD COLUMN `deletedAt` timestamp NULL AFTER `editedAt`",
        ]
      : sql
      .split("--> statement-breakpoint")
      .map(statement => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await connection.query(statement);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        const canResume = ["ER_TABLE_EXISTS_ERROR", "ER_DUP_FIELDNAME", "ER_DUP_KEYNAME"].includes(String(code));
        if (!canResume) {
          throw error;
        }
        console.log(`Skipping an existing database object while applying ${filename}.`);
      }
    }
    await connection.query(
      "INSERT INTO __vibracam_migrations (filename) VALUES (?)",
      [filename]
    );
    console.log(`Applied ${filename}.`);
  }

  const [tables] = await connection.query("SHOW TABLES");
  console.log(`Verified ${Array.isArray(tables) ? tables.length : 0} database tables.`);
} finally {
  await connection.end();
}
