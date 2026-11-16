"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AvatarExperience } from "./avatar-experience";
import { MenuBrowser } from "./menu-browser";
import { OrderCart } from "./order-cart";
import { Foundation, loadFoundation, type CartLine } from "../lib/api";
import { useOrderSession } from "../features/ordering/use-order-session";
import { useBrowserVoice } from "../features/ordering/use-browser-voice";
import { LANGUAGES, LanguageCode } from "../features/ordering/languages";
import type { AvatarState } from "../features/avatar/contracts";

type Connection = "connecting" | "connected" | "error";
export function AssistantDashboard() {
  const [data, setData] = useState<Foundation | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [attempt, setAttempt] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<LanguageCode>("en-US");
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [voiceURI, setVoiceURI] = useState("");
  const order = useOrderSession();
  const { send, setModel } = order;
  const onFinal = useCallback(
    (final: string) => send(final, language),
    [send, language],
  );
  const voice = useBrowserVoice(onFinal);
  const submission = useRef(0);
  const played = useRef<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
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
          setModel(result.model);
          setConnection("connected");
        }
      } catch {
        controller.abort();
        if (alive) setConnection("error");
      } finally {
        window.clearTimeout(timeout);
        if (alive)
          setCheckedAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => {
      alive = false;
      active?.abort();
      window.clearInterval(interval);
    };
  }, [attempt, setModel]);
  useEffect(() => {
    const announcement = order.announcement;
    if (!announcement || played.current === announcement.id) return;
    played.current = announcement.id;
    if (announcement.sessionAction === "end") voice.controller.endSession();
    if (speechEnabled)
      voice.controller.speak(
        announcement.text,
        announcement.language,
        voiceURI,
      );
  }, [order.announcement, speechEnabled, voiceURI, voice.controller]);
  useEffect(() => {
    voice.controller.setAvailable(connection === "connected");
  }, [connection, voice.controller]);
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [order.transcript.length]);
  const state: AvatarState = voice.speaking
    ? "speaking"
    : order.busy
      ? "thinking"
      : voice.listening
        ? "listening"
        : "idle";
  const activityDescription = {
    idle: "Ready for typed or browser voice ordering.",
    listening: "Microphone active. Your consented voice session resumes after browser pauses.",
    thinking: "Processing your request with the ordering backend.",
    speaking: "Browser speech audio is playing. No facial lip-sync.",
  }[state];
  const phase = voice.speaking ? "Speaking" : order.busy ? "Thinking" : voice.listening ? "Listening" : order.active || voice.sessionActive ? "Paused" : "Ended";
  const status =
    connection === "connected"
      ? "Backend connected"
      : connection === "connecting"
        ? "Connecting to backend"
        : "Backend unavailable";
  async function submit() {
    if (!text.trim() || connection !== "connected") return;
    const operation = ++submission.current;
    const turn = voice.controller.beginTurn();
    const value = text;
    setText("");
    try {
      const ok = await order.send(value, language);
      if (!ok && operation === submission.current) setText((current) => current || value);
    } finally { voice.controller.finishTurn(turn); }
  }
  function interruptReply() {
    submission.current++;
    order.cancelPending();
    voice.controller.finishTurn(voice.controller.beginTurn());
  }
  async function interrupt(action: () => Promise<boolean>) {
    const turn = voice.controller.beginTurn();
    try { return await action(); }
    finally { voice.controller.finishTurn(turn); }
  }
  const cartOrder = {
    ...order,
    addLine: (line: CartLine) => interrupt(() => order.addLine(line)),
    updateLine: (line: CartLine) => interrupt(() => order.updateLine(line)),
    removeLine: (id: string) => interrupt(() => order.removeLine(id)),
    clear: () => interrupt(() => order.clear()),
    review: () => interrupt(() => order.review()),
    confirm: () => interrupt(() => order.confirm()),
    selectLine: (id: string) => {
      voice.controller.stopSpeaking();
      order.selectLine(id);
    },
  };
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Coco home">
          <span className="brand-mark">c</span>coco
        </Link>
        <span className="header-note">THE ART OF HOSPITALITY, REIMAGINED</span>
        <span className="sprint-badge">
          SPRINT 04 <span>CONVERSATIONAL ORDERING</span>
        </span>
      </header>
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            ROUND TABLE PIZZA · LOCAL ORDERING DEMO
          </span>
          <h1>
            Hospitality feels <em>human.</em>
          </h1>
          <p>Your menu, your choices. A thoughtful welcome from Coco.</p>
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
            <strong>We couldn’t reach the ordering backend.</strong>
            <p>
              Start FastAPI on port 8000 and check the API URL.{" "}
              {data
                ? "Previously loaded menu data is shown; draft changes need a connection."
                : "The verified catalog will appear once connected."}
            </p>
          </div>
          <button
            className="retry"
            onClick={() => {
              setConnection("connecting");
              setAttempt((value) => value + 1);
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
              <span className="small-dot gold" />
              COCO · YOUR HOST
            </span>
            <span className="muted">{order.model?.mode === "local" ? "LOCAL AI · VALIDATED ORDERING" : "VERIFIED ORDERING FALLBACK"}</span>
          </div>
          <AvatarExperience
            activityState={state}
            activityDescription={activityDescription}
            conversationActive={order.active}
          />
          <div className="host-controls">
            <strong>Let’s build your draft order.</strong>
            <p>
              Voice depends on your browser. Manual text input works without
              microphone access.
            </p>
            <div className="model-connection-status" role="status" data-testid="model-status" data-mode={order.model?.mode ?? "fallback"}>
              <strong>{order.model?.mode === "local" ? "Local AI connected" : order.model?.available ? "Verified fallback for this reply" : order.model?.mode === "disabled" ? "Local model disabled" : "Local model unavailable"}</strong>
              <p>{order.model?.message ?? "Checking the local language model. Verified ordering remains available."}</p>
            </div>
            {!!order.context.memory?.preferences.length && (
              <p className="field-note">Preferences this session: {order.context.memory.preferences.map((value) => value.replaceAll("_", " ")).join(", ")}. These guide suggestions; dietary safety still needs restaurant confirmation.</p>
            )}
            <div className="conversation-session-status" role="status" data-testid="conversation-phase" data-phase={phase}>
              <strong>{phase}</strong>
              <p>{voice.sessionActive ? voice.reason : order.active ? "Text conversation active. Choose Start Conversation to enable voice." : "Conversation ended. Microphone off; type or start a voice session."}</p>
            </div>
            <div className="buttons">
              <button
                className="mic"
                aria-label={
                  voice.listening || voice.starting ? "Stop listening" : "Start listening"
                }
                disabled={
                  !order.active ||
                  order.busy ||
                  !voice.recognitionSupported ||
                  connection !== "connected"
                }
                onClick={() =>
                  voice.listening || voice.starting
                    ? voice.controller.stopListening()
                    : voice.controller.listen(language)
                }
              >
                {voice.listening || voice.starting ? "■ Stop mic" : "● Resume microphone"}
              </button>
              <button
                className="primary"
                disabled={
                  voice.sessionActive || order.busy || connection !== "connected"
                }
                onClick={() => {
                  if (!order.active) order.start(language);
                  voice.controller.startSession(language);
                }}
              >
                Start Conversation ↗
              </button>
              <button
                className="secondary"
                disabled={!order.active && !voice.sessionActive}
                onClick={() => {
                  submission.current++;
                  voice.controller.stopAll();
                  order.end();
                }}
              >
                End Conversation
              </button>
            </div>
            <label className="speech-privacy">
              <input type="checkbox" aria-label="Mute microphone" checked={!voice.microphoneEnabled} disabled={!voice.sessionActive || !voice.recognitionSupported} onChange={(event) => event.target.checked ? voice.controller.mute() : voice.controller.listen(language)} />
              Mute microphone
            </label>
            <p className="speech-privacy">
              Start Conversation enables a voice session and requests microphone
              access. Listening resumes after normal browser pauses and Coco’s
              replies, until you stop, mute or end it. Browser speech services may
              process audio or text remotely. Coco stores no recordings; browser
              recognition is neither uninterrupted nor guaranteed offline.
            </p>
            {!voice.recognitionSupported && (
              <p className="field-note">
                Speech recognition is unsupported here. Please use the text box.
              </p>
            )}
            {!voice.synthesisSupported && (
              <p className="field-note">
                Speech playback is unsupported here. Responses remain readable
                below.
              </p>
            )}
            {voice.starting && (
              <p role="status">Requesting microphone access…</p>
            )}
            {voice.interim && (
              <p role="status" className="live-transcript">
                Hearing: {voice.interim}
              </p>
            )}
            {voice.error && (
              <p className="voice-error" role="alert">
                {voice.error}
              </p>
            )}
            <div className="speech-settings">
              <label>
                Speech locale
                <select
                  value={language}
                  onChange={(event) => {
                    const next = event.target.value as LanguageCode;
                    voice.controller.setLanguage(next);
                    setLanguage(next);
                  }}
                >
                  {LANGUAGES.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Browser voice
                <select
                  value={voiceURI}
                  onChange={(event) => setVoiceURI(event.target.value)}
                  disabled={!voice.synthesisSupported}
                >
                  <option value="">Female voice · prefer local when available</option>
                  {voice.voices.map((entry) => (
                    <option key={entry.voiceURI} value={entry.voiceURI}>
                      {entry.name} · {entry.lang}
                      {entry.localService ? " · local" : " · provider voice"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="field-note">
              Coco prefers a known female voice when available. Installed voices
              vary by browser; choose one above to override the default.
            </p>
            <p className="field-note">
              Ordering and replies are English-only. Punjabi and Hindi provide
              experimental speech locales and a short greeting when a matching
              voice is installed.
            </p>
            <div className="speech-output-controls">
              <label>
                <input
                  type="checkbox"
                  checked={speechEnabled}
                  onChange={(event) => {
                    setSpeechEnabled(event.target.checked);
                    if (!event.target.checked) voice.controller.stopSpeaking();
                  }}
                />
                Spoken responses
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => voice.controller.stopSpeaking()}
                disabled={!voice.synthesisSupported}
              >
                Stop speaking
              </button>
              <button
                type="button"
                className="secondary"
                onClick={interruptReply}
                disabled={!order.busy && !voice.speaking && !voice.processing}
              >
                Interrupt Coco
              </button>
            </div>
          </div>
        </section>
        <section className="transcript panel">
          <div className="panel-top">
            <span>CONVERSATION</span>
            <span className="muted">
              {order.active ? "ACTIVE DEMO SESSION" : "READY WHEN YOU ARE"}
            </span>
          </div>
          {order.transcript.length ? (
            <div
              ref={log}
              className="conversation-log"
              role="log"
              aria-label="Conversation transcript"
              aria-live="polite"
            >
              {order.transcript.map((entry) => (
                <article
                  className={`transcript-entry ${entry.role}`}
                  lang={entry.language ?? "en-US"}
                  key={entry.id}
                >
                  <span>{entry.role === "customer" ? "YOU" : "COCO"}</span>
                  <p>{entry.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="transcript-empty">
              <div className="chat-icon">“</div>
              <h2>
                A familiar voice.
                <br />A little help choosing.
              </h2>
              <p>
                Type a message to begin, or start a conversation to use the microphone. Coco
                uses a local language model when available, with verified cart
                actions and a clearly labeled ordering fallback.
              </p>
            </div>
          )}
          {voice.uncertainTranscript && (
            <p className="field-note">
              Heard: &ldquo;{voice.uncertainTranscript}&rdquo;.{" "}
              <button type="button" className="secondary" onClick={() => {
                const heard = voice.controller.takeUncertainTranscript();
                if (heard) setText(heard);
              }}>Edit heard text</button>
            </p>
          )}
          <form
            className="conversation-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="coco-message">Your message</label>
            <textarea
              id="coco-message"
              aria-label="Message to Coco"
              value={text}
              maxLength={500}
              aria-describedby="message-help"
              onChange={(event) => setText(event.target.value)}
              placeholder="Try: I want a large create your own pizza"
              rows={3}
            />
            <button
              className="add-cart-button"
              type="submit"
              disabled={
                !text.trim() ||
                connection !== "connected"
              }
            >
              {order.busy && !text.trim() ? "Processing…" : "Send message"}
            </button>
            <p id="message-help" className="field-note" role="status">
              {connection !== "connected"
                ? "You can type now. Sending becomes available when the backend connects."
                : order.busy
                  ? "Coco is processing your message. Send a correction or choose Interrupt Coco to stop the current reply."
                  : "Send a message to begin. No microphone or Start Conversation button required."}
            </p>
          </form>
          <div className="transcript-footer">
            <span className="small-dot" />
            {data?.assistant.phase ?? "Sprint 4 · Conversational ordering"}
            <p>No real orders. No payment. No audio recordings.</p>
          </div>
        </section>
      </div>
      {order.error && (
        <div role="alert" className="error-banner ordering-error">
          {order.error}
        </div>
      )}
      {data ? (
        <div className="ordering-workspace">
          <div>
            <MenuBrowser
              menu={data.menu}
              busy={order.busy || connection !== "connected"}
              onAdd={cartOrder.addLine}
            />
            <section className="restaurant panel restaurant-configuration">
              <span className="eyebrow">RESTAURANT CONFIGURATION</span>
              <h2>{data.restaurant.name}</h2>
              <p>
                {data.restaurant.address ??
                  "Location not selected · prices and availability need verification"}
              </p>
              <details>
                <summary>Missing information before real ordering</summary>
                <ul>
                  {data.restaurant.missing_data.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </details>
            </section>
          </div>
          <OrderCart order={cartOrder} menu={data.menu} />
        </div>
      ) : (
        <div className="data-placeholder" role="status">
          {connection === "connecting"
            ? "Loading the verified menu…"
            : "Menu unavailable. Reconnect to browse verified items."}
        </div>
      )}
      <footer className="footer">
        <span>
          coco <span className="muted">/ Designed around people.</span>
        </span>
        <span>INDEPENDENT LOCAL DEMO · NO RESTAURANT ORDER CONNECTION</span>
      </footer>
    </main>
  );
}
