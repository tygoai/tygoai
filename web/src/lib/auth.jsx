import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

// -----------------------------------------------------------------------------
// BELANGRIJK: dit is de UI-laag van de toegangscontrole. De echte beveiliging
// zit in Firestore rules (zie firestore.rules). Deze check hier bepaalt
// alleen wat de gebruiker te zien krijgt.
//
// Toegangsmodel (admin + gasten):
// - Alleen accounts die JIJ aanmaakt in Firebase Console (Authentication)
//   kunnen ooit inloggen -- er is geen open registratie.
// - Jouw eigen account (ADMIN_UID) heeft altijd volledige toegang.
// - Elk ander account (een "gast") wordt gecontroleerd tegen zijn
//   Firestore-statusdocument op users/{uid}/account/info. Bestaat dat
//   document niet, of staat status niet op "active" (bijv. "locked" of
//   "disabled"), dan krijgt de gast geen toegang -- ook al kan hij wel
//   inloggen bij Firebase zelf (rules blokkeren de eigenlijke data toch).
// -----------------------------------------------------------------------------
const ADMIN_UID = "m5e91Bn2BXaPOaSNTIlakFehuVz1";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = nog aan het laden
  const [accountStatus, setAccountStatus] = useState(undefined); // undefined = laden, null = geen toegang
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser || null);
      if (!firebaseUser) {
        setAccountStatus(null);
        return;
      }
      if (firebaseUser.uid === ADMIN_UID) {
        setAccountStatus("active");
        return;
      }
      // Gast: status opzoeken in Firestore.
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid, "account", "info"));
        if (snap.exists() && snap.data().status === "active") {
          setAccountStatus("active");
        } else {
          setAccountStatus(snap.exists() ? snap.data().status : "no_account");
        }
      } catch {
        setAccountStatus("no_account");
      }
    });
    return unsub;
  }, []);

  const isAdmin = user?.uid === ADMIN_UID;
  const isAllowed = !!user && accountStatus === "active";

  async function loginWithGoogle() {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(translateAuthError(e.code));
    }
  }

  async function loginWithEmail(email, password) {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError(translateAuthError(e.code));
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAllowed,
        isAdmin,
        accountStatus,
        error,
        setError,
        loginWithGoogle,
        loginWithEmail,
        logout
      }}
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
