// -----------------------------------------------------------------------------
// NVIDIA-instellingen (API key + model parameters) rechtstreeks in Firestore,
// zonder Cloud Function ertussen. Beveiliging komt nu volledig uit de
// Firestore rules: alleen jouw UID mag dit document lezen/schrijven.
// -----------------------------------------------------------------------------
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const CONFIG_DOC = doc(db, "config", "nvidia");

const DEFAULTS = {
  apiKey: "",
  model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  temperature: 0.6,
  top_p: 0.95,
  max_tokens: 4096,
  reasoning_budget: 4096,
  enable_thinking: true
};

export async function getNvidiaSettings() {
  const snap = await getDoc(CONFIG_DOC);
  if (!snap.exists()) return { ...DEFAULTS };
  return { ...DEFAULTS, ...snap.data() };
}

export async function saveNvidiaSettings(partial) {
  await setDoc(CONFIG_DOC, partial, { merge: true });
}
