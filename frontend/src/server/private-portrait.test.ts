// @vitest-environment node
import { mkdtemp, mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as storage from "./private-portrait";
import { GET } from "../app/api/avatar/reference/route";

// A transparent 1x1 pixel, never a stand-in face or a user photograph.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);
const privateRoot = resolve(process.cwd(), "..", "private-assets");
let fixtureDirectory: string;
const localRequest = (headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:3000/api/avatar/reference", {
    headers: { host: "127.0.0.1:3000", ...headers },
  });

beforeEach(async () => {
  await mkdir(privateRoot, { recursive: true });
  fixtureDirectory = await mkdtemp(join(privateRoot, "test-portrait-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  // Only the newly created test directory can be removed, never the real portrait.
  if (dirname(fixtureDirectory) !== privateRoot)
    throw new Error("Unexpected test path");
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("private portrait storage and route", () => {
  it("only permits local, same-site development requests", () => {
    expect(storage.allowPrivatePortrait(localRequest(), true)).toBe(true);
    expect(storage.allowPrivatePortrait(localRequest(), false)).toBe(false);
    expect(
      storage.allowPrivatePortrait(localRequest({ host: "example.com" }), true),
    ).toBe(false);
    expect(
      storage.allowPrivatePortrait(
        localRequest({ origin: "https://example.com" }),
        true,
      ),
    ).toBe(false);
    expect(
      storage.allowPrivatePortrait(
        localRequest({ "sec-fetch-site": "cross-site" }),
        true,
      ),
    ).toBe(false);
    expect(
      storage.allowPrivatePortrait(new Request("http://localhost"), true),
    ).toBe(false);
  });

  it("uses a fixed path outside public/ and reads a valid PNG", async () => {
    expect(storage.privatePortraitPath()).toBe(
      join(privateRoot, "coco-reference.png"),
    );
    const file = join(fixtureDirectory, "pixel.png");
    await writeFile(file, PIXEL);
    expect(await storage.readPrivatePortrait(file)).toEqual(PIXEL);
  });

  it("rejects missing files, renamed non-PNG files and oversized files", async () => {
    await expect(
      storage.readPrivatePortrait(join(fixtureDirectory, "missing.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const file = join(fixtureDirectory, "invalid.png");
    await writeFile(
      file,
      "This is not a PNG image despite the file extension.",
    );
    await expect(storage.readPrivatePortrait(file)).rejects.toThrow(
      "Expected a PNG",
    );
    const large = await open(file, "w");
    await large.truncate(20 * 1024 * 1024 + 1);
    await large.close();
    await expect(storage.readPrivatePortrait(file)).rejects.toThrow(
      "Invalid portrait size",
    );
  });

  it("returns a private no-store image in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(storage, "readPrivatePortrait").mockResolvedValue(PIXEL);
    const response = await GET(localRequest());
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PIXEL);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
  });

  it("never reads the file in production, even when a portrait exists", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const reader = vi
      .spyOn(storage, "readPrivatePortrait")
      .mockResolvedValue(PIXEL);
    const response = await GET(localRequest());
    expect(response.status).toBe(404);
    expect(reader).not.toHaveBeenCalled();
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects remote host requests before reading a private file", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const reader = vi.spyOn(storage, "readPrivatePortrait");
    expect((await GET(localRequest({ host: "public.example" }))).status).toBe(
      404,
    );
    expect(reader).not.toHaveBeenCalled();
  });

  it("reports missing or invalid assets without disclosing filesystem details", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const reader = vi.spyOn(storage, "readPrivatePortrait");
    reader.mockRejectedValueOnce(
      Object.assign(new Error("private path"), { code: "ENOENT" }),
    );
    expect((await GET(localRequest())).status).toBe(404);
    reader.mockRejectedValueOnce(new Error("sensitive internal path"));
    const response = await GET(localRequest());
    expect(response.status).toBe(422);
    expect(await response.text()).toBe("");
  });
});
