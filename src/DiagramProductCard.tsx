import { Handle, Position } from "@xyflow/react";
import { type ReactNode } from "react";
import { type ProductType } from "./lib/traceabilityApi";

const typeLabels: Record<ProductType, string> = {
  raw: "Matiere premiere",
  semi_finished: "Semi-fini",
  finished: "Produit fini",
};

export function DiagramProductCard({
  canHaveComponents,
  footer,
  headerBadge,
  headerText,
  isTarget,
  productName,
  productType,
  selected = false,
}: {
  canHaveComponents: boolean;
  footer?: ReactNode;
  headerBadge?: ReactNode;
  headerText: ReactNode;
  isTarget: boolean;
  productName: string;
  productType: ProductType;
  selected?: boolean;
}) {
  return (
    <div className={`diagram-node ${productType} ${isTarget ? "target" : ""} ${selected ? "selected" : ""}`}>
      {!isTarget ? <Handle className="diagram-handle target-handle" position={Position.Left} type="target" /> : null}
      {canHaveComponents ? <Handle className="diagram-handle source-handle" position={Position.Right} type="source" /> : null}
      <div className="diagram-node-header">
        <span>{headerText}</span>
        {headerBadge ? <b>{headerBadge}</b> : null}
      </div>
      <strong>{productName}</strong>
      <div className="diagram-node-meta">
        <span className={`type-pill ${productType}`}>{typeLabels[productType]}</span>
      </div>
      {footer ? <div className="diagram-node-footer">{footer}</div> : null}
    </div>
  );
}
