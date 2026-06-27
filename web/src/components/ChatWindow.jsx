import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArtifactCard } from "./ArtifactPanel.jsx";

export default function ChatWindow({ messages, onSend, streaming, chatTitle, onOpenArtifact, activeArtifactId }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    onSend(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-macpanel2">
      {/* Window titlebar */}
      <div className="h-11 flex items-center justify-center border-b border-macborder shrink-0 relative">
        <span className="text-[13px] font-medium text-macsub">{chatTitle || "TygoAI"}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto mac-scroll px-6 py-6">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-[720px] mx-auto flex flex-col gap-5">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onOpenArtifact={onOpenArtifact}
                activeArtifactId={activeArtifactId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-6 pb-5 pt-2 shrink-0">
        <div className="max-w-[720px] mx-auto">
          <div className="flex items-end gap-2 bg-white/80 border border-macborder rounded-[16px] shadow-macsoft px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-macblue/30 transition">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Stuur een bericht naar TygoAI…"
              className="flex-1 resize-none bg-transparent text-[14.5px] leading-relaxed outline-none placeholder:text-macsub/70 max-h-40 py-1"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="w-8 h-8 rounded-full bg-macblue text-white flex items-center justify-center shrink-0 hover:bg-macblue2 active:scale-90 transition disabled:opacity-30 disabled:active:scale-100"
              title="Versturen"
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-[11px] text-macsub text-center mt-2">
            TygoAI · Nemotron-3-nano-omni-30b · kan fouten maken
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-macblue to-macblue2 shadow-macsoft flex items-center justify-center text-white text-3xl font-semibold mb-4">
        T
      </div>
      <h2 className="text-[18px] font-semibold text-macink mb-1">Hoi Tygo</h2>
      <p className="text-[13.5px] text-macsub max-w-[280px]">
        Waarmee kan ik je vandaag helpen? Stel een vraag om te beginnen.
      </p>
    </div>
  );
}

function MessageBubble({ message, onOpenArtifact, activeArtifactId }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-macblue text-white rounded-[16px] rounded-br-[6px] px-4 py-2.5 text-[14.5px] leading-relaxed shadow-macsoft whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const segments = splitContentAndArtifacts(message.content || "", message.artifacts || []);

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {message.reasoning && <ThinkingBlock text={message.reasoning} streaming={message.reasoningStreaming} />}
      <div className="max-w-[88%] w-full flex flex-col gap-1.5">
        {segments.map((seg, i) =>
          seg.type === "artifact" ? (
            <ArtifactCard
              key={seg.artifact.id}
              artifact={seg.artifact}
              onOpen={onOpenArtifact}
              isActive={activeArtifactId === seg.artifact.id}
            />
          ) : seg.text.trim() ? (
            <div
              key={i}
              className="bg-white/90 border border-macborder rounded-[16px] rounded-bl-[6px] px-4 py-2.5 text-[14.5px] leading-relaxed shadow-macsoft text-macink"
            >
              <div className="prose-mac">
                <ReactMarkdown>{seg.text}</ReactMarkdown>
              </div>
            </div>
          ) : null
        )}
        {message.streaming && !message.content && (
          <div className="bg-white/90 border border-macborder rounded-[16px] rounded-bl-[6px] px-4 py-2.5 shadow-macsoft">
            <TypingDots />
          </div>
        )}
        {message.streaming && message.content && (
          <span className="text-macink px-1">
            <span className="typing-caret" />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Splitst de [[ARTIFACT:id]] placeholders in de tekst naar een array van
 * { type: "text", text } en { type: "artifact", artifact } stukken, in de
 * juiste volgorde, zodat artifact-kaartjes precies op hun plek in het gesprek
 * worden weergegeven in plaats van als ruwe code.
 */
function splitContentAndArtifacts(content, artifacts) {
  const byId = Object.fromEntries(artifacts.map((a) => [a.id, a]));
  const parts = content.split(/\[\[ARTIFACT:([\w-]+)\]\]/g);
  const segments = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) segments.push({ type: "text", text: parts[i] });
    } else {
      const artifact = byId[parts[i]];
      if (artifact) segments.push({ type: "artifact", artifact });
    }
  }
  return segments;
}

function ThinkingBlock({ text, streaming }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="max-w-[88%] w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12px] text-macsub hover:text-macink transition px-1 py-1"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M8 5l8 7-8 7V5z" />
        </svg>
        {streaming ? (
          <span className="flex items-center gap-1">
            Aan het denken
            <span className="pulse-dot">·</span>
          </span>
        ) : (
          "Denkproces tonen"
        )}
      </button>
      {open && (
        <div className="bg-black/[0.035] border border-macborder rounded-[12px] px-3.5 py-2.5 text-[12.5px] text-macsub leading-relaxed whitespace-pre-wrap mb-1 max-h-64 overflow-y-auto mac-scroll">
          {text}
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 h-4 px-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-macsub pulse-dot" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-macsub pulse-dot" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-macsub pulse-dot" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l14-7-5 14-2.5-6L5 12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="currentColor"
      />
    </svg>
  );
}
