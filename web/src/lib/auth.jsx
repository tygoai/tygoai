import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

// -----------------------------------------------------------------------------
// BELANGRIJK: dit is alleen de UI-laag van de toegangscontrole. De echte
// beveiliging zit in de Cloud Functions (ALLOWED_UID check) en Firestore
// rules. Deze check hier voorkomt alleen dat een verkeerd account de app
// te zien krijgt -- het is GEEN vervanging voor de backend-check.
// -----------------------------------------------------------------------------
const ALLOWED_EMAIL = "tygomassalt@gmail.com";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = nog aan het laden
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
    });
    return unsub;
  }, []);

  const isAllowed = !!user && user.email?.toLowerCase() === ALLOWED_EMAIL.toLowerCase();

  async function loginWithGoogle() {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user.email?.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
        await signOut(auth);
        setError("Dit Google-account heeft geen toegang tot TygoAI.");
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function loginWithEmail(email, password) {
    setError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (result.user.email?.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
        await signOut(auth);
        setError("Dit account heeft geen toegang tot TygoAI.");
      }
    } catch (e) {
      setError(translateAuthError(e.code));
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{ user, isAllowed, error, setError, loginWithGoogle, loginWithEmail, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth moet binnen AuthProvider gebruikt worden");
  return ctx;
}

function translateAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Ongeldig e-mailadres.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-mailadres of wachtwoord onjuist.";
    case "auth/too-many-requests":
      return "Te veel mislukte pogingen. Probeer later opnieuw.";
    default:
      return "Inloggen mislukt. Probeer het opnieuw.";
  }
}
