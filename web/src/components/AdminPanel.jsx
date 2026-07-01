import { useEffect, useState } from "react";
import {
  listGuestAccounts,
  indexGuestAccount,
  unindexGuestAccount,
  addGuestAccount,
  removeGuestAccount,
  setAccountStatus,
  getGuestChatTitles,
  getAdminNotifications,
  deleteAdminNotification
} from "../lib/admin.js";

/**
 * Admin-tab (alleen zichtbaar voor tygomassalt@gmail.com): beheert
 * gast-accounts (vergrendelen/uitschakelen/verwijderen op applicatieniveau)
 * en toont meldingen die gasten hebben gestuurd.
 *
 * Belangrijk: het daadwerkelijk aanmaken van het Firebase Auth-account
 * (e-mail + wachtwoord) gebeurt nog steeds handmatig in Firebase Console --
 * dat kan niet vanuit de browser zonder een Cloud Function met admin-SDK
 * (Blaze-plan). Hier voeg je daarna alleen het UID toe om het account te
 * activeren en te kunnen beheren.
 */
export default function AdminPanel({ onClose }) {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [expandedUid, setExpandedUid] = useState(null);
  const [guestChats, setGuestChats] = useState({});

  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [guestList, notifs] = await Promise.all([listGuestAccounts(), getAdminNotifications()]);
      setGuests(guestList);
      setNotifications(notifs);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddGuest() {
    const uid = newUid.trim();
    if (!uid) return;
    setAdding(true);
    setAddError("");
    try {
      await addGuestAccount(uid, { displayName: newName.trim() || "Gast" });
      await indexGuestAccount(uid, newName.trim() || "Gast");
      setNewUid("");
      setNewName("");
      await refresh();
    } catch (e) {
      setAddError("Toevoegen mislukt: " + e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleStatusChange(uid, status) {
    await setAccountStatus(uid, status);
    setGuests((prev) => prev.map((g) => (g.uid === uid ? { ...g, status } : g)));
  }

  async function handleRemove(uid) {
    if (
      !confirm(
        "Account verwijderen op applicatieniveau? De gast verliest direct alle toegang. (Het Firebase-account zelf moet je apart verwijderen in Firebase Console.)"
      )
    )
      return;
    await removeGuestAccount(uid);
    await unindexGuestAccount(uid);
    setGuests((prev) => prev.filter((g) => g.uid !== uid));
  }

  async function handleExpand(uid) {
    if (expandedUid === uid) {
      setExpandedUid(null);
      return;
    }
    setExpandedUid(uid);
    if (!guestChats[uid]) {
      const chats = await getGuestChatTitles(uid);
      setGuestChats((prev) => ({ ...prev, [uid]: chats }));
    }
  }

  async function handleDeleteNotification(id) {
    await deleteAdminNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 modal-backdrop-in"
      onClick={onClose}
    >
      <div
        className="mac-window-in w-[92vw] sm:w-[640px] max-h-[85vh] overflow-y-auto mac-scroll rounded-mac shadow-mac bg-macpanel backdrop-blur-mac border border-macborder"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 flex items-center px-4 bg-macpanel2 border-b border-macborder sticky top-0">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-macred hover:opacity-70 transition-opacity"
            />
            <span className="w-3 h-3 rounded-full bg-macyellow" />
            <span className="w-3 h-3 rounded-full bg-macgreen" />
          </div>
          <div className="flex-1 text-center text-[13px] text-macsub font-medium -ml-12">Admin</div>
        </div>

        <div className="p-5 flex flex-col gap-6">
          {/* Nieuw gast-account toevoegen */}
          <section>
            <h3 className="text-[13px] font-semibold text-macink mb-2">Gast-account activeren</h3>
            <p className="text-[11.5px] text-macsub mb-3 leading-relaxed">
              Maak eerst het account aan in Firebase Console → Authentication → Add user (e-mail +
              wachtwoord, deel dat zelf met de gast). Kopieer daarna het UID hierbeneden om het te
              activeren en te kunnen beheren.
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Firebase UID"
                value={newUid}
                onChange={(e) => setNewUid(e.target.value)}
                className="h-9 rounded-[9px] px-3 text-[13px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40 font-mono"
              />
              <input
                type="text"
                placeholder="Naam (bijv. 'Mike')"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 rounded-[9px] px-3 text-[13px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40"
              />
              <button
                onClick={handleAddGuest}
                disabled={adding || !newUid.trim()}
                className="h-9 rounded-[9px] bg-macblue text-white text-[13px] font-medium hover:bg-macblue2 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {adding ? "Bezig…" : "Activeren"}
              </button>
              {addError && <span className="text-[11.5px] text-macred">{addError}</span>}
            </div>
          </section>

          {/* Gast-accounts lijst */}
          <section>
            <h3 className="text-[13px] font-semibold text-macink mb-2">Gast-accounts ({guests.length})</h3>
            {loading ? (
              <div className="text-[12.5px] text-macsub py-3">Laden…</div>
            ) : guests.length === 0 ? (
              <div className="text-[12.5px] text-macsub py-3">Nog geen gast-accounts toegevoegd.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {guests.map((g) => (
                  <div key={g.uid} className="border border-macborder rounded-[10px] bg-white/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button onClick={() => handleExpand(g.uid)} className="flex-1 text-left">
                        <div className="text-[13px] font-medium text-macink">{g.displayName || "Gast"}</div>
                        <div className="text-[10.5px] text-macsub font-mono truncate">{g.uid}</div>
                      </button>
                      <StatusBadge status={g.status} />
                    </div>
                    <div className="flex gap-1.5 px-3 pb-2.5 flex-wrap">
                      {g.status !== "active" && (
                        <SmallButton onClick={() => handleStatusChange(g.uid, "active")}>Activeren</SmallButton>
                      )}
                      {g.status === "active" && (
                        <SmallButton onClick={() => handleStatusChange(g.uid, "locked")}>Vergrendelen</SmallButton>
                      )}
                      {g.status !== "disabled" && (
                        <SmallButton onClick={() => handleStatusChange(g.uid, "disabled")} danger>
                          Stopzetten
                        </SmallButton>
                      )}
                      <SmallButton onClick={() => handleRemove(g.uid)} danger>
                        Verwijderen
                      </SmallButton>
                    </div>
                    {expandedUid === g.uid && (
                      <div className="border-t border-macborder px-3 py-2.5 bg-black/[0.02] fade-in-up">
                        <div className="text-[11px] font-semibold text-macsub uppercase tracking-wide mb-1.5">
                          Chattitels
                        </div>
                        {!guestChats[g.uid] ? (
                          <div className="text-[12px] text-macsub">Laden…</div>
                        ) : guestChats[g.uid].length === 0 ? (
                          <div className="text-[12px] text-macsub">Nog geen chats.</div>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {guestChats[g.uid].map((c) => (
                              <li key={c.id} className="text-[12.5px] text-macink truncate">
                                {c.title}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Meldingen van gasten */}
          <section>
            <h3 className="text-[13px] font-semibold text-macink mb-2">
              Meldingen van gasten ({notifications.length})
            </h3>
            {notifications.length === 0 ? (
              <div className="text-[12.5px] text-macsub py-3">Geen meldingen.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {notifications.map((n) => (
                  <div key={n.id} className="border border-macborder rounded-[10px] bg-white/60 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12.5px] font-medium text-macink">{n.fromName}</span>
                      <button
                        onClick={() => handleDeleteNotification(n.id)}
                        className="text-[11px] text-macsub hover:text-macred transition-colors"
                      >
                        Verwijderen
                      </button>
                    </div>
                    <p className="text-[12.5px] text-macink leading-relaxed whitespace-pre-wrap">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    active: "bg-macgreen/15 text-macgreen",
    locked: "bg-macyellow/15 text-[#8a6300]",
    disabled: "bg-macred/15 text-macred",
    no_account: "bg-macsub/15 text-macsub"
  };
  const labels = {
    active: "Actief",
    locked: "Vergrendeld",
    disabled: "Stopgezet",
    no_account: "Geen account"
  };
  return (
    <span
      className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
        styles[status] || styles.no_account
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

function SmallButton({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11.5px] px-2.5 py-1 rounded-[7px] font-medium transition-colors ${
        danger ? "bg-macred/10 text-macred hover:bg-macred/20" : "bg-macblue/10 text-macblue hover:bg-macblue/20"
      }`}
    >
      {children}
    </button>
  );
}
