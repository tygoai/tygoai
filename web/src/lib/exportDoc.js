// -----------------------------------------------------------------------------
// Zet de tekst van een AI-antwoord om naar een downloadbaar Word- (.docx),
// PowerPoint- (.pptx) of Excel-bestand (.xlsx) — feature 17.
//
// Alles gebeurt client-side (in de browser), net als de rest van de app,
// zodat er geen server nodig is. We parsen de markdown-achtige structuur die
// het model normaal al gebruikt (#, ##, koppen, bullets, tabellen met |) en
// zetten die om naar het juiste bestandsformaat.
// -----------------------------------------------------------------------------
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell } from "docx";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Splitst tekst in regels en herkent simpele markdown-structuur. */
function parseLines(text) {
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)[0].length;
      return { type: "heading", level, text: trimmed.replace(/^#+\s/, "") };
    }
    if (/^[-*]\s/.test(trimmed)) {
      return { type: "bullet", text: trimmed.replace(/^[-*]\s/, "") };
    }
    if (/^\|.*\|$/.test(trimmed)) {
      return { type: "table-row", cells: trimmed.split("|").slice(1, -1).map((c) => c.trim()) };
    }
    if (!trimmed) {
      return { type: "empty" };
    }
    return { type: "text", text: trimmed };
  });
}

// --- Word (.docx) ---
export async function exportToDocx(title, content) {
  const lines = parseLines(content);
  const children = [];

  for (const line of lines) {
    if (line.type === "heading") {
      const headingLevel = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][line.level - 1];
      children.push(new Paragraph({ text: line.text, heading: headingLevel }));
    } else if (line.type === "bullet") {
      children.push(new Paragraph({ text: line.text, bullet: { level: 0 } }));
    } else if (line.type === "table-row" || line.type === "empty") {
      // Tabellen en lege regels: simpele platte weergave (geen complexe
      // tabel-rendering om dit beheersbaar te houden).
      if (line.type === "table-row") {
        children.push(new Paragraph({ children: [new TextRun(line.cells.join("   |   "))] }));
      }
    } else {
      children.push(new Paragraph({ children: [new TextRun(line.text)] }));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children: children.length ? children : [new Paragraph("")] }]
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${sanitizeFilename(title)}.docx`);
}

// --- PowerPoint (.pptx) ---
// Strategie: elke ## (heading level 2) of elke grote alinea-blok start een
// nieuwe slide. Simpel maar effectief voor AI-gegenereerde inhoud die al
// goed gestructureerd binnenkomt.
export async function exportToPptx(title, content) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "TYGOAI", width: 10, height: 5.63 });
  pptx.layout = "TYGOAI";

  const lines = parseLines(content);
  let slides = [];
  let current = { title: title, bullets: [] };

  for (const line of lines) {
    if (line.type === "heading" && line.level <= 2) {
      if (current.bullets.length > 0 || slides.length === 0) slides.push(current);
      current = { title: line.text, bullets: [] };
    } else if (line.type === "bullet" || line.type === "text") {
      current.bullets.push(line.text);
    }
  }
  slides.push(current);
  slides = slides.filter((s) => s.bullets.length > 0 || s.title);

  if (slides.length === 0) slides = [{ title, bullets: ["(leeg)"] }];

  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "F6F6F8" };
    slide.addText(s.title, {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: "1D1D1F",
      fontFace: "Helvetica"
    });
    if (s.bullets.length) {
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.6, y: 1.4, w: 8.8, h: 3.8, fontSize: 16, color: "3A3A3C", fontFace: "Helvetica" }
      );
    }
  }

  const blob = await pptx.write({ outputType: "blob" });
  triggerDownload(blob, `${sanitizeFilename(title)}.pptx`);
}

// --- Excel (.xlsx) ---
// Strategie: regels die op een markdown-tabel lijken (|cel|cel|) worden
// daadwerkelijk als rijen/kolommen geplaatst; overige tekst komt in kolom A
// als losse regels. Werkt goed voor AI-antwoorden met tabellen.
export function exportToXlsx(title, content) {
  const lines = parseLines(content);
  const rows = [];

  for (const line of lines) {
    if (line.type === "table-row") {
      // Sla markdown scheidingsregels over (bijv. |---|---|)
      if (line.cells.every((c) => /^:?-+:?$/.test(c))) continue;
      rows.push(line.cells);
    } else if (line.type === "heading") {
      rows.push([line.text]);
    } else if (line.type === "bullet" || line.type === "text") {
      rows.push([line.text]);
    }
  }

  if (rows.length === 0) rows.push(["(leeg)"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Blad1");
  XLSX.writeFile(wb, `${sanitizeFilename(title)}.xlsx`);
}

function sanitizeFilename(name) {
  return (name || "TygoAI-export").replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 60);
}
