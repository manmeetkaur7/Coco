export type Money = string | null;
export interface Option {
  id: string;
  name: string;
  aliases: string[];
  price: Money;
  source_url: string;
  availability: "available" | "unavailable" | "unknown";
}
export interface Category {
  id: string;
  name: string;
  note: string | null;
}
export interface MenuItem {
  id: string;
  name: string;
  category_id: string;
  kind: "pizza" | "side" | "wings" | "salad" | "dessert" | "beverage";
  description: string | null;
  ingredients: string[];
  aliases: string[];
  price: Money;
  availability: "available" | "unavailable" | "unknown";
  variations: Option[];
  topping_ids: string[];
  included_topping_ids: string[];
  add_on_ids: string[];
  source_url: string;
}
export interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  location_id: string | null;
  menu_version: string;
  source_url: string;
  currency: "USD";
  tax: { rate: Money };
  promotions: Record<string, string>[];
  missing_data: string[];
  demo_only: true;
}
export interface Menu {
  restaurant_id: string;
  version: string;
  verified_on: string;
  source_urls: string[];
  categories: Category[];
  toppings: Option[];
  add_ons: Option[];
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
export interface CartLine {
  line_id: string;
  item_id: string;
  quantity: number;
  variation_id: string | null;
  added_topping_ids: string[];
  removed_topping_ids: string[];
  add_on_ids: string[];
}
export interface Cart {
  restaurant_id: string;
  lines: CartLine[];
}
export interface SummaryLine {
  line: CartLine;
  name: string;
  variation_name: string | null;
  added_toppings: string[];
  removed_toppings: string[];
  add_ons: string[];
  unit_price: Money;
  line_total: Money;
}
export interface CartSummary {
  lines: SummaryLine[];
  currency: "USD";
  subtotal: Money;
  tax: Money;
  total: Money;
  warnings: string[];
  review_token: string;
  readback: string;
}
export interface OrderingContext {
  memory?: { recent: { role: "customer" | "assistant"; text: string }[]; preferences: ("vegetarian" | "no_mushrooms" | "no_onions")[]; notes?: string[] };
  pending?: {
    item_id?: string | null;
    quantity: number;
    variation_id?: string | null;
    topping_ids: string[];
    choice_item_ids?: string[];
  } | null;
  target_line_id?: string | null;
  review_token?: string | null;
}
export interface Draft {
  id: string;
  status: "draft" | "demo_confirmed";
  submitted_to_restaurant: false;
  payment_processed: false;
  message: string;
  summary: CartSummary;
}
export interface Turn {
  reply: string;
  session_action: "continue" | "end";
  language: "en-US";
  engine: "deterministic" | "local-model";
  model: ModelState;
  cart: Cart;
  context: OrderingContext;
  summary: CartSummary;
  draft: Draft | null;
}
export interface ModelState {
  available: boolean;
  mode: "local" | "fallback" | "disabled";
  name: string;
  message: string;
}
export const EMPTY_CART: Cart = { restaurant_id: "round-table", lines: [] };
const base = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
export async function request<T>(
  path: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    signal,
    cache: "no-store",
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* Keep a readable fallback for non-JSON proxy errors. */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}
export const restaurantPath = (id: string) =>
  `/api/v1/restaurants/${encodeURIComponent(id)}`;
export async function loadFoundation(signal: AbortSignal) {
  const path = restaurantPath("round-table");
  const [health, assistant, restaurant, menu, model] = await Promise.all([
    request<{ status: string }>("/health", signal),
    request<AssistantStatus>("/api/v1/assistant/status", signal),
    request<Restaurant>(path, signal),
    request<Menu>(`${path}/menu`, signal),
    request<ModelState>("/api/v1/assistant/model", signal),
  ]);
  if (health.status !== "ok") throw new Error("Backend health check failed");
  return { assistant, restaurant, menu, model };
}
export type Foundation = Awaited<ReturnType<typeof loadFoundation>>;
export function money(value: Money) {
  return value === null
    ? "Unverified"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(Number(value));
}
