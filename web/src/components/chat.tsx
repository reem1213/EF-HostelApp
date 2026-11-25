"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["What should I fix first?", "Why is my cost per bed high?", "How do I get more direct bookings?"];

/** Chat with Claude about this hostel's own numbers. The server rebuilds the data summary on every request. */
export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    // Braces matter: an effect must not return the scroll call's result.
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const ctrl = new AbortController();
    abort.current = ctrl;
    const setLast = (fn: (prev: string) => string) =>
      setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, content: fn(x.content) } : x)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setLast(() => err?.error ?? "Something went wrong. Please try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setLast((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setLast(() => "Connection lost. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Ask HostelPulse" className="rounded-[18px] bg-dark p-4 text-dark-text">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-gold" aria-hidden />
        <h2 className="text-[15px] font-semibold">Ask HostelPulse</h2>
      </div>
      <p className="mt-1 text-[12.5px] opacity-80">Ask anything about your costs, bookings or what to fix. Answers use your own numbers.</p>

      {messages.length > 0 && (
        <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed",
                m.role === "user" ? "self-end bg-teal text-white" : "self-start bg-white/10",
              )}
            >
              {m.content || (busy && i === messages.length - 1 ? <span className="opacity-60">Thinking…</span> : null)}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      )}

      {messages.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12.5px] hover:bg-white/10"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex items-center gap-2 rounded-2xl bg-white/10 p-1.5 pl-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          autoComplete="off"
          placeholder="e.g. Where am I losing money?"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold text-dark disabled:opacity-40"
        >
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </form>
    </section>
  );
}
