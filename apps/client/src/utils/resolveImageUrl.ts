/**
 * Extracts the origin (protocol + host + port) from VITE_API_URL.
 * E.g. "http://localhost:3000/api" → "http://localhost:3000"
 */
function getApiOrigin(): string {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) || "";
  if (!apiUrl) return "";

  try {
    const url = new URL(apiUrl);
    return url.origin;
  } catch {
    // Fallback: strip trailing /api path if present
    return apiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
  }
}

/**
 * Resolves an image URL to an absolute URL.
 * If the URL is already absolute (starts with http), returns it as-is.
 * If relative, prepends the API origin (without the /api path).
 */
export function resolveImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;

  const origin = getApiOrigin();
  if (!origin) return url;

  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${origin}${cleanUrl}`;
}
