import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { DiagramProductCard } from "./DiagramProductCard";
import { TraceabilityLoader } from "./TraceabilityLoader";
import {
  type ProductSchemaDiagram,
  type ProductSchemaNode,
  type ProductType,
  type ProductionBatch,
  type ProductionConsumptionDetail,
  type ProductionTraceabilityLot,
  type ProductionTraceabilityNode,
  type ProductionTraceabilitySnapshot,
} from "./lib/traceabilityApi";

type TraceabilityNodeData = Record<string, unknown> & {
  productName: string;
  productType: ProductType;
  lots: ProductionTraceabilityLot[];
  isRoot: boolean;
};

type TraceabilityFlowNode = Node<TraceabilityNodeData, "traceability">;
type TraceabilityFlowEdge = Edge<Record<string, unknown>, "smoothstep">;
type TraceabilityLayoutBranch = {
  node: ProductionTraceabilityNode;
  children: TraceabilityLayoutBranch[];
  leafSlots: number;
};

const nodeTypes = { traceability: TraceabilityProductNode };
const DIAGRAM_ROW_GAP = 270;
const DIAGRAM_TREE_GAP = 420;
const DIAGRAM_NESTED_OFFSET = 70;
const diagramLinkColor = "var(--diagram-link)";

export function ProductionTraceabilityDiagram({
  batch,
  rows,
  schema,
  status,
}: {
  batch: ProductionBatch;
  rows: ProductionConsumptionDetail[];
  schema: ProductSchemaDiagram | null;
  status: "idle" | "loading" | "error";
}) {
  const snapshot = useMemo(
    () => batch.traceabilitySnapshot ?? (schema ? createCurrentSchemaSnapshot(batch, rows, schema) : null),
    [batch, rows, schema],
  );
  const graph = useMemo(() => (snapshot ? buildTraceabilityGraph(snapshot) : { nodes: [], edges: [] }), [snapshot]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TraceabilityFlowNode>(graph.nodes);

  useEffect(() => {
    setNodes(graph.nodes);
  }, [graph.nodes, setNodes]);

  if (!snapshot && status === "loading") {
    return (
      <div className="production-schema-state">
        <TraceabilityLoader label="Chargement du schema..." />
      </div>
    );
  }
  if (!snapshot && status === "error") return <div className="production-schema-state error">Impossible de charger le schema.</div>;
  if (!snapshot || graph.nodes.length === 0) return <div className="production-schema-state">Aucun schema disponible.</div>;

  return (
    <div className="diagram-canvas-card production-traceability-diagram">
      <ReactFlow
        edges={graph.edges}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.05}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
      >
        <Background color="var(--diagram-grid-dot)" gap={20} size={1.45} />
        <Controls position="bottom-right" />
        <MiniMap nodeColor={traceabilityMiniMapColor} pannable zoomable />
      </ReactFlow>
    </div>
  );
}

function TraceabilityProductNode({ data }: NodeProps<TraceabilityFlowNode>) {
  const hasChildren = data.isRoot || data.productType === "semi_finished";

  return (
    <DiagramProductCard
      canHaveComponents={hasChildren}
      footer={
        <div className="production-traceability-node-lots">
          {data.lots.length > 0 ? (
            data.lots.map((lot) => <strong key={lot.lotId}>{lot.supplierLot || lot.lotNumber}</strong>)
          ) : (
            <strong className="missing">Lot non trace</strong>
          )}
        </div>
      }
      headerText={data.isRoot ? "Lot produit" : "Lot selectionne"}
      isTarget={data.isRoot}
      productName={data.productName}
      productType={data.productType}
    />
  );
}

function traceabilityMiniMapColor(node: TraceabilityFlowNode) {
  if (node.data.isRoot) return "#3fcf8e";
  if (node.data.productType === "semi_finished") return "#b9850b";
  if (node.data.productType === "raw") return "#216fe6";
  return "#3fcf8e";
}

function createCurrentSchemaSnapshot(
  batch: ProductionBatch,
  rows: ProductionConsumptionDetail[],
  schema: ProductSchemaDiagram,
): ProductionTraceabilitySnapshot {
  const lotsByProductId = groupLotsByProductId(rows);
  const components = flattenSchemaComponents(schema.components, batch.productId, lotsByProductId);

  return {
    version: 1,
    root: {
      productId: batch.productId,
      productName: batch.productName,
      productType: batch.productType,
      lotNumber: batch.generatedLot,
    },
    components,
    diagram: {
      nodes: schema.diagramNodes,
      edges: schema.diagramEdges,
      viewport: schema.diagramViewport,
    },
  };
}

function groupLotsByProductId(rows: ProductionConsumptionDetail[]) {
  const lotsByProductId = new Map<string, ProductionTraceabilityLot[]>();

  rows.forEach((row) => {
    const productLots = lotsByProductId.get(row.productId) ?? [];
    if (!productLots.some((lot) => lot.lotId === row.lotId)) {
      productLots.push({
        lotId: row.lotId,
        lotNumber: row.lotNumber,
        supplierLot: row.supplierLot,
        sourceType: row.sourceType,
        lotCreatedAt: row.lotCreatedAt,
      });
    }
    lotsByProductId.set(row.productId, productLots);
  });

  return lotsByProductId;
}

function flattenSchemaComponents(
  components: ProductSchemaNode[],
  parentNodeId: string,
  lotsByProductId: Map<string, ProductionTraceabilityLot[]>,
  depth = 1,
): ProductionTraceabilityNode[] {
  return components.flatMap((component) => {
    const nodeId = `${parentNodeId}__${component.id}`;
    const node: ProductionTraceabilityNode = {
      nodeId,
      parentNodeId,
      productId: component.id,
      productName: component.name,
      productType: component.type,
      depth,
      lots: lotsByProductId.get(component.id) ?? [],
    };

    return [node, ...flattenSchemaComponents(component.children, nodeId, lotsByProductId, depth + 1)];
  });
}

function buildTraceabilityGraph(snapshot: ProductionTraceabilitySnapshot): {
  nodes: TraceabilityFlowNode[];
  edges: TraceabilityFlowEdge[];
} {
  const savedGraph = buildSavedGraph(snapshot);
  if (savedGraph.nodes.length === snapshot.components.length + 1 && !hasNestedTraceabilityComponents(snapshot)) return savedGraph;
  return buildAutoLayoutGraph(snapshot);
}

function hasNestedTraceabilityComponents(snapshot: ProductionTraceabilitySnapshot) {
  return snapshot.components.some((component) => component.depth > 1);
}

function buildSavedGraph(snapshot: ProductionTraceabilitySnapshot) {
  if (snapshot.diagram.nodes.length === 0) return { nodes: [], edges: [] };

  const componentsByProductId = new Map<string, ProductionTraceabilityNode[]>();
  snapshot.components.forEach((component) => {
    const matches = componentsByProductId.get(component.productId) ?? [];
    matches.push(component);
    componentsByProductId.set(component.productId, matches);
  });

  const nodes = snapshot.diagram.nodes.flatMap<TraceabilityFlowNode>((diagramNode) => {
    const productId = diagramNode.data?.productId ?? diagramNode.id;
    const isRoot = Boolean(diagramNode.data?.isTarget) || productId === snapshot.root.productId;
    const componentMatches = componentsByProductId.get(productId) ?? [];
    if (!isRoot && componentMatches.length === 0) return [];

    const lots = isRoot
      ? [createRootLot(snapshot)]
      : uniqueLots(componentMatches.flatMap((component) => component.lots));
    const component = componentMatches[0];

    return [
      createFlowNode(
        diagramNode.id,
        diagramNode.position,
        isRoot ? snapshot.root.productName : component.productName,
        isRoot ? snapshot.root.productType : component.productType,
        lots,
        isRoot,
      ),
    ];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = snapshot.diagram.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => createFlowEdge(edge.id, edge.source, edge.target));

  return { nodes, edges };
}

function buildAutoLayoutGraph(snapshot: ProductionTraceabilitySnapshot) {
  const rootId = snapshot.root.productId;
  const childrenByParentId = new Map<string, string[]>();

  snapshot.components.forEach((component) => {
    const children = childrenByParentId.get(component.parentNodeId) ?? [];
    children.push(component.nodeId);
    childrenByParentId.set(component.parentNodeId, children);
  });

  const componentByNodeId = new Map(snapshot.components.map((component) => [component.nodeId, component]));
  const rootPosition = { x: -DIAGRAM_TREE_GAP, y: 0 };
  const nodes: TraceabilityFlowNode[] = [
    createFlowNode(rootId, rootPosition, snapshot.root.productName, snapshot.root.productType, [createRootLot(snapshot)], true),
  ];
  const edges: TraceabilityFlowEdge[] = [];
  const branches = createTraceabilityLayoutBranches(rootId, childrenByParentId, componentByNodeId);

  layoutTraceabilityBranches(rootId, rootPosition, branches, 1, nodes, edges);

  return { nodes, edges };
}

function createTraceabilityLayoutBranches(
  parentNodeId: string,
  childrenByParentId: Map<string, string[]>,
  componentByNodeId: Map<string, ProductionTraceabilityNode>,
): TraceabilityLayoutBranch[] {
  return (childrenByParentId.get(parentNodeId) ?? []).flatMap((childNodeId) => {
    const node = componentByNodeId.get(childNodeId);
    if (!node) return [];

    const children = createTraceabilityLayoutBranches(childNodeId, childrenByParentId, componentByNodeId);
    return [
      {
        node,
        children,
        leafSlots: Math.max(1, sumTraceabilityLeafSlots(children)),
      },
    ];
  });
}

function sumTraceabilityLeafSlots(branches: TraceabilityLayoutBranch[]) {
  return branches.reduce((total, branch) => total + branch.leafSlots, 0);
}

function layoutTraceabilityBranches(
  parentNodeId: string,
  parentPosition: { x: number; y: number },
  branches: TraceabilityLayoutBranch[],
  depth: number,
  nodes: TraceabilityFlowNode[],
  edges: TraceabilityFlowEdge[],
) {
  if (branches.length === 0) return;

  const totalLeafSlots = sumTraceabilityLeafSlots(branches);
  let nextSlotStart = 0;

  branches.forEach((branch) => {
    const nodeY = parentPosition.y + (nextSlotStart + (branch.leafSlots - 1) / 2 - (totalLeafSlots - 1) / 2) * DIAGRAM_ROW_GAP;
    const nodePosition = {
      x: parentPosition.x + DIAGRAM_TREE_GAP + (depth - 1) * DIAGRAM_NESTED_OFFSET,
      y: nodeY,
    };

    nodes.push(createFlowNode(branch.node.nodeId, nodePosition, branch.node.productName, branch.node.productType, branch.node.lots, false));
    edges.push(createFlowEdge(`${parentNodeId}->${branch.node.nodeId}`, parentNodeId, branch.node.nodeId));

    layoutTraceabilityBranches(branch.node.nodeId, nodePosition, branch.children, depth + 1, nodes, edges);
    nextSlotStart += branch.leafSlots;
  });
}

function createFlowNode(
  id: string,
  position: { x: number; y: number },
  productName: string,
  productType: ProductType,
  lots: ProductionTraceabilityLot[],
  isRoot: boolean,
): TraceabilityFlowNode {
  return {
    id,
    type: "traceability",
    position,
    data: { productName, productType, lots: uniqueLots(lots), isRoot },
  };
}

function createFlowEdge(id: string, source: string, target: string): TraceabilityFlowEdge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: diagramLinkColor },
    style: { stroke: diagramLinkColor, strokeWidth: 2 },
  };
}

function createRootLot(snapshot: ProductionTraceabilitySnapshot): ProductionTraceabilityLot {
  return {
    lotId: `production-${snapshot.root.lotNumber}`,
    lotNumber: snapshot.root.lotNumber,
    supplierLot: null,
    sourceType: "fabrication",
    lotCreatedAt: "",
  };
}

function uniqueLots(lots: ProductionTraceabilityLot[]) {
  return [...new Map(lots.map((lot) => [lot.lotId, lot])).values()];
}
