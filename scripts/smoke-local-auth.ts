import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { registerLocalAccount, loginLocalAccount } from "../server/localAuth";

dotenv.config();
const email = `smoke-${Date.now()}@example.invalid`;
const username = `smoke_${Date.now()}`;
const password = "SmokePass!2026";
let userId: number | undefined;
try {
  const created = await registerLocalAccount({
    firstName: "Smoke",
    lastName: "Test",
    username,
    email,
    password,
    dateOfBirth: "1990-01-01",
    country: "Algeria",
    city: "Algiers",
  });
  userId = created.id;
  const loggedIn = await loginLocalAccount(email, password);
  console.log(JSON.stringify({ registered: true, loggedIn: loggedIn.id === userId, userId }, null, 2));
} finally {
  const url = new URL(process.env.DATABASE_URL!);
  const connection = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.replace(/^\//, "") });
  if (userId) {
    await connection.execute("DELETE FROM localCredentials WHERE userId = ?", [userId]);
    await connection.execute("DELETE FROM users WHERE id = ?", [userId]);
  }
  await connection.end();
}
process.exit(0);
