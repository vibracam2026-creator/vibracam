import fs from "node:fs";
import net from "node:net";
import dotenv from "dotenv";

dotenv.config();
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.log(JSON.stringify({ configured: false }, null, 2));
  process.exit(0);
}
const url = new URL(raw);
const host = url.hostname;
const port = Number(url.port || (url.protocol === "mysql:" ? 3306 : 3306));
const socket = net.createConnection({ host, port });
const timeout = setTimeout(() => {
  console.log(JSON.stringify({ configured: true, host, port, reachable: false, reason: "timeout" }, null, 2));
  socket.destroy();
}, 5000);
socket.once("connect", () => {
  clearTimeout(timeout);
  console.log(JSON.stringify({ configured: true, host, port, reachable: true }, null, 2));
  socket.end();
});
socket.once("error", (error) => {
  clearTimeout(timeout);
  console.log(JSON.stringify({ configured: true, host, port, reachable: false, reason: error.code || error.message }, null, 2));
});
