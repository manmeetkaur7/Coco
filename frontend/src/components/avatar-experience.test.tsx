import { createElement, type ImgHTMLAttributes } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarExperience } from "./avatar-experience";
import { AvatarDisplay } from "./avatar-display";
import {
  AVATAR_STATES,
  PORTRAIT_CAPABILITIES,
} from "../features/avatar/contracts";

vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    unoptimized?: boolean;
  }) => {
    void _fill;
    void _unoptimized;
    return createElement("img", props);
  },
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:private-portrait"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("portrait foundation", () => {
  it("uses an honest placeholder when the private photo is absent", async () => {
    render(<AvatarExperience />);
    await screen.findByText(/Reference photo not found/);
    expect(
      screen.getByRole("img", { name: /portrait placeholder/i }),
    ).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Idle" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByText(/blinking, and lip-sync require a rigged avatar/),
    ).toBeTruthy();
  });

  it("previews all four states without requesting voice, AI, or audio", async () => {
    const user = userEvent.setup();
    const { container } = render(<AvatarExperience />);
    await screen.findByText(/Reference photo not found/);
    for (const state of AVATAR_STATES) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${state}$`, "i"),
      });
      await user.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(
        container.querySelector(".avatar-stage")?.getAttribute("data-state"),
      ).toBe(state);
    }
    expect(
      screen.getByText("Speaking-state preview. No audio or lip-sync."),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")).toBeNull();
  });

  it("supports keyboard state selection and a user motion toggle", async () => {
    const user = userEvent.setup();
    const { container } = render(<AvatarExperience />);
    await screen.findByText(/Reference photo not found/);
    const thinking = screen.getByRole("button", { name: "Thinking" });
    thinking.focus();
    await user.keyboard("{Enter}");
    expect(thinking.getAttribute("aria-pressed")).toBe("true");
    await user.click(
      screen.getByRole("checkbox", { name: /Ambient portrait motion/ }),
    );
    expect(container.querySelector(".avatar-motion-paused")).toBeTruthy();
  });

  it("loads only the local portrait and releases its in-memory URL", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["synthetic non-face test bytes"]), {
        headers: { "Content-Type": "image/png" },
      }),
    );
    const { unmount } = render(<AvatarExperience />);
    const portrait = await screen.findByRole("img", {
      name: /privately stored reference/,
    });
    expect(portrait.getAttribute("src")).toBe("blob:private-portrait");
    expect(fetch).toHaveBeenCalledWith(
      "/api/avatar/reference",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-portrait");
  });

  it("falls back if a returned image cannot be decoded", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("invalid pixels", {
        headers: { "Content-Type": "image/png" },
      }),
    );
    render(<AvatarExperience />);
    fireEvent.error(
      await screen.findByRole("img", { name: /privately stored reference/ }),
    );
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /portrait placeholder/i }),
    ).toBeTruthy();
  });

  it("allows recovery after a failed portrait request", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<AvatarExperience />);
    await screen.findByText(/could not be loaded/);
    await user.click(screen.getByRole("button", { name: "Reload portrait" }));
    await screen.findByText(/Reference photo not found/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not fetch a personal portrait or expose dev controls in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<AvatarExperience />);
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(
      screen.queryByRole("group", { name: "Preview avatar state" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reload portrait" }),
    ).toBeNull();
  });

  it("accepts future external state updates without remounting the renderer", () => {
    const { rerender } = render(<AvatarDisplay state="idle" />);
    rerender(<AvatarDisplay state="listening" />);
    expect(screen.getByRole("status").textContent).toContain(
      "Microphone is off",
    );
    expect(PORTRAIT_CAPABILITIES.blinking).toBe(false);
    expect(PORTRAIT_CAPABILITIES.lipSync).toBe(false);
    expect(PORTRAIT_CAPABILITIES.facialMotion).toBe(false);
  });
});
