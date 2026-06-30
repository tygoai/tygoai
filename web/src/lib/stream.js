// -----------------------------------------------------------------------------
// Praat met de Cloudflare Worker (die op zijn beurt naar NVIDIA proxyt) en
// streamt het antwoord live terug.
//
// Nieuw in deze versie:
//  - Vaste Nederlandse systeemprompt met TygoAI-identiteit (feature 6)
//  - Stoppen via AbortController, zonder dat al gegenereerde tekst verloren
//    gaat (features 4 + 8)
//  - "Doorgaan met dit bericht": kan vanaf bestaande tekst verder streamen
//    zonder dat het al geschreven stuk opnieuw verstuurd of gedupliceerd
//    wordt (feature 5)
//  - Automatisch opnieuw verbinden bij een netwerk-/Worker-hapering tijdens
//    het streamen, met behoud van wat er al binnen was (feature 9)
//  - Live token-usage updates tijdens het streamen (feature 7)
// -----------------------------------------------------------------------------
import { getNvidiaSettings } from "./settings.js";
import { detectBudget, BUDGET_LEVELS } from "./autoBudget.js";

const WORKER_URL = "https://tygoai-proxy.tygoai.workers.dev";

// Vaste systeemprompt: TygoAI's identiteit. Wordt bij elk verzoek als eerste
// bericht meegestuurd, zodat het model nooit "vergeet" wie het is of ineens
// in een andere taal antwoordt.
const SYSTEM_PROMPT = {
  role: "system",
  content:
    "Je bent TygoAI, een persoonlijke AI-assistent gebouwd voor en door Tygo. " +
    "Je spreekt altijd Nederlands, ongeacht de taal van eerdere berichten in het gesprek, " +
    "tenzij er expliciet om een andere taal wordt gevraagd (bijvoorbeeld 'antwoord in het Engels'). " +
    "Je identiteit als TygoAI blijft te allen tijde gelijk: je wisselt niet plotseling van naam, " +
    "persoonlijkheid of taal halverwege een gesprek. Je bent behulpzaam, direct en duidelijk. " +
    "Bij programmeervragen schrijf je complete, werkende code in codeblokken met de juiste taal-tag " +
    "(bijv. ```html, ```js, ```tsx) zodat deze automatisch als artifact getoond kan worden."
};

/**
 * Bepaalt de modelparameters (reasoning budget, max tokens, thinking aan/uit)
 * op basis van de gekozen budget_mode en (bij "auto") de inhoud van het
 * laatste gebruikersbericht.
 */
function resolveBudgetParams(settings, latestUserText) {
  const mode = settings.budget_mode || "auto";

  if (mode === "snel") {
    return { level: "laag", ...BUDGET_LEVELS.laag };
  }
  if (mode === "slim") {
    return { level: "hoog", ...BUDGET_LEVELS.hoog };
  }
  // "auto" (standaard): automatische detectie per vraag.
  return detectBudget(latestUserText);
}

/**
 * Streamt een chatcompletion.
 *
 * @param {Array<{role:string, content:string}>} messages - volledige berichtenhistorie (zonder systeemprompt; die wordt hier toegevoegd)
 * @param {object} callbacks
 * @param {(type: "reasoning"|"content", text: string) => void} callbacks.onChunk
 * @param {(usage: {promptTokens:number, completionTokens:number, totalTokens:number}) => void} [callbacks.onUsage] - live token-usage updates
 * @param {(info?: {stopped?: boolean}) => void} callbacks.onDone - aangeroepen wanneer de stream normaal afrondt of gestopt is
 * @param {(err: Error) => void} callbacks.onError - aangeroepen bij een onherstelbare fout
 * @param {(info: {attempt:number, max:number}) => void} [callbacks.onReconnecting] - aangeroepen tijdens een auto-reconnect poging
 * @param {AbortSignal} [externalSignal] - optioneel: signal van buitenaf (bijv. gekoppeld aan de Stop-knop)
 * @returns {{ abort: () => void }} - controller om de stream handmatig te stoppen
 */
export function streamChat(
  messages,
  { onChunk, onUsage, onDone, onError, onReconnecting } = {},
  externalSignal
) {
  const controller = new AbortController();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort());
  }

  let stoppedByUser = false;
  controller.signal.addEventListener("abort", () => {
    stoppedByUser = true;
  });

  const MAX_RECONNECT_ATTEMPTS = 3;

  (async () => {
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

    const latestUserText = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const budget = resolveBudgetParams(settings, latestUserText);

    const fullMessages = [SYSTEM_PROMPT, ...messages];

    // BELANGRIJK: extra_body is een conventie van de OpenAI Python/Node SDK
    // -- die SDK's "pakken" de inhoud van extra_body uit en plakken die plat
    // in de root van de JSON-payload voordat ze die versturen. Omdat wij hier
    // een rauwe fetch() doen (geen SDK), moeten chat_template_kwargs en
    // reasoning_budget dus AL in de root van de body staan, niet genest onder
    // een "extra_body"-sleutel — die sleutel zelf herkent NVIDIA's server niet.
    const body = {
      model: settings.model,
      messages: fullMessages,
      temperature: settings.temperature,
      top_p: settings.top_p,
      max_tokens: budget.max_tokens,
      stream: true,
      // We willen ALTIJD de token-usage in de laatste SSE-chunk terugkrijgen,
      // zodat de live token-tracker (feature 7) bijgewerkt kan worden.
      stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: budget.enable_thinking },
      reasoning_budget: budget.reasoning_budget
    };

    let attempt = 0;
    let everReceivedData = false;

    while (true) {
      try {
        const response = await fetch(WORKER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          let detail = "";
          try {
            detail = await response.text();
          } catch {
            /* negeren */
          }
          throw new RetryableError(`Fout (${response.status}): ${detail.slice(0, 400)}`);
        }

        await consumeStream(response.body, controller.signal, {
          onChunk: (type, text) => {
            everReceivedData = true;
            onChunk?.(type, text);
          },
          onUsage
        });

        onDone?.();
        return;
      } catch (e) {
        if (stoppedByUser) {
          // Bewust door de gebruiker gestopt: dit is geen fout, gewoon klaar.
          onDone?.({ stopped: true });
          return;
        }

        if (e.name === "AbortError") {
          onDone?.({ stopped: true });
          return;
        }

        attempt++;
        const isNetworkish = e instanceof RetryableError || e instanceof TypeError;
        if (isNetworkish && attempt <= MAX_RECONNECT_ATTEMPTS) {
          onReconnecting?.({ attempt, max: MAX_RECONNECT_ATTEMPTS });
          await wait(Math.min(1000 * attempt, 4000));
          continue;
        }

        const prefix = everReceivedData
          ? "Verbinding verbroken tijdens het antwoord. "
          : "Kon de Worker niet bereiken. ";
        onError?.(new Error(prefix + e.message));
        return;
      }
    }
  })();

  return { abort: () => controller.abort() };
}

/**
 * Genereert een korte, pakkende chattitel op basis van het eerste
 * vraag/antwoord-paar (feature 14). Lichte, niet-streamende call met laag
 * budget — dit hoeft niet snel te zijn, het gebeurt op de achtergrond nadat
 * het eerste antwoord al binnen is.
 */
export async function generateChatTitle(userText, assistantText) {
  try {
    const settings = await getNvidiaSettings();
    if (!settings.apiKey) return null;

    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "system",
            content:
              "Genereer een titel van maximaal 5 woorden in het Nederlands die dit gesprek samenvat. " +
              "Antwoord ALLEEN met de titel zelf, zonder aanhalingstekens, zonder uitleg, zonder punt aan het einde."
          },
          { role: "user", content: `Vraag: ${userText}\n\nAntwoord (samengevat): ${(assistantText || "").slice(0, 400)}` }
        ],
        max_tokens: 30,
        chat_template_kwargs: { enable_thinking: false },
        stream: false
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const title = data?.choices?.[0]?.message?.content?.trim();
    if (!title) return null;
    return title.replace(/^["']|["']$/g, "").slice(0, 60);
  } catch {
    return null;
  }
}

class RetryableError extends Error {}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consumeStream(bodyStream, signal, { onChunk, onUsage }) {
  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* negeren */
      }
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }

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

      if (json.usage) {
        onUsage?.({
          promptTokens: json.usage.prompt_tokens ?? 0,
          completionTokens: json.usage.completion_tokens ?? 0,
          totalTokens: json.usage.total_tokens ?? 0
        });
      }

      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      // NVIDIA's eigen documentatie is hier niet helemaal consistent: de
      // officiële streaming-voorbeeldcode voor dit model gebruikt
      // delta.reasoning, terwijl andere voorbeelden (niet-streaming)
      // message.reasoning_content tonen. We checken daarom defensief op
      // beide veldnamen, zodat reasoning-tokens er in geen van de twee
      // gevallen stilletjes doorheen glippen.
      const reasoningText = delta.reasoning ?? delta.reasoning_content;
      if (reasoningText) onChunk?.("reasoning", reasoningText);
      if (delta.content) onChunk?.("content", delta.content);
    }
  }
}

/**
 * Bouwt de berichtenhistorie voor een "doorgaan met dit bericht"-verzoek.
 * We sturen de oorspronkelijke geschiedenis + een instructie om het
 * eerder gegenereerde (afgebroken) antwoord exact te vervolgen, zonder het
 * al geschreven stuk te herhalen.
 *
 * @param {Array<{role:string, content:string}>} history - berichten t/m de laatste user-vraag
 * @param {string} partialAssistantText - de tekst die het model al had geschreven voor het stoppen
 * @returns {Array<{role:string, content:string}>}
 */
export function buildResumeMessages(history, partialAssistantText) {
  return [
    ...history,
    { role: "assistant", content: partialAssistantText },
    {
      role: "user",
      content:
        "Ga verder exact waar je gebleven was. Herhaal niets van wat je al had geschreven " +
        "(zie jouw vorige bericht hierboven) en begin niet opnieuw. Vul alleen de rest aan, " +
        "alsof je nooit was gestopt. Als je midden in een codeblok was gestopt, ga dan verder " +
        "binnen datzelfde codeblok zonder een nieuw codeblok te openen."
    }
  ];
}
