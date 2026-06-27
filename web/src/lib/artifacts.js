// -----------------------------------------------------------------------------
// Detecteert ```taal ... ``` codeblokken in de tekst van het model en haalt ze
// eruit als losse "artifacts" (bestanden), zodat ze niet als platte tekst in
// de chatbubble verschijnen maar als een apart bestand-kaartje (zoals Claude
// Artifacts). De rest van de tekst blijft normale markdown.
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
  yml: "yaml"
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
  sh: "Shell",
  sql: "SQL",
  yaml: "YAML"
};

let counter = 0;

/**
 * Haalt volledige codeblokken (``` ... ```) uit de tekst.
 * Retourneert { cleanText, artifacts } waarbij cleanText de tekst is met de
 * codeblokken vervangen door een placeholder, en artifacts een array van
 * { id, lang, ext, label, code, title }.
 *
 * Werkt ook met streaming tekst: een nog niet afgesloten codeblok aan het
 * einde van de tekst wordt NIET als artifact geëxtraheerd totdat het sluit,
 * zodat er geen halve/flikkerende artifacts ontstaan tijdens het typen.
 */
export function extractArtifacts(text, existingArtifacts = []) {
  if (!text) return { cleanText: "", artifacts: [] };

  const fenceRegex = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
  const artifacts = [];
  let cleanText = "";
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = fenceRegex.exec(text)) !== null) {
    cleanText += text.slice(lastIndex, match.index);
    const rawLang = (match[1] || "").toLowerCase();
    const code = match[2];
    const ext = LANG_TO_EXT[rawLang] || (rawLang || "txt");
    const label = LANG_LABEL[ext] || rawLang.toUpperCase() || "Code";

    const existing = existingArtifacts[idx];
    const id = existing?.id || `artifact-${++counter}`;

    artifacts.push({
      id,
      lang: rawLang,
      ext,
      label,
      code,
      title: guessTitle(code, ext, label)
    });

    cleanText += `\n[[ARTIFACT:${id}]]\n`;
    lastIndex = fenceRegex.lastIndex;
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
