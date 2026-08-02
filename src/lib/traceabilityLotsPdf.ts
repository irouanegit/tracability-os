import { invoke } from "@tauri-apps/api/core";

export type TraceabilityLotsPdfRow = {
  lotNumber: string;
  productName: string;
};

type PdfRenderPage = {
  commands: string[];
  pageNumber: number;
};

const a4Portrait = {
  width: 595.28,
  height: 841.89,
};

const pageMargin = 42;
const tableWidth = a4Portrait.width - pageMargin * 2;
const pairWidth = tableWidth / 2;
const productColumnWidth = 168;
const lotColumnWidth = pairWidth - productColumnWidth;
const headerTop = a4Portrait.height - 40;
const tableTop = a4Portrait.height - 76;
const tableHeaderHeight = 18;
const rowHeight = 13.5;
const bodyFontSize = 6.5;
const headerFontSize = 6.8;

export async function downloadTraceabilityLotsPdf(rows: TraceabilityLotsPdfRow[], filterSummary: string) {
  const sortedRows = [...rows].sort((left, right) => left.productName.localeCompare(right.productName, "fr"));
  const pdfContents = renderTraceabilityLotsPdf(sortedRows, filterSummary);
  const fileName = `lots-confirmes-${new Date().toISOString().slice(0, 10)}.pdf`;

  if (isTauriRuntime()) {
    const filePath = await invoke<string>("save_pdf_to_downloads", {
      fileName,
      contents: pdfContents,
      subFolder: "tracabilite production",
    });
    return { filePath };
  }

  const blob = new Blob([pdfContents], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { openedFallback: Boolean(openedWindow) };
}

export function renderTraceabilityLotsPdf(rows: TraceabilityLotsPdfRow[], filterSummary = "Filtres: Tous les produits affiches") {
  const pages: PdfRenderPage[] = [];
  let page = createPage(1);
  pages.push(page);
  let y = drawPageHeader(page, rows.length, filterSummary);

  for (let index = 0; index < rows.length; index += 2) {
    if (y - rowHeight < 36) {
      page = createPage(pages.length + 1);
      pages.push(page);
      y = drawPageHeader(page, rows.length, filterSummary);
    }

    drawBodyRow(page, rows[index], rows[index + 1] ?? null, y);
    y -= rowHeight;
  }

  if (rows.length === 0) {
    drawEmptyRow(page, y);
  }

  pages.forEach((targetPage, index) => {
    drawText(targetPage, `Page ${index + 1}/${pages.length}`, a4Portrait.width - pageMargin, 24, 8, "regular", "right");
  });

  return buildPdfFile(pages);
}

function createPage(pageNumber: number): PdfRenderPage {
  return { commands: [], pageNumber };
}

function drawPageHeader(page: PdfRenderPage, rowCount: number, filterSummary: string) {
  drawText(page, fitText(filterSummary, tableWidth - 92, 9), pageMargin, headerTop, 9, "bold");
  drawText(page, `${rowCount} produit(s)`, a4Portrait.width - pageMargin, headerTop, 8, "regular", "right");

  drawRect(page, pageMargin, tableTop - tableHeaderHeight, tableWidth, tableHeaderHeight, { fill: "0.91 0.92 0.94" });
  drawColumnGrid(page, tableTop - tableHeaderHeight, tableTop);
  drawPairHeader(page, pageMargin, tableTop);
  drawPairHeader(page, pageMargin + pairWidth, tableTop);
  return tableTop - tableHeaderHeight;
}

function drawPairHeader(page: PdfRenderPage, x: number, topY: number) {
  drawText(page, "Produit", x + 5, topY - 12, headerFontSize, "bold");
  drawText(page, "Lot confirme", x + productColumnWidth + 5, topY - 12, headerFontSize, "bold");
}

function drawBodyRow(page: PdfRenderPage, leftRow: TraceabilityLotsPdfRow, rightRow: TraceabilityLotsPdfRow | null, topY: number) {
  const bottomY = topY - rowHeight;
  drawRect(page, pageMargin, bottomY, tableWidth, rowHeight);
  drawColumnGrid(page, bottomY, topY);
  drawPairBody(page, leftRow, pageMargin, topY);
  if (rightRow) drawPairBody(page, rightRow, pageMargin + pairWidth, topY);
}

function drawEmptyRow(page: PdfRenderPage, topY: number) {
  const bottomY = topY - rowHeight;
  drawRect(page, pageMargin, bottomY, tableWidth, rowHeight);
  drawText(page, "Aucun produit confirme trouve.", pageMargin + 5, topY - 9, bodyFontSize, "regular");
}

function drawPairBody(page: PdfRenderPage, row: TraceabilityLotsPdfRow, x: number, topY: number) {
  drawText(page, fitText(row.productName, productColumnWidth - 10, bodyFontSize), x + 5, topY - 9, bodyFontSize, "regular");
  drawText(page, fitText(row.lotNumber, lotColumnWidth - 10, bodyFontSize), x + productColumnWidth + 5, topY - 9, bodyFontSize, "bold");
}

function drawColumnGrid(page: PdfRenderPage, bottomY: number, topY: number) {
  drawLine(page, pageMargin + productColumnWidth, bottomY, pageMargin + productColumnWidth, topY);
  drawLine(page, pageMargin + pairWidth, bottomY, pageMargin + pairWidth, topY);
  drawLine(page, pageMargin + pairWidth + productColumnWidth, bottomY, pageMargin + pairWidth + productColumnWidth, topY);
}

function fitText(value: string, maxWidth: number, size: number) {
  const text = sanitizeText(value).trim();
  if (textWidth(text, size) <= maxWidth) return text;

  let fittedText = text;
  while (fittedText.length > 0 && textWidth(fittedText, size) > maxWidth) {
    fittedText = fittedText.slice(0, -1);
  }
  return fittedText;
}

function textWidth(value: string, size: number, font: "regular" | "bold" = "regular") {
  const factor = font === "bold" ? 0.55 : 0.49;
  return value.length * size * factor;
}

function drawText(
  page: PdfRenderPage,
  value: string,
  x: number,
  y: number,
  size: number,
  font: "regular" | "bold",
  align: "left" | "right" = "left",
) {
  const text = sanitizeText(value);
  const textX = align === "right" ? x - textWidth(text, size, font) : x;
  const fontName = font === "bold" ? "F2" : "F1";
  page.commands.push(`BT /${fontName} ${size} Tf ${number(textX)} ${number(y)} Td (${escapePdfText(text)}) Tj ET`);
}

function drawRect(page: PdfRenderPage, x: number, y: number, width: number, height: number, options?: { fill?: string }) {
  if (options?.fill) {
    page.commands.push(`q ${options.fill} rg ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f Q`);
  }
  page.commands.push(`${number(x)} ${number(y)} ${number(width)} ${number(height)} re S`);
}

function drawLine(page: PdfRenderPage, x1: number, y1: number, x2: number, y2: number) {
  page.commands.push(`${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S`);
}

function buildPdfFile(pages: PdfRenderPage[]) {
  const objects: string[] = [];
  const addObject = (value: string) => {
    objects.push(value);
    return objects.length;
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("__PAGES__");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageIds: number[] = [];
  for (const page of pages) {
    const content = `0.55 w\n${page.commands.join("\n")}`;
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${a4Portrait.width} ${a4Portrait.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

function formatToday() {
  const date = new Date();
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function sanitizeText(value: string) {
  return value
    .replace(/NÃ‚Â°/g, "No")
    .replace(/nÃ‚Â°/g, "no")
    .replace(/Ã…â€œ/g, "oe")
    .replace(/Ã…â€™/g, "OE")
    .replace(/Ã‚Â°/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function number(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
