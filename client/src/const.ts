export const APP_TITLE = "VibraCam";

/** Local authentication entry point. Kept under the old name for compatibility. */
export function startLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}
