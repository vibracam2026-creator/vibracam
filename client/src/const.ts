export const APP_TITLE = "VibraCam";

/** Local authentication entry point. No external identity provider is used. */
export function startLogin() {
  if (typeof window !== "undefined") window.location.assign("/login");
}
