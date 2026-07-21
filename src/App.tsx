import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type FormHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { AppWindowIcon, CodeIcon } from "lucide-react";
import "./styles.css";
import { FabricationDiagramWorkspace } from "./FabricationDiagramWorkspace";
import { ProductionTraceabilityDiagram } from "./ProductionTraceabilityDiagram";
import { TraceabilityLoader } from "./TraceabilityLoader";
import { generateProductionLotNumber } from "./lib/productionLotCodification";
import {
  buildProductionPdfData,
  buildProductionPdfDataFromBatch,
  buildProductionPdfDataFromBatchSchema,
  downloadProductionTraceabilityBatchPdf,
  downloadProductionTraceabilityPdf,
  openProductionPdfFile,
} from "./lib/productionTraceabilityPdf";
import { downloadReceptionQualityPdf, type ReceptionQualityPdfGroup } from "./lib/receptionQualityPdf";
import { isSupabaseConfigured } from "./lib/supabase";
import {
  createProductionWithTraceability,
  createSupplier,
  createRawMaterialCatalogItem,
  deleteProductionBatches,
  updateProductCatalogItem,
  updateRawMaterialCatalogItem,
  createReceptionBatch,
  updateReceptionBatch,
  createProductCatalogItem,
  createReception,
  fetchAvailableLotsForProduct,
  fetchProductionBatches,
  fetchProductionConsumptionDetails,
  fetchReceptionBatchLines,
  fetchReceptionBatches,
  fetchLotStockPreview,
  fetchProductCatalog,
  fetchProductSchema,
  fetchProductSchemaDiagram,
  fetchRecentReceptions,
  fetchSupplierMaterialAssignments,
  fetchSupplierRawMaterialCatalog,
  fetchSuppliers,
  formatApiError,
  saveProductSchema,
  saveSupplierMaterialAssignments,
  updateSupplier,
  type LotStockPreview,
  type Product,
  type ProductCategory,
  type ProductCatalogInput,
  type AvailableLotOption,
  type ProductionBatch,
  type ProductionConsumptionDetail,
  type ReceptionBatch,
  type ReceptionBatchLine,
  type ReceptionBatchLineInput,
  type ProductSchemaNode,
  type ProductSchemaDiagram,
  type ProductType,
  type RecentReception,
  type RecipeStatus,
  type ReceptionStatus,
  type Supplier,
} from "./lib/traceabilityApi";

type ViewId = "dashboard" | "reception" | "fabrication" | "production" | "traceability" | "products" | "suppliers" | "reports";
type CanvasPosition = { x: number; y: number };
type ThemeMode = "dark" | "light";
type SupplierTab = "info" | "materials" | "history";
type SupplierFormState = { name: string; contact: string };
type RawMaterialFormState = { id?: string; name: string; unit: "piece" | "kg"; supplierId?: string };
type ComboOption<T extends string = string> = { value: T; label: string };
type AppBadgeVariant = ProductType | RecipeStatus | ReceptionStatus | "neutral";
type AppButtonVariant = "primary" | "secondary" | "ghostDanger" | "blue" | "dangerSoft";
type IconName =
  | "brand"
  | "dashboard"
  | "lifecycle"
  | "analytics"
  | "folder"
  | "users"
  | "database"
  | "report"
  | "file"
  | "settings"
  | "help"
  | "search"
  | "bell"
  | "calendar"
  | "check"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "chevronsLeft"
  | "chevronsRight"
  | "columns"
  | "dots"
  | "grip"
  | "plus"
  | "x"
  | "sun"
  | "moon";
type ReceptionDraftLine = {
  localId: string;
  lineId?: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: string;
  supplierLot: string;
  expiryDate: string;
  transportTemperature: string;
  temperatureStatus: ReceptionStatus;
  hygieneStatus: ReceptionStatus;
  observations: string;
};
type ProductionComponentDraft = {
  component: ProductSchemaNode;
  lots: AvailableLotOption[];
  selectedLotIds: string[];
  confirmed: boolean;
  status: "loading" | "ready" | "error";
};
type ProductColumnFilterKey = "name" | "type" | "category" | "recipeStatus" | "componentCount" | "lastUpdated" | "lot" | "productionDate" | "confirmedAt";
type ProductColumnFilter = { id: string; column: ProductColumnFilterKey; value: string };

type ProductColumnFilterOption = {
  key: ProductColumnFilterKey;
  label: string;
  description: string;
};

const typeLabels: Record<ProductType, string> = {
  raw: "Matiere premiere",
  semi_finished: "Semi-fini",
  finished: "Produit fini",
};

const recipeLabels: Record<RecipeStatus, string> = {
  active: "Recette active",
  missing: "Recette manquante",
  not_required: "Non requis",
};

const productColumnFilterOptions: ProductColumnFilterOption[] = [
  { key: "name", label: "produit", description: "Nom produit" },
  { key: "type", label: "type", description: "Matiere premiere, semi-fini, produit fini" },
  { key: "category", label: "categorie", description: "Beldi, boulangerie, cake, patisserie, viennoiserie" },
  { key: "recipeStatus", label: "recette", description: "Active, manquante, non requis" },
  { key: "componentCount", label: "composants", description: "Nombre de composants" },
  { key: "lastUpdated", label: "derniere_modification", description: "Date de modification" },
];

const categoryLabels: Record<ProductCategory, string> = {
  beldi: "Beldi",
  boulangerie: "Boulangerie",
  cake: "Cake",
  patisserie: "Patisserie",
  viennoiserie: "Viennoiserie",
};

const productColumnValueSuggestions: Partial<Record<ProductColumnFilterKey, string[]>> = {
  type: [typeLabels.raw, typeLabels.semi_finished, typeLabels.finished],
  category: Object.values(categoryLabels),
  recipeStatus: [recipeLabels.active, recipeLabels.missing, recipeLabels.not_required],
};

const productionHistoryColumnFilterOptions: ProductColumnFilterOption[] = [
  { key: "name", label: "produit", description: "Nom produit" },
  { key: "type", label: "type", description: "Semi-fini, produit fini" },
  { key: "category", label: "categorie", description: "Beldi, boulangerie, cake, patisserie, viennoiserie" },
  { key: "lot", label: "lot", description: "Lot de production" },
  { key: "productionDate", label: "date_production", description: "Date de production" },
  { key: "confirmedAt", label: "date_confirmation", description: "Date de confirmation" },
];

const productionHistoryColumnValueSuggestions: Partial<Record<ProductColumnFilterKey, string[]>> = {
  type: [typeLabels.semi_finished, typeLabels.finished],
  category: Object.values(categoryLabels),
};

const emptyProductSchemaNodes: ProductSchemaNode[] = [];

const unitOptions: ComboOption[] = [
  { value: "kg", label: "kg" },
  { value: "L", label: "L" },
  { value: "piece", label: "piece" },
];

const rawMaterialUnitOptions: ComboOption<RawMaterialFormState["unit"]>[] = [
  { value: "kg", label: "kg" },
  { value: "piece", label: "piece" },
];

const receptionStatusOptions: ComboOption<ReceptionStatus>[] = [
  { value: "conforme", label: "Conforme" },
  { value: "non_conforme", label: "Non conforme" },
];

const manufacturedProductTypeOptions: ComboOption<Exclude<ProductType, "raw">>[] = [
  { value: "finished", label: "Produit fini" },
  { value: "semi_finished", label: "Semi-fini" },
];

const productTypeEditOptions: ComboOption<ProductType>[] = [
  { value: "raw", label: "Matiere premiere" },
  { value: "semi_finished", label: "Semi-fini" },
  { value: "finished", label: "Produit fini" },
];

const rowsPerPageOptions: ComboOption[] = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "30", label: "30" },
  { value: "50", label: "50" },
];

const todayInputValue = toInputDateValue(new Date());
const calendarWeekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const calendarMonthOptions = Array.from({ length: 12 }, (_, monthIndex) => ({
  value: String(monthIndex),
  label: capitalize(new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(2026, monthIndex, 1))),
}));
const canvasWidth = 2200;
const canvasHeight = 1400;
const canvasCardWidth = 236;
const canvasCardHeight = 150;

function App() {
  const [activeView, setActiveView] = useState<ViewId>("reception");
  const [receptionScreen, setReceptionScreen] = useState<"list" | "details">("list");
  const [receptionDraftResetKey, setReceptionDraftResetKey] = useState(0);
  const [editingReceptionBatchIds, setEditingReceptionBatchIds] = useState<string[] | null>(null);
  const [fabricationScreen, setFabricationScreen] = useState<"list" | "schema">("list");
  const [fabricationProductColumnFilters, setFabricationProductColumnFilters] = useState<ProductColumnFilter[]>([]);
  const [fabricationSchemaSidebarCollapsed, setFabricationSchemaSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("theme") === "light" ? "light" : "dark"));
  const [selectedFabricationProduct, setSelectedFabricationProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receptionBatches, setReceptionBatches] = useState<ReceptionBatch[]>([]);
  const [selectedReceptionBatchId, setSelectedReceptionBatchId] = useState("");
  const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>([]);
  const [selectedProductionBatchId, setSelectedProductionBatchId] = useState("");
  const [recentReceptions, setRecentReceptions] = useState<RecentReception[]>([]);
  const [dataStatus, setDataStatus] = useState<"unconfigured" | "loading" | "connected" | "error">(
    isSupabaseConfigured ? "loading" : "unconfigured",
  );

  async function loadSupabaseData() {
    if (!isSupabaseConfigured) return;

    setDataStatus("loading");
    try {
      const [nextProducts, nextSuppliers, nextBatches, nextProductionBatches, nextReceptions] = await Promise.all([
        fetchProductCatalog(),
        fetchSuppliers(),
        fetchReceptionBatches(),
        fetchProductionBatches(),
        fetchRecentReceptions(),
      ]);

      setProducts(nextProducts);
      setSuppliers(nextSuppliers);
      setReceptionBatches(nextBatches);
      setSelectedReceptionBatchId((current) => current || nextBatches[0]?.id || "");
      setProductionBatches(nextProductionBatches);
      setSelectedProductionBatchId((current) => current || nextProductionBatches[0]?.id || "");
      setRecentReceptions(nextReceptions);
      setDataStatus("connected");
    } catch (error) {
      console.error("Supabase load failed", error);
      setDataStatus("error");
    }
  }

  useEffect(() => {
    void loadSupabaseData();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  function handleNavigate(view: ViewId) {
    setActiveView(view);
  }

  if (activeView === "fabrication" && fabricationScreen === "schema") {
    return (
      <div className="diagram-app-shell">
        <FabricationDiagramWorkspace
          initialProduct={selectedFabricationProduct}
          initialProductSidebarCollapsed={fabricationSchemaSidebarCollapsed}
          products={products}
          onBack={() => setFabricationScreen("list")}
          onSchemaSaved={async () => {
            await loadSupabaseData();
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onNavigate={handleNavigate} />
      <div className="workspace">
        <Topbar dataStatus={dataStatus} theme={theme} onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
        <CachedScreen active={activeView === "reception" && receptionScreen === "list"}>
          <ReceptionList
            receptionBatches={receptionBatches}
            selectedBatchId={selectedReceptionBatchId}
            onCreate={() => {
              setEditingReceptionBatchIds(null);
              setReceptionScreen("details");
            }}
            onEdit={(batchIds) => {
              setEditingReceptionBatchIds(batchIds);
              setReceptionScreen("details");
            }}
            onSelectBatch={setSelectedReceptionBatchId}
          />
        </CachedScreen>
        <CachedScreen active={activeView === "reception" && receptionScreen === "details"}>
          <ReceptionDetails
            key={receptionDraftResetKey}
            editingBatches={
              editingReceptionBatchIds
                ? editingReceptionBatchIds.flatMap((batchId) => receptionBatches.find((batch) => batch.id === batchId) ?? [])
                : []
            }
            suppliers={suppliers}
            onBack={() => {
              setReceptionScreen("list");
              setEditingReceptionBatchIds(null);
              setReceptionDraftResetKey((current) => current + 1);
            }}
            onReceptionSaved={async (batchId) => {
              await loadSupabaseData();
              setSelectedReceptionBatchId(batchId);
              setReceptionScreen("list");
              setEditingReceptionBatchIds(null);
              setReceptionDraftResetKey((current) => current + 1);
            }}
          />
        </CachedScreen>
        <CachedScreen active={activeView === "fabrication" && fabricationScreen === "list"}>
          <FabricationList
            columnFilters={fabricationProductColumnFilters}
            onProductSaved={loadSupabaseData}
            products={products}
            onColumnFiltersChange={setFabricationProductColumnFilters}
            onCreate={() => {
              setSelectedFabricationProduct(null);
              setFabricationSchemaSidebarCollapsed(false);
              setFabricationScreen("schema");
            }}
            onSelect={(product) => {
              setSelectedFabricationProduct(product);
              setFabricationSchemaSidebarCollapsed(product.recipeStatus === "active");
              setFabricationScreen("schema");
            }}
          />
        </CachedScreen>
        <CachedScreen active={activeView === "production"}>
          <ProductionModule
            batches={productionBatches}
            products={products}
            selectedBatchId={selectedProductionBatchId}
            onProductionDeleted={async (deletedBatchIds) => {
              setSelectedProductionBatchId((current) => (deletedBatchIds.includes(current) ? "" : current));
              await loadSupabaseData();
            }}
            onProductionSaved={async (batchId) => {
              await loadSupabaseData();
              setSelectedProductionBatchId(batchId);
            }}
            onSelectBatch={setSelectedProductionBatchId}
          />
        </CachedScreen>
        <CachedScreen active={activeView === "suppliers"}>
          <SuppliersModule products={products} suppliers={suppliers} onSuppliersChanged={loadSupabaseData} />
        </CachedScreen>
        <CachedScreen active={activeView !== "reception" && activeView !== "fabrication" && activeView !== "production" && activeView !== "suppliers"}>
          <EmptyModule activeView={activeView} />
        </CachedScreen>
      </div>
    </div>
  );
}

function CachedScreen({ active, children }: { active: boolean; children: ReactNode }) {
  const [hasMounted, setHasMounted] = useState(active);

  useEffect(() => {
    if (active) setHasMounted(true);
  }, [active]);

  if (!hasMounted) return null;

  return (
    <div aria-hidden={!active} className={cx("cached-screen", active && "active")}>
      {children}
    </div>
  );
}

function ReceptionList({
  receptionBatches,
  selectedBatchId,
  onCreate,
  onEdit,
  onSelectBatch,
}: {
  receptionBatches: ReceptionBatch[];
  selectedBatchId: string;
  onCreate: () => void;
  onEdit: (batchIds: string[]) => void;
  onSelectBatch: (batchId: string) => void;
}) {
  const [batchLines, setBatchLines] = useState<ReceptionBatchLine[]>([]);
  const [lineStatus, setLineStatus] = useState<"idle" | "loading" | "error">("idle");
  const [selectedPdfGroupKeys, setSelectedPdfGroupKeys] = useState<string[]>([]);
  const [receptionPdfStatus, setReceptionPdfStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [receptionPdfMessage, setReceptionPdfMessage] = useState("");
  const [receptionPdfAlert, setReceptionPdfAlert] = useState<{ filePath: string; description: string } | null>(null);
  const receptionGroups = useMemo(() => groupReceptionBatchesBySupplierAndDate(receptionBatches), [receptionBatches]);
  const selectedGroup = receptionGroups.find((group) => group.batches.some((batch) => batch.id === selectedBatchId)) ?? receptionGroups[0] ?? null;
  const selectedPdfGroups = receptionGroups.filter((group) => selectedPdfGroupKeys.includes(group.key));
  const allReceptionGroupsSelected = receptionGroups.length > 0 && selectedPdfGroupKeys.length === receptionGroups.length;

  useEffect(() => {
    const availableKeys = new Set(receptionGroups.map((group) => group.key));
    setSelectedPdfGroupKeys((current) => current.filter((key) => availableKeys.has(key)));
  }, [receptionGroups]);

  useEffect(() => {
    if (!selectedGroup) {
      setBatchLines([]);
      setLineStatus("idle");
      return;
    }

    let cancelled = false;
    async function loadLines() {
      setLineStatus("loading");
      try {
        const groupLines = await Promise.all(selectedGroup.batches.map((batch) => fetchReceptionBatchLines(batch.id)));
        if (!cancelled) {
          setBatchLines(groupLines.flat());
          setLineStatus("idle");
        }
      } catch (error) {
        console.error("Reception batch lines load failed", error);
        if (!cancelled) setLineStatus("error");
      }
    }

    void loadLines();

    return () => {
      cancelled = true;
    };
  }, [selectedGroup?.key]);

  function toggleReceptionPdfGroup(groupKey: string) {
    setReceptionPdfMessage("");
    setReceptionPdfAlert(null);
    setSelectedPdfGroupKeys((current) => (current.includes(groupKey) ? current.filter((key) => key !== groupKey) : [...current, groupKey]));
  }

  function toggleAllReceptionPdfGroups() {
    setReceptionPdfMessage("");
    setReceptionPdfAlert(null);
    setSelectedPdfGroupKeys(allReceptionGroupsSelected ? [] : receptionGroups.map((group) => group.key));
  }

  async function handleExportSelectedReceptionPdf() {
    if (selectedPdfGroups.length === 0) return;

    setReceptionPdfStatus("exporting");
    setReceptionPdfMessage("");
    setReceptionPdfAlert(null);

    try {
      const groups: ReceptionQualityPdfGroup[] = await Promise.all(
        selectedPdfGroups.map(async (group) => {
          const groupLines = await Promise.all(group.batches.map((batch) => fetchReceptionBatchLines(batch.id)));
          return {
            batchNumbers: group.batchNumbers,
            dateLabel: group.dateLabel,
            lines: groupLines.flat(),
            supplierName: group.supplierName,
          };
        }),
      );

      const result = await downloadReceptionQualityPdf(groups);
      const exportedFilePath = "filePath" in result && typeof result.filePath === "string" ? result.filePath : "";
      const location = exportedFilePath || "telechargement lance";
      setReceptionPdfStatus("success");
      if (exportedFilePath) {
        setReceptionPdfMessage("");
        setReceptionPdfAlert({
          filePath: exportedFilePath,
          description: `PDF reception exporte: ${location}`,
        });
      } else {
        setReceptionPdfMessage(`PDF reception exporte: ${location}`);
      }
    } catch (error) {
      console.error("Reception quality PDF export failed", error);
      setReceptionPdfStatus("error");
      setReceptionPdfMessage(formatApiError(error, "Impossible d'exporter le PDF reception."));
      setReceptionPdfAlert(null);
    }
  }

  async function handleOpenReceptionPdfAlert() {
    if (!receptionPdfAlert) return;

    try {
      await openProductionPdfFile(receptionPdfAlert.filePath);
    } catch (error) {
      console.error("Open reception PDF failed", error);
      setReceptionPdfStatus("error");
      setReceptionPdfMessage(formatApiError(error, "Impossible d'ouvrir le PDF reception."));
    }
  }

  return (
    <>
    <main className="page reception-overview-page">
      <AppCard className="reception-history-panel reception-overview-panel">
        <div className="table-toolbar">
          <div className="panel-title no-border">
            <span className="panel-icon">HR</span>
            <div>
              <h2>Historique des receptions</h2>
              <p>{receptionBatches.length} livraison(s)</p>
            </div>
          </div>
          <div className="table-actions">
            <AppButton compact disabled={receptionPdfStatus === "exporting" || selectedPdfGroups.length === 0} onClick={() => void handleExportSelectedReceptionPdf()} type="button" variant="secondary">
              <AppIcon name="file" />
              {receptionPdfStatus === "exporting" ? <TraceabilityLoader compact label="Export..." /> : "Exporter PDF"}
            </AppButton>
            <AppButton compact onClick={onCreate} type="button">
              Nouvelle reception
            </AppButton>
          </div>
        </div>

        <div className="table-wrap reception-master-table">
          <table>
            <thead>
              <tr>
                <th className="selection-cell">
                  <label className="table-checkbox">
                    <input
                      aria-label="Selectionner toutes les receptions pour le PDF"
                      checked={allReceptionGroupsSelected}
                      disabled={receptionGroups.length === 0}
                      onChange={toggleAllReceptionPdfGroups}
                      type="checkbox"
                    />
                    <span></span>
                  </label>
                </th>
                <th>Date</th>
                <th>Fournisseur</th>
                <th>Lot reception</th>
                <th>Articles</th>
                <th>Quantite</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {receptionBatches.length === 0 ? (
                <TableEmpty colSpan={7}>Aucune reception batch enregistree.</TableEmpty>
              ) : null}
              {receptionGroups.map((group) => (
                <tr
                  className={cx(group.key === selectedGroup?.key && "selected-row")}
                  key={group.key}
                  onClick={() => onSelectBatch(group.batches[0].id)}
                >
                  <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                    <label className="table-checkbox">
                      <input
                        aria-label={`Selectionner ${group.supplierName} ${group.dateLabel} pour le PDF`}
                        checked={selectedPdfGroupKeys.includes(group.key)}
                        onChange={() => toggleReceptionPdfGroup(group.key)}
                        type="checkbox"
                      />
                      <span></span>
                    </label>
                  </td>
                  <td>{group.dateLabel}</td>
                  <td>{group.supplierName}</td>
                  <td>
                    <strong>{group.batchNumbers[0]}</strong>
                  </td>
                  <td>{group.articleCount}</td>
                  <td>{group.quantitySummary}</td>
                  <td>
                    <ReceptionStatusBadge status={group.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {receptionPdfMessage ? <p className={cx("save-message reception-pdf-message", receptionPdfStatus === "error" ? "error" : "success")}>{receptionPdfMessage}</p> : null}
      </AppCard>

      <AppCard className="reception-history-panel reception-overview-panel">
        <div className="table-toolbar">
          <div className="panel-title no-border">
            <span className="panel-icon">DL</span>
            <div>
              <h2>Articles de la reception</h2>
              <p>{selectedGroup ? `${selectedGroup.supplierName} - ${selectedGroup.dateLabel}` : "Aucun lot selectionne"}</p>
            </div>
          </div>
          <div className="table-actions">
            <AppButton compact disabled={!selectedGroup} onClick={() => selectedGroup && onEdit(selectedGroup.batches.map((batch) => batch.id))} type="button" variant="secondary">
              Editer
            </AppButton>
          </div>
        </div>
        <ReceptionBatchLinesTable lines={batchLines} status={lineStatus} />
      </AppCard>
    </main>
    {receptionPdfAlert ? (
      <div aria-live="polite" className="production-pdf-alert" role="status">
        <div className="production-pdf-alert-content">
          <strong>PDF exporte</strong>
          <p>{receptionPdfAlert.description}</p>
        </div>
        <AppButton compact onClick={() => void handleOpenReceptionPdfAlert()} type="button">
          Open
        </AppButton>
        <AppButton aria-label="Fermer l'alerte PDF" compact onClick={() => setReceptionPdfAlert(null)} title="Fermer" type="button" variant="secondary">
          <AppIcon name="x" />
        </AppButton>
      </div>
    ) : null}
    </>
  );
}

function groupReceptionBatchesBySupplierAndDate(receptionBatches: ReceptionBatch[]) {
  const groups = new Map<
    string,
    {
      key: string;
      supplierName: string;
      dateLabel: string;
      batchNumbers: string[];
      articleCount: number;
      quantitySummary: string;
      status: ReceptionStatus;
      batches: ReceptionBatch[];
    }
  >();

  receptionBatches.forEach((batch) => {
    const supplierName = batch.supplierName || "Fournisseur inconnu";
    const dateLabel = formatDate(batch.receptionDate);
    const key = `${normalizeSearchText(supplierName)}-${dateLabel}`;
    const group = groups.get(key);

    if (group) {
      group.batches.push(batch);
      group.batchNumbers.push(batch.batchNumber);
      group.articleCount += batch.articleCount;
      group.quantitySummary = summarizeReceptionGroupQuantities(group.batches);
      group.status = group.status === "non_conforme" || batch.status === "non_conforme" ? "non_conforme" : "conforme";
      return;
    }

    groups.set(key, {
      key,
      supplierName,
      dateLabel,
      batchNumbers: [batch.batchNumber],
      articleCount: batch.articleCount,
      quantitySummary: batch.quantitySummary,
      status: batch.status,
      batches: [batch],
    });
  });

  return [...groups.values()];
}

function summarizeReceptionGroupQuantities(batches: ReceptionBatch[]) {
  return [...new Set(batches.map((batch) => batch.quantitySummary).filter(Boolean))].join(" / ") || "--";
}

function parseReceptionObservationFields(observations: string | null) {
  return String(observations ?? "")
    .split(/\r?\n/)
    .reduce(
      (fields, line) => {
        const trimmedLine = line.trim();
        if (trimmedLine.toLowerCase().startsWith("bl:")) {
          return { ...fields, deliveryNote: trimmedLine.slice(3).trim() };
        }
        if (trimmedLine.toLowerCase().startsWith("receptionne par:")) {
          return { ...fields, receivedBy: trimmedLine.slice("receptionne par:".length).trim() };
        }
        return fields;
      },
      { deliveryNote: "", receivedBy: "" },
    );
}

function ReceptionDetails({
  editingBatches,
  suppliers,
  onBack,
  onReceptionSaved,
}: {
  editingBatches: ReceptionBatch[];
  suppliers: Supplier[];
  onBack: () => void;
  onReceptionSaved: (batchId: string) => Promise<void>;
}) {
  const primaryEditingBatch = editingBatches[0] ?? null;
  const mergedEditingBatchIds = editingBatches.slice(1).map((batch) => batch.id);
  const isEditingReception = Boolean(primaryEditingBatch);
  const editingBatchKey = editingBatches.map((batch) => batch.id).join("|");
  const [receptionDate, setReceptionDate] = useState(todayInputValue);
  const receptionTime = "06:30";
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [supplierCatalog, setSupplierCatalog] = useState<Product[]>([]);
  const [lines, setLines] = useState<ReceptionDraftLine[]>([]);
  const [focusedLineId, setFocusedLineId] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const filteredCatalog = useMemo(() => filterProducts(supplierCatalog, catalogSearch), [catalogSearch, supplierCatalog]);

  useEffect(() => {
    if (!primaryEditingBatch) {
      setReceptionDate(todayInputValue);
      setSupplierId(suppliers[0]?.id || "");
      setDeliveryNote("");
      setReceivedBy("");
      setLines([]);
      setFocusedLineId("");
      setSaveStatus("idle");
      setMessage("");
      return;
    }

    let cancelled = false;
    async function loadReceptionForEdit() {
      setSaveStatus("idle");
      setMessage("");
      setLines([]);
      setFocusedLineId("");

      try {
        const groupLines = await Promise.all(editingBatches.map((batch) => fetchReceptionBatchLines(batch.id)));
        if (cancelled) return;

        const observationFields = parseReceptionObservationFields(primaryEditingBatch.observations);
        setReceptionDate(toInputDateValue(new Date(primaryEditingBatch.receptionDate)));
        setSupplierId(primaryEditingBatch.supplierId);
        setDeliveryNote(observationFields.deliveryNote);
        setReceivedBy(observationFields.receivedBy);
        setLines(
          groupLines.flat().map((line) => ({
            localId: line.id,
            lineId: line.id,
            productId: line.productId,
            productCode: line.productCode,
            productName: line.productName,
            unit: line.unit,
            quantity: String(line.quantity),
            supplierLot: line.supplierLot,
            expiryDate: line.expiryDate ?? "",
            transportTemperature: line.transportTemperatureC === null ? "" : String(line.transportTemperatureC),
            temperatureStatus: line.temperatureStatus,
            hygieneStatus: line.hygieneStatus,
            observations: line.observations ?? "",
          })),
        );
      } catch (error) {
        console.error("Reception edit load failed", error);
        if (!cancelled) {
          setSaveStatus("error");
          setMessage(formatApiError(error, "Impossible de charger la reception a modifier."));
        }
      }
    }

    void loadReceptionForEdit();

    return () => {
      cancelled = true;
    };
  }, [editingBatchKey, primaryEditingBatch?.id, suppliers]);

  useEffect(() => {
    setSupplierId((current) => current || suppliers[0]?.id || "");
  }, [suppliers]);

  useEffect(() => {
    if (!supplierId) {
      setSupplierCatalog([]);
      return;
    }

    let cancelled = false;
    async function loadSupplierCatalog() {
      try {
        const products = await fetchSupplierRawMaterialCatalog(supplierId);
        if (!cancelled) setSupplierCatalog(products);
      } catch (error) {
        console.error("Supplier material catalog load failed", error);
        if (!cancelled) setSupplierCatalog([]);
      }
    }

    void loadSupplierCatalog();

    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  function addCatalogProduct(product: Product) {
    const localId = `${product.id}-${Date.now()}-${lines.length}`;
    setLines((current) => [
      ...current,
      {
        localId,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        quantity: "",
        supplierLot: "",
        expiryDate: "",
        transportTemperature: "",
        temperatureStatus: "conforme",
        hygieneStatus: "conforme",
        observations: "",
      },
    ]);
    setFocusedLineId(localId);
    setMessage("");
    setSaveStatus("idle");
  }

  function updateLine(localId: string, patch: Partial<ReceptionDraftLine>) {
    setLines((current) => current.map((line) => (line.localId === localId ? { ...line, ...patch } : line)));
  }

  function removeLine(localId: string) {
    setLines((current) => current.filter((line) => line.localId !== localId));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    const validationMessage = validateReceptionDraft(supplierId, lines);
    if (validationMessage) {
      setSaveStatus("error");
      setMessage(validationMessage);
      return;
    }

    setSaveStatus("saving");

	    try {
	      const receptionTimestamp = new Date(`${receptionDate}T${receptionTime || "00:00"}`).toISOString();
	      const observationParts = [
	        deliveryNote.trim() ? `BL: ${deliveryNote.trim()}` : "",
	        receivedBy.trim() ? `Receptionne par: ${receivedBy.trim()}` : "",
	      ].filter(Boolean);
      const receptionInput = {
        supplierId,
        receptionDate: receptionTimestamp,
        observations: observationParts.length > 0 ? observationParts.join("\n") : null,
        lines: lines.map<ReceptionBatchLineInput>((line) => ({
          id: line.lineId,
          productId: line.productId,
          supplierLot: line.supplierLot,
          quantity: Number(line.quantity),
          unit: line.unit,
          expiryDate: line.expiryDate || null,
          transportTemperatureC: Number.isFinite(Number(line.transportTemperature)) ? Number(line.transportTemperature) : null,
          temperatureStatus: line.temperatureStatus,
          hygieneStatus: line.hygieneStatus,
          observations: line.observations || null,
        })),
      };
      const batchId =
        isEditingReception && primaryEditingBatch
          ? await updateReceptionBatch({
              ...receptionInput,
              batchId: primaryEditingBatch.id,
              mergedBatchIds: mergedEditingBatchIds,
            })
          : await createReceptionBatch(receptionInput);

      await onReceptionSaved(batchId);
    } catch (error) {
      console.error("Reception save failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible d'enregistrer la reception."));
    }
  }

	  return (
	    <main className="reception-workspace">
	      <form autoComplete="off" className="reception-batch-form" id="reception-batch-form" onSubmit={handleSubmit}>
	        <section className="reception-top-grid">
	          <AppCardAside className="reception-catalog-panel">
	            <div className="reception-panel-title">
	              <h2>Catalogue Fournisseur</h2>
	              <span>{filteredCatalog.length}</span>
	            </div>
	            <input
	              autoComplete="off"
	              value={catalogSearch}
	              onChange={(event) => setCatalogSearch(event.target.value)}
	            />
	            <div className="reception-catalog-table">
	              <table>
	                <thead>
	                  <tr>
	                    <th>Produit</th>
	                    <th>Categorie</th>
	                  </tr>
	                </thead>
	                <tbody>
	                  {filteredCatalog.map((product) => (
	                    <tr key={product.id} onDoubleClick={() => addCatalogProduct(product)}>
	                      <td>
	                        <strong>{product.name}</strong>
	                      </td>
	                      <td>
	                        <span className="reception-category-badge">Sec</span>
	                      </td>
	                    </tr>
	                  ))}
	                  {supplierId && filteredCatalog.length === 0 ? (
	                    <TableEmpty colSpan={2}>Aucune matiere premiere associee a ce fournisseur.</TableEmpty>
	                  ) : null}
	                </tbody>
	              </table>
	            </div>
	          </AppCardAside>

	          <div className="reception-main-column">
	            <AppCard className="reception-parameters-panel">
	              <div className="reception-panel-title">
	                <h2>{isEditingReception ? "Modifier Reception" : "Parametres de Reception"}</h2>
	                <div className="reception-title-actions">
	                  <span>{primaryEditingBatch ? primaryEditingBatch.batchNumber : `N REC-${receptionDate.replace(/-/g, "")}-001`}</span>
	                  <AppButton className="danger-link" onClick={onBack} type="button" variant="secondary">
	                    Annuler
	                  </AppButton>
	                  <AppButton disabled={saveStatus === "saving"} type="submit">
	                    {saveStatus === "saving" ? (
                        <TraceabilityLoader compact label={isEditingReception ? "Modification..." : "Validation..."} />
                      ) : isEditingReception ? (
                        "Modifier la Reception"
                      ) : (
                        "Valider la Reception"
                      )}
	                  </AppButton>
	                </div>
	              </div>
	              <div className="reception-parameters-grid">
	                <Field label="Fournisseur">
	                  <AppCombobox
	                    emptyLabel="Aucun fournisseur trouve."
	                    options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
	                    onChange={setSupplierId}
	                    placeholder="Selectionner un fournisseur"
	                    value={supplierId}
	                  />
	                </Field>
	                <Field label="Date de reception">
	                  <AppDatePicker value={receptionDate} onChange={setReceptionDate} />
	                </Field>
	                <Field label="Bon de livraison (BL)">
	                  <input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} />
	                </Field>
	                <Field label="Receptionne par">
	                  <input value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} />
	                </Field>
	              </div>
	            </AppCard>

	            <AppCard className="reception-articles-panel">
	              <div className="table-toolbar reception-table-toolbar">
	                <div className="panel-title no-border">
	                  <span className="panel-icon">AR</span>
	                  <div>
	                    <h2>Articles Receptionnes</h2>
	                    <p>{lines.length} article(s)</p>
	                  </div>
	                </div>
	              </div>
	              <ReceptionEntryLinesTable focusLineId={focusedLineId} lines={lines} onRemove={removeLine} onUpdate={updateLine} />
	              {message ? <p className={cx("save-message", saveStatus === "error" ? "error" : "success")}>{message}</p> : null}
	            </AppCard>
	          </div>
	        </section>
	      </form>
	    </main>
	  );
	}

function ProductionModule({
  batches,
  products,
  selectedBatchId,
  onProductionDeleted,
  onProductionSaved,
  onSelectBatch,
}: {
  batches: ProductionBatch[];
  products: Product[];
  selectedBatchId: string;
  onProductionDeleted: (batchIds: string[]) => Promise<void>;
  onProductionSaved: (batchId: string) => Promise<void>;
  onSelectBatch: (batchId: string) => void;
}) {
  type ProductionScreenMode = "overview" | "entry";
  type ProductionDetailMode = "preview" | "schema";
  type ProductionHistoryPanelMode = "history" | "detail";
  type ProductionLotDraft = {
    lots: AvailableLotOption[];
    selectedLotIds: string[];
    status: "loading" | "ready" | "error";
  };

  const activeBlueprints = useMemo(
    () => products.filter((product) => product.type !== "raw" && product.recipeStatus === "active"),
    [products],
  );
  const [screenMode, setScreenMode] = useState<ProductionScreenMode>("overview");
  const [detailMode, setDetailMode] = useState<ProductionDetailMode>("preview");
  const [historyPanelMode, setHistoryPanelMode] = useState<ProductionHistoryPanelMode>("history");
  const [historyColumnFilters, setHistoryColumnFilters] = useState<ProductColumnFilter[]>([]);
  const [recipeSearchTerm, setRecipeSearchTerm] = useState("");
  const [openRecipeUsageProductId, setOpenRecipeUsageProductId] = useState<string | null>(null);
  const [isHistorySelectionMode, setIsHistorySelectionMode] = useState(false);
  const [selectedHistoryBatchIds, setSelectedHistoryBatchIds] = useState<string[]>([]);
  const [workspaceBatchIds, setWorkspaceBatchIds] = useState<string[]>([]);
  const [deleteHistoryCandidate, setDeleteHistoryCandidate] = useState<ProductionBatch[] | null>(null);
  const [historyPdfCopyCount, setHistoryPdfCopyCount] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState(activeBlueprints[0]?.id ?? "");
  const [productionDate, setProductionDate] = useState(todayInputValue);
  const [responsibleName, setResponsibleName] = useState("");
  const [operation, setOperation] = useState("");
  const [observations, setObservations] = useState("");
  const [componentDrafts, setComponentDrafts] = useState<ProductionComponentDraft[]>([]);
  const [lotDraftsByProductId, setLotDraftsByProductId] = useState<Record<string, ProductionLotDraft>>({});
  const [expandedComponentRows, setExpandedComponentRows] = useState<Record<string, boolean>>({});
  const [expandedPreviewRows, setExpandedPreviewRows] = useState<Record<string, boolean>>({});
  const [componentStatus, setComponentStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [detailRows, setDetailRows] = useState<ProductionConsumptionDetail[]>([]);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [schemaDiagram, setSchemaDiagram] = useState<ProductSchemaDiagram | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<"idle" | "loading" | "error">("idle");
  const [pdfStatus, setPdfStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [pdfMessage, setPdfMessage] = useState("");
  const [historyPdfAlert, setHistoryPdfAlert] = useState<{ filePath: string; description: string } | null>(null);
  const [historyActionStatus, setHistoryActionStatus] = useState<"idle" | "deleting" | "success" | "error">("idle");
  const [historyActionMessage, setHistoryActionMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedProduct = activeBlueprints.find((product) => product.id === selectedProductId) ?? null;
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? null;
  const generatedLot = useMemo(() => generateProductionLotNumber(selectedProduct, productionDate), [productionDate, selectedProduct]);
  const hasExistingProductionForDate = useMemo(() => {
    if (!selectedProduct || !productionDate) return false;
    return batches.some(
      (batch) =>
        batch.productId === selectedProduct.id &&
        batch.status === "validated" &&
        toInputDateValue(new Date(batch.productionDate)) === productionDate,
    );
  }, [batches, productionDate, selectedProduct]);
  const selectedBatchRows = detailRows;
  const selectedBatchPreviewComponents = schemaDiagram?.components ?? emptyProductSchemaNodes;
  const previewLotsByProductId = useMemo(() => groupProductionRowsByProductId(selectedBatchRows), [selectedBatchRows]);
  const allSelectedComponents = useMemo(() => uniqueProductionSchemaNodes(componentDrafts.map((draft) => draft.component)), [componentDrafts]);
  const historyBatches = useMemo(
    () => [...batches].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [batches],
  );
  const filteredBatches = useMemo(() => {
    if (screenMode !== "overview") return historyBatches;
    return historyBatches.filter((batch) => matchesProductionHistoryColumnFilters(batch, historyColumnFilters));
  }, [historyBatches, historyColumnFilters, screenMode]);
  const selectedHistoryBatches = useMemo(
    () => batches.filter((batch) => selectedHistoryBatchIds.includes(batch.id) && batch.status === "validated"),
    [batches, selectedHistoryBatchIds],
  );
  const workspaceBatches = useMemo(() => workspaceBatchIds.flatMap((batchId) => batches.find((batch) => batch.id === batchId) ?? []), [batches, workspaceBatchIds]);
  const exportableWorkspaceBatches = useMemo(() => workspaceBatches.filter((batch) => batch.status === "validated"), [workspaceBatches]);
  const filteredBlueprints = useMemo(() => {
    const query = recipeSearchTerm.trim().toLowerCase();
    if (!query) return activeBlueprints;
    return activeBlueprints.filter((product) =>
      [product.name, product.code, categoryLabels[product.category ?? "boulangerie"] ?? "", typeLabels[product.type]].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [activeBlueprints, recipeSearchTerm]);
  const recipeUsageByProductId = useMemo(() => {
    return Object.fromEntries(
      activeBlueprints
        .filter((product) => product.type === "semi_finished")
        .map((component) => [
          component.id,
          activeBlueprints.filter(
            (candidate) =>
              candidate.id !== component.id &&
              candidate.componentNames.some((componentName) => normalizeSearchText(componentName) === normalizeSearchText(component.name)),
          ),
        ]),
    );
  }, [activeBlueprints]);

  useEffect(() => {
    setSelectedProductId((current) => (current && activeBlueprints.some((product) => product.id === current) ? current : activeBlueprints[0]?.id ?? ""));
  }, [activeBlueprints]);

  useEffect(() => {
    if (openRecipeUsageProductId && !activeBlueprints.some((product) => product.id === openRecipeUsageProductId)) setOpenRecipeUsageProductId(null);
  }, [activeBlueprints, openRecipeUsageProductId]);

  useEffect(() => {
    if (batches.length > 0 && (!selectedBatchId || !batches.some((batch) => batch.id === selectedBatchId))) onSelectBatch(batches[0].id);
  }, [batches, onSelectBatch, selectedBatchId]);

  useEffect(() => {
    const existingValidatedIds = new Set(batches.filter((batch) => batch.status === "validated").map((batch) => batch.id));
    setSelectedHistoryBatchIds((current) => current.filter((batchId) => existingValidatedIds.has(batchId)));
  }, [batches]);

  useEffect(() => {
    const existingBatchIds = new Set(batches.map((batch) => batch.id));
    setWorkspaceBatchIds((current) => current.filter((batchId) => existingBatchIds.has(batchId)));
  }, [batches]);

  useEffect(() => {
    if (screenMode !== "overview") return;

    function handleHistoryDeleteKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || deleteHistoryCandidate || historyActionStatus === "deleting") return;
      if (!isDeleteKeyboardShortcut(event) || isEditableDeleteTarget(event.target)) return;
      if (selectedHistoryBatches.length === 0) return;

      event.preventDefault();
      requestDeleteSelectedHistoryBatches();
    }

    document.addEventListener("keydown", handleHistoryDeleteKeyDown);
    return () => document.removeEventListener("keydown", handleHistoryDeleteKeyDown);
  }, [deleteHistoryCandidate, historyActionStatus, screenMode, selectedHistoryBatches]);

  useEffect(() => {
    if (screenMode !== "entry" || !selectedProduct) {
      setComponentDrafts([]);
      setLotDraftsByProductId({});
      setExpandedComponentRows({});
      setComponentStatus("idle");
      return;
    }

    const product = selectedProduct;
    let cancelled = false;
    async function loadComponents() {
      setComponentStatus("loading");
      setComponentDrafts([]);
      setLotDraftsByProductId({});
      setExpandedComponentRows({});
      setPdfStatus("idle");
      setPdfMessage("");
      setSaveStatus("idle");
      setMessage("");
      try {
        const components = await fetchProductSchema(product.id);
        const allComponents = uniqueProductionSchemaNodes(components);
        const lotEntries = await Promise.all(
          allComponents.map(async (component) => {
            try {
              const lots = await fetchAvailableLotsForProduct(component.id, 3);
              return {
                component,
                draft: {
                  lots,
                  selectedLotIds: lots[0] ? [lots[0].id] : [],
                  status: "ready" as const,
                },
              };
            } catch (error) {
              console.error("Production lot suggestions failed", error);
              return {
                component,
                draft: {
                  lots: [],
                  selectedLotIds: [],
                  status: "error" as const,
                },
              };
            }
          }),
        );
        const nextLotDrafts = Object.fromEntries(lotEntries.map((entry) => [entry.component.id, entry.draft]));

        if (!cancelled) {
          setComponentDrafts(
            components.map((component) => ({
              component,
              lots: nextLotDrafts[component.id]?.lots ?? [],
              selectedLotIds: nextLotDrafts[component.id]?.selectedLotIds ?? [],
              confirmed: false,
              status: nextLotDrafts[component.id]?.status ?? "ready",
            })),
          );
          setLotDraftsByProductId(nextLotDrafts);
          setExpandedComponentRows(buildDefaultExpandedProductionRows(components));
          setComponentStatus("ready");
        }
      } catch (error) {
        console.error("Production blueprint load failed", error);
        if (!cancelled) {
          setComponentDrafts([]);
          setLotDraftsByProductId({});
          setExpandedComponentRows({});
          setComponentStatus("error");
        }
      }
    }

    void loadComponents();

    return () => {
      cancelled = true;
    };
  }, [screenMode, selectedProduct?.id]);

  useEffect(() => {
    if (!selectedBatchId) {
      setDetailRows([]);
      setDetailStatus("idle");
      return;
    }

    let cancelled = false;
    async function loadDetails() {
      setDetailStatus("loading");
      setDetailRows([]);
      try {
        const rows = await fetchProductionConsumptionDetails(selectedBatchId);
        if (!cancelled) {
          setDetailRows(rows);
          setDetailStatus("idle");
        }
      } catch (error) {
        console.error("Production details load failed", error);
        if (!cancelled) setDetailStatus("error");
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedBatchId]);

  useEffect(() => {
    if (!selectedBatch) {
      setSchemaDiagram(null);
      setSchemaStatus("idle");
      return;
    }

    const batch = selectedBatch;
    let cancelled = false;
    async function loadSchemaDiagram() {
      setSchemaStatus("loading");
      setSchemaDiagram(null);
      try {
        const diagram = await fetchProductSchemaDiagram(batch.productId);
        if (!cancelled) {
          setSchemaDiagram(diagram);
          setSchemaStatus("idle");
        }
      } catch (error) {
        console.error("Production schema diagram load failed", error);
        if (!cancelled) {
          setSchemaDiagram(null);
          setSchemaStatus("error");
        }
      }
    }

    void loadSchemaDiagram();

    return () => {
      cancelled = true;
    };
  }, [selectedBatch?.id, selectedBatch?.productId]);

  useEffect(() => {
    setExpandedPreviewRows(buildDefaultExpandedProductionRows(selectedBatchPreviewComponents));
  }, [selectedBatch?.id, selectedBatchPreviewComponents]);

  function selectComponentLot(componentId: string, lotId: string) {
    setLotDraftsByProductId((current) => ({
      ...current,
      [componentId]: {
        ...(current[componentId] ?? { lots: [], status: "ready" as const }),
        selectedLotIds: lotId ? [lotId] : [],
      },
    }));
    setComponentDrafts((current) =>
      current.map((draft) => (draft.component.id === componentId ? { ...draft, selectedLotIds: lotId ? [lotId] : [], confirmed: false } : draft)),
    );
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");
  }

  function updateProductionDate(value: string) {
    setProductionDate(value);
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");
  }

  function updateResponsibleName(value: string) {
    setResponsibleName(value);
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");
  }

  function navigateToProductionComponent(component: ProductSchemaNode) {
    if (component.type !== "semi_finished") return;

    setSelectedProductId(component.id);
    setRecipeSearchTerm(component.name);
    setOpenRecipeUsageProductId(null);
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");
  }

  function startNewProduction() {
    setScreenMode("entry");
    setRecipeSearchTerm("");
    setPdfStatus("idle");
    setPdfMessage("");
    setSaveStatus("idle");
    setMessage("");
  }

  async function handleValidateProduction() {
    if (!selectedProduct) {
      setSaveStatus("error");
      setMessage("Selectionnez un produit a produire.");
      return;
    }

    if (!generatedLot) {
      setSaveStatus("error");
      setMessage("Impossible de generer le lot: categorie ou codification manquante.");
      return;
    }

    if (componentDrafts.length === 0) {
      setSaveStatus("error");
      setMessage("Le schema actif ne contient aucun composant.");
      return;
    }

    const traceableComponents = allSelectedComponents.filter((component) => !isWaterComponent(component));
    const missingComponent = traceableComponents.find((component) => (lotDraftsByProductId[component.id]?.selectedLotIds.length ?? 0) === 0);
    if (missingComponent) {
      setSaveStatus("error");
      setMessage(`Selectionnez un lot pour ${missingComponent.name}.`);
      return;
    }

    setSaveStatus("saving");
    setMessage("");
    try {
      const batchId = await createProductionWithTraceability({
        productionDate: new Date(`${productionDate}T06:30`).toISOString(),
        productId: selectedProduct.id,
        generatedLot,
        responsibleName: responsibleName.trim() || null,
        operation: operation.trim() || null,
        observations: observations.trim() || null,
        consumedLotIds: [...new Set(traceableComponents.flatMap((component) => lotDraftsByProductId[component.id]?.selectedLotIds ?? []))],
      });

      setSaveStatus("success");
      setMessage("Production validee.");
      await onProductionSaved(batchId);
      onSelectBatch(batchId);
    } catch (error) {
      console.error("Production save failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible de valider la production."));
    }
  }

  async function handleExportProductionPdf() {
    if (!selectedProduct) {
      setPdfStatus("error");
      setPdfMessage("Selectionnez un produit a exporter.");
      return;
    }

    if (!generatedLot) {
      setPdfStatus("error");
      setPdfMessage("Impossible de generer le lot: categorie ou codification manquante.");
      return;
    }

    if (componentStatus !== "ready" || componentDrafts.length === 0) {
      setPdfStatus("error");
      setPdfMessage("Le schema actif ne contient aucun composant a exporter.");
      return;
    }

    setPdfStatus("exporting");
    setPdfMessage("");
    try {
      const result = await downloadProductionTraceabilityPdf(
        buildProductionPdfData({
          categoryLabel: formatCategory(selectedProduct.category),
          componentDrafts,
          nestedLotDrafts: lotDraftsByProductId,
          product: selectedProduct,
          productLot: generatedLot,
          productionDate,
          responsibleName: responsibleName.trim() || null,
        }),
      );
      const location = "filePath" in result ? result.filePath : "telechargement lance";
      setPdfStatus("success");
      setPdfMessage(`PDF exporte: ${location}`);
    } catch (error) {
      console.error("Production PDF export failed", error);
      setPdfStatus("error");
      setPdfMessage(formatApiError(error, "Impossible d'exporter le PDF."));
    }
  }

  async function handleExportSelectedProductionPdfs() {
    if (exportableWorkspaceBatches.length === 0) {
      setPdfStatus("error");
      setPdfMessage("Ajoutez au moins une production validee au workspace.");
      setHistoryPdfAlert(null);
      return;
    }

    setPdfStatus("exporting");
    setPdfMessage("");
    setHistoryPdfAlert(null);
    try {
      const pdfItems = await Promise.all(
        exportableWorkspaceBatches.map(async (batch) => {
          const [rows, schema] = await Promise.all([fetchProductionConsumptionDetails(batch.id), fetchProductSchema(batch.productId)]);
          return schema.length > 0 ? buildProductionPdfDataFromBatchSchema({ batch, components: schema, rows }) : buildProductionPdfDataFromBatch({ batch, rows });
        }),
      );
      const repeatedPdfItems = pdfItems.flatMap((item) => Array.from({ length: historyPdfCopyCount }, () => item));
      const result = await downloadProductionTraceabilityBatchPdf(repeatedPdfItems);
      const exportedFilePath = "filePath" in result && typeof result.filePath === "string" ? result.filePath : "";
      const location = exportedFilePath || "telechargement lance";
      setPdfStatus("success");
      if (exportedFilePath) {
        setPdfMessage("");
        setHistoryPdfAlert({
          filePath: exportedFilePath,
          description: `PDF groupe exporte: ${location}`,
        });
      } else {
        setPdfMessage(`PDF groupe exporte: ${location}`);
      }
    } catch (error) {
      console.error("Grouped production PDF export failed", error);
      setPdfStatus("error");
      setPdfMessage(formatApiError(error, "Impossible d'exporter le PDF groupe."));
      setHistoryPdfAlert(null);
    }
  }

  async function handleOpenHistoryPdfAlert() {
    if (!historyPdfAlert) return;

    try {
      await openProductionPdfFile(historyPdfAlert.filePath);
    } catch (error) {
      console.error("Open production PDF failed", error);
      setPdfStatus("error");
      setPdfMessage(formatApiError(error, "Impossible d'ouvrir le PDF."));
    }
  }

  function addBatchToWorkspace(batch: ProductionBatch) {
    setPdfStatus("idle");
    setPdfMessage("");
    setHistoryPdfAlert(null);
    setWorkspaceBatchIds((current) => (current.includes(batch.id) ? current : [...current, batch.id]));
  }

  function removeBatchFromWorkspace(batchId: string) {
    setPdfStatus("idle");
    setPdfMessage("");
    setHistoryPdfAlert(null);
    setWorkspaceBatchIds((current) => current.filter((currentBatchId) => currentBatchId !== batchId));
  }

  function openProductionHistoryDetail(batchId: string) {
    onSelectBatch(batchId);
    setDetailMode("preview");
    setHistoryPanelMode("detail");
  }

  function toggleHistoryBatchSelection(batch: ProductionBatch, checked: boolean) {
    if (batch.status !== "validated") return;
    setHistoryActionStatus("idle");
    setHistoryActionMessage("");
    setSelectedHistoryBatchIds((current) => {
      if (!checked) return current.filter((batchId) => batchId !== batch.id);
      return current.includes(batch.id) ? current : [...current, batch.id];
    });
  }

  function toggleHistorySelectionMode() {
    setHistoryActionStatus("idle");
    setHistoryActionMessage("");
    setIsHistorySelectionMode((current) => {
      if (current) setSelectedHistoryBatchIds([]);
      return !current;
    });
  }

  function requestDeleteSelectedHistoryBatches() {
    if (selectedHistoryBatches.length === 0) return;
    setDeleteHistoryCandidate(selectedHistoryBatches);
    setHistoryActionStatus("idle");
    setHistoryActionMessage("");
  }

  async function confirmDeleteSelectedHistoryBatches() {
    if (!deleteHistoryCandidate || deleteHistoryCandidate.length === 0) return;

    const batchIds = deleteHistoryCandidate.map((batch) => batch.id);
    setHistoryActionStatus("deleting");
    setHistoryActionMessage("");

    try {
      await deleteProductionBatches(batchIds);
      setDeleteHistoryCandidate(null);
      setSelectedHistoryBatchIds((current) => current.filter((batchId) => !batchIds.includes(batchId)));
      setWorkspaceBatchIds((current) => current.filter((batchId) => !batchIds.includes(batchId)));
      await onProductionDeleted(batchIds);
      setHistoryActionStatus("success");
      setHistoryActionMessage(batchIds.length === 1 ? "Production supprimee." : `${batchIds.length} productions supprimees.`);
    } catch (error) {
      console.error("Production history delete failed", error);
      setHistoryActionStatus("error");
      setHistoryActionMessage(formatApiError(error, "Impossible de supprimer la production selectionnee."));
    }
  }

  function updateHistoryPdfCopyCount(value: string) {
    const nextValue = Number.parseInt(value, 10);
    setHistoryPdfCopyCount(Number.isFinite(nextValue) ? Math.min(12, Math.max(1, nextValue)) : 1);
  }

  if (screenMode === "entry") {
    return (
      <main className="production-workspace">
        <AppCardAside className="production-catalog-panel">
          <div className="production-catalog-header">
            <h2>Catalogue des recettes</h2>
            <AppIcon name="columns" />
          </div>
          <div className="production-search-row">
            <input autoComplete="off" placeholder="Rechercher recette, produit..." value={recipeSearchTerm} onChange={(event) => setRecipeSearchTerm(event.target.value)} />
          </div>
          <div className="production-recipe-list">
            {filteredBlueprints.length === 0 ? <EmptyState compact>Aucun schema actif.</EmptyState> : null}
            {filteredBlueprints.map((product) => {
              const linkedProducts = recipeUsageByProductId[product.id] ?? [];
              const isUsageOpen = openRecipeUsageProductId === product.id;

              return (
                <div
                  className={cx("production-recipe-card", product.id === selectedProductId && "selected")}
                  key={product.id}
                  onClick={() => {
                    setSelectedProductId(product.id);
                    setOpenRecipeUsageProductId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedProductId(product.id);
                    setOpenRecipeUsageProductId(null);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="production-recipe-card-header">
                    <strong>{product.name}</strong>
                    <span className="production-recipe-card-actions">
                      {product.type === "semi_finished" ? (
                        <button
                          aria-expanded={isUsageOpen}
                          aria-label={`Voir les produits qui utilisent ${product.name}`}
                          className="production-recipe-usage-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenRecipeUsageProductId((current) => (current === product.id ? null : product.id));
                          }}
                          type="button"
                        >
                          <AppIcon name="search" />
                        </button>
                      ) : null}
                      <span className="production-active-pill">Actif</span>
                    </span>
                  </div>
                  <div className="production-recipe-card-meta">
                    <ProductTypeBadge type={product.type} />
                    <span>{formatCategory(product.category)}</span>
                    <span>{product.componentCount} comp.</span>
                  </div>
                  {isUsageOpen ? (
                    <div className="production-recipe-usage-popover" onClick={(event) => event.stopPropagation()}>
                      {linkedProducts.length === 0 ? (
                        <p>Aucun produit actif n'utilise ce semi-fini.</p>
                      ) : (
                        linkedProducts.map((linkedProduct) => (
                          <button
                            key={linkedProduct.id}
                            onClick={() => {
                              setSelectedProductId(linkedProduct.id);
                              setOpenRecipeUsageProductId(null);
                            }}
                            type="button"
                          >
                            <strong>{linkedProduct.name}</strong>
                            <span>
                              {typeLabels[linkedProduct.type]} · {formatCategory(linkedProduct.category)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </AppCardAside>

        <section className="production-main-column">
          <AppCard className="production-entry-panel">
            <div className="production-entry-header">
              <div>
                <h2>{selectedProduct?.name ?? "Produit"}</h2>
                <p>{generatedLot || "Lot non genere"}</p>
              </div>
              <div className="production-date-control">
                <span>Date de production</span>
                <AppDatePicker value={productionDate} onChange={updateProductionDate} />
              </div>
              <label className="production-responsible-control">
                <span>Fabrique par</span>
                <input
                  autoComplete="off"
                  onChange={(event) => updateResponsibleName(event.target.value)}
                  placeholder="Nom facultatif"
                  value={responsibleName}
                />
              </label>
              <div className="production-entry-actions">
                <AppButton onClick={() => setScreenMode("overview")} type="button" variant="secondary">
                  Retour
                </AppButton>
                <span className="production-confirm-action-wrap">
                  {hasExistingProductionForDate ? (
                    <span
                      aria-label="Production deja confirmee pour cette date"
                      className="production-existing-confirmation-dot"
                      title="Production deja confirmee pour cette date"
                    />
                  ) : null}
                  <AppButton disabled={saveStatus === "saving" || componentStatus === "loading"} onClick={() => void handleValidateProduction()} type="button">
                    {saveStatus === "saving" ? <TraceabilityLoader compact label="Validation..." /> : "Confirmer les lots"}
                  </AppButton>
                </span>
              </div>
            </div>

            <div className="table-wrap production-component-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Composant</th>
                    <th>Type</th>
                    <th>Lot</th>
                    <th>Source/Fournisseur</th>
                  </tr>
                </thead>
                <tbody>
                  {componentStatus === "loading" ? (
                    <TableEmpty colSpan={4}>
                      <TraceabilityLoader label="Chargement du schema..." />
                    </TableEmpty>
                  ) : null}
                  {componentStatus === "error" ? <TableEmpty colSpan={4}>Impossible de charger le schema.</TableEmpty> : null}
                  {componentStatus === "ready" && componentDrafts.length === 0 ? <TableEmpty colSpan={4}>Aucun composant dans ce schema.</TableEmpty> : null}
                  {orderProductionComponentDrafts(componentDrafts).flatMap((draft, index) =>
                    renderProductionComponentRows({
                      depth: 0,
                      expandedComponentRows,
                      lotDraftsByProductId,
                      node: draft.component,
                      onLotChange: selectComponentLot,
                      onNavigateToComponent: navigateToProductionComponent,
                      rowKey: `${draft.component.id}:${index}`,
                      onToggleExpand: (rowKey) => setExpandedComponentRows((current) => ({ ...current, [rowKey]: !current[rowKey] })),
                    }),
                  )}
                </tbody>
              </table>
            </div>
            {message ? <p className={cx("save-message", saveStatus === "error" ? "error" : "success")}>{message}</p> : null}
            {pdfMessage ? <p className={cx("save-message", pdfStatus === "error" ? "error" : "success")}>{pdfMessage}</p> : null}
          </AppCard>
        </section>
      </main>
    );
  }

  return (
    <>
    <main className="production-overview-workspace">
      <AppCardAside className="production-overview-history production-workspace-panel">
        <div className="production-overview-history-header">
          <div className="production-overview-history-titlebar">
            <div>
              <h2>Workspace production</h2>
              <p>{workspaceBatches.length} production(s)</p>
            </div>
          </div>
          <div className="production-overview-history-actions">
            <label className="production-pdf-copy-control">
              <span>Copies</span>
              <input
                aria-label="Nombre de copies PDF par production dans le workspace"
                max={12}
                min={1}
                onChange={(event) => updateHistoryPdfCopyCount(event.target.value)}
                type="number"
                value={historyPdfCopyCount}
              />
            </label>
            <AppButton compact disabled={pdfStatus === "exporting" || exportableWorkspaceBatches.length === 0} onClick={() => void handleExportSelectedProductionPdfs()} type="button" variant="secondary">
              <AppIcon name="file" />
              {pdfStatus === "exporting" ? <TraceabilityLoader compact label="Export..." /> : "Exporter PDF"}
            </AppButton>
          </div>
        </div>
        {pdfMessage && screenMode === "overview" ? <p className={cx("save-message production-overview-export-message", pdfStatus === "error" ? "error" : "success")}>{pdfMessage}</p> : null}
        <div className="table-wrap production-overview-history-table production-workspace-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Lot</th>
                <th>Production</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workspaceBatches.length === 0 ? <TableEmpty colSpan={4}>Double-cliquez une production dans l'historique pour l'ajouter ici.</TableEmpty> : null}
              {workspaceBatches.map((batch) => (
                <tr className={cx(batch.id === selectedBatchId && "selected-row")} key={batch.id} onClick={() => onSelectBatch(batch.id)}>
                  <td>{batch.productName}</td>
                  <td>
                    <strong>{batch.generatedLot}</strong>
                  </td>
                  <td className="production-history-date-cell">
                    <strong>{formatDate(batch.productionDate)}</strong>
                    <span>Conf. {formatDateTime(batch.createdAt)}</span>
                  </td>
                  <td className="production-row-action-cell">
                    <button
                      aria-label={`Retirer ${batch.generatedLot} du workspace`}
                      className="production-row-action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeBatchFromWorkspace(batch.id);
                      }}
                      type="button"
                    >
                      <AppIcon name="x" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCardAside>

      <AppCard className="production-overview-detail production-history-browser">
        <div className={cx("production-history-slider", historyPanelMode === "detail" && "show-detail")}>
          <section className="production-history-slide">
            <div className="production-overview-history-header">
              <div className="production-overview-history-titlebar">
                <div>
                  <h2>Historique de production</h2>
                  <p>{filteredBatches.length} production(s)</p>
                </div>
                <AppButton compact onClick={startNewProduction} type="button">
                  <AppIcon name="plus" />
                  Nouveau Produit
                </AppButton>
              </div>
              <div className="production-overview-history-toolbar">
                <ProductColumnFilterBar
                  dateHelperColumns={["productionDate", "confirmedAt"]}
                  filters={historyColumnFilters}
                  options={productionHistoryColumnFilterOptions}
                  placeholder="Filter by produit, categorie, lot..."
                  valueSuggestions={productionHistoryColumnValueSuggestions}
                  onFiltersChange={setHistoryColumnFilters}
                />
                <div className="production-overview-history-actions">
                  <AppButton
                    aria-label={isHistorySelectionMode ? "Masquer la selection" : "Afficher la selection"}
                    compact
                    onClick={toggleHistorySelectionMode}
                    title={isHistorySelectionMode ? "Masquer la selection" : "Selectionner des productions"}
                    type="button"
                    variant={isHistorySelectionMode ? "primary" : "secondary"}
                  >
                    <AppIcon name="check" />
                  </AppButton>
                </div>
              </div>
            </div>
            {historyActionMessage && screenMode === "overview" ? (
              <p className={cx("save-message production-overview-export-message", historyActionStatus === "error" ? "error" : "success")}>{historyActionMessage}</p>
            ) : null}
            <div className="table-wrap production-overview-history-table production-history-browser-table">
              <table className="data-table">
                <thead>
                  <tr>
                    {isHistorySelectionMode ? <th className="select-column"></th> : null}
                    <th>Produit</th>
                    <th>Type</th>
                    <th>Categorie</th>
                    <th>Lot</th>
                    <th>Production</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.length === 0 ? <TableEmpty colSpan={isHistorySelectionMode ? 7 : 6}>Aucune production enregistree.</TableEmpty> : null}
                  {filteredBatches.map((batch) => (
                    <tr
                      className={cx(batch.id === selectedBatchId && "selected-row")}
                      key={batch.id}
                      onClick={() => onSelectBatch(batch.id)}
                      onDoubleClick={() => addBatchToWorkspace(batch)}
                    >
                      {isHistorySelectionMode ? (
                        <td className="select-column" onClick={(event) => event.stopPropagation()}>
                          <label className="table-checkbox">
                            <input
                              aria-label={`Selectionner ${batch.generatedLot}`}
                              checked={selectedHistoryBatchIds.includes(batch.id)}
                              disabled={batch.status !== "validated"}
                              onChange={(event) => toggleHistoryBatchSelection(batch, event.target.checked)}
                              type="checkbox"
                            />
                            <span></span>
                          </label>
                        </td>
                      ) : null}
                      <td>{batch.productName}</td>
                      <td>
                        <ProductTypeBadge type={batch.productType} />
                      </td>
                      <td>{formatCategory(batch.category)}</td>
                      <td>
                        <div className="production-history-lot-cell">
                          <strong>{batch.generatedLot}</strong>
                        </div>
                      </td>
                      <td className="production-history-date-cell">
                        <strong>{formatDate(batch.productionDate)}</strong>
                        <span>Conf. {formatDateTime(batch.createdAt)}</span>
                      </td>
                      <td className="production-row-action-cell">
                        <button
                          aria-label={`Ouvrir le detail de ${batch.generatedLot}`}
                          className="production-row-action-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openProductionHistoryDetail(batch.id);
                          }}
                          type="button"
                        >
                          <AppIcon name="chevronRight" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="production-history-slide production-history-detail-slide">
            {selectedBatch ? (
              <>
                <div className="production-history-detail-header">
                  <div>
                    <h2>{selectedBatch.productName}</h2>
                    <p>{selectedBatch.generatedLot}</p>
                  </div>
                  <div className="production-detail-floating-actions">
                    <AppButton compact onClick={() => setHistoryPanelMode("history")} type="button" variant="secondary">
                      <AppIcon name="chevronLeft" />
                      Retour
                    </AppButton>
                    <div className="production-detail-tabs" role="tablist">
                      <button className={cx(detailMode === "preview" && "active")} onClick={() => setDetailMode("preview")} type="button">
                        <AppWindowIcon />
                        Preview
                      </button>
                      <button className={cx(detailMode === "schema" && "active")} onClick={() => setDetailMode("schema")} type="button">
                        <CodeIcon />
                        Schema
                      </button>
                    </div>
                  </div>
                </div>

                {detailMode === "preview" ? (
                  <div className="table-wrap production-overview-components-table">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Composant</th>
                          <th>Type</th>
                          <th>Lot</th>
                          <th>Source/Fournisseur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailStatus === "loading" || schemaStatus === "loading" ? (
                          <TableEmpty colSpan={4}>
                            <TraceabilityLoader label="Chargement..." />
                          </TableEmpty>
                        ) : null}
                        {detailStatus === "error" ? <TableEmpty colSpan={4}>Impossible de charger les lots.</TableEmpty> : null}
                        {detailStatus === "idle" && schemaStatus !== "loading" && selectedBatchPreviewComponents.length === 0 && selectedBatchRows.length === 0 ? (
                          <TableEmpty colSpan={4}>Aucun lot utilise.</TableEmpty>
                        ) : null}
                        {detailStatus === "idle" && schemaStatus !== "loading" && selectedBatchPreviewComponents.length > 0
                          ? orderProductionSchemaNodes(selectedBatchPreviewComponents).flatMap((component, index) =>
                              renderProductionPreviewRows({
                                depth: 0,
                                expandedPreviewRows,
                                lotsByProductId: previewLotsByProductId,
                                node: component,
                                onToggleExpand: (rowKey) => setExpandedPreviewRows((current) => ({ ...current, [rowKey]: !current[rowKey] })),
                                rowKey: `${component.id}:${index}`,
                              }),
                            )
                          : null}
                        {detailStatus === "idle" && schemaStatus === "error" && selectedBatchPreviewComponents.length === 0
                          ? selectedBatchRows.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  <strong>{row.productName}</strong>
                                </td>
                                <td>
                                  <ProductTypeBadge type={row.productType} />
                                </td>
                                <td>{renderLotText(row.supplierLot || row.lotNumber, row.lotCreatedAt)}</td>
                                <td>{row.sourceType === "reception" ? "Reception" : "Production interne"}</td>
                              </tr>
                            ))
                          : null}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="production-schema-panel">
                    <ProductionTraceabilityDiagram batch={selectedBatch} rows={selectedBatchRows} schema={schemaDiagram} status={schemaStatus} />
                  </div>
                )}
              </>
            ) : (
              <div className="production-overview-empty">
                <EmptyState large>Aucune production selectionnee.</EmptyState>
              </div>
            )}
          </section>
        </div>
      </AppCard>
    </main>
    {deleteHistoryCandidate ? (
      <ProductionHistoryDeleteDialog
        batches={deleteHistoryCandidate}
        isDeleting={historyActionStatus === "deleting"}
        onCancel={() => {
          if (historyActionStatus !== "deleting") setDeleteHistoryCandidate(null);
        }}
        onConfirm={() => void confirmDeleteSelectedHistoryBatches()}
      />
    ) : null}
    {historyPdfAlert ? (
      <div aria-live="polite" className="production-pdf-alert" role="status">
        <div className="production-pdf-alert-content">
          <strong>PDF exporte</strong>
          <p>{historyPdfAlert.description}</p>
        </div>
        <AppButton compact onClick={() => void handleOpenHistoryPdfAlert()} type="button">
          Open
        </AppButton>
        <AppButton aria-label="Fermer l'alerte PDF" compact onClick={() => setHistoryPdfAlert(null)} title="Fermer" type="button" variant="secondary">
          <AppIcon name="x" />
        </AppButton>
      </div>
    ) : null}
    </>
  );
}

function flattenProductionSchemaNodes(nodes: ProductSchemaNode[]): ProductSchemaNode[] {
  return nodes.flatMap((node) => [node, ...flattenProductionSchemaNodes(node.children)]);
}

function uniqueProductionSchemaNodes(nodes: ProductSchemaNode[]): ProductSchemaNode[] {
  const uniqueNodes = new Map<string, ProductSchemaNode>();
  for (const node of flattenProductionSchemaNodes(nodes)) {
    if (!uniqueNodes.has(node.id)) uniqueNodes.set(node.id, node);
  }
  return [...uniqueNodes.values()];
}

function renderProductionComponentRows({
  depth,
  expandedComponentRows,
  lotDraftsByProductId,
  node,
  onLotChange,
  onNavigateToComponent,
  onToggleExpand,
  rowKey,
}: {
  depth: number;
  expandedComponentRows: Record<string, boolean>;
  lotDraftsByProductId: Record<string, { lots: AvailableLotOption[]; selectedLotIds: string[]; status: "loading" | "ready" | "error" }>;
  node: ProductSchemaNode;
  onLotChange: (componentId: string, lotId: string) => void;
  onNavigateToComponent: (component: ProductSchemaNode) => void;
  onToggleExpand: (rowKey: string) => void;
  rowKey: string;
}) {
  const draft = lotDraftsByProductId[node.id] ?? { lots: [], selectedLotIds: [], status: "ready" as const };
  const selectedLot = draft.lots.find((lot) => draft.selectedLotIds.includes(lot.id)) ?? null;
  const isExpandable = node.type === "semi_finished" && node.children.length > 0;
  const isExpanded = Boolean(expandedComponentRows[rowKey]);
  const rows = [
    <tr className={cx(isExpandable && "production-semi-finished-row", isExpanded && "expanded", depth > 0 && "production-semi-finished-child-row")} key={rowKey}>
      <td>
        <div className={cx("production-component-name-cell", depth > 0 && "nested")}>
          {isExpandable ? (
            <button aria-expanded={isExpanded} className="production-expand-row-button" onClick={() => onToggleExpand(rowKey)} type="button">
              <AppIcon name="chevronRight" />
            </button>
          ) : depth > 0 ? (
            <span className="production-child-row-spacer" />
          ) : null}
          {node.type === "semi_finished" ? (
            <button className="production-component-name-link" onClick={() => onNavigateToComponent(node)} type="button">
              {node.name}
            </button>
          ) : (
            <strong>{node.name}</strong>
          )}
        </div>
      </td>
      <td>
        <ProductTypeBadge type={node.type} />
      </td>
      <td>
        <ProductionLotDropdown draft={draft} onChange={(lotId) => onLotChange(node.id, lotId)} selectedLot={selectedLot} />
      </td>
      <td>{selectedLot ? selectedLot.supplierName || (selectedLot.sourceType === "fabrication" ? "Production interne" : "Reception") : "N/A"}</td>
    </tr>,
  ];

  if (isExpandable && isExpanded) {
    rows.push(
      ...orderProductionSchemaNodes(node.children).flatMap((child, index) =>
        renderProductionComponentRows({
          depth: depth + 1,
          expandedComponentRows,
          lotDraftsByProductId,
          node: child,
          onLotChange,
          onNavigateToComponent,
          onToggleExpand,
          rowKey: `${rowKey}/${child.id}:${index}`,
        }),
      ),
    );
  }

  return rows;
}

function renderProductionPreviewRows({
  depth,
  expandedPreviewRows,
  lotsByProductId,
  node,
  onToggleExpand,
  rowKey,
}: {
  depth: number;
  expandedPreviewRows: Record<string, boolean>;
  lotsByProductId: Record<string, ProductionConsumptionDetail[]>;
  node: ProductSchemaNode;
  onToggleExpand: (rowKey: string) => void;
  rowKey: string;
}) {
  const lots = lotsByProductId[node.id] ?? [];
  const selectedLot = lots[0] ?? null;
  const isExpandable = node.type === "semi_finished" && node.children.length > 0;
  const isExpanded = Boolean(expandedPreviewRows[rowKey]);
  const rows = [
    <tr className={cx(isExpandable && "production-semi-finished-row", isExpanded && "expanded", depth > 0 && "production-semi-finished-child-row")} key={rowKey}>
      <td>
        <div className={cx("production-component-name-cell", depth > 0 && "nested")}>
          {isExpandable ? (
            <button aria-expanded={isExpanded} className="production-expand-row-button" onClick={() => onToggleExpand(rowKey)} type="button">
              <AppIcon name="chevronRight" />
            </button>
          ) : depth > 0 ? (
            <span className="production-child-row-spacer" />
          ) : null}
          <strong>{node.name}</strong>
        </div>
      </td>
      <td>
        <ProductTypeBadge type={node.type} />
      </td>
      <td>{selectedLot ? renderLotText(selectedLot.supplierLot || selectedLot.lotNumber, selectedLot.lotCreatedAt) : ""}</td>
      <td>{selectedLot ? (selectedLot.sourceType === "reception" ? "Reception" : "Production interne") : "N/A"}</td>
    </tr>,
  ];

  if (isExpandable && isExpanded) {
    rows.push(
      ...orderProductionSchemaNodes(node.children).flatMap((child, index) =>
        renderProductionPreviewRows({
          depth: depth + 1,
          expandedPreviewRows,
          lotsByProductId,
          node: child,
          onToggleExpand,
          rowKey: `${rowKey}/${child.id}:${index}`,
        }),
      ),
    );
  }

  return rows;
}

function groupProductionRowsByProductId(rows: ProductionConsumptionDetail[]) {
  return rows.reduce<Record<string, ProductionConsumptionDetail[]>>((groups, row) => {
    const productRows = groups[row.productId] ?? [];
    if (!productRows.some((existingRow) => existingRow.lotId === row.lotId)) productRows.push(row);
    groups[row.productId] = productRows;
    return groups;
  }, {});
}

function buildDefaultExpandedProductionRows(nodes: ProductSchemaNode[], parentKey = "") {
  return orderProductionSchemaNodes(nodes).reduce<Record<string, boolean>>((expandedRows, node, index) => {
    const rowKey = parentKey ? `${parentKey}/${node.id}:${index}` : `${node.id}:${index}`;
    if (node.type === "semi_finished" && node.children.length > 0) {
      expandedRows[rowKey] = true;
      Object.assign(expandedRows, buildDefaultExpandedProductionRows(node.children, rowKey));
    }
    return expandedRows;
  }, {});
}

function orderProductionComponentDrafts(drafts: ProductionComponentDraft[]) {
  return [...drafts].sort((left, right) => productionChildTypeOrder(left.component.type) - productionChildTypeOrder(right.component.type));
}

function orderProductionSchemaNodes(nodes: ProductSchemaNode[]) {
  return [...nodes].sort((left, right) => productionChildTypeOrder(left.type) - productionChildTypeOrder(right.type));
}

function productionChildTypeOrder(type: ProductType) {
  if (type === "raw") return 0;
  if (type === "semi_finished") return 1;
  return 2;
}

function isWaterComponent(component: ProductSchemaNode) {
  return component.type === "raw" && normalizeSearchText(component.name) === "eau";
}

function isDeleteKeyboardShortcut(event: globalThis.KeyboardEvent) {
  return (
    event.key === "Delete" ||
    event.key === "Backspace" ||
    event.key === "Clear" ||
    event.key === "Cancel" ||
    event.code === "Delete" ||
    event.code === "Backspace"
  );
}

function isEditableDeleteTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const editable = target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  if (!(editable instanceof HTMLElement)) return false;
  return !(editable instanceof HTMLInputElement && editable.type === "checkbox");
}

function ProductionHistoryDeleteDialog({
  batches,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  batches: ProductionBatch[];
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AppDialogShell
      footer={
        <>
          <AppButton disabled={isDeleting} onClick={onCancel} type="button" variant="secondary">
            Annuler
          </AppButton>
          <AppButton disabled={isDeleting} onClick={onConfirm} type="button" variant="dangerSoft">
            {isDeleting ? <TraceabilityLoader compact label="Suppression..." /> : "Supprimer"}
          </AppButton>
        </>
      }
      mode="modal"
      onClose={onCancel}
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm();
      }}
      title={batches.length === 1 ? "Supprimer la production" : "Supprimer les productions"}
    >
      <div className="production-delete-confirmation">
        <p>
          {batches.length === 1
            ? "Cette production sera supprimee de l'historique avec son lot genere."
            : `${batches.length} productions seront supprimees de l'historique avec leurs lots generes.`}
        </p>
        <ul>
          {batches.slice(0, 6).map((batch) => (
            <li key={batch.id}>
              <strong>{batch.generatedLot}</strong>
              <span>{batch.productName}</span>
            </li>
          ))}
        </ul>
        {batches.length > 6 ? <p>{batches.length - 6} autre(s) production(s).</p> : null}
      </div>
    </AppDialogShell>
  );
}

function ProductionLotDropdown({
  draft,
  onChange,
  selectedLot,
}: {
  draft: { lots: AvailableLotOption[]; selectedLotIds: string[]; status: "loading" | "ready" | "error" };
  onChange: (lotId: string) => void;
  selectedLot: AvailableLotOption | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, []);

  const disabled = draft.status === "error" || draft.lots.length === 0;
  const label = selectedLot ? renderLotText(selectedLot.supplierLot || selectedLot.lotNumber, selectedLot.createdAt) : <span className="production-lot-placeholder">Aucun lot disponible</span>;

  return (
    <div className="production-lot-dropdown" ref={rootRef}>
      <button className="production-lot-trigger" disabled={disabled} onClick={() => setIsOpen((current) => !current)} type="button">
        {label}
        <AppIcon name="chevronDown" />
      </button>
      {isOpen && !disabled ? (
        <div className="production-lot-menu">
          {draft.lots.map((lot) => (
            <button
              aria-selected={selectedLot?.id === lot.id}
              className="production-lot-option"
              key={lot.id}
              onClick={() => {
                onChange(lot.id);
                setIsOpen(false);
              }}
              type="button"
            >
              {renderLotText(lot.supplierLot || lot.lotNumber, lot.createdAt)}
              {selectedLot?.id === lot.id ? <AppIcon name="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderLotText(lotNumber: string, dateValue: string) {
  return (
    <span className="production-lot-label">
      <strong>{lotNumber}</strong>
      <span>| {formatDateTime(dateValue)}</span>
    </span>
  );
}

function ReceptionBatchLinesTable({ lines, status }: { lines: ReceptionBatchLine[]; status: "idle" | "loading" | "error" }) {
  return (
    <div className="table-wrap reception-detail-table">
      <table>
        <thead>
          <tr>
            <th>Produit</th>
            <th>Lot interne</th>
            <th>Lot fournisseur</th>
            <th>Quantite</th>
            <th>Peremption</th>
            <th>Temp.</th>
            <th>Qualite</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {status === "loading" ? (
            <TableEmpty colSpan={8}>
              <TraceabilityLoader label="Chargement des lignes..." />
            </TableEmpty>
          ) : null}
          {status === "error" ? (
            <TableEmpty colSpan={8}>Impossible de charger les lignes.</TableEmpty>
          ) : null}
          {status === "idle" && lines.length === 0 ? (
            <TableEmpty colSpan={8}>Aucune ligne pour cette reception.</TableEmpty>
          ) : null}
          {lines.map((line) => (
            <tr className={cx(line.status === "non_conforme" && "nonconform-row")} key={line.id}>
              <td>
                <strong>{line.productName}</strong>
                <span className="muted-cell">{line.productCode}</span>
              </td>
              <td>{line.internalLot}</td>
              <td>{line.supplierLot}</td>
              <td>{`${line.quantity.toLocaleString("fr-FR")} ${line.unit}`}</td>
              <td>{line.expiryDate ? formatDate(line.expiryDate) : "--"}</td>
              <td>{line.transportTemperatureC === null ? "--" : `${line.transportTemperatureC} C`}</td>
              <td>{`${formatReceptionStatus(line.temperatureStatus)} / ${formatReceptionStatus(line.hygieneStatus)}`}</td>
              <td>
                <ReceptionStatusBadge status={line.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function focusReceptionField(field: HTMLElement) {
  const target = field.matches("input, button, select, textarea")
    ? field
    : field.querySelector<HTMLElement>("input:not([type='checkbox']):not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)");

  target?.focus();
  if (target instanceof HTMLInputElement && target.type !== "checkbox") {
    target.select();
  }
}

function ReceptionEntryLinesTable({
  focusLineId,
  lines,
  onUpdate,
  onRemove,
}: {
  focusLineId: string;
  lines: ReceptionDraftLine[];
  onUpdate: (localId: string, patch: Partial<ReceptionDraftLine>) => void;
  onRemove: (localId: string) => void;
}) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const visibleLineIds = useMemo(() => lines.map((line) => line.localId), [lines]);
  const selectedVisibleCount = visibleLineIds.filter((id) => selectedLineIds.includes(id)).length;
  const allVisibleSelected = visibleLineIds.length > 0 && selectedVisibleCount === visibleLineIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (!focusLineId) return;
    const fields = Array.from(tableRef.current?.querySelectorAll<HTMLElement>("[data-reception-nav-field='quantity']") ?? []);
    const targetField = fields.find((field) => field.dataset.lineId === focusLineId);
    if (!targetField) return;
    window.requestAnimationFrame(() => {
      focusReceptionField(targetField);
    });
  }, [focusLineId, lines.length]);

  function toggleAllVisibleLines(checked: boolean) {
    setSelectedLineIds((current) => {
      const visibleIds = new Set(visibleLineIds);
      if (!checked) return current.filter((id) => !visibleIds.has(id));
      return [...new Set([...current, ...visibleLineIds])];
    });
  }

  function toggleLineSelection(lineId: string, checked: boolean) {
    setSelectedLineIds((current) => {
      if (!checked) return current.filter((id) => id !== lineId);
      return current.includes(lineId) ? current : [...current, lineId];
    });
  }

  function removeSelectedLines() {
    if (selectedLineIds.length === 0) return;
    selectedLineIds.forEach(onRemove);
    setSelectedLineIds([]);
  }

  function focusNextReceptionField(target: EventTarget | null) {
    if (!(target instanceof Element) || !tableRef.current) return false;
    const currentField = target.closest<HTMLElement>("[data-reception-nav-field]");
    if (!currentField) return false;
    const fields = Array.from(tableRef.current.querySelectorAll<HTMLElement>("[data-reception-nav-field]"));
    const nextField = fields[fields.indexOf(currentField) + 1];
    if (!nextField) return false;
    focusReceptionField(nextField);
    return true;
  }

  function handleTableKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.getAttribute("role") === "combobox" && target.getAttribute("aria-expanded") === "true") return;
      event.preventDefault();
      focusNextReceptionField(target);
      return;
    }

    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLInputElement && target.type !== "checkbox") return;
    event.preventDefault();
    removeSelectedLines();
  }

  return (
    <div className="table-wrap reception-entry-table" onKeyDown={handleTableKeyDown} ref={tableRef} tabIndex={0}>
	      <table className="data-table reception-data-table">
	        <thead>
	          <tr>
	            <th className="select-column">
	              <label className="table-checkbox">
	                <input
	                  aria-label="Selectionner tous les articles visibles"
	                  checked={allVisibleSelected}
	                  ref={(input) => {
	                    if (input) input.indeterminate = someVisibleSelected;
	                  }}
	                  onChange={(event) => toggleAllVisibleLines(event.target.checked)}
	                  type="checkbox"
	                />
	                <span></span>
	              </label>
	            </th>
	            <th>Produit</th>
	            <th>Qte</th>
	            <th>Unite</th>
	            <th>Lot fournisseur</th>
	            <th>Date de Peremption</th>
	          </tr>
	        </thead>
	        <tbody>
	          {lines.length === 0 ? (
	            <TableEmpty colSpan={6}>Ajoutez des articles depuis le catalogue fournisseur.</TableEmpty>
	          ) : null}
	          {lines.map((line) => (
	            <tr className={cx(selectedLineIds.includes(line.localId) && "selected-row")} key={line.localId}>
	              <td className="select-column">
	                <label className="table-checkbox">
	                  <input
	                    aria-label={`Selectionner ${line.productName}`}
	                    checked={selectedLineIds.includes(line.localId)}
	                    onChange={(event) => toggleLineSelection(line.localId, event.target.checked)}
	                    type="checkbox"
	                  />
	                  <span></span>
	                </label>
	              </td>
	              <td>
	                <strong>{line.productName}</strong>
              </td>
              <td>
                <input
                  data-line-id={line.localId}
                  data-reception-nav-field="quantity"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => onUpdate(line.localId, { quantity: event.target.value })}
                  step="0.001"
                  type="number"
                  value={line.quantity}
                />
	              </td>
	              <td>
	                <div data-line-id={line.localId} data-reception-nav-field="unit">
	                  <AppCombobox openOnFocus={false} options={unitOptions} onChange={(unit) => onUpdate(line.localId, { unit })} value={line.unit} />
	                </div>
	              </td>
	              <td>
	                <input
	                  data-line-id={line.localId}
	                  data-reception-nav-field="supplierLot"
	                  value={line.supplierLot}
	                  onChange={(event) => onUpdate(line.localId, { supplierLot: event.target.value })}
	                />
              </td>
	              <td>
	                <div data-line-id={line.localId} data-reception-nav-field="expiryDate">
	                  <AppDatePicker allowClear value={line.expiryDate} onChange={(expiryDate) => onUpdate(line.localId, { expiryDate })} />
	                </div>
	              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function validateReceptionDraft(supplierId: string, lines: ReceptionDraftLine[]) {
  if (!supplierId) return "Selectionnez un fournisseur.";
  if (lines.length === 0) return "Ajoutez au moins un article.";

  for (const line of lines) {
    if (!line.productId) return "Chaque ligne doit avoir un produit.";
    if (!line.quantity || Number(line.quantity) <= 0) return `Quantite invalide pour ${line.productName}.`;
    if (!line.unit) return `Unite manquante pour ${line.productName}.`;
    if (!line.supplierLot.trim()) return `Lot fournisseur manquant pour ${line.productName}.`;
  }

  return "";
}

function FabricationList({
  columnFilters,
  products,
  onColumnFiltersChange,
  onCreate,
  onSelect,
  onProductSaved,
}: {
  columnFilters: ProductColumnFilter[];
  products: Product[];
  onColumnFiltersChange: (filters: ProductColumnFilter[]) => void;
  onCreate: () => void;
  onSelect: (product: Product) => void;
  onProductSaved: () => Promise<void>;
}) {
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const componentFilterSuggestions = useMemo(() => {
    return [...new Set(products.flatMap((product) => product.componentNames))].sort((left, right) => left.localeCompare(right, "fr"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      return matchesProductColumnFilters(product, columnFilters);
    });
  }, [columnFilters, products]);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Fabrication</h1>
          <p>Catalogue produits et schemas de fabrication.</p>
        </div>
        <div className="page-actions">
          <AppButton onClick={() => setShowProductForm((current) => !current)} type="button" variant="secondary">
            Creer produit
          </AppButton>
          <AppButton onClick={onCreate} type="button">
            Creer schema
          </AppButton>
        </div>
      </header>

      {showProductForm ? (
        <ProductCreationPanel
          onCancel={() => setShowProductForm(false)}
          onSaved={async () => {
            await onProductSaved();
            setShowProductForm(false);
          }}
        />
      ) : null}

      <ProductTable
        columnFilters={columnFilters}
        componentFilterSuggestions={componentFilterSuggestions}
        filteredProducts={filteredProducts}
        selectedProductId=""
        onColumnFiltersChange={onColumnFiltersChange}
        onEdit={setEditingProduct}
        onSelect={onSelect}
      />

      {editingProduct ? (
        <ProductEditDialog
          product={editingProduct}
          onCancel={() => setEditingProduct(null)}
          onSaved={async () => {
            await onProductSaved();
            setEditingProduct(null);
          }}
        />
      ) : null}
    </main>
  );
}

function ProductEditDialog({ product, onCancel, onSaved }: { product: Product; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(product.name);
  const [type, setType] = useState<ProductType>(product.type);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveStatus("saving");
    setMessage("");

    try {
      await updateProductCatalogItem(product.id, { name, type, unit: product.unit });
      await onSaved();
    } catch (error) {
      console.error("Product update failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible de modifier le produit."));
    }
  }

  return (
    <AppDialogShell
      footer={
        <>
          <AppButton onClick={onCancel} type="button" variant="secondary">
            Annuler
          </AppButton>
          <AppButton disabled={saveStatus === "saving"} type="submit">
            {saveStatus === "saving" ? <TraceabilityLoader compact label="Enregistrement..." /> : "Enregistrer"}
          </AppButton>
        </>
      }
      onClose={onCancel}
      onSubmit={handleSubmit}
      title="Modifier produit"
    >
      <div className="product-create-grid">
        <Field label="Nom du produit">
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Type">
          <AppCombobox options={productTypeEditOptions} onChange={setType} value={type} />
        </Field>
      </div>
      {message ? <p className="save-message error">{message}</p> : null}
    </AppDialogShell>
  );
}

function ProductCreationPanel({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Exclude<ProductType, "raw">>("finished");
  const [lotNumber, setLotNumber] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveStatus("saving");
    setMessage("");

    const input: ProductCatalogInput = {
      name,
      type,
      lotNumber,
    };

    try {
      await createProductCatalogItem(input);
      await onSaved();
    } catch (error) {
      console.error("Product creation failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible de creer le produit."));
    }
  }

  return (
    <AppCardForm autoComplete="off" className="product-create-panel" onSubmit={handleSubmit}>
      <div className="panel-title no-border">
        <span className="panel-icon">NP</span>
        <div>
          <h2>Nouveau produit</h2>
          <p>Ajouter un semi-fini ou un produit fini.</p>
        </div>
      </div>
      <div className="product-create-grid">
        <Field label="Nom du produit">
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Type">
          <AppCombobox options={manufacturedProductTypeOptions} onChange={setType} value={type} />
        </Field>
        <Field label="Lot">
          <input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
        </Field>
      </div>
      {message ? <p className="save-message error">{message}</p> : null}
      <div className="product-create-actions">
        <AppButton onClick={onCancel} type="button" variant="secondary">
          Annuler
        </AppButton>
        <AppButton disabled={saveStatus === "saving"} type="submit">
          {saveStatus === "saving" ? <TraceabilityLoader compact label="Creation..." /> : "Enregistrer produit"}
        </AppButton>
      </div>
    </AppCardForm>
  );
}

function FabricationSchemaWorkspace({
  initialProduct,
  products,
  onBack,
  onSchemaSaved,
}: {
  initialProduct: Product | null;
  products: Product[];
  onBack: () => void;
  onSchemaSaved: () => Promise<void>;
}) {
  const schemaTargets = useMemo(() => products.filter((product) => product.type !== "raw"), [products]);
  const componentCatalog = useMemo(() => products.filter((product) => product.type === "raw" || product.type === "semi_finished"), [products]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const initialTarget = initialProduct?.type === "raw" ? null : initialProduct;
  const [targetSearch, setTargetSearch] = useState(initialTarget?.name ?? "");
  const [targetProduct, setTargetProduct] = useState<Product | null>(initialTarget);
  const [componentSearch, setComponentSearch] = useState("");
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [nestedComponentsByProductId, setNestedComponentsByProductId] = useState<Record<string, ProductSchemaNode[]>>({});
  const [stockByProductId, setStockByProductId] = useState<Record<string, LotStockPreview>>({});
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [canvasPositions, setCanvasPositions] = useState<Record<string, CanvasPosition>>({});
  const [selectedProductId, setSelectedProductId] = useState(initialTarget?.id ?? "");
  const [schemaStatus, setSchemaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const directComponents = useMemo(() => componentIds.map((id) => productById.get(id)).filter(Boolean) as Product[], [componentIds, productById]);
  const graphNodes = useMemo<ProductSchemaNode[]>(
    () =>
      directComponents.map((product) => ({
        ...product,
        stock: stockByProductId[product.id] ?? null,
        children: nestedComponentsByProductId[product.id] ?? [],
      })),
    [directComponents, nestedComponentsByProductId, stockByProductId],
  );

  const selectedProduct = selectedProductId === targetProduct?.id ? targetProduct : productById.get(selectedProductId) ?? null;
  const selectedStock = selectedProduct ? stockByProductId[selectedProduct.id] ?? null : null;
  const selectedIsDirectComponent = Boolean(selectedProduct && componentIds.includes(selectedProduct.id));
  const canSaveSchema = Boolean(targetProduct && componentIds.length > 0 && saveStatus !== "saving");

  useEffect(() => {
    let isCancelled = false;

    async function loadStockPreview() {
      try {
        const nextStock = await fetchLotStockPreview(products.map((product) => product.id));
        if (!isCancelled) setStockByProductId(nextStock);
      } catch (error) {
        console.error("Lot stock preview load failed", error);
      }
    }

    void loadStockPreview();

    return () => {
      isCancelled = true;
    };
  }, [products]);

  useEffect(() => {
    if (!targetProduct) {
      setComponentIds([]);
      setNestedComponentsByProductId({});
      setExpandedNodeIds(new Set());
      setCanvasPositions({});
      setSelectedProductId("");
      setSchemaStatus("idle");
      return;
    }

    setSelectedProductId(targetProduct.id);
    setCanvasPositions(buildDefaultCanvasPositions(targetProduct, [], new Set()));
    void loadTargetSchema(targetProduct);
  }, [targetProduct?.id]);

  useEffect(() => {
    if (!targetProduct) return;

    setCanvasPositions((current) => {
      const defaults = buildDefaultCanvasPositions(targetProduct, graphNodes, expandedNodeIds);
      const next: Record<string, CanvasPosition> = {};

      for (const [productId, position] of Object.entries(defaults)) {
        next[productId] = current[productId] ?? position;
      }

      return next;
    });
  }, [expandedNodeIds, graphNodes, targetProduct]);

  async function loadTargetSchema(product: Product) {
    setSchemaStatus("loading");
    try {
      const schema = await fetchProductSchema(product.id);
      setComponentIds(schema.map((node) => node.id));
      setNestedComponentsByProductId(Object.fromEntries(schema.map((node) => [node.id, node.children])));
      setExpandedNodeIds(new Set(schema.filter((node) => node.children.length > 0).map((node) => node.id)));
      setSchemaStatus("ready");
    } catch (error) {
      console.error("Product schema load failed", error);
      setSchemaStatus("error");
    }
  }

  async function loadNestedComponents(product: Product) {
    if (product.type !== "semi_finished" || product.recipeStatus !== "active") return;

    try {
      const children = await fetchProductSchema(product.id);
      setNestedComponentsByProductId((current) => ({ ...current, [product.id]: children }));
      if (children.length > 0) {
        setExpandedNodeIds((current) => new Set(current).add(product.id));
      }
    } catch (error) {
      console.error("Nested schema load failed", error);
    }
  }

  function handleTargetSelect(product: Product) {
    if (product.type === "raw") return;
    setTargetProduct(product);
    setTargetSearch(product.name);
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function handleAddComponent(product: Product) {
    if (!targetProduct || product.type === "finished" || product.id === targetProduct.id || componentIds.includes(product.id)) return;

    setComponentIds((current) => [...current, product.id]);
    setSelectedProductId(product.id);
    setSaveStatus("idle");
    setSaveMessage("");
    void loadNestedComponents(product);
  }

  function handleRemoveComponent(productId: string) {
    setComponentIds((current) => current.filter((id) => id !== productId));
    setSelectedProductId(targetProduct?.id ?? "");
    setSaveStatus("idle");
    setSaveMessage("");
  }

  function handleToggleNode(productId: string) {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function handleMoveNode(productId: string, position: CanvasPosition) {
    setCanvasPositions((current) => ({ ...current, [productId]: position }));
  }

  function handleResetCanvas() {
    if (!targetProduct) return;
    setCanvasPositions(buildDefaultCanvasPositions(targetProduct, graphNodes, expandedNodeIds));
  }

  function handleOpenSchema(product: Product) {
    if (product.type === "raw") return;
    setTargetProduct(product);
    setTargetSearch(product.name);
    setComponentSearch("");
  }

  async function handleSaveSchema() {
    if (!targetProduct || componentIds.length === 0) return;

    setSaveStatus("saving");
    setSaveMessage("");

    try {
      await saveProductSchema(targetProduct.id, componentIds);
      await onSchemaSaved();
      await loadTargetSchema(targetProduct);
      setSaveStatus("success");
      setSaveMessage("Schema enregistre.");
    } catch (error) {
      console.error("Schema save failed", error);
      setSaveStatus("error");
      setSaveMessage(error instanceof Error ? error.message : "Impossible d'enregistrer le schema.");
    }
  }

  return (
    <main className="page schema-page">
      <header className="page-header">
        <div>
          <h1>Createur de schema</h1>
          <p>Relations entre produits finis, semi-finis et matieres premieres.</p>
        </div>
        <div className="page-actions">
          <AppButton onClick={onBack} type="button" variant="secondary">
            Retour
          </AppButton>
          <AppButton disabled={!canSaveSchema} onClick={handleSaveSchema} type="button">
            {saveStatus === "saving" ? <TraceabilityLoader compact label="Enregistrement..." /> : "Enregistrer schema"}
          </AppButton>
        </div>
      </header>

      {saveMessage ? <p className={cx("save-message form-level-message", saveStatus === "error" ? "error" : "success")}>{saveMessage}</p> : null}

      <AppCard className="target-panel">
        <div className="panel-title">
          <span className="panel-icon">PF</span>
          <div>
            <h2>Produit cible</h2>
            <p>{targetProduct ? `${targetProduct.code} - ${targetProduct.name}` : "Aucun produit selectionne"}</p>
          </div>
        </div>
        <ProductSearchSelector
          products={schemaTargets}
          query={targetSearch}
          selectedProduct={targetProduct}
          onQueryChange={setTargetSearch}
          onSelect={handleTargetSelect}
        />
      </AppCard>

      <div className="schema-layout">
        <ComponentCatalog
          componentIds={componentIds}
          products={componentCatalog}
          query={componentSearch}
          stockByProductId={stockByProductId}
          targetProduct={targetProduct}
          onAdd={handleAddComponent}
          onQueryChange={setComponentSearch}
        />

        <FreeCanvasGraph
          canvasPositions={canvasPositions}
          expandedNodeIds={expandedNodeIds}
          nodes={graphNodes}
          schemaStatus={schemaStatus}
          selectedProductId={selectedProductId}
          stockByProductId={stockByProductId}
          targetProduct={targetProduct}
          onRemove={handleRemoveComponent}
          onMoveNode={handleMoveNode}
          onResetLayout={handleResetCanvas}
          onSelect={setSelectedProductId}
          onToggle={handleToggleNode}
        />

        <SelectedProductPanel
          isDirectComponent={selectedIsDirectComponent}
          product={selectedProduct}
          stock={selectedStock}
          targetProduct={targetProduct}
          onOpenSchema={handleOpenSchema}
          onRemove={handleRemoveComponent}
        />
      </div>
    </main>
  );
}

function ProductSearchSelector({
  products,
  query,
  selectedProduct,
  onQueryChange,
  onSelect,
}: {
  products: Product[];
  query: string;
  selectedProduct: Product | null;
  onQueryChange: (query: string) => void;
  onSelect: (product: Product) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const results = normalizedQuery
    ? products
        .filter((product) => product.name.toLowerCase().includes(normalizedQuery) || product.code.toLowerCase().includes(normalizedQuery))
        .slice(0, 8)
    : [];

  return (
    <div className="target-selector">
      <input autoComplete="off" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      <div className="target-selected-card">
        {selectedProduct ? (
          <>
            <strong>{selectedProduct.name}</strong>
            <span>{selectedProduct.code}</span>
            <ProductTypeBadge type={selectedProduct.type} />
          </>
        ) : (
          <span>Aucune cible</span>
        )}
      </div>
      {results.length > 0 ? (
        <div className="search-results">
          {results.map((product) => (
            <button key={product.id} onClick={() => onSelect(product)} type="button">
              <strong>{product.name}</strong>
              <span>{product.code}</span>
              <span>{formatCategory(product.category)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ComponentCatalog({
  products,
  query,
  componentIds,
  targetProduct,
  stockByProductId,
  onQueryChange,
  onAdd,
}: {
  products: Product[];
  query: string;
  componentIds: string[];
  targetProduct: Product | null;
  stockByProductId: Record<string, LotStockPreview>;
  onQueryChange: (query: string) => void;
  onAdd: (product: Product) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    if (!normalizedQuery) return true;
    return product.name.toLowerCase().includes(normalizedQuery) || product.code.toLowerCase().includes(normalizedQuery);
  });

  function actionLabel(product: Product) {
    if (!targetProduct) return "Cible requise";
    if (product.id === targetProduct.id) return "Cible";
    if (componentIds.includes(product.id)) return "Ajoute";
    return "Ajouter";
  }

  function isDisabled(product: Product) {
    return !targetProduct || product.id === targetProduct.id || componentIds.includes(product.id);
  }

  return (
    <AppCardAside className="schema-side-panel">
      <div className="panel-title">
        <span className="panel-icon">IN</span>
        <div>
          <h2>Composants</h2>
          <p>Matieres premieres et semi-finis</p>
        </div>
      </div>
      <div className="catalog-search">
        <input autoComplete="off" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      </div>
      <div className="component-list">
        {filteredProducts.map((product) => {
          const stock = stockByProductId[product.id];
          return (
            <div className="component-list-item" key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <span>{product.code}</span>
                <div className="component-meta">
                  <ProductTypeBadge type={product.type} />
                  <span>{formatStockPreview(stock)}</span>
                </div>
              </div>
              <AppButton compact disabled={isDisabled(product)} onClick={() => onAdd(product)} type="button" variant="secondary">
                {actionLabel(product)}
              </AppButton>
            </div>
          );
        })}
        {filteredProducts.length === 0 ? <EmptyState>Aucun composant trouve.</EmptyState> : null}
      </div>
    </AppCardAside>
  );
}

type FreeCanvasNode = {
  canvasId: string;
  parentCanvasId: string | null;
  product: Product | ProductSchemaNode;
  stock: LotStockPreview | null;
  isTarget: boolean;
  isNested: boolean;
  canRemove: boolean;
  canExpand: boolean;
  expanded: boolean;
};

function FreeCanvasGraph({
  targetProduct,
  nodes,
  selectedProductId,
  expandedNodeIds,
  schemaStatus,
  stockByProductId,
  canvasPositions,
  onSelect,
  onRemove,
  onToggle,
  onMoveNode,
  onResetLayout,
}: {
  targetProduct: Product | null;
  nodes: ProductSchemaNode[];
  selectedProductId: string;
  expandedNodeIds: Set<string>;
  schemaStatus: "idle" | "loading" | "ready" | "error";
  stockByProductId: Record<string, LotStockPreview>;
  canvasPositions: Record<string, CanvasPosition>;
  onSelect: (productId: string) => void;
  onRemove: (productId: string) => void;
  onToggle: (productId: string) => void;
  onMoveNode: (productId: string, position: CanvasPosition) => void;
  onResetLayout: () => void;
}) {
  const canvasNodes = useMemo(
    () => (targetProduct ? buildFreeCanvasNodes(targetProduct, nodes, expandedNodeIds, stockByProductId) : []),
    [expandedNodeIds, nodes, stockByProductId, targetProduct],
  );
  const nodeIds = new Set(canvasNodes.map((node) => node.canvasId));
  const connectors = canvasNodes.filter((node) => node.parentCanvasId && nodeIds.has(node.parentCanvasId));
  const surfaceWidth = Math.max(canvasWidth, ...canvasNodes.map((node) => (canvasPositions[node.canvasId]?.x ?? 0) + canvasCardWidth + 80));
  const surfaceHeight = Math.max(canvasHeight, ...canvasNodes.map((node) => (canvasPositions[node.canvasId]?.y ?? 0) + canvasCardHeight + 80));

  return (
    <AppCard className="schema-graph-panel">
      <div className="panel-title canvas-title">
        <span className="panel-icon">SC</span>
        <div>
          <h2>Canvas schema</h2>
          <p>{schemaStatus === "loading" ? <TraceabilityLoader compact label="Chargement..." /> : `${nodes.length} composant(s)`}</p>
        </div>
        <AppButton compact disabled={!targetProduct} onClick={onResetLayout} type="button" variant="secondary">
          Recentrer
        </AppButton>
      </div>

      <div className="free-canvas-viewport">
        {targetProduct ? (
          <div className="free-canvas-surface" style={{ height: surfaceHeight, width: surfaceWidth }}>
            <svg className="canvas-links" height={surfaceHeight} width={surfaceWidth}>
              {connectors.map((node) => {
                const parentPosition = node.parentCanvasId ? canvasPositions[node.parentCanvasId] : null;
                const childPosition = canvasPositions[node.canvasId];

                if (!parentPosition || !childPosition) return null;

                return <path d={makeConnectorPath(parentPosition, childPosition)} key={`${node.parentCanvasId}-${node.canvasId}`} />;
              })}
            </svg>

            {canvasNodes.map((node) => (
              <FreeCanvasCard
                isSelected={selectedProductId === node.product.id}
                key={node.canvasId}
                node={node}
                position={canvasPositions[node.canvasId] ?? { x: 40, y: 40 }}
                onMove={onMoveNode}
                onRemove={onRemove}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}

            {nodes.length === 0 ? <EmptyState className="canvas-empty">Ajoutez des composants depuis la colonne gauche.</EmptyState> : null}
          </div>
        ) : (
          <EmptyState large>Selectionnez un produit cible.</EmptyState>
        )}
      </div>
    </AppCard>
  );
}

function FreeCanvasCard({
  node,
  position,
  isSelected,
  onSelect,
  onMove,
  onRemove,
  onToggle,
}: {
  node: FreeCanvasNode;
  position: CanvasPosition;
  isSelected: boolean;
  onSelect: (productId: string) => void;
  onMove: (canvasId: string, position: CanvasPosition) => void;
  onRemove: (productId: string) => void;
  onToggle: (productId: string) => void;
}) {
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; initialPosition: CanvasPosition } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;

    onSelect(node.product.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialPosition: position,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const currentDrag = dragState.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;

    onMove(
      node.canvasId,
      clampCanvasPosition({
        x: currentDrag.initialPosition.x + event.clientX - currentDrag.startX,
        y: currentDrag.initialPosition.y + event.clientY - currentDrag.startY,
      }),
    );
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
    }
  }

  return (
    <div
      className={cx("schema-node-card free-canvas-card", node.isTarget && "target", node.isNested && "nested", isSelected && "selected")}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div className="schema-node-header">
        <span>{node.product.code}</span>
        {node.canExpand ? (
          <button
            aria-label={node.expanded ? "Reduire" : "Developper"}
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
      onToggle(node.product.id);
            }}
            type="button"
          >
            {node.expanded ? "-" : "+"}
          </button>
        ) : null}
      </div>
      <strong>{node.product.name}</strong>
      <div className="schema-node-meta">
        <ProductTypeBadge type={node.product.type} />
        <span>{formatCategory(node.product.category)}</span>
      </div>
      <small>{formatStockPreview(node.stock)}</small>
      {node.canRemove ? (
        <button
          className="node-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(node.product.id);
          }}
          type="button"
        >
          Retirer
        </button>
      ) : null}
    </div>
  );
}

function buildFreeCanvasNodes(
  targetProduct: Product,
  nodes: ProductSchemaNode[],
  expandedNodeIds: Set<string>,
  stockByProductId: Record<string, LotStockPreview>,
) {
  const canvasNodes: FreeCanvasNode[] = [
    {
      canvasId: targetProduct.id,
      parentCanvasId: null,
      product: targetProduct,
      stock: stockByProductId[targetProduct.id] ?? null,
      isTarget: true,
      isNested: false,
      canRemove: false,
      canExpand: false,
      expanded: false,
    },
  ];

  function appendChildren(children: ProductSchemaNode[], parentCanvasId: string, isNested: boolean) {
    for (const child of children) {
      const canvasId = isNested ? `${parentCanvasId}/${child.id}` : child.id;
      const isExpanded = expandedNodeIds.has(child.id);

      canvasNodes.push({
        canvasId,
        parentCanvasId,
        product: child,
        stock: child.stock,
        isTarget: false,
        isNested,
        canRemove: !isNested,
        canExpand: child.children.length > 0,
        expanded: isExpanded,
      });

      if (child.children.length > 0 && isExpanded) {
        appendChildren(child.children, canvasId, true);
      }
    }
  }

  appendChildren(nodes, targetProduct.id, false);
  return canvasNodes;
}

function buildDefaultCanvasPositions(targetProduct: Product, nodes: ProductSchemaNode[], expandedNodeIds: Set<string>) {
  const positions: Record<string, CanvasPosition> = {
    [targetProduct.id]: {
      x: Math.round((canvasWidth - canvasCardWidth) / 2),
      y: 70,
    },
  };

  const columns = 5;
  const startX = 140;
  const startY = 310;
  const columnGap = 330;
  const rowGap = 260;

  nodes.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const position = {
      x: startX + column * columnGap,
      y: startY + row * rowGap,
    };

    positions[node.id] = position;
    appendNestedCanvasPositions(node, node.id, position, positions, expandedNodeIds);
  });

  return positions;
}

function appendNestedCanvasPositions(
  node: ProductSchemaNode,
  parentCanvasId: string,
  parentPosition: CanvasPosition,
  positions: Record<string, CanvasPosition>,
  expandedNodeIds: Set<string>,
) {
  if (!expandedNodeIds.has(node.id)) return;

  node.children.forEach((child, index) => {
    const canvasId = `${parentCanvasId}/${child.id}`;
    const offset = (index - (node.children.length - 1) / 2) * 280;
    const position = {
      x: Math.max(40, parentPosition.x + offset),
      y: parentPosition.y + 230,
    };

    positions[canvasId] = position;
    appendNestedCanvasPositions(child, canvasId, position, positions, expandedNodeIds);
  });
}

function makeConnectorPath(parentPosition: CanvasPosition, childPosition: CanvasPosition) {
  const startX = parentPosition.x + canvasCardWidth / 2;
  const startY = parentPosition.y + canvasCardHeight / 2;
  const endX = childPosition.x + canvasCardWidth / 2;
  const endY = childPosition.y + canvasCardHeight / 2;
  const controlDistance = Math.max(90, Math.abs(endY - startY) / 2);

  return `M ${startX} ${startY} C ${startX} ${startY + controlDistance}, ${endX} ${endY - controlDistance}, ${endX} ${endY}`;
}

function clampCanvasPosition(position: CanvasPosition) {
  return {
    x: Math.min(Math.max(position.x, 20), canvasWidth - canvasCardWidth - 20),
    y: Math.min(Math.max(position.y, 20), canvasHeight - canvasCardHeight - 20),
  };
}

function SelectedProductPanel({
  product,
  targetProduct,
  stock,
  isDirectComponent,
  onRemove,
  onOpenSchema,
}: {
  product: Product | null;
  targetProduct: Product | null;
  stock: LotStockPreview | null;
  isDirectComponent: boolean;
  onRemove: (productId: string) => void;
  onOpenSchema: (product: Product) => void;
}) {
  return (
    <AppCardAside className="schema-side-panel">
      <div className="panel-title">
        <span className="panel-icon">DT</span>
        <div>
          <h2>Details</h2>
          <p>{product ? product.code : "Aucune selection"}</p>
        </div>
      </div>
      {product ? (
        <div className="selected-detail-body">
          <div className="selected-product-title">
            <strong>{product.name}</strong>
            <ProductTypeBadge type={product.type} />
          </div>
          <div className="detail-list">
            <div>
              <span>Categorie</span>
              <strong>{formatCategory(product.category)}</strong>
            </div>
            <div>
              <span>Unite</span>
              <strong>{product.unit}</strong>
            </div>
            <div>
              <span>Schema</span>
              <strong>{recipeLabels[product.recipeStatus]}</strong>
            </div>
            <div>
              <span>Lots disponibles</span>
              <strong>{formatStockPreview(stock)}</strong>
            </div>
          </div>
          <div className="selected-actions">
            {isDirectComponent ? (
              <AppButton onClick={() => onRemove(product.id)} type="button" variant="secondary">
                Retirer du schema
              </AppButton>
            ) : null}
            {product.type === "semi_finished" && product.id !== targetProduct?.id ? (
              <AppButton onClick={() => onOpenSchema(product)} type="button">
                Ouvrir schema
              </AppButton>
            ) : null}
          </div>
        </div>
      ) : (
        <EmptyState>Aucune carte selectionnee.</EmptyState>
      )}
    </AppCardAside>
  );
}

function ProductTable({
  columnFilters,
  componentFilterSuggestions,
  filteredProducts,
  selectedProductId,
  onColumnFiltersChange,
  onEdit,
  onSelect,
}: {
  columnFilters: ProductColumnFilter[];
  componentFilterSuggestions: string[];
  filteredProducts: Product[];
  selectedProductId: string;
  onColumnFiltersChange: (filters: ProductColumnFilter[]) => void;
  onEdit: (product: Product) => void;
  onSelect: (product: Product) => void;
}) {
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const visibleProductIds = useMemo(() => filteredProducts.map((product) => product.id), [filteredProducts]);
  const selectedVisibleCount = visibleProductIds.filter((id) => selectedProductIds.includes(id)).length;
  const allVisibleSelected = visibleProductIds.length > 0 && selectedVisibleCount === visibleProductIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  function toggleAllVisibleProducts(checked: boolean) {
    setSelectedProductIds((current) => {
      const visibleIds = new Set(visibleProductIds);
      if (!checked) return current.filter((id) => !visibleIds.has(id));
      return [...new Set([...current, ...visibleProductIds])];
    });
  }

  function toggleProductSelection(productId: string, checked: boolean) {
    setSelectedProductIds((current) => {
      if (!checked) return current.filter((id) => id !== productId);
      return current.includes(productId) ? current : [...current, productId];
    });
  }

  return (
    <AppCard className="product-table-panel">
      <div className="table-toolbar">
        <div className="panel-title no-border">
          <span className="panel-icon">PR</span>
          <div>
            <h2>Table des produits</h2>
            <p>Produits lus depuis Supabase.</p>
          </div>
        </div>
      </div>

      <div className="product-search-row">
        <ProductColumnFilterBar componentSuggestions={componentFilterSuggestions} filters={columnFilters} onFiltersChange={onColumnFiltersChange} />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="utility-column"></th>
              <th className="select-column">
                <label className="table-checkbox">
                  <input
                    aria-label="Selectionner tous les produits visibles"
                    checked={allVisibleSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someVisibleSelected;
                    }}
                    onChange={(event) => toggleAllVisibleProducts(event.target.checked)}
                    type="checkbox"
                  />
                  <span></span>
                </label>
              </th>
              <th>Produit</th>
              <th>Type</th>
              <th>Categorie</th>
              <th>Recette / nomenclature</th>
              <th>Composants</th>
              <th>Derniere modification</th>
              <th>Action</th>
              <th className="actions-column"></th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <TableEmpty colSpan={10}>Aucun produit trouve dans Supabase.</TableEmpty>
            ) : null}
            {filteredProducts.map((product) => (
              <tr className={cx(product.id === selectedProductId && "selected-row")} key={product.id}>
                <td className="utility-column">
                  <button className="table-icon-button muted" title="Reordonner" type="button">
                    <AppIcon name="grip" />
                  </button>
                </td>
                <td className="select-column">
                  <label className="table-checkbox">
                    <input
                      aria-label={`Selectionner ${product.name}`}
                      checked={selectedProductIds.includes(product.id)}
                      onChange={(event) => toggleProductSelection(product.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span></span>
                  </label>
                </td>
                <td>{product.name}</td>
                <td>
                  <ProductTypeBadge type={product.type} />
                </td>
                <td>{formatCategory(product.category)}</td>
                <td>
                  <RecipeBadge status={product.recipeStatus} />
                </td>
                <td>{product.componentCount || "--"}</td>
                <td>{formatDate(product.lastUpdated)}</td>
                <td>
                  <button className="table-link" disabled={product.type === "raw"} onClick={() => onSelect(product)} type="button">
                    {product.type === "raw" ? "Composant" : product.recipeStatus === "active" ? "Modifier schema" : "Creer schema"}
                  </button>
                </td>
                <td className="actions-column">
                  <ProductTableActionsDropdown onEdit={() => onEdit(product)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DataTableFooter itemCount={filteredProducts.length} selectedCount={selectedVisibleCount} />
    </AppCard>
  );
}

function ProductTableActionsDropdown({ onEdit }: { onEdit: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, []);

  return (
    <div className="table-actions-dropdown" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="table-icon-button"
        onClick={() => setIsOpen((current) => !current)}
        title="Actions"
        type="button"
      >
        <AppIcon name="dots" />
      </button>
      {isOpen ? (
        <div className="table-actions-menu product-actions-menu" role="menu">
          <button
            onClick={() => {
              onEdit();
              setIsOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            Modifier
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProductColumnFilterBar({
  componentSuggestions = [],
  dateHelperColumns = ["lastUpdated"],
  filters,
  options = productColumnFilterOptions,
  onFiltersChange,
  placeholder = "Filter by produit, type...",
  valueSuggestions = productColumnValueSuggestions,
}: {
  componentSuggestions?: string[];
  dateHelperColumns?: ProductColumnFilterKey[];
  filters: ProductColumnFilter[];
  options?: ProductColumnFilterOption[];
  onFiltersChange: (filters: ProductColumnFilter[]) => void;
  placeholder?: string;
  valueSuggestions?: Partial<Record<ProductColumnFilterKey, string[]>>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingValueFocusRef = useRef<string | null>(null);
  const filterCommitTimerRef = useRef<number | null>(null);
  const draftFiltersRef = useRef(filters);
  const suppressNextValueFocusRef = useRef(false);
  const [draftFilters, setDraftFilters] = useState(filters);
  const [isOpen, setIsOpen] = useState(false);
  const [columnQuery, setColumnQuery] = useState("");
  const [activeValueHelperFilterId, setActiveValueHelperFilterId] = useState<string | null>(null);
  const normalizedColumnQuery = normalizeSearchText(columnQuery);
  const visibleOptions = normalizedColumnQuery
    ? options.filter((option) =>
        [option.label, option.description, option.key].some((value) => normalizeSearchText(value).includes(normalizedColumnQuery)),
      )
    : options;
  const activeValueHelperFilter = draftFilters.find((filter) => filter.id === activeValueHelperFilterId) ?? null;
  const normalizedValueQuery = normalizeSearchText(activeValueHelperFilter?.value ?? "");
  const visibleValueSuggestions = getProductColumnValueSuggestions(activeValueHelperFilter, componentSuggestions, normalizedValueQuery, valueSuggestions);
  const showValueSuggestions = Boolean(
    activeValueHelperFilter && !dateHelperColumns.includes(activeValueHelperFilter.column) && visibleValueSuggestions.length > 0,
  );
  const showDateHelper = Boolean(activeValueHelperFilter && dateHelperColumns.includes(activeValueHelperFilter.column));

  useEffect(() => {
    if (!isOpen && !activeValueHelperFilterId) return;

    function handlePointerDown(event: Event) {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
      setActiveValueHelperFilterId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [activeValueHelperFilterId, isOpen]);

  useEffect(() => {
    if (filterCommitTimerRef.current) return;
    draftFiltersRef.current = filters;
    setDraftFilters(filters);
  }, [filters]);

  useEffect(() => {
    return () => {
      if (filterCommitTimerRef.current) window.clearTimeout(filterCommitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingValueFocusRef.current) return;
    const input = rootRef.current?.querySelector<HTMLInputElement>(`[data-filter-value-id="${pendingValueFocusRef.current}"]`);
    pendingValueFocusRef.current = null;
    input?.focus();
  }, [draftFilters]);

  function focusFilterValue(filterId: string, placeCaretAtEnd = false) {
    window.requestAnimationFrame(() => {
      const input = rootRef.current?.querySelector<HTMLInputElement>(`[data-filter-value-id="${filterId}"]`);
      input?.focus();
      if (input && placeCaretAtEnd) {
        const caretPosition = input.value.length;
        input.setSelectionRange(caretPosition, caretPosition);
      }
    });
  }

  function closeFilterDropdowns() {
    setIsOpen(false);
    setActiveValueHelperFilterId(null);
  }

  function commitFilters(nextFilters: ProductColumnFilter[], mode: "immediate" | "debounced" = "immediate") {
    if (filterCommitTimerRef.current) {
      window.clearTimeout(filterCommitTimerRef.current);
      filterCommitTimerRef.current = null;
    }

    if (mode === "immediate") {
      onFiltersChange(nextFilters);
      return;
    }

    filterCommitTimerRef.current = window.setTimeout(() => {
      filterCommitTimerRef.current = null;
      onFiltersChange(nextFilters);
    }, 120);
  }

  function updateDraftFilters(nextFilters: ProductColumnFilter[]) {
    draftFiltersRef.current = nextFilters;
    setDraftFilters(nextFilters);
  }

  function selectColumn(nextColumn: ProductColumnFilterKey) {
    const nextFilter: ProductColumnFilter = {
      id: `${nextColumn}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      column: nextColumn,
      value: "",
    };
    const nextFilters = [...draftFiltersRef.current, nextFilter];
    pendingValueFocusRef.current = nextFilter.id;
    updateDraftFilters(nextFilters);
    commitFilters(nextFilters);
    setColumnQuery("");
    closeFilterDropdowns();
  }

  function updateFilterValue(filterId: string, value: string, mode: "immediate" | "debounced" = "debounced") {
    const nextFilters = draftFiltersRef.current.map((filter) => (filter.id === filterId ? { ...filter, value } : filter));
    updateDraftFilters(nextFilters);
    commitFilters(nextFilters, mode);
  }

  function selectValueSuggestion(filterId: string, value: string) {
    updateFilterValue(filterId, value, "immediate");
    closeFilterDropdowns();
    suppressNextValueFocusRef.current = true;
    focusFilterValue(filterId, true);
  }

  function selectFilterDate(filterId: string, value: string) {
    updateFilterValue(filterId, value, "immediate");
    closeFilterDropdowns();
    suppressNextValueFocusRef.current = true;
    focusFilterValue(filterId, true);
  }

  function removeFilter(filterId: string) {
    const nextFilters = draftFiltersRef.current.filter((filter) => filter.id !== filterId);
    updateDraftFilters(nextFilters);
    commitFilters(nextFilters);
    closeFilterDropdowns();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleFilterValueKeyDown(event: KeyboardEvent<HTMLInputElement>, filter: ProductColumnFilter) {
    if (!hasProductColumnValueHelper(filter.column, valueSuggestions, dateHelperColumns)) return;

    if (event.key === "Backspace" && shouldClearWholeFilterValue(filter, valueSuggestions, dateHelperColumns)) {
      event.preventDefault();
      updateFilterValue(filter.id, "");
      setActiveValueHelperFilterId(filter.id);
      focusFilterValue(filter.id);
      return;
    }

    if (event.key === "Escape") {
      setActiveValueHelperFilterId(null);
      return;
    }

    if (event.key === "Enter" && visibleValueSuggestions[0]) {
      event.preventDefault();
      selectValueSuggestion(filter.id, visibleValueSuggestions[0]);
    }
  }

  function handleFreeInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      setIsOpen(true);
      return;
    }

    if (event.key === "Enter" && visibleOptions[0]) {
      event.preventDefault();
      selectColumn(visibleOptions[0].key);
    }
  }

  return (
    <div className="column-filter-bar" ref={rootRef}>
      <div className={cx("column-filter-input-shell", isOpen && "open")}>
        <button className="column-filter-leading" onClick={() => inputRef.current?.focus()} type="button">
          <AppIcon name="search" />
        </button>
        <div className="column-filter-condition-list">
          {draftFilters.map((filter) => {
            const option = options.find((candidate) => candidate.key === filter.column);
            const label = option?.label ?? filter.column;

            return (
              <div className="column-filter-condition" key={filter.id}>
                <button
                  className="column-filter-condition-column"
                  onClick={() => {
                    setActiveValueHelperFilterId(null);
                    setIsOpen(true);
                  }}
                  type="button"
                >
                  {label}
                </button>
                <span className="column-filter-operator-wrap">
                  <input aria-label={`Operateur pour ${label}`} className="column-filter-operator" readOnly tabIndex={-1} value="=" />
                  <span aria-hidden="true">=</span>
                </span>
                <span className="column-filter-value-wrap">
                  <input
                    aria-label={`Valeur pour ${label}`}
                    autoComplete="off"
                    data-filter-value-id={filter.id}
                    onChange={(event) => {
                      updateFilterValue(filter.id, event.target.value);
                      setActiveValueHelperFilterId(hasProductColumnValueHelper(filter.column, valueSuggestions, dateHelperColumns) ? filter.id : null);
                    }}
                    onFocus={() => {
                      if (suppressNextValueFocusRef.current) {
                        suppressNextValueFocusRef.current = false;
                        return;
                      }
                      setIsOpen(false);
                      setActiveValueHelperFilterId(hasProductColumnValueHelper(filter.column, valueSuggestions, dateHelperColumns) ? filter.id : null);
                    }}
                    onKeyDown={(event) => handleFilterValueKeyDown(event, filter)}
                    value={filter.value}
                  />
                  <span aria-hidden="true">{filter.value || " "}</span>
                </span>
                <button aria-label={`Supprimer le filtre ${label}`} className="column-filter-remove" onClick={() => removeFilter(filter.id)} type="button">
                  <AppIcon name="x" />
                </button>
              </div>
            );
          })}
        </div>
        <input
          autoComplete="off"
          className="column-filter-free-input"
          onChange={(event) => {
            setColumnQuery(event.target.value);
            setIsOpen(true);
            setActiveValueHelperFilterId(null);
          }}
          onFocus={() => {
            setIsOpen(true);
            setActiveValueHelperFilterId(null);
          }}
          onKeyDown={handleFreeInputKeyDown}
          placeholder={draftFilters.length > 0 ? "Add more filters..." : placeholder}
          ref={inputRef}
          value={columnQuery}
        />
        {draftFilters.length > 0 ? (
          <button
            aria-label="Effacer tous les filtres"
            className="column-filter-clear"
            onClick={() => {
              updateDraftFilters([]);
              commitFilters([]);
              setColumnQuery("");
              closeFilterDropdowns();
            }}
            type="button"
          >
            <AppIcon name="x" />
          </button>
        ) : null}
      </div>
      {isOpen ? (
        <div className="column-filter-menu" role="listbox">
          {visibleOptions.map((option) => (
            <button
              aria-selected={false}
              className="column-filter-option"
              key={option.key}
              onClick={() => selectColumn(option.key)}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
            </button>
          ))}
          {visibleOptions.length === 0 ? <div className="column-filter-empty">Aucune colonne trouvee.</div> : null}
        </div>
      ) : null}
      {showValueSuggestions && activeValueHelperFilter ? (
        <div className="column-filter-helper-menu" role="listbox">
          {visibleValueSuggestions.map((name) => (
            <button className="column-filter-option" key={name} onClick={() => selectValueSuggestion(activeValueHelperFilter.id, name)} role="option" type="button">
              <span>{name}</span>
            </button>
          ))}
        </div>
      ) : null}
      {showDateHelper && activeValueHelperFilter ? (
        <div className="column-filter-calendar-menu">
          <AppCalendar
            className="column-filter-calendar"
            onChange={(value) => selectFilterDate(activeValueHelperFilter.id, value)}
            value={activeValueHelperFilter.value}
          />
        </div>
      ) : null}
    </div>
  );
}

function hasProductColumnValueHelper(
  column: ProductColumnFilterKey,
  valueSuggestions: Partial<Record<ProductColumnFilterKey, string[]>> = productColumnValueSuggestions,
  dateHelperColumns: ProductColumnFilterKey[] = ["lastUpdated"],
) {
  return Boolean(valueSuggestions[column]?.length) || column === "componentCount" || dateHelperColumns.includes(column);
}

function shouldClearWholeFilterValue(
  filter: ProductColumnFilter,
  valueSuggestions: Partial<Record<ProductColumnFilterKey, string[]>> = productColumnValueSuggestions,
  dateHelperColumns: ProductColumnFilterKey[] = ["lastUpdated"],
) {
  return Boolean(filter.value) && (Boolean(valueSuggestions[filter.column]?.length) || dateHelperColumns.includes(filter.column));
}

function getProductColumnValueSuggestions(
  filter: ProductColumnFilter | null,
  componentSuggestions: string[],
  normalizedQuery: string,
  valueSuggestions: Partial<Record<ProductColumnFilterKey, string[]>> = productColumnValueSuggestions,
) {
  if (!filter) return [];
  if (filter.column === "componentCount") {
    if (!normalizedQuery) return [];
    return componentSuggestions.filter((name) => normalizeSearchText(name).includes(normalizedQuery)).slice(0, 8);
  }

  const suggestions = productColumnValueSuggestions[filter.column] ?? [];
  if (!normalizedQuery) return suggestions;
  return suggestions.filter((name) => normalizeSearchText(name).includes(normalizedQuery));
}

function matchesProductColumnFilters(product: Product, filters: ProductColumnFilter[]) {
  const activeFilters = filters.filter((filter) => normalizeSearchText(filter.value));
  if (activeFilters.length === 0) return true;

  return activeFilters.every((filter) =>
    getProductColumnFilterValues(product, filter.column).some((value) => normalizeSearchText(value).includes(normalizeSearchText(filter.value))),
  );
}

function getProductColumnFilterValues(product: Product, column: ProductColumnFilterKey) {
  const values: Record<ProductColumnFilterKey, string[]> = {
    name: [product.name],
    type: [typeLabels[product.type], product.type],
    category: [formatCategory(product.category), product.category ?? ""],
    recipeStatus: [recipeLabels[product.recipeStatus], product.recipeStatus],
    componentCount: [String(product.componentCount || 0), ...product.componentNames],
    lastUpdated: [formatDate(product.lastUpdated), product.lastUpdated],
    lot: [],
    productionDate: [],
    confirmedAt: [],
  };

  return values[column];
}

function matchesProductionHistoryColumnFilters(batch: ProductionBatch, filters: ProductColumnFilter[]) {
  const activeFilters = filters.filter((filter) => normalizeSearchText(filter.value));
  if (activeFilters.length === 0) return true;

  return activeFilters.every((filter) =>
    getProductionHistoryColumnFilterValues(batch, filter.column).some((value) => normalizeSearchText(value).includes(normalizeSearchText(filter.value))),
  );
}

function getProductionHistoryColumnFilterValues(batch: ProductionBatch, column: ProductColumnFilterKey) {
  const values: Record<ProductColumnFilterKey, string[]> = {
    name: [batch.productName, batch.productCode],
    type: [typeLabels[batch.productType], batch.productType],
    category: [formatCategory(batch.category), batch.category ?? ""],
    recipeStatus: [],
    componentCount: [String(batch.consumedLotCount || 0)],
    lastUpdated: [],
    lot: [batch.generatedLot],
    productionDate: [formatDate(batch.productionDate), batch.productionDate],
    confirmedAt: [formatDateTime(batch.createdAt), formatDate(batch.createdAt), batch.createdAt],
  };

  return values[column];
}

function DataTableFooter({ itemCount, selectedCount }: { itemCount: number; selectedCount: number }) {
  const [rowsPerPage, setRowsPerPage] = useState("10");

  return (
    <div className="data-table-footer">
      <div className="table-selection-summary">
        {selectedCount} sur {itemCount} ligne(s) selectionnee(s).
      </div>
      <div className="table-pagination">
        <label>
          Lignes par page
          <AppCombobox options={rowsPerPageOptions} onChange={setRowsPerPage} value={rowsPerPage} />
        </label>
        <span>Page 1 sur 1</span>
        <button disabled title="Premiere page" type="button">
          <AppIcon name="chevronsLeft" />
        </button>
        <button disabled title="Page precedente" type="button">
          <AppIcon name="chevronLeft" />
        </button>
        <button disabled title="Page suivante" type="button">
          <AppIcon name="chevronRight" />
        </button>
        <button disabled title="Derniere page" type="button">
          <AppIcon name="chevronsRight" />
        </button>
      </div>
    </div>
  );
}

function RecentReceptionsTable({ recentReceptions }: { recentReceptions: RecentReception[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Produit</th>
            <th>Fournisseur</th>
            <th>Lot frs</th>
            <th>Lot interne</th>
            <th>Quantite</th>
            <th>Peremption</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {recentReceptions.length === 0 ? (
            <TableEmpty colSpan={8}>Aucune reception enregistree dans Supabase.</TableEmpty>
          ) : null}
          {recentReceptions.map((reception) => (
            <tr className={cx(reception.status === "non_conforme" && "nonconform-row")} key={reception.id}>
              <td>{reception.date}</td>
              <td>{reception.product}</td>
              <td>{reception.supplier}</td>
              <td>{reception.supplierLot}</td>
              <td>
                <strong>{reception.internalLot}</strong>
              </td>
              <td>{reception.quantity}</td>
              <td>{reception.expiry}</td>
              <td>
                <ReceptionStatusBadge status={reception.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuppliersModule({
  suppliers,
  products,
  onSuppliersChanged,
}: {
  suppliers: Supplier[];
  products: Product[];
  onSuppliersChanged: () => Promise<void>;
}) {
  const rawProducts = useMemo(() => products.filter((product) => product.type === "raw"), [products]);
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id ?? "");
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierMaterialSearch, setSupplierMaterialSearch] = useState("");
  const [activeTab, setActiveTab] = useState<SupplierTab>("materials");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>({ name: "", contact: "" });
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [rawMaterialForm, setRawMaterialForm] = useState<RawMaterialFormState>({ name: "", unit: "kg" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null;
  const selectedProductIds = assignments[selectedSupplierId] ?? [];
  const supplierRows = useMemo(
    () =>
      suppliers.map((supplier, index) => ({
        supplier,
        code: formatSupplierCode(index),
        materialCount: (assignments[supplier.id] ?? []).length,
      })),
    [assignments, suppliers],
  );
  const filteredSupplierRows = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase();
    if (!query) return supplierRows;
    return supplierRows.filter(({ supplier, code }) =>
      [supplier.name, supplier.contact ?? "", code].some((value) => value.toLowerCase().includes(query)),
    );
  }, [supplierRows, supplierSearch]);
  const selectedSupplierCode = supplierRows.find((row) => row.supplier.id === selectedSupplierId)?.code ?? "--";
  const linkedProducts = useMemo(
    () => rawProducts.filter((product) => selectedProductIds.includes(product.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [rawProducts, selectedProductIds],
  );
  const filteredLinkedProducts = useMemo(() => filterProducts(linkedProducts, supplierMaterialSearch), [linkedProducts, supplierMaterialSearch]);

  useEffect(() => {
    setSelectedSupplierId((current) => (current && suppliers.some((supplier) => supplier.id === current) ? current : suppliers[0]?.id || ""));
  }, [suppliers]);

  useEffect(() => {
    setSupplierMaterialSearch("");
  }, [selectedSupplierId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignments() {
      setSaveStatus("loading");
      try {
        const nextAssignments = await fetchSupplierMaterialAssignments();
        if (!cancelled) {
          setAssignments(nextAssignments);
          setSaveStatus("idle");
        }
      } catch (error) {
        console.error("Supplier material assignments load failed", error);
        if (!cancelled) {
          setSaveStatus("error");
          setMessage(formatApiError(error, "Impossible de charger les affectations."));
        }
      }
    }

    void loadAssignments();

    return () => {
      cancelled = true;
    };
  }, []);

  function setLocalAssignment(supplierId: string, productIds: string[]) {
    setAssignments((current) => ({ ...current, [supplierId]: productIds }));
    setSaveStatus("idle");
    setMessage("");
  }

  function openCreateSupplier() {
    setSupplierForm({ name: "", contact: "" });
    setFormMode("create");
    setMessage("");
    setSaveStatus("idle");
  }

  function openEditSupplier() {
    if (!selectedSupplier) return;
    setSupplierForm({ name: selectedSupplier.name, contact: selectedSupplier.contact ?? "" });
    setFormMode("edit");
    setMessage("");
    setSaveStatus("idle");
  }

  async function handleSupplierFormSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedName = supplierForm.name.trim();
    if (!normalizedName) {
      setSaveStatus("error");
      setMessage("Nom du fournisseur requis.");
      return;
    }

    setSaveStatus("saving");
    setMessage("");
    try {
      let nextSelectedSupplierId = selectedSupplierId;
      if (formMode === "create") {
        nextSelectedSupplierId = await createSupplier({ name: normalizedName, contact: supplierForm.contact || null });
      } else if (formMode === "edit" && selectedSupplier) {
        await updateSupplier(selectedSupplier.id, { name: normalizedName, contact: supplierForm.contact || null });
      }

      await onSuppliersChanged();
      setSelectedSupplierId(nextSelectedSupplierId);
      setFormMode(null);
      setSaveStatus("success");
      setMessage(formMode === "create" ? "Fournisseur cree." : "Fournisseur modifie.");
    } catch (error) {
      console.error("Supplier save failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible d'enregistrer le fournisseur."));
    }
  }

  async function persistSupplierMaterialsForSupplier(supplierId: string, productIds: string[], successMessage: string) {
    if (!supplierId) {
      setSaveStatus("error");
      setMessage("Selectionnez un fournisseur.");
      return false;
    }

    setSaveStatus("saving");
    setMessage("");
    try {
      await saveSupplierMaterialAssignments(supplierId, productIds);
      setLocalAssignment(supplierId, productIds);
      setSaveStatus("success");
      setMessage(successMessage);
      return true;
    } catch (error) {
      console.error("Supplier material assignment save failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible d'enregistrer les affectations."));
      return false;
    }
  }

  async function persistSupplierMaterials(productIds: string[], successMessage: string) {
    return persistSupplierMaterialsForSupplier(selectedSupplierId, productIds, successMessage);
  }

  async function handleMaterialModalSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedName = rawMaterialForm.name.trim();
    if (!normalizedName) {
      setMessage("Nom de la matiere premiere requis.");
      setSaveStatus("error");
      return;
    }

    setSaveStatus("saving");
    setMessage("");
    try {
      if (rawMaterialForm.id) {
        const productId = rawMaterialForm.id;
        const targetSupplierId = rawMaterialForm.supplierId || selectedSupplierId;

        await updateRawMaterialCatalogItem(productId, normalizedName, rawMaterialForm.unit);

        const currentSupplierId = selectedSupplierId;
        if (targetSupplierId !== currentSupplierId) {
          const oldSupplierProductIds = assignments[currentSupplierId] ?? [];
          await saveSupplierMaterialAssignments(currentSupplierId, oldSupplierProductIds.filter(id => id !== productId));
          setLocalAssignment(currentSupplierId, oldSupplierProductIds.filter(id => id !== productId));

          const newSupplierProductIds = assignments[targetSupplierId] ?? [];
          await saveSupplierMaterialAssignments(targetSupplierId, [...new Set([...newSupplierProductIds, productId])]);
          setLocalAssignment(targetSupplierId, [...new Set([...newSupplierProductIds, productId])]);
        }

        setMessage("Matiere premiere modifiee.");
        setSaveStatus("success");
        await onSuppliersChanged();
        setMaterialModalOpen(false);
      } else {
        const productId = await createRawMaterialCatalogItem({ name: normalizedName, unit: rawMaterialForm.unit });
        const targetSupplierId = rawMaterialForm.supplierId || selectedSupplierId;
        const targetProductIds = assignments[targetSupplierId] ?? [];
        const saved = await persistSupplierMaterialsForSupplier(targetSupplierId, [...new Set([...targetProductIds, productId])], "Matiere ajoutee.");
        if (!saved) return;

        await onSuppliersChanged();
        setRawMaterialForm({ name: "", unit: "kg" });
        setMaterialModalOpen(false);
      }
    } catch (error) {
      console.error("Raw material save failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible d'enregistrer la matiere premiere."));
    }
  }

  async function unlinkMaterial(productId: string) {
    await persistSupplierMaterials(selectedProductIds.filter((id) => id !== productId), "Matiere detachee.");
  }

  return (
    <main className="supplier-workspace">
      <AppCard className="supplier-registry-panel">
        <div className="table-toolbar supplier-table-toolbar">
          <div className="panel-title no-border">
            <span className="panel-icon">FR</span>
            <div>
              <h2>Fournisseurs</h2>
              <p>{filteredSupplierRows.length} fournisseur(s)</p>
            </div>
          </div>
          <div className="table-actions">
            <input
              autoComplete="off"
              placeholder="Filtrer les fournisseurs..."
              value={supplierSearch}
              onChange={(event) => setSupplierSearch(event.target.value)}
            />
            <button className="table-tool-button" type="button">
              <AppIcon name="columns" />
              <span>Colonnes</span>
              <AppIcon name="chevronDown" />
            </button>
            <button className="table-tool-button primary" onClick={openCreateSupplier} type="button">
              <AppIcon name="plus" />
              <span>Fournisseur</span>
            </button>
          </div>
        </div>

        <div className="table-wrap supplier-registry-table">
          <table className="data-table supplier-data-table">
            <thead>
              <tr>
                <th className="select-column"></th>
                <th>Code</th>
                <th>Fournisseur</th>
                <th>Contact</th>
                <th>Matieres</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSupplierRows.map(({ supplier, code, materialCount }) => (
                <tr
                  className={cx(supplier.id === selectedSupplierId && "selected-row")}
                  key={supplier.id}
                  onClick={() => {
                    setSelectedSupplierId(supplier.id);
                    setActiveTab("materials");
                  }}
                >
                  <td className="select-column">
                    <label className="table-checkbox">
                      <input
                        aria-label={`Selectionner ${supplier.name}`}
                        checked={supplier.id === selectedSupplierId}
                        onChange={() => {
                          setSelectedSupplierId(supplier.id);
                          setActiveTab("materials");
                        }}
                        type="checkbox"
                      />
                      <span></span>
                    </label>
                  </td>
                  <td>{code}</td>
                  <td>
                    <strong>{supplier.name}</strong>
                  </td>
                  <td>{supplier.contact || "--"}</td>
                  <td>
                    <AppBadge variant="neutral">{materialCount}</AppBadge>
                  </td>
                  <td>
                    <ActiveBadge active={supplier.isActive} />
                  </td>
                  <td>
                    <button
                      className="table-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedSupplierId(supplier.id);
                        setSupplierForm({ name: supplier.name, contact: supplier.contact ?? "" });
                        setFormMode("edit");
                        setMessage("");
                        setSaveStatus("idle");
                      }}
                      type="button"
                    >
                      Editer
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSupplierRows.length === 0 ? (
                <TableEmpty colSpan={7}>Aucun fournisseur trouve.</TableEmpty>
              ) : null}
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCardAside className="supplier-detail-panel">
        {selectedSupplier ? (
          <>
            <div className="supplier-detail-header">
              <div>
                <div className="supplier-meta-row">
                  <span>{selectedSupplierCode}</span>
                  <ActiveBadge active={selectedSupplier.isActive} />
                </div>
                <h2>{selectedSupplier.name}</h2>
                <p>{selectedSupplier.contact || "Aucun contact renseigne"}</p>
              </div>
            </div>

            <div className="supplier-tabs">
              <button className={cx(activeTab === "info" && "active")} onClick={() => setActiveTab("info")} type="button">
                Informations
              </button>
              <button className={cx(activeTab === "materials" && "active")} onClick={() => setActiveTab("materials")} type="button">
                Matieres fournies
              </button>
              <button className={cx(activeTab === "history" && "active")} onClick={() => setActiveTab("history")} type="button">
                Historique
              </button>
            </div>

            <div className="supplier-detail-body">
              {activeTab === "info" ? (
                <div className="supplier-info-grid">
                  <div>
                    <span>Nom</span>
                    <strong>{selectedSupplier.name}</strong>
                  </div>
                  <div>
                    <span>Contact</span>
                    <strong>{selectedSupplier.contact || "--"}</strong>
                  </div>
                  <div>
                    <span>Matieres liees</span>
                    <strong>{linkedProducts.length}</strong>
                  </div>
                </div>
              ) : null}

              {activeTab === "materials" ? (
                <div className="supplier-materials-panel">
                  <div className="supplier-detail-actions">
                    <h3>Matieres premieres associees</h3>
	                    <button
                        aria-label="Ajouter une matiere"
                        className="supplier-add-material-button"
	                      disabled={!selectedSupplierId}
	                      onClick={() => {
	                        setMaterialModalOpen(true);
	                        setRawMaterialForm({ name: "", unit: "kg", supplierId: selectedSupplierId });
	                      }}
                        title="Ajouter une matiere"
	                      type="button"
	                    >
                      <AppIcon name="plus" />
                    </button>
                  </div>
                  <input
                    className="supplier-material-search"
                    placeholder="Rechercher une matiere..."
                    type="search"
                    value={supplierMaterialSearch}
                    onChange={(event) => setSupplierMaterialSearch(event.target.value)}
                  />
                  <SupplierMaterialsTable
                    products={filteredLinkedProducts}
                    totalCount={linkedProducts.length}
                    onEdit={(product) => {
                      setRawMaterialForm({
                        id: product.id,
                        name: product.name,
                        unit: product.unit as "kg" | "piece",
                        supplierId: selectedSupplierId,
                      });
                      setMaterialModalOpen(true);
                    }}
                    onUnlink={unlinkMaterial}
                  />
                </div>
              ) : null}

              {activeTab === "history" ? <EmptyState compact>Historique fournisseur a connecter plus tard.</EmptyState> : null}

              {message ? <p className={cx("save-message", saveStatus === "error" ? "error" : "success")}>{message}</p> : null}
            </div>
          </>
        ) : (
          <EmptyState compact>Selectionnez ou creez un fournisseur.</EmptyState>
        )}
      </AppCardAside>

      {formMode ? (
        <SupplierFormDrawer
          form={supplierForm}
          mode={formMode}
          saveStatus={saveStatus}
          onCancel={() => setFormMode(null)}
          onChange={setSupplierForm}
          onSubmit={handleSupplierFormSubmit}
        />
      ) : null}

      {materialModalOpen ? (
        <MaterialLinkModal
          form={rawMaterialForm}
          suppliers={suppliers}
          saveStatus={saveStatus}
          onCancel={() => setMaterialModalOpen(false)}
          onChange={setRawMaterialForm}
          onSubmit={handleMaterialModalSubmit}
        />
      ) : null}
    </main>
  );
}

function TableActionsDropdown({
  onEdit,
  onUnlink,
}: {
  onEdit: () => void;
  onUnlink: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, []);

  return (
    <div className="table-actions-dropdown" ref={rootRef} style={{ position: "relative" }}>
      <button
        className="icon-button actions-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
        }}
      >
        <AppIcon name="dots" />
      </button>
      {isOpen && (
        <div
          className="table-actions-menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 100,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            boxShadow: "var(--shadow)",
            minWidth: "120px",
            display: "flex",
            flexDirection: "column",
            padding: "4px 0",
          }}
        >
          <button
            onClick={() => {
              onEdit();
              setIsOpen(false);
            }}
            type="button"
            style={{
              padding: "8px 12px",
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text)",
              width: "100%",
              fontWeight: 500,
              fontSize: "13px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Modifier
          </button>
          <button
            onClick={() => {
              onUnlink();
              setIsOpen(false);
            }}
            type="button"
            className="danger-option"
            style={{
              padding: "8px 12px",
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--danger)",
              width: "100%",
              fontWeight: 500,
              fontSize: "13px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--danger-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Detacher
          </button>
        </div>
      )}
    </div>
  );
}

function SupplierMaterialsTable({
  products,
  totalCount,
  onEdit,
  onUnlink,
}: {
  products: Product[];
  totalCount: number;
  onEdit: (product: Product) => void;
  onUnlink: (productId: string) => Promise<void>;
}) {
  return (
    <div className="table-wrap supplier-linked-table">
      <table className="data-table supplier-linked-data-table">
        <thead>
          <tr>
            <th>Matiere premiere</th>
            <th>Unite</th>
            <th className="actions-column"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
                <strong>{product.name}</strong>
              </td>
              <td>{product.unit}</td>
              <td className="actions-column">
                <TableActionsDropdown
                  onEdit={() => onEdit(product)}
                  onUnlink={() => void onUnlink(product.id)}
                />
              </td>
            </tr>
          ))}
          {products.length === 0 ? (
            <TableEmpty colSpan={3}>
              {totalCount === 0 ? "Aucune matiere premiere associee a ce fournisseur." : "Aucune matiere ne correspond a cette recherche."}
            </TableEmpty>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function SupplierFormDrawer({
  form,
  mode,
  saveStatus,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: SupplierFormState;
  mode: "create" | "edit";
  saveStatus: "idle" | "loading" | "saving" | "success" | "error";
  onCancel: () => void;
  onChange: (form: SupplierFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <AppDialogShell
      mode="drawer"
      onClose={onCancel}
      onSubmit={onSubmit}
      title={mode === "create" ? "Nouveau fournisseur" : "Modifier fournisseur"}
      footer={
        <>
          <AppButton disabled={saveStatus === "saving"} type="submit">
            {saveStatus === "saving" ? <TraceabilityLoader compact label="Enregistrement..." /> : "Enregistrer"}
          </AppButton>
          <AppButton onClick={onCancel} type="button" variant="secondary">
            Annuler
          </AppButton>
        </>
      }
    >
      <Field label="Nom du fournisseur">
        <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} required />
      </Field>
      <Field label="Contact">
        <input value={form.contact} onChange={(event) => onChange({ ...form, contact: event.target.value })} />
      </Field>
    </AppDialogShell>
  );
}

function MaterialLinkModal({
  form,
  suppliers,
  saveStatus,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: RawMaterialFormState;
  suppliers: Supplier[];
  saveStatus: "idle" | "loading" | "saving" | "success" | "error";
  onCancel: () => void;
  onChange: (form: RawMaterialFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isEditing = !!form.id;

  return (
    <AppDialogShell
      onClose={onCancel}
      onSubmit={onSubmit}
      title={isEditing ? "Modifier la matiere" : "Ajouter une matiere"}
      footer={
        <>
          <AppButton disabled={saveStatus === "saving"} type="submit">
            {saveStatus === "saving" ? (
              <TraceabilityLoader compact label={isEditing ? "Modification..." : "Ajout..."} />
            ) : (
              isEditing ? "Modifier" : "Ajouter"
            )}
          </AppButton>
          <AppButton onClick={onCancel} type="button" variant="secondary">
            Annuler
          </AppButton>
        </>
      }
    >
      <Field label="Nom de la matiere premiere">
        <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} required />
      </Field>
      <Field label="Unite">
        <AppCombobox options={rawMaterialUnitOptions} onChange={(unit) => onChange({ ...form, unit })} value={form.unit} />
      </Field>
      <Field label="Fournisseurs">
        <select
          value={form.supplierId || ""}
          onChange={(event) => onChange({ ...form, supplierId: event.target.value })}
          required
        >
          <option value="" disabled>Choisir un fournisseur...</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </Field>
    </AppDialogShell>
  );
}

function EmptyModule({ activeView }: { activeView: ViewId }) {
  return (
    <main className="page">
      <AppCard className="empty-module-panel">
        <EmptyState large>{navItems.find((item) => item.id === activeView)?.label}</EmptyState>
      </AppCard>
    </main>
  );
}

const navItems: Array<{ id: ViewId; label: string; icon: IconName }> = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "reception", label: "Reception", icon: "lifecycle" },
  { id: "fabrication", label: "Fabrication", icon: "folder" },
  { id: "production", label: "Production", icon: "analytics" },
  { id: "suppliers", label: "Fournisseurs", icon: "users" },
  { id: "traceability", label: "Lots & tracabilite", icon: "analytics" },
];

const documentItems: Array<{ id: ViewId; label: string; icon: IconName }> = [
  { id: "products", label: "Catalogue produits", icon: "database" },
  { id: "reports", label: "Rapports", icon: "report" },
  { id: "traceability", label: "Fiches de lots", icon: "file" },
];

const secondaryItems: Array<{ label: string; icon: IconName }> = [
  { label: "Parametres", icon: "settings" },
  { label: "Aide", icon: "help" },
  { label: "Recherche", icon: "search" },
];

function Sidebar({
  activeView,
  onNavigate,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}) {
  function blurFocusedSidebarControl(event: { currentTarget: HTMLElement }) {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
      activeElement.blur();
    }
  }

  return (
    <aside aria-label="Navigation principale" className="sidebar" onMouseLeave={blurFocusedSidebarControl}>
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <button className="brand" title="Boulangerie Pro" type="button">
            <span className="brand-mark">
              <AppIcon name="brand" />
            </span>
            <span className="brand-copy">
              <strong>Boulangerie Pro</strong>
              <span>Traceability OS</span>
            </span>
          </button>
        </div>
      </div>

      <div className="sidebar-content">
        <SidebarGroup items={navItems} activeView={activeView} onNavigate={onNavigate} title="Operations" />
        <SidebarGroup items={documentItems} activeView={activeView} onNavigate={onNavigate} title="Documents" />
        <div className="sidebar-group secondary-group">
          <span className="sidebar-group-label">Support</span>
          <nav>
            {secondaryItems.map((item) => (
              <button className="nav-item" key={item.label} title={item.label} type="button">
                <AppIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="user-menu" title="Maison Demo" type="button">
          <span className="user-avatar">MD</span>
          <span className="user-meta">
            <strong>Maison Demo</strong>
            <span>admin@boulangerie.local</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

function SidebarGroup({
  items,
  activeView,
  onNavigate,
  title,
}: {
  items: Array<{ id: ViewId; label: string; icon: IconName }>;
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  title: string;
}) {
  return (
    <div className="sidebar-group">
      <span className="sidebar-group-label">{title}</span>
      <nav>
        {items.map((item) => (
          <button
            aria-current={item.id === activeView ? "page" : undefined}
            className={cx("nav-item", item.id === activeView && "active")}
            key={`${title}-${item.id}-${item.label}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
            type="button"
          >
            <AppIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Topbar({
  dataStatus,
  theme,
  onThemeToggle,
}: {
  dataStatus: "unconfigured" | "loading" | "connected" | "error";
  theme: ThemeMode;
  onThemeToggle: () => void;
}) {
  const currentDateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <header className="topbar">
      <strong>{capitalize(currentDateLabel)}</strong>
      <input aria-label="Recherche globale" autoComplete="off" placeholder="Rechercher..." />
      <div className="topbar-actions">
        <span className={cx("connection-status", dataStatus)}>
          {dataStatus === "connected" ? (
            "Supabase"
          ) : dataStatus === "loading" ? (
            <TraceabilityLoader compact label="Sync..." />
          ) : dataStatus === "error" ? (
            "Erreur Supabase"
          ) : (
            "Supabase non configure"
          )}
        </span>
        <button className="theme-toggle" onClick={onThemeToggle} title="Changer le theme" type="button">
          <AppIcon name={theme === "dark" ? "sun" : "moon"} />
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
        <button title="Notifications" type="button">
          <AppIcon name="bell" />
        </button>
        <button title="Aide" type="button">
          <AppIcon name="help" />
        </button>
        <div className="avatar">MD</div>
      </div>
    </header>
  );
}

function AppDatePicker({
  value,
  onChange,
  placeholder = "Selectionner une date",
  allowClear = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, []);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="app-date-picker" ref={rootRef}>
      <button
        aria-controls={pickerId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={cx("date-picker-trigger", !value && "placeholder")}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <AppIcon name="calendar" />
        <span>{value ? formatDate(value) : placeholder}</span>
        <AppIcon name="chevronDown" />
      </button>

      {isOpen ? (
        <div className="calendar-popover" id={pickerId} role="dialog">
          <AppCalendar
            value={value}
            onChange={(nextValue) => {
              onChange(nextValue);
              setIsOpen(false);
            }}
          />
          {allowClear && value ? (
            <button
              className="calendar-clear"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              type="button"
            >
              Effacer la date
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AppCalendar({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const selectedDate = parseInputDate(value);
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const calendarCells = useMemo(() => buildCalendarCells(displayMonth), [displayMonth]);
  const calendarYearOptions = useMemo(() => buildCalendarYearOptions(displayMonth, selectedDate), [displayMonth, selectedDate]);
  const todayValue = toInputDateValue(new Date());

  useEffect(() => {
    if (selectedDate) setDisplayMonth(startOfMonth(selectedDate));
  }, [value]);

  function moveMonth(offset: number) {
    setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function updateDisplayMonth(month: number) {
    setDisplayMonth((current) => new Date(current.getFullYear(), month, 1));
  }

  function updateDisplayYear(year: number) {
    setDisplayMonth((current) => new Date(year, current.getMonth(), 1));
  }

  return (
    <div className={cx("app-calendar", className)}>
      <div className="calendar-header">
        <button aria-label="Mois precedent" onClick={() => moveMonth(-1)} type="button">
          <AppIcon name="chevronLeft" />
        </button>
        <div className="calendar-caption-selects" aria-label={formatCalendarMonth(displayMonth)}>
          <select
            aria-label="Mois"
            onChange={(event) => updateDisplayMonth(Number(event.target.value))}
            value={String(displayMonth.getMonth())}
          >
            {calendarMonthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Annee"
            onChange={(event) => updateDisplayYear(Number(event.target.value))}
            value={String(displayMonth.getFullYear())}
          >
            {calendarYearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <button aria-label="Mois suivant" onClick={() => moveMonth(1)} type="button">
          <AppIcon name="chevronRight" />
        </button>
      </div>
      <div className="calendar-weekdays">
        {calendarWeekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {calendarCells.map((day, index) => {
          if (!day) return <span aria-hidden="true" className="calendar-empty-day" key={`empty-${index}`} />;

          const dateValue = toInputDateValue(day);
          const isSelected = dateValue === value;
          const isToday = dateValue === todayValue;

          return (
            <button
              aria-pressed={isSelected}
              className={cx("calendar-day", isSelected && "selected", isToday && "today")}
              key={dateValue}
              onClick={() => onChange(dateValue)}
              type="button"
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppCombobox<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Selectionner...",
  emptyLabel = "Aucun element trouve.",
  disabled = false,
  openOnFocus = true,
}: {
  value: T;
  options: ComboOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  openOnFocus?: boolean;
}) {
  const comboboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, options.length]);

  function selectOption(nextValue: T) {
    onChange(nextValue);
    setIsOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (!isOpen) return;
      event.preventDefault();
      const activeOption = filteredOptions[activeIndex];
      if (activeOption) selectOption(activeOption.value);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  }

  return (
    <div className={cx("app-combobox", disabled && "disabled")} ref={rootRef}>
      <div className="combobox-input-wrap">
        <input
          aria-autocomplete="list"
          aria-controls={`${comboboxId}-list`}
          aria-expanded={isOpen}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(openOnFocus);
            setQuery("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={isOpen ? query : selectedOption?.label ?? ""}
        />
        <button
          aria-label={isOpen ? "Fermer la liste" : "Ouvrir la liste"}
          disabled={disabled}
          onClick={() => {
            setIsOpen((current) => !current);
            setQuery("");
          }}
          type="button"
        >
          <AppIcon name="chevronDown" />
        </button>
      </div>

      {isOpen ? (
        <div className="combobox-content">
          {filteredOptions.length === 0 ? <div className="combobox-empty">{emptyLabel}</div> : null}
          {filteredOptions.length > 0 ? (
            <div className="combobox-list" id={`${comboboxId}-list`} role="listbox">
              {filteredOptions.map((option, index) => (
                <button
                  aria-selected={option.value === value}
                  className={cx("combobox-item", index === activeIndex && "active")}
                  key={option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option.value)}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                  {option.value === value ? <AppIcon name="check" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AppIcon({ name }: { name: IconName }) {
  const pathByName: Record<IconName, ReactNode> = {
    brand: (
      <>
        <path d="M5 19V5h14v14" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </>
    ),
    dashboard: (
      <>
        <path d="M4 5h7v7H4z" />
        <path d="M13 5h7v4h-7z" />
        <path d="M13 11h7v8h-7z" />
        <path d="M4 14h7v5H4z" />
      </>
    ),
    lifecycle: (
      <>
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
        <path d="M8 4v16" />
      </>
    ),
    analytics: (
      <>
        <path d="M5 19V5" />
        <path d="M5 19h14" />
        <path d="M8 15l3-4 3 2 4-6" />
      </>
    ),
    folder: (
      <>
        <path d="M4 7h6l2 2h8v9H4z" />
        <path d="M4 7v11" />
      </>
    ),
    users: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 11a2.5 2.5 0 0 0 0-5" />
        <path d="M17 14.5a4.5 4.5 0 0 1 3.5 4.5" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    ),
    report: (
      <>
        <path d="M6 4h9l3 3v13H6z" />
        <path d="M14 4v4h4" />
        <path d="M9 16v-4" />
        <path d="M12 16V9" />
        <path d="M15 16v-2" />
      </>
    ),
    file: (
      <>
        <path d="M7 4h8l3 3v13H7z" />
        <path d="M14 4v4h4" />
        <path d="M10 12h5" />
        <path d="M10 16h5" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
        <path d="M4 12h2" />
        <path d="M18 12h2" />
        <path d="M12 4v2" />
        <path d="M12 18v2" />
        <path d="M6.4 6.4l1.4 1.4" />
        <path d="M16.2 16.2l1.4 1.4" />
        <path d="M17.6 6.4l-1.4 1.4" />
        <path d="M7.8 16.2l-1.4 1.4" />
      </>
    ),
    help: (
      <>
        <path d="M12 19v.01" />
        <path d="M9.5 9a2.6 2.6 0 1 1 4.4 1.9c-.9.8-1.9 1.3-1.9 3.1" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="M16 16l4 4" />
      </>
    ),
    bell: (
      <>
        <path d="M6 10a6 6 0 0 1 12 0c0 4 2 5 2 5H4s2-1 2-5" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </>
    ),
    calendar: (
      <>
        <path d="M7 3v4" />
        <path d="M17 3v4" />
        <path d="M4 8h16" />
        <path d="M5 5h14v15H5z" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l2.5 2.5L16 9" />
      </>
    ),
    chevronDown: <path d="M7 10l5 5 5-5" />,
    chevronLeft: <path d="M15 6l-6 6 6 6" />,
    chevronRight: <path d="M9 6l6 6-6 6" />,
    chevronsLeft: (
      <>
        <path d="M11 6l-6 6 6 6" />
        <path d="M19 6l-6 6 6 6" />
      </>
    ),
    chevronsRight: (
      <>
        <path d="M5 6l6 6-6 6" />
        <path d="M13 6l6 6-6 6" />
      </>
    ),
    columns: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M9 5v14" />
        <path d="M15 5v14" />
      </>
    ),
    dots: (
      <>
        <path d="M12 5v.01" />
        <path d="M12 12v.01" />
        <path d="M12 19v.01" />
      </>
    ),
    grip: (
      <>
        <path d="M9 5v.01" />
        <path d="M15 5v.01" />
        <path d="M9 12v.01" />
        <path d="M15 12v.01" />
        <path d="M9 19v.01" />
        <path d="M15 19v.01" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="M4.9 4.9l1.4 1.4" />
        <path d="M17.7 17.7l1.4 1.4" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="M4.9 19.1l1.4-1.4" />
        <path d="M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 15.4A8 8 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4z" />,
  };

  return (
    <svg aria-hidden="true" className="app-icon" fill="none" viewBox="0 0 24 24">
      {pathByName[name]}
    </svg>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={cx("field", wide && "wide")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function AppButton({
  children,
  className,
  compact = false,
  full = false,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  compact?: boolean;
  full?: boolean;
  variant?: AppButtonVariant;
}) {
  const variantClass: Record<AppButtonVariant, string> = {
    primary: "primary",
    secondary: "secondary",
    ghostDanger: "ghost-danger",
    blue: "blue",
    dangerSoft: "danger-soft",
  };

  return (
    <button className={cx("button", variantClass[variant], compact && "compact-button", full && "full", className)} {...props}>
      {children}
    </button>
  );
}

function AppCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("panel", className)}>{children}</section>;
}

function AppCardAside({ children, className }: { children: ReactNode; className?: string }) {
  return <aside className={cx("panel", className)}>{children}</aside>;
}

function AppCardForm({ children, className, ...props }: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  return (
    <form className={cx("panel", className)} {...props}>
      {children}
    </form>
  );
}

function AppDialogShell({
  bodyClassName,
  children,
  footer,
  mode = "modal",
  onClose,
  onSubmit,
  title,
}: {
  bodyClassName?: string;
  children: ReactNode;
  footer: ReactNode;
  mode?: "drawer" | "modal";
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  title: string;
}) {
  const titleId = useId();

  return (
    <div aria-labelledby={titleId} aria-modal="true" className={cx("app-dialog-overlay", mode)} role="dialog">
      <button aria-label="Fermer" className="app-dialog-backdrop" onClick={onClose} type="button" />
      <form autoComplete="off" className={cx("app-dialog-surface", mode)} onSubmit={onSubmit}>
        <div className="app-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <AppButton onClick={onClose} type="button" variant="secondary">
            Fermer
          </AppButton>
        </div>
        <div className={cx("app-dialog-body", bodyClassName)}>{children}</div>
        <div className="app-dialog-footer">{footer}</div>
      </form>
    </div>
  );
}

function AppBadge({ children, variant }: { children: ReactNode; variant: AppBadgeVariant }) {
  return <span className={cx("app-badge", variant)}>{children}</span>;
}

function ProductTypeBadge({ type }: { type: ProductType }) {
  return <AppBadge variant={type}>{typeLabels[type]}</AppBadge>;
}

function RecipeBadge({ status }: { status: RecipeStatus }) {
  return <AppBadge variant={status}>{recipeLabels[status]}</AppBadge>;
}

function ReceptionStatusBadge({ status }: { status: ReceptionStatus }) {
  return <AppBadge variant={status}>{formatReceptionStatus(status)}</AppBadge>;
}

function ActiveBadge({ active }: { active: boolean }) {
  return <AppBadge variant={active ? "conforme" : "neutral"}>{active ? "Actif" : "Inactif"}</AppBadge>;
}

function EmptyState({ children, compact = false, large = false, className }: { children: ReactNode; compact?: boolean; large?: boolean; className?: string }) {
  return <div className={cx("empty-state", compact && "compact", large && "large", className)}>{children}</div>;
}

function TableEmpty({ children, colSpan }: { children: ReactNode; colSpan: number }) {
  return (
    <tr>
      <td className="empty-table-cell" colSpan={colSpan}>
        <EmptyState compact>{children}</EmptyState>
      </td>
    </tr>
  );
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function QualityRadioGroup({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: ReceptionStatus;
  onChange: (value: ReceptionStatus) => void;
}) {
  return (
    <div className="quality-group">
      <span>{label}</span>
      <div className="radio-row">
        <label>
          <input checked={value === "conforme"} name={name} onChange={() => onChange("conforme")} type="radio" />
          Conforme
        </label>
        <label>
          <input checked={value === "non_conforme"} name={name} onChange={() => onChange("non_conforme")} type="radio" />
          Non conforme
        </label>
      </div>
    </div>
  );
}

function parseInputDate(value: string) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const parsedDate = new Date(year, month - 1, day);
  if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
    return null;
  }

  return parsedDate;
}

function toInputDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function buildCalendarYearOptions(displayMonth: Date, selectedDate: Date | null) {
  const currentYear = new Date().getFullYear();
  const anchorYear = selectedDate?.getFullYear() ?? displayMonth.getFullYear();
  const startYear = Math.min(currentYear - 5, anchorYear - 5, displayMonth.getFullYear() - 5);
  const endYear = Math.max(currentYear + 15, anchorYear + 15, displayMonth.getFullYear() + 15);

  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function buildCalendarCells(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: leadingEmptyDays }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function formatCalendarMonth(value: Date) {
  return capitalize(
    new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(value),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR").format(parseInputDate(value) ?? new Date(value));
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

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatCategory(category: ProductCategory | null) {
  return category ? categoryLabels[category] : "Sans categorie";
}

function filterProducts(products: Product[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return products;

  return products.filter((product) => normalizeSearchText(product.name).includes(normalizedQuery) || normalizeSearchText(product.code).includes(normalizedQuery));
}

function normalizeSearchText(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatSupplierCode(index: number) {
  return `FRS-${String(index + 1).padStart(3, "0")}`;
}

function formatReceptionStatus(status: ReceptionStatus) {
  return status === "conforme" ? "Conforme" : "Non conforme";
}

function formatStockPreview(stock: LotStockPreview | null | undefined) {
  if (!stock || stock.availableLotCount === 0) return "0 lot disponible";
  return `${stock.availableLotCount} lot(s), ${stock.totalAvailable.toLocaleString("fr-FR")} ${stock.unit}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default App;
