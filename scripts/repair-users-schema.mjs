import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();
const url = new URL(process.env.DATABASE_URL);
const config = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
};
const connection = await mysql.createConnection(config);
const [roleRows] = await connection.query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'");
if (roleRows.length && !String(roleRows[0].COLUMN_TYPE).includes("'moderator'")) {
  await connection.query("ALTER TABLE users MODIFY COLUMN role ENUM('user','moderator','admin') NOT NULL DEFAULT 'user'");
}
const columns = [
  ["isCreator", "ENUM('no','yes') NOT NULL DEFAULT 'no'"],
  ["punishmentLevel", "INT NOT NULL DEFAULT 0"],
  ["punishmentUntil", "TIMESTAMP NULL"],
  ["banned", "ENUM('no','yes') NOT NULL DEFAULT 'no'"],
  ["earnings", "VARCHAR(32) NOT NULL DEFAULT '0.00'"],
  ["followersCount", "INT NOT NULL DEFAULT 0"],
  ["state", "VARCHAR(120) NULL"],
];
for (const [name, definition] of columns) {
  const [rows] = await connection.query("SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?", [name]);
  if (!rows.length) {
    await connection.query(`ALTER TABLE users ADD COLUMN \`${name}\` ${definition}`);
  }
}
await connection.end();
console.log(JSON.stringify({ repaired: columns.map(([name]) => name), roleIncludesModerator: true }, null, 2));
