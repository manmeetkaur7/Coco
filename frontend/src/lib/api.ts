export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  address: string;
  hours: string;
  sample_data: true;
}
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  dietary_tags: string[];
}
export interface Menu {
  restaurant_id: string;
  currency: "USD";
  sample_data: true;
  items: MenuItem[];
}
export interface AssistantStatus {
  name: string;
  phase: string;
  conversation_available: boolean;
  avatar_available: boolean;
  voice_available: boolean;
  avatar_mode: "portrait-foundation";
  avatar_state_preview_available: boolean;
  facial_animation_available: boolean;
  lip_sync_available: boolean;
  message: string;
}
const base = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${base}${path}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}
export async function loadFoundation(signal: AbortSignal) {
  const [health, assistant, restaurant, menu] = await Promise.all([
    request<{ status: string }>("/health", signal),
    request<AssistantStatus>("/api/v1/assistant/status", signal),
    request<Restaurant>("/api/v1/restaurants/demo", signal),
    request<Menu>("/api/v1/restaurants/demo/menu", signal),
  ]);
  if (health.status !== "ok") throw new Error("Backend health check failed");
  return { assistant, restaurant, menu };
}
export type Foundation = Awaited<ReturnType<typeof loadFoundation>>;
