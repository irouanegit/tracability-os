import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { DiagramProductCard } from "./DiagramProductCard";
import { TraceabilityLoader } from "./TraceabilityLoader";
import { filterByNameOrCode } from "./lib/productSearch";
import {
  fetchLotStockPreview,
  fetchProductSchemaDiagram,
  formatApiError,
  saveProductSchemaDiagram,
  updateProductLotCodification,
  type LotStockPreview,
  type Product,
  type ProductSchemaNode,
  type ProductType,
  type RecipeStatus,
  type SchemaDiagramEdge,
  type SchemaDiagramNode,
} from "./lib/traceabilityApi";
import { resolveProductionLotCodification } from "./lib/productionLotCodification";

type ProductNodeData = Record<string, unknown> & {
  product: Product;
  isTarget: boolean;
  stock: LotStockPreview | null;
};

type ProductFlowNode = Node<ProductNodeData, "product">;
type ProductFlowEdge = Edge<Record<string, unknown>, "smoothstep">;
type ConnectionCandidate = { source?: string | null; target?: string | null };
type SelectionState = { type: "node"; id: string } | { type: "edge"; id: string } | null;
type DeleteCandidate = { type: "node"; id: string; label: string; affectedNodeCount: number } | { type: "edge"; id: string; label: string; affectedNodeCount: 0 };
type ProductSidebarFilter = "semi_finished" | "raw";
type SchemaSaveTarget = { productId: string; componentProductIds: string[]; depth: number };

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

const nodeTypes = {
  product: ProductNode,
};

const defaultViewport: Viewport = { x: 0, y: 0, zoom: 0.9 };
const diagramLinkColor = "var(--diagram-link)";
const DIAGRAM_COLUMN_GAP = 380;
const DIAGRAM_ROW_GAP = 230;
const DIAGRAM_TREE_GAP = 420;
const DIAGRAM_NESTED_OFFSET = 70;

type AutoLayoutBranch = {
  component: ProductSchemaNode;
  children: AutoLayoutBranch[];
  leafSlots: number;
};

export function FabricationDiagramWorkspace({
  initialProduct,
  initialProductSidebarCollapsed = false,
  products,
  onBack,
  onSchemaSaved,
}: {
  initialProduct: Product | null;
  initialProductSidebarCollapsed?: boolean;
  products: Product[];
  onBack: () => void;
  onSchemaSaved: () => Promise<void>;
}) {
  return (
    <ReactFlowProvider>
      <FabricationDiagramWorkspaceInner
        initialProduct={initialProduct}
        initialProductSidebarCollapsed={initialProductSidebarCollapsed}
        products={products}
        onBack={onBack}
        onSchemaSaved={onSchemaSaved}
      />
    </ReactFlowProvider>
  );
}

function FabricationDiagramWorkspaceInner({
  initialProduct,
  initialProductSidebarCollapsed,
  products,
  onBack,
  onSchemaSaved,
}: {
  initialProduct: Product | null;
  initialProductSidebarCollapsed: boolean;
  products: Product[];
  onBack: () => void;
  onSchemaSaved: () => Promise<void>;
}) {
  const reactFlow = useReactFlow<ProductFlowNode, ProductFlowEdge>();
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const initialTarget = initialProduct?.type === "raw" ? null : initialProduct;
  const initialSelection = initialTarget ? ({ type: "node", id: initialTarget.id } as const) : null;

  const [targetProduct, setTargetProduct] = useState<Product | null>(initialTarget);
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState<ProductSidebarFilter>("semi_finished");
  const [isProductSidebarCollapsed, setIsProductSidebarCollapsed] = useState(initialProductSidebarCollapsed);
  const [stockByProductId, setStockByProductId] = useState<Record<string, LotStockPreview>>({});
  const [nodes, setNodes, onNodesChange] = useNodesState<ProductFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ProductFlowEdge>([]);
  const selectedRef = useRef<SelectionState>(initialSelection);
  const [selected, setSelectedState] = useState<SelectionState>(initialSelection);
  const [schemaStatus, setSchemaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<DeleteCandidate | null>(null);
  const [isCodificationPopoverOpen, setIsCodificationPopoverOpen] = useState(false);
  const [codificationDraft, setCodificationDraft] = useState({ zone: "", code: "" });
  const [codificationStatus, setCodificationStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  const selectedNode = selected?.type === "node" ? nodes.find((node) => node.id === selected.id) ?? null : null;
  const selectedEdge = selected?.type === "edge" ? edges.find((edge) => edge.id === selected.id) ?? null : null;
  const selectedCodificationProduct =
    selectedNode && selectedNode.data.product.type !== "raw" ? selectedNode.data.product : null;
  const componentNodeCount = targetProduct ? nodes.filter((node) => !node.data.isTarget).length : 0;
  const schemaSaveTargets = useMemo(() => buildSchemaSaveTargets(targetProduct, nodes, edges), [edges, nodes, targetProduct]);
  const componentEdgeIds = schemaSaveTargets.find((target) => target.productId === targetProduct?.id)?.componentProductIds ?? [];
  const canSave = Boolean(targetProduct && componentEdgeIds.length > 0 && saveStatus !== "saving");
  const sidebarProducts = useMemo(() => {
    const filteredByType =
      productFilter === "semi_finished" ? products.filter((product) => product.type === "semi_finished") : products.filter((product) => product.type === "raw");
    return filterProducts(filteredByType, productSearch);
  }, [productFilter, productSearch, products]);

  function selectSchemaItem(nextSelection: SelectionState) {
    selectedRef.current = nextSelection;
    setSelectedState(nextSelection);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadStockPreview() {
      try {
        const nextStock = await fetchLotStockPreview(products.map((product) => product.id));
        if (!cancelled) setStockByProductId(nextStock);
      } catch (error) {
        logDevError("Lot stock preview load failed", error);
      }
    }

    void loadStockPreview();

    return () => {
      cancelled = true;
    };
  }, [products]);

  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const product = productById.get(node.data.product.id);
        if (!product) return node;
        return {
          ...node,
          data: {
            ...node.data,
            product,
            stock: stockByProductId[product.id] ?? null,
          },
        };
      }),
    );
  }, [productById, setNodes, stockByProductId]);

  useEffect(() => {
    if (!targetProduct) {
      setNodes([]);
      setEdges([]);
      selectSchemaItem(null);
      setSchemaStatus("idle");
      return;
    }

    void loadTargetSchema(targetProduct);
  }, [targetProduct?.id]);

  useEffect(() => {
    if (!selectedCodificationProduct) {
      setIsCodificationPopoverOpen(false);
      setCodificationDraft({ zone: "", code: "" });
      setCodificationStatus("idle");
      return;
    }

    const resolvedCodification = resolveProductionLotCodification(selectedCodificationProduct);
    setCodificationDraft({
      zone: selectedCodificationProduct.lotZone ?? resolvedCodification?.zone ?? "",
      code: selectedCodificationProduct.lotCode ?? resolvedCodification?.code ?? "",
    });
    setCodificationStatus("idle");
  }, [
    selectedCodificationProduct?.category,
    selectedCodificationProduct?.code,
    selectedCodificationProduct?.id,
    selectedCodificationProduct?.lotCode,
    selectedCodificationProduct?.lotZone,
    selectedCodificationProduct?.name,
    selectedCodificationProduct?.type,
  ]);

  async function loadTargetSchema(product: Product) {
    setSchemaStatus("loading");
    setSaveStatus("idle");
    setMessage("");

    try {
      const schema = await fetchProductSchemaDiagram(product.id);
      const schemaProductById = new Map(productById);
      schema.diagramProducts.forEach((schemaProduct) => schemaProductById.set(schemaProduct.id, schemaProduct));
      const restoredNodes = restoreDiagramNodes(product, schema.diagramNodes, schemaProductById, stockByProductId);
      const hasSavedComponentLayout = restoredNodes.some((node) => !node.data.isTarget);
      const autoLayoutDiagram = buildAutoLayoutDiagram(product, schema.components, stockByProductId);
      const hasNestedComponentLayout = hasNestedSchemaComponents(schema.components);
      const shouldUseSavedLayout = hasSavedComponentLayout && !hasNestedComponentLayout && !hasNodeOverlap(restoredNodes);
      const baseNodes = shouldUseSavedLayout ? restoredNodes : autoLayoutDiagram.nodes;
      const baseNodeIds = new Set(baseNodes.map((node) => node.id));
      const baseEdges =
        shouldUseSavedLayout && schema.diagramEdges.length > 0
          ? restoreDiagramEdges(schema.diagramEdges, baseNodeIds)
          : autoLayoutDiagram.edges;
      const expandedDiagram = shouldUseSavedLayout ? await expandSavedSemiFinishedSchemas(baseNodes, baseEdges, product.id) : { nodes: baseNodes, edges: baseEdges };

      setNodes(expandedDiagram.nodes);
      setEdges(expandedDiagram.edges);
      selectSchemaItem({ type: "node", id: product.id });
      setSchemaStatus("ready");

      window.requestAnimationFrame(() => {
        if (shouldUseSavedLayout && schema.diagramViewport) {
          void reactFlow.setViewport(schema.diagramViewport, { duration: 120 });
        } else {
          reactFlow.fitView({ padding: 0.25, duration: 120 });
        }
      });
    } catch (error) {
      logDevError("Product schema diagram load failed", error);
      setNodes([createProductNode(product, { x: 0, y: 0 }, true, stockByProductId[product.id] ?? null)]);
      setEdges([]);
      selectSchemaItem({ type: "node", id: product.id });
      setSchemaStatus("error");
    }
  }

  async function addProductToCanvas(product: Product, position?: { x: number; y: number }) {
    if (!targetProduct) {
      setMessage("Selectionnez d'abord un produit cible.");
      setSaveStatus("error");
      return;
    }

    const currentSelection = selectedRef.current;
    const sourceNode =
      currentSelection?.type === "node" ? nodes.find((node) => node.id === currentSelection.id) : nodes.find((node) => node.id === targetProduct.id);
    const sourceProduct = sourceNode?.data.product ?? targetProduct;
    const sourceId = sourceNode?.id ?? targetProduct.id;
    const validationMessage = validateComponentProduct(sourceProduct, product);

    if (validationMessage) {
      setMessage(validationMessage);
      setSaveStatus("error");
      return;
    }

    const componentNodeId = createComponentNodeId(sourceId, product.id);
    const nodePosition = position ?? getChildNodePosition(sourceNode?.position, edges.filter((edge) => edge.source === sourceId).length);
    const componentNode = createProductNode(product, nodePosition, false, stockByProductId[product.id] ?? null, componentNodeId);
    const componentEdge = createProductEdge(sourceId, componentNodeId);
    setNodes((currentNodes) =>
      currentNodes.some((node) => node.id === componentNodeId)
        ? currentNodes
        : [...currentNodes, componentNode],
    );
    setEdges((currentEdges) =>
      currentEdges.some((edge) => edge.source === sourceId && edge.target === componentNodeId)
        ? currentEdges
        : addEdge(componentEdge, currentEdges),
    );
    selectSchemaItem({ type: "node", id: sourceId });
    setSaveStatus("idle");
    setMessage("");

    if (product.type === "semi_finished") {
      try {
        const expanded = await buildExpandedSubtree(componentNode, new Set([sourceProduct.id, product.id]), 1);
        if (expanded.nodes.length > 0 || expanded.edges.length > 0) {
          setNodes((currentNodes) => mergeNodesById(currentNodes, expanded.nodes));
          setEdges((currentEdges) => mergeEdgesById(currentEdges, expanded.edges));
        }
      } catch (error) {
        logDevError("Semi-finished schema expansion failed", error);
        setMessage(formatApiError(error, "Impossible de charger le schema du semi-fini."));
        setSaveStatus("error");
      }
    }
  }

  async function expandSavedSemiFinishedSchemas(baseNodes: ProductFlowNode[], baseEdges: ProductFlowEdge[], targetProductId: string) {
    let nextNodes = [...baseNodes];
    let nextEdges = [...baseEdges];

    for (const node of nextNodes) {
      if (node.data.isTarget || node.data.product.type !== "semi_finished") continue;
      if (nextEdges.some((edge) => edge.source === node.id)) continue;

      const expanded = await buildExpandedSubtree(node, new Set([targetProductId, node.data.product.id]), 1);
      nextNodes = mergeNodesById(nextNodes, expanded.nodes);
      nextEdges = mergeEdgesById(nextEdges, expanded.edges);
    }

    return { nodes: nextNodes, edges: nextEdges };
  }

  async function buildExpandedSubtree(
    parentNode: ProductFlowNode,
    visitedProductIds: Set<string>,
    depth: number,
  ): Promise<{ nodes: ProductFlowNode[]; edges: ProductFlowEdge[] }> {
    const schema = await fetchProductSchemaDiagram(parentNode.data.product.id);
    if (!schema.recipeId) return { nodes: [], edges: [] };

    if (schema.diagramNodes.length === 0) {
      return buildExpandedSubtreeFromComponents(parentNode, schema.components, visitedProductIds, depth);
    }

    const schemaProductById = new Map(productById);
    schema.diagramProducts.forEach((schemaProduct) => schemaProductById.set(schemaProduct.id, schemaProduct));

    const rootDiagramNode =
      schema.diagramNodes.find((diagramNode) => diagramNode.data?.isTarget) ??
      schema.diagramNodes.find((diagramNode) => (diagramNode.data?.productId ?? diagramNode.id) === parentNode.data.product.id);
    const rootDiagramNodeId = rootDiagramNode?.id ?? parentNode.data.product.id;
    const rootPosition = rootDiagramNode?.position ?? { x: 0, y: 0 };
    const clonedIdByDiagramId = new Map<string, string>([[rootDiagramNodeId, parentNode.id]]);
    const expandedNodes: ProductFlowNode[] = [];
    const expandedEdges: ProductFlowEdge[] = [];

    for (const diagramNode of schema.diagramNodes) {
      if (diagramNode.id === rootDiagramNodeId) continue;

      const productId = diagramNode.data?.productId ?? diagramNode.id;
      const product = schemaProductById.get(productId);
      if (!product) continue;
      if (product.type === "semi_finished" && visitedProductIds.has(product.id)) continue;

      const expandedNodeId = createExpandedNodeId(parentNode.id, diagramNode.id);
      clonedIdByDiagramId.set(diagramNode.id, expandedNodeId);
      expandedNodes.push(
        createProductNode(
          product,
          getExpandedNodePosition(parentNode.position, rootPosition, diagramNode.position, depth),
          false,
          stockByProductId[product.id] ?? null,
          expandedNodeId,
        ),
      );
    }

    for (const diagramEdge of schema.diagramEdges) {
      const sourceId = clonedIdByDiagramId.get(diagramEdge.source);
      const targetId = clonedIdByDiagramId.get(diagramEdge.target);
      if (!sourceId || !targetId || targetId === parentNode.id) continue;

      expandedEdges.push(createProductEdge(sourceId, targetId));
    }

    for (const expandedNode of [...expandedNodes]) {
      if (expandedNode.data.product.type !== "semi_finished") continue;

      const nestedVisitedProductIds = new Set(visitedProductIds);
      nestedVisitedProductIds.add(expandedNode.data.product.id);
      const nestedExpanded = await buildExpandedSubtree(expandedNode, nestedVisitedProductIds, depth + 1);
      expandedNodes.push(...nestedExpanded.nodes);
      expandedEdges.push(...nestedExpanded.edges);
    }

    return { nodes: expandedNodes, edges: expandedEdges };
  }

  function buildExpandedSubtreeFromComponents(
    parentNode: ProductFlowNode,
    components: ProductSchemaNode[],
    visitedProductIds: Set<string>,
    depth: number,
  ): { nodes: ProductFlowNode[]; edges: ProductFlowEdge[] } {
    const expandedNodes: ProductFlowNode[] = [];
    const expandedEdges: ProductFlowEdge[] = [];
    const branches = createAutoLayoutBranches(components, visitedProductIds);
    layoutAutoBranches(parentNode.id, parentNode.position, branches, depth, expandedNodes, expandedEdges, stockByProductId);

    return { nodes: expandedNodes, edges: expandedEdges };
  }

  const handleConnect = useCallback(
    (connection: Connection) => {
      const validationMessage = validateConnection(connection, targetProduct, nodes, edges);
      if (validationMessage) {
        setMessage(validationMessage);
        setSaveStatus("error");
        return;
      }

      setEdges((currentEdges) => addEdge(createProductEdge(connection.source!, connection.target!), currentEdges));
      setSaveStatus("idle");
      setMessage("");
    },
    [edges, nodes, setEdges, targetProduct],
  );

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const productId = event.dataTransfer.getData("application/product-id");
    const product = productById.get(productId);
    if (!product) return;

    void addProductToCanvas(product, reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function requestDeleteSelected() {
    const candidate = buildDeleteCandidate(selected, nodes, edges, targetProduct);
    if (!candidate) {
      if (selected?.type === "node" && selected.id === targetProduct?.id) {
        setSaveStatus("error");
        setMessage("Le produit cible ne peut pas etre retire du schema.");
      }
      return;
    }

    setDeleteCandidate(candidate);
  }

  function confirmDeleteSelected() {
    if (!deleteCandidate) return;

    if (deleteCandidate.type === "edge") {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== deleteCandidate.id));
      selectSchemaItem(null);
      setSaveStatus("idle");
      setMessage("");
      setDeleteCandidate(null);
      return;
    }

    const removedNodeIds = getSubtreeNodeIds(deleteCandidate.id, edges);

    setNodes((currentNodes) => currentNodes.filter((node) => !removedNodeIds.has(node.id)));
    setEdges((currentEdges) => currentEdges.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)));
    selectSchemaItem(targetProduct ? { type: "node", id: targetProduct.id } : null);
    setSaveStatus("idle");
    setMessage("");
    setDeleteCandidate(null);
  }

  function handleOpenSchema(product: Product) {
    if (product.type === "raw") return;
    setTargetProduct(product);
  }

  async function handleSaveSchema() {
    if (!targetProduct) {
      setSaveStatus("error");
      setMessage("Selectionnez un produit cible avant d'enregistrer.");
      return;
    }

    const validationMessage = validateBeforeSave(targetProduct, nodes, edges);
    if (validationMessage) {
      setSaveStatus("error");
      setMessage(validationMessage);
      return;
    }

    setSaveStatus("saving");
    setMessage("");

    try {
      const savedNodes = [...nodes];
      const savedEdges = [...edges];

      const targetsToSave = buildSchemaSaveTargets(targetProduct, savedNodes, savedEdges);

      for (const schemaTarget of targetsToSave) {
        const isRootTarget = schemaTarget.productId === targetProduct.id;
        await saveProductSchemaDiagram(schemaTarget.productId, schemaTarget.componentProductIds, {
          nodes: isRootTarget ? serializeNodes(savedNodes) : [],
          edges: isRootTarget ? serializeEdges(savedEdges) : [],
          viewport: isRootTarget ? reactFlow.getViewport() : null,
        });
      }
      await onSchemaSaved();
      setNodes(savedNodes);
      setEdges(savedEdges);
      setSaveStatus("success");
      setMessage("Schema enregistre.");
    } catch (error) {
      logDevError("Schema save failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible d'enregistrer le schema."));
    }
  }

  async function handleSaveCodification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCodificationProduct) return;

    const lotZone = codificationDraft.zone.trim();
    const lotCode = codificationDraft.code.trim().replace(/\s+/g, "");

    if (!lotZone || !lotCode) {
      setCodificationStatus("error");
      setSaveStatus("error");
      setMessage("Zone et codification sont requises.");
      return;
    }

    const duplicateProduct = findProductWithMatchingCodification(products, selectedCodificationProduct.id, lotZone, lotCode);
    if (duplicateProduct) {
      setCodificationStatus("error");
      setSaveStatus("error");
      setMessage(`Codification deja utilisee par ${duplicateProduct.name}.`);
      return;
    }

    setCodificationStatus("saving");
    setMessage("");

    try {
      await updateProductLotCodification(selectedCodificationProduct.id, lotZone, lotCode);
      applyProductCodification(selectedCodificationProduct.id, lotZone, lotCode);
      await onSchemaSaved();
      setCodificationDraft({ zone: lotZone, code: lotCode });
      setIsCodificationPopoverOpen(false);
      setCodificationStatus("success");
      setSaveStatus("success");
      setMessage("Codification enregistree.");
    } catch (error) {
      logDevError("Product codification save failed", error);
      setCodificationStatus("error");
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible d'enregistrer la codification."));
    }
  }

  function applyProductCodification(productId: string, lotZone: string, lotCode: string) {
    const patchProduct = (product: Product): Product => (product.id === productId ? { ...product, lotZone, lotCode } : product);

    setTargetProduct((currentTarget) => (currentTarget ? patchProduct(currentTarget) : currentTarget));
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          product: patchProduct(node.data.product),
        },
      })),
    );
  }

  const onNodeClick: NodeMouseHandler<ProductFlowNode> = (_event, node) => selectSchemaItem({ type: "node", id: node.id });
  const onEdgeClick: EdgeMouseHandler<ProductFlowEdge> = (_event, edge) => selectSchemaItem({ type: "edge", id: edge.id });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || deleteCandidate || !isDeleteKey(event) || isEditableKeyboardTarget(event.target)) return;
      const candidate = buildDeleteCandidate(selected, nodes, edges, targetProduct);
      if (!candidate) return;

      event.preventDefault();
      requestDeleteSelected();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleteCandidate, edges, nodes, selected, targetProduct]);

  return (
    <main className="diagram-fullscreen-page">
      <section className="diagram-canvas-card fullscreen">
        <div className="diagram-floating-actions">
          <div className="codification-popover-wrapper">
            <button
              className="button secondary"
              disabled={!selectedCodificationProduct || codificationStatus === "saving"}
              onClick={() => setIsCodificationPopoverOpen((current) => !current)}
              title={selectedCodificationProduct ? "Modifier la codification du lot" : "Selectionnez une carte produit"}
              type="button"
            >
              Codification
            </button>
            {isCodificationPopoverOpen && selectedCodificationProduct ? (
              <form className="codification-popover" onSubmit={handleSaveCodification}>
                <div className="codification-popover-title">
                  <span>Produit selectionne</span>
                  <strong>{selectedCodificationProduct.name}</strong>
                </div>
                <label>
                  <span>Zone number</span>
                  <input
                    autoComplete="off"
                    value={codificationDraft.zone}
                    onChange={(event) => setCodificationDraft((draft) => ({ ...draft, zone: event.target.value }))}
                    placeholder="PBC02"
                  />
                </label>
                <label>
                  <span>Codification number</span>
                  <input
                    autoComplete="off"
                    value={codificationDraft.code}
                    onChange={(event) => setCodificationDraft((draft) => ({ ...draft, code: event.target.value }))}
                    placeholder="PV"
                  />
                </label>
                <div className="codification-popover-actions">
                  <button className="button secondary" onClick={() => setIsCodificationPopoverOpen(false)} type="button">
                    Annuler
                  </button>
                  <button className="button primary" disabled={codificationStatus === "saving"} type="submit">
                    {codificationStatus === "saving" ? "..." : "Enregistrer"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          <span className={`diagram-status ${schemaStatus}`}>
            {schemaStatus === "loading" ? <TraceabilityLoader compact label="Chargement" /> : `${componentEdgeIds.length} lien(s)`}
          </span>
          <button className="button secondary" onClick={onBack} type="button">
            Retour
          </button>
          <button className="button primary" disabled={!canSave} onClick={handleSaveSchema} type="button">
            {saveStatus === "saving" ? <TraceabilityLoader compact label="Enregistrement..." /> : "Enregistrer schema"}
          </button>
        </div>

        {message ? <p className={`save-message ${saveStatus === "error" ? "error" : "success"} diagram-floating-message`}>{message}</p> : null}

        <aside className={isProductSidebarCollapsed ? "diagram-floating-target collapsed" : "diagram-floating-target"}>
          <button
            aria-label={isProductSidebarCollapsed ? "Afficher la liste produits" : "Masquer la liste produits"}
            className="diagram-sidebar-toggle"
            onClick={() => setIsProductSidebarCollapsed((current) => !current)}
            title={isProductSidebarCollapsed ? "Afficher" : "Masquer"}
            type="button"
          >
            <SidebarToggleIcon collapsed={isProductSidebarCollapsed} />
          </button>
          <div className="diagram-sidebar-body">
            <div className="diagram-product-filter">
              <button className={productFilter === "semi_finished" ? "active" : ""} onClick={() => setProductFilter("semi_finished")} type="button">
                Semi fini
              </button>
              <button className={productFilter === "raw" ? "active" : ""} onClick={() => setProductFilter("raw")} type="button">
                Matiere premiere
              </button>
            </div>
            <input autoComplete="off" className="diagram-search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
            <ProductSidebarList
              mode={productFilter}
              products={sidebarProducts}
              stockByProductId={stockByProductId}
              targetProduct={targetProduct}
              onAddComponent={addProductToCanvas}
            />
          </div>
        </aside>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultViewport={defaultViewport}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          isValidConnection={(connection) => !validateConnection(connection, targetProduct, nodes, edges)}
          minZoom={0.05}
          deleteKeyCode={null}
          nodesDraggable
          nodesConnectable={Boolean(targetProduct)}
          onConnect={handleConnect}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleDrop}
          onEdgeClick={onEdgeClick}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodesChange={onNodesChange}
          onPaneClick={() => selectSchemaItem(null)}
        >
          <Background color="var(--diagram-grid-dot)" gap={20} size={1.45} />
          <Controls position="bottom-right" />
          <MiniMap nodeColor={miniMapNodeColor} pannable zoomable />
        </ReactFlow>
        {!targetProduct ? <div className="diagram-empty">Selectionnez un produit cible pour commencer.</div> : null}
        {targetProduct && componentNodeCount === 0 ? <div className="diagram-empty">Ajoutez des composants depuis la recherche flottante.</div> : null}
      </section>
      {deleteCandidate ? (
        <DeleteConfirmationDialog candidate={deleteCandidate} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmDeleteSelected} />
      ) : null}
    </main>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="diagram-sidebar-toggle-icon" fill="none" viewBox="0 0 24 24">
      <rect className="toggle-icon-frame" height="16" rx="4" width="18" x="3" y="4" />
      <path className="toggle-icon-panel" d="M9 4v16" />
      <path className="toggle-icon-arrow" d={collapsed ? "M13 9l3 3-3 3" : "M16 9l-3 3 3 3"} />
    </svg>
  );
}

function ProductNode({ data, selected }: NodeProps<ProductFlowNode>) {
  const { product, isTarget } = data;
  const canHaveComponents = isTarget || product.type === "semi_finished";

  return (
    <DiagramProductCard
      canHaveComponents={canHaveComponents}
      headerBadge={product.recipeStatus === "active" && product.type === "semi_finished" ? "Schema" : undefined}
      headerText={product.code}
      isTarget={isTarget}
      productName={product.name}
      productType={product.type}
      selected={selected}
    />
  );
}

function ProductSidebarList({
  products,
  mode,
  targetProduct,
  stockByProductId,
  onAddComponent,
}: {
  products: Product[];
  mode: ProductSidebarFilter;
  targetProduct: Product | null;
  stockByProductId: Record<string, LotStockPreview>;
  onAddComponent: (product: Product) => void | Promise<void>;
}) {
  return (
    <div className="diagram-product-list">
      {products.map((product) => {
        const isCurrentTarget = product.id === targetProduct?.id;
        const disabled = !targetProduct || isCurrentTarget;
        const handleClick = () => {
          if (disabled) return;
          void onAddComponent(product);
        };

        return (
          <button
            className={`diagram-product-list-item ${isCurrentTarget ? "selected" : ""}`}
            disabled={disabled}
            draggable={!disabled}
            key={product.id}
            onDragStart={(event) => {
              if (disabled) return;
              event.dataTransfer.setData("application/product-id", product.id);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={handleClick}
            type="button"
          >
            <div>
              <strong>{product.name}</strong>
              <span>{product.code}</span>
              <div className="component-meta">
                <span className={`type-pill ${product.type}`}>{typeLabels[product.type]}</span>
                <span>{formatStockPreview(stockByProductId[product.id])}</span>
              </div>
            </div>
          </button>
        );
      })}
      {products.length === 0 ? <div className="schema-empty compact">Aucun produit trouve.</div> : null}
    </div>
  );
}

function DeleteConfirmationDialog({
  candidate,
  onCancel,
  onConfirm,
}: {
  candidate: DeleteCandidate;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isBranchDelete = candidate.type === "node" && candidate.affectedNodeCount > 1;
  const body =
    candidate.type === "edge"
      ? `Supprimer le lien "${candidate.label}" du schema ?`
      : isBranchDelete
        ? `Retirer "${candidate.label}" et ses ${candidate.affectedNodeCount - 1} composant(s) enfant(s) visibles du schema ?`
        : `Retirer "${candidate.label}" du schema ?`;

  return (
    <div aria-labelledby="diagram-delete-title" aria-modal="true" className="app-dialog-overlay modal" role="dialog">
      <button aria-label="Annuler la suppression" className="app-dialog-backdrop" onClick={onCancel} type="button" />
      <section className="app-dialog-surface modal diagram-delete-dialog">
        <div className="app-dialog-header">
          <h2 id="diagram-delete-title">Confirmer la suppression</h2>
        </div>
        <div className="app-dialog-body">
          <p>{body}</p>
          <p className="dialog-muted-text">Cette action modifie le schema en cours. Elle sera definitive apres enregistrement du schema.</p>
        </div>
        <div className="app-dialog-footer">
          <button className="button secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="button danger-soft" onClick={onConfirm} type="button">
            Supprimer
          </button>
        </div>
      </section>
    </div>
  );
}

function DiagramDetailsPanel({
  node,
  edge,
  targetProduct,
  onDelete,
  onOpenSchema,
}: {
  node: ProductFlowNode | null;
  edge: ProductFlowEdge | null;
  targetProduct: Product | null;
  onDelete: () => void;
  onOpenSchema: (product: Product) => void;
}) {
  const product = node?.data.product ?? null;

  return (
    <aside className="diagram-panel">
      <section className="diagram-panel-section">
        <div className="panel-title no-border">
          <span className="panel-icon">DT</span>
          <div>
            <h2>Details</h2>
            <p>{product ? product.code : edge ? "Connexion" : "Aucune selection"}</p>
          </div>
        </div>

        {product ? (
          <div className="selected-detail-body">
            <div className="selected-product-title">
              <strong>{product.name}</strong>
              <span className={`type-pill ${product.type}`}>{typeLabels[product.type]}</span>
            </div>
            <div className="detail-list">
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
                <strong>{formatStockPreview(node?.data.stock)}</strong>
              </div>
            </div>
            <div className="selected-actions">
              {product.id !== targetProduct?.id ? (
                <button className="button secondary" onClick={onDelete} type="button">
                  Retirer
                </button>
              ) : null}
              {product.type === "semi_finished" && product.id !== targetProduct?.id ? (
                <button className="button primary" onClick={() => onOpenSchema(product)} type="button">
                  Ouvrir schema
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {edge ? (
          <div className="selected-detail-body">
            <div className="selected-product-title">
              <strong>Lien de composition</strong>
              <span>Ce produit utilise ce composant.</span>
            </div>
            <button className="button secondary" onClick={onDelete} type="button">
              Supprimer le lien
            </button>
          </div>
        ) : null}

        {!product && !edge ? <div className="schema-empty">Selectionnez une carte ou un lien.</div> : null}
      </section>
    </aside>
  );
}

function createProductNode(
  product: Product,
  position: { x: number; y: number },
  isTarget: boolean,
  stock: LotStockPreview | null,
  nodeId = product.id,
): ProductFlowNode {
  return {
    id: nodeId,
    type: "product",
    position,
    data: {
      product,
      isTarget,
      stock,
    },
  };
}

function createProductEdge(source: string, target: string): ProductFlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: diagramLinkColor },
    style: { stroke: diagramLinkColor, strokeWidth: 2 },
  };
}

function hasNodeOverlap(nodes: ProductFlowNode[]) {
  return nodes.some((node, index) =>
    nodes.slice(index + 1).some(
      (otherNode) =>
        Math.abs(node.position.x - otherNode.position.x) < 250 &&
        Math.abs(node.position.y - otherNode.position.y) < 160,
    ),
  );
}

function restoreDiagramNodes(
  targetProduct: Product,
  diagramNodes: SchemaDiagramNode[],
  productById: Map<string, Product>,
  stockByProductId: Record<string, LotStockPreview>,
) {
  const nodes = diagramNodes.flatMap((diagramNode) => {
    const productId = diagramNode.data?.productId ?? diagramNode.id;
    const product = productById.get(productId);
    if (!product) return [];

    return [
      createProductNode(
        product,
        diagramNode.position,
        product.id === targetProduct.id || Boolean(diagramNode.data?.isTarget),
        stockByProductId[product.id] ?? null,
        diagramNode.id,
      ),
    ];
  });

  if (!nodes.some((node) => node.id === targetProduct.id)) {
    nodes.unshift(createProductNode(targetProduct, { x: 0, y: 0 }, true, stockByProductId[targetProduct.id] ?? null));
  }

  return nodes;
}

function restoreDiagramEdges(diagramEdges: SchemaDiagramEdge[], nodeIds: Set<string>): ProductFlowEdge[] {
  return diagramEdges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => createProductEdge(edge.source, edge.target));
}

function buildAutoLayoutDiagram(targetProduct: Product, components: ProductSchemaNode[], stockByProductId: Record<string, LotStockPreview>) {
  const targetPosition = { x: -DIAGRAM_TREE_GAP, y: 0 };
  const rootNode = createProductNode(targetProduct, targetPosition, true, stockByProductId[targetProduct.id] ?? null);
  const branches = createAutoLayoutBranches(components, new Set([targetProduct.id]));
  const nodes: ProductFlowNode[] = [rootNode];
  const edges: ProductFlowEdge[] = [];

  layoutAutoBranches(targetProduct.id, targetPosition, branches, 1, nodes, edges, stockByProductId);

  return { nodes, edges };
}

function hasNestedSchemaComponents(components: ProductSchemaNode[]): boolean {
  return components.some((component) => component.children.length > 0 || hasNestedSchemaComponents(component.children));
}

function createAutoLayoutBranches(components: ProductSchemaNode[], visitedProductIds: Set<string>): AutoLayoutBranch[] {
  return components.flatMap((component) => {
    if (visitedProductIds.has(component.id)) return [];

    const nextVisitedProductIds = new Set(visitedProductIds);
    nextVisitedProductIds.add(component.id);
    const children = component.type === "semi_finished" ? createAutoLayoutBranches(component.children, nextVisitedProductIds) : [];

    return [
      {
        component,
        children,
        leafSlots: Math.max(1, sumBranchLeafSlots(children)),
      },
    ];
  });
}

function sumBranchLeafSlots(branches: AutoLayoutBranch[]) {
  return branches.reduce((total, branch) => total + branch.leafSlots, 0);
}

function layoutAutoBranches(
  parentNodeId: string,
  parentPosition: { x: number; y: number },
  branches: AutoLayoutBranch[],
  depth: number,
  nodes: ProductFlowNode[],
  edges: ProductFlowEdge[],
  stockByProductId: Record<string, LotStockPreview>,
) {
  if (branches.length === 0) return;

  const totalLeafSlots = sumBranchLeafSlots(branches);
  let nextSlotStart = 0;

  branches.forEach((branch) => {
    const nodeY = parentPosition.y + (nextSlotStart + (branch.leafSlots - 1) / 2 - (totalLeafSlots - 1) / 2) * DIAGRAM_ROW_GAP;
    const nodePosition = {
      x: parentPosition.x + DIAGRAM_TREE_GAP + (depth - 1) * DIAGRAM_NESTED_OFFSET,
      y: nodeY,
    };
    const nodeId = createComponentNodeId(parentNodeId, branch.component.id);

    nodes.push(
      createProductNode(
        branch.component,
        nodePosition,
        false,
        branch.component.stock ?? stockByProductId[branch.component.id] ?? null,
        nodeId,
      ),
    );
    edges.push(createProductEdge(parentNodeId, nodeId));

    layoutAutoBranches(nodeId, nodePosition, branch.children, depth + 1, nodes, edges, stockByProductId);
    nextSlotStart += branch.leafSlots;
  });
}

function getGridPosition(index: number, total: number) {
  const columns = Math.min(3, Math.max(1, total));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const rows = Math.ceil(total / columns);
  const startX = -((columns - 1) * DIAGRAM_COLUMN_GAP) / 2;
  const startY = -((rows - 1) * DIAGRAM_ROW_GAP) / 2;

  return {
    x: 80 + startX + column * DIAGRAM_COLUMN_GAP,
    y: startY + row * DIAGRAM_ROW_GAP,
  };
}

function getNextNodePosition(count: number) {
  return getGridPosition(Math.max(0, count - 1), Math.max(1, count));
}

function getChildNodePosition(parentPosition: { x: number; y: number } | undefined, siblingCount: number) {
  if (!parentPosition) return getNextNodePosition(siblingCount + 1);

  return {
    x: parentPosition.x + DIAGRAM_TREE_GAP,
    y: parentPosition.y + (siblingCount - 0.5) * DIAGRAM_ROW_GAP,
  };
}

function createComponentNodeId(sourceNodeId: string, productId: string) {
  return `${sourceNodeId}__${productId}`;
}

function createExpandedNodeId(parentNodeId: string, diagramNodeId: string) {
  return `${parentNodeId}__schema__${diagramNodeId}`;
}

function getExpandedNodePosition(
  parentPosition: { x: number; y: number },
  rootPosition: { x: number; y: number },
  nodePosition: { x: number; y: number },
  depth: number,
) {
  return {
    x: parentPosition.x + DIAGRAM_TREE_GAP + (nodePosition.x - rootPosition.x) + (depth - 1) * DIAGRAM_NESTED_OFFSET,
    y: parentPosition.y + (nodePosition.y - rootPosition.y),
  };
}

function mergeNodesById(currentNodes: ProductFlowNode[], incomingNodes: ProductFlowNode[]) {
  const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
  incomingNodes.forEach((node) => nodesById.set(node.id, node));
  return [...nodesById.values()];
}

function mergeEdgesById(currentEdges: ProductFlowEdge[], incomingEdges: ProductFlowEdge[]) {
  const edgesById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  incomingEdges.forEach((edge) => edgesById.set(edge.id, edge));
  return [...edgesById.values()];
}

function buildDeleteCandidate(selected: SelectionState, nodes: ProductFlowNode[], edges: ProductFlowEdge[], targetProduct: Product | null): DeleteCandidate | null {
  if (!selected) return null;

  if (selected.type === "edge") {
    const edge = edges.find((candidate) => candidate.id === selected.id);
    if (!edge) return null;
    const source = nodes.find((node) => node.id === edge.source)?.data.product.name ?? "source";
    const target = nodes.find((node) => node.id === edge.target)?.data.product.name ?? "composant";
    return { type: "edge", id: selected.id, label: `${source} -> ${target}`, affectedNodeCount: 0 };
  }

  if (selected.id === targetProduct?.id) return null;

  const node = nodes.find((candidate) => candidate.id === selected.id);
  if (!node) return null;

  return {
    type: "node",
    id: selected.id,
    label: node.data.product.name,
    affectedNodeCount: getSubtreeNodeIds(selected.id, edges).size,
  };
}

function getSubtreeNodeIds(rootNodeId: string, edges: ProductFlowEdge[]) {
  const nodeIds = new Set<string>([rootNodeId]);
  const pending = [rootNodeId];

  while (pending.length > 0) {
    const currentId = pending.shift()!;
    for (const edge of edges) {
      if (edge.source !== currentId || nodeIds.has(edge.target)) continue;
      nodeIds.add(edge.target);
      pending.push(edge.target);
    }
  }

  return nodeIds;
}

function isDeleteKey(event: KeyboardEvent) {
  return (
    event.key === "Delete" ||
    event.key === "Backspace" ||
    event.key === "Clear" ||
    event.key === "Cancel" ||
    event.code === "Delete" ||
    event.code === "Backspace"
  );
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function validateComponentProduct(sourceProduct: Product, product: Product) {
  if (sourceProduct.type === "raw") return "Selectionnez une carte produit fini ou semi-fini avant d'ajouter un composant.";
  if (product.id === sourceProduct.id) return "Un produit ne peut pas etre lie a lui-meme.";
  if (product.type === "finished") return "Un produit fini ne peut pas etre utilise comme composant.";
  return "";
}

function validateConnection(connection: ConnectionCandidate, targetProduct: Product | null, nodes: ProductFlowNode[], edges: ProductFlowEdge[]) {
  if (!targetProduct || !connection.source || !connection.target) return "Selectionnez un produit cible.";
  if (connection.source === connection.target) return "Un produit ne peut pas etre lie a lui-meme.";
  if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return "Ce composant est deja lie au schema.";
  if (edges.some((edge) => edge.target === connection.target && edge.source !== connection.source)) {
    return "Cette carte a deja un parent. Ajoutez le produit depuis la barre laterale pour creer une carte separee.";
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode) return "La carte source est introuvable.";
  if (sourceNode.data.product.type === "raw") return "Une matiere premiere ne peut pas avoir de composants.";
  if (!targetNode) return "Le composant cible est introuvable.";
  if (targetNode.data.product.type === "finished") return "Un produit fini ne peut pas etre utilise comme composant.";

  return "";
}

function validateBeforeSave(targetProduct: Product, nodes: ProductFlowNode[], edges: ProductFlowEdge[]) {
  const componentNodes = nodes.filter((node) => !node.data.isTarget);
  const directComponentIds = new Set(getDirectComponentIds(targetProduct, nodes, edges));
  const linkedNodeIds = new Set(edges.map((edge) => edge.target));

  if (componentNodes.length === 0) return "Ajoutez au moins un composant avant d'enregistrer.";
  if (directComponentIds.size === 0) return "Connectez au moins un composant au produit cible.";

  const unconnected = componentNodes.filter((node) => !linkedNodeIds.has(node.id));
  if (unconnected.length > 0) return `Composant non connecte: ${unconnected[0].data.product.name}.`;

  return "";
}

function buildSchemaSaveTargets(targetProduct: Product | null, nodes: ProductFlowNode[], edges: ProductFlowEdge[]): SchemaSaveTarget[] {
  if (!targetProduct) return [];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const depthByNodeId = getNodeDepths(targetProduct.id, edges);
  const targetsByProductId = new Map<string, SchemaSaveTarget>();

  for (const node of nodes) {
    const product = node.data.product;
    const canOwnSchema = product.id === targetProduct.id || product.type === "semi_finished";
    if (!canOwnSchema || product.type === "raw") continue;

    const componentProductIds = [
      ...new Set(
        edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => nodeById.get(edge.target)?.data.product.id)
          .filter((productId): productId is string => Boolean(productId) && productId !== product.id),
      ),
    ];
    if (componentProductIds.length === 0) continue;

    const depth = depthByNodeId.get(node.id) ?? 0;
    const existingTarget = targetsByProductId.get(product.id);
    if (!existingTarget) {
      targetsByProductId.set(product.id, { productId: product.id, componentProductIds, depth });
      continue;
    }

    componentProductIds.forEach((componentProductId) => {
      if (!existingTarget.componentProductIds.includes(componentProductId)) {
        existingTarget.componentProductIds.push(componentProductId);
      }
    });
    existingTarget.depth = Math.max(existingTarget.depth, depth);
  }

  return [...targetsByProductId.values()].sort((left, right) => {
    if (left.productId === targetProduct.id) return 1;
    if (right.productId === targetProduct.id) return -1;
    return right.depth - left.depth;
  });
}

function getNodeDepths(rootNodeId: string, edges: ProductFlowEdge[]) {
  const depthByNodeId = new Map<string, number>([[rootNodeId, 0]]);
  const pending = [rootNodeId];

  while (pending.length > 0) {
    const source = pending.shift()!;
    const sourceDepth = depthByNodeId.get(source) ?? 0;

    for (const edge of edges) {
      if (edge.source !== source || depthByNodeId.has(edge.target)) continue;
      depthByNodeId.set(edge.target, sourceDepth + 1);
      pending.push(edge.target);
    }
  }

  return depthByNodeId;
}

function getDirectComponentIds(targetProduct: Product | null, nodes: ProductFlowNode[], edges: ProductFlowEdge[]) {
  if (!targetProduct) return [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return [
    ...new Set(
      edges
        .filter((edge) => edge.source === targetProduct.id && nodeById.has(edge.target))
        .map((edge) => nodeById.get(edge.target)?.data.product.id)
        .filter((productId): productId is string => Boolean(productId)),
    ),
  ];
}

function serializeNodes(nodes: ProductFlowNode[]): SchemaDiagramNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      productId: node.data.product.id,
      isTarget: node.data.isTarget,
    },
  }));
}

function serializeEdges(edges: ProductFlowEdge[]): SchemaDiagramEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
  }));
}

function filterProducts(products: Product[], query: string) {
  return filterByNameOrCode(products, query);
}

function findProductWithMatchingCodification(products: Product[], currentProductId: string, lotZone: string, lotCode: string) {
  const normalizedTarget = normalizeCodificationKey(lotZone, lotCode);
  if (!normalizedTarget) return null;

  return (
    products.find((product) => {
      if (product.id === currentProductId || product.type === "raw") return false;
      const resolvedCodification = resolveProductionLotCodification(product);
      if (!resolvedCodification) return false;
      return normalizeCodificationKey(resolvedCodification.zone, resolvedCodification.code) === normalizedTarget;
    }) ?? null
  );
}

function normalizeCodificationKey(lotZone: string, lotCode: string) {
  const normalizedZone = normalizeCodificationZone(lotZone);
  const normalizedCode = lotCode.trim().toUpperCase().replace(/\s+/g, "").replace(/^-+|-+$/g, "");
  return normalizedZone && normalizedCode ? `${normalizedZone}:${normalizedCode}` : "";
}

function normalizeCodificationZone(lotZone: string) {
  const compactZone = lotZone.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  const pbcZone = compactZone.match(/^PBC(\d{1,2})$/);
  if (pbcZone) return `PBC${pbcZone[1].padStart(2, "0")}`;

  const numericZone = compactZone.match(/^(\d{1,2})$/);
  if (numericZone) return `PBC${numericZone[1].padStart(2, "0")}`;

  return compactZone.replace(/^-+|-+$/g, "");
}

function logDevError(message: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.error(message, error);
  }
}

function miniMapNodeColor(node: ProductFlowNode) {
  if (node.data.product.type === "finished") return "#3fcf8e";
  if (node.data.product.type === "semi_finished") return "#7a5c06";
  return "#216fe6";
}

function formatStockPreview(stock: LotStockPreview | null | undefined) {
  if (!stock?.lotNumber) return "Aucun lot lie";
  return `Lot: ${stock.lotNumber}`;
}
