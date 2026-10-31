import "server-only";

/**
 * CSRF defence for route handlers (server actions already get Next's built-in origin check).
 * State-changing requests must come from this site: the Origin (or Referer) host must equal the Host.
 */
export async function sameOrigin(req: Request): Promise<boolean> {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
