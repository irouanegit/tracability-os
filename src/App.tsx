import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  type FormHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppWindowIcon, CodeIcon } from "lucide-react";
import { check as checkForTauriUpdate, type DownloadEvent } from "@tauri-apps/plugin-updater";
import {
  Handle,
  PanOnScrollMode,
  Position,
  ReactFlow,
  type Edge,
  type Node as FlowNode,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { User } from "@supabase/supabase-js";
import "./styles.css";
import { FabricationDiagramWorkspace } from "./FabricationDiagramWorkspace";
import { ProductionTraceabilityDiagram } from "./ProductionTraceabilityDiagram";
import { TraceabilityLoader } from "./TraceabilityLoader";
import { generateProductionLotNumber } from "./lib/productionLotCodification";
import {
  buildProductionPdfData,
  buildProductionPdfDataFromBatch,
  downloadProductionTraceabilityBatchPdf,
  downloadProductionTraceabilityPdf,
  openProductionPdfFile,
} from "./lib/productionTraceabilityPdf";
import { downloadTraceabilityLotsPdf, type TraceabilityLotsPdfRow } from "./lib/traceabilityLotsPdf";
import {
  renderProductionBatchPdfInWorker,
  renderSingleProductionPdfInWorker,
} from "./lib/productionPdfWorkerClient";
import { downloadReceptionQualityPdf, type ReceptionQualityPdfGroup } from "./lib/receptionQualityPdf";
import {
  countDateRangeDays,
  expandPlanningSchedule,
  findLatestDependencyOccurrence,
  isPlanningSourceStatusUsable,
  type PlanningFrequency,
} from "./lib/planningEngine";
import {
  buildProductionSchemaBranchFromTraceabilitySnapshot,
  mergeProductionSchemaBranches,
} from "./lib/productionSubstitution";
import {
  computeNextRunAt,
  type AutomationNotification,
  type ScheduleFrequency,
  type ScheduledRule,
} from "./lib/schedulerEngine";
import { getAuthUserInitials, getAuthUserLabel, isSupabaseConfigured, supabase } from "./lib/supabase";
import {
  archiveProductionPlanSeries,
  cancelProductionPlan,
  createProductionPlanBundle,
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
  fetchActiveRecipeMetadata,
  fetchPlanningEligibleLots,
  fetchProductionPlanConfirmationContext,
  fetchProductionPlanDependencies,
  fetchProductionPlans,
  refreshProductionPlan,
  fetchProductionBatches,
  fetchProductionBatchCount,
  fetchProductionConsumptionDetails,
  fetchProductionTraceabilitySnapshot,
  fetchReceptionBatchLines,
  fetchReceptionBatches,
  type AuditActor,
  fetchLotHistoryForProduct,
  type ProductLotHistoryItem,
  fetchLotStockPreview,
  fetchProductCatalog,
  fetchProductSchema,
  fetchProductSchemaDiagram,
  fetchRecentReceptions,
  fetchSupplierMaterialAssignments,
  fetchSupplierRawMaterialCatalog,
  fetchSuppliers,
  formatApiError,
  markProductionBatchesPdfExported,
  markReceptionBatchesPdfExported,
  saveProductSchema,
  saveSupplierMaterialAssignments,
  updateProductionPlanSeriesStatus,
  updateSupplier,
  type LotStockPreview,
  type Product,
  type ProductCategory,
  type ProductCatalogInput,
  type AvailableLotOption,
  type ActiveRecipeMetadata,
  type PlanningEligibleLot,
  type ProductionBatch,
  type ProductionConsumptionDetail,
  type ProductionTraceabilitySnapshot,
  type ProductionPlan,
  type ProductionPlanDependency,
  type ProductionPlanDependencyInput,
  type ProductionPlanOccurrenceInput,
  type ProductionPlanSeriesInput,
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

type ViewId = "dashboard" | "reception" | "fabrication" | "production" | "traceability" | "planification" | "products" | "suppliers" | "reports";
type CanvasPosition = { x: number; y: number };
type ThemeMode = "dark" | "light";
type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";
type SupplierTab = "info" | "materials" | "history";
type SupplierFormState = { name: string; contact: string };
type RawMaterialFormState = { id?: string; name: string; unit: "piece" | "kg"; supplierId?: string };
type ComboOption<T extends string = string> = { value: T; label: string };
type AppBadgeVariant = ProductType | RecipeStatus | ReceptionStatus | "neutral";
type AppButtonVariant = "primary" | "secondary" | "ghostDanger" | "blue" | "dangerSoft" | "danger";
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
  | "download"
  | "dots"
  | "grip"
  | "pause"
  | "plus"
  | "trash"
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
  selectedProductId: string;
  selectedProductName: string;
  selectedLotIds: string[];
  confirmed: boolean;
  status: "loading" | "ready" | "error";
};
type ProductionLotDraft = {
  lots: AvailableLotOption[];
  selectedProductId: string;
  selectedProductName: string;
  selectedLotIds: string[];
  status: "loading" | "ready" | "error";
};
type EffectiveProductionComponent = {
  node: ProductSchemaNode;
  nodeKey: string;
  parentNodeKey: string | null;
  depth: number;
  draft: ProductionLotDraft;
};
type PlannedProductionRequest = {
  requestId: string;
  planId: string;
  productId: string;
  productionDate: string;
  responsibleName: string | null;
  selections: Array<{
    expectedProductId: string;
    selectedProductId: string;
    lotId: string;
  }>;
};
type ProductColumnFilterKey =
  | "name"
  | "type"
  | "category"
  | "recipeStatus"
  | "components"
  | "componentCount"
  | "lastUpdated"
  | "lot"
  | "productionDate"
  | "confirmedAt";
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
  { key: "category", label: "categorie", description: "Beldi, boulangerie, patisserie, viennoiserie" },
  { key: "recipeStatus", label: "recette", description: "Active, manquante, non requis" },
  { key: "components", label: "composants", description: "Nom d'un composant" },
  { key: "lastUpdated", label: "derniere_modification", description: "Date de modification" },
];

const categoryLabels: Record<ProductCategory, string> = {
  beldi: "Beldi",
  boulangerie: "Boulangerie",
  cake: "Patisserie",
  patisserie: "Patisserie",
  viennoiserie: "Viennoiserie",
};

const categoryOptions: Array<ComboOption<Exclude<ProductCategory, "cake">>> = [
  { value: "beldi", label: categoryLabels.beldi },
  { value: "boulangerie", label: categoryLabels.boulangerie },
  { value: "patisserie", label: categoryLabels.patisserie },
  { value: "viennoiserie", label: categoryLabels.viennoiserie },
];

const flexibleRawMaterialSubstitutionGroups = [
  {
    key: "chocolate",
    names: [
      "Chocolat au lait Callebaut",
      "Chocolat au lait Lubeca",
      "Chocolat blanc Callebaut",
      "Chocolat blanc Lubeca",
      "Chocolat caramel",
      "Chocolat noir Callebaut",
      "Chocolat noir Lubeca",
      "Gala blanc",
      "Gala noir",
    ],
  },
  {
    key: "colorant",
    names: [
      "Colorant",
      "Colorant blanc",
      "Colorant jaune",
      "Colorant noir",
      "Colorant orange",
      "Colorant pistache",
      "Colorant rouge",
      "Colorant rouge Tarabco",
      "Colorant vert",
    ],
  },
] as const;

type FlexibleRawMaterialSubstitutionGroup = (typeof flexibleRawMaterialSubstitutionGroups)[number]["key"];

const flexibleSemiFinishedSubstitutionGroups = [
  {
    key: "biscuit",
    searchTerm: "biscuit",
  },
  {
    key: "pistolet",
    searchTerm: "pistolet",
  },
  {
    key: "coulis",
    searchTerm: "coulis",
  },
  {
    key: "croquant",
    searchTerm: "croquant",
  },
  {
    key: "ganache",
    searchTerm: "ganache",
  },
  {
    key: "glacage",
    searchTerm: "glacage",
  },
  {
    key: "insert",
    searchTerm: "insert",
  },
  {
    key: "mousse",
    searchTerm: "mousse",
  },
  {
    key: "silicone",
    searchTerm: "silicone",
  },
  {
    key: "sirop",
    searchTerm: "sirop",
  },
] as const;

type FlexibleSemiFinishedSubstitutionGroup = (typeof flexibleSemiFinishedSubstitutionGroups)[number]["key"];
type FlexibleSubstitutionGroup = FlexibleRawMaterialSubstitutionGroup | FlexibleSemiFinishedSubstitutionGroup;

const flexibleRawMaterialSubstitutionGroupByName = new Map<string, FlexibleRawMaterialSubstitutionGroup>(
  flexibleRawMaterialSubstitutionGroups.flatMap((group) => group.names.map((name) => [normalizeSearchText(name), group.key])),
);

const productColumnValueSuggestions: Partial<Record<ProductColumnFilterKey, string[]>> = {
  type: [typeLabels.raw, typeLabels.semi_finished, typeLabels.finished],
  category: categoryOptions.map((option) => option.label),
  recipeStatus: [recipeLabels.active, recipeLabels.missing, recipeLabels.not_required],
};

const productionHistoryColumnFilterOptions: ProductColumnFilterOption[] = [
  { key: "name", label: "produit", description: "Nom produit" },
  { key: "type", label: "type", description: "Semi-fini, produit fini" },
  { key: "category", label: "categorie", description: "Beldi, boulangerie, patisserie, viennoiserie" },
  { key: "lot", label: "lot", description: "Lot de production" },
  { key: "productionDate", label: "date_production", description: "Date de production" },
  { key: "confirmedAt", label: "date_confirmation", description: "Date de confirmation" },
];

const productionHistoryColumnValueSuggestions: Partial<Record<ProductColumnFilterKey, string[]>> = {
  type: [typeLabels.semi_finished, typeLabels.finished],
  category: categoryOptions.map((option) => option.label),
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
const planningWeekdays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const calendarMonthOptions = Array.from({ length: 12 }, (_, monthIndex) => ({
  value: String(monthIndex),
  label: capitalize(new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(2026, monthIndex, 1))),
}));
const canvasWidth = 2200;
const canvasHeight = 1400;
const canvasCardWidth = 236;
const canvasCardHeight = 150;
const appUiStoragePrefix = "tracability-os-ui:";

function readPersistedState<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`${appUiStoragePrefix}${key}`);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch (error) {
    console.warn(`Failed to read persisted state for ${key}`, error);
    return fallback;
  }
}

function clearPersistedState(...keys: string[]) {
  try {
    keys.forEach((key) => localStorage.removeItem(`${appUiStoragePrefix}${key}`));
  } catch (error) {
    console.warn("Failed to clear persisted UI state", error);
  }
}

function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readPersistedState(key, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(`${appUiStoragePrefix}${key}`, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to persist state for ${key}`, error);
    }
  }, [key, value]);

  return [value, setValue] as const;
}

const receptionDraftStorageKeys = [
  "reception.details.receptionDate",
  "reception.details.supplierId",
  "reception.details.deliveryNote",
  "reception.details.receivedBy",
  "reception.details.catalogSearch",
  "reception.details.lines",
  "reception.details.focusedLineId",
];

function clearReceptionDraftCache() {
  clearPersistedState(...receptionDraftStorageKeys);
}

function productionLotSelectionKey(productId: string, productionDate: string, componentKey: string) {
  return `${productId}|${productionDate}|${componentKey}`;
}

function productionComponentProductSelectionKey(productId: string, productionDate: string, componentKey: string) {
  return `${productId}|${productionDate}|${componentKey}`;
}

function productionLotSelectionForProductKey(productId: string, productionDate: string, componentKey: string, selectedProductId: string) {
  return productionLotSelectionKey(productId, productionDate, `${componentKey}:${selectedProductId}`);
}

function toStoredDateKey(value: string | null | undefined) {
  if (!value) return "";
  const storedDate = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (storedDate) return storedDate;
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "" : toInputDateValue(parsedDate);
}

function App() {
  const [activeView, setActiveView] = usePersistentState<ViewId>("activeView", "reception");
  const [receptionScreen, setReceptionScreen] = usePersistentState<"list" | "details">("receptionScreen", "list");
  const [receptionDraftResetKey, setReceptionDraftResetKey] = useState(0);
  const [editingReceptionBatchIds, setEditingReceptionBatchIds] = usePersistentState<string[] | null>("editingReceptionBatchIds", null);
  const [fabricationScreen, setFabricationScreen] = usePersistentState<"list" | "schema">("fabricationScreen", "list");
  const [fabricationProductColumnFilters, setFabricationProductColumnFilters] = usePersistentState<ProductColumnFilter[]>("fabricationProductColumnFilters", []);
  const [fabricationSchemaSidebarCollapsed, setFabricationSchemaSidebarCollapsed] = usePersistentState("fabricationSchemaSidebarCollapsed", false);
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("theme") === "light" ? "light" : "dark"));
  const [selectedFabricationProductId, setSelectedFabricationProductId] = usePersistentState("selectedFabricationProductId", "");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receptionBatches, setReceptionBatches] = useState<ReceptionBatch[]>([]);
  const [selectedReceptionBatchId, setSelectedReceptionBatchId] = usePersistentState("selectedReceptionBatchId", "");
  const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>([]);
  const [productionBatchCount, setProductionBatchCount] = useState(0);
  const [recentReceptions, setRecentReceptions] = useState<RecentReception[]>([]);
  const [dataStatus, setDataStatus] = useState<"unconfigured" | "loading" | "connected" | "error">(
    isSupabaseConfigured ? "loading" : "unconfigured",
  );
  const [authStatus, setAuthStatus] = useState<AuthStatus>(isSupabaseConfigured ? "loading" : "unconfigured");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [plannedProductionRequest, setPlannedProductionRequest] = useState<PlannedProductionRequest | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<"idle" | "checking" | "downloading" | "ready" | "error">("idle");
  const [updaterMessage, setUpdaterMessage] = useState("");
  const selectedFabricationProduct = useMemo(
    () => products.find((product) => product.id === selectedFabricationProductId) ?? null,
    [products, selectedFabricationProductId],
  );
  const isFabricationDiagramActive = activeView === "fabrication" && fabricationScreen === "schema";

  async function loadSupabaseData() {
    if (!isSupabaseConfigured) return;

    setDataStatus("loading");
    try {
      const [nextProducts, nextSuppliers, nextBatches, nextProductionBatches, nextProductionBatchCount, nextReceptions] = await Promise.all([
        fetchProductCatalog(),
        fetchSuppliers(),
        fetchReceptionBatches(),
        fetchProductionBatches(),
        fetchProductionBatchCount(),
        fetchRecentReceptions(),
      ]);

      setProducts(nextProducts);
      setSuppliers(nextSuppliers);
      setReceptionBatches(nextBatches);
      setSelectedReceptionBatchId((current) => current || nextBatches[0]?.id || "");
      setProductionBatches(nextProductionBatches);
      setProductionBatchCount(nextProductionBatchCount);
      setRecentReceptions(nextReceptions);
      setDataStatus("connected");
    } catch (error) {
      console.error("Supabase load failed", error);
      setDataStatus("error");
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("unconfigured");
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthUser(data.session?.user ?? null);
      setAuthStatus(data.session?.user ? "authenticated" : "unauthenticated");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthStatus(session?.user ? "authenticated" : "unauthenticated");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadSupabaseData();
    }
  }, [authStatus]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  function handleNavigate(view: ViewId) {
    setActiveView(view);
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthUser(null);
    setAuthStatus("unauthenticated");
    setDataStatus("unconfigured");
  }

  async function handleCheckForUpdates() {
    setUpdaterStatus("checking");
    setUpdaterMessage("Verification...");

    try {
      const update = await checkForTauriUpdate();

      if (!update) {
        setUpdaterStatus("idle");
        setUpdaterMessage("Application a jour.");
        window.setTimeout(() => setUpdaterMessage(""), 3500);
        return;
      }

      const shouldInstall = window.confirm(
        `Une mise a jour ${update.version} est disponible. Voulez-vous la telecharger et l'installer maintenant ?`,
      );

      if (!shouldInstall) {
        setUpdaterStatus("idle");
        setUpdaterMessage(`Mise a jour ${update.version} disponible.`);
        return;
      }

      let downloadedBytes = 0;
      let totalBytes = 0;
      setUpdaterStatus("downloading");
      setUpdaterMessage("Telechargement...");

      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          downloadedBytes = 0;
          totalBytes = event.data.contentLength ?? 0;
        }

        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            setUpdaterMessage(`Telechargement ${percent}%`);
          }
        }

        if (event.event === "Finished") {
          setUpdaterMessage("Installation...");
        }
      });

      setUpdaterStatus("ready");
      setUpdaterMessage("Mise a jour installee. Relancez l'application.");
    } catch (error) {
      console.error("Update check failed", error);
      setUpdaterStatus("error");
      setUpdaterMessage(formatApiError(error, "Impossible de verifier les mises a jour."));
    }
  }

  if (authStatus === "loading") {
    return (
      <div className="auth-shell">
        <TraceabilityLoader label="Chargement session..." />
      </div>
    );
  }

  if (authStatus === "unconfigured" || authStatus === "unauthenticated") {
    return (
      <AuthScreen
        authStatus={authStatus}
        theme={theme}
        onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
    );
  }

  return (
    <>
    {isFabricationDiagramActive ? (
      <div className="diagram-app-shell">
        {selectedFabricationProductId && !selectedFabricationProduct && dataStatus === "loading" ? (
          <div className="diagram-loading-shell">
            <TraceabilityLoader label="Chargement du schema..." />
          </div>
        ) : (
          <FabricationDiagramWorkspace
            initialProduct={selectedFabricationProduct}
            initialProductSidebarCollapsed={fabricationSchemaSidebarCollapsed}
            products={products}
            onBack={() => setFabricationScreen("list")}
            onSchemaSaved={async () => {
              await loadSupabaseData();
            }}
          />
        )}
      </div>
    ) : null}
    <div aria-hidden={isFabricationDiagramActive} className={cx("app-shell", isFabricationDiagramActive && "app-shell-background")}>
      <Sidebar activeView={activeView} currentUser={authUser} onNavigate={handleNavigate} onSignOut={() => void handleSignOut()} />
      <div className="workspace">
        <Topbar
          currentUser={authUser}
          dataStatus={dataStatus}
          onCheckForUpdates={() => void handleCheckForUpdates()}
          theme={theme}
          updaterMessage={updaterMessage}
          updaterStatus={updaterStatus}
          onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        />
        <CachedScreen active={activeView === "reception" && receptionScreen === "list"}>
          <ReceptionList
            receptionBatches={receptionBatches}
            selectedBatchId={selectedReceptionBatchId}
            onExportStateChanged={loadSupabaseData}
            onCreate={() => {
              clearReceptionDraftCache();
              setEditingReceptionBatchIds(null);
              setReceptionDraftResetKey((current) => current + 1);
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
              clearReceptionDraftCache();
              setReceptionScreen("list");
              setEditingReceptionBatchIds(null);
              setReceptionDraftResetKey((current) => current + 1);
            }}
            onReceptionSaved={async (batchId) => {
              await loadSupabaseData();
              clearReceptionDraftCache();
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
              setSelectedFabricationProductId("");
              setFabricationSchemaSidebarCollapsed(false);
              setFabricationScreen("schema");
            }}
            onSelect={(product) => {
              setSelectedFabricationProductId(product.id);
              setFabricationSchemaSidebarCollapsed(product.recipeStatus === "active");
              setFabricationScreen("schema");
            }}
          />
        </CachedScreen>
        <CachedScreen active={activeView === "production"}>
          <ProductionModule
            batches={productionBatches}
            plannedRequest={plannedProductionRequest}
            productionBatchCount={productionBatchCount}
            products={products}
            onProductionSaved={async () => {
              await loadSupabaseData();
            }}
            onExportStateChanged={loadSupabaseData}
            onPlannedRequestConsumed={() => setPlannedProductionRequest(null)}
            onProductionBatchesPatched={(patchBatchIds, patch) => {
              const patchIds = new Set(patchBatchIds);
              setProductionBatches((current) => current.map((batch) => (patchIds.has(batch.id) ? { ...batch, ...patch } : batch)));
            }}
          />
        </CachedScreen>
        <CachedScreen active={activeView === "suppliers"}>
          <SuppliersModule products={products} suppliers={suppliers} onSuppliersChanged={loadSupabaseData} />
        </CachedScreen>
        <CachedScreen active={activeView === "traceability"}>
          <TraceabilityModule
            productionBatches={productionBatches}
            products={products}
            receptionBatches={receptionBatches}
          />
        </CachedScreen>
        <CachedScreen active={activeView === "planification"}>
          <PlanificationModuleV2
            active={activeView === "planification"}
            products={products}
            onOpenConfirmation={async (planId) => {
              const context = await fetchProductionPlanConfirmationContext(planId);
              const missingSelection = context.selections.find((selection) => !selection.lotId);
              if (missingSelection) throw new Error("Un lot planifie n'est pas encore disponible.");
              setPlannedProductionRequest({
                requestId: crypto.randomUUID(),
                planId: context.planId,
                productId: context.productId,
                productionDate: context.plannedDate,
                responsibleName: context.responsibleName,
                selections: context.selections.map((selection) => ({
                  expectedProductId: selection.expectedProductId,
                  selectedProductId: selection.selectedProductId,
                  lotId: selection.lotId!,
                })),
              });
              setActiveView("production");
            }}
          />
        </CachedScreen>
        <CachedScreen active={activeView !== "reception" && activeView !== "fabrication" && activeView !== "production" && activeView !== "suppliers" && activeView !== "traceability" && activeView !== "planification"}>
          <EmptyModule activeView={activeView} />
        </CachedScreen>
      </div>
    </div>
    </>
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

function AuthScreen({
  authStatus,
  theme,
  onThemeToggle,
}: {
  authStatus: AuthStatus;
  theme: ThemeMode;
  onThemeToggle: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setStatus("error");
      setMessage("Supabase n'est pas configure.");
      return;
    }

    setStatus("signing");
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus("error");
      setMessage(formatApiError(error, "Connexion impossible."));
      return;
    }

    setStatus("idle");
  }

  return (
    <main className="auth-shell">
      <form className="auth-card login-card" onSubmit={(event) => void handleSubmit(event)}>
        <div className="auth-brand">
          <span className="brand-mark">
            <AppIcon name="brand" />
          </span>
          <div>
            <h1>Tracability OS</h1>
            <p>Connexion utilisateur</p>
          </div>
        </div>
        {authStatus === "unconfigured" ? <p className="auth-note error">Supabase n'est pas configure.</p> : null}
        <Field label="Email">
          <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
        </Field>
        <Field label="Mot de passe">
          <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </Field>
        {message ? <p className={cx("save-message", status === "error" && "error")}>{message}</p> : null}
        <div className="auth-actions">
          <AppButton className="auth-theme-toggle" onClick={onThemeToggle} type="button" variant="secondary">
            <AppIcon name={theme === "dark" ? "sun" : "moon"} />
            {theme === "dark" ? "Light" : "Dark"}
          </AppButton>
          <AppButton disabled={status === "signing" || authStatus === "unconfigured"} type="submit">
            {status === "signing" ? <TraceabilityLoader compact label="Connexion..." /> : "Se connecter"}
          </AppButton>
        </div>
      </form>
    </main>
  );
}

function UserProfileAvatar({
  actor,
  label = "Utilisateur",
}: {
  actor?: { name: string | null; email: string | null } | null;
  label?: string;
}) {
  const displayName = actor?.name || getAuthUserLabel(actor?.email);
  const initials = getInitials(displayName);
  const title = actor?.email ? `${label}: ${displayName} (${actor.email})` : `${label}: ${displayName}`;

  return (
    <span aria-label={title} className={cx("row-user-profile", !actor?.email && !actor?.name && "unknown")} title={title}>
      {initials}
    </span>
  );
}

function UserProfileAvatarGroup({
  actors,
  label,
}: {
  actors: Array<{ id?: string | null; name: string | null; email: string | null }>;
  label: string;
}) {
  const uniqueActors = actors.filter(
    (actor, index, allActors) =>
      allActors.findIndex(
        (candidate) =>
          (candidate.id || candidate.email || candidate.name || "unknown") ===
          (actor.id || actor.email || actor.name || "unknown"),
      ) === index,
  );
  const visibleActors = uniqueActors.length > 0 ? uniqueActors : [{ name: null, email: null }];

  return (
    <span className="row-user-profile-group">
      {visibleActors.map((actor, index) => (
        <UserProfileAvatar actor={actor} key={actor.id || actor.email || actor.name || `unknown-${index}`} label={label} />
      ))}
    </span>
  );
}

function getInitials(label: string) {
  return (
    label
      .split(/[.\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function ReceptionList({
  receptionBatches,
  selectedBatchId,
  onExportStateChanged,
  onCreate,
  onEdit,
  onSelectBatch,
}: {
  receptionBatches: ReceptionBatch[];
  selectedBatchId: string;
  onExportStateChanged: () => Promise<void>;
  onCreate: () => void;
  onEdit: (batchIds: string[]) => void;
  onSelectBatch: (batchId: string) => void;
}) {
  const [batchLines, setBatchLines] = useState<ReceptionBatchLine[]>([]);
  const [lineStatus, setLineStatus] = useState<"idle" | "loading" | "error">("idle");
  const [selectedPdfGroupKeys, setSelectedPdfGroupKeys] = usePersistentState<string[]>("reception.list.selectedPdfGroupKeys", []);
  const [receptionPdfStatus, setReceptionPdfStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [receptionPdfMessage, setReceptionPdfMessage] = useState("");
  const [receptionPdfAlert, setReceptionPdfAlert] = useState<{ filePath: string; description: string } | null>(null);
  const receptionGroups = useMemo(() => groupReceptionBatchesBySupplierAndDate(receptionBatches), [receptionBatches]);
  const selectedGroup = receptionGroups.find((group) => group.batches.some((batch) => batch.id === selectedBatchId)) ?? receptionGroups[0] ?? null;
  const selectedPdfGroups = receptionGroups.filter((group) => selectedPdfGroupKeys.includes(group.key));
  const allReceptionGroupsSelected = receptionGroups.length > 0 && selectedPdfGroupKeys.length === receptionGroups.length;

  useEffect(() => {
    if (receptionGroups.length === 0) return;
    if (selectedBatchId && receptionGroups.some((group) => group.batches.some((batch) => batch.id === selectedBatchId))) return;
    onSelectBatch(receptionGroups[0].batches[0].id);
  }, [onSelectBatch, receptionGroups, selectedBatchId]);

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
      try {
        await markReceptionBatchesPdfExported(selectedPdfGroups.flatMap((group) => group.batches.map((batch) => batch.id)));
        await onExportStateChanged();
      } catch (markError) {
        console.error("Reception PDF export marker failed", markError);
        setReceptionPdfStatus("error");
        setReceptionPdfMessage("PDF exporte, mais le marquage partage a echoue. Executez add_pdf_export_tracking.sql.");
        if (exportedFilePath) {
          setReceptionPdfAlert({
            filePath: exportedFilePath,
            description: `PDF reception exporte: ${location}`,
          });
        }
        return;
      }
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
                <th className="actor-column"></th>
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
                <TableEmpty colSpan={8}>Aucune reception batch enregistree.</TableEmpty>
              ) : null}
              {receptionGroups.map((group) => (
                <tr
                  className={cx(group.key === selectedGroup?.key && "selected-row", group.isExported && "exported-row")}
                  key={group.key}
                  onClick={() => onSelectBatch(group.batches[0].id)}
                >
                  <td className="actor-cell">
                    <UserProfileAvatarGroup actors={group.validatedByActors} label="Valide par" />
                  </td>
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
      validatedByActors: ReceptionBatch["validatedBy"][];
      isExported: boolean;
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
      group.validatedByActors.push(batch.validatedBy);
      group.isExported = group.isExported || Boolean(batch.exportedAt);
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
      validatedByActors: [batch.validatedBy],
      isExported: Boolean(batch.exportedAt),
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
  const [receptionDate, setReceptionDate] = usePersistentState("reception.details.receptionDate", todayInputValue);
  const receptionTime = "06:30";
  const [supplierId, setSupplierId] = usePersistentState("reception.details.supplierId", suppliers[0]?.id ?? "");
  const [deliveryNote, setDeliveryNote] = usePersistentState("reception.details.deliveryNote", "");
  const [receivedBy, setReceivedBy] = usePersistentState("reception.details.receivedBy", "");
  const [catalogSearch, setCatalogSearch] = usePersistentState("reception.details.catalogSearch", "");
  const [supplierCatalog, setSupplierCatalog] = useState<Product[]>([]);
  const [lines, setLines] = usePersistentState<ReceptionDraftLine[]>("reception.details.lines", []);
  const [focusedLineId, setFocusedLineId] = usePersistentState("reception.details.focusedLineId", "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const filteredCatalog = useMemo(() => filterProducts(supplierCatalog, catalogSearch), [catalogSearch, supplierCatalog]);

  useEffect(() => {
    if (!primaryEditingBatch) {
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
  plannedRequest,
  productionBatchCount,
  products,
  onProductionSaved,
  onExportStateChanged,
  onPlannedRequestConsumed,
  onProductionBatchesPatched,
}: {
  batches: ProductionBatch[];
  plannedRequest: PlannedProductionRequest | null;
  productionBatchCount: number;
  products: Product[];
  onProductionSaved: () => Promise<void>;
  onExportStateChanged: () => Promise<void>;
  onPlannedRequestConsumed: () => void;
  onProductionBatchesPatched: (batchIds: string[], patch: Partial<ProductionBatch>) => void;
}) {
  type ProductionScreenMode = "overview" | "entry";
  type ProductionDetailMode = "preview" | "schema";
  type ProductionHistoryPanelMode = "history" | "detail";

  const activeBlueprints = useMemo(
    () => products.filter((product) => product.type !== "raw" && product.recipeStatus === "active"),
    [products],
  );
  const flexibleSubstitutionProducts = useMemo(() => getFlexibleSubstitutionProducts(products), [products]);
  const [screenMode, setScreenMode] = usePersistentState<ProductionScreenMode>("production.screenMode", "overview");
  const [detailMode, setDetailMode] = usePersistentState<ProductionDetailMode>("production.detailMode", "preview");
  const [historyPanelMode, setHistoryPanelMode] = usePersistentState<ProductionHistoryPanelMode>("production.historyPanelMode", "history");
  const [historyColumnFilters, setHistoryColumnFilters] = usePersistentState<ProductColumnFilter[]>("production.historyColumnFilters", []);
  const [recipeSearchTerm, setRecipeSearchTerm] = usePersistentState("production.recipeSearchTerm", "");
  const [recipeTypeFilter, setRecipeTypeFilter] = usePersistentState<Exclude<ProductType, "raw"> | "all">("production.recipeTypeFilter", "all");
  const [recipeCategoryFilter, setRecipeCategoryFilter] = usePersistentState<ProductCategory | "all">("production.recipeCategoryFilter", "all");
  const [openRecipeUsageProductId, setOpenRecipeUsageProductId] = useState<string | null>(null);
  const [isHistorySelectionMode, setIsHistorySelectionMode] = usePersistentState("production.isHistorySelectionMode", false);
  const [selectedHistoryBatchIds, setSelectedHistoryBatchIds] = usePersistentState<string[]>("production.selectedHistoryBatchIds", []);
  const [workspaceBatchIds, setWorkspaceBatchIds] = usePersistentState<string[]>("production.workspaceBatchIds", []);
  const [historyPdfCopyCount, setHistoryPdfCopyCount] = usePersistentState("production.historyPdfCopyCount", 1);
  const [selectedBatchId, setSelectedBatchId] = usePersistentState("selectedProductionBatchId", "");
  const [selectedProductId, setSelectedProductId] = usePersistentState("production.selectedProductId", activeBlueprints[0]?.id ?? "");
  const [productionEntryBackStack, setProductionEntryBackStack] = usePersistentState<string[]>("production.entryBackStack", []);
  const [productionDate, setProductionDate] = usePersistentState("production.productionDate", todayInputValue);
  const [responsibleName, setResponsibleName] = useState("");
  const [operation, setOperation] = usePersistentState("production.operation", "");
  const [observations, setObservations] = usePersistentState("production.observations", "");
  const [selectedLotIdsByCacheKey, setSelectedLotIdsByCacheKey] = usePersistentState<Record<string, string[]>>("production.selectedLotIdsByCacheKey", {});
  const [selectedProductIdsByCacheKey, setSelectedProductIdsByCacheKey] = usePersistentState<Record<string, string>>("production.selectedProductIdsByCacheKey", {});
  const [componentDrafts, setComponentDrafts] = useState<ProductionComponentDraft[]>([]);
  const [lotDraftsByProductId, setLotDraftsByProductId] = useState<Record<string, ProductionLotDraft>>({});
  const [expandedComponentRows, setExpandedComponentRows] = usePersistentState<Record<string, boolean>>("production.expandedComponentRows", {});
  const [expandedPreviewRows, setExpandedPreviewRows] = usePersistentState<Record<string, boolean>>("production.expandedPreviewRows", {});
  const [componentStatus, setComponentStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [detailRows, setDetailRows] = useState<ProductionConsumptionDetail[]>([]);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [schemaDiagram, setSchemaDiagram] = useState<ProductSchemaDiagram | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<"idle" | "loading" | "error">("idle");
  const [pdfStatus, setPdfStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [pdfMessage, setPdfMessage] = useState("");
  const [historyPdfAlert, setHistoryPdfAlert] = useState<{ filePath: string; description: string } | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const appliedPlannedRequestRef = useRef("");
  const responsibleNameProductRef = useRef(selectedProductId);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (recipeCategoryFilter === "cake") {
      setRecipeCategoryFilter("patisserie");
    }
  }, [recipeCategoryFilter, setRecipeCategoryFilter]);

  const batchById = useMemo(() => new Map(batches.map((batch) => [batch.id, batch])), [batches]);
  const selectedProduct = activeBlueprints.find((product) => product.id === selectedProductId) ?? null;
  const selectedBatch = batchById.get(selectedBatchId) ?? null;
  const generatedLot = useMemo(() => generateProductionLotNumber(selectedProduct, productionDate), [productionDate, selectedProduct]);
  const hasExistingProductionForDate = useMemo(() => {
    if (!selectedProduct || !productionDate) return false;
    return batches.some(
      (batch) =>
        batch.productId === selectedProduct.id &&
        batch.status === "validated" &&
        toStoredDateKey(batch.productionDate) === productionDate,
    );
  }, [batches, productionDate, selectedProduct]);
  const confirmedProductionDateValues = useMemo(() => {
    if (!selectedProduct) return new Set<string>();
    return new Set(
      batches
        .filter((batch) => batch.productId === selectedProduct.id && batch.status === "validated")
        .map((batch) => toStoredDateKey(batch.productionDate))
        .filter(Boolean),
    );
  }, [batches, selectedProduct]);
  const selectedBatchRows = detailRows;
  const selectedBatchPreviewComponents = schemaDiagram?.components ?? emptyProductSchemaNodes;
  const previewLotsByProductId = useMemo(
    () =>
      selectedBatch?.traceabilitySnapshot
        ? groupProductionSnapshotLotsByNodeId(selectedBatch.traceabilitySnapshot)
        : groupProductionRowsByProductId(selectedBatchRows),
    [selectedBatch?.traceabilitySnapshot, selectedBatchRows],
  );
  const allProductionComponentRows = useMemo(
    () => flattenEffectiveProductionComponents(componentDrafts, lotDraftsByProductId),
    [componentDrafts, lotDraftsByProductId],
  );
  const historyBatches = useMemo(
    () => [...batches].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [batches],
  );
  const filteredBatches = useMemo(() => {
    if (screenMode !== "overview") return historyBatches;
    return historyBatches.filter((batch) => matchesProductionHistoryColumnFilters(batch, historyColumnFilters));
  }, [historyBatches, historyColumnFilters, screenMode]);
  const historyCountLabel = historyColumnFilters.length > 0 ? filteredBatches.length : productionBatchCount;
  const historyVirtualizer = useVirtualizer({
    count: filteredBatches.length,
    estimateSize: () => 61,
    getItemKey: (index) => filteredBatches[index]?.id ?? index,
    getScrollElement: () => historyScrollRef.current,
    overscan: 8,
  });
  const workspaceBatches = useMemo(() => workspaceBatchIds.flatMap((batchId) => batchById.get(batchId) ?? []), [batchById, workspaceBatchIds]);
  const exportableWorkspaceBatches = useMemo(() => workspaceBatches.filter((batch) => batch.status === "validated"), [workspaceBatches]);
  const selectedHistoryBatches = useMemo(() => selectedHistoryBatchIds.flatMap((batchId) => batchById.get(batchId) ?? []), [batchById, selectedHistoryBatchIds]);
  const filteredBlueprints = useMemo(() => {
    const query = recipeSearchTerm.trim().toLowerCase();
    return activeBlueprints.filter((product) =>
      (recipeTypeFilter === "all" || product.type === recipeTypeFilter) &&
      (recipeCategoryFilter === "all" || product.category === recipeCategoryFilter) &&
      (!query ||
        [product.name, product.code, categoryLabels[product.category ?? "boulangerie"] ?? "", typeLabels[product.type]].some((value) =>
          value.toLowerCase().includes(query),
        )),
    );
  }, [activeBlueprints, recipeCategoryFilter, recipeSearchTerm, recipeTypeFilter]);
  const recipeUsageByProductId = useMemo(() => {
    const productsByComponentName = new Map<string, Product[]>();
    for (const product of activeBlueprints) {
      for (const componentName of product.componentNames) {
        const normalizedName = normalizeSearchText(componentName);
        const productsForComponent = productsByComponentName.get(normalizedName) ?? [];
        productsForComponent.push(product);
        productsByComponentName.set(normalizedName, productsForComponent);
      }
    }

    return Object.fromEntries(
      activeBlueprints
        .filter((product) => product.type === "semi_finished")
        .map((component) => [
          component.id,
          (productsByComponentName.get(normalizeSearchText(component.name)) ?? []).filter((candidate) => candidate.id !== component.id),
        ]),
    );
  }, [activeBlueprints]);

  function resolveSelectedSubstitutionProduct(
    component: ProductSchemaNode,
    rootProductId: string,
    componentKey: string,
    productSelectionOverrides: Record<string, string> = {},
  ) {
    const substitutionProducts = getComponentSubstitutionProducts(component, flexibleSubstitutionProducts);
    const productSelectionCacheKey = productionComponentProductSelectionKey(rootProductId, productionDate, componentKey);
    const selectedProductId = productSelectionOverrides[componentKey] ?? selectedProductIdsByCacheKey[productSelectionCacheKey];
    return (
      substitutionProducts.find((candidate) => candidate.id === selectedProductId) ??
      substitutionProducts.find((candidate) => candidate.id === component.id) ??
      component
    );
  }

  async function resolveProductionComponentTree(
    component: ProductSchemaNode,
    rootProductId: string,
    componentKey: string,
    productSelectionOverrides: Record<string, string> = {},
    forceReloadChildrenForProductIds = new Set<string>(),
  ): Promise<ProductSchemaNode> {
    const selectedSubstitutionProduct = resolveSelectedSubstitutionProduct(component, rootProductId, componentKey, productSelectionOverrides);
    const shouldLoadSelectedSchema =
      component.type === "semi_finished" &&
      selectedSubstitutionProduct.type === "semi_finished" &&
      (selectedSubstitutionProduct.id !== component.id || forceReloadChildrenForProductIds.has(componentKey));
    const children = shouldLoadSelectedSchema ? await fetchProductSchema(selectedSubstitutionProduct.id) : component.children;
    const resolvedChildren = await Promise.all(
      orderProductionSchemaNodes(children).map((child, index) =>
        resolveProductionComponentTree(
          child,
          rootProductId,
          productionSchemaRowKey(child, componentKey, index),
          productSelectionOverrides,
          forceReloadChildrenForProductIds,
        ),
      ),
    );
    return { ...component, children: resolvedChildren };
  }

  async function buildProductionLotDraft(
    component: ProductSchemaNode,
    rootProductId: string,
    componentKey: string,
    productSelectionOverrides: Record<string, string> = {},
    lotRequestCache = new Map<string, Promise<AvailableLotOption[]>>(),
  ): Promise<ProductionLotDraft> {
    const selectedSubstitutionProduct = resolveSelectedSubstitutionProduct(component, rootProductId, componentKey, productSelectionOverrides);
    try {
      let lotsRequest = lotRequestCache.get(selectedSubstitutionProduct.id);
      if (!lotsRequest) {
        lotsRequest = fetchAvailableLotsForProduct(selectedSubstitutionProduct.id, 5);
        lotRequestCache.set(selectedSubstitutionProduct.id, lotsRequest);
      }
      const lots = await lotsRequest;
      const cacheKey = productionLotSelectionForProductKey(rootProductId, productionDate, componentKey, selectedSubstitutionProduct.id);
      const cachedSelectedLotIds = selectedLotIdsByCacheKey[cacheKey]?.filter((lotId) => lots.some((lot) => lot.id === lotId)) ?? [];
      return {
        lots,
        selectedProductId: selectedSubstitutionProduct.id,
        selectedProductName: selectedSubstitutionProduct.name,
        selectedLotIds: cachedSelectedLotIds.length > 0 ? cachedSelectedLotIds : lots[0] ? [lots[0].id] : [],
        status: "ready" as const,
      };
    } catch (error) {
      console.error("Production lot suggestions failed", error);
      return {
        lots: [],
        selectedProductId: selectedSubstitutionProduct.id,
        selectedProductName: selectedSubstitutionProduct.name,
        selectedLotIds: [],
        status: "error" as const,
      };
    }
  }

  async function buildProductionLotDraftsForNode(
    component: ProductSchemaNode,
    rootProductId: string,
    rowKey: string,
    productSelectionOverrides: Record<string, string> = {},
    lotRequestCache = new Map<string, Promise<AvailableLotOption[]>>(),
  ): Promise<Record<string, ProductionLotDraft>> {
    const entries: Array<[string, ProductionLotDraft]> = [];

    async function visit(node: ProductSchemaNode, nodeKey: string) {
      entries.push([nodeKey, await buildProductionLotDraft(node, rootProductId, nodeKey, productSelectionOverrides, lotRequestCache)]);
      await Promise.all(
        orderProductionSchemaNodes(node.children).map((child, index) =>
          visit(child, productionSchemaRowKey(child, nodeKey, index)),
        ),
      );
    }

    await visit(component, rowKey);
    return Object.fromEntries(entries) as Record<string, ProductionLotDraft>;
  }

  async function buildProductionLotDrafts(
    components: ProductSchemaNode[],
    rootProductId: string,
    productSelectionOverrides: Record<string, string> = {},
  ): Promise<Record<string, ProductionLotDraft>> {
    const lotRequestCache = new Map<string, Promise<AvailableLotOption[]>>();
    const entries = await Promise.all(
      orderProductionSchemaNodes(components).map((component, index) =>
        buildProductionLotDraftsForNode(
          component,
          rootProductId,
          productionSchemaRowKey(component, "", index),
          productSelectionOverrides,
          lotRequestCache,
        ),
      ),
    );
    return Object.assign({}, ...entries) as Record<string, ProductionLotDraft>;
  }

  useEffect(() => {
    setSelectedProductId((current) => (current && activeBlueprints.some((product) => product.id === current) ? current : activeBlueprints[0]?.id ?? ""));
    setProductionEntryBackStack((current) => current.filter((productId) => activeBlueprints.some((product) => product.id === productId)));
  }, [activeBlueprints]);

  useEffect(() => {
    if (!plannedRequest || !activeBlueprints.some((product) => product.id === plannedRequest.productId)) return;
    appliedPlannedRequestRef.current = "";
    setScreenMode("entry");
    setSelectedProductId(plannedRequest.productId);
    setProductionDate(plannedRequest.productionDate);
    setResponsibleName(plannedRequest.responsibleName ?? "");
    setProductionEntryBackStack([]);
    setSaveStatus("idle");
    setMessage("");
  }, [activeBlueprints, plannedRequest]);

  useEffect(() => {
    if (screenMode !== "entry") {
      responsibleNameProductRef.current = selectedProductId;
      setResponsibleName("");
      return;
    }

    if (responsibleNameProductRef.current === selectedProductId) return;

    responsibleNameProductRef.current = selectedProductId;
    const shouldKeepPlannedResponsibleName =
      plannedRequest?.productId === selectedProductId && plannedRequest.productionDate === productionDate;
    if (!shouldKeepPlannedResponsibleName) setResponsibleName("");
  }, [plannedRequest?.productId, plannedRequest?.productionDate, productionDate, screenMode, selectedProductId]);

  useEffect(() => {
    if (openRecipeUsageProductId && !activeBlueprints.some((product) => product.id === openRecipeUsageProductId)) setOpenRecipeUsageProductId(null);
  }, [activeBlueprints, openRecipeUsageProductId]);

  useEffect(() => {
    if (batches.length > 0 && (!selectedBatchId || !batches.some((batch) => batch.id === selectedBatchId))) setSelectedBatchId(batches[0].id);
  }, [batches, selectedBatchId, setSelectedBatchId]);

  useEffect(() => {
    const existingValidatedIds = new Set(batches.filter((batch) => batch.status === "validated").map((batch) => batch.id));
    setSelectedHistoryBatchIds((current) => current.filter((batchId) => existingValidatedIds.has(batchId)));
  }, [batches]);

  useEffect(() => {
    const existingBatchIds = new Set(batches.map((batch) => batch.id));
    setWorkspaceBatchIds((current) => current.filter((batchId) => existingBatchIds.has(batchId)));
  }, [batches]);

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
        const baseComponents = await fetchProductSchema(product.id);
        const orderedBaseComponents = orderProductionSchemaNodes(baseComponents);
        const components = await Promise.all(
          orderedBaseComponents.map((component, index) =>
            resolveProductionComponentTree(component, product.id, productionSchemaRowKey(component, "", index)),
          ),
        );
        const nextLotDrafts = await buildProductionLotDrafts(components, product.id);

        if (!cancelled) {
          setComponentDrafts(
            components.map((component, index) => {
              const rowKey = productionSchemaRowKey(component, "", index);
              return {
                component,
                lots: nextLotDrafts[rowKey]?.lots ?? [],
                selectedProductId: nextLotDrafts[rowKey]?.selectedProductId ?? component.id,
                selectedProductName: nextLotDrafts[rowKey]?.selectedProductName ?? component.name,
                selectedLotIds: nextLotDrafts[rowKey]?.selectedLotIds ?? [],
                confirmed: false,
                status: nextLotDrafts[rowKey]?.status ?? "ready",
              };
            }),
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
    if (
      !plannedRequest ||
      !selectedProduct ||
      selectedProduct.id !== plannedRequest.productId ||
      componentStatus !== "ready" ||
      appliedPlannedRequestRef.current === plannedRequest.requestId
    ) {
      return;
    }

    const request = plannedRequest;
    const targetProduct = selectedProduct;
    let cancelled = false;
    async function applyPlannedSelections() {
      const selectionByExpectedProductId = new Map(
        request.selections.map((selection) => [selection.expectedProductId, selection]),
      );
      const nextEntries = await Promise.all(
        allProductionComponentRows.map(async (row) => {
          const component = row.node;
          const selection = selectionByExpectedProductId.get(component.id);
          if (!selection) return null;
          const selectedProductOption = products.find((product) => product.id === selection.selectedProductId);
          const lots = await fetchAvailableLotsForProduct(selection.selectedProductId, 20);
          if (!lots.some((lot) => lot.id === selection.lotId)) {
            throw new Error(`Le lot planifie pour ${selectedProductOption?.name ?? component.name} n'est plus disponible.`);
          }
          return {
            component,
            nodeKey: row.nodeKey,
            selectedProductName: selectedProductOption?.name ?? component.name,
            selection,
            lots,
          };
        }),
      );

      if (cancelled) return;
      const entries = nextEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      setLotDraftsByProductId((current) => {
        const next = { ...current };
        for (const entry of entries) {
          next[entry.nodeKey] = {
            lots: entry.lots,
            selectedProductId: entry.selection.selectedProductId,
            selectedProductName: entry.selectedProductName,
            selectedLotIds: [entry.selection.lotId],
            status: "ready",
          };
        }
        return next;
      });
      setComponentDrafts((current) =>
        current.map((draft) => {
          const entry = entries.find((candidate) => candidate.component.id === draft.component.id);
          return entry
            ? {
                ...draft,
                lots: entry.lots,
                selectedProductId: entry.selection.selectedProductId,
                selectedProductName: entry.selectedProductName,
                selectedLotIds: [entry.selection.lotId],
                confirmed: false,
                status: "ready",
              }
            : draft;
        }),
      );
      setSelectedProductIdsByCacheKey((current) => {
        const next = { ...current };
        for (const entry of entries) {
          next[productionComponentProductSelectionKey(targetProduct.id, request.productionDate, entry.nodeKey)] =
            entry.selection.selectedProductId;
        }
        return next;
      });
      setSelectedLotIdsByCacheKey((current) => {
        const next = { ...current };
        for (const entry of entries) {
          next[
            productionLotSelectionForProductKey(
              targetProduct.id,
              request.productionDate,
              entry.nodeKey,
              entry.selection.selectedProductId,
            )
          ] = [entry.selection.lotId];
        }
        return next;
      });
      appliedPlannedRequestRef.current = request.requestId;
    }

    void applyPlannedSelections().catch((error) => {
      console.error("Planned production prefill failed", error);
      if (!cancelled) {
        setSaveStatus("error");
        setMessage(formatApiError(error, "Impossible de charger les lots planifies."));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [allProductionComponentRows, componentStatus, plannedRequest, products, selectedProduct]);

  useEffect(() => {
    if (!selectedBatchId) {
      setDetailRows([]);
      setDetailStatus("idle");
      return;
    }
    if (historyPanelMode !== "detail") return;

    let cancelled = false;
    async function loadDetails() {
      setDetailStatus("loading");
      setDetailRows([]);
      try {
        const rows = await queryClient.fetchQuery({
          queryKey: ["production-consumption-details", selectedBatchId],
          queryFn: () => fetchProductionConsumptionDetails(selectedBatchId),
          staleTime: Number.POSITIVE_INFINITY,
        });
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
  }, [historyPanelMode, queryClient, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatch) {
      setSchemaDiagram(null);
      setSchemaStatus("idle");
      return;
    }
    if (historyPanelMode !== "detail") return;

    const batch = selectedBatch;
    let cancelled = false;
    async function loadSchemaDiagram() {
      if (batch.traceabilitySnapshot) {
        setSchemaDiagram(buildProductSchemaDiagramFromTraceabilitySnapshot(batch.traceabilitySnapshot));
        setSchemaStatus("idle");
        return;
      }

      setSchemaStatus("loading");
      setSchemaDiagram(null);
      try {
        const snapshot = await queryClient.fetchQuery({
          queryKey: ["production-traceability-snapshot", batch.id],
          queryFn: () => fetchProductionTraceabilitySnapshot(batch.id),
          staleTime: Number.POSITIVE_INFINITY,
        }).catch((error) => {
          console.warn("Production traceability snapshot load failed, falling back to active schema", error);
          return null;
        });
        const diagram = snapshot
          ? buildProductSchemaDiagramFromTraceabilitySnapshot(snapshot)
          : await fetchProductSchemaDiagram(batch.productId);
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
  }, [historyPanelMode, queryClient, selectedBatch?.id, selectedBatch?.productId]);

  useEffect(() => {
    setExpandedPreviewRows(buildDefaultExpandedProductionRows(selectedBatchPreviewComponents));
  }, [selectedBatch?.id, selectedBatchPreviewComponents]);

  async function selectComponentLot(rowKey: string, component: ProductSchemaNode, lotId: string) {
    const currentDraft = lotDraftsByProductId[rowKey];

    if (selectedProduct) {
      const selectedProductId = currentDraft?.selectedProductId ?? component.id;
      const cacheKey = productionLotSelectionForProductKey(selectedProduct.id, productionDate, rowKey, selectedProductId);
      setSelectedLotIdsByCacheKey((current) => ({ ...current, [cacheKey]: lotId ? [lotId] : [] }));
    }
    setLotDraftsByProductId((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] ?? { lots: [], selectedProductId: component.id, selectedProductName: component.name, status: "ready" as const }),
        selectedLotIds: lotId ? [lotId] : [],
      },
    }));
    setComponentDrafts((current) =>
      current.map((draft, index) =>
        productionSchemaRowKey(draft.component, "", index) === rowKey
          ? { ...draft, selectedLotIds: lotId ? [lotId] : [], confirmed: false }
          : draft,
      ),
    );
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");

    if (
      component.type !== "semi_finished" ||
      !currentDraft ||
      currentDraft.selectedProductId === component.id
    ) {
      return;
    }

    const selectedLot = currentDraft.lots.find((lot) => lot.id === lotId);
    if (!selectedLot || selectedLot.sourceType !== "fabrication" || !selectedLot.sourceId) return;

    try {
      const snapshot = await fetchProductionTraceabilitySnapshot(selectedLot.sourceId);
      if (!snapshot) return;

      const snapshotBranch = buildProductionSchemaBranchFromTraceabilitySnapshot(snapshot);
      setLotDraftsByProductId((current) => {
        if (!current[rowKey]?.selectedLotIds.includes(lotId)) return current;
        const replacement = {
          ...component,
          children: mergeProductionSchemaBranches(component.children, snapshotBranch.components),
        };
        return { ...current, ...keyProductionLotDraftsBySchemaRows(replacement, rowKey, snapshotBranch.lotDrafts) };
      });
      setComponentDrafts((current) => {
        const replacement = {
          ...component,
          children: mergeProductionSchemaBranches(component.children, snapshotBranch.components),
        };
        const nextComponents = replaceProductionSchemaNodeByRowKey(current.map((draft) => draft.component), rowKey, replacement);
        const nextDrafts = current.map((draft, index) => ({ ...draft, component: nextComponents[index] ?? draft.component }));
        setExpandedComponentRows(buildDefaultExpandedProductionRows(nextDrafts.map((draft) => draft.component)));
        return nextDrafts;
      });
    } catch (error) {
      console.error("Selected semi-finished lot traceability load failed", error);
    }
  }

  async function selectComponentProduct(rowKey: string, component: ProductSchemaNode, nextProductId: string) {
    if (!selectedProduct) return;

    const substitutionProducts = getComponentSubstitutionProducts(component, flexibleSubstitutionProducts);
    const nextProduct = substitutionProducts.find((product) => product.id === nextProductId);
    if (!nextProduct) return;

    const rootProduct = selectedProduct;
    const productSelectionOverrides = { [rowKey]: nextProduct.id };
    const productSelectionCacheKey = productionComponentProductSelectionKey(rootProduct.id, productionDate, rowKey);
    setSelectedProductIdsByCacheKey((current) => ({ ...current, [productSelectionCacheKey]: nextProduct.id }));
    setLotDraftsByProductId((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] ?? { lots: [], selectedLotIds: [], status: "ready" as const }),
        lots: [],
        selectedProductId: nextProduct.id,
        selectedProductName: nextProduct.name,
        selectedLotIds: [],
        status: "loading",
      },
    }));
    setComponentDrafts((current) =>
      current.map((draft, index) =>
        productionSchemaRowKey(draft.component, "", index) === rowKey
          ? {
              ...draft,
              lots: [],
              selectedProductId: nextProduct.id,
              selectedProductName: nextProduct.name,
              selectedLotIds: [],
              confirmed: false,
              status: "loading",
            }
          : draft,
      ),
    );
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");

    try {
      let resolvedComponent = await resolveProductionComponentTree(
        component,
        rootProduct.id,
        rowKey,
        productSelectionOverrides,
        new Set([rowKey]),
      );
      let nextLotDrafts = await buildProductionLotDraftsForNode(resolvedComponent, rootProduct.id, rowKey, productSelectionOverrides);
      const parentDraft = nextLotDrafts[rowKey] ?? {
        lots: [],
        selectedProductId: nextProduct.id,
        selectedProductName: nextProduct.name,
        selectedLotIds: [],
        status: "ready" as const,
      };
      const selectedParentLot = parentDraft.lots.find((lot) => parentDraft.selectedLotIds.includes(lot.id)) ?? null;

      if (
        component.type === "semi_finished" &&
        nextProduct.id !== component.id &&
        selectedParentLot?.sourceType === "fabrication" &&
        selectedParentLot.sourceId
      ) {
        try {
          const snapshot = await fetchProductionTraceabilitySnapshot(selectedParentLot.sourceId);
          if (snapshot) {
            const snapshotBranch = buildProductionSchemaBranchFromTraceabilitySnapshot(snapshot);
            resolvedComponent = {
              ...resolvedComponent,
              children: mergeProductionSchemaBranches(resolvedComponent.children, snapshotBranch.components),
            };
            nextLotDrafts = {
              ...nextLotDrafts,
              ...keyProductionLotDraftsBySchemaRows(resolvedComponent, rowKey, snapshotBranch.lotDrafts),
              [rowKey]: parentDraft,
            };
          }
        } catch (error) {
          console.error("Selected semi-finished traceability snapshot load failed", error);
        }
      }

      setSelectedLotIdsByCacheKey((current) => {
        const next = { ...current };
        for (const [componentKey, draft] of Object.entries(nextLotDrafts)) {
          next[productionLotSelectionForProductKey(rootProduct.id, productionDate, componentKey, draft.selectedProductId)] =
            draft.selectedLotIds;
        }
        return next;
      });
      setLotDraftsByProductId((current) => ({
        ...current,
        ...nextLotDrafts,
      }));
      setComponentDrafts((current) => {
        const nextComponents = replaceProductionSchemaNodeByRowKey(current.map((draft) => draft.component), rowKey, resolvedComponent);
        const nextDrafts = current.map((draft, index) => {
          const nextComponent = nextComponents[index] ?? draft.component;
          return productionSchemaRowKey(draft.component, "", index) === rowKey
            ? {
                ...draft,
                component: nextComponent,
                lots: parentDraft.lots,
                selectedProductId: parentDraft.selectedProductId,
                selectedProductName: parentDraft.selectedProductName,
                selectedLotIds: parentDraft.selectedLotIds,
                confirmed: false,
                status: parentDraft.status,
              }
            : {
                ...draft,
                component: nextComponent,
              };
        });
        setExpandedComponentRows(buildDefaultExpandedProductionRows(nextDrafts.map((draft) => draft.component)));
        return nextDrafts;
      });
    } catch (error) {
      console.error("Production substitution lot suggestions failed", error);
      setLotDraftsByProductId((current) => ({
        ...current,
        [rowKey]: {
          lots: [],
          selectedProductId: nextProduct.id,
          selectedProductName: nextProduct.name,
          selectedLotIds: [],
          status: "error",
        },
      }));
      setComponentDrafts((current) =>
        current.map((draft, index) =>
          productionSchemaRowKey(draft.component, "", index) === rowKey
            ? {
                ...draft,
                lots: [],
                selectedProductId: nextProduct.id,
                selectedProductName: nextProduct.name,
                selectedLotIds: [],
                confirmed: false,
                status: "error",
              }
            : draft,
        ),
      );
    }
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
    if (component.type !== "semi_finished" || component.id === selectedProductId) return;

    setProductionEntryBackStack((current) => [...current, selectedProductId].filter(Boolean));
    setSelectedProductId(component.id);
    setResponsibleName("");
    setOpenRecipeUsageProductId(null);
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");
  }

  function navigateBackProductionEntry() {
    setProductionEntryBackStack((current) => {
      const nextStack = [...current];
      const previousProductId = nextStack.pop();
      if (previousProductId) {
        setSelectedProductId(previousProductId);
        setResponsibleName("");
        setOpenRecipeUsageProductId(null);
        setSaveStatus("idle");
        setMessage("");
        setPdfStatus("idle");
        setPdfMessage("");
      }
      return nextStack;
    });
  }

  function selectProductionCatalogProduct(productId: string) {
    if (productId !== selectedProductId) setResponsibleName("");
    setSelectedProductId(productId);
    setProductionEntryBackStack([]);
    setOpenRecipeUsageProductId(null);
  }

  function startNewProduction() {
    setScreenMode("entry");
    setRecipeSearchTerm("");
    setProductionEntryBackStack([]);
    setResponsibleName("");
    setPdfStatus("idle");
    setPdfMessage("");
    setSaveStatus("idle");
    setMessage("");
  }

  function returnToProductionOverview() {
    setScreenMode("overview");
    setResponsibleName("");
    setProductionEntryBackStack([]);
    setSaveStatus("idle");
    setMessage("");
    setPdfStatus("idle");
    setPdfMessage("");
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

    const effectiveComponents = flattenEffectiveProductionComponents(componentDrafts, lotDraftsByProductId);
    const traceableComponents = effectiveComponents.filter((entry) => !isWaterComponent(entry.node));
    const missingComponent = traceableComponents.find((entry) => entry.draft.selectedLotIds.length === 0);
    if (missingComponent) {
      const draft = missingComponent.draft;
      setSaveStatus("error");
      setMessage(`Selectionnez un lot pour ${draft.selectedProductName || missingComponent.node.name}.`);
      return;
    }

    const consumedLotSelections = traceableComponents.flatMap((entry) =>
      entry.draft.selectedLotIds.map((lotId) => ({
        nodeKey: entry.nodeKey,
        parentNodeKey: entry.parentNodeKey,
        depth: entry.depth,
        expectedProductId: entry.node.id,
        selectedProductId: entry.draft.selectedProductId,
        consumedLotId: lotId,
      })),
    );

    setSaveStatus("saving");
    setMessage("");
    try {
      const batchId = await createProductionWithTraceability({
        planId:
          plannedRequest?.productId === selectedProduct.id && plannedRequest.productionDate === productionDate
            ? plannedRequest.planId
            : undefined,
        productionDate: new Date(`${productionDate}T06:30`).toISOString(),
        productId: selectedProduct.id,
        generatedLot,
        responsibleName: responsibleName.trim() || null,
        operation: operation.trim() || null,
        observations: observations.trim() || null,
        consumedLotIds: [...new Set(traceableComponents.flatMap((entry) => entry.draft.selectedLotIds))],
        consumedLotSelections,
      });

      setSaveStatus("success");
      setMessage("Production validee.");
      await onProductionSaved();
      setSelectedBatchId(batchId);
      if (plannedRequest?.productId === selectedProduct.id && plannedRequest.productionDate === productionDate) {
        onPlannedRequestConsumed();
      }
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
      const pdfData = buildProductionPdfData({
        categoryLabel: formatCategory(selectedProduct.category),
        componentDrafts,
        nestedLotDrafts: lotDraftsByProductId,
        product: selectedProduct,
        productLot: generatedLot,
        productionDate,
        responsibleName: responsibleName.trim() || null,
      });
      const pdfContents = await renderSingleProductionPdfInWorker(pdfData);
      const result = await downloadProductionTraceabilityPdf(pdfData, pdfContents);
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
          const [rows, traceabilitySnapshot] = await Promise.all([
            queryClient.fetchQuery({
              queryKey: ["production-consumption-details", batch.id],
              queryFn: () => fetchProductionConsumptionDetails(batch.id),
              staleTime: Infinity,
            }),
            batch.traceabilitySnapshot
              ? Promise.resolve(batch.traceabilitySnapshot)
              : queryClient.fetchQuery({
                  queryKey: ["production-traceability-snapshot", batch.id],
                  queryFn: () => fetchProductionTraceabilitySnapshot(batch.id),
                  staleTime: Infinity,
                }),
          ]);

          return buildProductionPdfDataFromBatch({
            batch: { ...batch, traceabilitySnapshot },
            rows,
          });
        }),
      );
      const repeatedPdfItems = pdfItems.flatMap((item) => Array.from({ length: historyPdfCopyCount }, () => item));
      const pdfContents = await renderProductionBatchPdfInWorker(repeatedPdfItems);
      const result = await downloadProductionTraceabilityBatchPdf(repeatedPdfItems, pdfContents);
      const exportedFilePath = "filePath" in result && typeof result.filePath === "string" ? result.filePath : "";
      const location = exportedFilePath || "telechargement lance";
      try {
        await markProductionBatchesPdfExported(exportableWorkspaceBatches.map((batch) => batch.id));
        onProductionBatchesPatched(
          exportableWorkspaceBatches.map((batch) => batch.id),
          { exportedAt: new Date().toISOString() },
        );
      } catch (markError) {
        console.error("Production PDF export marker failed", markError);
        setPdfStatus("error");
        setPdfMessage("PDF exporte, mais le marquage partage a echoue. Executez add_pdf_export_tracking.sql.");
        if (exportedFilePath) {
          setHistoryPdfAlert({
            filePath: exportedFilePath,
            description: `PDF groupe exporte: ${location}`,
          });
        }
        return;
      }
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
    setSelectedBatchId(batchId);
    setDetailMode("preview");
    setHistoryPanelMode("detail");
  }

  function toggleHistoryBatchSelection(batch: ProductionBatch, checked: boolean) {
    if (batch.status !== "validated") return;
    setSelectedHistoryBatchIds((current) => {
      if (!checked) return current.filter((batchId) => batchId !== batch.id);
      return current.includes(batch.id) ? current : [...current, batch.id];
    });
  }

  function toggleHistorySelectionMode() {
    setIsHistorySelectionMode((current) => {
      if (current) setSelectedHistoryBatchIds([]);
      return !current;
    });
    setDeleteMessage("");
    setDeleteStatus("idle");
    setDeleteConfirmationOpen(false);
  }

  function isEditableHistoryKeyTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (target instanceof HTMLInputElement) return target.type !== "checkbox" && target.type !== "radio" && target.type !== "button";
    return false;
  }

  function requestDeleteSelectedHistoryBatches() {
    if (!isHistorySelectionMode || selectedHistoryBatchIds.length === 0) return;
    setDeleteMessage("");
    setDeleteStatus("idle");
    setDeleteConfirmationOpen(true);
  }

  function handleProductionHistoryKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Delete" || isEditableHistoryKeyTarget(event.target)) return;
    if (!isHistorySelectionMode || selectedHistoryBatchIds.length === 0) return;
    event.preventDefault();
    requestDeleteSelectedHistoryBatches();
  }

  async function handleConfirmDeleteHistoryBatches(event: FormEvent) {
    event.preventDefault();
    const batchIds = [...new Set(selectedHistoryBatchIds)];
    if (batchIds.length === 0) {
      setDeleteConfirmationOpen(false);
      return;
    }

    setDeleteStatus("deleting");
    setDeleteMessage("");
    try {
      await deleteProductionBatches(batchIds);
      const nextSelectedBatch = historyBatches.find((batch) => !batchIds.includes(batch.id));
      setSelectedHistoryBatchIds([]);
      setWorkspaceBatchIds((current) => current.filter((batchId) => !batchIds.includes(batchId)));
      setIsHistorySelectionMode(false);
      setDeleteConfirmationOpen(false);
      setSelectedBatchId(nextSelectedBatch?.id ?? "");
      batchIds.forEach((batchId) => {
        queryClient.removeQueries({ queryKey: ["production-consumption-details", batchId] });
        queryClient.removeQueries({ queryKey: ["production-traceability-snapshot", batchId] });
      });
      await onExportStateChanged();
      setPdfStatus("success");
      setPdfMessage(`${batchIds.length} production(s) supprimee(s).`);
      setDeleteStatus("idle");
    } catch (error) {
      console.error("Delete production batches failed", error);
      setDeleteStatus("error");
      setDeleteMessage(formatApiError(error, "Impossible de supprimer les productions selectionnees."));
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
            <div className="production-catalog-tabs" aria-label="Filtres catalogue recettes">
              <div className="production-catalog-tab-row" aria-label="Type produit" role="tablist">
                {[
                  { label: "All", value: "all" as const },
                  { label: typeLabels.semi_finished, value: "semi_finished" as const },
                  { label: typeLabels.finished, value: "finished" as const },
                ].map((option) => (
                  <button
                    aria-selected={recipeTypeFilter === option.value}
                    className={cx(recipeTypeFilter === option.value && "active")}
                    key={option.value}
                    onClick={() => {
                      setRecipeTypeFilter(option.value);
                      setOpenRecipeUsageProductId(null);
                    }}
                    role="tab"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="production-catalog-tab-row categories" aria-label="Categorie produit" role="tablist">
                {[
                  { label: "All", value: "all" as const },
                  ...categoryOptions,
                ].map((option) => (
                  <button
                    aria-selected={recipeCategoryFilter === option.value}
                    className={cx(recipeCategoryFilter === option.value && "active")}
                    key={option.value}
                    onClick={() => {
                      setRecipeCategoryFilter(option.value);
                      setOpenRecipeUsageProductId(null);
                    }}
                    role="tab"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
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
                    selectProductionCatalogProduct(product.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    selectProductionCatalogProduct(product.id);
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
                              selectProductionCatalogProduct(linkedProduct.id);
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
            <div className={cx("production-entry-header", productionEntryBackStack.length > 0 && "has-entry-back")}>
              {productionEntryBackStack.length > 0 ? (
                <button
                  aria-label="Retour au produit precedent"
                  className="production-entry-back-button"
                  onClick={navigateBackProductionEntry}
                  title="Retour"
                  type="button"
                >
                  <AppIcon name="chevronLeft" />
                </button>
              ) : null}
              <div className="production-entry-identity">
                <h2>{selectedProduct?.name ?? "Produit"}</h2>
                <p>{generatedLot || "Lot non genere"}</p>
              </div>
              <div className="production-entry-controls">
                <div className="production-date-control">
                  <span>Date de production</span>
                  <AppDatePicker
                    markedDates={confirmedProductionDateValues}
                    markedDateLabel="Production deja confirmee pour cette date"
                    value={productionDate}
                    onChange={updateProductionDate}
                  />
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
              </div>
              <div className="production-entry-actions">
                <AppButton onClick={returnToProductionOverview} type="button" variant="secondary">
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
                      substitutionProducts: flexibleSubstitutionProducts,
                      onLotChange: (rowKey, component, lotId) => void selectComponentLot(rowKey, component, lotId),
                      onProductChange: (rowKey, component, productId) => void selectComponentProduct(rowKey, component, productId),
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
                <th className="actor-column"></th>
                <th>Produit</th>
                <th>Lot</th>
                <th>Production</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workspaceBatches.length === 0 ? <TableEmpty colSpan={5}>Double-cliquez une production dans l'historique pour l'ajouter ici.</TableEmpty> : null}
              {workspaceBatches.map((batch) => (
                <tr className={cx(batch.id === selectedBatchId && "selected-row")} key={batch.id} onClick={() => setSelectedBatchId(batch.id)}>
                  <td className="actor-cell">
                    <UserProfileAvatar actor={batch.confirmedBy} label="Confirme par" />
                  </td>
                  <td>{batch.productName}</td>
                  <td>
                    <strong>{batch.generatedLot}</strong>
                  </td>
                  <td className="production-history-date-cell">
                    <strong>{formatDate(batch.productionDate)}</strong>
                    <span>Conf. {formatDateTime(batch.confirmedAt ?? batch.createdAt)}</span>
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
          <section className="production-history-slide" onKeyDown={handleProductionHistoryKeyDown}>
            <div className="production-overview-history-header">
              <div className="production-overview-history-titlebar">
                <div>
                  <h2>Historique de production</h2>
                  <p>{historyCountLabel} production(s)</p>
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
                    className={cx("production-history-selection-toggle", isHistorySelectionMode && "active")}
                    compact
                    onClick={toggleHistorySelectionMode}
                    title={isHistorySelectionMode ? "Masquer la selection" : "Selectionner des productions"}
                    type="button"
                    variant="dangerSoft"
                  >
                    <AppIcon name="trash" />
                  </AppButton>
                </div>
              </div>
            </div>
            <div className={cx("production-history-virtual-table", isHistorySelectionMode && "selection-mode")} role="table">
              <div className="production-history-virtual-header" role="row">
                <span aria-hidden="true" role="columnheader"></span>
                {isHistorySelectionMode ? <span aria-hidden="true" role="columnheader"></span> : null}
                <span role="columnheader">Produit</span>
                <span role="columnheader">Type</span>
                <span role="columnheader">Categorie</span>
                <span role="columnheader">Lot</span>
                <span role="columnheader">Production</span>
                <span aria-hidden="true" role="columnheader"></span>
              </div>
              <div className="production-history-virtual-viewport" ref={historyScrollRef}>
                {filteredBatches.length === 0 ? <div className="production-history-virtual-empty">Aucune production enregistree.</div> : null}
                <div className="production-history-virtual-body" style={{ height: historyVirtualizer.getTotalSize() }}>
                  {historyVirtualizer.getVirtualItems().map((virtualRow) => {
                    const batch = filteredBatches[virtualRow.index];
                    if (!batch) return null;
                    return (
                      <div
                        className={cx(
                          "production-history-virtual-row",
                          batch.id === selectedBatchId && "selected-row",
                          batch.exportedAt && "exported-row",
                        )}
                        data-index={virtualRow.index}
                        key={batch.id}
                        onDoubleClick={() => addBatchToWorkspace(batch)}
                        ref={historyVirtualizer.measureElement}
                        role="row"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <span className="actor-cell" role="cell">
                          <UserProfileAvatar actor={batch.confirmedBy} label="Confirme par" />
                        </span>
                        {isHistorySelectionMode ? (
                          <span className="select-column" role="cell">
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
                          </span>
                        ) : null}
                        <span role="cell">{batch.productName}</span>
                        <span role="cell"><ProductTypeBadge type={batch.productType} /></span>
                        <span role="cell">{formatCategory(batch.category)}</span>
                        <span role="cell"><span className="production-history-lot-cell"><strong>{batch.generatedLot}</strong></span></span>
                        <span className="production-history-date-cell" role="cell">
                          <strong>{formatDate(batch.productionDate)}</strong>
                          <span>Conf. {formatDateTime(batch.confirmedAt ?? batch.createdAt)}</span>
                        </span>
                        <span className="production-row-action-cell" role="cell">
                          <button
                            aria-label={`Ouvrir le detail de ${batch.generatedLot}`}
                            className="production-row-action-button"
                            onClick={() => openProductionHistoryDetail(batch.id)}
                            type="button"
                          >
                            <AppIcon name="chevronRight" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
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
    {deleteConfirmationOpen ? (
      <AppDialogShell
        bodyClassName="production-delete-confirmation"
        footer={
          <>
            <AppButton disabled={deleteStatus === "deleting"} onClick={() => setDeleteConfirmationOpen(false)} type="button" variant="secondary">
              Annuler
            </AppButton>
            <AppButton disabled={deleteStatus === "deleting"} type="submit" variant="danger">
              {deleteStatus === "deleting" ? <TraceabilityLoader compact label="Suppression..." /> : "Supprimer"}
            </AppButton>
          </>
        }
        onClose={() => {
          if (deleteStatus !== "deleting") setDeleteConfirmationOpen(false);
        }}
        onSubmit={(event) => void handleConfirmDeleteHistoryBatches(event)}
        title="Supprimer les productions"
      >
        <p>Ces productions seront retirees de l'historique et leurs lots associes seront supprimes si aucun autre schema ne les utilise.</p>
        <ul>
          {selectedHistoryBatches.map((batch) => (
            <li key={batch.id}>
              <strong>{batch.productName}</strong>
              <span>{batch.generatedLot} - {formatDate(batch.productionDate)}</span>
            </li>
          ))}
        </ul>
        {deleteMessage ? <p className="save-message error">{deleteMessage}</p> : null}
      </AppDialogShell>
    ) : null}
    </>
  );
}

function flattenProductionSchemaNodes(nodes: ProductSchemaNode[]): ProductSchemaNode[] {
  return nodes.flatMap((node) => [node, ...flattenProductionSchemaNodes(node.children)]);
}

type ProductionPreviewLot = {
  lotId: string;
  lotNumber: string;
  supplierLot: string | null;
  sourceType: "reception" | "fabrication";
  lotCreatedAt: string;
  productName?: string | null;
};

function uniqueProductionSchemaNodes(nodes: ProductSchemaNode[]): ProductSchemaNode[] {
  const uniqueNodes = new Map<string, ProductSchemaNode>();
  for (const node of flattenProductionSchemaNodes(nodes)) {
    if (!uniqueNodes.has(node.id)) uniqueNodes.set(node.id, node);
  }
  return [...uniqueNodes.values()];
}

function replaceProductionSchemaNode(nodes: ProductSchemaNode[], targetNodeId: string, replacement: ProductSchemaNode): ProductSchemaNode[] {
  return nodes.map((node) =>
    node.id === targetNodeId
      ? replacement
      : {
          ...node,
          children: replaceProductionSchemaNode(node.children, targetNodeId, replacement),
        },
  );
}

function productionSchemaRowKey(node: ProductSchemaNode, parentKey: string, index: number) {
  return parentKey ? `${parentKey}/${node.id}:${index}` : `${node.id}:${index}`;
}

function replaceProductionSchemaNodeByRowKey(
  nodes: ProductSchemaNode[],
  targetRowKey: string,
  replacement: ProductSchemaNode,
  parentKey = "",
): ProductSchemaNode[] {
  return orderProductionSchemaNodes(nodes).map((node, index) => {
    const rowKey = productionSchemaRowKey(node, parentKey, index);
    if (rowKey === targetRowKey) return replacement;
    return {
      ...node,
      children: replaceProductionSchemaNodeByRowKey(node.children, targetRowKey, replacement, rowKey),
    };
  });
}

function keyProductionLotDraftsBySchemaRows(
  node: ProductSchemaNode,
  rowKey: string,
  lotDraftsByProductId: Record<string, ProductionLotDraft>,
  result: Record<string, ProductionLotDraft> = {},
) {
  const draft = lotDraftsByProductId[node.id];
  if (draft) result[rowKey] = draft;
  orderProductionSchemaNodes(node.children).forEach((child, index) =>
    keyProductionLotDraftsBySchemaRows(child, productionSchemaRowKey(child, rowKey, index), lotDraftsByProductId, result),
  );
  return result;
}

function flattenEffectiveProductionComponents(
  drafts: ProductionComponentDraft[],
  lotDraftsByProductId: Record<string, ProductionLotDraft>,
): EffectiveProductionComponent[] {
  const rows: EffectiveProductionComponent[] = [];

  function visit(node: ProductSchemaNode, parentNodeKey: string | null, depth: number, index: number) {
    const nodeKey = productionSchemaRowKey(node, parentNodeKey ?? "", index);
    const draft = lotDraftsByProductId[nodeKey] ?? lotDraftsByProductId[node.id] ?? {
      lots: [],
      selectedProductId: node.id,
      selectedProductName: node.name,
      selectedLotIds: [],
      status: "ready" as const,
    };
    const isSubstitutedSemiFinished = node.type === "semi_finished" && draft.selectedProductId !== node.id;

    rows.push({ node, nodeKey, parentNodeKey, depth, draft });
    if (!isSubstitutedSemiFinished) {
      orderProductionSchemaNodes(node.children).forEach((child, childIndex) => visit(child, nodeKey, depth + 1, childIndex));
    }
  }

  orderProductionComponentDrafts(drafts).forEach((draft, index) => visit(draft.component, null, 1, index));
  return rows;
}

function renderProductionComponentRows({
  depth,
  expandedComponentRows,
  lotDraftsByProductId,
  node,
  substitutionProducts,
  onLotChange,
  onProductChange,
  onNavigateToComponent,
  onToggleExpand,
  rowKey,
}: {
  depth: number;
  expandedComponentRows: Record<string, boolean>;
  lotDraftsByProductId: Record<string, { lots: AvailableLotOption[]; selectedProductId: string; selectedProductName: string; selectedLotIds: string[]; status: "loading" | "ready" | "error" }>;
  node: ProductSchemaNode;
  substitutionProducts: Product[];
  onLotChange: (rowKey: string, component: ProductSchemaNode, lotId: string) => void;
  onProductChange: (rowKey: string, component: ProductSchemaNode, productId: string) => void;
  onNavigateToComponent: (component: ProductSchemaNode) => void;
  onToggleExpand: (rowKey: string) => void;
  rowKey: string;
}) {
  const draft = lotDraftsByProductId[rowKey] ?? lotDraftsByProductId[node.id] ?? { lots: [], selectedProductId: node.id, selectedProductName: node.name, selectedLotIds: [], status: "ready" as const };
  const selectedLot = draft.lots.find((lot) => draft.selectedLotIds.includes(lot.id)) ?? null;
  const isSubstitutedSemiFinished = node.type === "semi_finished" && draft.selectedProductId !== node.id;
  const isExpandable = node.type === "semi_finished" && node.children.length > 0;
  const isExpanded = Boolean(expandedComponentRows[rowKey]);
  const componentSubstitutionProducts = getComponentSubstitutionProducts(node, substitutionProducts);
  const canSubstituteComponent = componentSubstitutionProducts.length > 1;
  const substitutionOptions = componentSubstitutionProducts.map((product) => ({ value: product.id, label: product.name }));
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
          {canSubstituteComponent ? (
            <ProductionComponentSubstitutionDropdown
              onChange={(productId) => onProductChange(rowKey, node, productId)}
              options={substitutionOptions}
              value={draft.selectedProductId}
            />
          ) : node.type === "semi_finished" ? (
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
        <ProductionLotDropdown draft={draft} onChange={(lotId) => onLotChange(rowKey, node, lotId)} selectedLot={selectedLot} />
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
          substitutionProducts,
          onLotChange,
          onProductChange,
          onNavigateToComponent,
          onToggleExpand,
          rowKey: `${rowKey}/${child.id}:${index}`,
        }),
      ),
    );
  }

  return rows;
}

function ProductionComponentSubstitutionDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ComboOption<T>[];
  onChange: (value: T) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? null;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, []);

  return (
    <div className="production-component-substitution" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        className="production-component-substitution-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <strong>{selectedOption?.label ?? "Selectionner"}</strong>
        <span className="production-component-substitution-icon" aria-hidden="true">
          <AppIcon name="chevronDown" />
        </span>
      </button>
      {isOpen ? (
        <div className="production-component-substitution-menu">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className="production-component-substitution-option"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              type="button"
            >
              <span>{option.label}</span>
              {option.value === value ? <AppIcon name="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  lotsByProductId: Record<string, ProductionPreviewLot[]>;
  node: ProductSchemaNode;
  onToggleExpand: (rowKey: string) => void;
  rowKey: string;
}) {
  const lots = lotsByProductId[node.id] ?? [];
  const selectedLot = lots[0] ?? null;
  const isExpandable = node.type === "semi_finished" && node.children.length > 0;
  const isExpanded = Boolean(expandedPreviewRows[rowKey]);
  const componentName = selectedLot?.productName ? selectedLot.productName : node.name;
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
          <strong>{componentName}</strong>
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
  return rows.reduce<Record<string, ProductionPreviewLot[]>>((groups, row) => {
    const productRows = groups[row.expectedProductId] ?? [];
    if (!productRows.some((existingRow) => existingRow.lotId === row.lotId)) productRows.push(row);
    groups[row.expectedProductId] = productRows;
    return groups;
  }, {});
}

function groupProductionSnapshotLotsByNodeId(snapshot: ProductionTraceabilitySnapshot) {
  return snapshot.components.reduce<Record<string, ProductionPreviewLot[]>>((groups, node) => {
    groups[node.nodeId] = node.lots.map((lot) => ({
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      supplierLot: lot.supplierLot,
      sourceType: lot.sourceType,
      lotCreatedAt: lot.lotCreatedAt,
      productName: lot.productName,
    }));
    return groups;
  }, {});
}

function buildProductSchemaDiagramFromTraceabilitySnapshot(snapshot: ProductionTraceabilitySnapshot): ProductSchemaDiagram {
  const childrenByParentNodeId = snapshot.components.reduce<Map<string, typeof snapshot.components>>((groups, node) => {
    const parentNodeId = node.parentNodeId || "";
    groups.set(parentNodeId, [...(groups.get(parentNodeId) ?? []), node]);
    return groups;
  }, new Map());
  const auditActor: AuditActor = { id: null, name: null, email: null };

  function toSchemaNode(node: ProductionTraceabilitySnapshot["components"][number]): ProductSchemaNode {
    const children = orderProductionSchemaNodes((childrenByParentNodeId.get(node.nodeId) ?? []).map(toSchemaNode));
    const primaryLot = node.lots[0] ?? null;
    return {
      id: node.nodeId,
      code: node.productId,
      name: node.productName,
      type: node.productType,
      category: primaryLot?.productCategory ?? null,
      unit: "",
      recipeStatus: node.productType === "raw" ? "not_required" : children.length > 0 ? "active" : "missing",
      componentCount: children.length,
      componentNames: children.map((child) => child.name),
      lotZone: null,
      lotCode: null,
      createdBy: auditActor,
      updatedBy: auditActor,
      schemaUpdatedBy: auditActor,
      schemaUpdatedAt: null,
      lastUpdated: primaryLot?.lotCreatedAt ?? "",
      stock: null,
      children,
    };
  }

  const rootNodes = [
    ...(childrenByParentNodeId.get(snapshot.root.productId) ?? []),
    ...(childrenByParentNodeId.get("") ?? []),
  ];
  const components = orderProductionSchemaNodes(
    [...new Map(rootNodes.map((node) => [node.nodeId, node])).values()].map(toSchemaNode),
  );

  return {
    recipeId: null,
    components,
    diagramProducts: flattenProductionSchemaNodes(components).map((node) => ({
      id: node.id,
      code: node.code,
      name: node.name,
      type: node.type,
      category: node.category,
      unit: node.unit,
      recipeStatus: node.recipeStatus,
      componentCount: node.componentCount,
      componentNames: node.componentNames,
      lotZone: node.lotZone,
      lotCode: node.lotCode,
      createdBy: node.createdBy,
      updatedBy: node.updatedBy,
      schemaUpdatedBy: node.schemaUpdatedBy,
      schemaUpdatedAt: node.schemaUpdatedAt,
      lastUpdated: node.lastUpdated,
    })),
    diagramNodes: snapshot.diagram.nodes,
    diagramEdges: snapshot.diagram.edges,
    diagramViewport: snapshot.diagram.viewport,
  };
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

function getFlexibleRawMaterialSubstitutionGroup(product: Pick<Product, "name" | "type">) {
  if (product.type !== "raw") return null;
  return flexibleRawMaterialSubstitutionGroupByName.get(normalizeSearchText(product.name)) ?? null;
}

function getFlexibleSemiFinishedSubstitutionGroup(product: Pick<Product, "name" | "type">) {
  if (product.type !== "semi_finished") return null;
  const normalizedName = normalizeSearchText(product.name);
  return flexibleSemiFinishedSubstitutionGroups.find((group) => normalizedName.includes(group.searchTerm))?.key ?? null;
}

function getFlexibleComponentSubstitutionGroup(product: Pick<Product, "name" | "type">): FlexibleSubstitutionGroup | null {
  return getFlexibleRawMaterialSubstitutionGroup(product) ?? getFlexibleSemiFinishedSubstitutionGroup(product);
}

function isFlexibleSubstitutionProduct(product: Pick<Product, "name" | "type">) {
  return Boolean(getFlexibleComponentSubstitutionGroup(product));
}

function getFlexibleSubstitutionProducts(products: Product[]) {
  const productsByName = new Map(products.filter(isFlexibleSubstitutionProduct).map((product) => [normalizeSearchText(product.name), product]));
  const rawProducts = flexibleRawMaterialSubstitutionGroups.flatMap((group) =>
    group.names.flatMap((name) => {
      const product = productsByName.get(normalizeSearchText(name));
      return product ? [product] : [];
    }),
  );
  const semiFinishedProducts = flexibleSemiFinishedSubstitutionGroups.flatMap((group) =>
    products
      .filter((product) => getFlexibleSemiFinishedSubstitutionGroup(product) === group.key && product.recipeStatus === "active")
      .sort((left, right) => left.name.localeCompare(right.name, "fr")),
  );
  return [...new Map([...rawProducts, ...semiFinishedProducts].map((product) => [product.id, product])).values()];
}

function getComponentSubstitutionProducts(component: ProductSchemaNode, substitutionProducts: Product[]) {
  const substitutionGroup = getFlexibleComponentSubstitutionGroup(component);
  if (!substitutionGroup) return [component];

  const rawGroup = flexibleRawMaterialSubstitutionGroups.find((candidate) => candidate.key === substitutionGroup);
  if (!rawGroup) {
    const groupProducts = substitutionProducts
      .filter((product) => getFlexibleComponentSubstitutionGroup(product) === substitutionGroup)
      .sort((left, right) => left.name.localeCompare(right.name, "fr"));
    return groupProducts.length > 0 ? groupProducts : [component];
  }

  const productsByName = new Map(
    substitutionProducts
      .filter((product) => getFlexibleComponentSubstitutionGroup(product) === substitutionGroup)
      .map((product) => [normalizeSearchText(product.name), product]),
  );
  const groupProducts = rawGroup.names.flatMap((name) => {
    const product = productsByName.get(normalizeSearchText(name));
    return product ? [product] : [];
  });

  return groupProducts.length > 0 ? groupProducts : [component];
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
  const label = selectedLot ? renderAvailableLotText(selectedLot) : <span className="production-lot-placeholder">Aucun lot disponible</span>;

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
              {renderAvailableLotText(lot)}
              {selectedLot?.id === lot.id ? <AppIcon name="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderAvailableLotText(lot: AvailableLotOption) {
  const responsibleName = lot.sourceType === "fabrication" ? lot.responsibleName : null;
  return renderLotText(lot.supplierLot || lot.lotNumber, lot.createdAt, responsibleName);
}

function renderLotText(lotNumber: string, dateValue: string, responsibleName?: string | null) {
  const cleanedResponsibleName = responsibleName?.trim();
  return (
    <span className="production-lot-label">
      <strong>{lotNumber}</strong>
      <span>| {formatDate(dateValue)}</span>
      {cleanedResponsibleName ? <span className="production-lot-responsible">| {cleanedResponsibleName}</span> : null}
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
          <AppButton onClick={onCreate} type="button">
            Creer
          </AppButton>
        </div>
      </header>

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
            {saveStatus === "saving" ? <TraceabilityLoader compact label="Enregistrement..." /> : "Enregistrer"}
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
              <th className="actor-column"></th>
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
              <TableEmpty colSpan={11}>Aucun produit trouve dans Supabase.</TableEmpty>
            ) : null}
            {filteredProducts.map((product) => (
              <tr className={cx(product.id === selectedProductId && "selected-row")} key={product.id}>
                <td className="actor-cell">
                  <UserProfileAvatar
                    actor={
                      product.type !== "raw" && (product.schemaUpdatedBy.id || product.schemaUpdatedBy.email || product.schemaUpdatedBy.name)
                        ? product.schemaUpdatedBy
                        : product.updatedBy.id || product.updatedBy.email || product.updatedBy.name
                          ? product.updatedBy
                          : product.createdBy
                    }
                    label={product.type !== "raw" && product.recipeStatus === "active" ? "Schema enregistre par" : "Modifie par"}
                  />
                </td>
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
                <td>{formatDate(product.type !== "raw" && product.schemaUpdatedAt ? product.schemaUpdatedAt : product.lastUpdated)}</td>
                <td>
                  <button className="table-link" disabled={product.type === "raw"} onClick={() => onSelect(product)} type="button">
                    {product.type === "raw" ? "Composant" : product.recipeStatus === "active" ? "Modifier" : "Creer"}
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
  return Boolean(valueSuggestions[column]?.length) || column === "components" || column === "componentCount" || dateHelperColumns.includes(column);
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
  if (filter.column === "components" || filter.column === "componentCount") {
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
    components: product.componentNames,
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
    components: [],
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
  const [selectedSupplierId, setSelectedSupplierId] = usePersistentState("suppliers.selectedSupplierId", suppliers[0]?.id ?? "");
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [supplierSearch, setSupplierSearch] = usePersistentState("suppliers.supplierSearch", "");
  const [supplierMaterialSearch, setSupplierMaterialSearch] = usePersistentState("suppliers.supplierMaterialSearch", "");
  const [activeTab, setActiveTab] = usePersistentState<SupplierTab>("suppliers.activeTab", "materials");
  const [formMode, setFormMode] = usePersistentState<"create" | "edit" | null>("suppliers.formMode", null);
  const [supplierForm, setSupplierForm] = usePersistentState<SupplierFormState>("suppliers.supplierForm", { name: "", contact: "" });
  const [materialModalOpen, setMaterialModalOpen] = usePersistentState("suppliers.materialModalOpen", false);
  const [rawMaterialForm, setRawMaterialForm] = usePersistentState<RawMaterialFormState>("suppliers.rawMaterialForm", { name: "", unit: "kg" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const hasMountedSupplierSelectionRef = useRef(false);

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
    if (!hasMountedSupplierSelectionRef.current) {
      hasMountedSupplierSelectionRef.current = true;
      return;
    }
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

type ProductLotOption = {
  id: string;
  lotNumber: string;
  supplierLot: string | null;
  sourceId: string | null;
  dateValue: string;
  actor: AuditActor;
};

function TraceabilityLotDropdown({
  lots,
  onSelectLot,
  selectedLot,
}: {
  lots: ProductLotOption[];
  onSelectLot: (lot: ProductLotOption) => void;
  selectedLot: ProductLotOption | null;
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

  const disabled = lots.length === 0;
  const label = selectedLot ? (
    renderLotText(selectedLot.supplierLot || selectedLot.lotNumber, selectedLot.dateValue)
  ) : (
    <span className="production-lot-placeholder">Aucun lot disponible</span>
  );

  return (
    <div className="production-lot-dropdown" ref={rootRef}>
      <button className="production-lot-trigger" disabled={disabled} onClick={() => setIsOpen((current) => !current)} type="button">
        {label}
        {disabled ? null : <AppIcon name="chevronDown" />}
      </button>
      {isOpen && !disabled ? (
        <div className="production-lot-menu">
          {lots.map((lot) => (
            <button
              aria-selected={selectedLot?.id === lot.id}
              className="production-lot-option"
              key={lot.id}
              onClick={() => {
                onSelectLot(lot);
                setIsOpen(false);
              }}
              type="button"
            >
              {renderLotText(lot.supplierLot || lot.lotNumber, lot.dateValue)}
              {selectedLot?.id === lot.id ? <AppIcon name="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TraceabilityModule({
  products,
  productionBatches,
  receptionBatches,
}: {
  products: Product[];
  productionBatches: ProductionBatch[];
  receptionBatches: ReceptionBatch[];
}) {
  const [columnFilters, setColumnFilters] = usePersistentState<ProductColumnFilter[]>("traceability.columnFilters", []);
  const [selectedLotIdsByProductId, setSelectedLotIdsByProductId] = usePersistentState<Record<string, string>>("traceability.selectedLotIds", {});
  const [fetchedLotsByProductId, setFetchedLotsByProductId] = useState<Record<string, ProductLotHistoryItem[]>>({});
  const [traceabilityPdfStatus, setTraceabilityPdfStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [traceabilityPdfMessage, setTraceabilityPdfMessage] = useState("");
  const [traceabilityPdfAlert, setTraceabilityPdfAlert] = useState<{ filePath: string; description: string } | null>(null);

  const componentFilterSuggestions = useMemo(() => {
    return [...new Set(products.flatMap((product) => product.componentNames))].sort((left, right) => left.localeCompare(right, "fr"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => matchesProductColumnFilters(product, columnFilters));
  }, [columnFilters, products]);

  useEffect(() => {
    let cancelled = false;
    const productsMissingLotHistory = filteredProducts.filter((product) => !(product.id in fetchedLotsByProductId));

    if (productsMissingLotHistory.length === 0) return;

    async function loadLots() {
      try {
        const nextMap: Record<string, ProductLotHistoryItem[]> = {};
        await Promise.all(
          productsMissingLotHistory.map(async (product) => {
            const lots = await fetchLotHistoryForProduct(product.id, 50);
            nextMap[product.id] = lots;
          })
        );
        if (!cancelled) {
          setFetchedLotsByProductId((current) => ({ ...current, ...nextMap }));
        }
      } catch (error) {
        console.error("Traceability lot history load failed", error);
      }
    }

    void loadLots();

    return () => {
      cancelled = true;
    };
  }, [fetchedLotsByProductId, filteredProducts]);

  function productionBatchesForProduct(productId: string) {
    return productionBatches
      .filter((batch) => batch.productId === productId && batch.status === "validated")
      .sort((left, right) => {
        const leftDate = left.productionDate || left.confirmedAt || left.createdAt;
        const rightDate = right.productionDate || right.confirmedAt || right.createdAt;
        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      });
  }

  function buildTraceabilityLotOptionsForProduct(
    product: Product,
    lotsByProductId: Record<string, ProductLotHistoryItem[]>,
  ) {
    const isManufactured = product.type !== "raw";
    const dbLots = lotsByProductId[product.id] ?? [];
    const lotOptions: ProductLotOption[] = [];
    const seenLotIds = new Set<string>();

    if (dbLots.length > 0) {
      for (const lot of dbLots) {
        seenLotIds.add(lot.id);
        lotOptions.push({
          id: lot.id,
          lotNumber: lot.supplierLot || lot.lotNumber,
          supplierLot: lot.supplierLot,
          sourceId: lot.sourceId,
          dateValue: lot.createdAt,
          actor: lot.actor,
        });
      }
    }

    if (isManufactured && dbLots.length === 0) {
      for (const batch of productionBatchesForProduct(product.id)) {
        if (!seenLotIds.has(batch.id)) {
          seenLotIds.add(batch.id);
          lotOptions.push({
            id: batch.id,
            lotNumber: batch.generatedLot,
            supplierLot: null,
            sourceId: batch.id,
            dateValue: batch.productionDate || batch.confirmedAt || batch.createdAt,
            actor: batch.confirmedBy,
          });
        }
      }
    }

    return lotOptions;
  }

  function selectedTraceabilityLotForProduct(product: Product, lotOptions: ProductLotOption[]) {
    const selectedLotId = selectedLotIdsByProductId[product.id] ?? lotOptions[0]?.id ?? "";
    return lotOptions.find((lot) => lot.id === selectedLotId) ?? lotOptions[0] ?? null;
  }

  function buildTraceabilityPdfRows(lotsByProductId: Record<string, ProductLotHistoryItem[]>) {
    return filteredProducts.flatMap((product): TraceabilityLotsPdfRow[] => {
      const lotOptions = buildTraceabilityLotOptionsForProduct(product, lotsByProductId);
      const selectedLot = selectedTraceabilityLotForProduct(product, lotOptions);
      const lotNumber = selectedLot?.supplierLot || selectedLot?.lotNumber;
      return lotNumber ? [{ lotNumber, productName: product.name }] : [];
    });
  }

  function formatTraceabilityPdfFilterValue(filter: ProductColumnFilter) {
    const value = filter.value.trim();
    const normalizedValue = normalizeSearchText(value);

    if (filter.column === "type") {
      const typeMatch = Object.entries(typeLabels).find(([key, label]) =>
        [key, label].some((candidate) => normalizeSearchText(candidate).includes(normalizedValue)),
      );
      return typeMatch ? typeMatch[1] : value;
    }

    if (filter.column === "category") {
      const categoryMatch = Object.entries(categoryLabels).find(([key, label]) =>
        [key, label].some((candidate) => normalizeSearchText(candidate).includes(normalizedValue)),
      );
      return categoryMatch ? categoryMatch[1] : value;
    }

    if (filter.column === "recipeStatus") {
      const recipeMatch = Object.entries(recipeLabels).find(([key, label]) =>
        [key, label].some((candidate) => normalizeSearchText(candidate).includes(normalizedValue)),
      );
      return recipeMatch ? recipeMatch[1] : value;
    }

    return value;
  }

  function buildTraceabilityPdfFilterSummary() {
    const activeFilters = columnFilters.filter((filter) => normalizeSearchText(filter.value));
    if (activeFilters.length === 0) return "Filtres: Tous les produits affiches";

    const segments = activeFilters.map((filter) => {
      const option = productColumnFilterOptions.find((item) => item.key === filter.column);
      return `${option?.label ?? filter.column} = ${formatTraceabilityPdfFilterValue(filter)}`;
    });
    return `Filtres: ${segments.join(" | ")}`;
  }

  async function handleExportTraceabilityLotsPdf() {
    if (filteredProducts.length === 0) {
      setTraceabilityPdfStatus("error");
      setTraceabilityPdfMessage("Aucun produit filtre a exporter.");
      setTraceabilityPdfAlert(null);
      return;
    }

    setTraceabilityPdfStatus("exporting");
    setTraceabilityPdfMessage("");
    setTraceabilityPdfAlert(null);

    try {
      const productsMissingLotHistory = filteredProducts.filter((product) => !(product.id in fetchedLotsByProductId));
      const fetchedMissingLots = await Promise.all(
        productsMissingLotHistory.map(async (product) => [product.id, await fetchLotHistoryForProduct(product.id, 50)] as const),
      );
      const lotsByProductId = {
        ...fetchedLotsByProductId,
        ...Object.fromEntries(fetchedMissingLots),
      };

      if (fetchedMissingLots.length > 0) {
        setFetchedLotsByProductId((current) => ({ ...current, ...Object.fromEntries(fetchedMissingLots) }));
      }

      const rows = buildTraceabilityPdfRows(lotsByProductId);
      if (rows.length === 0) {
        setTraceabilityPdfStatus("error");
        setTraceabilityPdfMessage("Aucun lot confirme trouve pour les produits filtres.");
        return;
      }

      const result = await downloadTraceabilityLotsPdf(rows, buildTraceabilityPdfFilterSummary());
      const location = "filePath" in result ? result.filePath : "telechargement lance";
      setTraceabilityPdfStatus("success");
      const exportedFilePath = "filePath" in result ? result.filePath : "";
      if (exportedFilePath) {
        setTraceabilityPdfMessage("");
        setTraceabilityPdfAlert({
          filePath: exportedFilePath,
          description: `PDF des lots exporte: ${location}`,
        });
      } else {
        setTraceabilityPdfMessage(`PDF des lots exporte: ${location}`);
      }
    } catch (error) {
      console.error("Traceability lots PDF export failed", error);
      setTraceabilityPdfStatus("error");
      setTraceabilityPdfMessage(formatApiError(error, "Impossible d'exporter le PDF des lots."));
      setTraceabilityPdfAlert(null);
    }
  }

  async function handleOpenTraceabilityLotsPdfAlert() {
    if (!traceabilityPdfAlert) return;

    try {
      await openProductionPdfFile(traceabilityPdfAlert.filePath);
    } catch (error) {
      console.error("Open traceability lots PDF failed", error);
      setTraceabilityPdfStatus("error");
      setTraceabilityPdfMessage(formatApiError(error, "Impossible d'ouvrir le PDF."));
    }
  }

  return (
    <>
      <main className="page">
      {traceabilityPdfMessage ? (
        <p className={cx("save-message traceability-pdf-message", traceabilityPdfStatus === "error" ? "error" : "success")}>
          {traceabilityPdfMessage}
        </p>
      ) : null}
      <AppCard className="product-table-panel">
        <div className="product-search-row traceability-export-row">
          <AppButton compact disabled={traceabilityPdfStatus === "exporting" || filteredProducts.length === 0} onClick={() => void handleExportTraceabilityLotsPdf()} type="button" variant="secondary">
            {traceabilityPdfStatus === "exporting" ? <TraceabilityLoader compact label="Export..." /> : "Generer PDF"}
          </AppButton>
          <ProductColumnFilterBar
            componentSuggestions={componentFilterSuggestions}
            filters={columnFilters}
            onFiltersChange={setColumnFilters}
            placeholder="Filtrer par produit, type, catégorie, lot..."
          />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="actor-column"></th>
                <th>Produit</th>
                <th>Type</th>
                <th>Catégorie</th>
                <th>Composants</th>
                <th>Confirmé / Réceptionné</th>
                <th>Lot</th>
                <th>R.Q</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <TableEmpty colSpan={8}>Aucun produit trouvé.</TableEmpty>
              ) : null}
              {filteredProducts.map((product) => {
                const isManufactured = product.type !== "raw";

                const prodBatchesForProduct = productionBatchesForProduct(product.id);
                const lotOptions = buildTraceabilityLotOptionsForProduct(product, fetchedLotsByProductId);
                const selectedLot = selectedTraceabilityLotForProduct(product, lotOptions);

                const rqActor =
                  selectedLot?.actor && (selectedLot.actor.name || selectedLot.actor.email)
                    ? selectedLot.actor
                    : isManufactured
                      ? (prodBatchesForProduct[0]?.confirmedBy ?? product.schemaUpdatedBy ?? product.updatedBy ?? product.createdBy)
                      : (product.updatedBy ?? product.createdBy);

                const countLabel = isManufactured
                  ? `${prodBatchesForProduct.length}`
                  : `${lotOptions.length}`;

                return (
                  <tr key={product.id}>
                    <td className="actor-cell">
                      <UserProfileAvatar actor={rqActor} label="Responsable Qualité" />
                    </td>
                    <td>
                      <div className="product-table-identity">
                        <strong>{product.name}</strong>
                        {product.code ? <span className="muted">{product.code}</span> : null}
                      </div>
                    </td>
                    <td>
                      <ProductTypeBadge type={product.type} />
                    </td>
                    <td>{formatCategory(product.category)}</td>
                    <td>
                      {isManufactured ? (
                        <span className="badge muted">{product.componentNames.length} composant(s)</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={cx("badge", isManufactured ? "success" : "info")}>{countLabel}</span>
                    </td>
                    <td>
                      <TraceabilityLotDropdown
                        lots={lotOptions}
                        onSelectLot={(lot) =>
                          setSelectedLotIdsByProductId((current) => ({ ...current, [product.id]: lot.id }))
                        }
                        selectedLot={selectedLot}
                      />
                    </td>
                    <td>
                      <div className="actor-name-cell">
                        <strong>{rqActor.name || rqActor.email || "Système"}</strong>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AppCard>
      </main>
      {traceabilityPdfAlert ? (
        <div aria-live="polite" className="production-pdf-alert" role="status">
          <div className="production-pdf-alert-content">
            <strong>PDF exporte</strong>
            <p>{traceabilityPdfAlert.description}</p>
          </div>
          <AppButton compact onClick={() => void handleOpenTraceabilityLotsPdfAlert()} type="button">
            Open
          </AppButton>
          <AppButton
            aria-label="Fermer l'alerte PDF"
            compact
            onClick={() => setTraceabilityPdfAlert(null)}
            title="Fermer"
            type="button"
            variant="secondary"
          >
            <AppIcon name="x" />
          </AppButton>
        </div>
      ) : null}
    </>
  );
}

function AutomationNotificationBanner({
  notifications,
  onDismiss,
  onClearAll,
}: {
  notifications: AutomationNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}) {
  const activeNotifs = notifications.filter((n) => !n.dismissed).slice(0, 3);
  if (activeNotifs.length === 0) return null;

  return (
    <div className="automation-notification-container">
      {activeNotifs.map((notif) => (
        <div className={cx("automation-notification-banner", notif.status)} key={notif.id}>
          <div className="automation-notification-content">
            <span className="automation-notification-badge">
              {notif.status === "success" ? "🟢" : notif.status === "warning" ? "⚠️" : "🔴"}
            </span>
            <div>
              <strong>{notif.title}</strong>
              <p>{notif.message}</p>
            </div>
          </div>
          <button className="automation-notification-close" onClick={() => onDismiss(notif.id)} type="button">
            <AppIcon name="x" />
          </button>
        </div>
      ))}
      {notifications.length > 1 ? (
        <button className="automation-notification-clear-all" onClick={onClearAll} type="button">
          Effacer les notifications
        </button>
      ) : null}
    </div>
  );
}

function RuleEditModal({
  eligibleProducts,
  initialRule,
  onClose,
  onSave,
}: {
  eligibleProducts: Product[];
  initialRule: ScheduledRule | null;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    productId: string;
    productName: string;
    productType: "semi_finished" | "finished";
    frequency: ScheduleFrequency;
    intervalDays?: number;
    daysOfWeek?: number[];
  }) => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState(initialRule?.productId ?? eligibleProducts[0]?.id ?? "");
  const [frequency, setFrequency] = useState<ScheduleFrequency>(initialRule?.frequency ?? "daily");
  const [intervalDays, setIntervalDays] = useState(initialRule?.intervalDays ?? 2);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initialRule?.daysOfWeek ?? [1, 2, 3, 4, 5]);

  const selectedProduct = eligibleProducts.find((p) => p.id === selectedProductId) ?? eligibleProducts[0] ?? null;

  function toggleDay(day: number) {
    setDaysOfWeek((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedProduct) return;

    onSave({
      id: initialRule?.id,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      productType: selectedProduct.type as "semi_finished" | "finished",
      frequency,
      intervalDays,
      daysOfWeek,
    });
  }

  const nextPreview = useMemo(() => {
    return computeNextRunAt({
      frequency,
      intervalDays,
      daysOfWeek,
      lastRunAt: null,
    });
  }, [daysOfWeek, frequency, intervalDays]);

  return (
    <AppDialogShell
      footer={
        <>
          <AppButton onClick={onClose} type="button" variant="secondary">
            Annuler
          </AppButton>
          <AppButton disabled={!selectedProduct} type="submit">
            {initialRule ? "Enregistrer les modifications" : "Créer la règle"}
          </AppButton>
        </>
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      title={initialRule ? "Modifier la règle de planification" : "Nouvelle règle de planification"}
    >
      <div className="product-create-grid">
        <Field label="Produit à confirmer automatiquement">
          <select
            className="app-select"
            onChange={(e) => setSelectedProductId(e.target.value)}
            value={selectedProductId}
          >
            {eligibleProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.type === "finished" ? "Produit Fini" : "Semi-Fini"})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fréquence de confirmation">
          <select
            className="app-select"
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
            value={frequency}
          >
            <option value="daily">Chaque jour (quotidien)</option>
            <option value="weekdays">Jours ouvrables (Du lundi au vendredi)</option>
            <option value="every_n_days">Tous les N jours (ex: tous les 2 jours)</option>
            <option value="specific_days">Jours spécifiques de la semaine</option>
          </select>
        </Field>

        {frequency === "every_n_days" ? (
          <Field label="Intervalle (nombre de jours)">
            <input
              max={30}
              min={1}
              onChange={(e) => setIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
              type="number"
              value={intervalDays}
            />
          </Field>
        ) : null}

        {frequency === "specific_days" ? (
          <Field label="Jours d'exécution">
            <div className="day-picker-group">
              {[
                { day: 1, label: "Lun" },
                { day: 2, label: "Mar" },
                { day: 3, label: "Mer" },
                { day: 4, label: "Jeu" },
                { day: 5, label: "Ven" },
                { day: 6, label: "Sam" },
                { day: 0, label: "Dim" },
              ].map(({ day, label }) => (
                <button
                  className={cx("day-picker-btn", daysOfWeek.includes(day) && "selected")}
                  key={day}
                  onClick={() => toggleDay(day)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        ) : null}

        <div className="schedule-preview-box">
          <AppIcon name="calendar" />
          <div>
            <strong>Prochaine exécution prévue :</strong>
            <p>{formatDate(nextPreview)}</p>
          </div>
        </div>
      </div>
    </AppDialogShell>
  );
}

type PreparedPlanningBundle = {
  series: ProductionPlanSeriesInput[];
  plans: ProductionPlanOccurrenceInput[];
  dependencies: ProductionPlanDependencyInput[];
  unresolved: string[];
  manufacturedProducts: Product[];
  eligibleLots: PlanningEligibleLot[];
};

type ProductPlanningSchedule = {
  frequency: PlanningFrequency;
  intervalDays: number;
  daysOfWeek: number[];
};

const planningFrequencyOptions: Array<{ value: PlanningFrequency; label: string }> = [
  { value: "once", label: "Une seule fois" },
  { value: "daily", label: "Chaque jour" },
  { value: "weekdays", label: "Jours ouvrables" },
  { value: "every_n_days", label: "Tous les N jours" },
  { value: "specific_days", label: "Jours specifiques" },
];

const planningStatusLabels: Record<ProductionPlan["derivedStatus"], string> = {
  blocked: "Bloque",
  waiting: "En attente",
  ready: "Pret",
  overdue: "En retard",
  recipe_changed: "Recette modifiee",
  completed: "Termine",
  cancelled: "Annule",
};

function addPlanningDays(value: string, days: number) {
  const date = parseInputDate(value) ?? new Date();
  date.setDate(date.getDate() + days);
  return toInputDateValue(date);
}

function collectPlanningSchemaMap(rootProductId: string, rootComponents: ProductSchemaNode[]) {
  const componentsByProductId = new Map<string, ProductSchemaNode[]>();
  componentsByProductId.set(rootProductId, rootComponents);

  function visit(nodes: ProductSchemaNode[]) {
    for (const node of nodes) {
      if (node.type !== "semi_finished" || node.recipeStatus !== "active" || componentsByProductId.has(node.id)) continue;
      componentsByProductId.set(node.id, node.children);
      visit(node.children);
    }
  }

  visit(rootComponents);
  return componentsByProductId;
}

function buildPlanningSchemaSnapshot(recipe: ActiveRecipeMetadata, components: ProductSchemaNode[]) {
  return {
    recipeUpdatedAt: recipe.updatedAt,
    components: orderProductionSchemaNodes(components).map((component) => ({
      id: component.id,
      name: component.name,
      type: component.type,
    })),
  };
}

type PlanningSeriesSummary = {
  seriesId: string;
  planName: string;
  productId: string;
  productName: string;
  productType: Exclude<ProductType, "raw">;
  productCategory: ProductCategory | null;
  startDate: string;
  endDate: string;
  frequency: PlanningFrequency;
  intervalDays: number;
  daysOfWeek: number[];
  occurrenceCount: number;
  nextDate: string | null;
  nextPlanId: string;
  status: ProductionPlan["derivedStatus"];
  firstPlanId: string;
  responsibleName: string | null;
  seriesStatus: ProductionPlan["seriesStatus"];
};

type PlanningComponentSourceSelection = {
  productId?: string;
  lotId?: string;
  seriesId?: string;
};

type PlanningTimelineNodeData = { label?: ReactNode; kind: "day" | ProductType | "weekSeparator" };
type PlanningTimelineNode = FlowNode<PlanningTimelineNodeData, "planningDay" | "planningProduct" | "planningWeekSeparator">;
type PlanningTimelineEdge = Edge<Record<string, unknown>, "smoothstep" | "straight">;
const planningTimelineNodeTypes = {
  planningDay: PlanningDayNode,
  planningProduct: PlanningProductNode,
  planningWeekSeparator: PlanningWeekSeparatorNode,
};
const planningTimelineDayStepX = 252;
const planningTimelineNodeWidth = 196;
const planningTimelineWeekSeparatorWidth = 3;
const planningTimelineInitialPastDays = 60;
const planningTimelineInitialFutureDays = 180;
const planningTimelineExtendDays = 90;
const planningTimelineEdgeBufferDays = 14;
const planningTimelineLockedZoom = 0.74;
const planningTimelineDayY = 320;
const planningTimelineDayNodeHeight = 52;
const planningTimelineBottomGap = 4;
const planningMaterializedWindowDays = 90;

function getPlanningTimelineViewport(canvasHeight = 0) {
  const height = canvasHeight || 420;

  return {
    x: 24,
    y: Math.round(height - planningTimelineBottomGap - planningTimelineDayNodeHeight - planningTimelineDayY * planningTimelineLockedZoom),
    zoom: planningTimelineLockedZoom,
  };
}

function PlanificationModuleV2({
  active,
  onOpenConfirmation,
  products,
}: {
  active: boolean;
  products: Product[];
  onOpenConfirmation: (planId: string) => Promise<void>;
}) {
  const eligibleProducts = useMemo(
    () => products.filter((product) => product.type !== "raw" && product.recipeStatus === "active"),
    [products],
  );
  const rawProducts = useMemo(() => products.filter((product) => product.type === "raw"), [products]);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [mutatingSeriesId, setMutatingSeriesId] = useState("");
  const [message, setMessage] = useState("");
  const [screen, setScreen] = useState<"history" | "workspace">("history");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [planName, setPlanName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [startDate, setStartDate] = useState(todayInputValue);
  const [rootFrequency, setRootFrequency] = useState<PlanningFrequency>("daily");
  const [rootIntervalDays, setRootIntervalDays] = useState(2);
  const [rootDaysOfWeek, setRootDaysOfWeek] = useState([1, 2, 3, 4, 5]);
  const [schemaComponents, setSchemaComponents] = useState<ProductSchemaNode[]>([]);
  const [schemaStatus, setSchemaStatus] = useState<"idle" | "loading" | "error">("idle");
  const [eligibleLots, setEligibleLots] = useState<PlanningEligibleLot[]>([]);
  const [sourceSelections, setSourceSelections] = useState<Record<string, PlanningComponentSourceSelection>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const timelineCanvasRef = useRef<HTMLDivElement>(null);
  const timelineFlowRef = useRef<ReactFlowInstance<PlanningTimelineNode, PlanningTimelineEdge> | null>(null);
  const [timelinePastDays, setTimelinePastDays] = useState(planningTimelineInitialPastDays);
  const [timelineFutureDays, setTimelineFutureDays] = useState(planningTimelineInitialFutureDays);
  const [timelineDependencyCache, setTimelineDependencyCache] = useState<Record<string, ProductionPlanDependency[]>>({});

  const seriesSummaries = useMemo(() => groupPlanningSeries(plans), [plans]);
  const selectedProduct = eligibleProducts.find((product) => product.id === selectedProductId) ?? null;
  const visibleDates = useMemo(
    () => getPlanningCalendarDates(startDate, timelinePastDays, timelineFutureDays),
    [startDate, timelineFutureDays, timelinePastDays],
  );
  const timelineDefaultViewport = useMemo(
    () => getPlanningTimelineViewport(timelineCanvasRef.current?.clientHeight),
    [selectedProductId, startDate],
  );
  const filteredSeries = useMemo(() => {
    const query = normalizeSearchText(historySearchTerm);
    return seriesSummaries.filter(
      (series) =>
        !query ||
        normalizeSearchText(series.planName).includes(query) ||
        normalizeSearchText(series.productName).includes(query) ||
        normalizeSearchText(formatCategory(series.productCategory)).includes(query) ||
        normalizeSearchText(formatPlanningFrequency(series)).includes(query),
    );
  }, [historySearchTerm, seriesSummaries]);
  const selectedTimelineRootSeries = useMemo(
    () =>
      Object.values(sourceSelections)
        .flatMap((selection) => seriesSummaries.find((series) => series.seriesId === selection.seriesId) ?? [])
        .filter((series, index, list) => list.findIndex((item) => item.seriesId === series.seriesId) === index),
    [seriesSummaries, sourceSelections],
  );
  const selectedTimelineSeries = useMemo(
    () =>
      collectPlanningTimelineSeries({
        plans,
        rootSeries: selectedTimelineRootSeries,
        seriesSummaries,
        timelineDependencyCache,
      }),
    [plans, selectedTimelineRootSeries, seriesSummaries, timelineDependencyCache],
  );
  const timelineGraph = useMemo(
    () =>
      buildPlanningTimelineGraph({
        rootProduct: selectedProduct,
        rootSchedule: {
          frequency: rootFrequency,
          intervalDays: rootIntervalDays,
          daysOfWeek: rootDaysOfWeek,
        },
        selectedSeries: selectedTimelineSeries,
        startDate,
        visibleDates,
      }),
    [rootDaysOfWeek, rootFrequency, rootIntervalDays, selectedProduct, selectedTimelineSeries, startDate, visibleDates],
  );

  async function loadPlans() {
    setStatus("loading");
    setMessage("");
    try {
      const nextPlans = await fetchProductionPlans();
      setPlans(nextPlans);
      setStatus("idle");
    } catch (error) {
      console.error("Production planning load failed", error);
      setStatus("error");
      setMessage(
        formatApiError(
          error,
          "Impossible de charger la planification. Executez la migration 020_production_planification.sql.",
        ),
      );
    }
  }

  useEffect(() => {
    if (active) void loadPlans();
  }, [active]);

  useEffect(() => {
    if (selectedProductId || eligibleProducts.length === 0) return;
    setSelectedProductId(eligibleProducts[0].id);
  }, [eligibleProducts, selectedProductId]);

  useEffect(() => {
    if (screen !== "workspace" || !selectedProductId) {
      setSchemaComponents([]);
      setEligibleLots([]);
      setSourceSelections({});
      return;
    }

    let cancelled = false;
    async function loadWorkspaceSchema() {
      setSchemaStatus("loading");
      try {
        const components = await fetchProductSchema(selectedProductId);
        if (cancelled) return;
        setSchemaComponents(components);
        setExpandedRows(buildDefaultExpandedProductionRows(components));
        setSourceSelections({});
        setSchemaStatus("idle");
      } catch (error) {
        console.error("Planning workspace schema load failed", error);
        if (!cancelled) {
          setSchemaStatus("error");
          setMessage(formatApiError(error, "Impossible de charger le schema de planification."));
        }
      }
    }

    void loadWorkspaceSchema();
    return () => {
      cancelled = true;
    };
  }, [screen, selectedProductId]);

  useEffect(() => {
    if (screen !== "workspace" || !selectedProductId || schemaComponents.length === 0) {
      setEligibleLots([]);
      return;
    }

    let cancelled = false;
    async function loadEligiblePlanningLots() {
      try {
        const rawCandidates = orderProductionSchemaNodes(schemaComponents)
          .filter((component) => component.type === "raw" && !isWaterComponent(component))
          .flatMap((component) => getComponentSubstitutionProducts(component, rawProducts).map((product) => product.id));
        const lots = await fetchPlanningEligibleLots([...new Set(rawCandidates)], visibleDates[visibleDates.length - 1] ?? todayInputValue);
        if (!cancelled) setEligibleLots(lots);
      } catch (error) {
        console.error("Planning eligible lots load failed", error);
        if (!cancelled) {
          setEligibleLots([]);
          setMessage(formatApiError(error, "Impossible de charger les lots disponibles pour la planification."));
        }
      }
    }

    void loadEligiblePlanningLots();
    return () => {
      cancelled = true;
    };
  }, [rawProducts, schemaComponents, screen, selectedProductId, visibleDates]);

  useEffect(() => {
    if (screen !== "workspace" || selectedTimelineRootSeries.length === 0) {
      setTimelineDependencyCache({});
      return;
    }

    let cancelled = false;
    async function loadTimelineSourceDependencies() {
      const nextCache: Record<string, ProductionPlanDependency[]> = {};
      const pendingPlanIds = selectedTimelineRootSeries.map((series) => series.firstPlanId).filter(Boolean);
      const visitedPlanIds = new Set<string>();

      while (pendingPlanIds.length > 0 && !cancelled) {
        const planId = pendingPlanIds.shift();
        if (!planId || visitedPlanIds.has(planId)) continue;
        visitedPlanIds.add(planId);

        try {
          const dependencies = await fetchProductionPlanDependencies(planId);
          nextCache[planId] = dependencies;

          dependencies.forEach((dependency) => {
            if (dependency.sourceKind !== "planned_production" || !dependency.sourcePlanId) return;
            if (!visitedPlanIds.has(dependency.sourcePlanId)) pendingPlanIds.push(dependency.sourcePlanId);
          });
        } catch (error) {
          console.error("Planning timeline dependency load failed", error);
        }
      }

      if (!cancelled) setTimelineDependencyCache(nextCache);
    }

    void loadTimelineSourceDependencies();
    return () => {
      cancelled = true;
    };
  }, [screen, selectedTimelineRootSeries]);

  useEffect(() => {
    if (screen !== "workspace") return;
    const canvas = timelineCanvasRef.current;
    if (!canvas) return;

    const syncViewport = () => {
      const instance = timelineFlowRef.current;
      if (!instance) return;
      void instance.setViewport(getPlanningTimelineViewport(canvas.clientHeight), { duration: 0 });
    };

    const frame = window.requestAnimationFrame(syncViewport);
    const observer = new ResizeObserver(syncViewport);
    observer.observe(canvas);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [screen, selectedProductId, startDate]);

  function openWorkspace() {
    setPlanName("");
    setStartDate(todayInputValue);
    setRootFrequency("daily");
    setRootIntervalDays(2);
    setRootDaysOfWeek([1, 2, 3, 4, 5]);
    setTimelinePastDays(planningTimelineInitialPastDays);
    setTimelineFutureDays(planningTimelineInitialFutureDays);
    setScreen("workspace");
  }

  function extendTimelineIfNeeded(viewport: { x: number; zoom: number }) {
    const canvasWidth = timelineCanvasRef.current?.clientWidth ?? 0;
    if (canvasWidth <= 0 || visibleDates.length === 0) return;
    const zoom = viewport.zoom || 1;
    const leftWorld = -viewport.x / zoom;
    const rightWorld = (canvasWidth - viewport.x) / zoom;
    const firstDate = visibleDates[0];
    const lastDate = visibleDates[visibleDates.length - 1];
    const firstX = getPlanningDateOffset(startDate, firstDate) * planningTimelineDayStepX;
    const lastX = getPlanningDateOffset(startDate, lastDate) * planningTimelineDayStepX;
    const bufferX = planningTimelineDayStepX * planningTimelineEdgeBufferDays;

    if (leftWorld < firstX + bufferX) {
      setTimelinePastDays((current) => current + planningTimelineExtendDays);
    }
    if (rightWorld > lastX - bufferX) {
      setTimelineFutureDays((current) => current + planningTimelineExtendDays);
    }
  }

  function updateSourceSelection(rowKey: string, patch: PlanningComponentSourceSelection) {
    setSourceSelections((current) => ({
      ...current,
      [rowKey]: {
        ...current[rowKey],
        ...patch,
      },
    }));
  }

  async function saveWorkspacePlan() {
    if (!selectedProduct) {
      setMessage("Selectionnez un produit a planifier.");
      return;
    }
    if (schemaStatus === "loading") {
      setMessage("Attendez le chargement du schema avant d'enregistrer.");
      return;
    }
    if (schemaComponents.length === 0) {
      setMessage("Le produit selectionne ne contient aucun composant planifiable.");
      return;
    }

    setSaveStatus("saving");
    setMessage("");
    try {
      const endDate = addPlanningDays(startDate, planningMaterializedWindowDays - 1);
      const occurrenceDates = expandPlanningSchedule({
        frequency: rootFrequency,
        startDate,
        endDate,
        intervalDays: rootIntervalDays,
        daysOfWeek: rootDaysOfWeek,
      });
      const [recipe] = await fetchActiveRecipeMetadata([selectedProduct.id]);
      if (!recipe) throw new Error(`${selectedProduct.name} n'a pas de recette active exploitable.`);

      const seriesId = crypto.randomUUID();
      const finalPlanName = planName.trim() || `${selectedProduct.name} - ${formatDate(startDate)}`;
      const series: ProductionPlanSeriesInput = {
        id: seriesId,
        planName: finalPlanName,
        productId: selectedProduct.id,
        frequency: rootFrequency,
        intervalDays: rootIntervalDays,
        daysOfWeek: rootDaysOfWeek,
        startDate,
        endDate,
      };
      const plansToCreate: ProductionPlanOccurrenceInput[] = occurrenceDates.map((plannedDate) => ({
        id: crypto.randomUUID(),
        seriesId,
        productId: selectedProduct.id,
        plannedDate,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        schemaSnapshot: buildPlanningSchemaSnapshot(recipe, schemaComponents),
        responsibleName: null,
        notes: null,
      }));
      const directComponents = orderProductionSchemaNodes(schemaComponents);
      const directRawCandidateIds = [
        ...new Set(
          directComponents
            .filter((component) => component.type === "raw")
            .flatMap((component) => getComponentSubstitutionProducts(component, rawProducts).map((product) => product.id)),
        ),
      ];
      const lotsForSave =
        directRawCandidateIds.length > 0 ? await fetchPlanningEligibleLots(directRawCandidateIds, endDate) : [];
      if (directRawCandidateIds.length > 0) setEligibleLots(lotsForSave);
      const dependencies: ProductionPlanDependencyInput[] = [];
      const unresolved: string[] = [];

      for (const plan of plansToCreate) {
        directComponents.forEach((component, componentIndex) => {
          const rowKey = `${component.id}:${componentIndex}`;
          const selection = sourceSelections[rowKey] ?? {};
          if (isWaterComponent(component)) {
            dependencies.push({
              planId: plan.id,
              nodeKey: rowKey,
              parentNodeKey: null,
              depth: 0,
              expectedProductId: component.id,
              selectedProductId: component.id,
              sourceKind: "water",
              sourceLotId: null,
              sourcePlanId: null,
            });
            return;
          }

          if (component.type === "semi_finished") {
            if (!selection.seriesId) {
              unresolved.push(`Selectionnez un plan source pour ${component.name}.`);
              return;
            }
            const sourcePlan = plans
              .filter(
                (candidate) =>
                  candidate.seriesId === selection.seriesId &&
                  candidate.productId === component.id &&
                  candidate.plannedDate <= plan.plannedDate &&
                  candidate.storedStatus !== "cancelled" &&
                  isPlanningSourceStatusUsable(candidate.derivedStatus),
              )
              .sort((left, right) => right.plannedDate.localeCompare(left.plannedDate))[0];
            if (!sourcePlan) {
              unresolved.push(`Aucun plan ${component.name} compatible avant le ${formatDate(plan.plannedDate)}.`);
              return;
            }
            dependencies.push({
              planId: plan.id,
              nodeKey: rowKey,
              parentNodeKey: null,
              depth: 0,
              expectedProductId: component.id,
              selectedProductId: component.id,
              sourceKind: "planned_production",
              sourceLotId: null,
              sourcePlanId: sourcePlan.id,
            });
            return;
          }

          const substitutionProducts = getComponentSubstitutionProducts(component, rawProducts);
          const selectedProductId = substitutionProducts.some((product) => product.id === selection.productId)
            ? selection.productId!
            : component.id;
          const matchingLots = lotsForSave.filter(
            (lot) =>
              lot.productId === selectedProductId &&
              lot.effectiveDate <= plan.plannedDate &&
              (!lot.expiryDate || lot.expiryDate >= plan.plannedDate),
          );
          const selectedLot =
            matchingLots.find((lot) => lot.id === selection.lotId) ??
            [...matchingLots].sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0] ??
            null;
          if (!selectedLot) {
            unresolved.push(`Aucun lot eligible pour ${component.name} le ${formatDate(plan.plannedDate)}.`);
            return;
          }
          dependencies.push({
            planId: plan.id,
            nodeKey: rowKey,
            parentNodeKey: null,
            depth: 0,
            expectedProductId: component.id,
            selectedProductId: selectedLot.productId,
            sourceKind: "raw_lot",
            sourceLotId: selectedLot.id,
            sourcePlanId: null,
          });
        });
      }

      const uniqueUnresolved = [...new Set(unresolved)];
      if (uniqueUnresolved.length > 0) {
        throw new Error(uniqueUnresolved.slice(0, 5).join(" "));
      }

      await createProductionPlanBundle({
        series: [series],
        plans: plansToCreate,
        dependencies,
      });
      await loadPlans();
      setScreen("history");
    } catch (error) {
      console.error("Planning save failed", error);
      setMessage(formatApiError(error, "Impossible d'enregistrer cette planification."));
    } finally {
      setSaveStatus("idle");
    }
  }

  async function pausePlanningSeries(series: PlanningSeriesSummary) {
    if (series.seriesStatus === "paused") return;
    if (!window.confirm(`Mettre en pause la planification "${series.planName}" ?`)) return;

    setMutatingSeriesId(series.seriesId);
    setMessage("");
    try {
      await updateProductionPlanSeriesStatus(series.seriesId, "paused");
      await loadPlans();
    } catch (error) {
      console.error("Planning series pause failed", error);
      setMessage(formatApiError(error, "Impossible de mettre cette planification en pause."));
    } finally {
      setMutatingSeriesId("");
    }
  }

  async function removePlanningSeries(series: PlanningSeriesSummary) {
    const confirmed = window.confirm(
      `Supprimer la planification "${series.planName}" ? Les occurrences non confirmees seront annulees.`,
    );
    if (!confirmed) return;

    setMutatingSeriesId(series.seriesId);
    setMessage("");
    try {
      await archiveProductionPlanSeries(series.seriesId, "Suppression utilisateur");
      await loadPlans();
    } catch (error) {
      console.error("Planning series archive failed", error);
      setMessage(formatApiError(error, "Impossible de supprimer cette planification."));
    } finally {
      setMutatingSeriesId("");
    }
  }

  if (screen === "workspace") {
    return (
      <main className="page planification-page planification-workspace-page">
        <div className="planning-workspace-grid">
          <AppCard className="planning-config-widget">
            <div className="plan-panel-header compact">
              <div>
                <h2>Configuration</h2>
                <p>Plan actif sans date de fin.</p>
              </div>
              <div className="planning-config-actions">
                <AppButton onClick={() => setScreen("history")} type="button" variant="secondary">
                  Retour
                </AppButton>
                <AppButton disabled={saveStatus === "saving" || schemaStatus === "loading"} onClick={() => void saveWorkspacePlan()} type="button">
                  {saveStatus === "saving" ? "Enregistrement..." : "Enregistrer plan"}
                </AppButton>
              </div>
            </div>
            <div className="planning-config-form themed-scrollbar">
              <div className="planning-config-row">
                <Field label="Plan name">
                  <input onChange={(event) => setPlanName(event.target.value)} value={planName} />
                </Field>
                <Field label="Produit">
                  <AppCombobox
                    options={eligibleProducts.map((product) => ({ value: product.id, label: product.name }))}
                    onChange={setSelectedProductId}
                    value={selectedProductId}
                  />
                </Field>
              </div>
              <div className="planning-config-row">
                <Field label="Frequence">
                  <select className="app-select" onChange={(event) => setRootFrequency(event.target.value as PlanningFrequency)} value={rootFrequency}>
                    {planningFrequencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Debut">
                  <AppDatePicker onChange={setStartDate} value={startDate} />
                </Field>
              </div>
              {rootFrequency === "every_n_days" ? (
                <Field label="Intervalle en jours">
                  <input min={1} max={90} onChange={(event) => setRootIntervalDays(Math.max(1, Number(event.target.value)))} type="number" value={rootIntervalDays} />
                </Field>
              ) : null}
              {rootFrequency === "specific_days" ? (
                <div className="planning-weekdays planning-workspace-weekdays">
                  {calendarWeekdays.map((label, index) => {
                    const day = index === 6 ? 0 : index + 1;
                    return (
                      <button
                        className={cx(rootDaysOfWeek.includes(day) && "selected")}
                        key={day}
                        onClick={() => setRootDaysOfWeek((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}
                        type="button"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </AppCard>

          <AppCard className="planning-details-widget">
            <div className="plan-panel-header compact">
              <div>
                <h2>Details</h2>
                <p>{selectedProduct ? selectedProduct.name : "Selectionnez un produit"}</p>
              </div>
              <span className="planning-preview-badge">Preview</span>
            </div>
            <div className="planning-details-scroll themed-scrollbar">
              <table className="app-table production-components-table planning-components-table">
                <thead>
                  <tr>
                    <th>Composant</th>
                    <th>Type</th>
                    <th>Lot / Plan</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {schemaStatus === "loading" ? (
                    <TableEmpty colSpan={4}>Chargement du schema...</TableEmpty>
                  ) : schemaStatus === "error" ? (
                    <TableEmpty colSpan={4}>Impossible de charger ce schema.</TableEmpty>
                  ) : schemaComponents.length === 0 ? (
                    <TableEmpty colSpan={4}>Aucun composant dans ce schema.</TableEmpty>
                  ) : (
                    orderProductionSchemaNodes(schemaComponents).flatMap((component, index) =>
                      renderPlanningComponentRows({
                        component,
                        depth: 0,
                        eligibleLots,
                        expandedRows,
                        products: rawProducts,
                        rowKey: `${component.id}:${index}`,
                        seriesSummaries,
                        sourceSelections,
                        onSourceChange: updateSourceSelection,
                        onToggleExpand: (rowKey) => setExpandedRows((current) => ({ ...current, [rowKey]: !current[rowKey] })),
                      }),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </AppCard>

          <AppCard className="planning-timeline-widget">
            <div className="planning-flow-canvas" ref={timelineCanvasRef}>
              <ReactFlow
                key={`planning-timeline-${selectedProductId}-${startDate}`}
                edges={timelineGraph.edges}
                elementsSelectable={false}
                defaultViewport={timelineDefaultViewport}
                minZoom={planningTimelineLockedZoom}
                maxZoom={planningTimelineLockedZoom}
                nodes={timelineGraph.nodes}
                nodesConnectable={false}
                nodesDraggable={false}
                nodeTypes={planningTimelineNodeTypes}
                onInit={(instance) => {
                  timelineFlowRef.current = instance;
                  void instance.setViewport(getPlanningTimelineViewport(timelineCanvasRef.current?.clientHeight), { duration: 0 });
                }}
                onMoveEnd={(_, viewport) => extendTimelineIfNeeded(viewport)}
                onlyRenderVisibleElements
                panActivationKeyCode={null}
                panOnDrag={false}
                panOnScroll
                panOnScrollMode={PanOnScrollMode.Horizontal}
                panOnScrollSpeed={0.8}
                preventScrolling
                zoomActivationKeyCode={null}
                zoomOnDoubleClick={false}
                zoomOnPinch={false}
                zoomOnScroll={false}
              />
            </div>
          </AppCard>
        </div>
        {message ? <p className="save-message error">{message}</p> : null}
      </main>
    );
  }

  return (
    <main className="page planification-page">
      <AppCard className="planning-history-widget">
        <div className="plan-panel-header">
          <div>
            <h2>Historique des planifications</h2>
            <p>{seriesSummaries.length} plan(s) recurrent(s)</p>
          </div>
          <AppButton onClick={openWorkspace} type="button">
            <AppIcon name="plus" /> Planifier
          </AppButton>
        </div>
        <div className="plan-list-tools planning-history-tools">
          <label className="plan-search">
            <AppIcon name="search" />
            <input
              onChange={(event) => setHistorySearchTerm(event.target.value)}
              placeholder="Produit, categorie, frequence..."
              value={historySearchTerm}
            />
          </label>
        </div>
        <div className="planning-history-table-scroll themed-scrollbar">
          <table className="app-table planning-history-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Type</th>
                <th>Categorie</th>
                <th>Date de debut</th>
                <th>Frequence</th>
                <th>Prochaine planification</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {status === "loading" ? (
                <TableEmpty colSpan={8}>Chargement des planifications...</TableEmpty>
              ) : filteredSeries.length === 0 ? (
                <TableEmpty colSpan={8}>Aucune planification enregistree.</TableEmpty>
              ) : (
                filteredSeries.map((series) => (
                  <tr key={series.seriesId}>
                    <td>
                      <strong>{series.planName}</strong>
                      <small>{series.productName} - {series.occurrenceCount} occurrence(s)</small>
                    </td>
                    <td><ProductTypeBadge type={series.productType} /></td>
                    <td>{formatCategory(series.productCategory)}</td>
                    <td>{formatDate(series.startDate)}</td>
                    <td>{formatPlanningFrequency(series)}</td>
                    <td>{series.nextDate ? formatDate(series.nextDate) : "--"}</td>
                    <td>
                      <span className={cx("plan-status-label", series.seriesStatus === "paused" ? "paused" : series.status)}>
                        {series.seriesStatus === "paused" ? "En pause" : planningStatusLabels[series.status]}
                      </span>
                    </td>
                    <td>
                      <div className="planning-row-actions">
                        <button
                          aria-label={`Mettre en pause ${series.planName}`}
                          className="planning-row-action pause"
                          disabled={series.seriesStatus === "paused" || mutatingSeriesId === series.seriesId}
                          onClick={() => void pausePlanningSeries(series)}
                          title={series.seriesStatus === "paused" ? "Planification deja en pause" : "Mettre en pause"}
                          type="button"
                        >
                          <AppIcon name="pause" />
                        </button>
                        <button
                          aria-label={`Supprimer ${series.planName}`}
                          className="planning-row-action remove"
                          disabled={mutatingSeriesId === series.seriesId}
                          onClick={() => void removePlanningSeries(series)}
                          title="Supprimer"
                          type="button"
                        >
                          <AppIcon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {message ? <p className="save-message error">{message}</p> : null}
      </AppCard>
    </main>
  );
}

function renderPlanningComponentRows({
  component,
  depth,
  eligibleLots,
  expandedRows,
  products,
  rowKey,
  seriesSummaries,
  sourceSelections,
  onSourceChange,
  onToggleExpand,
}: {
  component: ProductSchemaNode;
  depth: number;
  eligibleLots: PlanningEligibleLot[];
  expandedRows: Record<string, boolean>;
  products: Product[];
  rowKey: string;
  seriesSummaries: PlanningSeriesSummary[];
  sourceSelections: Record<string, PlanningComponentSourceSelection>;
  onSourceChange: (rowKey: string, patch: PlanningComponentSourceSelection) => void;
  onToggleExpand: (rowKey: string) => void;
}): ReactNode[] {
  const isExpandable = component.type === "semi_finished" && component.children.length > 0;
  const isExpanded = Boolean(expandedRows[rowKey]);
  const selected = sourceSelections[rowKey] ?? {};
  const substitutionProducts = getComponentSubstitutionProducts(component, products);
  const selectedProductId = selected.productId ?? component.id;
  const isNestedPreview = depth > 0;
  const matchingLots = eligibleLots.filter((lot) => lot.productId === selectedProductId);
  const matchingPlans = seriesSummaries.filter(
    (series) =>
      series.productId === component.id &&
      isPlanningSourceStatusUsable(series.status),
  );
  const selectedLot = matchingLots.find((lot) => lot.id === selected.lotId) ?? matchingLots[0] ?? null;
  const selectedSeries = matchingPlans.find((series) => series.seriesId === selected.seriesId) ?? null;

  const rows: ReactNode[] = [
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
          {component.type === "raw" && substitutionProducts.length > 1 && !isNestedPreview ? (
            <div className="production-component-product-select">
              <AppCombobox
                options={substitutionProducts.map((product) => ({ value: product.id, label: product.name }))}
                onChange={(productId) => onSourceChange(rowKey, { productId, lotId: "" })}
                value={selectedProductId}
              />
            </div>
          ) : (
            <strong>{component.name}</strong>
          )}
        </div>
      </td>
      <td><ProductTypeBadge type={component.type} /></td>
      <td>
        {isNestedPreview ? (
          <span className="planning-source-fixed">Defini dans le plan source</span>
        ) : component.type === "semi_finished" ? (
          <select
            className="app-select planning-source-select"
            onChange={(event) => onSourceChange(rowKey, { seriesId: event.target.value })}
            value={selected.seriesId ?? ""}
          >
            <option value="">Aucun plan compatible</option>
            {matchingPlans.map((series) => (
              <option key={series.seriesId} value={series.seriesId}>
                {series.productName} - {formatPlanningFrequency(series)} - {formatDate(series.startDate)}
              </option>
            ))}
          </select>
        ) : isWaterComponent(component) ? (
          <span className="planning-source-fixed">Sans lot</span>
        ) : (
          <select
            className="app-select planning-source-select"
            onChange={(event) => onSourceChange(rowKey, { lotId: event.target.value })}
            value={selected.lotId ?? selectedLot?.id ?? ""}
          >
            {matchingLots.length === 0 ? <option value="">Aucun lot disponible</option> : null}
            {matchingLots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.supplierLot || lot.lotNumber} - {formatDate(lot.effectiveDate)}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        {isNestedPreview
          ? "Plan source"
          : component.type === "semi_finished"
          ? selectedSeries ? "Planification interne" : "Plan requis"
          : isWaterComponent(component)
            ? "DIVERS"
            : selectedLot?.supplierName ?? "N/A"}
      </td>
    </tr>,
  ];

  if (isExpandable && isExpanded) {
    rows.push(
      ...orderProductionSchemaNodes(component.children).flatMap((child, index) =>
        renderPlanningComponentRows({
          component: child,
          depth: depth + 1,
          eligibleLots,
          expandedRows,
          products,
          rowKey: `${rowKey}/${child.id}:${index}`,
          seriesSummaries,
          sourceSelections,
          onSourceChange,
          onToggleExpand,
        }),
      ),
    );
  }

  return rows;
}

function groupPlanningSeries(plans: ProductionPlan[]): PlanningSeriesSummary[] {
  const grouped = new Map<string, ProductionPlan[]>();
  plans.forEach((plan) => grouped.set(plan.seriesId, [...(grouped.get(plan.seriesId) ?? []), plan]));

  return [...grouped.entries()]
    .map(([seriesId, seriesPlans]) => {
      const sortedPlans = [...seriesPlans].sort((left, right) => left.plannedDate.localeCompare(right.plannedDate));
      const firstPlan = sortedPlans[0];
      const actionablePlan =
        sortedPlans.find((plan) => plan.plannedDate >= todayInputValue && plan.storedStatus === "planned") ??
        [...sortedPlans].reverse().find((plan) => plan.storedStatus === "planned") ??
        firstPlan;
      const nextDate = actionablePlan?.plannedDate ?? null;
      return {
        seriesId,
        planName: firstPlan.planName,
        productId: firstPlan.productId,
        productName: firstPlan.productName,
        productType: firstPlan.productType,
        productCategory: firstPlan.productCategory,
        startDate: firstPlan.startDate,
        endDate: firstPlan.endDate,
        frequency: firstPlan.frequency,
        intervalDays: firstPlan.intervalDays,
        daysOfWeek: firstPlan.daysOfWeek,
        occurrenceCount: seriesPlans.length,
        nextDate,
        nextPlanId: actionablePlan?.id ?? "",
        status: derivePlanningSeriesStatus(seriesPlans),
        firstPlanId: firstPlan.id,
        responsibleName: firstPlan.responsibleName,
        seriesStatus: firstPlan.seriesStatus,
      };
    })
    .filter((series) => series.seriesStatus !== "archived")
    .sort((left, right) => (left.nextDate ?? left.startDate).localeCompare(right.nextDate ?? right.startDate));
}

function collectPlanningTimelineSeries({
  plans,
  rootSeries,
  seriesSummaries,
  timelineDependencyCache,
}: {
  plans: ProductionPlan[];
  rootSeries: PlanningSeriesSummary[];
  seriesSummaries: PlanningSeriesSummary[];
  timelineDependencyCache: Record<string, ProductionPlanDependency[]>;
}) {
  const seriesById = new Map(seriesSummaries.map((series) => [series.seriesId, series]));
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const collectedSeries = new Map<string, PlanningSeriesSummary>();
  const pendingPlanIds = rootSeries.map((series) => series.firstPlanId).filter(Boolean);
  const visitedPlanIds = new Set<string>();

  rootSeries.forEach((series) => collectedSeries.set(series.seriesId, series));

  while (pendingPlanIds.length > 0) {
    const planId = pendingPlanIds.shift();
    if (!planId || visitedPlanIds.has(planId)) continue;
    visitedPlanIds.add(planId);

    (timelineDependencyCache[planId] ?? []).forEach((dependency) => {
      if (dependency.sourceKind !== "planned_production" || !dependency.sourcePlanId) return;
      const sourcePlan = plansById.get(dependency.sourcePlanId);
      if (!sourcePlan) return;
      const sourceSeries = seriesById.get(sourcePlan.seriesId);
      if (!sourceSeries) return;

      collectedSeries.set(sourceSeries.seriesId, sourceSeries);
      if (!visitedPlanIds.has(sourcePlan.id)) pendingPlanIds.push(sourcePlan.id);
    });
  }

  return [...collectedSeries.values()];
}

function derivePlanningSeriesStatus(plans: ProductionPlan[]): ProductionPlan["derivedStatus"] {
  const statusPriority: ProductionPlan["derivedStatus"][] = [
    "blocked",
    "recipe_changed",
    "overdue",
    "waiting",
    "ready",
    "completed",
    "cancelled",
  ];
  return statusPriority.find((status) => plans.some((plan) => plan.derivedStatus === status)) ?? "waiting";
}

function getPlanningCalendarDates(anchorDate: string, pastDays: number, futureDays: number) {
  const start = addPlanningDays(anchorDate, -Math.max(0, pastDays));
  const count = Math.max(1, pastDays + futureDays + 1);
  return Array.from({ length: count }, (_, index) => addPlanningDays(start, index));
}

function getPlanningDateOffset(anchorDate: string, date: string) {
  const anchor = parseInputDate(anchorDate);
  const target = parseInputDate(date);
  if (!anchor || !target) return 0;
  return Math.round((target.getTime() - anchor.getTime()) / 86_400_000);
}

function expandPlanningScheduleForTimeline(schedule: {
  frequency: PlanningFrequency;
  startDate: string;
  endDate: string;
  intervalDays?: number;
  daysOfWeek?: number[];
}) {
  if (schedule.endDate < schedule.startDate) return [];
  return expandPlanningSchedule(schedule, Math.max(90, countDateRangeDays(schedule.startDate, schedule.endDate)));
}

function formatPlanningFrequency(schedule: Pick<PlanningSeriesSummary, "frequency" | "intervalDays" | "daysOfWeek">) {
  if (schedule.frequency === "daily") return "Chaque jour";
  if (schedule.frequency === "weekdays") return "Jours ouvrables";
  if (schedule.frequency === "every_n_days") return `Tous les ${schedule.intervalDays || 1} jours`;
  if (schedule.frequency === "specific_days") {
    const labels = schedule.daysOfWeek.map((day) => calendarWeekdays[day === 0 ? 6 : day - 1]).filter(Boolean);
    return labels.length > 0 ? labels.join(", ") : "Jours specifiques";
  }
  return "Une seule fois";
}

function buildPlanningTimelineGraph({
  rootProduct,
  rootSchedule,
  selectedSeries,
  startDate,
  visibleDates,
}: {
  rootProduct: Product | null;
  rootSchedule: ProductPlanningSchedule;
  selectedSeries: PlanningSeriesSummary[];
  startDate: string;
  visibleDates: string[];
}): { nodes: PlanningTimelineNode[]; edges: PlanningTimelineEdge[] } {
  const nodes: PlanningTimelineNode[] = [];
  const edges: PlanningTimelineEdge[] = [];
  const visibleDateSet = new Set(visibleDates);
  const visibleEndDate = visibleDates[visibleDates.length - 1] ?? startDate;
  const productBaseY = planningTimelineDayY - 126;
  const productGapY = 116;
  const separatorTopY = productBaseY - Math.max(1, selectedSeries.length + 1) * productGapY - 24;
  const separatorHeight = planningTimelineDayY - separatorTopY + planningTimelineDayNodeHeight + 34;
  const dayGapX = planningTimelineDayStepX - planningTimelineNodeWidth;

  visibleDates.forEach((date, index) => {
    const weekday = parseInputDate(date)?.getDay() ?? 0;
    const dayX = getPlanningDateOffset(startDate, date) * planningTimelineDayStepX;
    if (weekday === 1 && index > 0) {
      nodes.push({
        id: `week-separator-${date}`,
        type: "planningWeekSeparator",
        position: { x: dayX - dayGapX / 2 - planningTimelineWeekSeparatorWidth / 2, y: separatorTopY },
        data: { kind: "weekSeparator" },
        className: "planning-flow-node week-separator",
        draggable: false,
        selectable: false,
        style: {
          "--planning-week-separator-height": `${separatorHeight}px`,
          "--planning-week-separator-width": `${planningTimelineWeekSeparatorWidth}px`,
        } as CSSProperties,
      });
    }
    nodes.push({
      id: `day-${date}`,
      type: "planningDay",
      position: { x: dayX, y: planningTimelineDayY },
      data: {
        kind: "day",
        label: (
          <div className="planning-day-node">
            <strong>{planningWeekdays[weekday === 0 ? 6 : weekday - 1]}</strong>
            <span>{formatDate(date)}</span>
          </div>
        ),
      },
      className: "planning-flow-node day",
    });
    if (index > 0) {
      edges.push({
        id: `day-edge-${visibleDates[index - 1]}-${date}`,
        source: `day-${visibleDates[index - 1]}`,
        sourceHandle: "right",
        target: `day-${date}`,
        targetHandle: "left",
        type: "smoothstep",
        style: { stroke: "var(--diagram-link)", strokeWidth: 1.25 },
      });
    }
  });

  const occurrences: Array<{ date: string; product: Product | PlanningSeriesSummary; role: "root" | "dependency" }> = [];
  if (rootProduct) {
    expandPlanningScheduleForTimeline({
      frequency: rootSchedule.frequency,
      startDate,
      endDate: visibleEndDate,
      intervalDays: rootSchedule.intervalDays,
      daysOfWeek: rootSchedule.daysOfWeek,
    })
      .filter((date) => visibleDateSet.has(date))
      .forEach((date) => occurrences.push({ date, product: rootProduct, role: "root" }));
  }
  selectedSeries.forEach((series) => {
    expandPlanningScheduleForTimeline({
      frequency: series.frequency,
      startDate: series.startDate,
      endDate: visibleEndDate,
      intervalDays: series.intervalDays,
      daysOfWeek: series.daysOfWeek,
    })
      .filter((date) => visibleDateSet.has(date))
      .forEach((date) => occurrences.push({ date, product: series, role: "dependency" }));
  });

  const occurrencesByDate = new Map<string, typeof occurrences>();
  occurrences.forEach((occurrence) => {
    occurrencesByDate.set(occurrence.date, [...(occurrencesByDate.get(occurrence.date) ?? []), occurrence]);
  });

  visibleDates.forEach((date) => {
    const dayX = getPlanningDateOffset(startDate, date) * planningTimelineDayStepX;
    (occurrencesByDate.get(date) ?? []).forEach((occurrence, branchIndex) => {
      const productType = occurrence.role === "root" ? (occurrence.product as Product).type : (occurrence.product as PlanningSeriesSummary).productType;
      const productName = occurrence.role === "root" ? (occurrence.product as Product).name : (occurrence.product as PlanningSeriesSummary).productName;
      const productId = occurrence.role === "root" ? (occurrence.product as Product).id : (occurrence.product as PlanningSeriesSummary).productId;
      const nodeId = `occurrence-${date}-${occurrence.role}-${branchIndex}-${productId}`;
      nodes.push({
        id: nodeId,
        type: "planningProduct",
        position: { x: dayX, y: productBaseY - branchIndex * productGapY },
        data: {
          kind: productType,
          label: (
            <div className="planning-product-node">
              <span>{occurrence.role === "root" ? "Produit cible" : "Plan source"}</span>
              <strong>{productName}</strong>
              <small>{typeLabels[productType]}</small>
            </div>
          ),
        },
        className: cx("planning-flow-node product", productType),
      });
      edges.push({
        id: `edge-day-${date}-${nodeId}`,
        source: nodeId,
        sourceHandle: "bottom",
        target: `day-${date}`,
        targetHandle: "top",
        type: "straight",
        style: { stroke: "var(--diagram-link)", strokeWidth: 1.5 },
      });
    });
  });

  return { nodes, edges };
}

function PlanningDayNode({ data }: NodeProps<PlanningTimelineNode>) {
  return (
    <>
      {data.label}
      <Handle className="planning-flow-handle" id="left" position={Position.Left} type="target" />
      <Handle className="planning-flow-handle" id="right" position={Position.Right} type="source" />
      <Handle className="planning-flow-handle" id="top" position={Position.Top} type="target" />
    </>
  );
}

function PlanningProductNode({ data }: NodeProps<PlanningTimelineNode>) {
  return (
    <>
      {data.label}
      <Handle className="planning-flow-handle" id="bottom" position={Position.Bottom} type="source" />
    </>
  );
}

function PlanningWeekSeparatorNode() {
  return <span aria-hidden="true" className="planning-week-separator-line" />;
}

function PlanificationModule({
  active,
  products,
  onOpenConfirmation,
}: {
  active: boolean;
  products: Product[];
  onOpenConfirmation: (planId: string) => Promise<void>;
}) {
  const eligibleProducts = useMemo(
    () => products.filter((product) => product.type !== "raw" && product.recipeStatus === "active"),
    [products],
  );
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [timelineDependencies, setTimelineDependencies] = useState<ProductionPlanDependency[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductionPlan["derivedStatus"] | "all">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [startDate, setStartDate] = useState(todayInputValue);
  const [endDate, setEndDate] = useState(() => addPlanningDays(todayInputValue, 13));
  const [rootFrequency, setRootFrequency] = useState<PlanningFrequency>("daily");
  const [rootIntervalDays, setRootIntervalDays] = useState(2);
  const [rootDaysOfWeek, setRootDaysOfWeek] = useState([1, 2, 3, 4, 5]);
  const [responsibleName, setResponsibleName] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduleByProductId, setScheduleByProductId] = useState<Record<string, ProductPlanningSchedule>>({});
  const [preparedBundle, setPreparedBundle] = useState<PreparedPlanningBundle | null>(null);
  const [prepareStatus, setPrepareStatus] = useState<"idle" | "loading" | "saving">("idle");
  const [createMessage, setCreateMessage] = useState("");

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const filteredPlans = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    return plans.filter(
      (plan) =>
        (statusFilter === "all" || plan.derivedStatus === statusFilter) &&
        (!query ||
          normalizeSearchText(plan.productName).includes(query) ||
          normalizeSearchText(plan.productCode).includes(query) ||
          normalizeSearchText(formatCategory(plan.productCategory)).includes(query)),
    );
  }, [plans, searchTerm, statusFilter]);
  const timelineDates = useMemo(
    () =>
      [...new Set([
        ...(selectedPlan ? [selectedPlan.plannedDate] : []),
        ...timelineDependencies.flatMap((dependency) => [dependency.sourcePlanDate, dependency.lotDate].filter(Boolean) as string[]),
      ])].sort(),
    [selectedPlan, timelineDependencies],
  );

  async function loadPlans(preferredPlanId?: string) {
    setStatus("loading");
    setMessage("");
    try {
      const nextPlans = await fetchProductionPlans();
      setPlans(nextPlans);
      setSelectedPlanId((current) => {
        const candidate = preferredPlanId || current;
        return candidate && nextPlans.some((plan) => plan.id === candidate) ? candidate : nextPlans[0]?.id ?? "";
      });
      setStatus("idle");
    } catch (error) {
      console.error("Production planning load failed", error);
      setStatus("error");
      setMessage(
        formatApiError(
          error,
          "Impossible de charger la planification. Executez la migration 020_production_planification.sql.",
        ),
      );
    }
  }

  useEffect(() => {
    if (active) void loadPlans();
  }, [active]);

  useEffect(() => {
    if (!selectedPlanId) {
      setTimelineDependencies([]);
      return;
    }

    let cancelled = false;
    async function loadDependencyTree() {
      const pendingPlanIds = [selectedPlanId];
      const visitedPlanIds = new Set<string>();
      const dependencies: ProductionPlanDependency[] = [];
      while (pendingPlanIds.length > 0) {
        const planId = pendingPlanIds.shift()!;
        if (visitedPlanIds.has(planId)) continue;
        visitedPlanIds.add(planId);
        const rows = await fetchProductionPlanDependencies(planId);
        dependencies.push(...rows);
        for (const row of rows) {
          if (row.sourcePlanId && !visitedPlanIds.has(row.sourcePlanId)) pendingPlanIds.push(row.sourcePlanId);
        }
      }
      if (!cancelled) setTimelineDependencies(dependencies);
    }

    void loadDependencyTree().catch((error) => {
      console.error("Planning dependency timeline load failed", error);
      if (!cancelled) setMessage(formatApiError(error, "Impossible de charger les dependances."));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPlanId]);

  function openCreation() {
    const firstProduct = eligibleProducts[0];
    setSelectedProductId(firstProduct?.id ?? "");
    setStartDate(todayInputValue);
    setEndDate(addPlanningDays(todayInputValue, 13));
    setRootFrequency("daily");
    setRootIntervalDays(2);
    setRootDaysOfWeek([1, 2, 3, 4, 5]);
    setResponsibleName("");
    setNotes("");
    setScheduleByProductId({});
    setPreparedBundle(null);
    setCreateMessage("");
    setPrepareStatus("idle");
    setIsCreateOpen(true);
  }

  function updateChildSchedule(productId: string, patch: Partial<ProductPlanningSchedule>) {
    setScheduleByProductId((current) => ({
      ...current,
      [productId]: {
        frequency: current[productId]?.frequency ?? rootFrequency,
        intervalDays: current[productId]?.intervalDays ?? rootIntervalDays,
        daysOfWeek: current[productId]?.daysOfWeek ?? rootDaysOfWeek,
        ...patch,
      },
    }));
    setPreparedBundle(null);
  }

  function updatePreparedDependencyLot(dependencyIndex: number, lotId: string) {
    setPreparedBundle((current) => {
      if (!current) return current;
      const selectedLot = current.eligibleLots.find((lot) => lot.id === lotId);
      if (!selectedLot) return current;

      return {
        ...current,
        dependencies: current.dependencies.map((dependency, index) =>
          index === dependencyIndex
            ? {
                ...dependency,
                selectedProductId: selectedLot.productId,
                sourceLotId: selectedLot.id,
              }
            : dependency,
        ),
      };
    });
  }

  async function preparePlanningBundle() {
    const rootProduct = eligibleProducts.find((product) => product.id === selectedProductId);
    if (!rootProduct) {
      setCreateMessage("Selectionnez un produit.");
      return;
    }

    setPrepareStatus("loading");
    setCreateMessage("");
    try {
      const rootComponents = await fetchProductSchema(rootProduct.id);
      if (rootComponents.length === 0) throw new Error("Le produit selectionne ne contient aucun composant.");
      const componentsByProductId = collectPlanningSchemaMap(rootProduct.id, rootComponents);
      const manufacturedProductIds = [...componentsByProductId.keys()];
      const manufacturedProducts = manufacturedProductIds.flatMap(
        (productId) => products.find((product) => product.id === productId) ?? [],
      );
      const recipeMetadata = await fetchActiveRecipeMetadata(manufacturedProductIds);
      const recipeByProductId = new Map(recipeMetadata.map((recipe) => [recipe.productId, recipe]));
      const missingRecipeProduct = manufacturedProducts.find((product) => !recipeByProductId.has(product.id));
      if (missingRecipeProduct) throw new Error(`${missingRecipeProduct.name} n'a pas de recette active exploitable.`);

      const rawComponents = [...componentsByProductId.values()].flat().filter((component) => component.type === "raw");
      const candidateRawProductIds = [
        ...new Set(
          rawComponents.flatMap((component) =>
            getComponentSubstitutionProducts(component, products.filter((product) => product.type === "raw")).map(
              (product) => product.id,
            ),
          ),
        ),
      ];
      const eligibleLots = await fetchPlanningEligibleLots(candidateRawProductIds, endDate);
      const series: ProductionPlanSeriesInput[] = [];
      const plansToCreate: ProductionPlanOccurrenceInput[] = [];
      const occurrenceCandidates: Array<{ occurrenceId: string; productId: string; plannedDate: string }> = [];

      for (const product of manufacturedProducts) {
        const configured =
          product.id === rootProduct.id
            ? { frequency: rootFrequency, intervalDays: rootIntervalDays, daysOfWeek: rootDaysOfWeek }
            : scheduleByProductId[product.id] ?? {
                frequency: rootFrequency,
                intervalDays: rootIntervalDays,
                daysOfWeek: rootDaysOfWeek,
              };
        const occurrenceDates = expandPlanningSchedule({
          frequency: configured.frequency,
          startDate,
          endDate,
          intervalDays: configured.intervalDays,
          daysOfWeek: configured.daysOfWeek,
        });
        const seriesId = crypto.randomUUID();
        series.push({
          id: seriesId,
          planName: `${product.name} - ${formatDate(startDate)}`,
          productId: product.id,
          frequency: configured.frequency,
          intervalDays: configured.intervalDays,
          daysOfWeek: configured.daysOfWeek,
          startDate,
          endDate,
        });
        const recipe = recipeByProductId.get(product.id)!;
        for (const plannedDate of occurrenceDates) {
          const plan: ProductionPlanOccurrenceInput = {
            id: crypto.randomUUID(),
            seriesId,
            productId: product.id,
            plannedDate,
            recipeId: recipe.id,
            recipeVersion: recipe.version,
            schemaSnapshot: {
              recipeUpdatedAt: recipe.updatedAt,
              components: (componentsByProductId.get(product.id) ?? []).map((component) => ({
                id: component.id,
                name: component.name,
                type: component.type,
              })),
            },
            responsibleName: responsibleName.trim() || null,
            notes: notes.trim() || null,
          };
          plansToCreate.push(plan);
          occurrenceCandidates.push({
            occurrenceId: plan.id,
            productId: plan.productId,
            plannedDate: plan.plannedDate,
          });
        }
      }

      const dependencies: ProductionPlanDependencyInput[] = [];
      const unresolved: string[] = [];
      for (const plan of plansToCreate) {
        const directComponents = componentsByProductId.get(plan.productId) ?? [];
        directComponents.forEach((component, componentIndex) => {
          const nodeKey = `${component.id}:${componentIndex}`;
          if (isWaterComponent(component)) {
            dependencies.push({
              planId: plan.id,
              nodeKey,
              parentNodeKey: null,
              depth: 0,
              expectedProductId: component.id,
              selectedProductId: component.id,
              sourceKind: "water",
              sourceLotId: null,
              sourcePlanId: null,
            });
            return;
          }

          if (component.type === "semi_finished") {
            const sourcePlan = findLatestDependencyOccurrence(occurrenceCandidates, component.id, plan.plannedDate);
            if (!sourcePlan) {
              unresolved.push(`${plan.plannedDate} - ${plan.productId}: plan manquant pour ${component.name}`);
              return;
            }
            dependencies.push({
              planId: plan.id,
              nodeKey,
              parentNodeKey: null,
              depth: 0,
              expectedProductId: component.id,
              selectedProductId: component.id,
              sourceKind: "planned_production",
              sourceLotId: null,
              sourcePlanId: sourcePlan.occurrenceId,
            });
            return;
          }

          const substitutionProductIds = new Set(
            getComponentSubstitutionProducts(component, products.filter((product) => product.type === "raw")).map(
              (product) => product.id,
            ),
          );
          const selectedLot = eligibleLots.find(
            (lot) =>
              substitutionProductIds.has(lot.productId) &&
              lot.effectiveDate <= plan.plannedDate &&
              (!lot.expiryDate || lot.expiryDate >= plan.plannedDate),
          );
          if (!selectedLot) {
            unresolved.push(`${plan.plannedDate} - aucun lot eligible pour ${component.name}`);
            return;
          }
          dependencies.push({
            planId: plan.id,
            nodeKey,
            parentNodeKey: null,
            depth: 0,
            expectedProductId: component.id,
            selectedProductId: selectedLot.productId,
            sourceKind: "raw_lot",
            sourceLotId: selectedLot.id,
            sourcePlanId: null,
          });
        });
      }

      const nextSchedules = { ...scheduleByProductId };
      for (const product of manufacturedProducts) {
        if (product.id === rootProduct.id || nextSchedules[product.id]) continue;
        nextSchedules[product.id] = {
          frequency: rootFrequency,
          intervalDays: rootIntervalDays,
          daysOfWeek: rootDaysOfWeek,
        };
      }
      setScheduleByProductId(nextSchedules);
      setPreparedBundle({
        series,
        plans: plansToCreate,
        dependencies,
        unresolved,
        manufacturedProducts,
        eligibleLots,
      });
      setCreateMessage(
        unresolved.length > 0
          ? `${unresolved.length} dependance(s) non resolue(s). La planification ne peut pas etre creee.`
          : `${plansToCreate.length} occurrence(s) pretes, avec ${dependencies.length} dependance(s) resolue(s).`,
      );
    } catch (error) {
      console.error("Planning preparation failed", error);
      setPreparedBundle(null);
      setCreateMessage(formatApiError(error, "Impossible d'analyser cette planification."));
    } finally {
      setPrepareStatus("idle");
    }
  }

  async function savePreparedPlan(event: FormEvent) {
    event.preventDefault();
    if (!preparedBundle || preparedBundle.unresolved.length > 0) {
      await preparePlanningBundle();
      return;
    }

    setPrepareStatus("saving");
    try {
      await createProductionPlanBundle(preparedBundle);
      const preferredPlan = preparedBundle.plans.find((plan) => plan.productId === selectedProductId);
      setIsCreateOpen(false);
      await loadPlans(preferredPlan?.id);
    } catch (error) {
      console.error("Planning save failed", error);
      setCreateMessage(formatApiError(error, "Impossible d'enregistrer la planification."));
    } finally {
      setPrepareStatus("idle");
    }
  }

  async function handleCancelPlan() {
    if (!selectedPlan || !window.confirm(`Annuler la planification de ${selectedPlan.productName} ?`)) return;
    try {
      await cancelProductionPlan(selectedPlan.id, "Annulation utilisateur");
      await loadPlans(selectedPlan.id);
    } catch (error) {
      setMessage(formatApiError(error, "Impossible d'annuler cette planification."));
    }
  }

  async function handleRefreshPlan() {
    if (!selectedPlan) return;
    setMessage("");
    try {
      const components = await fetchProductSchema(selectedPlan.productId);
      const [recipe] = await fetchActiveRecipeMetadata([selectedPlan.productId]);
      if (!recipe || components.length === 0) {
        throw new Error("La recette active ne contient aucun composant exploitable.");
      }

      const rawComponents = components.filter((component) => component.type === "raw");
      const candidateRawProductIds = [
        ...new Set(
          rawComponents.flatMap((component) =>
            getComponentSubstitutionProducts(component, products.filter((product) => product.type === "raw")).map(
              (product) => product.id,
            ),
          ),
        ),
      ];
      const eligibleLots = await fetchPlanningEligibleLots(candidateRawProductIds, selectedPlan.plannedDate);
      const dependencies: ProductionPlanDependencyInput[] = [];
      const unresolved: string[] = [];

      components.forEach((component, componentIndex) => {
        const nodeKey = `${component.id}:${componentIndex}`;
        if (isWaterComponent(component)) {
          dependencies.push({
            planId: selectedPlan.id,
            nodeKey,
            parentNodeKey: null,
            depth: 0,
            expectedProductId: component.id,
            selectedProductId: component.id,
            sourceKind: "water",
            sourceLotId: null,
            sourcePlanId: null,
          });
          return;
        }

        if (component.type === "semi_finished") {
          const sourcePlan = plans
            .filter(
              (plan) =>
                plan.id !== selectedPlan.id &&
                plan.productId === component.id &&
                plan.plannedDate <= selectedPlan.plannedDate &&
                !["cancelled", "blocked", "recipe_changed"].includes(plan.derivedStatus),
            )
            .sort((left, right) => right.plannedDate.localeCompare(left.plannedDate))[0];
          if (!sourcePlan) {
            unresolved.push(`Aucun plan compatible pour ${component.name}.`);
            return;
          }
          dependencies.push({
            planId: selectedPlan.id,
            nodeKey,
            parentNodeKey: null,
            depth: 0,
            expectedProductId: component.id,
            selectedProductId: component.id,
            sourceKind: "planned_production",
            sourceLotId: null,
            sourcePlanId: sourcePlan.id,
          });
          return;
        }

        const candidateIds = new Set(
          getComponentSubstitutionProducts(component, products.filter((product) => product.type === "raw")).map(
            (product) => product.id,
          ),
        );
        const lot = eligibleLots.find(
          (candidate) =>
            candidateIds.has(candidate.productId) &&
            candidate.effectiveDate <= selectedPlan.plannedDate &&
            (!candidate.expiryDate || candidate.expiryDate >= selectedPlan.plannedDate),
        );
        if (!lot) {
          unresolved.push(`Aucun lot eligible pour ${component.name}.`);
          return;
        }
        dependencies.push({
          planId: selectedPlan.id,
          nodeKey,
          parentNodeKey: null,
          depth: 0,
          expectedProductId: component.id,
          selectedProductId: lot.productId,
          sourceKind: "raw_lot",
          sourceLotId: lot.id,
          sourcePlanId: null,
        });
      });

      if (unresolved.length > 0) throw new Error(unresolved.join(" "));
      await refreshProductionPlan({
        planId: selectedPlan.id,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        schemaSnapshot: {
          recipeUpdatedAt: recipe.updatedAt,
          components: components.map((component) => ({
            id: component.id,
            name: component.name,
            type: component.type,
          })),
        },
        dependencies,
      });
      await loadPlans(selectedPlan.id);
    } catch (error) {
      setMessage(formatApiError(error, "Impossible d'actualiser cette planification."));
    }
  }

  async function handleOpenConfirmation() {
    if (!selectedPlan) return;
    setMessage("");
    try {
      await onOpenConfirmation(selectedPlan.id);
    } catch (error) {
      setMessage(formatApiError(error, "Impossible d'ouvrir la confirmation."));
    }
  }

  return (
    <main className="page planification-page">
      <div className="planification-layout">
        <AppCardAside className="plan-list-panel">
          <div className="plan-panel-header">
            <div>
              <h2>Planification</h2>
              <p>{plans.length} occurrence(s)</p>
            </div>
            <AppButton onClick={openCreation} type="button">
              <AppIcon name="plus" /> Planifier
            </AppButton>
          </div>
          <div className="plan-list-tools">
            <label className="plan-search">
              <AppIcon name="search" />
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Produit ou categorie..."
                value={searchTerm}
              />
            </label>
            <select
              className="app-select"
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              value={statusFilter}
            >
              <option value="all">Tous les statuts</option>
              {Object.entries(planningStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="plan-list-scroll themed-scrollbar">
            {status === "loading" ? <TraceabilityLoader label="Chargement..." /> : null}
            {status !== "loading" && filteredPlans.length === 0 ? (
              <EmptyState compact>Aucune occurrence planifiee.</EmptyState>
            ) : null}
            {filteredPlans.map((plan) => (
              <button
                className={cx("plan-list-row", plan.id === selectedPlanId && "selected")}
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                type="button"
              >
                <span className={cx("plan-status-dot", plan.derivedStatus)} />
                <span className="plan-list-main">
                  <strong>{plan.productName}</strong>
                  <span>{formatDate(plan.plannedDate)} · {formatCategory(plan.productCategory)}</span>
                </span>
                <span className={cx("plan-status-label", plan.derivedStatus)}>
                  {planningStatusLabels[plan.derivedStatus]}
                </span>
              </button>
            ))}
          </div>
        </AppCardAside>

        <AppCard className="plan-timeline-panel">
          {selectedPlan ? (
            <>
              <div className="plan-panel-header timeline-header">
                <div>
                  <span className="plan-eyebrow">Production planifiee · {formatDate(selectedPlan.plannedDate)}</span>
                  <h2>{selectedPlan.productName}</h2>
                  <p>{selectedPlan.dependencyCount} dependance(s) · {planningStatusLabels[selectedPlan.derivedStatus]}</p>
                </div>
                <div className="plan-header-actions">
                  {selectedPlan.derivedStatus === "recipe_changed" ? (
                    <AppButton onClick={() => void handleRefreshPlan()} type="button" variant="secondary">
                      Actualiser
                    </AppButton>
                  ) : null}
                  {selectedPlan.storedStatus === "planned" ? (
                    <AppButton onClick={() => void handleCancelPlan()} type="button" variant="dangerSoft">
                      Annuler
                    </AppButton>
                  ) : null}
                  {selectedPlan.derivedStatus === "ready" || selectedPlan.derivedStatus === "overdue" ? (
                    <AppButton onClick={() => void handleOpenConfirmation()} type="button">
                      <AppIcon name="check" /> Confirmer les lots
                    </AppButton>
                  ) : null}
                </div>
              </div>
              <div
                className="planning-timeline themed-scrollbar"
                style={{ "--timeline-count": Math.max(timelineDates.length, 1) } as CSSProperties}
              >
                <div className="timeline-date-axis">
                  {timelineDates.map((date) => <span key={date}>{formatDate(date)}</span>)}
                </div>
                <div className="timeline-lanes">
                  {timelineDates.map((date) => (
                    <div className="timeline-date-column" key={date}>
                      {timelineDependencies
                        .filter((dependency) => dependency.sourcePlanDate === date || dependency.lotDate === date)
                        .map((dependency) => (
                          <article
                            className={cx(
                              "timeline-card",
                              dependency.selectedProductType === "raw" ? "raw" : "semi_finished",
                            )}
                            key={`${dependency.id}-${date}`}
                          >
                            <span>{dependency.selectedProductType === "raw" ? "Lot disponible" : "Production requise"}</span>
                            <strong>{dependency.selectedProductName}</strong>
                            <small>
                              {dependency.lotNumber ||
                                (dependency.sourcePlanStatus === "completed" ? "Termine" : "En attente")}
                            </small>
                          </article>
                        ))}
                      {selectedPlan.plannedDate === date ? (
                        <article className={cx("timeline-card root", selectedPlan.productType)}>
                          <span>Produit cible</span>
                          <strong>{selectedPlan.productName}</strong>
                          <small>{planningStatusLabels[selectedPlan.derivedStatus]}</small>
                        </article>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="plan-detail-strip">
                <span><strong>Recette</strong> v{selectedPlan.recipeVersion}</span>
                <span><strong>Responsable</strong> {selectedPlan.responsibleName || "Non renseigne"}</span>
                <span><strong>Cree par</strong> {selectedPlan.createdBy.name || selectedPlan.createdBy.email || "Utilisateur"}</span>
              </div>
            </>
          ) : (
            <EmptyState large>Selectionnez une occurrence pour afficher sa chronologie.</EmptyState>
          )}
          {message ? <p className="save-message error">{message}</p> : null}
        </AppCard>
      </div>

      {isCreateOpen ? (
        <AppDialogShell
          bodyClassName="planning-dialog-body"
          footer={
            <>
              <AppButton onClick={() => setIsCreateOpen(false)} type="button" variant="secondary">Annuler</AppButton>
              <AppButton
                disabled={prepareStatus !== "idle" || !preparedBundle || preparedBundle.unresolved.length > 0}
                type="submit"
              >
                {prepareStatus === "saving" ? "Enregistrement..." : "Enregistrer le plan"}
              </AppButton>
            </>
          }
          onClose={() => setIsCreateOpen(false)}
          onSubmit={savePreparedPlan}
          title="Nouvelle planification"
        >
          <div className="planning-form-grid">
            <Field label="Produit" wide>
              <select
                className="app-select"
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setPreparedBundle(null);
                }}
                value={selectedProductId}
              >
                {eligibleProducts.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Debut"><AppDatePicker onChange={(value) => { setStartDate(value); setPreparedBundle(null); }} value={startDate} /></Field>
            <Field label="Fin"><AppDatePicker onChange={(value) => { setEndDate(value); setPreparedBundle(null); }} value={endDate} /></Field>
            <Field label="Frequence">
              <select
                className="app-select"
                onChange={(event) => { setRootFrequency(event.target.value as PlanningFrequency); setPreparedBundle(null); }}
                value={rootFrequency}
              >
                {planningFrequencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            {rootFrequency === "every_n_days" ? (
              <Field label="Intervalle en jours">
                <input min={1} max={90} onChange={(event) => { setRootIntervalDays(Math.max(1, Number(event.target.value))); setPreparedBundle(null); }} type="number" value={rootIntervalDays} />
              </Field>
            ) : null}
            <Field label="Responsable"><input onChange={(event) => setResponsibleName(event.target.value)} value={responsibleName} /></Field>
            <Field label="Notes" wide><input onChange={(event) => setNotes(event.target.value)} value={notes} /></Field>
          </div>
          {rootFrequency === "specific_days" ? (
            <div className="planning-weekdays">
              {calendarWeekdays.map((label, index) => {
                const day = index === 6 ? 0 : index + 1;
                return (
                  <button
                    className={cx(rootDaysOfWeek.includes(day) && "selected")}
                    key={day}
                    onClick={() => {
                      setRootDaysOfWeek((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
                      setPreparedBundle(null);
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {preparedBundle && preparedBundle.manufacturedProducts.length > 1 ? (
            <div className="planning-dependency-schedules">
              <h3>Cadence des semi-finis requis</h3>
              {preparedBundle.manufacturedProducts
                .filter((product) => product.id !== selectedProductId)
                .map((product) => {
                  const childSchedule = scheduleByProductId[product.id] ?? {
                    frequency: rootFrequency,
                    intervalDays: rootIntervalDays,
                    daysOfWeek: rootDaysOfWeek,
                  };
                  return (
                    <div className="planning-dependency-schedule" key={product.id}>
                      <span><ProductTypeBadge type={product.type} /> <strong>{product.name}</strong></span>
                      <select
                        className="app-select"
                        onChange={(event) => updateChildSchedule(product.id, { frequency: event.target.value as PlanningFrequency })}
                        value={childSchedule.frequency}
                      >
                        {planningFrequencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      {childSchedule.frequency === "every_n_days" ? (
                        <input
                          min={1}
                          max={90}
                          onChange={(event) => updateChildSchedule(product.id, { intervalDays: Math.max(1, Number(event.target.value)) })}
                          type="number"
                          value={childSchedule.intervalDays}
                        />
                      ) : <span />}
                      {childSchedule.frequency === "specific_days" ? (
                        <div className="planning-child-weekdays">
                          {calendarWeekdays.map((label, index) => {
                            const day = index === 6 ? 0 : index + 1;
                            return (
                              <button
                                className={cx(childSchedule.daysOfWeek.includes(day) && "selected")}
                                key={day}
                                onClick={() =>
                                  updateChildSchedule(product.id, {
                                    daysOfWeek: childSchedule.daysOfWeek.includes(day)
                                      ? childSchedule.daysOfWeek.filter((item) => item !== day)
                                      : [...childSchedule.daysOfWeek, day],
                                  })
                                }
                                type="button"
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ) : null}
          <button
            className="planning-analyze-button"
            disabled={prepareStatus !== "idle"}
            onClick={() => void preparePlanningBundle()}
            type="button"
          >
            <AppIcon name="analytics" /> {preparedBundle ? "Recalculer les dependances" : "Analyser les dependances"}
          </button>
          {preparedBundle ? (
            <>
              <div className={cx("planning-readiness-summary", preparedBundle.unresolved.length > 0 ? "blocked" : "ready")}>
                <strong>{preparedBundle.unresolved.length > 0 ? "Plan incomplet" : "Plan pret a enregistrer"}</strong>
                <span>{createMessage}</span>
                {preparedBundle.unresolved.slice(0, 6).map((item) => <small key={item}>{item}</small>)}
              </div>
              <div className="planning-source-review">
                <div className="planning-source-review-header">
                  <strong>Sources reservees</strong>
                  <span>Verifiez les lots et productions avant l'enregistrement.</span>
                </div>
                <div className="planning-source-review-scroll themed-scrollbar">
                  {preparedBundle.dependencies.map((dependency, dependencyIndex) => {
                    const plan = preparedBundle.plans.find((item) => item.id === dependency.planId);
                    const plannedProduct = preparedBundle.manufacturedProducts.find(
                      (product) => product.id === plan?.productId,
                    );
                    const expectedProduct = products.find((product) => product.id === dependency.expectedProductId);
                    const sourcePlan = preparedBundle.plans.find((item) => item.id === dependency.sourcePlanId);
                    const sourceProduct = preparedBundle.manufacturedProducts.find(
                      (product) => product.id === sourcePlan?.productId,
                    );
                    const expectedSubstitutionGroup = expectedProduct
                      ? getFlexibleRawMaterialSubstitutionGroup(expectedProduct)
                      : null;
                    const allowedProductIds = new Set(
                      expectedProduct
                        ? products
                            .filter(
                              (product) =>
                                product.id === expectedProduct.id ||
                                (expectedSubstitutionGroup &&
                                  product.type === "raw" &&
                                  getFlexibleRawMaterialSubstitutionGroup(product) === expectedSubstitutionGroup),
                            )
                            .map((product) => product.id)
                        : [],
                    );
                    const candidateLots =
                      dependency.sourceKind === "raw_lot" && plan
                        ? preparedBundle.eligibleLots.filter(
                            (lot) =>
                              allowedProductIds.has(lot.productId) &&
                              lot.effectiveDate <= plan.plannedDate &&
                              (!lot.expiryDate || lot.expiryDate >= plan.plannedDate),
                          )
                        : [];

                    return (
                      <div className="planning-source-review-row" key={`${dependency.planId}-${dependency.nodeKey}`}>
                        <span>
                          <strong>{plan ? formatDate(plan.plannedDate) : "--"}</strong>
                          <small>{plannedProduct?.name ?? "Production"}</small>
                        </span>
                        <span>
                          <strong>{expectedProduct?.name ?? "Composant"}</strong>
                          <small>
                            {dependency.sourceKind === "planned_production"
                              ? `Production ${sourceProduct?.name ?? "semi-finie"}`
                              : dependency.sourceKind === "water"
                                ? "Exception Eau"
                                : "Lot matiere premiere"}
                          </small>
                        </span>
                        {dependency.sourceKind === "raw_lot" ? (
                          <select
                            className="app-select"
                            onChange={(event) => updatePreparedDependencyLot(dependencyIndex, event.target.value)}
                            value={dependency.sourceLotId ?? ""}
                          >
                            {candidateLots.map((lot) => (
                              <option key={lot.id} value={lot.id}>
                                {lot.productName} - {lot.supplierLot || lot.lotNumber} - {formatDate(lot.effectiveDate)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="planning-source-fixed">
                            {dependency.sourceKind === "water"
                              ? "Sans lot"
                              : `${sourceProduct?.name ?? "Semi-fini"} - ${sourcePlan ? formatDate(sourcePlan.plannedDate) : "--"}`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : createMessage ? <p className="save-message error">{createMessage}</p> : null}
        </AppDialogShell>
      ) : null}
    </main>
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
  { id: "planification", label: "Planification", icon: "calendar" },
  { id: "traceability", label: "Lots & traçabilité", icon: "analytics" },
];

const documentItems: Array<{ id: ViewId; label: string; icon: IconName }> = [
  { id: "products", label: "Catalogue produits", icon: "database" },
  { id: "reports", label: "Rapports", icon: "report" },
];

const secondaryItems: Array<{ label: string; icon: IconName }> = [
  { label: "Parametres", icon: "settings" },
  { label: "Aide", icon: "help" },
  { label: "Recherche", icon: "search" },
];

function Sidebar({
  activeView,
  currentUser,
  onNavigate,
  onSignOut,
}: {
  activeView: ViewId;
  currentUser: User | null;
  onNavigate: (view: ViewId) => void;
  onSignOut: () => void;
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
        <button className="user-menu" onClick={onSignOut} title="Se deconnecter" type="button">
          <span className="user-avatar">{getAuthUserInitials(currentUser?.email)}</span>
          <span className="user-meta">
            <strong>{getAuthUserLabel(currentUser?.email)}</strong>
            <span>{currentUser?.email ?? "Utilisateur connecte"}</span>
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
  currentUser,
  dataStatus,
  onCheckForUpdates,
  theme,
  updaterMessage,
  updaterStatus,
  onThemeToggle,
}: {
  currentUser: User | null;
  dataStatus: "unconfigured" | "loading" | "connected" | "error";
  onCheckForUpdates: () => void;
  theme: ThemeMode;
  updaterMessage: string;
  updaterStatus: "idle" | "checking" | "downloading" | "ready" | "error";
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
        <button
          className={cx("updater-button", updaterStatus)}
          disabled={updaterStatus === "checking" || updaterStatus === "downloading"}
          onClick={onCheckForUpdates}
          title={updaterMessage || "Verifier les mises a jour"}
          type="button"
        >
          <AppIcon name="download" />
        </button>
        {updaterMessage ? <span className={cx("updater-message", updaterStatus)}>{updaterMessage}</span> : null}
        <button title="Notifications" type="button">
          <AppIcon name="bell" />
        </button>
        <button title="Aide" type="button">
          <AppIcon name="help" />
        </button>
        <div className="avatar" title={currentUser?.email ?? "Utilisateur connecte"}>
          {getAuthUserInitials(currentUser?.email)}
        </div>
      </div>
    </header>
  );
}

function AppDatePicker({
  value,
  onChange,
  placeholder = "Selectionner une date",
  allowClear = false,
  markedDates,
  markedDateLabel = "Date deja utilisee",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  markedDates?: ReadonlySet<string>;
  markedDateLabel?: string;
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
            markedDates={markedDates}
            markedDateLabel={markedDateLabel}
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

function AppCalendar({
  value,
  onChange,
  className,
  markedDates,
  markedDateLabel = "Date deja utilisee",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  markedDates?: ReadonlySet<string>;
  markedDateLabel?: string;
}) {
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
          const isMarked = markedDates?.has(dateValue) ?? false;

          return (
            <button
              aria-label={isMarked ? `${formatDate(dateValue)} - ${markedDateLabel}` : undefined}
              aria-pressed={isSelected}
              className={cx("calendar-day", isSelected && "selected", isToday && "today", isMarked && "marked")}
              key={dateValue}
              onClick={() => onChange(dateValue)}
              title={isMarked ? markedDateLabel : undefined}
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
    download: (
      <>
        <path d="M12 4v10" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 20h14" />
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
    pause: (
      <>
        <path d="M8 5v14" />
        <path d="M16 5v14" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 13h10l1-13" />
        <path d="M9 7V4h6v3" />
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
    danger: "danger",
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

  return products.filter((product) => normalizeSearchText(product.name).includes(normalizedQuery));
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
