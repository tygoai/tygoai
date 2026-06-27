import { useEffect, useState, useCallback } from "react";
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
  addMessage,
  updateMessage
} from "./lib/chats.js";
import { streamChat } from "./lib/stream.js";
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

  // Per actief bericht houden we de losse artifacts bij, zodat de
  // ArtifactCard/Panel weet welke code-blokken erbij horen.
  const [artifactsByMessage, setArtifactsByMessage] = useState({});
  const [openArtifact, setOpenArtifact] = useState(null); // { messageId, artifactId }

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
    if (activeChatId === id) {
      setActiveChatId(null);
      setOpenArtifact(null);
    }
  }

  const handleOpenArtifact = useCallback(
    (artifactId) => {
      // Zoek bij welk bericht dit artifact hoort
      for (const [messageId, arts] of Object.entries(artifactsByMessage)) {
        if (arts.some((a) => a.id === artifactId)) {
          setOpenArtifact({ messageId, artifactId });
          return;
        }
      }
    },
    [artifactsByMessage]
  );

  async function handleSend(text) {
    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createChat(uid, text.slice(0, 40));
      setActiveChatId(chatId);
    } else if (messages.length === 0) {
      renameChat(uid, chatId, text.slice(0, 40));
    }

    const userMsg = { role: "user", content: text };
    await addMessage(uid, chatId, userMsg);
    await touchChat(uid, chatId);

    const history = [...messages, userMsg]
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));

    const localId = "streaming-" + Date.now();
    let liveContent = "";
    let liveReasoning = "";

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
    setStreaming(true);

    streamChat(history, {
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
      onDone: async () => {
        setStreaming(false);
        const { cleanText, artifacts } = extractArtifacts(liveContent);
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
      },
      onError: async (err) => {
        setStreaming(false);
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

  // Live artifacts tijdens streaming ook al beschikbaar maken voor de kaartjes
  useEffect(() => {
    const streamingMsg = messages.find((m) => m.streaming);
    if (!streamingMsg) return;
    const { artifacts } = extractArtifacts(streamingMsg.content || "");
    if (artifacts.length) {
      setArtifactsByMessage((prev) => ({ ...prev, [streamingMsg.id]: artifacts }));
    }
  }, [messages]);

  const messagesWithCleanContent = messages.map((m) => {
    if (m.role !== "assistant") return m;
    const arts = artifactsByMessage[m.id];
    if (!arts) return m;
    // Voor opgeslagen berichten staat content al "clean" (placeholders).
    // Voor streaming berichten moeten we elke render opnieuw extraheren.
    if (m.streaming) {
      const { cleanText } = extractArtifacts(m.content || "");
      return { ...m, content: cleanText, artifacts: arts };
    }
    return { ...m, artifacts: arts };
  });

  const activeChat = chats.find((c) => c.id === activeChatId);
  const activeArtifactObj = openArtifact
    ? artifactsByMessage[openArtifact.messageId]?.find((a) => a.id === openArtifact.artifactId)
    : null;

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
        />
        <ChatWindow
          messages={messagesWithCleanContent}
          onSend={handleSend}
          streaming={streaming}
          chatTitle={activeChat?.title}
          onOpenArtifact={handleOpenArtifact}
          activeArtifactId={openArtifact?.artifactId}
        />
        {activeArtifactObj && (
          <ArtifactPanel artifact={activeArtifactObj} onClose={() => setOpenArtifact(null)} />
        )}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
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
