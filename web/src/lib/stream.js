// -----------------------------------------------------------------------------
// Praat rechtstreeks vanuit de browser met de NVIDIA API en streamt het
// antwoord live terug. Er is GEEN server tussen jou en NVIDIA: dit werkt
// puur met Firebase Auth (login) + Firestore (chatgeschiedenis + key-opslag)
// en is daarom volledig gratis te hosten, ook via GitHub Pages.
//
// Bewuste afweging: hierdoor is de NVIDIA API-key zichtbaar in de browser
// (devtools) van wie ook is ingelogd. Omdat de app is afgesloten tot precies
// 1 account (zie lib/auth.jsx), is dat in deze opzet geen probleem: niemand
// anders kan ooit inloggen en de key dus nooit zien.
// -----------------------------------------------------------------------------

import { getNvidiaSettings } from "./settings.js";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/**
 * Stuurt berichten naar NVIDIA en streamt het antwoord terug.
 * Roept onChunk("reasoning"|"content", text) aan voor elk stukje tekst,
 * en onDone() wanneer de stream klaar is.
 */
export async function streamChat(messages, { onChunk, onDone, onError }) {
  let settings;
  try {
    settings = await getNvidiaSettings();
  } catch (e) {
    onError?.(new Error("Kon instellingen niet laden: " + e.message));
    return;
  }

  if (!settings.apiKey) {
    onError?.(new Error("Er is nog geen NVIDIA API key ingesteld. Ga naar Instellingen."));
    return;
  }

  let response;
  try {
    response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: settings.temperature,
        top_p: settings.top_p,
        max_tokens: settings.max_tokens,
        stream: true,
        extra_body: {
          chat_template_kwargs: { enable_thinking: settings.enable_thinking },
          reasoning_budget: settings.reasoning_budget
        }
      })
    });
  } catch (e) {
    onError?.(
      new Error(
        "Kon NVIDIA niet bereiken. Check je internetverbinding. (" + e.message + ")"
      )
    );
    return;
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {}
    onError?.(new Error(`NVIDIA API fout (${response.status}): ${detail.slice(0, 400)}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // NVIDIA stuurt SSE-regels: "data: {...}\n\n", afgesloten met "data: [DONE]"
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;

        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue; // incomplete/ongeldige chunk, kan gebeuren bij streaming
        }

        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.reasoning_content) onChunk?.("reasoning", delta.reasoning_content);
        if (delta.content) onChunk?.("content", delta.content);
      }
    }
    onDone?.();
  } catch (e) {
    onError?.(e);
  }
}
