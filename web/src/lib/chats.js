import {
  collection,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "./firebase";

export function chatsRef(uid) {
  return collection(db, "users", uid, "chats");
}

export function messagesRef(uid, chatId) {
  return collection(db, "users", uid, "chats", chatId, "messages");
}

export function listenToChats(uid, callback) {
  const q = query(chatsRef(uid), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function listenToMessages(uid, chatId, callback) {
  const q = query(messagesRef(uid, chatId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Eenmalige (niet-live) ophaling van berichten van één chat, gebruikt door de
 * zoekbalk in de sidebar om ook op inhoud te kunnen filteren (feature 12).
 * Limiet van 200 berichten per chat is ruim voldoende voor een 1-persoons
 * Spark-plan-app en voorkomt onnodig grote reads bij zeer lange gesprekken.
 */
export async function fetchMessagesOnce(uid, chatId) {
  const q = query(messagesRef(uid, chatId), orderBy("createdAt", "asc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createChat(uid, title = "Nieuwe chat") {
  const ref = await addDoc(chatsRef(uid), {
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function renameChat(uid, chatId, title) {
  await updateDoc(doc(db, "users", uid, "chats", chatId), { title });
}

export async function touchChat(uid, chatId) {
  await updateDoc(doc(db, "users", uid, "chats", chatId), { updatedAt: serverTimestamp() });
}

export async function deleteChat(uid, chatId) {
  await deleteDoc(doc(db, "users", uid, "chats", chatId));
}

export async function addMessage(uid, chatId, message) {
  const ref = await addDoc(messagesRef(uid, chatId), {
    ...message,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateMessage(uid, chatId, messageId, fields) {
  await setDoc(doc(db, "users", uid, "chats", chatId, "messages", messageId), fields, {
    merge: true
  });
}
