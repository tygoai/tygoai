import { useAuth } from "../lib/auth.jsx";

export default function NoAccessScreen({ accountStatus }) {
  const { logout, user } = useAuth();

  const isLocked = accountStatus === "locked";
  const isDisabled = accountStatus === "disabled";
  const isGuest = isLocked || isDisabled;

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="mac-window-in w-[92vw] sm:w-[380px] rounded-mac shadow-mac bg-macpanel backdrop-blur-mac border border-macborder overflow-hidden text-center">
        <div className="h-9 flex items-center px-4 bg-macpanel2 border-b border-macborder">
          <div className="flex gap-2">
            <span className="w-3 h-3 rounded-full bg-macred" />
            <span className="w-3 h-3 rounded-full bg-macyellow" />
            <span className="w-3 h-3 rounded-full bg-macgreen" />
          </div>
        </div>
        <div className="p-8">
          <div className="w-12 h-12 rounded-full bg-macred/10 flex items-center justify-center mx-auto mb-4 text-2xl">
            {isLocked ? "🔒" : isDisabled ? "⛔" : "🚫"}
          </div>
          <h1 className="text-[16px] font-semibold text-macink mb-1">
            {isLocked ? "Account vergrendeld" : isDisabled ? "Account stopgezet" : "Geen toegang"}
          </h1>
          <p className="text-[13px] text-macsub leading-relaxed mb-5">
            {isLocked
              ? "Je account is tijdelijk vergrendeld door de beheerder. Neem contact op om toegang te hervatten."
              : isDisabled
              ? "Je account is stopgezet. Neem contact op met de beheerder."
              : `${user?.email} heeft geen toegang tot TygoAI.`}
          </p>
          <button
            onClick={logout}
            className="h-9 px-4 rounded-[10px] bg-macink text-white text-[13px] font-medium hover:opacity-90 transition"
          >
            Uitloggen
          </button>
        </div>
      </div>
    </div>
  );
}
