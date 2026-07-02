import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArtifactCard } from "./ArtifactPanel.jsx";

/**
 * Schaalt een afbeelding terug naar een redelijke maximale breedte/hoogte en
 * comprimeert 'm als JPEG, zodat de base64-data klein genoeg blijft voor een
 * Firestore-document (limiet 1MB). Zonder dit kon het versturen van een foto
 * vanaf een telefoon (vaak 3-10MB) het hele bericht laten falen zonder
 * duidelijke foutmelding (bug: "afb toevoegen kan, maar er gebeurt niks").
 */
function resizeImageFile(file, maxDimension = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Kon afbeelding niet laden"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ChatWindow({
  messages,
  onSend,
  streaming,
  reconnecting,
  chatTitle,
  onOpenArtifact,
  activeArtifactId,
  onStop,
  canResume,
  onResume,
  onOpenMobileSidebar
}) {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState([]); // [{ id, dataUrl, name }]
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || streaming) return;
    onSend(text, pendingImages.map((img) => img.dataUrl));
    setInput("");
    setPendingImages([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleFilesSelected(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      resizeImageFile(file, 1280, 0.75).then((dataUrl) => {
        setPendingImages((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dataUrl, name: file.name }
        ]);
      });
    }
  }

  function handlePaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((it) => it.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    handleFilesSelected(imageItems.map((it) => it.getAsFile()).filter(Boolean));
  }

  function removePendingImage(id) {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
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
      <div className="h-11 flex items-center justify-center border-b border-macborder shrink-0 relative px-3">
        <button
          onClick={onOpenMobileSidebar}
          className="sm:hidden absolute left-3 w-7 h-7 flex items-center justify-center text-macsub hover:text-macink transition-colors"
          title="Menu"
        >
          <MenuIcon />
        </button>
        <span className="text-[13px] font-medium text-macsub transition-opacity duration-200 truncate max-w-[60%]">
          {chatTitle || "TygoAI"}
        </span>
        {reconnecting && (
          <span className="absolute right-4 flex items-center gap-1.5 text-[11.5px] text-macsub fade-in-up">
            <span className="w-1.5 h-1.5 rounded-full bg-macyellow pulse-dot" />
            <span className="hidden sm:inline">
              NVIDIA overbelast — poging {reconnecting.attempt}/{reconnecting.max}
              {reconnecting.delayMs ? `, wacht ${reconnecting.delayMs / 1000}s…` : "…"}
            </span>
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto mac-scroll px-3 sm:px-6 py-4 sm:py-6">
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
            {canResume && (
              <div className="flex justify-start fade-in-up">
                <button
                  onClick={onResume}
                  className="flex items-center gap-2 h-9 px-4 rounded-[12px] border border-macborder bg-white/80 hover:bg-white text-[13px] font-medium text-macink shadow-macsoft active:scale-[0.97] transition-all"
                >
                  <ResumeIcon />
                  Doorgaan met dit bericht
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 sm:px-6 pb-4 sm:pb-5 pt-2 shrink-0">
        <div className="max-w-[720px] mx-auto">
          {pendingImages.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap fade-in-up">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-14 h-14 object-cover rounded-[9px] border border-macborder"
                  />
                  <button
                    onClick={() => removePendingImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-macink text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Verwijderen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 bg-white/80 border border-macborder rounded-[16px] shadow-macsoft px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-macblue/30 transition-all duration-200">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Afbeelding toevoegen"
              className="w-7 h-7 rounded-full flex items-center justify-center text-macsub hover:bg-black/[0.06] hover:text-macink transition-all shrink-0"
            >
              <ImageIcon />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Stuur een bericht naar TygoAI…"
              className="flex-1 resize-none bg-transparent text-[14.5px] leading-relaxed outline-none placeholder:text-macsub/70 max-h-40 py-1"
            />
            {streaming ? (
              <button
                onClick={onStop}
                title="Stoppen"
                className="w-8 h-8 rounded-full bg-macink text-white flex items-center justify-center shrink-0 hover:opacity-85 active:scale-90 transition-all"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && pendingImages.length === 0}
                className="w-8 h-8 rounded-full bg-macblue text-white flex items-center justify-center shrink-0 hover:bg-macblue2 active:scale-90 transition-all disabled:opacity-30 disabled:active:scale-100"
                title="Versturen"
              >
                <SendIcon />
              </button>
            )}
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
    <div className="h-full flex flex-col items-center justify-center text-center select-none fade-in-up">
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
      <div className="flex justify-end msg-in">
        <div className="max-w-[90%] sm:max-w-[80%] flex flex-col items-end gap-1.5">
          {message.images && message.images.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {message.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="Bijlage"
                  className="w-32 h-32 object-cover rounded-[12px] border border-macborder shadow-macsoft"
                />
              ))}
            </div>
          )}
          {message.content && (
            <div className="bg-macblue text-white rounded-[16px] rounded-br-[6px] px-4 py-2.5 text-[14.5px] leading-relaxed shadow-macsoft whitespace-pre-wrap">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  const segments = splitContentAndArtifacts(message.content || "", message.artifacts || []);

  return (
    <div className="flex flex-col gap-1.5 items-start msg-in">
      {message.reasoning && <ThinkingBlock text={message.reasoning} streaming={message.reasoningStreaming} />}
      <div className="max-w-[94%] sm:max-w-[88%] w-full flex flex-col gap-1.5">
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
        {message.stoppedHere && (
          <span className="text-[11px] text-macsub px-1 italic">Gestopt door gebruiker</span>
        )}
        {message.saveError && (
          <span className="text-[11px] text-macred px-1">{message.saveError}</span>
        )}
        {!message.streaming && !message.stoppedHere && message.content?.trim() && (
          <ExportMenu content={message.content} />
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
    <div className="max-w-[94%] sm:max-w-[88%] w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12px] text-macsub hover:text-macink transition-colors px-1 py-1"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
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
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: open ? "16rem" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="bg-black/[0.035] border border-macborder rounded-[12px] px-3.5 py-2.5 text-[12.5px] text-macsub leading-relaxed whitespace-pre-wrap mb-1 max-h-64 overflow-y-auto mac-scroll">
          {text}
        </div>
      </div>
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

function ExportMenu({ content }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  async function handleExport(type) {
    setBusy(true);
    setOpen(false);
    try {
      const title = content.split("\n")[0].slice(0, 50) || "TygoAI";
      const exportLib = await import("../lib/exportDoc.js");
      if (type === "docx") await exportLib.exportToDocx(title, content);
      else if (type === "pptx") await exportLib.exportToPptx(title, content);
      else if (type === "xlsx") exportLib.exportToXlsx(title, content);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative px-1">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-1 text-[11px] text-macsub hover:text-macink transition-colors py-0.5"
        title="Exporteren als bestand"
      >
        <ExportIcon />
        {busy ? "Bezig…" : "Exporteren"}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-macborder rounded-[10px] shadow-mac py-1 min-w-[160px] fade-in-up">
          <ExportOption label="Word (.docx)" onClick={() => handleExport("docx")} />
          <ExportOption label="PowerPoint (.pptx)" onClick={() => handleExport("pptx")} />
          <ExportOption label="Excel (.xlsx)" onClick={() => handleExport("xlsx")} />
        </div>
      )}
    </div>
  );
}

function ExportOption({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[12.5px] text-macink hover:bg-black/[0.05] transition-colors"
    >
      {label}
    </button>
  );
}

function ExportIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l14-7-5 14-2.5-6L5 12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
