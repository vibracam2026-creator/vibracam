type ErrorEvent = { source: string; message: string; at: string };

const recentErrors: ErrorEvent[] = [];

export function recordServerError(source: string, error: unknown) {
  recentErrors.push({ source, message: error instanceof Error ? error.message : String(error), at: new Date().toISOString() });
  if (recentErrors.length > 100) recentErrors.shift();
}

export function getRecentErrorSummary() {
  return { count: recentErrors.length, recent: recentErrors.slice(-20) };
}
