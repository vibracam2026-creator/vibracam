const RESEND_API_URL = "https://api.resend.com";

function getApiKey() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("مفتاح خدمة البريد غير مُعد.");
  return apiKey;
}

function getFromAddress() {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("عنوان البريد المُرسِل غير مُعد.");
  return from;
}

async function resendRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${RESEND_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`تعذر الاتصال بخدمة البريد (${response.status}).`);
  return response;
}

/** فحص اعتماد المفتاح عبر قائمة النطاقات دون إرسال رسالة بريدية. */
export async function verifyResendConnection() {
  const response = await fetch(`${RESEND_API_URL}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" },
    body: "{}",
  });
  // المفتاح المقيد بالإرسال يرفض قائمة النطاقات؛ طلب فارغ هنا يعيد 400/422 بعد تحقق المصادقة ولا يرسل رسالة.
  if (response.status === 400 || response.status === 422) return true;
  if (!response.ok) throw new Error(`تعذر الاتصال بخدمة البريد (${response.status}).`);
  return true;
}

export async function sendAccountEmail(input: { to: string; subject: string; html: string }) {
  const response = await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify({ from: getFromAddress(), to: [input.to], subject: input.subject, html: input.html }),
  });
  return response.json() as Promise<{ id: string }>;
}
