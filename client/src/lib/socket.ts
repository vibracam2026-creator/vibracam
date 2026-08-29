import { io, type Socket } from "socket.io-client";

/**
 * Socket.IO connection shared by the whole VibraCam application.
 *
 * IMPORTANT:
 * Do not create another Socket.IO connection inside individual pages.
 * Do not call socket.close() when a page is unmounted.
 */
export const socket: Socket = io(window.location.origin, {
  path: "/api/socket.io",

  withCredentials: true,

  // Start with polling and upgrade to WebSocket when available.
  transports: ["polling", "websocket"],

  // Automatic reconnection.
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,

  // Connection timeout.
  timeout: 10000,

  // Connect automatically.
  autoConnect: true,
});

/**
 * Shared socket alias.
 *
 * This fixes imports such as:
 * import { appSocket } from "@/lib/socket";
 */
export const appSocket = socket;

/**
 * Socket connected.
 */
socket.on("connect", () => {
  console.log("[Socket.IO] Connected:", socket.id);
});

/**
 * Socket disconnected.
 *
 * The Socket.IO client will automatically try to reconnect.
 */
socket.on("disconnect", (reason) => {
  console.warn("[Socket.IO] Disconnected:", reason);
});

/**
 * Connection error.
 */
socket.on("connect_error", (error) => {
  console.warn("[Socket.IO] Connection error:", error.message);
});

/**
 * Reconnection attempt.
 */
socket.io.on("reconnect_attempt", (attempt) => {
  console.log("[Socket.IO] Reconnecting... attempt:", attempt);
});

/**
 * Successfully reconnected.
 */
socket.io.on("reconnect", (attempt) => {
  console.log("[Socket.IO] Reconnected after attempt:", attempt);
});

/**
 * Reconnection error.
 */
socket.io.on("reconnect_error", (error) => {
  console.warn("[Socket.IO] Reconnect error:", error.message);
});

/**
 * All reconnection attempts failed.
 */
socket.io.on("reconnect_failed", () => {
  console.error("[Socket.IO] Reconnection failed");
});
