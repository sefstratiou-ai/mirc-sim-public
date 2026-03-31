import { Request } from 'express';

/**
 * Extract the real client IP from a request, preferring X-Forwarded-For
 * (set by Railway/reverse proxies) and stripping the ::ffff: IPv4-mapped prefix.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = forwarded
    ? String(forwarded).split(',')[0].trim()
    : req.ip || 'unknown';
  return raw.replace(/^::ffff:/, '');
}
