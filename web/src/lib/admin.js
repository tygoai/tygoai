// -----------------------------------------------------------------------------
// Admin-functionaliteit: alleen bruikbaar door de admin (tygomassalt@gmail.com,
// UID-gecheckt via Firestore rules). Gast-accounts maak je zelf aan in
// Firebase Console -> Authentication (e-mail + wachtwoord). Na het aanmaken
// voeg je hun UID hier in de admin-tab toe, zodat er een statusdocument
// ontstaat en de admin ze kan beheren.
//
// BELANGRIJK: het daadwerkelijk VERWIJDEREN of het WACHTWOORD WIJZIGEN van
// een Firebase Auth-account kan niet via deze Firestore-only aanpak (dat
// vereist de Firebase Admin SDK, dus een Cloud Function met het betaalde
// Blaze-plan). Wat wel kan zonder Blaze: het account vergrendelen/
// uitschakelen op applicatieniveau (Firestore-status), waardoor de gast
// geen toegang meer heeft tot data, ook al kan hij nog technisch inloggen
// bij Firebase zelf. Voor echt verwijderen/wachtwoord wijzigen verwijst de
// admin-tab naar de Firebase Console.
// -----------------------------------------------------------------------------
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit as fbLimit
} from "firebase/firestore";
import { db } from "./firebase.js";

/**
 * Maakt (of overschrijft) het statusdocument voor een gast-account. Roep dit
 * aan nadat je in Firebase Console handmatig een nieuw e-mail/wachtwoord-
 * account hebt aangemaakt en het UID hebt gekopieerd.
 */
export async function addGuestAccount(uid, { displayName, expiresAt = null } = {}) {
  await setDoc(doc(db, "users", uid, "account", "info"), {
    status: "active",
    isGuest: true,
    displayName: displayName || "Gast",
    createdAt: Date.now(),
    expiresAt // timestamp (ms) of null = onbeperkt
  });
}

/** Haalt het statusdocument van één account op. */
export async function getAccountStatus(uid) {
  const snap = await getDoc(doc(db, "users", uid, "account", "info"));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/**
 * Zet de status van een gast-account (lock/unlock/disable). "locked" en
 * "disabled" hebben in de praktijk hetzelfde effect (geen toegang meer) --
 * het onderscheid is puur voor de admin om te zien of het bewust tijdelijk
 * (locked) of definitief (disabled) bedoeld was.
 */
export async function setAccountStatus(uid, status) {
  await setDoc(doc(db, "users", uid, "account", "info"), { status }, { merge: true });
}

/**
 * "Verwijdert" een gast-account op applicatieniveau: zet status op
 * "disabled" en verwijdert het statusdocument zelf, zodat rules de toegang
 * blokkeren (geen "active" document meer = geen toegang, zie firestore.rules
 * accountIsActive-functie). Het Firebase Auth-account zelf blijft bestaan
 * (verwijderen daarvan kan alleen via Firebase Console, zie boven).
 */
export async function removeGuestAccount(uid) {
  await deleteDoc(doc(db, "users", uid, "account", "info"));
}

/**
 * Haalt alle bekende gast-UIDs op samen met hun status. Omdat Firestore geen
 * "list alle subcollecties" ondersteunt, houden we een aparte index bij in
 * een vlakke collectie (admin_guest_index) die we bijwerken zodra een gast
 * wordt toegevoegd, zodat de admin-tab een overzicht kan tonen.
 */
export async function listGuestAccounts() {
  const snap = await getDocs(collection(db, "admin_guest_index"));
  const uids = snap.docs.map((d) => d.id);
  const results = await Promise.all(
    uids.map(async (uid) => {
      const status = await getAccountStatus(uid);
      return status || { uid, status: "no_account" };
    })
  );
  return results;
}

/** Voegt een UID toe aan de index zodat listGuestAccounts 'm meeneemt. */
export async function indexGuestAccount(uid, displayName) {
  await setDoc(doc(db, "admin_guest_index", uid), { displayName, addedAt: Date.now() });
}

export async function unindexGuestAccount(uid) {
  await deleteDoc(doc(db, "admin_guest_index", uid));
}

/** Haalt chattitels (alleen titels, geen inhoud) van een gast op voor de admin-tab. */
export async function getGuestChatTitles(uid) {
  const q = query(collection(db, "users", uid, "chats"), orderBy("updatedAt", "desc"), fbLimit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, title: d.data().title || "Naamloos" }));
}

/** Haalt meldingen op die gasten naar de admin hebben gestuurd. */
export async function getAdminNotifications() {
  const q = query(collection(db, "admin_notifications"), orderBy("createdAt", "desc"), fbLimit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteAdminNotification(id) {
  await deleteDoc(doc(db, "admin_notifications", id));
}

/** Door een gast aan te roepen: stuurt een melding naar de admin. */
export async function sendNotificationToAdmin(fromUid, fromName, message) {
  const ref = doc(collection(db, "admin_notifications"));
  await setDoc(ref, {
    fromUid,
    fromName: fromName || "Gast",
    message,
    createdAt: Date.now()
  });
}
