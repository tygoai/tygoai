import { useEffect, useMemo, useState } from "react";
import { filterChatsByTitle, searchChatsByContent } from "../lib/search.js";

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenSettings,
  onLogout,
  userEmail,
  uid
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [contentMatches, setContentMatches] = useState(null); // null = nog niet gezocht op inhoud
  const [searchingContent, setSearchingContent] = useState(false);

  const titleMatches = useMemo(() => filterChatsByTitle(chats, searchTerm), [chats, searchTerm]);

  // Zoek pas op inhoud als de titel-match niets (of weinig) opleverde, en met
  // een korte debounce zodat we niet bij elke toetsaanslag Firestore-reads
  // doen (feature 12: realtime filteren voelt snel aan, content-zoeken mag
  // iets vertraagd komen).
  useEffect(() => {
    setContentMatches(null);
    const q = searchTerm.trim();
    if (!q || titleMatches.length > 0) return;

    setSearchingContent(true);
    const timer = setTimeout(async () => {
      const matches = await searchChatsByContent(uid, chats, q);
      setContentMatches(matches);
      setSearchingContent(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, titleMatches.length, chats, uid]);

  const visibleChats = searchTerm.trim()
    ? titleMatches.length > 0
      ? titleMatches
      : contentMatches ?? []
    : chats;

  const isSearching = searchTerm.trim().length > 0;

  return (
    <div className="w-[240px] h-full bg-macsidebar backdrop-blur-mac border-r border-macborder flex flex-col">
      {/* Traffic lights + titel */}
      <div className="h-11 flex items-center px-4 gap-2 shrink-0">
        <span className="w-3 h-3 rounded-full bg-macred" />
        <span className="w-3 h-3 rounded-full bg-macyellow" />
        <span className="w-3 h-3 rounded-full bg-macgreen" />
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={onNewChat}
          className="w-full h-9 rounded-[10px] bg-macblue text-white text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-macblue2 active:scale-[0.98] transition-all"
        >
          <PlusIcon />
          Nieuwe chat
        </button>
      </div>

      {/* Zoekbalk */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-macsub">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Zoek in chats…"
            className="w-full h-8 rounded-[8px] pl-8 pr-7 text-[12.5px] bg-black/[0.04] border border-transparent focus:bg-white/80 focus:border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/25 transition-all placeholder:text-macsub/70"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-macsub hover:text-macink transition-colors"
              title="Wissen"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-2 pb-1.5 text-[11px] font-semibold text-macsub uppercase tracking-wide flex items-center gap-1.5">
        {isSearching ? "Resultaten" : "Geschiedenis"}
        {searchingContent && <span className="w-1 h-1 rounded-full bg-macsub pulse-dot" />}
      </div>

      <div className="flex-1 overflow-y-auto mac-scroll px-2 pb-2">
        {chats.length === 0 && (
          <div className="text-[12.5px] text-macsub px-3 py-4 text-center leading-relaxed">
            Nog geen gesprekken.
            <br />
            Start je eerste chat hierboven.
          </div>
        )}
        {chats.length > 0 && isSearching && visibleChats.length === 0 && !searchingContent && (
          <div className="text-[12.5px] text-macsub px-3 py-4 text-center leading-relaxed fade-in-up">
            Niks gevonden voor "{searchTerm}".
          </div>
        )}
        {visibleChats.map((chat) => (
          <div
            key={chat.id}
            onMouseEnter={() => setHoveredId(chat.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSelectChat(chat.id)}
            className={`group flex items-center gap-2 px-3 py-2 rounded-[9px] cursor-pointer text-[13px] mb-0.5 transition-all duration-150 sidebar-item-in ${
              activeChatId === chat.id
                ? "bg-macblue text-white"
                : "text-macink hover:bg-black/[0.05]"
            }`}
          >
            <ChatBubbleIcon active={activeChatId === chat.id} />
            <span className="flex-1 truncate">{chat.title || "Nieuwe chat"}</span>
            {(hoveredId === chat.id || activeChatId === chat.id) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
                className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[12px] transition-colors ${
                  activeChatId === chat.id
                    ? "hover:bg-white/20 text-white/90"
                    : "hover:bg-black/10 text-macsub"
                }`}
                title="Verwijderen"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-macborder p-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-macblue to-macblue2 text-white text-[12px] font-semibold flex items-center justify-center shrink-0">
          {userEmail?.[0]?.toUpperCase() || "T"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-macink truncate">{userEmail}</div>
        </div>
        <button
          onClick={onOpenSettings}
          title="Instellingen"
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.06] transition-all hover:rotate-45"
        >
          <GearIcon />
        </button>
        <button
          onClick={onLogout}
          title="Uitloggen"
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/[0.06] transition-all text-macsub"
        >
          <LogoutIcon />
        </button>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChatBubbleIcon({ active }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 ${active ? "text-white" : "text-macsub"}`}
    >
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
