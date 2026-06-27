// -----------------------------------------------------------------------------
// Firebase client config.
// Vul dit object met de gegevens uit jouw Firebase Console:
// Project settings -> General -> "Your apps" -> Web app -> SDK setup and configuration
// Deze waarden zijn NIET geheim (ze staan toch in elke browser), in tegenstelling
// tot je NVIDIA API key, die via Instellingen in de app wordt opgeslagen in
// Firestore (zie lib/settings.js) en alleen door jouw account leesbaar is.
//
// Er is GEEN Cloud Functions / Blaze-plan nodig voor dit project: alleen
// Auth + Firestore, beide gratis op het standaard Spark-plan.
// -----------------------------------------------------------------------------
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDdiuR4tMDML2vUcz754Lzejj3ZnzUOEms",
  authDomain: "tygoai.firebaseapp.com",
  projectId: "tygoai",
  storageBucket: "tygoai.firebasestorage.app",
  messagingSenderId: "864491325254",
  appId: "1:864491325254:web:bdadb19c72367745250747"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
