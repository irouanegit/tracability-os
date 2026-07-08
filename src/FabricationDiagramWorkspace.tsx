import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
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
import {
  fetchLotStockPreview,
  fetchProductSchemaDiagram,
  formatApiError,
  saveProductSchemaDiagram,
  type LotStockPreview,
  type Product,
  type ProductType,
  type RecipeStatus,
  type SchemaDiagramEdge,
  type SchemaDiagramNode,
} from "./lib/traceabilityApi";

type ProductNodeData = Record<string, unknown> & {
  product: Product;
  isTarget: boolean;
  stock: LotStockPreview | null;
};

type ProductFlowNode = Node<ProductNodeData, "product">;
type ProductFlowEdge = Edge<Record<string, unknown>, "smoothstep">;
type ConnectionCandidate = { source?: string | null; target?: string | null };
type SelectionState = { type: "node"; id: string } | { type: "edge"; id: string } | null;
type ProductSidebarFilter = "semi_finished" | "raw";

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

export function FabricationDiagramWorkspace({
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
  return (
    <ReactFlowProvider>
      <FabricationDiagramWorkspaceInner initialProduct={initialProduct} products={products} onBack={onBack} onSchemaSaved={onSchemaSaved} />
    </ReactFlowProvider>
  );
}

function FabricationDiagramWorkspaceInner({
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
  const reactFlow = useReactFlow<ProductFlowNode, ProductFlowEdge>();
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const initialTarget = initialProduct?.type === "raw" ? null : initialProduct;

  const [targetProduct, setTargetProduct] = useState<Product | null>(initialTarget);
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState<ProductSidebarFilter>("semi_finished");
  const [isProductSidebarCollapsed, setIsProductSidebarCollapsed] = useState(false);
  const [stockByProductId, setStockByProductId] = useState<Record<string, LotStockPreview>>({});
  const [nodes, setNodes, onNodesChange] = useNodesState<ProductFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ProductFlowEdge>([]);
  const [selected, setSelected] = useState<SelectionState>(initialTarget ? { type: "node", id: initialTarget.id } : null);
  const [schemaStatus, setSchemaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedNode = selected?.type === "node" ? nodes.find((node) => node.id === selected.id) ?? null : null;
  const selectedEdge = selected?.type === "edge" ? edges.find((edge) => edge.id === selected.id) ?? null : null;
  const componentNodeCount = targetProduct ? nodes.filter((node) => !node.data.isTarget).length : 0;
  const componentEdgeIds = getDirectComponentIds(targetProduct, nodes, edges);
  const canSave = Boolean(targetProduct && componentEdgeIds.length > 0 && saveStatus !== "saving");
  const sidebarProducts = useMemo(() => {
    const filteredByType =
      productFilter === "semi_finished" ? products.filter((product) => product.type === "semi_finished") : products.filter((product) => product.type === "raw");
    return filterProducts(filteredByType, productSearch);
  }, [productFilter, productSearch, products]);

  useEffect(() => {
    let cancelled = false;

    async function loadStockPreview() {
      try {
        const nextStock = await fetchLotStockPreview(products.map((product) => product.id));
        if (!cancelled) setStockByProductId(nextStock);
      } catch (error) {
        console.error("Lot stock preview load failed", error);
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
      setSelected(null);
      setSchemaStatus("idle");
      return;
    }

    void loadTargetSchema(targetProduct);
  }, [targetProduct?.id]);

  async function loadTargetSchema(product: Product) {
    setSchemaStatus("loading");
    setSaveStatus("idle");
    setMessage("");

    try {
      const schema = await fetchProductSchemaDiagram(product.id);
      const schemaProductById = new Map(productById);
      schema.diagramProducts.forEach((schemaProduct) => schemaProductById.set(schemaProduct.id, schemaProduct));
      const restoredNodes = restoreDiagramNodes(product, schema.diagramNodes, schemaProductById, stockByProductId);
      const baseNodes =
        restoredNodes.length > 0 ? restoredNodes : buildDefaultDiagramNodes(product, schema.components, stockByProductId);
      const baseNodeIds = new Set(baseNodes.map((node) => node.id));
      const baseEdges =
        schema.diagramEdges.length > 0
          ? restoreDiagramEdges(schema.diagramEdges, baseNodeIds)
          : schema.components.map((component) => createProductEdge(product.id, createComponentNodeId(product.id, component.id)));
      const expandedDiagram = await expandSavedSemiFinishedSchemas(baseNodes, baseEdges, product.id);

      setNodes(expandedDiagram.nodes);
      setEdges(expandedDiagram.edges);
      setSelected({ type: "node", id: product.id });
      setSchemaStatus("ready");

      window.requestAnimationFrame(() => {
        if (schema.diagramViewport) {
          void reactFlow.setViewport(schema.diagramViewport, { duration: 120 });
        } else {
          reactFlow.fitView({ padding: 0.25, duration: 120 });
        }
      });
    } catch (error) {
      console.error("Product schema diagram load failed", error);
      setNodes([createProductNode(product, { x: 0, y: 0 }, true, stockByProductId[product.id] ?? null)]);
      setEdges([]);
      setSelected({ type: "node", id: product.id });
      setSchemaStatus("error");
    }
  }

  async function addProductToCanvas(product: Product, position?: { x: number; y: number }) {
    if (!targetProduct) {
      setMessage("Selectionnez d'abord un produit cible.");
      setSaveStatus("error");
      return;
    }

    const sourceNode = selected?.type === "node" ? nodes.find((node) => node.id === selected.id) : nodes.find((node) => node.id === targetProduct.id);
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
    setSelected({ type: "node", id: sourceId });
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
        console.error("Semi-finished schema expansion failed", error);
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
    if (!schema.recipeId || schema.diagramNodes.length === 0) return { nodes: [], edges: [] };

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

  function handleDeleteSelected() {
    if (!selected) return;

    if (selected.type === "edge") {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selected.id));
      setSelected(null);
      setSaveStatus("idle");
      return;
    }

    if (selected.id === targetProduct?.id) return;

    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selected.id));
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== selected.id && edge.target !== selected.id));
    setSelected(targetProduct ? { type: "node", id: targetProduct.id } : null);
    setSaveStatus("idle");
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

      await saveProductSchemaDiagram(targetProduct.id, componentEdgeIds, {
        nodes: serializeNodes(savedNodes),
        edges: serializeEdges(savedEdges),
        viewport: reactFlow.getViewport(),
      });
      await onSchemaSaved();
      setNodes(savedNodes);
      setEdges(savedEdges);
      setSaveStatus("success");
      setMessage("Schema enregistre.");
    } catch (error) {
      console.error("Schema save failed", error);
      setSaveStatus("error");
      setMessage(formatApiError(error, "Impossible d'enregistrer le schema."));
    }
  }

  const onNodeClick: NodeMouseHandler<ProductFlowNode> = (_event, node) => setSelected({ type: "node", id: node.id });
  const onEdgeClick: EdgeMouseHandler<ProductFlowEdge> = (_event, edge) => setSelected({ type: "edge", id: edge.id });

  return (
    <main className="diagram-fullscreen-page">
      <section className="diagram-canvas-card fullscreen">
        <div className="diagram-floating-actions">
          <span className={`diagram-status ${schemaStatus}`}>{schemaStatus === "loading" ? "Chargement" : `${componentEdgeIds.length} lien(s)`}</span>
          <button className="button secondary" onClick={onBack} type="button">
            Retour
          </button>
          <button className="button primary" disabled={!canSave} onClick={handleSaveSchema} type="button">
            {saveStatus === "saving" ? "Enregistrement..." : "Enregistrer schema"}
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
          onPaneClick={() => setSelected(null)}
        >
          <Background color="#3f3f46" gap={22} size={1.15} />
          <Controls position="bottom-right" />
          <MiniMap nodeColor={miniMapNodeColor} pannable zoomable />
        </ReactFlow>
        {!targetProduct ? <div className="diagram-empty">Selectionnez un produit cible pour commencer.</div> : null}
        {targetProduct && componentNodeCount === 0 ? <div className="diagram-empty">Ajoutez des composants depuis la recherche flottante.</div> : null}
      </section>
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
  const { product, isTarget, stock } = data;
  const canHaveComponents = isTarget || product.type === "semi_finished";

  return (
    <div className={`diagram-node ${product.type} ${isTarget ? "target" : ""} ${selected ? "selected" : ""}`}>
      {!isTarget ? <Handle className="diagram-handle target-handle" position={Position.Left} type="target" /> : null}
      {canHaveComponents ? <Handle className="diagram-handle source-handle" position={Position.Right} type="source" /> : null}
      <div className="diagram-node-header">
        <span>{product.code}</span>
        {product.recipeStatus === "active" && product.type === "semi_finished" ? <b>Schema</b> : null}
      </div>
      <strong>{product.name}</strong>
      <div className="diagram-node-meta">
        <span className={`type-pill ${product.type}`}>{typeLabels[product.type]}</span>
      </div>
      <small>{formatStockPreview(stock)}</small>
    </div>
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
    markerEnd: { type: MarkerType.ArrowClosed },
  };
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

function buildDefaultDiagramNodes(targetProduct: Product, components: Product[], stockByProductId: Record<string, LotStockPreview>) {
  return [
    createProductNode(targetProduct, { x: -360, y: 0 }, true, stockByProductId[targetProduct.id] ?? null),
    ...components.map((product, index) =>
      createProductNode(
        product,
        getGridPosition(index, components.length),
        false,
        stockByProductId[product.id] ?? null,
        createComponentNodeId(targetProduct.id, product.id),
      ),
    ),
  ];
}

function getGridPosition(index: number, total: number) {
  const columns = Math.min(4, Math.max(1, total));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const startX = -((columns - 1) * 280) / 2;

  return {
    x: 80 + startX + column * 280,
    y: row * 190,
  };
}

function getNextNodePosition(count: number) {
  return getGridPosition(Math.max(0, count - 1), Math.max(1, count));
}

function getChildNodePosition(parentPosition: { x: number; y: number } | undefined, siblingCount: number) {
  if (!parentPosition) return getNextNodePosition(siblingCount + 1);

  return {
    x: parentPosition.x + 320,
    y: parentPosition.y + (siblingCount - 0.5) * 170,
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
    x: parentPosition.x + 360 + (nodePosition.x - rootPosition.x) + (depth - 1) * 80,
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
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return products;

  return products.filter((product) => product.name.toLowerCase().includes(normalizedQuery) || product.code.toLowerCase().includes(normalizedQuery));
}

function miniMapNodeColor(node: ProductFlowNode) {
  if (node.data.isTarget) return "#216fe6";
  if (node.data.product.type === "semi_finished") return "#7a5c06";
  return "#4d6b58";
}

function formatStockPreview(stock: LotStockPreview | null | undefined) {
  if (!stock?.lotNumber) return "Aucun lot lie";
  return `Lot: ${stock.lotNumber}`;
}
