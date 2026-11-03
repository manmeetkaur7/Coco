"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AvatarDisplay } from "./avatar-display";
import { Foundation, loadFoundation } from "@/lib/api";
type Connection = "connecting" | "connected" | "error";
export function AssistantDashboard() {
  const [data, setData] = useState<Foundation | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [attempt, setAttempt] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let active: AbortController | undefined;
    async function refresh() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const result = await loadFoundation(controller.signal);
        if (alive) {
          setData(result);
          setConnection("connected");
          setCheckedAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
        }
      } catch {
        controller.abort();
        if (alive) {
          setConnection("error");
          setCheckedAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => {
      alive = false;
      active?.abort();
      window.clearInterval(interval);
    };
  }, [attempt]);
  const status =
    connection === "connected"
      ? "Backend connected"
      : connection === "connecting"
        ? "Connecting to backend"
        : "Backend unavailable";
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Coco home">
          <span className="brand-mark">c</span>coco
        </Link>
        <span className="header-note">THE ART OF HOSPITALITY, REIMAGINED</span>
        <span className="sprint-badge">
          SPRINT 01 <span>FOUNDATION</span>
        </span>
      </header>
      <section className="page-heading">
        <div>
          <span className="eyebrow">YOUR DIGITAL RESTAURANT CONCIERGE</span>
          <h1>
            Hospitality feels <em>human.</em>
          </h1>
          <p>A thoughtful dining experience, with Coco at the heart of it.</p>
        </div>
        <div className={`connection ${connection}`} role="status">
          <span className="small-dot" />
          {status}
          <small>
            {checkedAt
              ? `Last checked ${checkedAt} · every 15s`
              : "Checking local API"}
          </small>
        </div>
      </section>
      {connection === "error" && (
        <div className="error-banner" role="alert">
          <div>
            <strong>We couldn’t reach all foundation endpoints.</strong>
            <p>
              Start the FastAPI backend on port 8000 and check your API URL.{" "}
              {data
                ? "Previously loaded sample data is shown below."
                : "Restaurant and menu data will appear once connected."}
            </p>
          </div>
          <button
            className="retry"
            onClick={() => {
              setConnection("connecting");
              setAttempt((n) => n + 1);
            }}
          >
            Retry connection ↗
          </button>
        </div>
      )}
      <div className="workspace">
        <section className="host-panel panel">
          <div className="panel-top">
            <span>
              <span className="small-dot gold" /> COCO · YOUR HOST
            </span>
            <span className="muted">PREVIEW ENVIRONMENT</span>
          </div>
          <AvatarDisplay />
          <div className="host-controls">
            <div>
              <strong>A conversation worth waiting for.</strong>
              <p>
                Real-time voice and expressions are coming in a future sprint.
              </p>
            </div>
            <div className="buttons">
              <button
                className="mic"
                disabled
                aria-label="Microphone unavailable in Sprint 1"
                title="Speech input is planned"
              >
                <svg
                  width="16"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
                </svg>
              </button>
              <button className="primary" disabled>
                Start Conversation <span>↗</span>
              </button>
              <button className="secondary" disabled>
                End Conversation
              </button>
            </div>
            <span className="control-note">
              Preview only · Conversation controls are not enabled
            </span>
          </div>
        </section>
        <section className="transcript panel">
          <div className="panel-top">
            <span>CONVERSATION</span>
            <span className="muted">TRANSCRIPT</span>
          </div>
          <div className="transcript-empty">
            <div className="chat-icon">“</div>
            <h2>
              A little connection.
              <br />A lot of possibility.
            </h2>
            <p>
              Your conversation with Coco will appear here when voice and AI
              integration are available.
            </p>
            <span className="waiting-tag">NO ACTIVE SESSION</span>
          </div>
          <div className="transcript-footer">
            <span className="small-dot" />
            {data?.assistant.phase ?? "Sprint 1 · Foundation"}
            <p>No microphone access. No recorded audio.</p>
          </div>
        </section>
      </div>
      <div className="restaurant-grid">
        <section className="restaurant panel">
          <span className="eyebrow">THE RESTAURANT</span>
          {data ? (
            <>
              <div className="restaurant-title">
                <h2>{data.restaurant.name}</h2>
                <span className="sample-badge">SAMPLE DATA</span>
              </div>
              <p className="cuisine">{data.restaurant.cuisine}</p>
              <p>{data.restaurant.description}</p>
              <div className="restaurant-details">
                <span>◷ {data.restaurant.hours}</span>
                <span>⌖ {data.restaurant.address}</span>
              </div>
            </>
          ) : (
            <div className="data-placeholder" role="status">
              {connection === "connecting"
                ? "Loading restaurant details…"
                : "Restaurant information unavailable."}
            </div>
          )}
        </section>
        <section className="menu panel">
          <div className="menu-header">
            <div>
              <span className="eyebrow">A TASTE OF WHAT’S TO COME</span>
              <h2>From the menu</h2>
            </div>
            <span className="sample-badge">SAMPLE MENU · USD</span>
          </div>
          {data ? (
            <div className="menu-items">
              {data.menu.items.map((item) => (
                <article className="menu-item" key={item.id}>
                  <div className="menu-item-top">
                    <span className="category">{item.category}</span>
                    <span className="price">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: data.menu.currency,
                      }).format(item.price)}
                    </span>
                  </div>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  {item.dietary_tags.map((tag) => (
                    <span className="dietary" key={tag}>
                      {tag}
                    </span>
                  ))}
                </article>
              ))}
            </div>
          ) : (
            <div className="data-placeholder" role="status">
              {connection === "connecting"
                ? "Loading sample menu…"
                : "Menu unavailable. Reconnect to load sample dishes."}
            </div>
          )}
        </section>
      </div>
      <footer className="footer">
        <span>
          coco <span className="muted">/ Designed around people.</span>
        </span>
        <span>FOUNDATION PREVIEW · FICTIONAL RESTAURANT DATA</span>
      </footer>
    </main>
  );
}
