"use client";
import { useEffect, useState } from "react";
import {
  CartLine,
  Menu,
  MenuItem,
  money,
  request,
  restaurantPath,
} from "../lib/api";

export function MenuBrowser({
  menu,
  busy,
  onAdd,
}: {
  menu: Menu;
  busy: boolean;
  onAdd: (line: CartLine) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    query: "",
    category: "all",
    items: menu.items,
    error: null as string | null,
  });
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    let deadline: number | undefined;
    const timer = window.setTimeout(() => {
      setSearching(true);
      deadline = window.setTimeout(() => abort.abort(), 8000);
      const params = new URLSearchParams({ q: query });
      if (category !== "all") params.set("category", category);
      void request<MenuItem[]>(
        `${restaurantPath(menu.restaurant_id)}/menu/items?${params}`,
        abort.signal,
      )
        .then((items) => {
          if (!disposed) setResult({ query, category, items, error: null });
        })
        .catch(() => {
          if (!disposed)
            setResult({
              query,
              category,
              items: [],
              error:
                "Menu search could not connect. Clear the search or retry when the backend is available.",
            });
        })
        .finally(() => {
          window.clearTimeout(deadline);
          if (!disposed) setSearching(false);
        });
    }, 200);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
      abort.abort();
    };
  }, [query, category, menu.restaurant_id, menu.version, attempt]);
  const current = result.query === query && result.category === category;
  return (
    <section className="ordering-menu panel" aria-labelledby="menu-title">
      <div className="menu-header">
        <div>
          <span className="eyebrow">ROUND TABLE · VERIFIED CATALOG SUBSET</span>
          <h2 id="menu-title">Find your next favorite.</h2>
        </div>
        <span className="sample-badge">LOCAL DEMO · NOT A LIVE STORE</span>
      </div>
      <p className="catalog-notice">
        National menu names, with ingredient options from the dated official
        guide. Local availability, prices and tax are unverified. Drafts never
        reach a restaurant.
      </p>
      <label className="menu-search">
        Search the menu
        <input
          type="search"
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pizza, mushrooms, garlic…"
        />
      </label>
      {current && result.error && (
        <button
          type="button"
          className="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry menu search
        </button>
      )}
      <nav className="category-nav" aria-label="Menu categories">
        <button
          type="button"
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
        >
          All items
        </button>
        {menu.categories.map((entry) => (
          <button
            type="button"
            aria-pressed={category === entry.id}
            key={entry.id}
            onClick={() => setCategory(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </nav>
      <div role="status" className="search-status">
        {searching || !current
          ? "Searching verified menu…"
          : (result.error ?? `${result.items.length} verified catalog items`)}
      </div>
      {current && !searching && result.items.length === 0 && (
        <p>
          {menu.categories.find((entry) => entry.id === category)?.note ??
            "No verified items match this search. Try another category or search term."}
        </p>
      )}
      <div className="catalog-cards">
        {current &&
          result.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              menu={menu}
              busy={busy}
              onAdd={onAdd}
            />
          ))}
      </div>
      <p className="catalog-source">
        Sources:{" "}
        {menu.source_urls.map((url, index) => (
          <a href={url} target="_blank" rel="noreferrer" key={url}>
            {index === 0
              ? "Official national menu ↗"
              : "Official 2024 ingredient guide ↗"}
          </a>
        ))}{" "}
        · verified {menu.verified_on}
      </p>
    </section>
  );
}

function ItemCard({
  item,
  menu,
  busy,
  onAdd,
}: {
  item: MenuItem;
  menu: Menu;
  busy: boolean;
  onAdd: (line: CartLine) => Promise<boolean>;
}) {
  const [variation, setVariation] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const toggle = (values: string[], key: string) =>
    values.includes(key)
      ? values.filter((value) => value !== key)
      : [...values, key];
  const validQuantity =
    Number.isInteger(Number(quantity)) &&
    Number(quantity) >= 1 &&
    Number(quantity) <= 20;
  const unavailable = item.availability === "unavailable";
  const valid =
    validQuantity && (!item.variations.length || !!variation) && !unavailable;
  async function add() {
    const ok = await onAdd({
      line_id: crypto.randomUUID(),
      item_id: item.id,
      quantity: Number(quantity),
      variation_id: variation || null,
      added_topping_ids: added,
      removed_topping_ids: removed,
      add_on_ids: extras,
    });
    if (ok) setNotice("Added to your demo cart.");
  }
  return (
    <article className="catalog-card" data-testid={`item-${item.id}`}>
      <div className="catalog-card-heading">
        <span className="category">
          {
            menu.categories.find((category) => category.id === item.category_id)
              ?.name
          }
        </span>
        <span className="price">
          {item.price === null ? "Price unverified" : money(item.price)}
        </span>
      </div>
      <h3>{item.name}</h3>
      <p>
        {item.description ??
          "Brand, flavor and local details have not been verified."}
      </p>
      <span className={`availability ${unavailable ? "is-unavailable" : ""}`}>
        {unavailable
          ? "Unavailable"
          : item.availability === "unknown"
            ? "Confirm availability with location"
            : "Available"}
      </span>
      <details className="item-customization">
        <summary>Customize &amp; add</summary>
        <fieldset disabled={busy || unavailable}>
          {item.variations.length > 0 && (
            <label>
              Size / variation
              <select
                aria-label={`Size for ${item.name}`}
                value={variation}
                onChange={(event) => setVariation(event.target.value)}
              >
                <option value="">Choose a verified option</option>
                {item.variations.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    disabled={option.availability === "unavailable"}
                  >
                    {option.name} · {money(option.price)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Quantity
            <input
              aria-label={`Quantity for ${item.name}`}
              type="number"
              min={1}
              max={20}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          {item.topping_ids.length > 0 && (
            <div className="customization-options">
              <span>Add toppings · charges unverified</span>
              {menu.toppings
                .filter(
                  (option) =>
                    item.topping_ids.includes(option.id) &&
                    !item.included_topping_ids.includes(option.id),
                )
                .map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={added.includes(option.id)}
                      disabled={option.availability === "unavailable"}
                      onChange={() => setAdded(toggle(added, option.id))}
                    />
                    Add {option.name}
                  </label>
                ))}
            </div>
          )}
          {item.included_topping_ids.length > 0 && (
            <div className="customization-options">
              <span>Remove included toppings</span>
              {menu.toppings
                .filter((option) =>
                  item.included_topping_ids.includes(option.id),
                )
                .map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={removed.includes(option.id)}
                      onChange={() => setRemoved(toggle(removed, option.id))}
                    />
                    Remove {option.name}
                  </label>
                ))}
            </div>
          )}
          {item.add_on_ids.length > 0 && (
            <div className="customization-options">
              <span>Add-ons</span>
              {menu.add_ons
                .filter((option) => item.add_on_ids.includes(option.id))
                .map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={extras.includes(option.id)}
                      onChange={() => setExtras(toggle(extras, option.id))}
                    />
                    {option.name} · {money(option.price)}
                  </label>
                ))}
            </div>
          )}
          <button
            type="button"
            className="add-cart-button"
            disabled={!valid}
            onClick={() => void add()}
          >
            Add to demo cart
          </button>
          {!valid && (
            <p className="field-note">
              {unavailable
                ? "This item cannot be added."
                : "Choose a size/variation and a quantity between 1 and 20."}
            </p>
          )}
        </fieldset>
        <p className="field-note">
          Only listed options are supported. Extra cheese, half-and-half, sauces
          and other requests need local verification.
        </p>
      </details>
      <p role="status" className="field-note">
        {notice}
      </p>
    </article>
  );
}
