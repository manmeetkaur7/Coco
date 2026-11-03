import {
  allowPrivatePortrait,
  privatePortraitPath,
  PRIVATE_PORTRAIT_HEADERS,
  readPrivatePortrait,
} from "../../../../server/private-portrait";

export async function GET(request: Request) {
  if (!allowPrivatePortrait(request, process.env.NODE_ENV === "development")) {
    return new Response(null, {
      status: 404,
      headers: PRIVATE_PORTRAIT_HEADERS,
    });
  }
  try {
    const portrait = await readPrivatePortrait(privatePortraitPath());
    return new Response(new Uint8Array(portrait), {
      headers: { ...PRIVATE_PORTRAIT_HEADERS, "Content-Type": "image/png" },
    });
  } catch (error) {
    const missing =
      error instanceof Error && "code" in error && error.code === "ENOENT";
    return new Response(null, {
      status: missing ? 404 : 422,
      headers: PRIVATE_PORTRAIT_HEADERS,
    });
  }
}
