// -----------------------------------------------------------------------------
// Automatische detectie van het benodigde reasoning-budget per vraag.
//
// Doel: geen vaste slider meer die de gebruiker zelf moet instellen. In plaats
// daarvan kijken we naar de vraag zelf (lengte, taalgebruik, sleutelwoorden)
// en kiezen we een passend budget — net zoals een mens bij "hallo" niet
// uitgebreid gaat nadenken, maar bij "bouw een complete website" wel.
//
// Dit is een lichte heuristiek (geen extra API-call, dus geen extra latency
// of kosten). Ze hoeft niet perfect te zijn: het doel is vooral dat simpele
// berichten NOOIT een hoog budget krijgen (dat was het probleem dat Tygo
// rapporteerde — "hallo" gaf alsnog lang nadenken).
// -----------------------------------------------------------------------------

// Drie niveaus. De getallen zijn ruim binnen wat het model ondersteunt
// (max reasoning_budget bij dit model ligt rond de 16k, max_tokens rond 64k).
export const BUDGET_LEVELS = {
  laag: { reasoning_budget: 0, enable_thinking: false, max_tokens: 2048 },
  midden: { reasoning_budget: 2048, enable_thinking: true, max_tokens: 4096 },
  hoog: { reasoning_budget: 8192, enable_thinking: true, max_tokens: 16384 }
};

// Korte, veelvoorkomende begroetingen/triviale uitingen: altijd "laag",
// ongeacht eventuele toevallige trefwoorden.
const GREETING_RE =
  /^(hoi|hallo|hey|hi|yo|goedemorgen|goedemiddag|goedenavond|dankje|dank je|bedankt|thanks|thank you|ok|oke|oké|prima|top|nice|cool|leuk)[\s!.,?]*$/i;

// Sleutelwoorden die wijzen op een zware/complexe taak (hoog budget).
// Twee groepen, bewust anders begrensd:
//  - STRICT: woorden die alleen als heel woord mogen matchen (anders valse
//    positieven zoals "app" in "appeltaart" of "api" in "rapid").
//  - STEM: Nederlandse stammen die we willen matchen ook met verbuigingen
//    (bijv. "complex" in "complexe", "redeneer" in "redeneervraag") — deze
//    hebben dus geen afsluitende \b.
const HIGH_EFFORT_STRICT_RE =
  /\b(bouw|website|webapp|web app|applicatie|app|architectuur|algoritme|refactor|debug|optimaliseer|implementeer|ontwerp|database|api|backend|frontend|component|programmeer|class|recursie|bewijs|wiskundig|analyseer|strategie|architecture|implement|algorithm|design a|build a|python|javascript|typescript|react|java|c\+\+|rust|golang|php|ruby|sql)\b/i;

const HIGH_EFFORT_STEM_RE =
  /(complex|redeneer|maak een (complete|volledige)|schrijf.*(script|programma|functie|class|klasse)|vergelijk uitgebreid|stap voor stap|function that|write (a|the) (script|program|code|function)|create a (website|app|application))/i;

function matchesHighEffort(text) {
  return HIGH_EFFORT_STRICT_RE.test(text) || HIGH_EFFORT_STEM_RE.test(text);
}

// Sleutelwoorden die wijzen op een korte feitelijke vraag (laag budget),
// zelfs als de zin iets langer is.
const LOW_EFFORT_RE =
  /^(wat is|wat zijn|wie is|wie was|wanneer is|hoe laat|hoeveel is|hoeveel kost|wat betekent|geef (de|een) (definitie|vertaling)|vertaal|spel(l|)\s|hoe spel)/i;

// Code-aanwijzingen: fenced code blocks, bestandsnamen met extensie, of
// veelgebruikte technische termen duiden vaak op een zwaardere taak.
const CODE_HINT_RE = /```|\.(js|jsx|ts|tsx|py|html|css|json|sql)\b/i;

/**
 * Bepaalt het budgetniveau voor een nieuw gebruikersbericht.
 * @param {string} text - de tekst die de gebruiker net heeft gestuurd
 * @param {object[]} [history] - eerdere berichten in de chat (optioneel, voor context)
 * @returns {{ level: "laag"|"midden"|"hoog", reasoning_budget: number, enable_thinking: boolean, max_tokens: number }}
 */
export function detectBudget(text, history = []) {
  const trimmed = (text || "").trim();

  if (!trimmed) {
    return { level: "laag", ...BUDGET_LEVELS.laag };
  }

  if (GREETING_RE.test(trimmed)) {
    return { level: "laag", ...BUDGET_LEVELS.laag };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const hasCodeHint = CODE_HINT_RE.test(trimmed);
  const hasHighEffortHint = matchesHighEffort(trimmed);
  const hasLowEffortHint = LOW_EFFORT_RE.test(trimmed) && !hasCodeHint && !hasHighEffortHint;

  // Simpele feitelijke vraag ("wat is 2+2?", "wie was Einstein?")
  if (hasLowEffortHint && wordCount <= 20) {
    return { level: "laag", ...BUDGET_LEVELS.laag };
  }

  // Heel korte berichten zonder duidelijke complexiteit-signalen: laag.
  if (wordCount <= 6 && !hasCodeHint && !hasHighEffortHint) {
    return { level: "laag", ...BUDGET_LEVELS.laag };
  }

  // Duidelijke zware taak: code, bouwen, ontwerpen, analyseren.
  if (hasCodeHint || hasHighEffortHint || wordCount >= 80) {
    return { level: "hoog", ...BUDGET_LEVELS.hoog };
  }

  // Alles daartussenin (normale vragen, korte uitleg, etc.) krijgt een
  // gematigd budget: snel genoeg, maar ruimte om even na te denken.
  return { level: "midden", ...BUDGET_LEVELS.midden };
}

/** Mens-leesbare labels, voor gebruik in de UI (bijv. een klein indicatortje). */
export const BUDGET_LABELS = {
  laag: "Snel",
  midden: "Gebalanceerd",
  hoog: "Diep nadenken"
};
