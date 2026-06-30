// -----------------------------------------------------------------------------
// NVIDIA-instellingen (API key + model parameters) rechtstreeks in Firestore,
// zonder Cloud Function ertussen. Beveiliging komt nu volledig uit de
// Firestore rules: alleen jouw UID mag dit document lezen/schrijven.
//
// NIEUW: budget_mode bepaalt hoe het reasoning-budget per bericht wordt
// gekozen:
//   - "auto"  (standaard) -> automatisch gedetecteerd per vraag (lib/autoBudget.js)
//   - "snel"  -> altijd minimale denktijd (preset, negeert detectie)
//   - "slim"  -> altijd meer reasoning (preset, negeert detectie)
// De oude losse velden (reasoning_budget, max_tokens, enable_thinking) blijven
// bestaan als geavanceerde/handmatige fallback-waarden, voor het geval iemand
// die later via custom-instellingen toch zelf wil overschrijven, maar de UI
// stuurt voortaan primair op budget_mode.
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
  enable_thinking: true,
  budget_mode: "auto" // "auto" | "snel" | "slim"
};

export async function getNvidiaSettings() {
  const snap = await getDoc(CONFIG_DOC);
  if (!snap.exists()) return { ...DEFAULTS };
  return { ...DEFAULTS, ...snap.data() };
}

export async function saveNvidiaSettings(partial) {
  await setDoc(CONFIG_DOC, partial, { merge: true });
}
