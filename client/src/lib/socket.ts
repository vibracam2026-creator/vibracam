import { io, type Socket } from "socket.io-client";

export const socket: Socket = io(window.location.origin, {
  path: "/api/socket.io",
  withCredentials: true,

  // يبدأ بالـ polling ثم يرقّي الاتصال إلى WebSocket
  transports: ["polling", "websocket"],

  // إعادة الاتصال تلقائيًا
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,

  // مهلة الاتصال
  timeout: 10000,

  // لا تغلق الاتصال عند تغيير الصفحة
  autoConnect: true,
});

socket.on("connect", () => {
  console.log("[Socket] connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.warn("[Socket] disconnected:", reason);
});

socket.on("connect_error", (error) => {
  console.warn("[Socket] connection error:", error.message);
});

socket.io.on("reconnect_attempt", (attempt) => {
  console.log("[Socket] reconnect attempt:", attempt);
});

socket.io.on("reconnect", (attempt) => {
  console.log("[Socket] reconnected after:", attempt);
});

socket.io.on("reconnect_error", (error) => {
  console.warn("[Socket] reconnect error:", error.message);
});

socket.io.on("reconnect_failed", () => {
  console.error("[Socket] reconnect failed");
});
