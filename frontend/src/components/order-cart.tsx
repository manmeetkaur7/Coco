"use client";
import { Menu, money } from "../lib/api";
import { OrderSession } from "../features/ordering/use-order-session";

export function OrderCart({
  order,
  menu,
}: {
  order: OrderSession;
  menu: Menu;
}) {
  const summary = order.summary;
  const canConfirm =
    !!summary &&
    !(order.context.pending || order.context.pending_edit) &&
    order.context.review_token === summary.review_token &&
    order.cart.lines.length > 0;
  return (
    <aside className="order-cart panel" aria-labelledby="cart-title">
      <span className="eyebrow">YOUR ORDER · IN THIS TAB ONLY</span>
      <h2 id="cart-title">The draft table.</h2>
      <p className="catalog-notice">
        No restaurant submission or payment. Refreshing this page clears the
        draft.
      </p>
      {!order.cart.lines.length && (
        <p className="cart-empty">
          Your cart is waiting for something delicious. Browse the menu or talk
          to Coco.
        </p>
      )}
      {order.cart.lines.length > 0 && (
        <label className="voice-target">
          Item for voice changes
          <select
            aria-label="Item for voice changes"
            value={order.context.target_line_id ?? ""}
            onChange={(event) => order.selectLine(event.target.value)}
            disabled={order.busy}
          >
            <option value="">Choose an item</option>
            {order.cart.lines.map((line, index) => (
              <option value={line.line_id} key={line.line_id}>
                Item {index + 1}:{" "}
                {menu.items.find((item) => item.id === line.item_id)?.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ol className="cart-lines">
        {order.cart.lines.map((line, index) => {
          const item = menu.items.find((item) => item.id === line.item_id);
          const priced = summary?.lines.find(
            (entry) => entry.line.line_id === line.line_id,
          );
          if (!item) return null;
          const toggle = (values: string[], id: string) =>
            values.includes(id)
              ? values.filter((key) => key !== id)
              : [...values, id];
          return (
            <li key={line.line_id} data-testid={`cart-line-${index}`}>
              <div className="cart-line-heading">
                <h3>{item.name}</h3>
                <span>{priced ? money(priced.line_total) : "Checking…"}</span>
              </div>
              <fieldset disabled={order.busy}>
                {item.variations.length > 0 && (
                  <label>
                    Size / variation
                    <select
                      aria-label={`Cart size for item ${index + 1}`}
                      value={line.variation_id ?? ""}
                      onChange={(event) =>
                        void order.updateLine({
                          ...line,
                          variation_id: event.target.value,
                        })
                      }
                    >
                      {item.variations.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={option.availability === "unavailable"}
                        >
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="quantity-stepper">
                  <button
                    type="button"
                    aria-label={`Decrease quantity for item ${index + 1}`}
                    disabled={line.quantity <= 1}
                    onClick={() =>
                      void order.updateLine({
                        ...line,
                        quantity: line.quantity - 1,
                      })
                    }
                  >
                    −
                  </button>
                  <output aria-label={`Quantity for item ${index + 1}`}>
                    {line.quantity}
                  </output>
                  <button
                    type="button"
                    aria-label={`Increase quantity for item ${index + 1}`}
                    disabled={line.quantity >= 20}
                    onClick={() =>
                      void order.updateLine({
                        ...line,
                        quantity: line.quantity + 1,
                      })
                    }
                  >
                    +
                  </button>
                  <button
                    className="remove-line"
                    type="button"
                    onClick={() => void order.removeLine(line.line_id)}
                  >
                    Remove item {index + 1}
                  </button>
                </div>
                {item.kind === "pizza" && (
                  <details className="cart-customizations">
                    <summary>Edit toppings</summary>
                    <div className="customization-options">
                      {menu.toppings
                        .filter((option) =>
                          item.topping_ids.includes(option.id),
                        )
                        .map((option) => {
                          const included = item.included_topping_ids.includes(
                            option.id,
                          );
                          return (
                            <label key={option.id}>
                              <input
                                type="checkbox"
                                disabled={option.availability === "unavailable"}
                                checked={
                                  included
                                    ? line.removed_topping_ids.includes(
                                        option.id,
                                      )
                                    : line.added_topping_ids.includes(option.id)
                                }
                                onChange={() =>
                                  void order.updateLine(
                                    included
                                      ? {
                                          ...line,
                                          removed_topping_ids: toggle(
                                            line.removed_topping_ids,
                                            option.id,
                                          ),
                                        }
                                      : {
                                          ...line,
                                          added_topping_ids: toggle(
                                            line.added_topping_ids,
                                            option.id,
                                          ),
                                        },
                                  )
                                }
                              />
                              {included ? "Remove" : "Add"} {option.name}
                            </label>
                          );
                        })}
                    </div>
                  </details>
                )}
              </fieldset>
              {priced && (
                <p className="field-note">
                  {[
                    ...priced.added_toppings.map((name) => `+ ${name}`),
                    ...priced.removed_toppings.map((name) => `− ${name}`),
                  ].join(" · ") || "No topping changes"}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <dl className="cart-totals">
        <div>
          <dt>Verified subtotal</dt>
          <dd>{summary ? money(summary.subtotal) : "Not calculated"}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>{summary ? money(summary.tax) : "Unverified"}</dd>
        </div>
        <div>
          <dt>Final total</dt>
          <dd>{summary ? money(summary.total) : "Unverified"}</dd>
        </div>
      </dl>
      {summary && (
        <details className="price-warnings" open>
          <summary>Verification needed</summary>
          <ul>
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="cart-actions">
        <button
          type="button"
          className="add-cart-button"
          disabled={order.busy || !order.cart.lines.length || !!(order.context.pending || order.context.pending_edit)}
          onClick={() => void order.review()}
        >
          Review draft
        </button>
        <button
          type="button"
          className="secondary"
          disabled={order.busy || !order.cart.lines.length}
          onClick={() => void order.clear()}
        >
          Clear cart
        </button>
      </div>
      {(order.context.pending || order.context.pending_edit) && (
        <p className="field-note" role="status">
          Finish the pending item choice in the conversation before reviewing
          or confirming, or say “start over” to clear the draft.
        </p>
      )}
      {canConfirm && (
        <div className="order-readback">
          <h3>Review before confirming</h3>
          <p>{summary?.readback}</p>
          <button
            type="button"
            className="add-cart-button"
            disabled={order.busy}
            onClick={() => void order.confirm()}
          >
            Confirm demo draft
          </button>
        </div>
      )}
      {order.draft?.status === "demo_confirmed" && (
        <div className="demo-confirmation" role="status">
          <strong>Demo draft confirmed</strong>
          <p>{order.draft.message}</p>
        </div>
      )}
    </aside>
  );
}
