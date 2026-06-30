// -----------------------------------------------------------------------------
// Zoeklogica voor de sidebar (feature 12). Filtert chats realtime op titel
// (instant, zonder extra Firestore-reads) en kan daarnaast — on demand — ook
// op berichtinhoud zoeken door de berichten van de zichtbare chats op te
// halen en lokaal te doorzoeken op trefwoorden.
//
// Bewuste keuze: we zoeken NIET continu/live door alle berichtinhoud bij elke
// toetsaanslag (dat zou bij elke letter een hoop Firestore-reads opleveren).
// In plaats daarvan filteren we eerst razendsnel op titel, en halen we de
// inhoud van chats pas op wanneer de gebruiker een zoekterm intikt die niets
// op titel oplevert, met een korte debounce.
// -----------------------------------------------------------------------------
import { fetchMessagesOnce } from "./chats.js";

export function filterChatsByTitle(chats, query) {
  const q = query.trim().toLowerCase();
  if (!q) return chats;
  return chats.filter((c) => (c.title || "").toLowerCase().includes(q));
}

/**
 * Doorzoekt de inhoud van een lijst chats en geeft de subset terug waarvan
 * minstens één bericht de zoekterm bevat. Gebruikt fetchMessagesOnce, dus dit
 * kost een Firestore-read per chat — alleen aanroepen wanneer nodig (debounce
 * + alleen als titel-filter niets/weinig opleverde).
 */
export async function searchChatsByContent(uid, chats, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results = await Promise.all(
    chats.map(async (chat) => {
      try {
        const msgs = await fetchMessagesOnce(uid, chat.id);
        const match = msgs.some((m) => (m.content || "").toLowerCase().includes(q));
        return match ? chat : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}
