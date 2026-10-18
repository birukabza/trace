import PDFDocument from "pdfkit";
import type { Run } from "../types";
import { markdownReport } from "./reports";

// Renders the evidence report as a PDF. The Markdown report stays the single
// source of content; this module only lays it out.

const INK = "#161616";
const MUTED = "#6b6b6b";
const ACCENT = "#2f6f4f";
const RULE = "#d9d9d9";
const CODE_BG = "#f4f4f2";
const MARGIN = 56;

// The built-in PDF fonts only cover Windows-1252. Map common scientific
// symbols to readable text and replace anything else that cannot render.
const SYMBOLS: Record<string, string> = {
  "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta", "η": "eta", "θ": "theta", "λ": "lambda", "μ": "mu",
  "ν": "nu", "π": "pi", "ρ": "rho", "σ": "sigma", "τ": "tau", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega", "Δ": "Delta", "Σ": "Sigma",
  "Ω": "Omega", "∇": "grad", "−": "-", "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~", "→": "->", "←": "<-", "⇒": "=>", "∞": "inf", "√": "sqrt",
  "∑": "sum", "∏": "prod", "∈": "in", "∂": "d", "⋅": "·", "✓": "ok", "✗": "x", "❯": ">",
};
// Subscripts and superscripts outside Latin-1, written the way code would.
for (const [index, digit] of [..."₀₁₂₃₄₅₆₇₈₉"].entries()) SYMBOLS[digit] = `_${index}`;
for (const [digit, value] of [["⁰", "0"], ["⁴", "4"], ["⁵", "5"], ["⁶", "6"], ["⁷", "7"], ["⁸", "8"], ["⁹", "9"], ["ᵗ", "t"], ["ⁿ", "n"], ["ⁱ", "i"], ["ᵀ", "T"], ["⁻", "-"], ["⁺", "+"]]) SYMBOLS[digit] = `^${value}`;
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

export function pdfSafe(text: string): string {
  let output = "";
  for (const character of text.normalize("NFC")) {
    const code = character.codePointAt(0)!;
    if (code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.has(character)) output += character;
    else output += SYMBOLS[character] ?? "?";
  }
  return output;
}

/** Removes Markdown escaping added by the report builder. */
function plain(text: string) {
  return pdfSafe(text.replace(/\\([\\`*_{}\[\]()#+.!|<>~-])/g, "$1"));
}

type Block =
  | { kind: "title" | "section" | "subsection" | "paragraph" | "bullet"; text: string }
  | { kind: "code"; text: string }
  | { kind: "table"; rows: string[][] };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = line.match(/^(`{3,})/);
    if (fence) {
      const body: string[] = [];
      index++;
      while (index < lines.length && lines[index] !== fence[1]) body.push(lines[index++]);
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        const cells = lines[index].replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(cell => plain(cell.trim()));
        if (!cells.every(cell => /^-+$/.test(cell))) rows.push(cells);
        index++;
      }
      index--;
      blocks.push({ kind: "table", rows });
      continue;
    }
    if (!line.trim()) continue;
    if (line.startsWith("### ")) blocks.push({ kind: "subsection", text: plain(line.slice(4)) });
    else if (line.startsWith("## ")) blocks.push({ kind: "section", text: plain(line.slice(3)) });
    else if (line.startsWith("# ")) blocks.push({ kind: "title", text: plain(line.slice(2)) });
    else if (line.startsWith("- ")) blocks.push({ kind: "bullet", text: plain(line.slice(2)) });
    else blocks.push({ kind: "paragraph", text: plain(line) });
  }
  return blocks;
}

export function pdfReport(run: Run): Promise<Uint8Array<ArrayBuffer>> {
  const document = new PDFDocument({ size: "A4", margins: { top: MARGIN + 10, bottom: MARGIN, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: pdfSafe(`Trace evidence report: ${run.title}`), Author: "Trace", Subject: "Research verification evidence report" } });
  const chunks: Uint8Array[] = [];
  const done = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    document.on("data", chunk => chunks.push(chunk));
    document.on("end", () => { const bytes = Buffer.concat(chunks); resolve(new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)); });
    document.on("error", reject);
  });

  const width = document.page.width - MARGIN * 2;
  const bottom = () => document.page.height - MARGIN;
  const ensure = (height: number) => { if (document.y + height > bottom()) document.addPage(); };

  // Cover band
  document.rect(0, 0, document.page.width, 6).fill(ACCENT);
  document.font("Helvetica-Bold").fontSize(9).fillColor(ACCENT).text("TRACE  ·  EVIDENCE REPORT", MARGIN, MARGIN - 18, { characterSpacing: 1.2 });
  document.moveDown(1.2);

  for (const block of parse(markdownReport(run))) {
    switch (block.kind) {
      case "title":
        document.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(block.text, MARGIN, document.y, { width });
        document.moveDown(0.6);
        break;
      case "section":
        ensure(60);
        document.moveDown(0.8);
        document.moveTo(MARGIN, document.y).lineTo(MARGIN + width, document.y).lineWidth(0.6).strokeColor(RULE).stroke();
        document.moveDown(0.6);
        document.font("Helvetica-Bold").fontSize(13).fillColor(ACCENT).text(block.text, MARGIN, document.y, { width });
        document.moveDown(0.4);
        break;
      case "subsection":
        ensure(40);
        document.moveDown(0.4);
        document.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(block.text, MARGIN, document.y, { width });
        document.moveDown(0.3);
        break;
      case "bullet":
        ensure(16);
        document.font("Helvetica").fontSize(9.5).fillColor(INK).text(`•  ${block.text}`, MARGIN + 8, document.y, { width: width - 8, lineGap: 2 });
        document.moveDown(0.2);
        break;
      case "paragraph":
        ensure(16);
        document.font("Helvetica").fontSize(9.5).fillColor(INK).text(block.text, MARGIN, document.y, { width, lineGap: 2 });
        document.moveDown(0.45);
        break;
      case "code": {
        const lines = pdfSafe(block.text || " ").split("\n");
        document.font("Courier").fontSize(7.8);
        const lineHeight = document.currentLineHeight(true) + 1;
        let start = 0;
        // Draw code in page-sized chunks so long programs break cleanly.
        while (start < lines.length) {
          ensure(lineHeight * 2 + 12);
          const fits = Math.max(1, Math.floor((bottom() - document.y - 12) / lineHeight));
          const chunk = lines.slice(start, start + fits);
          const text = chunk.join("\n");
          const height = document.heightOfString(text, { width: width - 16, lineGap: 1 }) + 12;
          const top = document.y;
          document.rect(MARGIN, top, width, Math.min(height, bottom() - top)).fill(CODE_BG);
          document.fillColor("#2b2b2b").font("Courier").fontSize(7.8).text(text, MARGIN + 8, top + 6, { width: width - 16, lineGap: 1 });
          document.y = Math.min(top + height, bottom());
          start += chunk.length;
          if (start < lines.length) document.addPage();
        }
        document.moveDown(0.6);
        break;
      }
      case "table": {
        const columns = Math.max(...block.rows.map(row => row.length));
        const columnWidth = width / columns;
        block.rows.forEach((row, rowIndex) => {
          document.font(rowIndex === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
          const height = Math.max(...row.map(cell => document.heightOfString(cell || " ", { width: columnWidth - 10 }))) + 8;
          ensure(height);
          const top = document.y;
          if (rowIndex === 0) document.rect(MARGIN, top, width, height).fill("#eef3ef");
          row.forEach((cell, column) => document.fillColor(INK).font(rowIndex === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).text(cell || " ", MARGIN + column * columnWidth + 5, top + 4, { width: columnWidth - 10 }));
          document.moveTo(MARGIN, top + height).lineTo(MARGIN + width, top + height).lineWidth(0.4).strokeColor(RULE).stroke();
          document.y = top + height;
        });
        document.x = MARGIN;
        document.moveDown(0.6);
        break;
      }
    }
  }

  // Footer on every page
  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    document.switchToPage(page);
    document.page.margins.bottom = 0;
    const footerY = document.page.height - MARGIN + 18;
    document.font("Helvetica").fontSize(7.5).fillColor(MUTED)
      .text(pdfSafe(`Trace · ${run.id}`), MARGIN, footerY, { width: width / 2, lineBreak: false })
      .text(`Page ${page - range.start + 1} of ${range.count}`, MARGIN + width / 2, footerY, { width: width / 2, align: "right", lineBreak: false });
  }
  document.end();
  return done;
}
