import { useEffect, useState } from "react";
import { getNvidiaSettings, saveNvidiaSettings } from "../lib/settings.js";

export default function SettingsModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [model, setModel] = useState("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
  const [temperature, setTemperature] = useState(0.6);
  const [topP, setTopP] = useState(0.95);
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
        enable_thinking: enableThinking
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="mac-window-in w-[460px] max-h-[85vh] overflow-y-auto mac-scroll rounded-mac shadow-mac bg-macpanel backdrop-blur-mac border border-macborder"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 flex items-center px-4 bg-macpanel2 border-b border-macborder sticky top-0">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-macred hover:opacity-70 transition"
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
                  className="w-full h-9 rounded-[9px] px-3 text-[13.5px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40"
                />
              </Field>

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

              <div className="grid grid-cols-2 gap-4">
                <Field label="Max tokens">
                  <input
                    type="number"
                    min="256"
                    max="65536"
                    step="256"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                    className="w-full h-9 rounded-[9px] px-3 text-[13.5px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40"
                  />
                </Field>
                <Field label="Reasoning budget">
                  <input
                    type="number"
                    min="0"
                    max="32768"
                    step="256"
                    value={reasoningBudget}
                    onChange={(e) => setReasoningBudget(e.target.value)}
                    className="w-full h-9 rounded-[9px] px-3 text-[13.5px] bg-white/70 border border-macborder focus:outline-none focus:ring-2 focus:ring-macblue/40"
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2.5 text-[13.5px] text-macink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableThinking}
                  onChange={(e) => setEnableThinking(e.target.checked)}
                  className="w-4 h-4 accent-macblue"
                />
                Denkproces (reasoning) inschakelen
              </label>

              {savedMsg && (
                <div className="text-[12.5px] text-macgreen bg-macgreen/10 rounded-lg px-3 py-2">
                  {savedMsg}
                </div>
              )}
              {errorMsg && (
                <div className="text-[12.5px] text-macred bg-macred/10 rounded-lg px-3 py-2">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="h-9 rounded-[9px] bg-macblue text-white text-[13.5px] font-medium hover:bg-macblue2 active:scale-[0.98] transition disabled:opacity-50"
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
