import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";

export default function LoginScreen() {
  const { loginWithGoogle, loginWithEmail, error, setError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    await loginWithEmail(email, password);
    setBusy(false);
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    await loginWithGoogle();
    setBusy(false);
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#f5f5f7_0%,_#e3e3e7_55%,_#d4d4d9_100%)]">
      <div className="mac-window-in w-[380px] rounded-mac shadow-mac bg-macpanel backdrop-blur-mac border border-macborder overflow-hidden">
        {/* Window chrome */}
        <div className="h-9 flex items-center px-4 bg-macpanel2 border-b border-macborder">
          <div className="flex gap-2">
            <span className="w-3 h-3 rounded-full bg-macred" />
            <span className="w-3 h-3 rounded-full bg-macyellow" />
            <span className="w-3 h-3 rounded-full bg-macgreen" />
          </div>
          <div className="flex-1 text-center text-[13px] text-macsub font-medium -ml-12">
            TygoAI — Inloggen
          </div>
        </div>

        <div className="p-8 pt-7">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-macblue to-macblue2 shadow-macsoft flex items-center justify-center text-white text-2xl font-semibold mb-3">
              T
            </div>
            <h1 className="text-[19px] font-semibold text-macink">Welkom terug</h1>
            <p className="text-[13px] text-macsub mt-0.5">Log in om verder te gaan</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <input
              type="email"
              required
              placeholder="E-mailadres"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 rounded-[10px] px-3.5 text-[14px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40 focus:border-macblue/50 transition placeholder:text-macsub/70"
            />
            <input
              type="password"
              required
              placeholder="Wachtwoord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-[10px] px-3.5 text-[14px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40 focus:border-macblue/50 transition placeholder:text-macsub/70"
            />

            {error && (
              <div className="text-[12.5px] text-macred bg-macred/10 rounded-lg px-3 py-2 leading-snug">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-[10px] bg-macblue text-white text-[14px] font-medium mt-1 hover:bg-macblue2 active:scale-[0.98] transition disabled:opacity-50"
            >
              {busy ? "Bezig…" : "Inloggen"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-macborder" />
            <span className="text-[11px] text-macsub uppercase tracking-wide">of</span>
            <div className="flex-1 h-px bg-macborder" />
          </div>

          <button
            onClick={handleGoogle}
            disabled={busy}
            className="w-full h-10 rounded-[10px] border border-macborder bg-white/70 hover:bg-white/90 active:scale-[0.98] transition flex items-center justify-center gap-2 text-[14px] font-medium text-macink disabled:opacity-50"
          >
            <GoogleIcon />
            Inloggen met Google
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.6 34.7 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.6 39.6 16.3 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.2 5.6l6.6 5.6C41.4 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}
