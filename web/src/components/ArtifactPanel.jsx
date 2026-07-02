import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { isHtmlArtifact, isDocumentArtifact } from "../lib/artifacts.js";

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;

/**
 * Klein kaartje dat in de chatbubble verschijnt op de plek van een codeblok.
 * Klikken opent het volledige ArtifactPanel ernaast. Tijdens streaming
 * toont het kaartje een live-indicator (feature 2).
 *
 * Voor document-artifacts (```docx/```pptx/```xlsx, feature 5/bug 5):
 * klikken downloadt direct het echte Word/PowerPoint/Excel-bestand, in
 * plaats van een code-paneel te openen — net zoals bij een .py-bestand,
 * maar dan met een passende download-actie.
 */
export function ArtifactCard({ artifact, onOpen, isActive }) {
  const [downloading, setDownloading] = useState(false);
  const lineCount = artifact.code.split("\n").length;
  const isDoc = isDocumentArtifact(artifact);

  async function handleClick() {
    if (artifact.streaming) return;
    if (!isDoc) {
      onOpen(artifact.id);
      return;
    }
    setDownloading(true);
    try {
      const exportLib = await import("../lib/exportDoc.js");
      const title = artifact.title || "TygoAI-document";
      if (artifact.ext === "docx") await exportLib.exportToDocx(title, artifact.code);
      else if (artifact.ext === "pptx") await exportLib.exportToPptx(title, artifact.code);
      else if (artifact.ext === "xlsx") exportLib.exportToXlsx(title, artifact.code);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full max-w-[420px] flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 my-1 text-left transition-all duration-200 group artifact-card-in ${
        isActive
          ? "border-macblue/40 bg-macblue/[0.06]"
          : "border-macborder bg-white/70 hover:bg-white/95"
      }`}
    >
      <div className="w-9 h-9 rounded-[9px] bg-macink/[0.06] flex items-center justify-center shrink-0 text-macink relative">
        <FileIcon ext={artifact.ext} />
        {artifact.streaming && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-macgreen pulse-dot border border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-macink truncate">{artifact.title}</div>
        <div className="text-[11.5px] text-macsub flex items-center gap-1.5">
          {artifact.streaming ? (
            <span className="text-macgreen">Wordt geschreven…</span>
          ) : isDoc ? (
            downloading ? "Bestand maken…" : `${artifact.label} · klik om te downloaden`
          ) : (
            <>
              {artifact.label} · {lineCount} {lineCount === 1 ? "regel" : "regels"}
            </>
          )}
        </div>
      </div>
      <div className="text-macsub group-hover:text-macblue transition-colors shrink-0">
        {isDoc ? <DownloadGlyphIcon /> : <ChevronIcon />}
      </div>
    </button>
  );
}

/**
 * Het volledige paneel (split-view naast de chat), met titlebar in macOS-stijl,
 * Preview/Code tabs voor HTML, en alleen Code voor andere talen.
 *
 * Versleepbaar (feature 13): een handle aan de linkerrand laat de breedte
 * aanpassen, net als een editor-paneel. De gekozen breedte wordt onthouden
 * via de `onResize` callback (App.jsx slaat 'm op in localStorage).
 */
export default function ArtifactPanel({ artifact, onClose, width = 440, onResize, isMobile = false }) {
  const isHtml = isHtmlArtifact(artifact);
  const isDoc = isDocumentArtifact(artifact);
  // Documenten (docx/pptx/xlsx) krijgen een "Preview"-tab met een rijke
  // HTML-rendering van de markdown-inhoud, zodat de gebruiker ziet hoe het
  // document er globaal uitziet — niet als ruwe code.
  const defaultTab = isHtml || isDoc ? "preview" : "code";
  const [tab, setTab] = useState(defaultTab);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef(null);
  const codeScrollRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setTab(isHtml || isDoc ? "preview" : "code");
  }, [artifact.id, isHtml, isDoc]);

  // Tijdens live streaming: automatisch meescrollen in de code-tab zodat de
  // nieuwste regels zichtbaar blijven (feature 2 + 3).
  useEffect(() => {
    if (artifact.streaming && tab === "code" && codeScrollRef.current) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [artifact.code, artifact.streaming, tab]);

  const srcDoc = useMemo(() => {
    if (!isHtml) return "";
    const code = artifact.code;
    if (/<html[\s>]/i.test(code)) return code;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;margin:16px;color:#1d1d1f;}
    </style></head><body>${code}</body></html>`;
  }, [artifact.code, isHtml]);

  // Rijke HTML-preview voor Word/PowerPoint/Excel-documenten: zet de
  // markdown-achtige inhoud om naar opgemaakte HTML zodat de gebruiker een
  // duidelijk beeld krijgt van de documentstructuur.
  const docPreviewHtml = useMemo(() => {
    if (!isDoc) return "";
    const lines = artifact.code.split("\n");
    const html = lines.map((line) => {
      const t = line.trim();
      if (!t) return "<br>";
      if (t.startsWith("### ")) return `<h3>${esc(t.slice(4))}</h3>`;
      if (t.startsWith("## ")) return `<h2>${esc(t.slice(3))}</h2>`;
      if (t.startsWith("# ")) return `<h1>${esc(t.slice(2))}</h1>`;
      if (t.startsWith("- ") || t.startsWith("* ")) return `<li>${esc(t.slice(2))}</li>`;
      if (/^\|.*\|$/.test(t)) {
        const cells = t.split("|").slice(1, -1).map((c) => c.trim());
        if (cells.every((c) => /^:?-+:?$/.test(c))) return ""; // scheiding
        return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
      }
      if (t === "---") return `<hr>`;
      return `<p>${esc(t)}</p>`;
    }).join("\n");

    const ext = artifact.ext;
    const label = ext === "docx" ? "Word" : ext === "pptx" ? "PowerPoint" : "Excel";
    const colors = { docx: "#2B579A", pptx: "#D24726", xlsx: "#217346" };
    const color = colors[ext] || "#1d1d1f";

    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,sans-serif;
        margin:0;padding:20px 24px;color:#1d1d1f;background:#f9f9f9;font-size:14px;line-height:1.6;}
      .badge{display:inline-block;background:${color};color:#fff;border-radius:4px;
        padding:2px 8px;font-size:11px;font-weight:600;letter-spacing:.5px;margin-bottom:12px;}
      h1{font-size:22px;font-weight:700;margin:16px 0 6px;color:#1d1d1f;}
      h2{font-size:17px;font-weight:600;margin:14px 0 4px;color:#1d1d1f;
        border-bottom:1px solid #e0e0e0;padding-bottom:4px;}
      h3{font-size:14px;font-weight:600;margin:12px 0 2px;color:#3a3a3c;}
      p{margin:4px 0;}li{margin:2px 0 2px 18px;}
      table{border-collapse:collapse;width:100%;margin:8px 0;}
      td{border:1px solid #d0d0d0;padding:5px 10px;font-size:13px;}
      tr:nth-child(even) td{background:#f0f0f0;}
      hr{border:none;border-top:1px solid #e0e0e0;margin:12px 0;}
    </style></head><body>
    <span class="badge">${label}</span>
    ${html}
    </body></html>`;
  }, [artifact.code, isDoc, artifact.ext]);

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function handleCopy() {
    navigator.clipboard.writeText(artifact.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleDownload() {
    if (isDoc) {
      const exportLib = await import("../lib/exportDoc.js");
      const title = artifact.title || "TygoAI-document";
      if (artifact.ext === "docx") await exportLib.exportToDocx(title, artifact.code);
      else if (artifact.ext === "pptx") await exportLib.exportToPptx(title, artifact.code);
      else if (artifact.ext === "xlsx") exportLib.exportToXlsx(title, artifact.code);
      return;
    }
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

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function handleMove(ev) {
        if (!draggingRef.current) return;
        // Het paneel zit rechts, dus naar links slepen (negatieve dx) maakt
        // het breder.
        const dx = startX - ev.clientX;
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx));
        onResize?.(next);
      }
      function handleUp() {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      }
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [width, onResize]
  );

  return (
    <div
      className={
        isMobile
          ? "fixed inset-0 z-50 bg-macpanel2 flex flex-col mac-window-in"
          : "h-full border-l border-macborder bg-macpanel2 flex flex-col mac-window-in shrink-0 relative"
      }
      style={isMobile ? undefined : { width }}
    >
      {/* Sleep-handle: alleen op desktop zinvol, niets om tegenaan te slepen op mobiel fullscreen. */}
      {!isMobile && (
        <div
          onPointerDown={handlePointerDown}
          title="Sleep om breedte aan te passen"
          className="absolute left-0 top-0 h-full w-[6px] -translate-x-1/2 cursor-col-resize group z-10 flex items-center justify-center"
        >
          <div className="w-[3px] h-16 rounded-full bg-macborder group-hover:bg-macblue/50 transition-colors" />
        </div>
      )}

      {/* Titlebar */}
      <div className="h-11 flex items-center px-3 gap-2 border-b border-macborder shrink-0">
        {isMobile ? (
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-[13px] text-macblue"
          >
            <BackIcon /> Terug
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-macred hover:opacity-70 transition-opacity"
              title="Sluiten"
            />
            <span className="w-3 h-3 rounded-full bg-macyellow" />
            <span className="w-3 h-3 rounded-full bg-macgreen" />
          </div>
        )}
        <div className="flex-1 text-center text-[12.5px] font-medium text-macsub truncate px-2 flex items-center justify-center gap-1.5">
          {artifact.title}
          {artifact.streaming && <span className="w-1.5 h-1.5 rounded-full bg-macgreen pulse-dot shrink-0" />}
        </div>
        <div className="w-[42px]" />
      </div>

      {/* Tabs + acties */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-macborder shrink-0">
        {isHtml || isDoc ? (
          <div className="flex items-center bg-black/[0.05] rounded-[8px] p-0.5">
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </TabButton>
            <TabButton active={tab === "code"} onClick={() => setTab("code")}>
              {isDoc ? "Inhoud" : "Code"}
            </TabButton>
          </div>
        ) : (
          <span className="text-[11.5px] text-macsub px-1">{artifact.label}</span>
        )}

        <div className="flex items-center gap-1">
          {isHtml && tab === "preview" && !artifact.streaming && (
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
        {tab === "preview" && isHtml && !artifact.streaming ? (
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            title={artifact.title}
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            className="w-full h-full bg-white border-0"
          />
        ) : tab === "preview" && isDoc && !artifact.streaming ? (
          <iframe
            srcDoc={docPreviewHtml}
            title={artifact.title}
            sandbox=""
            className="w-full h-full border-0"
          />
        ) : tab === "preview" && artifact.streaming ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-macsub text-[12.5px]">
            <span className="w-2 h-2 rounded-full bg-macgreen pulse-dot" />
            Preview verschijnt zodra het document klaar is
          </div>
        ) : (
          <pre
            ref={codeScrollRef}
            className="w-full h-full overflow-auto mac-scroll p-4 text-[12.5px] leading-relaxed font-mono bg-[#1d1d1f] text-[#f5f5f7] m-0"
          >
            <code>{artifact.code}</code>
            {artifact.streaming && <span className="typing-caret" />}
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
      className={`px-3 h-7 rounded-[7px] text-[12.5px] font-medium transition-all duration-150 ${
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
      className="w-7 h-7 rounded-[7px] flex items-center justify-center text-macsub hover:bg-black/[0.06] hover:text-macink transition-all duration-150"
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
    yaml: "#8E8E93",
    docx: "#2B579A",
    pptx: "#D24726",
    xlsx: "#217346"
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

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadGlyphIcon() {
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
