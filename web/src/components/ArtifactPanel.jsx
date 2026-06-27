import { useEffect, useMemo, useRef, useState } from "react";
import { isHtmlArtifact } from "../lib/artifacts.js";

/**
 * Klein kaartje dat in de chatbubble verschijnt op de plek van een codeblok.
 * Klikken opent het volledige ArtifactPanel ernaast.
 */
export function ArtifactCard({ artifact, onOpen, isActive }) {
  const lineCount = artifact.code.split("\n").length;
  return (
    <button
      onClick={() => onOpen(artifact.id)}
      className={`w-full max-w-[420px] flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 my-1 text-left transition group ${
        isActive
          ? "border-macblue/40 bg-macblue/[0.06]"
          : "border-macborder bg-white/70 hover:bg-white/95"
      }`}
    >
      <div className="w-9 h-9 rounded-[9px] bg-macink/[0.06] flex items-center justify-center shrink-0 text-macink">
        <FileIcon ext={artifact.ext} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-macink truncate">{artifact.title}</div>
        <div className="text-[11.5px] text-macsub">
          {artifact.label} · {lineCount} {lineCount === 1 ? "regel" : "regels"}
        </div>
      </div>
      <div className="text-macsub group-hover:text-macblue transition shrink-0">
        <ChevronIcon />
      </div>
    </button>
  );
}

/**
 * Het volledige paneel (split-view naast de chat), met titlebar in macOS-stijl,
 * Preview/Code tabs voor HTML, en alleen Code voor andere talen.
 */
export default function ArtifactPanel({ artifact, onClose }) {
  const isHtml = isHtmlArtifact(artifact);
  const [tab, setTab] = useState(isHtml ? "preview" : "code");
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    setTab(isHtml ? "preview" : "code");
  }, [artifact.id, isHtml]);

  const srcDoc = useMemo(() => {
    if (!isHtml) return "";
    const code = artifact.code;
    // Als het al een volledig document is (heeft <html>), gebruik het direct.
    if (/<html[\s>]/i.test(code)) return code;
    // Anders wikkelen we het in een minimale pagina zodat losse HTML-snippets
    // ook netjes renderen (met een basis font zodat het er verzorgd uitziet).
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;margin:16px;color:#1d1d1f;}
    </style></head><body>${code}</body></html>`;
  }, [artifact.code, isHtml]);

  function handleCopy() {
    navigator.clipboard.writeText(artifact.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownload() {
    const blob = new Blob([artifact.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(artifact.title)}.${artifact.ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRefresh() {
    if (iframeRef.current) {
      const current = iframeRef.current.srcdoc;
      iframeRef.current.srcdoc = "";
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.srcdoc = current;
      });
    }
  }

  return (
    <div className="w-[440px] h-full border-l border-macborder bg-macpanel2 flex flex-col mac-window-in shrink-0">
      {/* Titlebar */}
      <div className="h-11 flex items-center px-3 gap-2 border-b border-macborder shrink-0">
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-macred hover:opacity-70 transition"
            title="Sluiten"
          />
          <span className="w-3 h-3 rounded-full bg-macyellow" />
          <span className="w-3 h-3 rounded-full bg-macgreen" />
        </div>
        <div className="flex-1 text-center text-[12.5px] font-medium text-macsub truncate px-2">
          {artifact.title}
        </div>
        <div className="w-[42px]" /> {/* balans voor de traffic lights links */}
      </div>

      {/* Tabs + acties */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-macborder shrink-0">
        {isHtml ? (
          <div className="flex items-center bg-black/[0.05] rounded-[8px] p-0.5">
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </TabButton>
            <TabButton active={tab === "code"} onClick={() => setTab("code")}>
              Code
            </TabButton>
          </div>
        ) : (
          <span className="text-[11.5px] text-macsub px-1">{artifact.label}</span>
        )}

        <div className="flex items-center gap-1">
          {isHtml && tab === "preview" && (
            <IconButton title="Vernieuwen" onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          )}
          <IconButton title="Kopiëren" onClick={handleCopy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
          <IconButton title="Downloaden" onClick={handleDownload}>
            <DownloadIcon />
          </IconButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isHtml && tab === "preview" ? (
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            title={artifact.title}
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            className="w-full h-full bg-white border-0"
          />
        ) : (
          <pre className="w-full h-full overflow-auto mac-scroll p-4 text-[12.5px] leading-relaxed font-mono bg-[#1d1d1f] text-[#f5f5f7] m-0">
            <code>{artifact.code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 h-7 rounded-[7px] text-[12.5px] font-medium transition ${
        active ? "bg-white shadow-sm text-macink" : "text-macsub hover:text-macink"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-[7px] flex items-center justify-center text-macsub hover:bg-black/[0.06] hover:text-macink transition"
    >
      {children}
    </button>
  );
}

function sanitizeFilename(name) {
  return (name || "bestand").replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 60);
}

function FileIcon({ ext }) {
  const colors = {
    html: "#FF5F57",
    css: "#0A84FF",
    js: "#FEBC2E",
    jsx: "#3B9BFF",
    ts: "#0A84FF",
    tsx: "#3B9BFF",
    py: "#28C840",
    json: "#8E8E93",
    md: "#1D1D1F",
    sh: "#1D1D1F",
    sql: "#8E8E93",
    yaml: "#8E8E93"
  };
  const color = colors[ext] || "#8E8E93";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        fill={color}
        opacity="0.15"
      />
      <path
        d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M15 2v5h5" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 12a9 9 0 1 1-2.6-6.3M21 4v5h-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="#28C840" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
