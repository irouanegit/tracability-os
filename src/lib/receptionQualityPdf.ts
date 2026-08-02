import { invoke } from "@tauri-apps/api/core";
import logoUrl from "../assets/casablanca-logo.jpg";
import { formatFrenchDate } from "./dateFormat";
import type { ReceptionBatchLine } from "./traceabilityApi";

export type ReceptionQualityPdfGroup = {
  batchNumbers: string[];
  dateLabel: string;
  lines: ReceptionBatchLine[];
  supplierName: string;
};

type PdfImageResource = {
  dataHex: string;
  height: number;
  name: string;
  width: number;
};

type PdfRenderPage = {
  commands: string[];
  pageNumber: number;
};

type ReceptionPdfRow = {
  expiryDate: string;
  hygieneStatus: "conforme" | "non_conforme";
  observations: string;
  productName: string;
  quantity: string;
  receptionDate: string;
  supplierLot: string;
  supplierName: string;
  temperatureStatus: "conforme" | "non_conforme";
  transportTemperature: string;
};

type PdfColumn = {
  align?: "left" | "center";
  key: keyof ReceptionPdfRow | "temperatureConforme" | "temperatureNonConforme" | "hygieneConforme" | "hygieneNonConforme";
  label: string;
  subLabel?: string;
  width: number;
};

const a4Landscape = {
  width: 841.89,
  height: 595.28,
};

const pageMargin = 28;
const tableWidth = 786;
const headerTop = a4Landscape.height - 20;
const mainTableTop = a4Landscape.height - 84;
const rowsPerPage = 25;
const rowHeight = 17.6;
const bodyFontSize = 6.8;
const headerFontSize = 6.4;
const applicationDate = "13/07/2026";
const pdfLogoWidth = 520;
const pdfLogoHeight = 180;

const columns: PdfColumn[] = [
  { key: "receptionDate", label: "Date de", subLabel: "reception", width: 56, align: "center" },
  { key: "productName", label: "Produit", subLabel: "receptionne", width: 110 },
  { key: "quantity", label: "Qte", width: 38, align: "center" },
  { key: "supplierName", label: "Fournisseur", width: 98 },
  { key: "supplierLot", label: "No Lot", width: 90 },
  { key: "expiryDate", label: "Date de", subLabel: "Peremption", width: 62, align: "center" },
  { key: "observations", label: "Observations/", subLabel: "Actions", width: 95 },
  { key: "transportTemperature", label: "T C", width: 32, align: "center" },
  { key: "temperatureConforme", label: "Conforme", width: 49, align: "center" },
  { key: "temperatureNonConforme", label: "Non", subLabel: "conforme", width: 54, align: "center" },
  { key: "hygieneConforme", label: "Conforme", width: 49, align: "center" },
  { key: "hygieneNonConforme", label: "Non", subLabel: "conforme", width: 53, align: "center" },
];

export async function downloadReceptionQualityPdf(groups: ReceptionQualityPdfGroup[]) {
  const rows = groups.flatMap((group) => buildRows(group)).sort(compareReceptionPdfRowsByDate);
  const pdfContents = renderReceptionQualityPdf(rows, await loadPdfLogoImage());
  const firstGroup = groups[0];
  const fileDate = firstGroup?.dateLabel.replace(/\//g, "-") || new Date().toISOString().slice(0, 10);
  const fileName = `fiche-reception-controle-qualite-${slugFileName(fileDate)}.pdf`;

  if (isTauriRuntime()) {
    const filePath = await invoke<string>("save_pdf_to_downloads", {
      fileName,
      contents: pdfContents,
      subFolder: "tracabilite reception",
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

function buildRows(group: ReceptionQualityPdfGroup[]): ReceptionPdfRow[];
function buildRows(group: ReceptionQualityPdfGroup): ReceptionPdfRow[];
function buildRows(group: ReceptionQualityPdfGroup | ReceptionQualityPdfGroup[]) {
  if (Array.isArray(group)) return group.flatMap((item) => buildRows(item));

  return group.lines.map((line) => ({
    expiryDate: line.expiryDate ? formatFrenchDate(line.expiryDate) : "",
    hygieneStatus: line.hygieneStatus,
    observations: "",
    productName: line.productName,
    quantity: `${line.quantity.toLocaleString("fr-FR")} ${line.unit}`,
    receptionDate: group.dateLabel,
    supplierLot: line.supplierLot,
    supplierName: group.supplierName,
    temperatureStatus: line.temperatureStatus,
    transportTemperature: "",
  }));
}

function renderReceptionQualityPdf(rows: ReceptionPdfRow[], logo: PdfImageResource | null) {
  const pages: PdfRenderPage[] = [];
  const printableRows = rows.length > 0 ? rows : [emptyRow()];
  const pageChunks = chunkRows(printableRows, rowsPerPage);

  pageChunks.forEach((chunk, index) => {
    const page = createPage(index + 1);
    pages.push(page);
    let y = drawPageHeader(page, logo);
    const rowsWithBlanks = padRows(chunk, rowsPerPage);

    rowsWithBlanks.forEach((row) => {
      drawBodyRow(page, row, y);
      y -= rowHeight;
    });
  });

  pages.forEach((targetPage, index) => {
    drawText(targetPage, `Page ${index + 1}/${pages.length}`, a4Landscape.width - pageMargin, 22, 8, "regular", "right");
  });

  return buildPdfFile(pages, logo ? [logo] : []);
}

function createPage(pageNumber: number): PdfRenderPage {
  return { commands: [], pageNumber };
}

function drawPageHeader(page: PdfRenderPage, logo: PdfImageResource | null) {
  const x = pageMargin;
  const headerWidth = tableWidth;
  const headerHeight = 48;
  const topY = headerTop;
  const bottomY = topY - headerHeight;
  const leftWidth = 116;
  const rightWidth = 186;
  const centerWidth = headerWidth - leftWidth - rightWidth;

  drawRect(page, x, bottomY, headerWidth, headerHeight);
  drawLine(page, x + leftWidth, bottomY, x + leftWidth, topY);
  drawLine(page, x + leftWidth + centerWidth, bottomY, x + leftWidth + centerWidth, topY);
  drawLine(page, x + leftWidth, bottomY + headerHeight / 2, x + leftWidth + centerWidth, bottomY + headerHeight / 2);

  const metaX = x + leftWidth + centerWidth;
  for (let index = 1; index < 4; index += 1) {
    const lineY = topY - (headerHeight / 4) * index;
    drawLine(page, metaX, lineY, x + headerWidth, lineY);
  }

  if (logo) {
    drawImageFit(page, logo, x + 8, bottomY + 7, leftWidth - 16, headerHeight - 14);
  }

  drawText(page, "Enregistrement", x + leftWidth + centerWidth / 2, bottomY + 30, 11.5, "regular", "center");
  drawText(page, "Fiche controle MP et condition de transport a la reception", x + leftWidth + centerWidth / 2, bottomY + 13, 10.5, "italic", "center");
  drawText(page, "Code : FCR-CASA-01", metaX + 7, topY - 10, 7.4, "regular");
  drawText(page, "Version : A", metaX + 7, topY - 22, 7.4, "regular");
  drawText(page, `Date d'application : ${applicationDate}`, metaX + 7, topY - 34, 7.4, "regular");

  return drawTableHeader(page, mainTableTop);
}

function drawTableHeader(page: PdfRenderPage, tableTop: number) {
  const x = pageMargin;
  const topHeaderHeight = 21;
  const secondHeaderHeight = 20;
  const headerBottom = tableTop - topHeaderHeight - secondHeaderHeight;
  const splitY = tableTop - topHeaderHeight;
  const groupedHeaderStart = columnStart("transportTemperature");

  drawRect(page, x, headerBottom, tableWidth, topHeaderHeight + secondHeaderHeight, { fill: "0.92 0.92 0.92" });
  drawLine(page, groupedHeaderStart, splitY, x + tableWidth, splitY);

  const groupedInnerKeys = new Set(["temperatureConforme", "temperatureNonConforme", "hygieneNonConforme"]);

  let currentX = x;
  for (const column of columns) {
    const lineTop = groupedInnerKeys.has(column.key) ? splitY : tableTop;
    drawLine(page, currentX, headerBottom, currentX, lineTop);
    currentX += column.width;
  }
  drawLine(page, x + tableWidth, headerBottom, x + tableWidth, tableTop);

  const tempStart = columnStart("transportTemperature");
  const tempEnd = columnStart("hygieneConforme");
  const hygieneStart = columnStart("hygieneConforme");
  const hygieneEnd = x + tableWidth;

  drawCenteredHeaderLines(page, ["Temperature", "de transport"], (tempStart + tempEnd) / 2, splitY, topHeaderHeight, 7.6);
  drawCenteredHeaderLines(page, ["Hygiene/Proprete"], (hygieneStart + hygieneEnd) / 2, splitY, topHeaderHeight, 7.6);

  for (const column of columns) {
    const start = columnStart(column.key);
    const centerX = start + column.width / 2;
    const isGroupedColumn = ["transportTemperature", "temperatureConforme", "temperatureNonConforme", "hygieneConforme", "hygieneNonConforme"].includes(column.key);
    drawHeaderLabel(
      page,
      column,
      centerX,
      isGroupedColumn ? headerBottom : headerBottom,
      isGroupedColumn ? secondHeaderHeight : topHeaderHeight + secondHeaderHeight,
    );
  }

  return headerBottom;
}

function drawBodyRow(page: PdfRenderPage, row: ReceptionPdfRow, topY: number) {
  let currentX = pageMargin;
  const bottomY = topY - rowHeight;
  drawRect(page, pageMargin, bottomY, tableWidth, rowHeight);

  for (const column of columns) {
    drawLine(page, currentX, bottomY, currentX, topY);
    drawCell(page, row, column, currentX, bottomY, rowHeight);
    currentX += column.width;
  }
  drawLine(page, pageMargin + tableWidth, bottomY, pageMargin + tableWidth, topY);
}

function drawCell(page: PdfRenderPage, row: ReceptionPdfRow, column: PdfColumn, x: number, y: number, height: number) {
  if (column.key === "temperatureConforme") {
    drawCheckboxMark(page, false, x, y, column.width, height);
    return;
  }
  if (column.key === "temperatureNonConforme") {
    drawCheckboxMark(page, false, x, y, column.width, height);
    return;
  }
  if (column.key === "hygieneConforme") {
    drawCheckboxMark(page, false, x, y, column.width, height);
    return;
  }
  if (column.key === "hygieneNonConforme") {
    drawCheckboxMark(page, false, x, y, column.width, height);
    return;
  }

  const value = row[column.key] ?? "";
  const text = fitText(value, column.width - 8, bodyFontSize);
  const textY = y + (height - bodyFontSize) / 2 + 1;
  const textX = column.align === "center" ? x + column.width / 2 : x + 4;
  drawText(page, text, textX, textY, bodyFontSize, "regular", column.align ?? "left");
}

function drawCheckboxMark(page: PdfRenderPage, checked: boolean, x: number, y: number, width: number, height: number) {
  const boxSize = 7.2;
  const boxX = x + (width - boxSize) / 2;
  const boxY = y + (height - boxSize) / 2;
  drawRect(page, boxX, boxY, boxSize, boxSize);
  if (checked) {
    drawText(page, "X", boxX + boxSize / 2, boxY + 1.9, 6.2, "bold", "center");
  }
}

function emptyRow(): ReceptionPdfRow {
  return {
    expiryDate: "",
    hygieneStatus: "conforme",
    observations: "",
    productName: "",
    quantity: "",
    receptionDate: "",
    supplierLot: "",
    supplierName: "",
    temperatureStatus: "conforme",
    transportTemperature: "",
  };
}

function compareReceptionPdfRowsByDate(left: ReceptionPdfRow, right: ReceptionPdfRow) {
  const dateDifference = parseFrenchDateTimestamp(left.receptionDate) - parseFrenchDateTimestamp(right.receptionDate);
  if (dateDifference !== 0) return dateDifference;

  return left.productName.localeCompare(right.productName, "fr");
}

function parseFrenchDateTimestamp(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  if (!day || !month || !year) return Number.MAX_SAFE_INTEGER;

  return new Date(year, month - 1, day).getTime();
}

function chunkRows(rows: ReceptionPdfRow[], size: number) {
  const chunks: ReceptionPdfRow[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[emptyRow()]];
}

function padRows(rows: ReceptionPdfRow[], size: number) {
  const paddedRows = [...rows];
  while (paddedRows.length < size) paddedRows.push(emptyRow());
  return paddedRows;
}

function drawHeaderLabel(page: PdfRenderPage, column: PdfColumn, centerX: number, y: number, height: number) {
  drawCenteredHeaderLines(page, column.subLabel ? [column.label, column.subLabel] : [column.label], centerX, y, height, headerFontSize);
}

function drawCenteredHeaderLines(page: PdfRenderPage, lines: string[], centerX: number, y: number, height: number, size: number) {
  const lineGap = size * 1.15;
  const count = lines.length;
  const midpointY = y + height / 2 + size * 0.22;

  lines.forEach((line, index) => {
    const lineY = midpointY + ((count - 1) / 2 - index) * lineGap;
    drawText(page, line, centerX, lineY, size, "bold", "center");
  });
}

function columnStart(key: PdfColumn["key"]) {
  let x = pageMargin;
  for (const column of columns) {
    if (column.key === key) return x;
    x += column.width;
  }
  return x;
}

function fitText(value: string, maxWidth: number, size: number) {
  const text = sanitizeText(value).trim();
  if (textWidth(text, size) <= maxWidth) return text;

  const ellipsis = "...";
  let fittedText = text;
  while (fittedText.length > 0 && textWidth(`${fittedText}${ellipsis}`, size) > maxWidth) {
    fittedText = fittedText.slice(0, -1);
  }
  return fittedText ? `${fittedText}${ellipsis}` : "";
}

function textWidth(value: string, size: number, font: "regular" | "bold" | "italic" = "regular") {
  const factor = font === "bold" ? 0.55 : 0.49;
  return value.length * size * factor;
}

function drawText(
  page: PdfRenderPage,
  value: string,
  x: number,
  y: number,
  size: number,
  font: "regular" | "bold" | "italic",
  align: "left" | "center" | "right" = "left",
) {
  const text = sanitizeText(value);
  const textX = align === "center" ? x - textWidth(text, size, font) / 2 : align === "right" ? x - textWidth(text, size, font) : x;
  const fontName = font === "bold" ? "F2" : font === "italic" ? "F3" : "F1";
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

function drawImageFit(page: PdfRenderPage, image: PdfImageResource, x: number, y: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const imageX = x + (maxWidth - width) / 2;
  const imageY = y + (maxHeight - height) / 2;
  page.commands.push(`q ${number(width)} 0 0 ${number(height)} ${number(imageX)} ${number(imageY)} cm /${image.name} Do Q`);
}

async function loadPdfLogoImage(): Promise<PdfImageResource | null> {
  try {
    const response = await fetch(logoUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      dataHex: bytesToHex(bytes),
      height: pdfLogoHeight,
      name: "ImLogo",
      width: pdfLogoWidth,
    };
  } catch {
    return null;
  }
}

function buildPdfFile(pages: PdfRenderPage[], images: PdfImageResource[]) {
  const objects: string[] = [];
  const addObject = (value: string) => {
    objects.push(value);
    return objects.length;
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("__PAGES__");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>");

  const imageIds = new Map<string, number>();
  for (const image of images) {
    const encodedData = `${image.dataHex}>`;
    const imageId = addObject(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${encodedData.length} >>\nstream\n${encodedData}\nendstream`,
    );
    imageIds.set(image.name, imageId);
  }

  const xObjectResources =
    imageIds.size > 0
      ? ` /XObject << ${[...imageIds.entries()].map(([name, id]) => `/${name} ${id} 0 R`).join(" ")} >>`
      : "";

  const pageIds: number[] = [];
  for (const page of pages) {
    const content = `0.6 w\n${page.commands.join("\n")}`;
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${a4Landscape.width} ${a4Landscape.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xObjectResources} >> /Contents ${contentId} 0 R >>`,
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

function bytesToHex(bytes: Uint8Array) {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0").toUpperCase();
  }
  return hex;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function sanitizeText(value: string) {
  return value
    .replace(/NÂ°/g, "No")
    .replace(/nÂ°/g, "no")
    .replace(/Å“/g, "oe")
    .replace(/Å’/g, "OE")
    .replace(/Â°/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function slugFileName(value: string) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function number(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
