import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "./lib/auth.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import NoAccessScreen from "./components/NoAccessScreen.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ArtifactPanel from "./components/ArtifactPanel.jsx";
import {
  listenToChats,
  listenToMessages,
  createChat,
  deleteChat,
  touchChat,
  renameChat,
  addMessage
} from "./lib/chats.js";
import { streamChat, buildResumeMessages, generateChatTitle } from "./lib/stream.js";
import { extractArtifacts } from "./lib/artifacts.js";

export default function App() {
  const { user, isAllowed } = useAuth();

  if (user === undefined) {
    return <LoadingScreen />;
  }
  if (!user) {
    return <LoginScreen />;
  }
  if (!isAllowed) {
    return <NoAccessScreen />;
  }
  return <MainApp uid={user.uid} email={user.email} />;
}

function MainApp({ uid, email }) {
  const { logout } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reconnecting, setReconnecting] = useState(null); // { attempt, max } | null

  // Live token-usage van de huidige/laatste stream, voor de tracker in Settings.
  const [tokenUsage, setTokenUsage] = useState({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });

  // Per actief bericht houden we de losse artifacts bij, zodat de
  // ArtifactCard/Panel weet welke code-blokken erbij horen.
  const [artifactsByMessage, setArtifactsByMessage] = useState({});
  const [openArtifact, setOpenArtifact] = useState(null); // { messageId, artifactId }

  // Breedte van het Artifact-paneel, versleepbaar en onthouden (feature 13).
  const [artifactPanelWidth, setArtifactPanelWidth] = useState(() => {
    const stored = Number(localStorage.getItem("tygoai:artifactPanelWidth"));
    return Number.isFinite(stored) && stored >= 320 && stored <= 900 ? stored : 440;
  });

  // Houdt de actieve AbortController bij zodat de Stop-knop de juiste stream
  // kan afbreken (feature 8).
  const abortRef = useRef(null);

  // Bewaart per chat het laatst gestopte (nog niet afgeronde) antwoord, zodat
  // "Doorgaan met dit bericht" daarna verder kan zonder iets opnieuw te
  // versturen of te dupliceren (features 4 + 5). Dit leeft BEWUST alleen in
  // het geheugen van de browser-tab — niet in Firestore — om de
  // Firestore-opslag niet onnodig te laten groeien. Dat betekent ook: bij het
  // verversen/sluiten van de pagina gaat een gestopt antwoord verloren.
  const stoppedDraftsRef = useRef({}); // { [chatId]: { history, partialContent, partialReasoning } }
  // stoppedVersion is GEEN inhoudelijke state -- het bestaat alleen om React
  // te dwingen opnieuw te renderen zodra stoppedDraftsRef.current muteert
  // (een ref-mutatie triggert zelf geen render). canResume leest vervolgens
  // altijd direct uit de ref, gekoppeld aan de huidige activeChatId, zodat
  // het wisselen tussen chats en teruggaan de juiste knop-status toont.
  const [, setStoppedVersion] = useState(0);
  const bumpStoppedVersion = () => setStoppedVersion((v) => v + 1);

  // --- Chats ophalen/luisteren ---
  useEffect(() => {
    const unsub = listenToChats(uid, (list) => {
      setChats(list);
      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // --- Berichten van actieve chat ophalen ---
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    const unsub = listenToMessages(uid, activeChatId, (list) => {
      setMessages((prev) => {
        // Lokale streaming-berichten (die nog niet in Firestore staan) behouden
        // tijdens het updaten met de Firestore-snapshot.
        const streamingMsgs = prev.filter((m) => m.streaming);
        return [...list, ...streamingMsgs];
      });
    });
    return unsub;
  }, [uid, activeChatId]);

  async function handleNewChat() {
    const id = await createChat(uid);
    setActiveChatId(id);
    setOpenArtifact(null);
  }

  async function handleSelectChat(id) {
    setActiveChatId(id);
    setOpenArtifact(null);
  }

  async function handleDeleteChat(id) {
    await deleteChat(uid, id);
    delete stoppedDraftsRef.current[id];
    if (activeChatId === id) {
      setActiveChatId(null);
      setOpenArtifact(null);
    }
  }

  const handleOpenArtifact = useCallback(
    (artifactId) => {
      for (const [messageId, arts] of Object.entries(artifactsByMessage)) {
        if (arts.some((a) => a.id === artifactId)) {
          setOpenArtifact({ messageId, artifactId });
          return;
        }
      }
    },
    [artifactsByMessage]
  );

  function handleArtifactPanelResize(newWidth) {
    setArtifactPanelWidth(newWidth);
    localStorage.setItem("tygoai:artifactPanelWidth", String(newWidth));
  }

  /**
   * Start een streaming-call en houdt alle live state (content, reasoning,
   * artifacts, token-usage) bij. Wordt gebruikt zowel voor nieuwe berichten
   * als voor "Doorgaan met dit bericht".
   */
  function runStream({ chatId, requestMessages, localId, seedContent = "", seedReasoning = "", generateTitleAfter = null }) {
    let liveContent = seedContent;
    let liveReasoning = seedReasoning;

    setStreaming(true);
    setReconnecting(null);

    const { abort } = streamChat(requestMessages, {
      onChunk: (type, text) => {
        if (type === "reasoning") {
          liveReasoning += text;
        } else if (type === "content") {
          liveContent += text;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId
              ? {
                  ...m,
                  content: liveContent,
                  reasoning: liveReasoning,
                  reasoningStreaming: liveContent.length === 0
                }
              : m
          )
        );
      },
      onUsage: (usage) => {
        setTokenUsage(usage);
      },
      onReconnecting: (info) => {
        setReconnecting(info);
      },
      onDone: async (info) => {
        setStreaming(false);
        setReconnecting(null);
        abortRef.current = null;

        if (info?.stopped) {
          // Bewaar de voortgang zodat "Doorgaan met dit bericht" hem kan
          // hervatten. We laten het lokale streaming-bericht gewoon staan
          // (niet-streaming) zodat de gebruiker meteen ziet wat er al was.
          stoppedDraftsRef.current[chatId] = {
            history: requestMessages,
            partialContent: liveContent,
            partialReasoning: liveReasoning
          };
          bumpStoppedVersion();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === localId
                ? { ...m, streaming: false, reasoningStreaming: false, stoppedHere: true }
                : m
            )
          );
          return;
        }

        const { cleanText, artifacts } = extractArtifacts(liveContent, localId);
        const savedId = await addMessage(uid, chatId, {
          role: "assistant",
          content: cleanText,
          reasoning: liveReasoning || null,
          artifacts: artifacts.length ? artifacts : null
        });
        if (artifacts.length) {
          setArtifactsByMessage((prev) => ({ ...prev, [savedId]: artifacts }));
        }
        await touchChat(uid, chatId);
        setMessages((prev) => prev.filter((m) => m.id !== localId));
        delete stoppedDraftsRef.current[chatId];
        bumpStoppedVersion();

        // Auto-titel (feature 14): vervangt de afgekapte placeholder-titel
        // door een korte, AI-gegenereerde titel op basis van het eerste
        // vraag/antwoord-paar. Gebeurt op de achtergrond, blokkeert niets.
        if (generateTitleAfter) {
          generateChatTitle(generateTitleAfter, cleanText).then((title) => {
            if (title) renameChat(uid, chatId, title);
          });
        }
      },
      onError: async (err) => {
        setStreaming(false);
        setReconnecting(null);
        abortRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId
              ? {
                  ...m,
                  content: m.content || `⚠️ Er ging iets mis: ${err.message}`,
                  streaming: false,
                  reasoningStreaming: false
                }
              : m
          )
        );
      }
    });

    abortRef.current = abort;
  }

  async function handleSend(text, images = []) {
    let chatId = activeChatId;
    const isFirstMessage = messages.length === 0;
    if (!chatId) {
      chatId = await createChat(uid, (text || "Afbeelding").slice(0, 40));
      setActiveChatId(chatId);
    } else if (isFirstMessage) {
      renameChat(uid, chatId, (text || "Afbeelding").slice(0, 40));
    }

    const userMsg = {
      role: "user",
      content: text,
      images: images.length ? images : null
    };
    await addMessage(uid, chatId, userMsg);
    await touchChat(uid, chatId);

    // Voor het model: berichten met afbeeldingen krijgen het multimodale
    // content-formaat (array van text/image_url-delen), zoals het model
    // (Nemotron Omni) verwacht. Berichten zonder afbeelding blijven gewoon
    // platte tekst, voor compatibiliteit met de rest van de geschiedenis.
    function toModelMessage(m) {
      if (m.images && m.images.length) {
        const parts = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const src of m.images) {
          parts.push({ type: "image_url", image_url: { url: src } });
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    }

    const history = [...messages, userMsg].filter((m) => !m.streaming).map(toModelMessage);

    const localId = "streaming-" + Date.now();

    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        role: "assistant",
        content: "",
        reasoning: "",
        reasoningStreaming: true,
        streaming: true
      }
    ]);

    runStream({ chatId, requestMessages: history, localId, generateTitleAfter: isFirstMessage ? text || "Afbeelding" : null });
  }

  function handleStop() {
    abortRef.current?.();
  }

  function handleResume() {
    if (!activeChatId) return;
    const draft = stoppedDraftsRef.current[activeChatId];
    if (!draft) return;

    const localId = messages.find((m) => m.stoppedHere)?.id || "streaming-" + Date.now();
    const resumeMessages = buildResumeMessages(draft.history, draft.partialContent);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === localId
          ? { ...m, streaming: true, reasoningStreaming: false, stoppedHere: false }
          : m
      )
    );

    runStream({
      chatId: activeChatId,
      requestMessages: resumeMessages,
      localId,
      seedContent: draft.partialContent,
      seedReasoning: draft.partialReasoning
    });
  }

  // Houd artifactsByMessage in sync met binnenkomende Firestore-berichten
  // (zodat ArtifactCards ook na een refresh weer klikbaar zijn).
  useEffect(() => {
    setArtifactsByMessage((prev) => {
      const next = { ...prev };
      for (const m of messages) {
        if (m.artifacts && !next[m.id]) {
          next[m.id] = m.artifacts;
        }
      }
      return next;
    });
  }, [messages]);

  // Live artifacts tijdens streaming ook al beschikbaar maken voor de
  // kaartjes EN voor het Artifact-paneel, ook terwijl het codeblok nog open
  // is (feature 2: artifact verschijnt direct, niet pas na afronding).
  useEffect(() => {
    const streamingMsg = messages.find((m) => m.streaming);
    if (!streamingMsg) return;
    const { artifacts } = extractArtifacts(streamingMsg.content || "", streamingMsg.id);
    if (artifacts.length) {
      setArtifactsByMessage((prev) => ({ ...prev, [streamingMsg.id]: artifacts }));
      // Open automatisch het paneel zodra het eerste codeblok van dit
      // bericht begint, zodat de gebruiker de code live zie meegroeien.
      setOpenArtifact((prevOpen) => {
        if (prevOpen && prevOpen.messageId === streamingMsg.id) return prevOpen;
        if (prevOpen) return prevOpen; // gebruiker keek al iets anders na, niet wegkapen
        return { messageId: streamingMsg.id, artifactId: artifacts[artifacts.length - 1].id };
      });
    }
  }, [messages]);

  const messagesWithCleanContent = messages.map((m) => {
    if (m.role !== "assistant") return m;
    const arts = artifactsByMessage[m.id];
    if (!arts) return m;
    if (m.streaming || m.stoppedHere) {
      const { cleanText } = extractArtifacts(m.content || "", m.id);
      return { ...m, content: cleanText, artifacts: arts };
    }
    return { ...m, artifacts: arts };
  });

  const activeChat = chats.find((c) => c.id === activeChatId);
  const activeArtifactObj = openArtifact
    ? artifactsByMessage[openArtifact.messageId]?.find((a) => a.id === openArtifact.artifactId)
    : null;

  // canResume kijkt naar het draft van de ACTIEVE chat specifiek, niet naar
  // welke chat het laatst gestopt is — anders zou de knop verkeerd verdwijnen
  // als je na het stoppen even naar een andere chat wisselt en teruggaat.
  // stoppedVersion (zie hierboven) dient alleen om een re-render te forceren
  // zodra een draft wijzigt (een ref-mutatie alleen triggert geen render).
  const canResume = !streaming && !!stoppedDraftsRef.current[activeChatId];

  return (
    <div className="h-screen w-screen flex overflow-hidden p-3 gap-0">
      <div className="flex-1 flex rounded-mac overflow-hidden shadow-mac border border-macborder mac-window-in">
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onOpenSettings={() => setShowSettings(true)}
          onLogout={logout}
          userEmail={email}
          uid={uid}
        />
        <ChatWindow
          messages={messagesWithCleanContent}
          onSend={handleSend}
          streaming={streaming}
          reconnecting={reconnecting}
          chatTitle={activeChat?.title}
          onOpenArtifact={handleOpenArtifact}
          activeArtifactId={openArtifact?.artifactId}
          onStop={handleStop}
          canResume={canResume}
          onResume={handleResume}
        />
        {activeArtifactObj && (
          <ArtifactPanel
            artifact={activeArtifactObj}
            onClose={() => setOpenArtifact(null)}
            width={artifactPanelWidth}
            onResize={handleArtifactPanelResize}
          />
        )}
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} tokenUsage={tokenUsage} />
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-macblue to-macblue2 animate-pulse" />
        <span className="text-[13px] text-macsub">TygoAI laden…</span>
      </div>
    </div>
  );
}
