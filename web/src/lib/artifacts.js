// -----------------------------------------------------------------------------
// Detecteert ```taal ... ``` codeblokken in de tekst van het model en haalt ze
// eruit als losse "artifacts" (bestanden), zodat ze niet als platte tekst in
// de chatbubble verschijnen maar als een apart bestand-kaartje/paneel.
//
// BELANGRIJK (feature 2 + 3): een codeblok wordt nu OOK herkend zolang het nog
// open is (de afsluitende ``` is nog niet binnengekomen). Zo'n artifact krijgt
// streaming: true. Hierdoor opent het Artifact-paneel al zodra het model begint
// met ```html, ```js, ```tsx etc., en blijft de inhoud live bijgewerkt worden
// terwijl er nog tokens binnenkomen — net zoals tijdens het "doorschrijven"
// totdat de code af is of de tokenlimiet bereikt wordt.
//
// IDs zijn gebaseerd op de positie van het codeblok in de tekst (1e blok,
// 2e blok, ...) zodat ze stabiel blijven tussen renders tijdens streaming.
// Dat voorkomt dat React-componenten steeds opnieuw mounten/flikkeren.
// -----------------------------------------------------------------------------

const LANG_TO_EXT = {
  html: "html",
  htm: "html",
  jsx: "jsx",
  js: "js",
  javascript: "js",
  ts: "ts",
  typescript: "ts",
  tsx: "tsx",
  css: "css",
  python: "py",
  py: "py",
  json: "json",
  md: "md",
  markdown: "md",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  // Pseudo-talen: het model gebruikt deze tags specifiek om aan te geven dat
  // de inhoud bedoeld is als Word/PowerPoint/Excel-document (feature 5/bug 5
  // uit de feedback). De inhoud zelf blijft gewone markdown-achtige tekst;
  // het kaartje toont daarna direct een downloadknop naar het echte
  // bestandsformaat in plaats van ruwe code.
  docx: "docx",
  word: "docx",
  pptx: "pptx",
  powerpoint: "pptx",
  xlsx: "xlsx",
  excel: "xlsx"
};

const LANG_LABEL = {
  html: "HTML",
  jsx: "React (JSX)",
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "React (TSX)",
  css: "CSS",
  py: "Python",
  json: "JSON",
  md: "Markdown",
  docx: "Word-document",
  pptx: "PowerPoint-presentatie",
  xlsx: "Excel-spreadsheet",
  sh: "Shell",
  sql: "SQL",
  yaml: "YAML"
};

/**
 * Haalt codeblokken (``` ... ```) uit de tekst — zowel afgesloten blokken als
 * een eventueel nog open blok aan het eind van de tekst (tijdens streaming).
 *
 * Retourneert { cleanText, artifacts } waarbij cleanText de tekst is met de
 * codeblokken vervangen door een placeholder, en artifacts een array van
 * { id, lang, ext, label, code, title, streaming }.
 *
 * @param {string} text
 * @param {string} [messageKey] - unieke sleutel van het bericht (bijv. message id), gebruikt om artifact-IDs stabiel en uniek per bericht te maken
 */
export function extractArtifacts(text, messageKey = "msg") {
  if (!text) return { cleanText: "", artifacts: [] };

  // Vindt alle ``` markers (zowel openend als sluitend) op volgorde.
  const fenceMarkerRegex = /```([a-zA-Z0-9]*)\n?/g;

  const artifacts = [];
  let cleanText = "";
  let lastIndex = 0;
  let idx = 0;

  // We lopen handmatig door de tekst en houden bij of we "binnen" een
  // codeblok zitten, zodat we ook een niet-afgesloten laatste blok kunnen
  // herkennen.
  const fenceIndices = [];
  let m;
  while ((m = fenceMarkerRegex.exec(text)) !== null) {
    fenceIndices.push({ index: m.index, end: fenceMarkerRegex.lastIndex, lang: (m[1] || "").toLowerCase() });
  }

  let i = 0;
  while (i < fenceIndices.length) {
    const open = fenceIndices[i];
    cleanText += text.slice(lastIndex, open.index);

    const closing = fenceIndices[i + 1];
    const ext = LANG_TO_EXT[open.lang] || (open.lang || "txt");
    const label = LANG_LABEL[ext] || open.lang.toUpperCase() || "Code";
    const id = `${messageKey}-artifact-${idx}`;

    if (closing) {
      // Afgesloten codeblok.
      const code = text.slice(open.end, closing.index).replace(/\n$/, "");
      artifacts.push({
        id,
        lang: open.lang,
        ext,
        label,
        code,
        title: guessTitle(code, ext, label),
        streaming: false
      });
      cleanText += `\n[[ARTIFACT:${id}]]\n`;
      lastIndex = closing.end;
      i += 2;
    } else {
      // Nog open codeblok: alles tot het einde van de tekst is de
      // (nog groeiende) code. Dit is het live-streaming artifact.
      const code = text.slice(open.end);
      artifacts.push({
        id,
        lang: open.lang,
        ext,
        label,
        code,
        title: guessTitle(code, ext, label),
        streaming: true
      });
      cleanText += `\n[[ARTIFACT:${id}]]\n`;
      lastIndex = text.length;
      i += 1;
    }
    idx++;
  }

  cleanText += text.slice(lastIndex);
  return { cleanText, artifacts };
}

function guessTitle(code, ext, label) {
  if (ext === "html") {
    const titleMatch = code.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();
    const h1Match = code.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1].trim();
  }
  return `${label} bestand`;
}

export function isHtmlArtifact(artifact) {
  return artifact.ext === "html";
}

export function isDocumentArtifact(artifact) {
  return artifact.ext === "docx" || artifact.ext === "pptx" || artifact.ext === "xlsx";
}
