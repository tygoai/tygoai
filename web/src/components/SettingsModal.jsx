import { useEffect, useState } from "react";
import { getNvidiaSettings, saveNvidiaSettings } from "../lib/settings.js";
import { BUDGET_LABELS } from "../lib/autoBudget.js";

const PRESETS = [
  {
    id: "auto",
    label: "Auto",
    description: "Bepaalt automatisch per vraag hoeveel denktijd nodig is. Standaard."
  },
  {
    id: "snel",
    label: "Snel",
    description: "Altijd minimale denktijd — voor de snelste antwoorden."
  },
  {
    id: "slim",
    label: "Slim",
    description: "Altijd meer reasoning — voor de meest doordachte antwoorden."
  }
];

export default function SettingsModal({ onClose, tokenUsage }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [model, setModel] = useState("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
  const [temperature, setTemperature] = useState(0.6);
  const [topP, setTopP] = useState(0.95);
  const [budgetMode, setBudgetMode] = useState("auto");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Geavanceerde/handmatige fallback-waarden (alleen relevant als je ooit
  // budget_mode handmatig zou willen overschrijven via eigen aanpassingen;
  // de presets hierboven zijn voor het normale gebruik leidend).
  const [maxTokens, setMaxTokens] = useState(4096);
  const [reasoningBudget, setReasoningBudget] = useState(4096);
  const [enableThinking, setEnableThinking] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const d = await getNvidiaSettings();
        setHasKey(!!d.apiKey);
        setModel(d.model);
        setTemperature(d.temperature);
        setTopP(d.top_p);
        setMaxTokens(d.max_tokens);
        setReasoningBudget(d.reasoning_budget);
        setEnableThinking(d.enable_thinking);
        setBudgetMode(d.budget_mode || "auto");
      } catch (e) {
        setErrorMsg("Kon instellingen niet laden: " + e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSavedMsg("");
    setErrorMsg("");
    try {
      const payload = {
        model,
        temperature: Number(temperature),
        top_p: Number(topP),
        max_tokens: Number(maxTokens),
        reasoning_budget: Number(reasoningBudget),
        enable_thinking: enableThinking,
        budget_mode: budgetMode
      };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      await saveNvidiaSettings(payload);
      setSavedMsg("Opgeslagen.");
      setApiKey("");
      setHasKey(true);
    } catch (e) {
      setErrorMsg("Opslaan mislukt: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 modal-backdrop-in"
      onClick={onClose}
    >
      <div
        className="mac-window-in w-[480px] max-h-[85vh] overflow-y-auto mac-scroll rounded-mac shadow-mac bg-macpanel backdrop-blur-mac border border-macborder"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 flex items-center px-4 bg-macpanel2 border-b border-macborder sticky top-0">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-macred hover:opacity-70 transition-opacity"
              title="Sluiten"
            />
            <span className="w-3 h-3 rounded-full bg-macyellow" />
            <span className="w-3 h-3 rounded-full bg-macgreen" />
          </div>
          <div className="flex-1 text-center text-[13px] text-macsub font-medium -ml-12">
            Instellingen
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-[13px] text-macsub text-center py-8">Laden…</div>
          ) : (
            <div className="flex flex-col gap-5">
              <Field label="NVIDIA API key" hint={hasKey ? "Er is al een key opgeslagen." : "Nog geen key ingesteld."}>
                <input
                  type="password"
                  placeholder={hasKey ? "•••••••••••••••• (laat leeg om te behouden)" : "nvapi-..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full h-9 rounded-[9px] px-3 text-[13.5px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40 transition-shadow"
                />
              </Field>

              {/* Denktijd-presets (feature 10) — vervangt de handmatige slider als
                  primaire manier om het reasoning-gedrag te kiezen. */}
              <Field label="Denktijd">
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setBudgetMode(p.id)}
                      className={`rounded-[10px] border px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.97] ${
                        budgetMode === p.id
                          ? "border-macblue bg-macblue/[0.08] ring-1 ring-macblue/30"
                          : "border-macborder bg-white/60 hover:bg-white/90"
                      }`}
                    >
                      <div
                        className={`text-[13px] font-medium mb-0.5 ${
                          budgetMode === p.id ? "text-macblue" : "text-macink"
                        }`}
                      >
                        {p.label}
                      </div>
                      <div className="text-[10.5px] text-macsub leading-snug">{p.description}</div>
                    </button>
                  ))}
                </div>
              </Field>

              {/* Live token-usage tracker (feature 7) */}
              <Field label="Token-gebruik (live, laatste bericht)">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <TokenStat label="Prompt" value={tokenUsage?.promptTokens ?? 0} />
                  <TokenStat label="Completion" value={tokenUsage?.completionTokens ?? 0} />
                  <TokenStat label="Totaal" value={tokenUsage?.totalTokens ?? 0} />
                </div>
                <span className="text-[11px] text-macsub mt-1">
                  Dit model is gratis via NVIDIA — er zijn dus geen kosten verbonden aan dit gebruik.
                </span>
              </Field>

              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[12px] text-macsub hover:text-macink transition-colors flex items-center gap-1 -mt-1"
              >
                <span className={`transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}>›</span>
                Geavanceerde instellingen
              </button>

              <div
                className="overflow-hidden transition-all duration-300 ease-out"
                style={{ maxHeight: showAdvanced ? "640px" : "0px", opacity: showAdvanced ? 1 : 0 }}
              >
                <div className="flex flex-col gap-5 pt-1">
                  <Field label="Model">
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full h-9 rounded-[9px] px-3 text-[13.5px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40 font-mono"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label={`Temperature: ${temperature}`}>
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                        className="w-full accent-macblue"
                      />
                    </Field>
                    <Field label={`Top-p: ${topP}`}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={topP}
                        onChange={(e) => setTopP(e.target.value)}
                        className="w-full accent-macblue"
                      />
                    </Field>
                  </div>

                  <p className="text-[11px] text-macsub leading-snug">
                    Max tokens en reasoning-budget worden nu automatisch bepaald door de gekozen
                    denktijd-modus hierboven (Auto/Snel/Slim) en hoeven hier niet meer apart
                    ingesteld te worden.
                  </p>
                </div>
              </div>

              {savedMsg && (
                <div className="text-[12.5px] text-macgreen bg-macgreen/10 rounded-lg px-3 py-2 fade-in-up">
                  {savedMsg}
                </div>
              )}
              {errorMsg && (
                <div className="text-[12.5px] text-macred bg-macred/10 rounded-lg px-3 py-2 fade-in-up">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="h-9 rounded-[9px] bg-macblue text-white text-[13.5px] font-medium hover:bg-macblue2 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {saving ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] font-medium text-macink">{label}</label>
      {children}
      {hint && <span className="text-[11.5px] text-macsub">{hint}</span>}
    </div>
  );
}

function TokenStat({ label, value }) {
  return (
    <div className="rounded-[9px] bg-black/[0.035] border border-macborder px-2 py-2">
      <div className="text-[15px] font-semibold text-macink tabular-nums transition-all duration-200">
        {value.toLocaleString("nl-NL")}
      </div>
      <div className="text-[10.5px] text-macsub mt-0.5">{label}</div>
    </div>
  );
}
