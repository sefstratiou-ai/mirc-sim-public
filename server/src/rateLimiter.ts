const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const MAX_REQUESTS = 30; // per window
const WINDOW_MS = 60000; // 1 minute

export function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientId);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}
