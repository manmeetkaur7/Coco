/** Server file I/O only. Never import this module into a client component. */
import { open } from "node:fs/promises";
import { resolve } from "node:path";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PORTRAIT_BYTES = 20 * 1024 * 1024;
export const PRIVATE_PORTRAIT_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function privatePortraitPath() {
  // Next runs from frontend/; no request parameter can choose a file.
  return resolve(process.cwd(), "..", "private-assets", "coco-reference.png");
}

export function allowPrivatePortrait(request: Request, isDevelopment: boolean) {
  if (!isDevelopment) return false;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const authority = new URL(`http://${host}`);
    if (
      authority.host !== host ||
      !["localhost", "127.0.0.1", "[::1]"].includes(authority.hostname)
    )
      return false;
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== authority.host) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
  } catch {
    return false;
  }
}

export async function readPrivatePortrait(filePath: string) {
  const file = await open(filePath, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 24 || info.size > MAX_PORTRAIT_BYTES)
      throw new Error("Invalid portrait size");
    const bytes = await file.readFile();
    if (
      bytes.length > MAX_PORTRAIT_BYTES ||
      !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
      bytes.toString("ascii", 12, 16) !== "IHDR"
    ) {
      throw new Error("Expected a PNG portrait");
    }
    return bytes;
  } finally {
    await file.close();
  }
}
