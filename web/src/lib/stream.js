import { getNvidiaSettings } from "./settings.js";

const WORKER_URL = "https://tygoai-proxy.tygoai.workers.dev";

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

  if (!WORKER_URL || WORKER_URL.startsWith("VUL_IN")) {
    onError?.(new Error("De Cloudflare Worker URL is nog niet ingesteld in lib/stream.js."));
    return;
  }

  let response;
  try {
    response = await fetch(WORKER_URL, {
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
    onError?.(new Error("Kon de Worker niet bereiken. (" + e.message + ")"));
    return;
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {}
    onError?.(new Error(`Fout (${response.status}): ${detail.slice(0, 400)}`));
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
          continue;
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
