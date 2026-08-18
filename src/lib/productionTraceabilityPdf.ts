import { formatFrenchDate } from "./dateFormat";
import { invoke } from "@tauri-apps/api/core";
import type {
  AvailableLotOption,
  DeliveryItem,
  DeliveryRecord,
  Product,
  ProductionBatch,
  ProductionConsumptionDetail,
  ProductionTraceabilityNode,
  ProductionTraceabilitySnapshot,
  ProductSchemaNode,
} from "./traceabilityApi";
import logoUrl from "../assets/casablanca-logo.jpg";

type PdfColumnKey = "targetProduct" | "semiFinishedPath" | "rawMaterial" | "rawMaterialLot" | "semiFinishedLot" | "targetProductLot" | "observations";

type PdfColumn = {
  key: PdfColumnKey;
  label: string;
  width: number;
};

export type ProductionPdfLotDraft = {
  lots: AvailableLotOption[];
  selectedProductId?: string;
  selectedProductName?: string;
  selectedLotIds: string[];
};

export type ProductionPdfComponentDraft = ProductionPdfLotDraft & {
  component: ProductSchemaNode;
};

export type ProductionPdfData = {
  title: string;
  documentCode: string;
  version: string;
  applicationDate: string;
  productionDate: string;
  responsibleName: string | null;
  categoryLabel: string;
  targetProductName: string;
  targetProductLot: string;
  hasSemiFinished: boolean;
  columns: PdfColumn[];
  rows: ProductionPdfRow[];
};

export type DeliveryPdfData = {
  delivery: DeliveryRecord;
  items: DeliveryItem[];
};

type ProductionPdfRow = Record<PdfColumnKey, string>;

type PdfRenderPage = {
  commands: string[];
  height: number;
  pageNumber: number;
  width: number;
};

type PdfMeasuredRow = {
  row: ProductionPdfRow;
  height: number;
};

type PdfTableStyle = {
  bodyFontSize: number;
  bodyLineHeight: number;
};

type PdfImageResource = {
  dataHex: string;
  height: number;
  name: string;
  width: number;
};

function sortComponentsOrder<T extends { type?: string; productType?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const typeOrder = (t: string | undefined) => (t === "semi_finished" ? 0 : t === "raw" ? 1 : 2);
    return typeOrder(a.type ?? a.productType) - typeOrder(b.type ?? b.productType);
  });
}

function productionPdfSchemaRowKey(component: ProductSchemaNode, parentKey: string, index: number) {
  return parentKey ? `${parentKey}/${component.id}:${index}` : `${component.id}:${index}`;
}

const a4Landscape = {
  width: 841.89,
  height: 595.28,
};

const a4Portrait = {
  width: 595.28,
  height: 841.89,
};

const pageMargin = 28;
const contentWidth = a4Landscape.width - pageMargin * 2;
const missingValue = "A completer";
const applicationDate = "13/07/2026";
const deliveryApplicationDate = "18/08/2026";
const pdfLogoWidth = 520;
const pdfLogoHeight = 180;

export function buildProductionPdfData({
  categoryLabel,
  componentDrafts,
  nestedLotDrafts,
  product,
  productLot,
  productionDate,
  responsibleName,
}: {
  categoryLabel: string;
  componentDrafts: ProductionPdfComponentDraft[];
  nestedLotDrafts: Record<string, ProductionPdfLotDraft>;
  product: Product;
  productLot: string;
  productionDate: string;
  responsibleName: string | null;
}): ProductionPdfData {
  const selectedLotsByKey = new Map<string, AvailableLotOption | null>();
  const selectedProductNamesByKey = new Map<string, string>();

  function setDraftSelection(key: string, draft: ProductionPdfLotDraft) {
    selectedLotsByKey.set(key, selectedLotFromDraft(draft));
    if (draft.selectedProductName) selectedProductNamesByKey.set(key, draft.selectedProductName);
  }

  const sortedDrafts = [...componentDrafts].sort((left, right) => {
    const typeOrder = (type: string) => (type === "semi_finished" ? 0 : type === "raw" ? 1 : 2);
    return typeOrder(left.component.type) - typeOrder(right.component.type);
  });

  sortedDrafts.forEach((draft, index) => {
    const rowKey = productionPdfSchemaRowKey(draft.component, "", index);
    setDraftSelection(rowKey, draft);
    if (!selectedLotsByKey.has(draft.component.id)) setDraftSelection(draft.component.id, draft);
  });

  for (const [key, draft] of Object.entries(nestedLotDrafts)) {
    setDraftSelection(key, draft);
    if (draft.selectedProductId && !selectedLotsByKey.has(draft.selectedProductId)) setDraftSelection(draft.selectedProductId, draft);
  }

  const rows: ProductionPdfRow[] = [];

  function lotForComponent(component: ProductSchemaNode, rowKey: string) {
    return selectedLotsByKey.get(rowKey) ?? selectedLotsByKey.get(component.id) ?? null;
  }

  function selectedNameForComponent(component: ProductSchemaNode, rowKey: string) {
    const selectedLot = lotForComponent(component, rowKey);
    return selectedLot?.productName || selectedProductNamesByKey.get(rowKey) || selectedProductNamesByKey.get(component.id) || component.name;
  }

  function walk(component: ProductSchemaNode, rowKey: string, semiFinishedPath: string[], currentSemiFinishedLot: string | null) {
    if (component.type === "raw") {
      rows.push({
        targetProduct: product.name,
        semiFinishedPath: semiFinishedPath.join(" > "),
        rawMaterial: selectedNameForComponent(component, rowKey),
        rawMaterialLot: displayLot(lotForComponent(component, rowKey)),
        semiFinishedLot: currentSemiFinishedLot ?? "",
        targetProductLot: productLot,
        observations: "",
      });
      return;
    }

    if (component.type !== "semi_finished") return;

    const nextPath = [...semiFinishedPath, selectedNameForComponent(component, rowKey)];
    const nextLot = displayLot(lotForComponent(component, rowKey));

    if (component.children.length === 0) {
      rows.push({
        targetProduct: product.name,
        semiFinishedPath: nextPath.join(" > "),
        rawMaterial: missingValue,
        rawMaterialLot: "",
        semiFinishedLot: nextLot,
        targetProductLot: productLot,
        observations: "",
      });
      return;
    }

    for (const [index, child] of sortComponentsOrder(component.children).entries()) {
      walk(child, productionPdfSchemaRowKey(child, rowKey, index), nextPath, nextLot);
    }
  }

  for (const [index, draft] of sortedDrafts.entries()) {
    walk(draft.component, productionPdfSchemaRowKey(draft.component, "", index), [], null);
  }

  const hasNestedSemiFinished = rows.some((row) => row.semiFinishedPath.trim().length > 0);
  const pdfRows = product.type === "semi_finished" && hasNestedSemiFinished ? prefixSemiFinishedRootPath(rows, product.name) : rows;
  const hasSemiFinished = pdfRows.some((row) => row.semiFinishedPath.trim().length > 0);
  const columns = buildColumns(product.type === "finished" ? "finished" : "semi_finished", hasSemiFinished);

  return {
    title: `Fiche Production ${categoryLabel.toUpperCase()}`,
    documentCode: "FP-CASA-01",
    version: "A",
    applicationDate,
    productionDate: formatFrenchDate(new Date(`${productionDate}T00:00:00`)),
    responsibleName,
    categoryLabel,
    targetProductName: product.name,
    targetProductLot: productLot,
    hasSemiFinished,
    columns,
    rows: pdfRows,
  };
}

export function buildProductionPdfDataFromBatch({
  batch,
  rows,
}: {
  batch: ProductionBatch;
  rows: ProductionConsumptionDetail[];
}): ProductionPdfData {
  const pdfRows = batch.traceabilitySnapshot
    ? buildRowsFromSnapshot(batch.traceabilitySnapshot, batch.productName, batch.generatedLot, batch.productType)
    : buildRowsFromConsumptionRows(rows, batch.productName, batch.generatedLot, batch.productType);
  const hasSemiFinished = pdfRows.some((row) => row.semiFinishedPath.trim().length > 0);

  return {
    title: `Fiche Production ${categoryLabelForBatch(batch).toUpperCase()}`,
    documentCode: "FP-CASA-01",
    version: "A",
    applicationDate,
    productionDate: formatFrenchDate(new Date(batch.productionDate)),
    responsibleName: batch.responsibleName,
    categoryLabel: categoryLabelForBatch(batch),
    targetProductName: batch.productName,
    targetProductLot: batch.generatedLot,
    hasSemiFinished,
    columns: buildColumns(batch.productType, hasSemiFinished),
    rows: pdfRows,
  };
}

export function buildProductionPdfDataFromBatchSchema({
  batch,
  components,
  rows,
}: {
  batch: ProductionBatch;
  components: ProductSchemaNode[];
  rows: ProductionConsumptionDetail[];
}): ProductionPdfData {
  const selectedLotsByProductId = new Map<string, AvailableLotOption | null>();

  for (const row of rows) {
    if (!selectedLotsByProductId.has(row.expectedProductId)) {
      selectedLotsByProductId.set(row.expectedProductId, lotFromConsumptionRow(row));
    }
  }

  const pdfRows: ProductionPdfRow[] = [];

  function lotForProduct(productId: string) {
    return selectedLotsByProductId.get(productId) ?? null;
  }

  function materialNameForProduct(component: ProductSchemaNode) {
    return lotForProduct(component.id)?.productName || component.name;
  }

  function walk(component: ProductSchemaNode, semiFinishedPath: string[], currentSemiFinishedLot: string | null) {
    if (component.type === "raw") {
      pdfRows.push({
        targetProduct: batch.productName,
        semiFinishedPath: semiFinishedPath.join(" > "),
        rawMaterial: materialNameForProduct(component),
        rawMaterialLot: displayLot(lotForProduct(component.id)),
        semiFinishedLot: currentSemiFinishedLot ?? "",
        targetProductLot: batch.generatedLot,
        observations: "",
      });
      return;
    }

    if (component.type !== "semi_finished") return;

    const nextPath = [...semiFinishedPath, component.name];
    const nextLot = displayLot(lotForProduct(component.id));

    if (component.children.length === 0) {
      pdfRows.push({
        targetProduct: batch.productName,
        semiFinishedPath: nextPath.join(" > "),
        rawMaterial: missingValue,
        rawMaterialLot: "",
        semiFinishedLot: nextLot,
        targetProductLot: batch.generatedLot,
        observations: "",
      });
      return;
    }

    for (const child of sortComponentsOrder(component.children)) {
      walk(child, nextPath, nextLot);
    }
  }

  for (const component of sortComponentsOrder(components)) {
    walk(component, [], null);
  }

  const hasNestedSemiFinished = pdfRows.some((row) => row.semiFinishedPath.trim().length > 0);
  const normalizedRows = batch.productType === "semi_finished" && hasNestedSemiFinished ? prefixSemiFinishedRootPath(pdfRows, batch.productName) : pdfRows;
  const hasSemiFinished = normalizedRows.some((row) => row.semiFinishedPath.trim().length > 0);

  return {
    title: `Fiche Production ${categoryLabelForBatch(batch).toUpperCase()}`,
    documentCode: "FP-CASA-01",
    version: "A",
    applicationDate,
    productionDate: formatFrenchDate(new Date(batch.productionDate)),
    responsibleName: batch.responsibleName,
    categoryLabel: categoryLabelForBatch(batch),
    targetProductName: batch.productName,
    targetProductLot: batch.generatedLot,
    hasSemiFinished,
    columns: buildColumns(batch.productType, hasSemiFinished),
    rows: normalizedRows,
  };
}

export async function renderProductionPdfContents(data: ProductionPdfData) {
  return renderProductionPdf(data, await loadPdfLogoImage());
}

export async function renderProductionBatchPdfContents(items: ProductionPdfData[]) {
  return renderProductionBatchPdf(items, await loadPdfLogoImage());
}

export async function renderDeliveryBatchPdfContents(items: DeliveryPdfData[]) {
  return renderDeliveryBatchPdf(items, await loadPdfLogoImage());
}

export async function downloadProductionTraceabilityPdf(data: ProductionPdfData, renderedContents?: string) {
  const pdfContents = renderedContents ?? (await renderProductionPdfContents(data));
  const fileName = `${slugFileName(data.targetProductName)}-${slugFileName(data.targetProductLot)}.pdf`;

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

export async function downloadProductionTraceabilityBatchPdf(items: ProductionPdfData[], renderedContents?: string) {
  const pdfContents = renderedContents ?? (await renderProductionBatchPdfContents(items));
  const fileName = `production-groupee-${new Date().toISOString().slice(0, 10)}.pdf`;

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

export async function downloadDeliveryBatchPdf(items: DeliveryPdfData[], renderedContents?: string) {
  const pdfContents = renderedContents ?? (await renderDeliveryBatchPdfContents(items));
  const fileName = `livraisons-${new Date().toISOString().slice(0, 10)}.pdf`;

  if (isTauriRuntime()) {
    const filePath = await invoke<string>("save_pdf_to_downloads", {
      fileName,
      contents: pdfContents,
      subFolder: "livraisons",
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

export async function openProductionPdfFile(filePath: string) {
  if (isTauriRuntime()) {
    await invoke("open_pdf_file", { filePath });
    return;
  }

  window.open(filePath, "_blank", "noopener,noreferrer");
}

function selectedLotFromDraft(draft: ProductionPdfLotDraft) {
  return draft.lots.find((lot) => lot.id === draft.selectedLotIds[0]) ?? null;
}

function displayLot(lot: AvailableLotOption | null) {
  return lot ? lot.supplierLot ?? lot.lotNumber : "";
}

function lotFromConsumptionRow(row: ProductionConsumptionDetail): AvailableLotOption {
  return {
    id: row.lotId,
    productId: row.productId,
    productName: row.productName,
    productType: row.productType,
    productCategory: row.category,
    lotNumber: row.lotNumber,
    supplierLot: row.supplierLot,
    supplierName: row.supplierName,
    sourceType: row.sourceType,
    sourceId: null,
    createdAt: row.lotCreatedAt,
    responsibleName: null,
  };
}

function buildRowsFromSnapshot(
  snapshot: ProductionTraceabilitySnapshot,
  targetProductName: string,
  targetProductLot: string,
  targetProductType: Product["type"],
) {
  const components = snapshot.components;
  const childrenByParentNodeId = components.reduce<Record<string, ProductionTraceabilityNode[]>>((groups, component) => {
    const siblings = groups[component.parentNodeId] ?? [];
    siblings.push(component);
    groups[component.parentNodeId] = siblings;
    return groups;
  }, {});
  const rows: ProductionPdfRow[] = [];

  function lotForNode(node: ProductionTraceabilityNode) {
    return node.lots[0] ? node.lots[0].supplierLot ?? node.lots[0].lotNumber : "";
  }

  function materialNameForNode(node: ProductionTraceabilityNode) {
    return node.lots[0]?.productName || node.productName;
  }

  function walk(node: ProductionTraceabilityNode, semiFinishedPath: string[], currentSemiFinishedLot: string | null) {
    if (node.productType === "raw") {
      rows.push({
        targetProduct: targetProductName,
        semiFinishedPath: semiFinishedPath.join(" > "),
        rawMaterial: materialNameForNode(node),
        rawMaterialLot: lotForNode(node),
        semiFinishedLot: currentSemiFinishedLot ?? "",
        targetProductLot,
        observations: "",
      });
      return;
    }

    if (node.productType !== "semi_finished") return;

    const nextPath = [...semiFinishedPath, node.productName];
    const nextLot = lotForNode(node);
    const children = childrenByParentNodeId[node.nodeId] ?? [];

    if (children.length === 0) {
      rows.push({
        targetProduct: targetProductName,
        semiFinishedPath: nextPath.join(" > "),
        rawMaterial: missingValue,
        rawMaterialLot: "",
        semiFinishedLot: nextLot,
        targetProductLot,
        observations: "",
      });
      return;
    }

    for (const child of sortComponentsOrder(children)) {
      walk(child, nextPath, nextLot);
    }
  }

  const rootChildren = [
    ...components.filter((component) => component.parentNodeId === snapshot.root.productId),
    ...components.filter((component) => component.parentNodeId === ""),
  ];
  for (const component of sortComponentsOrder([...new Map(rootChildren.map((node) => [node.nodeId, node])).values()])) {
    walk(component, [], null);
  }

  const hasNestedSemiFinished = rows.some((row) => row.semiFinishedPath.trim().length > 0);
  return targetProductType === "semi_finished" && hasNestedSemiFinished ? prefixSemiFinishedRootPath(rows, targetProductName) : rows;
}

function buildRowsFromConsumptionRows(
  rows: ProductionConsumptionDetail[],
  targetProductName: string,
  targetProductLot: string,
  targetProductType: Product["type"],
) {
  const sortedRows = sortComponentsOrder(rows);
  const pdfRows = sortedRows.map<ProductionPdfRow>((row) => {
    const lot = row.supplierLot ?? row.lotNumber;
    return {
      targetProduct: targetProductName,
      semiFinishedPath: row.productType === "semi_finished" ? row.productName : "",
      rawMaterial: row.productType === "raw" ? row.productName : missingValue,
      rawMaterialLot: row.productType === "raw" ? lot : "",
      semiFinishedLot: row.productType === "semi_finished" ? lot : "",
      targetProductLot,
      observations: "",
    };
  });
  const hasNestedSemiFinished = pdfRows.some((row) => row.semiFinishedPath.trim().length > 0);
  return targetProductType === "semi_finished" && hasNestedSemiFinished ? prefixSemiFinishedRootPath(pdfRows, targetProductName) : pdfRows;
}

function prefixSemiFinishedRootPath(rows: ProductionPdfRow[], rootName: string) {
  return rows.map((row) => ({
    ...row,
    semiFinishedPath: [rootName, row.semiFinishedPath].filter((part) => part.trim().length > 0).join(" > "),
  }));
}

function categoryLabelForBatch(batch: ProductionBatch) {
  if (batch.category === "beldi") return "Beldi";
  if (batch.category === "boulangerie") return "Boulangerie";
  if (batch.category === "cake") return "Patisserie";
  if (batch.category === "patisserie") return "Patisserie";
  if (batch.category === "viennoiserie") return "Viennoiserie";
  return "Production";
}

function buildColumns(productType: ProductionBatch["productType"], hasSemiFinished: boolean): PdfColumn[] {
  const targetLabel = productType === "finished" ? "Produit fini" : "Produit semi fini";
  const targetLotLabel = productType === "finished" ? "No Lot PF" : "No Lot SF";

  if (!hasSemiFinished) {
    return [
      { key: "targetProduct", label: targetLabel, width: 170 },
      { key: "rawMaterial", label: "Matiere Premiere", width: 230 },
      { key: "rawMaterialLot", label: "No Lot MP", width: 135 },
      { key: "targetProductLot", label: targetLotLabel, width: 135 },
      { key: "observations", label: "Observations/Actions", width: contentWidth - 670 },
    ];
  }

  if (productType === "semi_finished") {
    return [
      { key: "semiFinishedPath", label: targetLabel, width: 240 },
      { key: "rawMaterial", label: "Matiere Premiere", width: 150 },
      { key: "rawMaterialLot", label: "No Lot MP", width: 105 },
      { key: "semiFinishedLot", label: "No Lot SF", width: 105 },
      { key: "targetProductLot", label: targetLotLabel, width: 105 },
      { key: "observations", label: "Observations/Actions", width: contentWidth - 705 },
    ];
  }

  return [
    { key: "targetProduct", label: targetLabel, width: 98 },
    { key: "semiFinishedPath", label: productType === "finished" ? "Produit semi fini" : "Sous-produit semi fini", width: 142 },
    { key: "rawMaterial", label: "Matiere Premiere", width: 150 },
    { key: "rawMaterialLot", label: "No Lot MP", width: 105 },
    { key: "semiFinishedLot", label: "No Lot SF", width: 105 },
    { key: "targetProductLot", label: targetLotLabel, width: 105 },
    { key: "observations", label: "Observations/Actions", width: contentWidth - 705 },
  ];
}

export function renderProductionPdf(data: ProductionPdfData, logoImage: PdfImageResource | null = null) {
  const page = createPage(1);

  let y = drawDocumentHeader(page, data, logoImage);
  y = drawTableHeader(page, data.columns, y);

  const rows = data.rows.length > 0 ? data.rows : [emptyRow(data)];
  const tableBottomY = pageMargin + 22;
  const layout = fitRowsToSinglePage(rows, data.columns, Math.max(40, y - tableBottomY));

  drawTableBody(page, data.columns, layout.rows, y, layout.style);
  drawFooter(page, 1);

  return buildPdfFile([page], logoImage ? [logoImage] : []);
}

function renderProductionBatchPdf(items: ProductionPdfData[], logoImage: PdfImageResource | null = null) {
  const page = createPage(1);
  const safeItems = sortProductionPdfItemsByDate(items.length > 0 ? items : []);
  let y = drawBatchDocumentHeader(page, safeItems, logoImage);
  const tableBottomY = pageMargin + 18;
  const layout = fitProductionTablesToSinglePage(safeItems, Math.max(80, y - tableBottomY));

  for (const section of layout.sections) {
    y = drawCompactProductSection(page, section.data, section.rows, y, layout.style);
  }

  drawFooter(page, 1);
  return buildPdfFile([page], logoImage ? [logoImage] : []);
}

export function renderDeliveryBatchPdf(items: DeliveryPdfData[], logoImage: PdfImageResource | null = null) {
  const safeItems = items.length > 0 ? items : [];
  const pages = safeItems.map((data, index) => {
    const page = createPage(index + 1, a4Portrait);
    drawDeliveryPage(page, data, logoImage);
    return page;
  });

  if (pages.length === 0) {
    const page = createPage(1, a4Portrait);
    drawText(page, "Aucune livraison a exporter", page.width / 2, page.height / 2, 16, "bold", "center");
    pages.push(page);
  }

  return buildPdfFile(pages, logoImage ? [logoImage] : []);
}

function drawDeliveryPage(page: PdfRenderPage, data: DeliveryPdfData, logoImage: PdfImageResource | null) {
  const deliveryContentWidth = page.width - pageMargin * 2;
  const deliveryTableMargin = 18;
  const deliveryTableWidth = page.width - deliveryTableMargin * 2;
  const top = page.height - pageMargin;
  const headerHeight = 58;
  const logoWidth = 108;
  const metaWidth = 154;
  const titleWidth = deliveryContentWidth - logoWidth - metaWidth;

  drawRect(page, pageMargin, top - headerHeight, logoWidth, headerHeight);
  if (logoImage) {
    drawImageFit(page, logoImage, pageMargin + 9, top - headerHeight + 8, logoWidth - 18, headerHeight - 16);
  } else {
    drawText(page, "Casablanca", pageMargin + logoWidth / 2, top - 34, 11, "italic", "center");
  }

  drawRect(page, pageMargin + logoWidth, top - headerHeight, titleWidth, headerHeight);
  drawText(page, "FICHE TRACABILITE", pageMargin + logoWidth + titleWidth / 2, top - 34, 17, "bold", "center");

  const metaX = pageMargin + logoWidth + titleWidth;
  drawRect(page, metaX, top - headerHeight, metaWidth, headerHeight);
  drawText(page, "ENRG-FT-01", metaX + 9, top - 18, 10, "bold");
  drawLine(page, metaX, top - 28, metaX + metaWidth, top - 28);
  drawText(page, `Date d'application : ${deliveryApplicationDate}`, metaX + 9, top - 46, 8.2, "regular");

  const infoY = top - headerHeight - 18;
  drawText(page, `Magasin : ${data.delivery.storeName}`, pageMargin, infoY, 8, "bold");
  drawText(page, `Date : ${formatFrenchDate(new Date(data.delivery.deliveryDate))}`, pageMargin + 230, infoY, 8, "regular");
  drawText(page, `Produits : ${data.items.length}`, pageMargin + 405, infoY, 8, "bold");

  const tableTop = infoY - 18;
  const tableBottom = deliverySignatureTopY() + 12;
  drawDeliveryItemsTable(page, data.items, tableTop, tableBottom, deliveryTableWidth, deliveryTableMargin);
  drawDeliverySignatureAreas(page, deliveryTableMargin, deliveryTableWidth);
}

function deliverySignatureTopY() {
  return pageMargin + 42;
}

function drawDeliverySignatureAreas(page: PdfRenderPage, x: number, width: number) {
  const gap = 20;
  const signatureY = pageMargin - 2;
  const signatureHeight = deliverySignatureTopY() - signatureY;
  const signatureWidth = (width - gap) / 2;
  const rightX = x + signatureWidth + gap;

  drawRect(page, x, signatureY, signatureWidth, signatureHeight);
  drawRect(page, rightX, signatureY, signatureWidth, signatureHeight);
  drawText(page, "Visa RCQ", x + 9, signatureY + signatureHeight - 13, 8, "bold");
  drawText(page, "Visa ARCQ", rightX + 9, signatureY + signatureHeight - 13, 8, "bold");
}

function drawDeliveryItemsTable(
  page: PdfRenderPage,
  sourceItems: DeliveryItem[],
  tableTop: number,
  tableBottom: number,
  tableWidth: number,
  tableX: number,
) {
  if (sourceItems.length === 0) {
    drawRect(page, tableX, tableBottom, tableWidth, tableTop - tableBottom, { fill: "0.98 0.98 0.98" });
    drawText(page, "Aucun produit confirme", page.width / 2, (tableTop + tableBottom) / 2, 12, "italic", "center");
    return;
  }

  const categories = [
    { key: "beldi", label: "BELDI", matches: (item: DeliveryItem) => item.productCategory === "beldi" },
    { key: "boulangerie", label: "BOULANGERIE", matches: (item: DeliveryItem) => item.productCategory === "boulangerie" },
    { key: "patisserie", label: "PATISSERIE", matches: (item: DeliveryItem) => item.productCategory === "patisserie" || item.productCategory === "cake" },
    { key: "viennoiserie", label: "VIENNOISERIE", matches: (item: DeliveryItem) => item.productCategory === "viennoiserie" },
  ];
  const grouped = categories.map((category) => ({
    ...category,
    items: sourceItems
      .filter(category.matches)
      .sort((left, right) => left.productName.localeCompare(right.productName, "fr", { sensitivity: "base" })),
  }));
  const unmatched = sourceItems.filter((item) => !categories.some((category) => category.matches(item)));
  grouped[2].items.push(...unmatched);

  const availableHeight = tableTop - tableBottom;
  const categoryHeaderHeight = 22;
  const subHeaderHeight = 18;
  const headerHeight = categoryHeaderHeight + subHeaderHeight;
  const availableBodyHeight = availableHeight - headerHeight;
  const categoryWidth = tableWidth / grouped.length;
  const productWidth = categoryWidth * 0.6;
  const lotWidth = categoryWidth - productWidth;
  const productFontSize = 6.8;
  const lotFontSize = 4.9;
  const emptyFontSize = 6.2;

  grouped.forEach((category, categoryIndex) => {
    const x = tableX + categoryIndex * categoryWidth;
    const itemCount = Math.max(1, category.items.length);
    const rowHeight = Math.min(22, availableBodyHeight / itemCount);
    drawRect(page, x, tableTop - categoryHeaderHeight, categoryWidth, categoryHeaderHeight, { fill: "0.87 0.91 0.90" });
    drawText(page, category.label, x + categoryWidth / 2, tableTop - 15, 8, "bold", "center");

    const subHeaderTop = tableTop - categoryHeaderHeight;
    drawRect(page, x, subHeaderTop - subHeaderHeight, productWidth, subHeaderHeight, { fill: "0.92 0.93 0.94" });
    drawText(page, "Produit", x + productWidth / 2, subHeaderTop - 12, 7, "bold", "center");
    drawRect(page, x + productWidth, subHeaderTop - subHeaderHeight, lotWidth, subHeaderHeight, { fill: "0.92 0.93 0.94" });
    drawText(page, "Lot", x + productWidth + lotWidth / 2, subHeaderTop - 12, 7, "bold", "center");

    for (let rowIndex = 0; rowIndex < itemCount; rowIndex += 1) {
      const item = category.items[rowIndex];
      const rowTop = tableTop - headerHeight - rowIndex * rowHeight;
      const fill = rowIndex % 2 === 0 ? "0.98 0.985 0.99" : "1 1 1";
      drawRect(page, x, rowTop - rowHeight, productWidth, rowHeight, { fill });
      drawRect(page, x + productWidth, rowTop - rowHeight, lotWidth, rowHeight, { fill });

      if (item) {
        drawText(
          page,
          fitText(item.productName, productWidth - 6, productFontSize, "regular"),
          x + 3,
          rowTop - rowHeight / 2 - productFontSize * 0.34,
          productFontSize,
          "regular",
        );
        drawText(
          page,
          fitText(item.lotNumber, lotWidth - 6, lotFontSize, "bold"),
          x + productWidth + 3,
          rowTop - rowHeight / 2 - lotFontSize * 0.34,
          lotFontSize,
          "bold",
        );
      } else {
        drawText(page, "Aucun produit", x + categoryWidth / 2, rowTop - rowHeight / 2 - emptyFontSize * 0.34, emptyFontSize, "italic", "center");
      }
    }
  });
}

function sortProductionPdfItemsByDate(items: ProductionPdfData[]) {
  return [...items].sort((left, right) => productionPdfDateValue(left.productionDate) - productionPdfDateValue(right.productionDate));
}

function productionPdfDateValue(value: string) {
  const [day, month, year] = value.split("/").map((part) => Number(part));
  if (!day || !month || !year) return Number.MAX_SAFE_INTEGER;
  return new Date(year, month - 1, day).getTime();
}

function createPage(pageNumber: number, pageSize = a4Landscape): PdfRenderPage {
  return {
    commands: [],
    height: pageSize.height,
    pageNumber,
    width: pageSize.width,
  };
}

function drawDocumentHeader(page: PdfRenderPage, data: ProductionPdfData, logoImage: PdfImageResource | null) {
  const x = pageMargin;
  const top = a4Landscape.height - pageMargin;
  const headerHeight = 56;
  const logoWidth = 120;
  const metaWidth = 250;
  const centerWidth = contentWidth - logoWidth - metaWidth;

  drawRect(page, x, top - headerHeight, logoWidth, headerHeight);
  if (logoImage) {
    drawImageFit(page, logoImage, x + 8, top - headerHeight + 7, logoWidth - 16, headerHeight - 14);
  } else {
    drawText(page, "Casablanca", x + logoWidth / 2, top - 32, 10, "italic", "center");
  }

  drawRect(page, x + logoWidth, top - headerHeight, centerWidth, headerHeight);
  drawText(page, "Enregistrement", x + logoWidth + centerWidth / 2, top - 18, 14, "regular", "center");
  drawText(page, data.title, x + logoWidth + centerWidth / 2, top - 42, 14, "italic", "center");

  drawRect(page, x + logoWidth + centerWidth, top - headerHeight, metaWidth, headerHeight);
  const metaX = x + logoWidth + centerWidth + 8;
  drawText(page, data.documentCode, metaX, top - 12, 8, "regular");
  drawLine(page, x + logoWidth + centerWidth, top - 18, x + contentWidth, top - 18);
  drawText(page, `Version : ${data.version}`, metaX, top - 27, 8, "regular");
  drawLine(page, x + logoWidth + centerWidth, top - 36, x + contentWidth, top - 36);
  drawText(page, `Date d'application : ${data.applicationDate}`, metaX, top - 45, 8, "regular");

  const infoY = top - headerHeight - 18;
  drawText(page, `Date de production : ${data.productionDate}`, x, infoY, 9, "regular");
  if (data.responsibleName) drawText(page, `Fabrique par : ${data.responsibleName}`, x + 120, infoY, 9, "regular");
  drawText(page, `Produit : ${data.targetProductName}`, x + 300, infoY, 9, "bold");
  drawText(page, `Lot : ${data.targetProductLot}`, x + 560, infoY, 9, "bold");

  return infoY - 18;
}

function drawBatchDocumentHeader(page: PdfRenderPage, items: ProductionPdfData[], logoImage: PdfImageResource | null) {
  const x = pageMargin;
  const top = a4Landscape.height - pageMargin;
  const headerHeight = 46;
  const logoWidth = 112;
  const metaWidth = 230;
  const centerWidth = contentWidth - logoWidth - metaWidth;
  const firstItem = items[0];
  const categoryLabel = firstItem?.categoryLabel ?? "Production";

  drawRect(page, x, top - headerHeight, logoWidth, headerHeight);
  if (logoImage) {
    drawImageFit(page, logoImage, x + 8, top - headerHeight + 6, logoWidth - 16, headerHeight - 12);
  } else {
    drawText(page, "Casablanca", x + logoWidth / 2, top - 27, 10, "italic", "center");
  }

  drawRect(page, x + logoWidth, top - headerHeight, centerWidth, headerHeight);
  drawText(page, "Enregistrement", x + logoWidth + centerWidth / 2, top - 15, 13, "regular", "center");
  drawText(page, `Fiche Production ${categoryLabel.toUpperCase()}`, x + logoWidth + centerWidth / 2, top - 34, 13, "italic", "center");

  drawRect(page, x + logoWidth + centerWidth, top - headerHeight, metaWidth, headerHeight);
  const metaX = x + logoWidth + centerWidth + 8;
  drawText(page, firstItem?.documentCode ?? "FP-CASA-01", metaX, top - 11, 8, "regular");
  drawLine(page, x + logoWidth + centerWidth, top - 17, x + contentWidth, top - 17);
  drawText(page, `Version : ${firstItem?.version ?? "A"}`, metaX, top - 26, 8, "regular");
  drawLine(page, x + logoWidth + centerWidth, top - 34, x + contentWidth, top - 34);
  drawText(page, `Date d'application : ${firstItem?.applicationDate ?? applicationDate}`, metaX, top - 42, 8, "regular");

  return top - headerHeight - 12;
}

function drawCompactProductSection(
  page: PdfRenderPage,
  data: ProductionPdfData,
  rows: PdfMeasuredRow[],
  y: number,
  style: PdfTableStyle & { sectionGap: number; sectionTitleHeight: number; tableHeaderHeight: number; headerFontSize: number },
) {
  const titleY = y;
  drawText(page, `Produit : ${data.targetProductName}`, pageMargin, titleY - 8, style.headerFontSize, "bold");
  drawText(page, `Lot : ${data.targetProductLot}`, pageMargin + 280, titleY - 8, style.headerFontSize, "bold");
  drawText(page, `Date de production : ${data.productionDate}`, pageMargin + 470, titleY - 8, style.headerFontSize, "regular");
  if (data.responsibleName) drawText(page, `Fabrique par : ${data.responsibleName}`, pageMargin + 590, titleY - 8, style.headerFontSize, "regular");

  const tableHeaderTop = y - style.sectionTitleHeight;
  const bodyTop = drawCompactTableHeader(page, data.columns, tableHeaderTop, style);
  const tableBottom = drawTableBody(page, data.columns, rows, bodyTop, style);
  return tableBottom - style.sectionGap;
}

function drawCompactTableHeader(
  page: PdfRenderPage,
  columns: PdfColumn[],
  y: number,
  style: { tableHeaderHeight: number; headerFontSize: number; bodyLineHeight: number },
) {
  let x = pageMargin;
  for (const column of columns) {
    drawRect(page, x, y - style.tableHeaderHeight, column.width, style.tableHeaderHeight, { fill: "0.93 0.93 0.93" });
    drawWrappedText(page, column.label, x + 3, y - style.headerFontSize - 3, column.width - 6, style.headerFontSize, "bold", style.bodyLineHeight);
    x += column.width;
  }
  return y - style.tableHeaderHeight;
}

function drawTableHeader(page: PdfRenderPage, columns: PdfColumn[], y: number) {
  const headerHeight = 36;
  let x = pageMargin;
  for (const column of columns) {
    drawRect(page, x, y - headerHeight, column.width, headerHeight, { fill: "0.93 0.93 0.93" });
    drawWrappedText(page, column.label, x + 4, y - 13, column.width - 8, 9, "bold", 11);
    x += column.width;
  }
  return y - headerHeight;
}

function drawTableBody(page: PdfRenderPage, columns: PdfColumn[], rows: PdfMeasuredRow[], topY: number, style: PdfTableStyle) {
  const totalHeight = rows.reduce((total, row) => total + row.height, 0);
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const columnX = new Map<PdfColumnKey, number>();
  let x = pageMargin;

  for (const column of columns) {
    columnX.set(column.key, x);
    x += column.width;
  }

  drawRect(page, pageMargin, topY - totalHeight, tableWidth, totalHeight);
  const semiFinishedPathDepth = maxSemiFinishedPathDepth(rows);

  x = pageMargin;
  for (const column of columns.slice(0, -1)) {
    x += column.width;
    drawLine(page, x, topY, x, topY - totalHeight);
  }

  let boundaryY = topY;
  for (let index = 0; index < rows.length - 1; index += 1) {
    boundaryY -= rows[index].height;
    let boundaryX = pageMargin;
    for (const column of columns) {
      if (!cellsBelongToSameGroup(column.key, rows[index].row, rows[index + 1].row)) {
        if (column.key === "semiFinishedPath") {
          drawSemiFinishedPathBoundary(page, rows[index].row[column.key], rows[index + 1].row[column.key], boundaryX, boundaryY, column.width, semiFinishedPathDepth);
        } else {
          drawLine(page, boundaryX, boundaryY, boundaryX + column.width, boundaryY);
        }
      }
      boundaryX += column.width;
    }
  }

  let rowTop = topY;
  for (const measuredRow of rows) {
    for (const column of columns) {
      if (isMergedColumn(column.key)) continue;
      drawWrappedText(
        page,
        measuredRow.row[column.key],
        (columnX.get(column.key) ?? pageMargin) + 4,
        centeredFirstBaseline(measuredRow.row[column.key], column.width - 8, style.bodyFontSize, style.bodyLineHeight, rowTop, measuredRow.height),
        column.width - 8,
        style.bodyFontSize,
        column.key.includes("Lot") ? "bold" : "regular",
        style.bodyLineHeight,
      );
    }
    rowTop -= measuredRow.height;
  }

  for (const column of columns.filter((candidate) => isMergedColumn(candidate.key))) {
    if (column.key === "semiFinishedPath") {
      drawHierarchicalSemiFinishedPath(page, column, rows, columnX.get(column.key) ?? pageMargin, topY, style);
    } else {
      drawMergedColumnText(page, column, rows, columnX.get(column.key) ?? pageMargin, topY, style);
    }
  }

  return topY - totalHeight;
}

function drawSemiFinishedPathBoundary(
  page: PdfRenderPage,
  currentValue: string,
  nextValue: string,
  x: number,
  y: number,
  width: number,
  depth: number,
) {
  const currentParts = splitSemiFinishedPath(currentValue);
  const nextParts = splitSemiFinishedPath(nextValue);
  const sharedPrefix = sharedSemiFinishedPrefixLength(currentParts, nextParts);
  const safeDepth = Math.max(1, depth);
  const segmentWidth = width / safeDepth;
  const startX = x + Math.min(sharedPrefix, safeDepth - 1) * segmentWidth;

  drawLine(page, startX, y, x + width, y);
}

function drawHierarchicalSemiFinishedPath(
  page: PdfRenderPage,
  column: PdfColumn,
  rows: PdfMeasuredRow[],
  x: number,
  topY: number,
  style: PdfTableStyle,
) {
  const depth = maxSemiFinishedPathDepth(rows);
  if (depth <= 1) {
    drawMergedColumnText(page, column, rows, x, topY, style);
    return;
  }

  const segmentWidth = column.width / depth;

  for (let index = 1; index < depth; index += 1) {
    drawSemiFinishedDepthDivider(page, rows, x + index * segmentWidth, topY, index);
  }

  for (let segmentIndex = 0; segmentIndex < depth; segmentIndex += 1) {
    let groupStart = 0;
    let groupTop = topY;

    while (groupStart < rows.length) {
      const startParts = splitSemiFinishedPath(rows[groupStart].row.semiFinishedPath);
      if (startParts.length <= segmentIndex) {
        groupTop -= rows[groupStart].height;
        groupStart += 1;
        continue;
      }

      let groupEnd = groupStart + 1;
      while (groupEnd < rows.length) {
        const nextParts = splitSemiFinishedPath(rows[groupEnd].row.semiFinishedPath);
        if (nextParts.length <= segmentIndex || !sameSemiFinishedPrefix(startParts, nextParts, segmentIndex + 1)) break;
        groupEnd += 1;
      }

      const groupHeight = rows.slice(groupStart, groupEnd).reduce((total, row) => total + row.height, 0);
      if (segmentIndex >= 2) {
        drawTopCenteredWrappedText(
          page,
          startParts[segmentIndex],
          x + segmentIndex * segmentWidth + 3,
          groupTop,
          segmentWidth - 6,
          style.bodyFontSize,
          "regular",
          style.bodyLineHeight,
        );
      } else {
        drawCenteredWrappedText(
          page,
          startParts[segmentIndex],
          x + segmentIndex * segmentWidth + 3,
          groupTop,
          segmentWidth - 6,
          groupHeight,
          style.bodyFontSize,
          "regular",
          style.bodyLineHeight,
        );
      }

      groupTop -= groupHeight;
      groupStart = groupEnd;
    }
  }
}

function drawSemiFinishedDepthDivider(page: PdfRenderPage, rows: PdfMeasuredRow[], x: number, topY: number, depthIndex: number) {
  let rowIndex = 0;
  let rowTop = topY;

  while (rowIndex < rows.length) {
    const parts = splitSemiFinishedPath(rows[rowIndex].row.semiFinishedPath);
    if (parts.length <= depthIndex) {
      rowTop -= rows[rowIndex].height;
      rowIndex += 1;
      continue;
    }

    const rangeTop = rowTop;
    let rangeBottom = rowTop - rows[rowIndex].height;
    rowTop = rangeBottom;
    rowIndex += 1;

    while (rowIndex < rows.length && splitSemiFinishedPath(rows[rowIndex].row.semiFinishedPath).length > depthIndex) {
      rangeBottom -= rows[rowIndex].height;
      rowTop = rangeBottom;
      rowIndex += 1;
    }

    drawLine(page, x, rangeTop, x, rangeBottom);
  }
}

function drawMergedColumnText(page: PdfRenderPage, column: PdfColumn, rows: PdfMeasuredRow[], x: number, topY: number, style: PdfTableStyle) {
  let groupStart = 0;
  let groupTop = topY;

  while (groupStart < rows.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < rows.length && cellsBelongToSameGroup(column.key, rows[groupEnd - 1].row, rows[groupEnd].row)) {
      groupEnd += 1;
    }

    const groupHeight = rows.slice(groupStart, groupEnd).reduce((total, row) => total + row.height, 0);
    if (column.key === "semiFinishedPath" && splitSemiFinishedPath(rows[groupStart].row[column.key]).length > 1) {
      drawSegmentedSemiFinishedPath(page, rows[groupStart].row[column.key], x, groupTop, column.width, groupHeight, style);
      groupTop -= groupHeight;
      groupStart = groupEnd;
      continue;
    }

    drawCenteredWrappedText(
      page,
      rows[groupStart].row[column.key],
      x + 4,
      groupTop,
      column.width - 8,
      groupHeight,
      style.bodyFontSize,
      column.key.includes("Lot") ? "bold" : "regular",
      style.bodyLineHeight,
    );
    groupTop -= groupHeight;
    groupStart = groupEnd;
  }
}

function drawSegmentedSemiFinishedPath(
  page: PdfRenderPage,
  value: string,
  x: number,
  topY: number,
  width: number,
  height: number,
  style: PdfTableStyle,
) {
  const parts = splitSemiFinishedPath(value);
  const segmentWidth = width / parts.length;

  parts.forEach((part, index) => {
    if (index > 0) {
      const dividerX = x + index * segmentWidth;
      drawLine(page, dividerX, topY, dividerX, topY - height);
    }
    drawCenteredWrappedText(
      page,
      part,
      x + index * segmentWidth + 3,
      topY,
      segmentWidth - 6,
      height,
      style.bodyFontSize,
      "regular",
      style.bodyLineHeight,
    );
  });
}

function isMergedColumn(key: PdfColumnKey) {
  return (
    key === "targetProduct" ||
    key === "semiFinishedPath" ||
    key === "semiFinishedLot" ||
    key === "targetProductLot" ||
    key === "observations"
  );
}

function cellsBelongToSameGroup(key: PdfColumnKey, current: ProductionPdfRow, next: ProductionPdfRow) {
  if (key === "targetProduct") return current.targetProduct === next.targetProduct;
  if (key === "targetProductLot") {
    return current.targetProduct === next.targetProduct && current.targetProductLot === next.targetProductLot;
  }
  if (key === "semiFinishedPath") {
    return current.targetProduct === next.targetProduct && current.semiFinishedPath === next.semiFinishedPath;
  }
  if (key === "semiFinishedLot") {
    return (
      current.targetProduct === next.targetProduct &&
      current.semiFinishedPath === next.semiFinishedPath &&
      current.semiFinishedLot === next.semiFinishedLot
    );
  }
  if (key === "observations") {
    return current.targetProduct === next.targetProduct && current.targetProductLot === next.targetProductLot;
  }
  return false;
}

function drawFooter(page: PdfRenderPage, pageCount: number) {
  drawText(page, `Page : ${page.pageNumber}/${pageCount}`, page.width - pageMargin, pageMargin - 8, 8, "regular", "right");
}

function fitRowsToSinglePage(rows: ProductionPdfRow[], columns: PdfColumn[], availableHeight: number) {
  const styles = [
    { bodyFontSize: 10, bodyLineHeight: 11.6 },
    { bodyFontSize: 9.5, bodyLineHeight: 11 },
    { bodyFontSize: 9, bodyLineHeight: 10.4 },
    { bodyFontSize: 8.5, bodyLineHeight: 10 },
    { bodyFontSize: 8, bodyLineHeight: 9.4 },
    { bodyFontSize: 7.5, bodyLineHeight: 8.8 },
    { bodyFontSize: 7, bodyLineHeight: 8.2 },
    { bodyFontSize: 6.5, bodyLineHeight: 7.6 },
  ];

  let selectedStyle = styles[styles.length - 1];
  let measuredRows = rows.map((row) => ({
    row,
    height: measureRowHeight(row, columns, selectedStyle),
  }));

  for (const style of styles) {
    const candidateRows = rows.map((row) => ({
      row,
      height: measureRowHeight(row, columns, style),
    }));
    const candidateHeight = candidateRows.reduce((total, row) => total + row.height, 0);
    if (candidateHeight <= availableHeight) {
      selectedStyle = style;
      measuredRows = candidateRows;
      break;
    }
  }

  const measuredHeight = measuredRows.reduce((total, row) => total + row.height, 0);
  const scale = measuredHeight > 0 ? availableHeight / measuredHeight : 1;
  const scaledRows = measuredRows.map((row) => ({
    ...row,
    height: row.height * scale,
  }));

  return {
    rows: scaledRows,
    style: selectedStyle,
  };
}

function fitProductionTablesToSinglePage(items: ProductionPdfData[], availableHeight: number) {
  const styles = [
    { bodyFontSize: 8.6, bodyLineHeight: 9.8, headerFontSize: 8.6, sectionGap: 8, sectionTitleHeight: 17, tableHeaderHeight: 23 },
    { bodyFontSize: 8.1, bodyLineHeight: 9.2, headerFontSize: 8.2, sectionGap: 7, sectionTitleHeight: 16, tableHeaderHeight: 21 },
    { bodyFontSize: 7.6, bodyLineHeight: 8.7, headerFontSize: 7.8, sectionGap: 6, sectionTitleHeight: 15, tableHeaderHeight: 20 },
    { bodyFontSize: 7.1, bodyLineHeight: 8.1, headerFontSize: 7.3, sectionGap: 5, sectionTitleHeight: 14, tableHeaderHeight: 18 },
    { bodyFontSize: 6.6, bodyLineHeight: 7.5, headerFontSize: 6.8, sectionGap: 4, sectionTitleHeight: 13, tableHeaderHeight: 17 },
    { bodyFontSize: 6.1, bodyLineHeight: 7, headerFontSize: 6.3, sectionGap: 3, sectionTitleHeight: 12, tableHeaderHeight: 16 },
  ];

  const sourceItems = items.length > 0 ? items : [];
  let selectedStyle = styles[styles.length - 1];
  let sections = measureProductionSections(sourceItems, selectedStyle);

  for (const style of styles) {
    const candidateSections = measureProductionSections(sourceItems, style);
    const candidateHeight = productionSectionsHeight(candidateSections, style);
    if (candidateHeight <= availableHeight) {
      selectedStyle = style;
      sections = candidateSections;
      break;
    }
  }

  const fixedHeight = sections.length * (selectedStyle.sectionTitleHeight + selectedStyle.tableHeaderHeight + selectedStyle.sectionGap);
  const rowHeight = sections.reduce((total, section) => total + section.rows.reduce((rowTotal, row) => rowTotal + row.height, 0), 0);
  const availableRowHeight = Math.max(20, availableHeight - fixedHeight);
  const scale = rowHeight > 0 && rowHeight > availableRowHeight ? availableRowHeight / rowHeight : 1;
  const scaledSections =
    scale < 1
      ? sections.map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({
            ...row,
            height: row.height * scale,
          })),
        }))
      : sections;

  return {
    sections: scaledSections,
    style: selectedStyle,
  };
}

function measureProductionSections(
  items: ProductionPdfData[],
  style: PdfTableStyle & { sectionGap: number; sectionTitleHeight: number; tableHeaderHeight: number; headerFontSize: number },
) {
  return items.map((data) => {
    const rows = data.rows.length > 0 ? data.rows : [emptyRow(data)];
    return {
      data,
      rows: rows.map((row) => ({
        row,
        height: measureRowHeight(row, data.columns, style),
      })),
    };
  });
}

function productionSectionsHeight(
  sections: Array<{ rows: PdfMeasuredRow[] }>,
  style: { sectionGap: number; sectionTitleHeight: number; tableHeaderHeight: number },
) {
  return sections.reduce(
    (total, section) => total + style.sectionTitleHeight + style.tableHeaderHeight + section.rows.reduce((rowTotal, row) => rowTotal + row.height, 0) + style.sectionGap,
    0,
  );
}

function measureRowHeight(row: ProductionPdfRow, columns: PdfColumn[], style: PdfTableStyle) {
  const maxLines = Math.max(
    1,
    ...columns.map((column) => measureCellLineCount(row[column.key], column, style.bodyFontSize)),
  );
  return Math.max(style.bodyLineHeight + 7, maxLines * style.bodyLineHeight + 6);
}

function measureCellLineCount(value: string, column: PdfColumn, size: number) {
  if (column.key !== "semiFinishedPath") return wrapText(value, column.width - 8, size).length;
  const parts = splitSemiFinishedPath(value);
  if (parts.length <= 1) return wrapText(value, column.width - 8, size).length;
  const segmentWidth = column.width / parts.length - 6;
  return Math.max(...parts.map((part) => Math.max(1, wrapText(part, segmentWidth, size).length)));
}

function emptyRow(data: ProductionPdfData): ProductionPdfRow {
  return {
    targetProduct: data.targetProductName,
    semiFinishedPath: "",
    rawMaterial: "Aucun composant",
    rawMaterialLot: "",
    semiFinishedLot: "",
    targetProductLot: data.targetProductLot,
    observations: "",
  };
}

function drawWrappedText(page: PdfRenderPage, value: string, x: number, y: number, maxWidth: number, size: number, font: "regular" | "bold" | "italic", lineHeight: number) {
  wrapText(value, maxWidth, size).forEach((line, index) => {
    drawText(page, line, x, y - index * lineHeight, size, font);
  });
}

function centeredFirstBaseline(value: string, width: number, size: number, lineHeight: number, topY: number, height: number) {
  const lines = wrapText(value, width, size);
  const textBlockHeight = (lines.length - 1) * lineHeight + size;
  return topY - Math.max(0, (height - textBlockHeight) / 2) - size * 0.78;
}

function drawCenteredWrappedText(
  page: PdfRenderPage,
  value: string,
  x: number,
  topY: number,
  width: number,
  height: number,
  size: number,
  font: "regular" | "bold" | "italic",
  lineHeight: number,
) {
  const lines = wrapText(value, width, size);
  const textBlockHeight = (lines.length - 1) * lineHeight + size;
  const firstBaseline = topY - Math.max(0, (height - textBlockHeight) / 2) - size * 0.78;

  lines.forEach((line, index) => {
    drawText(page, line, x + width / 2, firstBaseline - index * lineHeight, size, font, "center");
  });
}

function drawTopCenteredWrappedText(
  page: PdfRenderPage,
  value: string,
  x: number,
  topY: number,
  width: number,
  size: number,
  font: "regular" | "bold" | "italic",
  lineHeight: number,
) {
  const firstBaseline = topY - size * 1.25;
  wrapText(value, width, size).forEach((line, index) => {
    drawText(page, line, x + width / 2, firstBaseline - index * lineHeight, size, font, "center");
  });
}

function wrapText(value: string, maxWidth: number, size: number) {
  const text = sanitizeText(value || "");
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function splitSemiFinishedPath(value: string) {
  return sanitizeText(value)
    .split(/\s*>\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function maxSemiFinishedPathDepth(rows: PdfMeasuredRow[]) {
  return Math.max(1, ...rows.map((row) => splitSemiFinishedPath(row.row.semiFinishedPath).length));
}

function sharedSemiFinishedPrefixLength(first: string[], second: string[]) {
  let count = 0;
  while (count < first.length && count < second.length && first[count] === second[count]) {
    count += 1;
  }
  return count;
}

function sameSemiFinishedPrefix(first: string[], second: string[], length: number) {
  if (first.length < length || second.length < length) return false;
  for (let index = 0; index < length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

type PdfFontStyle = "regular" | "bold" | "italic";

const helveticaRegularWidths: Record<string, number> = {
  " ": 278,
  "!": 278,
  "\"": 355,
  "#": 556,
  "$": 556,
  "%": 889,
  "&": 667,
  "'": 191,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  _: 556,
  "`": 333,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
};

const helveticaBoldWidths: Record<string, number> = {
  ...helveticaRegularWidths,
  "!": 333,
  "\"": 474,
  "&": 722,
  "'": 238,
  ":": 333,
  ";": 333,
  "?": 611,
  "@": 975,
  "[": 333,
  "]": 333,
  "^": 584,
  "{": 389,
  "|": 280,
  "}": 389,
  A: 722,
  B: 722,
  D: 722,
  I: 278,
  J: 556,
  K: 722,
  L: 611,
  P: 667,
  R: 722,
  a: 556,
  b: 611,
  c: 556,
  d: 611,
  f: 333,
  g: 611,
  h: 611,
  i: 278,
  j: 278,
  k: 556,
  l: 278,
  m: 889,
  n: 611,
  o: 611,
  p: 611,
  q: 611,
  r: 389,
  s: 556,
  t: 333,
  u: 611,
  v: 556,
  w: 778,
  x: 556,
  y: 556,
};

function textWidth(value: string, size: number, font: PdfFontStyle = "regular") {
  const widths = font === "bold" ? helveticaBoldWidths : helveticaRegularWidths;
  return [...value].reduce((width, character) => {
    const glyphWidth = /[0-9]/.test(character) ? 556 : (widths[character] ?? 556);
    return width + (glyphWidth * size) / 1000;
  }, 0);
}

function fitText(value: string, maxWidth: number, size: number, font: PdfFontStyle) {
  const text = sanitizeText(value || "");
  if (textWidth(text, size, font) <= maxWidth) return text;

  let fitted = text;
  while (fitted.length > 1 && textWidth(`${fitted}...`, size, font) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}...`;
}

function drawText(
  page: PdfRenderPage,
  value: string,
  x: number,
  y: number,
  size: number,
  font: PdfFontStyle,
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

function bytesToHex(bytes: Uint8Array) {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0").toUpperCase();
  }
  return hex;
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xObjectResources} >> /Contents ${contentId} 0 R >>`,
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

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function sanitizeText(value: string) {
  return value
    .replace(/N°/g, "No")
    .replace(/n°/g, "no")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/°/g, "o")
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
