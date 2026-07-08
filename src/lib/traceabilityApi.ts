import { supabase } from "./supabase";

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
  createdAt: string;
};

export type ProductionConsumptionDetail = {
  id: string;
  batchId: string;
  lotId: string;
  lotNumber: string;
  productId: string;
  productCode: string;
  productName: string;
  productType: ProductType;
  category: ProductCategory | null;
  supplierLot: string | null;
  sourceType: "reception" | "fabrication";
  lotCreatedAt: string;
  linkedAt: string;
};

export type AvailableLotOption = {
  id: string;
  productId: string;
  lotNumber: string;
  supplierLot: string | null;
  sourceType: "reception" | "fabrication";
  createdAt: string;
};

export type ProductionTraceabilityInput = {
  productionDate: string;
  productId: string;
  generatedLot: string;
  responsibleName: string | null;
  operation: string | null;
  observations: string | null;
  consumedLotIds: string[];
};

export type ProductCatalogInput = {
  name: string;
  type: Exclude<ProductType, "raw">;
  lotNumber: string;
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

  let { data, error } = await supabase
    .from("product_catalog")
    .select("id, code, name, type, category, unit, recipe_status, component_count, updated_at")
    .order("type")
    .order("name");

  if (error && isMissingColumnError(error, "category")) {
    const fallback = await supabase
      .from("product_catalog")
      .select("id, code, name, type, unit, recipe_status, component_count, updated_at")
      .order("type")
      .order("name");
    data = fallback.data?.map((row) => ({ ...row, category: null })) ?? null;
    error = fallback.error;
  }

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    category: row.category,
    unit: row.unit,
    recipeStatus: row.recipe_status,
    componentCount: row.component_count ?? 0,
    lastUpdated: row.updated_at,
  }));
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

  const { data, error } = await supabase
    .from("product_schema_components")
    .select(
      "target_product_id, component_product_id, component_code, component_name, component_type, component_unit, component_recipe_status, component_count",
    );

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("product_schema_components")) return [];
    throw error;
  }

  const rows = data ?? [];
  const stockByProductId = await fetchLotStockPreview([...new Set(rows.map((row) => row.component_product_id))]);
  const rowsByTarget = new Map<string, typeof rows>();

  for (const row of rows) {
    const targetRows = rowsByTarget.get(row.target_product_id) ?? [];
    targetRows.push(row);
    rowsByTarget.set(row.target_product_id, targetRows);
  }

  function buildChildren(targetId: string, visitedIds: Set<string>): ProductSchemaNode[] {
    return (rowsByTarget.get(targetId) ?? []).map((row) => {
      const nextVisitedIds = new Set(visitedIds);
      nextVisitedIds.add(row.component_product_id);

      const component: ProductSchemaNode = {
        id: row.component_product_id,
        code: row.component_code,
        name: row.component_name,
        type: row.component_type,
        category: null,
        unit: row.component_unit,
        recipeStatus: row.component_recipe_status,
        componentCount: row.component_count ?? 0,
        lastUpdated: "",
        stock: stockByProductId[row.component_product_id] ?? null,
        children:
          row.component_type === "semi_finished" && row.component_recipe_status === "active" && !visitedIds.has(row.component_product_id)
            ? buildChildren(row.component_product_id, nextVisitedIds)
            : [],
      };

      return component;
    });
  }

  return buildChildren(productId, new Set([productId]));
}

export async function fetchProductSchemaDiagram(productId: string): Promise<ProductSchemaDiagram> {
  let components: ProductSchemaNode[] = [];

  try {
    components = await fetchProductSchema(productId);
  } catch (error) {
    console.warn("Product schema components load skipped", error);
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

  const { data, error } = await supabase
    .from("product_catalog")
    .select("id, code, name, type, unit, recipe_status, component_count, updated_at")
    .in("id", productIds);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    category: null,
    unit: row.unit,
    recipeStatus: row.recipe_status,
    componentCount: row.component_count ?? 0,
    lastUpdated: row.updated_at,
  }));
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

  const { data, error } = await supabase
    .from("reception_batch_history")
    .select("id, batch_number, reception_date, supplier_id, supplier_name, status, observations, article_count, quantity_summary")
    .limit(limit);

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

  const { data, error } = await supabase
    .from("production_batch_history")
    .select(
      "id, production_date, product_id, product_code, product_name, product_type, product_category, generated_lot, responsible_name, operation, status, observations, consumed_lot_count, created_at",
    )
    .order("production_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("production_batch_history")) return [];
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
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
    createdAt: row.created_at,
  }));
}

export async function fetchProductionConsumptionDetails(batchId: string): Promise<ProductionConsumptionDetail[]> {
  if (!supabase || !batchId) return [];

  const { data, error } = await supabase
    .from("production_consumption_details")
    .select(
      "id, production_batch_id, lot_id, lot_number, consumed_product_id, consumed_product_code, consumed_product_name, consumed_product_type, consumed_product_category, supplier_lot, source_type, lot_created_at, linked_at",
    )
    .eq("production_batch_id", batchId)
    .order("linked_at", { ascending: true });

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("production_consumption_details")) return [];
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    batchId: row.production_batch_id,
    lotId: row.lot_id,
    lotNumber: row.lot_number,
    productId: row.consumed_product_id,
    productCode: row.consumed_product_code,
    productName: row.consumed_product_name,
    productType: row.consumed_product_type,
    category: row.consumed_product_category,
    supplierLot: row.supplier_lot,
    sourceType: row.source_type,
    lotCreatedAt: row.lot_created_at,
    linkedAt: row.linked_at,
  }));
}

export async function fetchAvailableLotsForProduct(productId: string, limit = 3): Promise<AvailableLotOption[]> {
  if (!supabase || !productId) return [];

  const { data, error } = await supabase
    .from("lots")
    .select("id, product_id, lot_number, supplier_lot, source_type, created_at")
    .eq("product_id", productId)
    .eq("lot_status", "available")
    .eq("quality_status", "conforme")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    lotNumber: row.lot_number,
    supplierLot: row.supplier_lot,
    sourceType: row.source_type,
    createdAt: row.created_at,
  }));
}

export async function createProductionWithTraceability(input: ProductionTraceabilityInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

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

export async function createProductCatalogItem(input: ProductCatalogInput) {
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
      unit: input.type === "finished" ? "unites" : "kg",
    })
    .select("id, unit")
    .single();

  if (error) throw error;

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

  return data.id as string;
}

export async function createRawMaterialCatalogItem(input: RawMaterialInput) {
  return findOrCreateRawProduct(input.name, input.unit);
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

function isSchemaViewport(value: unknown): value is SchemaDiagramViewport {
  if (!value || typeof value !== "object") return false;
  const viewport = value as Partial<SchemaDiagramViewport>;
  return typeof viewport.x === "number" && typeof viewport.y === "number" && typeof viewport.zoom === "number";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR").format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
