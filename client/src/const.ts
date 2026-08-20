import { encodeOAuthState, OAUTH_STATE_COOKIE } from "@shared/const";

export const APP_TITLE = "VibraCam";

export function startLogin() {
  const portal = import.meta.env.VITE_OAUTH_PORTAL_URL?.trim();
  const appId = import.meta.env.VITE_APP_ID?.trim();
  if (!portal || !appId) throw new Error("لم تُهيّأ خدمة تسجيل الدخول بعد.");
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const nonce = crypto.randomUUID();
  const isHttps = window.location.protocol === "https:";
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=${isHttps ? "None; Secure" : "Lax"}`;
  const params = new URLSearchParams({
    app_id: appId,
    redirect_url: redirectUri,
    state: encodeOAuthState({ redirectUri, nonce }),
  });
  window.location.assign(`${portal}/login?${params.toString()}`);
}
