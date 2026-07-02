// -----------------------------------------------------------------------------
// Kern van de AI-communicatie: bouwt de prompt op, streamt het antwoord live
// terug, en handelt fouten en reconnects af.
//
// De belangrijkste verbeteringen in deze versie (chatkwaliteit):
//
// 1. SLIMME HISTORY-TRIMMING
//    Afbeeldingen als base64 zijn gigantisch (~200-500KB per stuk). Als we
//    de volledige chatgeschiedenis meesturen, stuurt het 5e bericht alle
//    eerdere afbeeldingen 5× — dat vult het contextvenster van het model en
//    veroorzaakt zowel de DEGRADED 400-fout als het "haalt vragen door
//    elkaar"-gedrag. Fix: afbeeldingen worden ALLEEN meegestuurd in het
//    bericht waar ze origineel bij hoorden, en alleen als dat bericht de
//    LAATSTE keer was dat de gebruiker een afbeelding stuurde. Oudere
//    image-berichten krijgen alleen nog hun tekst-samenvatting.
//
// 2. CONTEXT-WINDOW MANAGEMENT
//    De history wordt getrimd tot een maximum aantal tekens (totale
//    prompt-grootte), met behoud van het allereerste bericht (context) en
//    alle recente berichten. Oudere middenberichten worden samengevat of
//    weggelaten als het te lang wordt.
//
// 3. BETERE RETRY BIJ NVIDIA DEGRADED/400/503
//    De 400 DEGRADED-fout betekent dat NVIDIA's model tijdelijk overbelast
//    is — dit is géén code-fout maar een server-side probleem. We proberen
//    automatisch opnieuw (tot 4×) met exponential backoff (2s, 4s, 8s, 16s),
//    en tonen een duidelijke voortgangsindicator.
//
// 4. LATESTUSERTTEXT FIX
//    Bij vision-berichten (content is een array) haalde de budget-detectie
//    de tekst niet goed op — nu correct voor beide formaten.
// -----------------------------------------------------------------------------
import { getNvidiaSettings } from "./settings.js";
import { detectBudget, BUDGET_LEVELS } from "./autoBudget.js";

const WORKER_URL = "https://tygoai-proxy.tygoai.workers.dev";

// Maximale geschatte prompt-grootte in tekens die we naar het model sturen.
// Ruim binnen Nemotron's contextvenster (~128k tokens ≈ ~500k tekens),
// maar conservatief genoeg om DEGRADED-fouten door te-grote requests te
// voorkomen. Afbeeldingen tellen zwaar mee.
const MAX_HISTORY_CHARS = 40000;

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "Je bent TygoAI, een persoonlijke AI-assistent gebouwd voor en door Tygo. " +
    "Je spreekt altijd Nederlands, tenzij de gebruiker expliciet om een andere taal vraagt. " +
    "Je bent behulpzaam, direct, nauwkeurig en duidelijk. " +

    "ANTWOORDEN:\n" +
    "- Geef altijd een volledig en concreet antwoord. Nooit half-werk of 'zie mijn denkproces'.\n" +
    "- Je definitieve antwoord staat ALTIJD in je gewone antwoord (content), nooit alleen in je denkproces.\n" +
    "- Bij korte vragen: kort antwoorden. Bij complexe opdrachten: volledig en gestructureerd.\n" +

    "CODE:\n" +
    "- Schrijf altijd complete, werkende code — nooit placeholders zoals '// rest van code hier'.\n" +
    "- Gebruik altijd de juiste taal-tag: ```html, ```js, ```ts, ```tsx, ```py, ```css etc.\n" +
    "- Bij een bug of foutmelding: leg uit wat er mis is, waarom, en geef de volledige gecorrigeerde code.\n" +

    "BESTANDEN:\n" +
    "- Als de gebruiker een Word-document vraagt: gebruik ```docx als taal-tag, markdown erbinnen.\n" +
    "- Voor PowerPoint: ```pptx. Voor Excel: ```xlsx.\n" +
    "- Gebruik ## voor dia-titels, - voor bullets, |cel|cel| voor tabelrijen.\n" +

    "AFBEELDINGEN:\n" +
    "- Als de gebruiker een afbeelding stuurt, analyseer die zorgvuldig voordat je antwoordt.\n" +
    "- Beschrijf wat je ziet, beantwoord de vraag over de afbeelding volledig.\n" +
    "- Als een latere vraag geen afbeelding bevat, focus dan op die nieuwe vraag " +
    "  tenzij de gebruiker expliciet naar de afbeelding verwijst."
};

// ---------------------------------------------------------------------------
// History-trimming: voorkomt dat de context te groot wordt en dat afbeeldingen
// meerdere keren worden meegestuurd.
// ---------------------------------------------------------------------------

/**
 * Zet een bericht-content (string of vision-array) om naar een platte string
 * voor het berekenen van de lengte en voor samenvatting.
 */
function contentToString(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text")
      .map((p) => p.text || "")
      .join(" ");
  }
  return "";
}

/**
 * Geeft de tekst-inhoud van het laatste user-bericht terug als string,
 * ook als het een vision-bericht is (content = array).
 */
function getLatestUserText(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  return contentToString(lastUser.content);
}

/**
 * Bouwt de getrimde berichtenlijst voor het model:
 * - Afbeeldingen alleen in het meest recente bericht dat ze bevat
 * - Totale omvang begrensd tot MAX_HISTORY_CHARS
 * - Altijd het eerste en alle recente berichten behouden
 */
function trimHistory(messages) {
  if (!messages.length) return [];

  // Stap 1: verwijder afbeeldingen uit alle berichten BEHALVE het laatste
  // bericht dat een afbeelding bevat. Dit voorkomt dat elke volgende bericht
  // alle vorige afbeeldingen opnieuw meestuurt.
  let lastImageIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")) {
      lastImageIdx = i;
      break;
    }
  }

  const stripped = messages.map((m, i) => {
    if (i === lastImageIdx) return m; // bewaar afbeelding alleen in het laatste relevante bericht
    if (Array.isArray(m.content)) {
      // Haal image_url-delen eruit, bewaar alleen tekst
      const textOnly = m.content.filter((p) => p.type === "text");
      if (textOnly.length === 0) return null; // bericht was puur een afbeelding zonder tekst → weglaten
      return { ...m, content: textOnly.length === 1 ? textOnly[0].text : textOnly };
    }
    return m;
  }).filter(Boolean);

  // Stap 2: trim op totale grootte. Bewaar altijd het eerste bericht en alle
  // recente berichten; gooi oudere middenberichten weg als het te lang wordt.
  let totalChars = stripped.reduce((sum, m) => sum + contentToString(m.content).length, 0);

  if (totalChars <= MAX_HISTORY_CHARS) return stripped;

  // Bewaar altijd het eerste bericht (geeft context over het gesprek) en werk
  // van achteren naar voren om de meest recente berichten te bewaren.
  const first = stripped[0];
  const rest = stripped.slice(1);
  const kept = [];
  let chars = contentToString(first.content).length;

  for (let i = rest.length - 1; i >= 0; i--) {
    const len = contentToString(rest[i].content).length;
    if (chars + len > MAX_HISTORY_CHARS) break;
    kept.unshift(rest[i]);
    chars += len;
  }

  return [first, ...kept];
}

// ---------------------------------------------------------------------------
// Budget-detectie
// ---------------------------------------------------------------------------
function resolveBudgetParams(settings, latestUserText) {
  const mode = settings.budget_mode || "auto";
  if (mode === "snel") return { level: "laag", ...BUDGET_LEVELS.laag };
  if (mode === "slim") return { level: "hoog", ...BUDGET_LEVELS.hoog };
  return detectBudget(latestUserText);
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * Streamt een chatcompletion.
 *
 * @param {Array} messages - volledige berichtenhistorie (zonder systeemprompt)
 * @param {object} callbacks
 * @param {AbortSignal} [externalSignal]
 * @returns {{ abort: () => void }}
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
  controller.signal.addEventListener("abort", () => { stoppedByUser = true; });

  // Retry-strategie: meer pogingen en langere wachttijden dan voorheen,
  // specifiek voor NVIDIA DEGRADED 400/503-fouten die tijdelijk zijn.
  const MAX_ATTEMPTS = 4;
  const RETRY_DELAYS = [2000, 4000, 8000, 16000]; // exponential backoff

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

    const latestUserText = getLatestUserText(messages);
    const budget = resolveBudgetParams(settings, latestUserText);

    // Trim de history vóór het samenstellen van de prompt
    const trimmedMessages = trimHistory(messages);
    const fullMessages = [SYSTEM_PROMPT, ...trimmedMessages];

    const body = {
      model: settings.model,
      messages: fullMessages,
      temperature: settings.temperature,
      top_p: settings.top_p,
      max_tokens: budget.max_tokens,
      stream: true,
      stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: budget.enable_thinking },
      reasoning_budget: budget.reasoning_budget
    };

    let attempt = 0;
    let everReceivedData = false;

    while (true) {
      if (attempt >= MAX_ATTEMPTS) {
        onError?.(new Error(
          `NVIDIA's model is momenteel overbelast en antwoordt niet na ${MAX_ATTEMPTS} pogingen. ` +
          "Wacht even en probeer het opnieuw."
        ));
        return;
      }

      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] || 16000;
        onReconnecting?.({ attempt, max: MAX_ATTEMPTS, delayMs: delay });
        await wait(delay);
        if (stoppedByUser) { onDone?.({ stopped: true }); return; }
      }

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
          try { detail = await response.text(); } catch { /* negeren */ }

          // NVIDIA DEGRADED (400) en overbelasting (503) zijn tijdelijk:
          // altijd opnieuw proberen. Andere 4xx-fouten (401 unauthorized,
          // 422 invalid request) zijn permanent: direct stoppen.
          const status = response.status;
          const isDegraded = status === 503 ||
            (status === 400 && detail.includes("DEGRADED"));
          const isRetryable = isDegraded || status === 429 || status >= 500;

          if (!isRetryable) {
            const msg = status === 401
              ? "NVIDIA API key is ongeldig of verlopen. Ga naar Instellingen."
              : `Fout van NVIDIA (${status}): ${detail.slice(0, 200)}`;
            onError?.(new Error(msg));
            return;
          }

          attempt++;
          continue; // retry
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
        if (stoppedByUser || e.name === "AbortError") {
          onDone?.({ stopped: true });
          return;
        }
        // Netwerk-/timeout-fout: retry
        attempt++;
        if (attempt >= MAX_ATTEMPTS) {
          onError?.(new Error(
            (everReceivedData ? "Verbinding verbroken. " : "Kon NVIDIA niet bereiken. ") +
            "Controleer je internetverbinding en probeer het opnieuw."
          ));
          return;
        }
      }
    }
  })();

  return { abort: () => controller.abort() };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consumeStream(bodyStream, signal, { onChunk, onUsage }) {
  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal.aborted) {
      try { await reader.cancel(); } catch { /* negeren */ }
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
      try { json = JSON.parse(payload); } catch { continue; }

      if (json.usage) {
        onUsage?.({
          promptTokens: json.usage.prompt_tokens ?? 0,
          completionTokens: json.usage.completion_tokens ?? 0,
          totalTokens: json.usage.total_tokens ?? 0
        });
      }

      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;

      // Defensief: check beide veldnamen (NVIDIA's documentatie is inconsistent)
      const reasoningText = delta.reasoning ?? delta.reasoning_content;
      if (reasoningText) onChunk?.("reasoning", reasoningText);
      if (delta.content) onChunk?.("content", delta.content);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-titel generatie (na eerste bericht)
// ---------------------------------------------------------------------------
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
              "Antwoord ALLEEN met de titel zelf, zonder aanhalingstekens, uitleg of punt."
          },
          {
            role: "user",
            content: `Vraag: ${userText}\n\nAntwoord (samengevat): ${(assistantText || "").slice(0, 300)}`
          }
        ],
        max_tokens: 20,
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

// ---------------------------------------------------------------------------
// Resume: "Doorgaan met dit bericht"
// ---------------------------------------------------------------------------
export function buildResumeMessages(history, partialAssistantText) {
  return [
    ...history,
    { role: "assistant", content: partialAssistantText },
    {
      role: "user",
      content:
        "Ga verder exact waar je gebleven was. Herhaal niets van wat je al had geschreven " +
        "en begin niet opnieuw. Vul alleen de rest aan, alsof je nooit was gestopt. " +
        "Als je midden in een codeblok was gestopt, ga dan verder binnen datzelfde blok."
    }
  ];
}
