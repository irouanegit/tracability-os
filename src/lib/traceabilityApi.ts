import { supabase } from "./supabase";
import { formatFrenchDate, formatFrenchDateTime } from "./dateFormat";

export type ProductType = "raw" | "semi_finished" | "finished";
export type ProductCategory = "beldi" | "boulangerie" | "cake" | "patisserie" | "viennoiserie";
export type RecipeStatus = "active" | "missing" | "not_required";
export type ReceptionStatus = "conforme" | "non_conforme";

export type Product = {
  id: string;
  code: string;
  name: string;
  type: ProductType;
  category: ProductCategory | null;
  unit: string;
  recipeStatus: RecipeStatus;
  componentCount: number;
  componentNames: string[];
  lotZone: string | null;
  lotCode: string | null;
  createdBy: AuditActor;
  updatedBy: AuditActor;
  schemaUpdatedBy: AuditActor;
  schemaUpdatedAt: string | null;
  lastUpdated: string;
};

export type LotStockPreview = {
  productId: string;
  availableLotCount: number;
  totalAvailable: number;
  unit: string;
  lotNumber: string | null;
};

export type ProductSchemaNode = Product & {
  stock: LotStockPreview | null;
  children: ProductSchemaNode[];
};

export type SchemaDiagramNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: {
    productId?: string;
    isTarget?: boolean;
  };
};

export type SchemaDiagramEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
};

export type SchemaDiagramViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type ProductSchemaDiagram = {
  recipeId: string | null;
  components: ProductSchemaNode[];
  diagramProducts: Product[];
  diagramNodes: SchemaDiagramNode[];
  diagramEdges: SchemaDiagramEdge[];
  diagramViewport: SchemaDiagramViewport | null;
};

export type Supplier = {
  id: string;
  name: string;
  contact: string | null;
  isActive: boolean;
};

export type SupplierInput = {
  name: string;
  contact: string | null;
};

export type RawMaterialInput = {
  name: string;
  unit: "piece" | "kg";
};

export type RecentReception = {
  id: string;
  date: string;
  product: string;
  supplier: string;
  supplierLot: string;
  internalLot: string;
  quantity: string;
  expiry: string;
  status: ReceptionStatus;
};

export type AuditActor = {
  id: string | null;
  name: string | null;
  email: string | null;
};

const emptyAuditActor: AuditActor = { id: null, name: null, email: null };

export type ReceptionBatch = {
  id: string;
  batchNumber: string;
  receptionDate: string;
  supplierId: string;
  supplierName: string;
  articleCount: number;
  quantitySummary: string;
  status: ReceptionStatus;
  observations: string | null;
  validatedBy: AuditActor;
  validatedAt: string | null;
  updatedBy: AuditActor;
  updatedAt: string | null;
  exportedBy: AuditActor;
  exportedAt: string | null;
};

export type ReceptionBatchLine = {
  id: string;
  batchId: string;
  productId: string;
  productCode: string;
  productName: string;
  supplierLot: string;
  internalLot: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  transportTemperatureC: number | null;
  temperatureStatus: ReceptionStatus;
  hygieneStatus: ReceptionStatus;
  status: ReceptionStatus;
  observations: string | null;
};

export type ReceptionInput = {
  receptionDate: string;
  productName: string;
  supplierName: string;
  supplierLot: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  transportTemperatureC: number | null;
  temperatureStatus: ReceptionStatus;
  hygieneStatus: ReceptionStatus;
  nonconformityReason: string | null;
  correctiveAction: string | null;
  observations: string | null;
};

export type ReceptionBatchLineInput = {
  id?: string;
  productId: string;
  supplierLot: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  transportTemperatureC: number | null;
  temperatureStatus: ReceptionStatus;
  hygieneStatus: ReceptionStatus;
  observations: string | null;
};

export type ReceptionBatchInput = {
  supplierId: string;
  receptionDate: string;
  observations: string | null;
  lines: ReceptionBatchLineInput[];
};

export type ReceptionBatchUpdateInput = ReceptionBatchInput & {
  batchId: string;
  mergedBatchIds: string[];
};

export type FabricationInput = {
  productionDate: string;
  productName: string;
  productType: Exclude<ProductType, "raw">;
  generatedLot: string;
  quantityProduced: number;
  unit: string;
  responsibleName: string | null;
  operation: string | null;
  observations: string | null;
};

export type ProductionBatch = {
  id: string;
  planId: string | null;
  productionDate: string;
  productId: string;
  productCode: string;
  productName: string;
  productType: Exclude<ProductType, "raw">;
  category: ProductCategory | null;
  generatedLot: string;
  responsibleName: string | null;
  operation: string | null;
  status: "draft" | "validated" | "cancelled";
  observations: string | null;
  consumedLotCount: number;
  traceabilitySnapshot: ProductionTraceabilitySnapshot | null;
  confirmedBy: AuditActor;
  confirmedAt: string | null;
  updatedBy: AuditActor;
  updatedAt: string | null;
  exportedBy: AuditActor;
  exportedAt: string | null;
  createdAt: string;
};

export type ProductionBatchSourceFilter = "all" | "manual" | "planned";
export type ProductionBatchCounts = Record<ProductionBatchSourceFilter, number>;

export type DeliveryStore = "AL QODS" | "MIMOUZA" | "CHEFCHAOUNI" | "MOHAMMEDIA" | "ORCHIDÉE";
export type DeliveryNumber = 1 | 2 | 3 | 4;

export type DeliveryConfirmation = {
  id: string;
  deliveryDate: string;
  storeName: DeliveryStore;
  deliveryNumber: DeliveryNumber;
  productId: string;
  productionBatchId: string;
  lotNumber: string;
  confirmedAt: string;
  createdAt: string;
};

export type DeliveryRecord = {
  id: string;
  deliveryCode: string;
  deliveryDate: string;
  storeName: DeliveryStore;
  deliveryNumber: DeliveryNumber;
  status: "confirmed" | "cancelled";
  confirmedProductCount: number;
  confirmedAt: string;
  createdAt: string;
};

export type DeliveryItem = {
  id: string;
  deliveryId: string;
  productId: string;
  productionBatchId: string;
  productCode: string;
  productName: string;
  productCategory: ProductCategory | null;
  lotNumber: string;
  confirmedAt: string;
};

export type DeliveryDraftItem = {
  productId: string;
  productionBatchId: string;
};

export type ProductionConsumptionDetail = {
  id: string;
  batchId: string;
  componentNodeKey: string | null;
  parentComponentNodeKey: string | null;
  componentDepth: number | null;
  selectedComponentProductId: string | null;
  expectedProductId: string;
  expectedProductCode: string;
  expectedProductName: string;
  expectedProductType: ProductType;
  expectedCategory: ProductCategory | null;
  lotId: string;
  lotNumber: string;
  productId: string;
  productCode: string;
  productName: string;
  productType: ProductType;
  category: ProductCategory | null;
  supplierLot: string | null;
  supplierName: string | null;
  sourceType: "reception" | "fabrication";
  lotCreatedAt: string;
  linkedAt: string;
};

export type ProductionTraceabilitySelection = {
  nodeKey?: string;
  parentNodeKey?: string | null;
  depth?: number;
  expectedProductId: string;
  selectedProductId?: string;
  consumedLotId: string;
};

export type ProductionTraceabilityLot = {
  lotId: string;
  lotNumber: string;
  supplierLot: string | null;
  supplierName?: string | null;
  sourceType: "reception" | "fabrication";
  lotCreatedAt: string;
  productId?: string;
  productName?: string;
  productType?: ProductType;
  productCategory?: ProductCategory | null;
  expectedProductId?: string;
  expectedProductName?: string;
};

export type ProductionTraceabilityNode = {
  nodeId: string;
  parentNodeId: string;
  productId: string;
  productName: string;
  productType: ProductType;
  depth: number;
  lots: ProductionTraceabilityLot[];
};

export type ProductionTraceabilitySnapshot = {
  version: 1;
  root: {
    productId: string;
    productName: string;
    productType: Exclude<ProductType, "raw">;
    lotNumber: string;
  };
  components: ProductionTraceabilityNode[];
  diagram: {
    nodes: SchemaDiagramNode[];
    edges: SchemaDiagramEdge[];
    viewport: SchemaDiagramViewport | null;
  };
};

function parseProductionTraceabilitySnapshot(value: unknown): ProductionTraceabilitySnapshot | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.root) || !Array.isArray(value.components) || !isRecord(value.diagram)) {
    return null;
  }

  const root = value.root;
  if (
    typeof root.productId !== "string" ||
    typeof root.productName !== "string" ||
    (root.productType !== "finished" && root.productType !== "semi_finished") ||
    typeof root.lotNumber !== "string"
  ) {
    return null;
  }

  return value as unknown as ProductionTraceabilitySnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AvailableLotOption = {
  id: string;
  productId: string;
  productName: string | null;
  productType: ProductType | null;
  productCategory: ProductCategory | null;
  lotNumber: string;
  supplierLot: string | null;
  supplierName: string | null;
  sourceType: "reception" | "fabrication";
  sourceId: string | null;
  createdAt: string;
  responsibleName: string | null;
};

export type ProductionTraceabilityInput = {
  planId?: string;
  productionDate: string;
  productId: string;
  generatedLot: string;
  responsibleName: string | null;
  operation: string | null;
  observations: string | null;
  consumedLotIds: string[];
  consumedLotSelections?: ProductionTraceabilitySelection[];
};

export type ProductionPlanDerivedStatus =
  | "blocked"
  | "waiting"
  | "ready"
  | "overdue"
  | "recipe_changed"
  | "completed"
  | "cancelled";

export type ProductionPlanSeriesStatus = "active" | "paused" | "archived";

export type ProductionPlan = {
  id: string;
  seriesId: string;
  seriesStatus: ProductionPlanSeriesStatus;
  planName: string;
  productId: string;
  productCode: string;
  productName: string;
  productType: Exclude<ProductType, "raw">;
  productCategory: ProductCategory | null;
  plannedDate: string;
  plannedTime: string;
  recipeId: string;
  recipeVersion: number;
  schemaSnapshot: Record<string, unknown>;
  productionBatchId: string | null;
  responsibleName: string | null;
  notes: string | null;
  storedStatus: "planned" | "completed" | "cancelled";
  derivedStatus: ProductionPlanDerivedStatus;
  dependencyCount: number;
  blockerCount: number;
  waitingCount: number;
  frequency: "once" | "daily" | "weekdays" | "every_n_days" | "specific_days";
  intervalDays: number;
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  cancelledReason: string | null;
  createdBy: AuditActor;
  createdAt: string;
  updatedAt: string;
};

export type ProductionPlanDependency = {
  id: string;
  planId: string;
  nodeKey: string;
  parentNodeKey: string | null;
  depth: number;
  expectedProductId: string;
  expectedProductName: string;
  expectedProductType: ProductType;
  selectedProductId: string;
  selectedProductName: string;
  selectedProductType: ProductType;
  sourceKind: "water" | "raw_lot" | "existing_production_lot" | "planned_production";
  sourceLotId: string | null;
  lotNumber: string | null;
  supplierLot: string | null;
  supplierName: string | null;
  lotDate: string | null;
  sourcePlanId: string | null;
  sourcePlanProductId: string | null;
  sourcePlanProductName: string | null;
  sourcePlanDate: string | null;
  sourcePlanTime: string | null;
  sourcePlanStatus: "planned" | "completed" | "cancelled" | null;
};

export type PlanningEligibleLot = {
  id: string;
  productId: string;
  productName: string;
  productType: ProductType;
  productCategory: ProductCategory | null;
  substitutionGroup: string | null;
  lotNumber: string;
  supplierLot: string | null;
  supplierName: string | null;
  sourceType: "reception" | "fabrication";
  effectiveDate: string;
  expiryDate: string | null;
};

export type ActiveRecipeMetadata = {
  id: string;
  productId: string;
  version: number;
  diagramNodes: SchemaDiagramNode[];
  diagramEdges: SchemaDiagramEdge[];
  diagramViewport: SchemaDiagramViewport | null;
  updatedAt: string;
};

export type ProductionPlanSeriesInput = {
  id: string;
  planName: string;
  productId: string;
  frequency: ProductionPlan["frequency"];
  intervalDays: number;
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  plannedTime: string;
};

export type ProductionPlanOccurrenceInput = {
  id: string;
  seriesId: string;
  productId: string;
  plannedDate: string;
  plannedTime: string;
  recipeId: string;
  recipeVersion: number;
  schemaSnapshot: Record<string, unknown>;
  responsibleName: string | null;
  notes: string | null;
};

export type ProductionPlanDependencyInput = {
  id?: string;
  planId: string;
  nodeKey: string;
  parentNodeKey: string | null;
  depth: number;
  expectedProductId: string;
  selectedProductId: string;
  sourceKind: ProductionPlanDependency["sourceKind"];
  sourceLotId: string | null;
  sourcePlanId: string | null;
};

export type ProductionPlanConfirmationContext = {
  planId: string;
  productId: string;
  plannedDate: string;
  plannedTime: string;
  responsibleName: string | null;
  status: ProductionPlanDerivedStatus;
  selections: Array<{
    expectedProductId: string;
    selectedProductId: string;
    lotId: string | null;
  }>;
};

export type ProductCatalogInput = {
  name: string;
  type: Exclude<ProductType, "raw">;
  category?: ProductCategory;
  lotNumber: string;
  lotZone?: string;
  lotCode?: string;
};

export type ProductCatalogUpdateInput = {
  name: string;
  type: ProductType;
  category?: ProductCategory | null;
  unit?: string;
};

export function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint, candidate.code].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );

    if (parts.length > 0) return parts.join(" ");
  }

  return fallback;
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = [candidate.message, candidate.details, candidate.code].filter((value): value is string => typeof value === "string").join(" ");
  return text.includes(column) && (text.includes("column") || text.includes("schema cache") || text.includes("PGRST204"));
}

export async function fetchProductCatalog(): Promise<Product[]> {
  if (!supabase) return [];

  const fullSelect =
    "id, code, name, type, category, unit, recipe_status, component_count, updated_at, lot_zone, lot_code, created_by, created_by_name, created_by_email, updated_by, updated_by_name, updated_by_email, schema_updated_by, schema_updated_by_name, schema_updated_by_email, schema_updated_at";
  const lotSelect = "id, code, name, type, category, unit, recipe_status, component_count, updated_at, lot_zone, lot_code";
  const categorySelect = "id, code, name, type, category, unit, recipe_status, component_count, updated_at";
  const legacySelect = "id, code, name, type, unit, recipe_status, component_count, updated_at";
  const fullQuery = await supabase
    .from("product_catalog")
    .select(fullSelect)
    .order("type")
    .order("name");
  let data = (fullQuery.data ?? null) as Array<Record<string, any>> | null;
  let error = fullQuery.error;

  if (
    error &&
    (isMissingColumnError(error, "created_by") ||
      isMissingColumnError(error, "updated_by") ||
      isMissingColumnError(error, "schema_updated_by"))
  ) {
    const fallback = await supabase
      .from("product_catalog")
      .select(lotSelect)
      .order("type")
      .order("name");
    data = fallback.data ?? null;
    error = fallback.error;
  }

  if (error && (isMissingColumnError(error, "lot_zone") || isMissingColumnError(error, "lot_code"))) {
    const fallback = await supabase
      .from("product_catalog")
      .select(categorySelect)
      .order("type")
      .order("name");
    data = fallback.data?.map((row) => ({ ...row, lot_zone: null, lot_code: null })) ?? null;
    error = fallback.error;
  }

  if (error && isMissingColumnError(error, "category")) {
    const fallback = await supabase
      .from("product_catalog")
      .select(legacySelect)
      .order("type")
      .order("name");
    data = fallback.data?.map((row) => ({ ...row, category: null, lot_zone: null, lot_code: null })) ?? null;
    error = fallback.error;
  }

  if (error) throw error;

  const componentNamesByTargetId = await fetchProductComponentNamesByTargetId();

  return (data ?? []).map((row) => mapProductCatalogRow(row, componentNamesByTargetId[row.id] ?? []));
}

async function fetchProductComponentNamesByTargetId(): Promise<Record<string, string[]>> {
  try {
    const rows = await fetchAllProductSchemaComponentRows();
    const rowsByTargetId = new Map<string, typeof rows>();
    const namesByTargetId: Record<string, string[]> = {};

    for (const row of rows) {
      const targetRows = rowsByTargetId.get(row.target_product_id) ?? [];
      targetRows.push(row);
      rowsByTargetId.set(row.target_product_id, targetRows);
    }

    function collectComponentNames(targetId: string, visitedTargetIds: Set<string>) {
      const names = new Set<string>();
      const seenComponentIds = new Set<string>();

      for (const row of rowsByTargetId.get(targetId) ?? []) {
        if (seenComponentIds.has(row.component_product_id)) continue;
        seenComponentIds.add(row.component_product_id);
        names.add(row.component_name);

        if (row.component_type !== "semi_finished" || row.component_recipe_status !== "active" || visitedTargetIds.has(row.component_product_id)) {
          continue;
        }

        const nextVisitedTargetIds = new Set(visitedTargetIds);
        nextVisitedTargetIds.add(row.component_product_id);
        for (const childName of collectComponentNames(row.component_product_id, nextVisitedTargetIds)) {
          names.add(childName);
        }
      }

      return [...names];
    }

    for (const targetId of rowsByTargetId.keys()) {
      namesByTargetId[targetId] = collectComponentNames(targetId, new Set([targetId]));
    }

    return namesByTargetId;
  } catch (error) {
    logDevWarning("Product component filter metadata load skipped", error);
    return {};
  }
}

export async function fetchLotStockPreview(productIds?: string[]): Promise<Record<string, LotStockPreview>> {
  if (!supabase) return {};
  if (productIds && productIds.length === 0) return {};

  let query = supabase.from("product_lot_stock").select("product_id, available_lot_count, total_available, unit");

  if (productIds) {
    query = query.in("product_id", productIds);
  }

  const { data, error } = await query;

  if (error) throw error;

  const stockByProductId = Object.fromEntries(
    (data ?? []).map((row) => [
      row.product_id,
      {
        productId: row.product_id,
        availableLotCount: row.available_lot_count ?? 0,
        totalAvailable: Number(row.total_available ?? 0),
        unit: row.unit,
        lotNumber: null,
      },
    ]),
  );

  const lotProductIds = productIds ?? Object.keys(stockByProductId);
  if (lotProductIds.length > 0) {
    const { data: lots, error: lotsError } = await supabase
      .from("lots")
      .select("product_id, lot_number, created_at")
      .in("product_id", lotProductIds)
      .eq("lot_status", "available")
      .eq("quality_status", "conforme")
      .order("created_at", { ascending: false });

    if (lotsError) throw lotsError;

    for (const lot of lots ?? []) {
      const existing = stockByProductId[lot.product_id];
      if (!existing || existing.lotNumber) continue;
      existing.lotNumber = lot.lot_number;
    }
  }

  return stockByProductId;
}

export async function fetchProductSchema(productId: string): Promise<ProductSchemaNode[]> {
  if (!supabase || !productId) return [];

  const rows = await fetchProductSchemaTreeRows(productId);
  const stockByProductId = await fetchLotStockPreview([...new Set(rows.map((row) => row.component_product_id))]);
  const rowsByTarget = new Map<string, typeof rows>();

  for (const row of rows) {
    const targetRows = rowsByTarget.get(row.target_product_id) ?? [];
    targetRows.push(row);
    rowsByTarget.set(row.target_product_id, targetRows);
  }

  function buildChildren(targetId: string, visitedIds: Set<string>): ProductSchemaNode[] {
    const seenComponentIds = new Set<string>();
    return (rowsByTarget.get(targetId) ?? []).flatMap((row) => {
      if (seenComponentIds.has(row.component_product_id)) return [];
      seenComponentIds.add(row.component_product_id);

      const nextVisitedIds = new Set(visitedIds);
      nextVisitedIds.add(row.component_product_id);

      const component: ProductSchemaNode = {
        id: row.component_product_id,
        code: row.component_code,
        name: row.component_name,
        type: row.component_type,
        category: row.component_category,
        unit: row.component_unit,
        recipeStatus: row.component_recipe_status,
        componentCount: row.component_count ?? 0,
        componentNames: [],
        lotZone: row.component_lot_zone ?? null,
        lotCode: row.component_lot_code ?? null,
        createdBy: emptyAuditActor,
        updatedBy: emptyAuditActor,
        schemaUpdatedBy: emptyAuditActor,
        schemaUpdatedAt: null,
        lastUpdated: "",
        stock: stockByProductId[row.component_product_id] ?? null,
        children:
          row.component_type === "semi_finished" && row.component_recipe_status === "active" && !visitedIds.has(row.component_product_id)
            ? buildChildren(row.component_product_id, nextVisitedIds)
            : [],
      };

      return [component];
    });
  }

  return buildChildren(productId, new Set([productId]));
}

type ProductSchemaComponentRow = {
  recipe_id: string;
  target_product_id: string;
  component_product_id: string;
  component_code: string;
  component_name: string;
  component_type: ProductType;
  component_category: ProductCategory | null;
  component_unit: string;
  component_recipe_status: RecipeStatus;
  component_count: number | null;
  component_lot_zone?: string | null;
  component_lot_code?: string | null;
};

async function fetchProductSchemaTreeRows(productId: string) {
  const rows: ProductSchemaComponentRow[] = [];
  const visitedTargetIds = new Set<string>();
  let pendingTargetIds = [productId];

  while (pendingTargetIds.length > 0) {
    const targetIds = [...new Set(pendingTargetIds)].filter((targetId) => !visitedTargetIds.has(targetId));
    pendingTargetIds = [];
    if (targetIds.length === 0) break;

    targetIds.forEach((targetId) => visitedTargetIds.add(targetId));
    const targetRows = await fetchProductSchemaComponentRows(targetIds);
    rows.push(...targetRows);

    for (const row of targetRows) {
      if (
        row.component_type === "semi_finished" &&
        row.component_recipe_status === "active" &&
        !visitedTargetIds.has(row.component_product_id)
      ) {
        pendingTargetIds.push(row.component_product_id);
      }
    }
  }

  return rows;
}

async function fetchAllProductSchemaComponentRows(includeCodification = true) {
  return fetchProductSchemaComponentRows(null, includeCodification);
}

async function fetchProductSchemaComponentRows(targetIds: string[] | null, includeCodification = true) {
  if (!supabase) return [];

  const pageSize = 1_000;
  const rows: ProductSchemaComponentRow[] = [];

  const baseSelect =
    "recipe_id, target_product_id, component_product_id, component_code, component_name, component_type, component_category, component_unit, component_recipe_status, component_count";
  const fullSelect = `${baseSelect}, component_lot_zone, component_lot_code`;

  for (let from = 0; ; from += pageSize) {
    const baseQuery = supabase
      .from("product_schema_components")
      .select(includeCodification ? fullSelect : baseSelect);
    const filteredQuery = targetIds && targetIds.length > 0 ? baseQuery.in("target_product_id", targetIds) : baseQuery;
    const { data, error } = await filteredQuery
      .order("target_product_id")
      .order("recipe_id")
      .order("component_product_id")
      .range(from, from + pageSize - 1);

    if (error) {
      if (includeCodification && (isMissingColumnError(error, "component_lot_zone") || isMissingColumnError(error, "component_lot_code"))) {
        return fetchProductSchemaComponentRows(targetIds, false);
      }
      throw error;
    }

    rows.push(...((data ?? []) as unknown as ProductSchemaComponentRow[]));
    if (!data || data.length < pageSize) break;
  }

  if (targetIds && targetIds.length > 0) {
    const returnedTargetIds = new Set(rows.map((row) => row.target_product_id));
    const missingTargetIds = targetIds.filter((targetId) => !returnedTargetIds.has(targetId));
    if (missingTargetIds.length > 0) {
      rows.push(...(await fetchProductSchemaComponentRowsDirect(missingTargetIds, includeCodification)));
    }
  }

  return rows;
}

async function fetchProductSchemaComponentRowsDirect(targetIds: string[], includeCodification: boolean) {
  if (!supabase || targetIds.length === 0) return [];

  const { data: recipeRows, error: recipeError } = await supabase
    .from("recipes")
    .select("id, product_id, version")
    .in("product_id", targetIds)
    .eq("is_active", true);
  if (recipeError) throw recipeError;

  const recipeIds = (recipeRows ?? []).map((row) => row.id);
  if (recipeIds.length === 0) return [];

  const { data: componentRows, error: componentError } = await supabase
    .from("recipe_components")
    .select("recipe_id, component_product_id")
    .in("recipe_id", recipeIds);
  if (componentError) throw componentError;

  const componentProductIds = [...new Set((componentRows ?? []).map((row) => row.component_product_id))];
  if (componentProductIds.length === 0) return [];

  type DirectProductRow = {
    id: string;
    code: string;
    name: string;
    type: ProductType;
    category: ProductCategory | null;
    unit: string;
    recipe_status: RecipeStatus;
    component_count: number | null;
    lot_zone?: string | null;
    lot_code?: string | null;
  };
  const baseSelect = "id, code, name, type, category, unit, recipe_status, component_count";
  const fullSelect = `${baseSelect}, lot_zone, lot_code`;
  const initialProductsResult = await supabase
    .from("product_catalog")
    .select(includeCodification ? fullSelect : baseSelect)
    .in("id", componentProductIds);
  let productRows = (initialProductsResult.data ?? []) as unknown as DirectProductRow[];
  let productError = initialProductsResult.error;

  if (
    productError &&
    includeCodification &&
    (isMissingColumnError(productError, "lot_zone") || isMissingColumnError(productError, "lot_code"))
  ) {
    const fallback = await supabase.from("product_catalog").select(baseSelect).in("id", componentProductIds);
    productRows = (fallback.data ?? []) as unknown as DirectProductRow[];
    productError = fallback.error;
  }
  if (productError) throw productError;

  const recipeById = new Map((recipeRows ?? []).map((row) => [row.id, row]));
  const productById = new Map((productRows ?? []).map((row) => [row.id, row]));

  return (componentRows ?? []).flatMap<ProductSchemaComponentRow>((componentRow) => {
    const recipe = recipeById.get(componentRow.recipe_id);
    const product = productById.get(componentRow.component_product_id);
    if (!recipe || !product) return [];

    return [{
      recipe_id: recipe.id,
      target_product_id: recipe.product_id,
      component_product_id: product.id,
      component_code: product.code,
      component_name: product.name,
      component_type: product.type,
      component_category: product.category ?? null,
      component_unit: product.unit,
      component_recipe_status: product.recipe_status,
      component_count: product.component_count ?? 0,
      component_lot_zone: product.lot_zone ?? null,
      component_lot_code: product.lot_code ?? null,
    }];
  });
}

export async function fetchProductSchemaDiagram(productId: string): Promise<ProductSchemaDiagram> {
  let components: ProductSchemaNode[] = [];

  try {
    components = await fetchProductSchema(productId);
  } catch (error) {
    logDevWarning("Product schema components load skipped", error);
  }

  if (!supabase || !productId) {
    return {
      recipeId: null,
      components,
      diagramProducts: [],
      diagramNodes: [],
      diagramEdges: [],
      diagramViewport: null,
    };
  }

  const { data, error } = await supabase
    .from("recipes")
    .select("id, diagram_nodes, diagram_edges, diagram_viewport")
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (error.message.includes("diagram_nodes") || error.message.includes("diagram_edges") || error.message.includes("diagram_viewport")) {
      return {
        recipeId: null,
        components,
        diagramProducts: [],
        diagramNodes: [],
        diagramEdges: [],
        diagramViewport: null,
      };
    }

    throw error;
  }

  const diagramNodes = Array.isArray(data?.diagram_nodes) ? data.diagram_nodes : [];
  const diagramProductIds = [
    ...new Set(
      diagramNodes
        .map((node) => node.data?.productId ?? node.id)
        .filter((productId): productId is string => typeof productId === "string" && productId.length > 0),
    ),
  ];
  const diagramProducts = await fetchProductCatalogByIds(diagramProductIds);

  return {
    recipeId: data?.id ?? null,
    components,
    diagramProducts,
    diagramNodes,
    diagramEdges: Array.isArray(data?.diagram_edges) ? data.diagram_edges : [],
    diagramViewport: isSchemaViewport(data?.diagram_viewport) ? data.diagram_viewport : null,
  };
}

async function fetchProductCatalogByIds(productIds: string[]): Promise<Product[]> {
  if (!supabase || productIds.length === 0) return [];

  const fullSelect = "id, code, name, type, category, unit, recipe_status, component_count, updated_at, lot_zone, lot_code";
  const categorySelect = "id, code, name, type, category, unit, recipe_status, component_count, updated_at";
  const legacySelect = "id, code, name, type, unit, recipe_status, component_count, updated_at";
  let { data, error } = await supabase
    .from("product_catalog")
    .select(fullSelect)
    .in("id", productIds);

  if (error && (isMissingColumnError(error, "lot_zone") || isMissingColumnError(error, "lot_code"))) {
    const fallback = await supabase.from("product_catalog").select(categorySelect).in("id", productIds);
    data = fallback.data?.map((row) => ({ ...row, lot_zone: null, lot_code: null })) ?? null;
    error = fallback.error;
  }

  if (error && isMissingColumnError(error, "category")) {
    const fallback = await supabase.from("product_catalog").select(legacySelect).in("id", productIds);
    data = fallback.data?.map((row) => ({ ...row, category: null, lot_zone: null, lot_code: null })) ?? null;
    error = fallback.error;
  }

  if (error) throw error;

  return (data ?? []).map((row) => mapProductCatalogRow(row, []));
}

function mapProductCatalogRow(row: Record<string, any>, componentNames: string[]): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    category: row.category ?? null,
    unit: row.unit,
    recipeStatus: row.recipe_status,
    componentCount: row.component_count ?? 0,
    componentNames,
    lotZone: row.lot_zone ?? null,
    lotCode: row.lot_code ?? null,
    createdBy: mapAuditActor(row, "created_by", "created_by_name", "created_by_email"),
    updatedBy: mapAuditActor(row, "updated_by", "updated_by_name", "updated_by_email"),
    schemaUpdatedBy: mapAuditActor(row, "schema_updated_by", "schema_updated_by_name", "schema_updated_by_email"),
    schemaUpdatedAt: "schema_updated_at" in row ? row.schema_updated_at : null,
    lastUpdated: row.updated_at,
  };
}

export async function saveProductSchema(
  targetProductId: string,
  componentProductIds: string[],
  diagram?: {
    nodes: SchemaDiagramNode[];
    edges: SchemaDiagramEdge[];
    viewport: SchemaDiagramViewport | null;
  },
) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.rpc("save_product_schema", {
    p_target_product_id: targetProductId,
    p_component_product_ids: componentProductIds,
    p_diagram_nodes: diagram?.nodes ?? [],
    p_diagram_edges: diagram?.edges ?? [],
    p_diagram_viewport: diagram?.viewport ?? null,
  });

  if (error) throw error;
}

export async function saveProductSchemaDiagram(
  targetProductId: string,
  componentProductIds: string[],
  diagram: {
    nodes: SchemaDiagramNode[];
    edges: SchemaDiagramEdge[];
    viewport: SchemaDiagramViewport | null;
  },
) {
  return saveProductSchema(targetProductId, componentProductIds, diagram);
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.from("suppliers").select("id, name, contact_name, is_active").order("name");

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    contact: row.contact_name,
    isActive: row.is_active,
  }));
}

export async function createSupplier(input: SupplierInput): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const normalizedName = input.name.trim();
  if (!normalizedName) throw new Error("Supplier name is required.");

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: normalizedName,
      contact_name: input.contact?.trim() || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function updateSupplier(id: string, input: SupplierInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const normalizedName = input.name.trim();
  if (!id) throw new Error("Supplier is required.");
  if (!normalizedName) throw new Error("Supplier name is required.");

  const { error } = await supabase
    .from("suppliers")
    .update({
      name: normalizedName,
      contact_name: input.contact?.trim() || null,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function fetchRecentReceptions(limit = 20): Promise<RecentReception[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("recent_raw_material_receptions")
    .select("id, reception_date, product_name, supplier_name, supplier_lot, internal_lot, quantity, unit, expiry_date, status")
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    date: formatDateTime(row.reception_date),
    product: row.product_name,
    supplier: row.supplier_name,
    supplierLot: row.supplier_lot,
    internalLot: row.internal_lot,
    quantity: `${Number(row.quantity).toLocaleString("fr-FR")} ${row.unit}`,
    expiry: row.expiry_date ? formatDate(row.expiry_date) : "--",
    status: row.status,
  }));
}

export async function fetchReceptionBatches(limit = 50): Promise<ReceptionBatch[]> {
  if (!supabase) return [];

  const baseColumns = "id, batch_number, reception_date, supplier_id, supplier_name, status, observations, article_count, quantity_summary";
  const auditColumns =
    "validated_by, validated_at, validated_by_name, validated_by_email, updated_by, updated_at, updated_by_name, updated_by_email";
  const exportColumns = "exported_by, exported_at, exported_by_name, exported_by_email";
  const query = await supabase
    .from("reception_batch_history")
    .select(`${baseColumns}, ${auditColumns}, ${exportColumns}`)
    .limit(limit);
  let data = (query.data ?? null) as Array<Record<string, any>> | null;
  let error = query.error;

  if (
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      error.message.includes("validated_by") ||
      error.message.includes("exported_by") ||
      error.message.includes("exported_at"))
  ) {
    const fallback = await supabase.from("reception_batch_history").select(baseColumns).limit(limit);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    batchNumber: row.batch_number,
    receptionDate: row.reception_date,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    status: row.status,
    observations: row.observations,
    articleCount: row.article_count ?? 0,
    quantitySummary: row.quantity_summary ?? "--",
    validatedBy: mapAuditActor(row, "validated_by", "validated_by_name", "validated_by_email"),
    validatedAt: "validated_at" in row ? row.validated_at : null,
    updatedBy: mapAuditActor(row, "updated_by", "updated_by_name", "updated_by_email"),
    updatedAt: "updated_at" in row ? row.updated_at : null,
    exportedBy: mapAuditActor(row, "exported_by", "exported_by_name", "exported_by_email"),
    exportedAt: "exported_at" in row ? row.exported_at : null,
  }));
}

export async function fetchReceptionBatchLines(batchId: string): Promise<ReceptionBatchLine[]> {
  if (!supabase || !batchId) return [];

  const { data, error } = await supabase
    .from("reception_batch_lines")
    .select(
      "id, batch_id, product_id, product_code, product_name, supplier_lot, internal_lot, quantity, unit, expiry_date, transport_temperature_c, temperature_status, hygiene_status, status, observations",
    )
    .eq("batch_id", batchId);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    batchId: row.batch_id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    supplierLot: row.supplier_lot,
    internalLot: row.internal_lot,
    quantity: Number(row.quantity ?? 0),
    unit: row.unit,
    expiryDate: row.expiry_date,
    transportTemperatureC: row.transport_temperature_c === null ? null : Number(row.transport_temperature_c),
    temperatureStatus: row.temperature_status,
    hygieneStatus: row.hygiene_status,
    status: row.status,
    observations: row.observations,
  }));
}

export async function fetchProductionBatches(): Promise<ProductionBatch[]> {
  if (!supabase) return [];

  const historyColumns =
    "id, plan_id, production_date, product_id, product_code, product_name, product_type, product_category, generated_lot, responsible_name, operation, status, observations, consumed_lot_count, created_at";
  const fallbackHistoryColumns =
    "id, production_date, product_id, product_code, product_name, product_type, product_category, generated_lot, responsible_name, operation, status, observations, consumed_lot_count, created_at";
  const auditColumns =
    "confirmed_by, confirmed_at, confirmed_by_name, confirmed_by_email, updated_by, updated_at, updated_by_name, updated_by_email";
  const exportColumns = "exported_by, exported_at, exported_by_name, exported_by_email";
  let { rows: historyRows, error } = await fetchAllProductionHistoryRows(`${historyColumns}, ${auditColumns}, ${exportColumns}`);

  if (
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      error.message.includes("traceability_snapshot") ||
      error.message.includes("plan_id") ||
      error.message.includes("confirmed_by") ||
      error.message.includes("exported_by") ||
      error.message.includes("exported_at"))
  ) {
    const fallback = await fetchAllProductionHistoryRows(fallbackHistoryColumns);
    historyRows = fallback.rows;
    error = fallback.error;
  }

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("production_batch_history")) return [];
    throw error;
  }

  return historyRows.map((row) => ({
    id: row.id,
    planId: "plan_id" in row ? row.plan_id : null,
    productionDate: row.production_date,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    productType: row.product_type,
    category: row.product_category,
    generatedLot: row.generated_lot,
    responsibleName: row.responsible_name,
    operation: row.operation,
    status: row.status,
    observations: row.observations,
    consumedLotCount: row.consumed_lot_count ?? 0,
    traceabilitySnapshot: parseProductionTraceabilitySnapshot("traceability_snapshot" in row ? row.traceability_snapshot : null),
    confirmedBy: mapAuditActor(row, "confirmed_by", "confirmed_by_name", "confirmed_by_email"),
    confirmedAt: "confirmed_at" in row ? row.confirmed_at : null,
    updatedBy: mapAuditActor(row, "updated_by", "updated_by_name", "updated_by_email"),
    updatedAt: "updated_at" in row ? row.updated_at : null,
    exportedBy: mapAuditActor(row, "exported_by", "exported_by_name", "exported_by_email"),
    exportedAt: "exported_at" in row ? row.exported_at : null,
    createdAt: row.created_at,
  }));
}

async function fetchAllProductionHistoryRows(columns: string) {
  if (!supabase) return { rows: [] as Array<Record<string, any>>, error: null };

  const pageSize = 1000;
  const rows: Array<Record<string, any>> = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("production_batch_history")
      .select(columns)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) return { rows, error };

    const pageRows = (data ?? []) as Array<Record<string, any>>;
    rows.push(...pageRows);

    if (pageRows.length < pageSize) return { rows, error: null };
  }
}

export async function fetchConfirmedProductionDatesForProduct(productId: string): Promise<string[]> {
  if (!supabase || !productId) return [];

  const { data, error } = await supabase
    .from("production_batches")
    .select("production_date")
    .eq("product_id", productId)
    .eq("status", "validated")
    .order("production_date", { ascending: false });

  if (error) {
    if (
      error.code === "PGRST205" ||
      error.code === "PGRST204" ||
      error.message.includes("production_batches") ||
      error.message.includes("status")
    ) {
      return [];
    }
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.production_date).filter(Boolean))];
}

export async function fetchDeliveryConfirmations(
  deliveryDate: string,
  storeName: DeliveryStore,
  deliveryNumber: DeliveryNumber,
): Promise<DeliveryConfirmation[]> {
  if (!supabase || !deliveryDate) return [];

  const { data, error } = await supabase
    .from("delivery_confirmations")
    .select(
      "id, delivery_date, store_name, delivery_number, product_id, production_batch_id, lot_number, confirmed_at, created_at",
    )
    .eq("delivery_date", deliveryDate)
    .eq("store_name", storeName)
    .eq("delivery_number", deliveryNumber)
    .order("confirmed_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("delivery_confirmations")) {
      throw new Error("La migration 034_delivery_confirmations.sql doit etre executee pour utiliser les livraisons.");
    }
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    deliveryDate: row.delivery_date,
    storeName: row.store_name as DeliveryStore,
    deliveryNumber: row.delivery_number as DeliveryNumber,
    productId: row.product_id,
    productionBatchId: row.production_batch_id,
    lotNumber: row.lot_number,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  }));
}

export async function confirmProductDelivery(input: {
  deliveryDate: string;
  storeName: DeliveryStore;
  deliveryNumber: DeliveryNumber;
  productId: string;
  productionBatchId: string;
}) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.rpc("confirm_product_delivery", {
    p_delivery_date: input.deliveryDate,
    p_store_name: input.storeName,
    p_delivery_number: input.deliveryNumber,
    p_product_id: input.productId,
    p_production_batch_id: input.productionBatchId,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("confirm_product_delivery")) {
      throw new Error("La migration 034_delivery_confirmations.sql doit etre executee pour confirmer une livraison.");
    }
    throw error;
  }

  return data as string;
}

export async function fetchDeliveries(): Promise<DeliveryRecord[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "id, delivery_code, delivery_date, store_name, delivery_number, status, confirmed_product_count, confirmed_at, created_at",
    )
    .order("delivery_date", { ascending: false })
    .order("confirmed_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("deliveries")) {
      throw new Error("La migration 035_delivery_records.sql doit etre executee pour charger l'historique des livraisons.");
    }
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    deliveryCode: row.delivery_code,
    deliveryDate: row.delivery_date,
    storeName: row.store_name as DeliveryStore,
    deliveryNumber: row.delivery_number as DeliveryNumber,
    status: row.status as "confirmed" | "cancelled",
    confirmedProductCount: Number(row.confirmed_product_count ?? 0),
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  }));
}

export async function fetchDeliveryItems(deliveryId: string): Promise<DeliveryItem[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("delivery_items")
    .select(
      "id, delivery_id, product_id, production_batch_id, product_code, product_name, product_category, lot_number, confirmed_at",
    )
    .eq("delivery_id", deliveryId)
    .order("product_category", { ascending: true })
    .order("product_name", { ascending: true });

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("delivery_items")) {
      throw new Error("La migration 035_delivery_records.sql doit etre executee pour exporter une livraison.");
    }
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    deliveryId: row.delivery_id,
    productId: row.product_id,
    productionBatchId: row.production_batch_id,
    productCode: row.product_code,
    productName: row.product_name,
    productCategory: row.product_category as ProductCategory | null,
    lotNumber: row.lot_number,
    confirmedAt: row.confirmed_at,
  }));
}

export async function confirmDelivery(input: {
  deliveryDate: string;
  storeName: DeliveryStore;
  deliveryNumber: DeliveryNumber;
  items: DeliveryDraftItem[];
}) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.rpc("confirm_delivery", {
    p_delivery_date: input.deliveryDate,
    p_store_name: input.storeName,
    p_delivery_number: input.deliveryNumber,
    p_items: input.items.map((item) => ({
      productId: item.productId,
      productionBatchId: item.productionBatchId,
    })),
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("confirm_delivery")) {
      throw new Error("La migration 035_delivery_records.sql doit etre executee pour confirmer une livraison.");
    }
    throw error;
  }

  return data as string;
}

export async function deleteDeliveries(deliveryIds: string[]) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const uniqueDeliveryIds = [...new Set(deliveryIds)].filter(Boolean);
  if (uniqueDeliveryIds.length === 0) return;

  const { error } = await supabase.rpc("delete_deliveries", {
    p_delivery_ids: uniqueDeliveryIds,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("delete_deliveries")) {
      throw new Error("La migration 036_delete_deliveries.sql doit etre executee pour supprimer les livraisons.");
    }
    throw error;
  }
}

export async function fetchProductionBatchCount(sourceFilter: ProductionBatchSourceFilter = "all"): Promise<number> {
  if (!supabase) return 0;

  let query = supabase
    .from("production_batch_history")
    .select("id", { count: "exact", head: true });

  if (sourceFilter === "manual") {
    query = query.is("plan_id", null);
  } else if (sourceFilter === "planned") {
    query = query.not("plan_id", "is", null);
  }

  const { count, error } = await query;

  if (error) {
    if (
      error.code === "PGRST205" ||
      error.code === "PGRST204" ||
      error.code === "42703" ||
      error.message.includes("production_batch_history") ||
      error.message.includes("plan_id")
    ) {
      return 0;
    }
    throw error;
  }

  return count ?? 0;
}

export async function fetchProductionBatchCounts(): Promise<ProductionBatchCounts> {
  const [all, manual, planned] = await Promise.all([
    fetchProductionBatchCount("all"),
    fetchProductionBatchCount("manual"),
    fetchProductionBatchCount("planned"),
  ]);

  return { all, manual, planned };
}

export async function markReceptionBatchesPdfExported(batchIds: string[]) {
  if (!supabase || batchIds.length === 0) return;

  const { error } = await supabase.rpc("mark_reception_batches_pdf_exported", { p_batch_ids: batchIds });
  if (error) throw error;
}

export async function markProductionBatchesPdfExported(batchIds: string[]) {
  if (!supabase || batchIds.length === 0) return;

  const { error } = await supabase.rpc("mark_production_batches_pdf_exported", { p_batch_ids: batchIds });
  if (error) throw error;
}

function mapAuditActor(row: Record<string, any>, idKey: string, nameKey: string, emailKey: string): AuditActor {
  return {
    id: idKey in row ? row[idKey] ?? null : null,
    name: nameKey in row ? row[nameKey] ?? null : null,
    email: emailKey in row ? row[emailKey] ?? null : null,
  };
}

export async function fetchProductionConsumptionDetails(batchId: string): Promise<ProductionConsumptionDetail[]> {
  if (!supabase || !batchId) return [];

  const { data, error } = await supabase
    .from("production_consumption_details")
    .select(
      "id, production_batch_id, component_node_key, parent_component_node_key, component_depth, selected_component_product_id, expected_component_product_id, expected_component_product_code, expected_component_product_name, expected_component_product_type, expected_component_product_category, lot_id, lot_number, consumed_product_id, consumed_product_code, consumed_product_name, consumed_product_type, consumed_product_category, supplier_lot, supplier_name, source_type, lot_created_at, linked_at",
    )
    .eq("production_batch_id", batchId)
    .order("linked_at", { ascending: true });

  if (error) {
    if (
      error.message.includes("expected_component_product_id") ||
      error.message.includes("component_node_key") ||
      error.message.includes("selected_component_product_id")
    ) {
      const fallback = await supabase
        .from("production_consumption_details")
        .select(
          "id, production_batch_id, lot_id, lot_number, consumed_product_id, consumed_product_code, consumed_product_name, consumed_product_type, consumed_product_category, supplier_lot, supplier_name, source_type, lot_created_at, linked_at",
        )
        .eq("production_batch_id", batchId)
        .order("linked_at", { ascending: true });

      if (fallback.error) return [];
      return (fallback.data ?? []).map(mapProductionConsumptionDetailRow);
    }
    if (error.code === "PGRST205" || error.message.includes("production_consumption_details")) return [];
    throw error;
  }

  return (data ?? []).map(mapProductionConsumptionDetailRow);
}

function mapProductionConsumptionDetailRow(row: any): ProductionConsumptionDetail {
  const expectedProductId = "expected_component_product_id" in row ? row.expected_component_product_id : row.consumed_product_id;
  const expectedProductCode = "expected_component_product_code" in row ? row.expected_component_product_code : row.consumed_product_code;
  const expectedProductName = "expected_component_product_name" in row ? row.expected_component_product_name : row.consumed_product_name;
  const expectedProductType = "expected_component_product_type" in row ? row.expected_component_product_type : row.consumed_product_type;
  const expectedCategory = "expected_component_product_category" in row ? row.expected_component_product_category : row.consumed_product_category;

  return {
    id: row.id,
    batchId: row.production_batch_id,
    componentNodeKey: "component_node_key" in row ? row.component_node_key ?? null : null,
    parentComponentNodeKey: "parent_component_node_key" in row ? row.parent_component_node_key ?? null : null,
    componentDepth: "component_depth" in row ? row.component_depth ?? null : null,
    selectedComponentProductId: "selected_component_product_id" in row ? row.selected_component_product_id ?? null : null,
    expectedProductId,
    expectedProductCode,
    expectedProductName,
    expectedProductType,
    expectedCategory,
    lotId: row.lot_id,
    lotNumber: row.lot_number,
    productId: row.consumed_product_id,
    productCode: row.consumed_product_code,
    productName: row.consumed_product_name,
    productType: row.consumed_product_type,
    category: row.consumed_product_category,
    supplierLot: row.supplier_lot,
    supplierName: "supplier_name" in row ? row.supplier_name ?? null : null,
    sourceType: row.source_type,
    lotCreatedAt: row.lot_created_at,
    linkedAt: row.linked_at,
  };
}

export async function fetchAvailableLotsForProduct(productId: string, limit = 5): Promise<AvailableLotOption[]> {
  if (!supabase || !productId) return [];

  const { data, error } = await supabase
    .from("lots")
    .select("id, product_id, lot_number, supplier_lot, source_type, source_id, created_at, supplier:suppliers(name), product:products(name, type, category)")
    .eq("product_id", productId)
    .eq("lot_status", "available")
    .eq("quality_status", "conforme")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const fabricationBatchIds = [
    ...new Set(
      (data ?? [])
        .filter((row) => row.source_type === "fabrication" && row.source_id)
        .map((row) => row.source_id as string),
    ),
  ];
  const responsibleNameByBatchId = new Map<string, string | null>();

  if (fabricationBatchIds.length > 0) {
    const { data: batchRows, error: batchError } = await supabase
      .from("production_batches")
      .select("id, responsible_name")
      .in("id", fabricationBatchIds);

    if (batchError) throw batchError;

    (batchRows ?? []).forEach((row) => {
      responsibleNameByBatchId.set(row.id, row.responsible_name ?? null);
    });
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: extractJoinedProductField(row.product, "name"),
    productType: extractJoinedProductType(row.product),
    productCategory: extractJoinedProductCategory(row.product),
    lotNumber: row.lot_number,
    supplierLot: row.supplier_lot,
    supplierName: extractJoinedSupplierName(row.supplier),
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    responsibleName:
      row.source_type === "fabrication" && row.source_id
        ? responsibleNameByBatchId.get(row.source_id) ?? null
        : null,
  }));
}

export async function fetchProductionTraceabilitySnapshot(batchId: string): Promise<ProductionTraceabilitySnapshot | null> {
  if (!supabase || !batchId) return null;

  const { data, error } = await supabase
    .from("production_batches")
    .select("traceability_snapshot")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;

  return hydrateProductionTraceabilitySnapshotSuppliers(parseProductionTraceabilitySnapshot(data?.traceability_snapshot));
}

async function hydrateProductionTraceabilitySnapshotSuppliers(snapshot: ProductionTraceabilitySnapshot | null) {
  if (!supabase || !snapshot) return snapshot;

  const missingSupplierLotIds = [
    ...new Set(
      snapshot.components
        .flatMap((component) => component.lots)
        .filter((lot) => lot.sourceType === "reception" && lot.lotId && !lot.supplierName)
        .map((lot) => lot.lotId),
    ),
  ];

  if (missingSupplierLotIds.length === 0) return snapshot;

  const { data, error } = await supabase
    .from("lots")
    .select("id, supplier:suppliers(name)")
    .in("id", missingSupplierLotIds);

  if (error) {
    console.warn("Production traceability snapshot supplier hydration failed", error);
    return snapshot;
  }

  const supplierByLotId = new Map((data ?? []).map((row) => [row.id, extractJoinedSupplierName(row.supplier)]));
  return {
    ...snapshot,
    components: snapshot.components.map((component) => ({
      ...component,
      lots: component.lots.map((lot) => ({
        ...lot,
        supplierName: lot.supplierName ?? supplierByLotId.get(lot.lotId) ?? null,
      })),
    })),
  };
}

export type ProductLotHistoryItem = {
  id: string;
  productId: string;
  lotNumber: string;
  supplierLot: string | null;
  supplierName: string | null;
  sourceType: "reception" | "fabrication";
  sourceId: string | null;
  createdAt: string;
  actor: AuditActor;
};

function mapProductLotHistoryRow(row: Record<string, any>, includeActor: boolean): ProductLotHistoryItem {
  return {
    id: row.id,
    productId: row.product_id,
    lotNumber: row.lot_number,
    supplierLot: row.supplier_lot,
    supplierName: extractJoinedSupplierName(row.supplier),
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    actor: includeActor ? mapAuditActor(row, "created_by", "created_by_name", "created_by_email") : emptyAuditActor,
  };
}

export async function fetchLotHistoryForProduct(productId: string, limit = 50): Promise<ProductLotHistoryItem[]> {
  if (!supabase || !productId) return [];

  const { data, error } = await supabase
    .from("lots")
    .select("id, product_id, lot_number, supplier_lot, source_type, source_id, created_at, created_by, created_by_name, created_by_email, supplier:suppliers(name)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const fallback = await supabase
      .from("lots")
      .select("id, product_id, lot_number, supplier_lot, source_type, source_id, created_at, supplier:suppliers(name)")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fallback.error) return [];
    return (fallback.data ?? []).map((row) => mapProductLotHistoryRow(row, false));
  }

  return (data ?? []).map((row) => mapProductLotHistoryRow(row, true));
}

export async function fetchLotHistoryForProducts(productIds: string[], perProductLimit = 50): Promise<Record<string, ProductLotHistoryItem[]>> {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))];
  const lotsByProductId = Object.fromEntries(uniqueProductIds.map((productId) => [productId, []])) as Record<
    string,
    ProductLotHistoryItem[]
  >;
  if (!supabase || uniqueProductIds.length === 0) return lotsByProductId;

  const chunkSize = 80;
  const selectWithActor =
    "id, product_id, lot_number, supplier_lot, source_type, source_id, created_at, created_by, created_by_name, created_by_email, supplier:suppliers(name)";
  const fallbackSelect = "id, product_id, lot_number, supplier_lot, source_type, source_id, created_at, supplier:suppliers(name)";
  let includeActor = true;

  for (let index = 0; index < uniqueProductIds.length; index += chunkSize) {
    const chunk = uniqueProductIds.slice(index, index + chunkSize);
    let query = await (supabase.from("lots") as any)
      .select(includeActor ? selectWithActor : fallbackSelect)
      .in("product_id", chunk)
      .order("created_at", { ascending: false });

    if (query.error && includeActor) {
      includeActor = false;
      query = await (supabase.from("lots") as any)
        .select(fallbackSelect)
        .in("product_id", chunk)
        .order("created_at", { ascending: false });
    }

    if (query.error) throw query.error;

    for (const row of query.data ?? []) {
      const productId = row.product_id;
      if (!lotsByProductId[productId] || lotsByProductId[productId].length >= perProductLimit) continue;
      lotsByProductId[productId].push(mapProductLotHistoryRow(row, includeActor));
    }
  }

  return lotsByProductId;
}

export async function createProductionWithTraceability(input: ProductionTraceabilityInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  if (input.planId && input.consumedLotSelections) {
    const { data, error } = await supabase.rpc("create_production_with_traceability_v3", {
      p_plan_id: input.planId,
      p_production_date: input.productionDate,
      p_product_id: input.productId,
      p_generated_lot: input.generatedLot,
      p_responsible_name: input.responsibleName,
      p_operation: input.operation,
      p_observations: input.observations,
      p_consumed_lot_selections: input.consumedLotSelections,
    });

    if (error) throw error;
    return data as string;
  }

  if (input.consumedLotSelections) {
    const { data, error } = await supabase.rpc("create_production_with_traceability_v2", {
      p_production_date: input.productionDate,
      p_product_id: input.productId,
      p_generated_lot: input.generatedLot,
      p_responsible_name: input.responsibleName,
      p_operation: input.operation,
      p_observations: input.observations,
      p_consumed_lot_selections: input.consumedLotSelections,
    });

    if (!error) return data as string;

    const isMissingV2Function =
      error.code === "PGRST202" ||
      error.message.includes("create_production_with_traceability_v2") ||
      error.message.includes("Could not find the function");
    if (!isMissingV2Function) throw error;
  }

  const { data, error } = await supabase.rpc("create_production_with_traceability", {
    p_production_date: input.productionDate,
    p_product_id: input.productId,
    p_generated_lot: input.generatedLot,
    p_responsible_name: input.responsibleName,
    p_operation: input.operation,
    p_observations: input.observations,
    p_consumed_lot_ids: input.consumedLotIds,
  });

  if (error) throw error;
  return data as string;
}

export async function fetchProductionPlans(): Promise<ProductionPlan[]> {
  if (!supabase) return [];

  const [{ data, error }, { data: seriesRows, error: seriesError }] = await Promise.all([
    supabase
      .from("production_plan_overview")
      .select("*")
      .order("planned_date")
      .order("planned_time")
      .order("product_name"),
    supabase.from("production_plan_series").select("id, status"),
  ]);

  if (error) throw error;
  if (seriesError) throw seriesError;

  const seriesStatusById = new Map(
    (seriesRows ?? []).map((row) => [row.id, (row.status ?? "active") as ProductionPlanSeriesStatus]),
  );

  return (data ?? []).map((row) => ({
    id: row.id,
    seriesId: row.series_id,
    seriesStatus: seriesStatusById.get(row.series_id) ?? "active",
    planName: row.plan_name || row.product_name,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    productType: row.product_type,
    productCategory: row.product_category,
    plannedDate: row.planned_date,
    plannedTime: row.planned_time ?? "06:30:00",
    recipeId: row.recipe_id,
    recipeVersion: Number(row.recipe_version),
    schemaSnapshot: isRecord(row.schema_snapshot) ? row.schema_snapshot : {},
    productionBatchId: row.production_batch_id,
    responsibleName: row.responsible_name,
    notes: row.notes,
    storedStatus: row.stored_status,
    derivedStatus: row.derived_status,
    dependencyCount: Number(row.dependency_count ?? 0),
    blockerCount: Number(row.blocker_count ?? 0),
    waitingCount: Number(row.waiting_count ?? 0),
    frequency: row.frequency,
    intervalDays: Number(row.interval_days ?? 1),
    daysOfWeek: Array.isArray(row.days_of_week) ? row.days_of_week.map(Number) : [],
    startDate: row.start_date,
    endDate: row.end_date,
    cancelledReason: row.cancelled_reason,
    createdBy: mapAuditActor(row, "created_by", "created_by_name", "created_by_email"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function fetchProductionPlanDependencies(planId: string): Promise<ProductionPlanDependency[]> {
  if (!supabase || !planId) return [];

  const { data, error } = await supabase
    .from("production_plan_dependency_details")
    .select("*")
    .eq("plan_id", planId)
    .order("depth")
    .order("node_key");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    planId: row.plan_id,
    nodeKey: row.node_key,
    parentNodeKey: row.parent_node_key,
    depth: Number(row.depth),
    expectedProductId: row.expected_product_id,
    expectedProductName: row.expected_product_name,
    expectedProductType: row.expected_product_type,
    selectedProductId: row.selected_product_id,
    selectedProductName: row.selected_product_name,
    selectedProductType: row.selected_product_type,
    sourceKind: row.source_kind,
    sourceLotId: row.source_lot_id,
    lotNumber: row.lot_number,
    supplierLot: row.supplier_lot,
    supplierName: row.supplier_name,
    lotDate: row.lot_date,
    sourcePlanId: row.source_plan_id,
    sourcePlanProductId: row.source_plan_product_id,
    sourcePlanProductName: row.source_plan_product_name,
    sourcePlanDate: row.source_plan_date,
    sourcePlanTime: row.source_plan_time,
    sourcePlanStatus: row.source_plan_status,
  }));
}

export async function fetchPlanningEligibleLots(productIds: string[], throughDate: string): Promise<PlanningEligibleLot[]> {
  if (!supabase || productIds.length === 0) return [];

  const { data, error } = await supabase
    .from("planning_eligible_lots")
    .select("*")
    .in("product_id", [...new Set(productIds)])
    .lte("effective_date", throughDate)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.lot_id,
    productId: row.product_id,
    productName: row.product_name,
    productType: row.product_type,
    productCategory: row.product_category,
    substitutionGroup: row.substitution_group,
    lotNumber: row.lot_number,
    supplierLot: row.supplier_lot,
    supplierName: row.supplier_name,
    sourceType: row.source_type,
    effectiveDate: row.effective_date,
    expiryDate: row.expiry_date,
  }));
}

export async function fetchActiveRecipeMetadata(productIds: string[]): Promise<ActiveRecipeMetadata[]> {
  if (!supabase || productIds.length === 0) return [];

  const { data, error } = await supabase
    .from("recipes")
    .select("id, product_id, version, diagram_nodes, diagram_edges, diagram_viewport, updated_at")
    .in("product_id", [...new Set(productIds)])
    .eq("is_active", true);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    version: Number(row.version),
    diagramNodes: Array.isArray(row.diagram_nodes) ? (row.diagram_nodes as SchemaDiagramNode[]) : [],
    diagramEdges: Array.isArray(row.diagram_edges) ? (row.diagram_edges as SchemaDiagramEdge[]) : [],
    diagramViewport: isRecord(row.diagram_viewport) ? (row.diagram_viewport as unknown as SchemaDiagramViewport) : null,
    updatedAt: row.updated_at,
  }));
}

export async function createProductionPlanBundle(input: {
  series: ProductionPlanSeriesInput[];
  plans: ProductionPlanOccurrenceInput[];
  dependencies: ProductionPlanDependencyInput[];
}) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.rpc("create_production_plan_bundle", {
    p_series: input.series,
    p_plans: input.plans,
    p_dependencies: input.dependencies,
  });

  if (error) throw error;
  return data as { seriesCount: number; planCount: number; dependencyCount: number };
}

export async function cancelProductionPlan(planId: string, reason: string | null) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("cancel_production_plan", {
    p_plan_id: planId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function updateProductionPlanSeriesStatus(
  seriesId: string,
  status: Exclude<ProductionPlanSeriesStatus, "archived">,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("update_production_plan_series_status", {
    p_series_id: seriesId,
    p_status: status,
  });
  if (error) throw error;
}

export async function archiveProductionPlanSeries(seriesId: string, reason: string | null) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("archive_production_plan_series", {
    p_series_id: seriesId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function refreshProductionPlan(input: {
  planId: string;
  recipeId: string;
  recipeVersion: number;
  schemaSnapshot: Record<string, unknown>;
  dependencies: ProductionPlanDependencyInput[];
}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("refresh_production_plan", {
    p_plan_id: input.planId,
    p_recipe_id: input.recipeId,
    p_recipe_version: input.recipeVersion,
    p_schema_snapshot: input.schemaSnapshot,
    p_dependencies: input.dependencies,
  });
  if (error) throw error;
}

export async function fetchProductionPlanConfirmationContext(planId: string): Promise<ProductionPlanConfirmationContext> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("get_production_plan_confirmation_context", {
    p_plan_id: planId,
  });
  if (error) throw error;
  if (!isRecord(data)) throw new Error("Production plan confirmation context is unavailable.");

  return {
    planId: String(data.planId),
    productId: String(data.productId),
    plannedDate: String(data.plannedDate),
    plannedTime: typeof data.plannedTime === "string" ? data.plannedTime : "06:30:00",
    responsibleName: typeof data.responsibleName === "string" ? data.responsibleName : null,
    status: data.status as ProductionPlanDerivedStatus,
    selections: Array.isArray(data.selections)
      ? data.selections
          .filter(isRecord)
          .map((selection) => ({
            expectedProductId: String(selection.expectedProductId),
            selectedProductId: String(selection.selectedProductId),
            lotId: typeof selection.lotId === "string" ? selection.lotId : null,
          }))
      : [],
  };
}

export async function deleteProductionBatches(batchIds: string[]) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const uniqueBatchIds = [...new Set(batchIds)].filter(Boolean);
  if (uniqueBatchIds.length === 0) return;

  const { error } = await supabase.rpc("delete_production_batches", {
    p_batch_ids: uniqueBatchIds,
  });

  if (error) throw error;
}

export async function fetchSupplierRawMaterialCatalog(supplierId: string): Promise<Product[]> {
  if (!supabase || !supplierId) return [];

  const { data, error } = await supabase
    .from("supplier_raw_material_catalog")
    .select("product_id, code, name, type, unit, updated_at")
    .eq("supplier_id", supplierId)
    .order("name");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.product_id,
    code: row.code,
    name: row.name,
    type: row.type,
    category: null,
    unit: row.unit,
    recipeStatus: "not_required",
    componentCount: 0,
    componentNames: [],
    lotZone: null,
    lotCode: null,
    createdBy: emptyAuditActor,
    updatedBy: emptyAuditActor,
    schemaUpdatedBy: emptyAuditActor,
    schemaUpdatedAt: null,
    lastUpdated: row.updated_at,
  }));
}

export async function fetchSupplierMaterialAssignments(): Promise<Record<string, string[]>> {
  if (!supabase) return {};

  const { data, error } = await supabase.from("supplier_raw_materials").select("supplier_id, product_id");

  if (error) throw error;

  return (data ?? []).reduce<Record<string, string[]>>((assignments, row) => {
    const supplierProducts = assignments[row.supplier_id] ?? [];
    supplierProducts.push(row.product_id);
    assignments[row.supplier_id] = supplierProducts;
    return assignments;
  }, {});
}

export async function saveSupplierMaterialAssignments(supplierId: string, productIds: string[]) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!supplierId) throw new Error("Supplier is required.");

  const { error: deleteError } = await supabase.from("supplier_raw_materials").delete().eq("supplier_id", supplierId);
  if (deleteError) throw deleteError;

  const uniqueProductIds = [...new Set(productIds)];
  if (uniqueProductIds.length === 0) return;

  const { error: insertError } = await supabase.from("supplier_raw_materials").insert(
    uniqueProductIds.map((productId) => ({
      supplier_id: supplierId,
      product_id: productId,
    })),
  );

  if (insertError) throw insertError;
}

export async function createReceptionBatch(input: ReceptionBatchInput): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.rpc("create_raw_material_reception_batch", {
    p_supplier_id: input.supplierId,
    p_reception_date: input.receptionDate,
    p_observations: input.observations,
    p_lines: input.lines.map((line) => ({
      product_id: line.productId,
      supplier_lot: line.supplierLot,
      quantity: line.quantity,
      unit: line.unit,
      expiry_date: line.expiryDate,
      transport_temperature_c: line.transportTemperatureC,
      temperature_status: line.temperatureStatus,
      hygiene_status: line.hygieneStatus,
      observations: line.observations,
    })),
  });

  if (error) throw error;
  return data as string;
}

export async function updateReceptionBatch(input: ReceptionBatchUpdateInput): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.rpc("update_raw_material_reception_batch", {
    p_batch_id: input.batchId,
    p_merged_batch_ids: input.mergedBatchIds,
    p_supplier_id: input.supplierId,
    p_reception_date: input.receptionDate,
    p_observations: input.observations,
    p_lines: input.lines.map((line) => ({
      id: line.id ?? null,
      product_id: line.productId,
      supplier_lot: line.supplierLot,
      quantity: line.quantity,
      unit: line.unit,
      expiry_date: line.expiryDate,
      transport_temperature_c: line.transportTemperatureC,
      temperature_status: line.temperatureStatus,
      hygiene_status: line.hygieneStatus,
      observations: line.observations,
    })),
  });

  if (error) throw error;
  return data as string;
}

export async function createReception(input: ReceptionInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const [productId, supplierId] = await Promise.all([
    findOrCreateRawProduct(input.productName, input.unit),
    findOrCreateSupplier(input.supplierName),
  ]);

  const { error } = await supabase.rpc("create_raw_material_reception", {
    p_reception_date: input.receptionDate,
    p_product_id: productId,
    p_supplier_id: supplierId,
    p_supplier_lot: input.supplierLot,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_expiry_date: input.expiryDate,
    p_transport_temperature_c: input.transportTemperatureC,
    p_temperature_status: input.temperatureStatus,
    p_hygiene_status: input.hygieneStatus,
    p_nonconformity_reason: input.nonconformityReason,
    p_corrective_action: input.correctiveAction,
    p_observations: input.observations,
  });

  if (error) throw error;
}

export async function createFabrication(input: FabricationInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const productId = await findOrCreateManufacturedProduct(input.productName, input.productType, input.unit);

  const { data: batch, error: batchError } = await supabase
    .from("production_batches")
    .insert({
      production_date: input.productionDate,
      product_id: productId,
      generated_lot: input.generatedLot,
      quantity_produced: input.quantityProduced,
      unit: input.unit,
      responsible_name: input.responsibleName,
      operation: input.operation,
      observations: input.observations,
      status: "validated",
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  const { error: lotError } = await supabase.from("lots").insert({
    product_id: productId,
    lot_number: input.generatedLot,
    quantity_initial: input.quantityProduced,
    quantity_available: input.quantityProduced,
    unit: input.unit,
    quality_status: "conforme",
    lot_status: "available",
    source_type: "fabrication",
    source_id: batch.id,
  });

  if (lotError) throw lotError;
}

export async function createProductCatalogItem(input: ProductCatalogInput): Promise<Product> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const normalizedName = input.name.trim();
  const normalizedLot = input.lotNumber.trim();
  if (!normalizedName) throw new Error("Product name is required.");

  const { data, error } = await supabase
    .from("products")
    .insert({
      code: makeManufacturedProductCode(normalizedName, input.type),
      name: normalizedName,
      type: input.type,
      category: input.category,
      unit: input.type === "finished" ? "unites" : "kg",
    })
    .select("id, unit")
    .single();

  if (error) throw error;

  if (input.lotZone?.trim() || input.lotCode?.trim()) {
    await updateProductLotCodification(data.id, input.lotZone?.trim() ?? "", input.lotCode?.trim() ?? "");
  }

  if (normalizedLot) {
    const { error: lotError } = await supabase.from("lots").insert({
      product_id: data.id,
      lot_number: normalizedLot,
      quantity_initial: 0,
      quantity_available: 0,
      unit: data.unit,
      quality_status: "conforme",
      lot_status: "available",
      source_type: "fabrication",
    });

    if (lotError) throw lotError;
  }

  const [createdProduct] = await fetchProductCatalogByIds([data.id]);
  if (!createdProduct) throw new Error("Created product could not be loaded.");

  return createdProduct;
}

export async function createRawMaterialCatalogItem(input: RawMaterialInput) {
  return findOrCreateRawProduct(input.name, input.unit);
}

export async function updateProductCatalogItem(productId: string, input: ProductCatalogUpdateInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const normalizedName = input.name.trim();
  if (!normalizedName) throw new Error("Product name is required.");

  const nextUnit = input.type === "finished" ? "unites" : input.type === "semi_finished" ? "kg" : input.unit ?? "kg";
  const payload: { name: string; type: ProductType; unit: string; category?: ProductCategory | null } = {
    name: normalizedName,
    type: input.type,
    unit: nextUnit,
  };

  if ("category" in input) payload.category = input.category ?? null;

  const { error } = await supabase.from("products").update(payload).eq("id", productId);

  if (error) throw error;
}

export async function deleteProductCatalogItem(productId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.rpc("delete_product_catalog_item", {
    p_product_id: productId,
  });

  if (error) throw error;
}

export async function updateRawMaterialCatalogItem(productId: string, name: string, unit: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const normalizedName = name.trim();
  const { error } = await supabase
    .from("products")
    .update({
      name: normalizedName,
      unit,
      code: makeProductCode(normalizedName),
    })
    .eq("id", productId);

  if (error) throw error;
}

export async function updateProductLotCodification(productId: string, lotZone: string, lotCode: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.rpc("update_product_lot_codification", {
    p_product_id: productId,
    p_lot_zone: lotZone,
    p_lot_code: lotCode,
  });

  if (error) throw error;
}

async function findOrCreateRawProduct(name: string, unit: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const normalizedName = name.trim();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id")
    .ilike("name", normalizedName)
    .eq("type", "raw")
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id as string;

  const { data, error } = await supabase
    .from("products")
    .insert({
      code: makeProductCode(normalizedName),
      name: normalizedName,
      type: "raw",
      unit,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function findOrCreateManufacturedProduct(name: string, type: Exclude<ProductType, "raw">, unit: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const normalizedName = name.trim();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id")
    .ilike("name", normalizedName)
    .eq("type", type)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id as string;

  const { data, error } = await supabase
    .from("products")
    .insert({
      code: makeManufacturedProductCode(normalizedName, type),
      name: normalizedName,
      type,
      unit,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function findOrCreateSupplier(name: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const normalizedName = name.trim();
  const { data: existing, error: existingError } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id as string;

  const { data, error } = await supabase.from("suppliers").insert({ name: normalizedName }).select("id").single();

  if (error) throw error;
  return data.id as string;
}

function makeProductCode(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

  return `MP-${slug || "PRODUIT"}-${Date.now().toString(36).toUpperCase()}`;
}

function makeManufacturedProductCode(name: string, type: Exclude<ProductType, "raw">) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

  return `${type === "semi_finished" ? "SF" : "PF"}-${slug || "PRODUIT"}-${Date.now().toString(36).toUpperCase()}`;
}

function extractJoinedSupplierName(value: unknown) {
  if (!value) return null;
  const supplier = Array.isArray(value) ? value[0] : value;
  if (!supplier || typeof supplier !== "object") return null;
  const name = (supplier as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name : null;
}

function extractJoinedProductField(value: unknown, field: "name") {
  if (!value) return null;
  const product = Array.isArray(value) ? value[0] : value;
  if (!product || typeof product !== "object") return null;
  const fieldValue = (product as Record<string, unknown>)[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function extractJoinedProductType(value: unknown): ProductType | null {
  if (!value) return null;
  const product = Array.isArray(value) ? value[0] : value;
  if (!product || typeof product !== "object") return null;
  const type = (product as { type?: unknown }).type;
  return type === "raw" || type === "semi_finished" || type === "finished" ? type : null;
}

function extractJoinedProductCategory(value: unknown): ProductCategory | null {
  if (!value) return null;
  const product = Array.isArray(value) ? value[0] : value;
  if (!product || typeof product !== "object") return null;
  const category = (product as { category?: unknown }).category;
  return category === "beldi" || category === "boulangerie" || category === "cake" || category === "patisserie" || category === "viennoiserie" ? category : null;
}

function isSchemaViewport(value: unknown): value is SchemaDiagramViewport {
  if (!value || typeof value !== "object") return false;
  const viewport = value as Partial<SchemaDiagramViewport>;
  return typeof viewport.x === "number" && typeof viewport.y === "number" && typeof viewport.zoom === "number";
}

function logDevWarning(message: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.warn(message, error);
  }
}

function formatDate(value: string) {
  return formatFrenchDate(value);
}

function formatDateTime(value: string) {
  return formatFrenchDateTime(value);
}
