import {
  renderDeliveryBatchPdfContents,
  renderProductionBatchPdfContents,
  renderProductionPdfContents,
  type DeliveryPdfData,
  type ProductionPdfData,
} from "./productionTraceabilityPdf";

type ProductionPdfWorkerRequest =
  | { id: string; mode: "single"; data: ProductionPdfData }
  | { id: string; mode: "batch"; data: ProductionPdfData[] }
  | { id: string; mode: "delivery"; data: DeliveryPdfData[] };

self.onmessage = async (event: MessageEvent<ProductionPdfWorkerRequest>) => {
  const request = event.data;

  try {
    const contents = request.mode === "single"
      ? await renderProductionPdfContents(request.data)
      : request.mode === "batch"
        ? await renderProductionBatchPdfContents(request.data)
        : await renderDeliveryBatchPdfContents(request.data);
    self.postMessage({ id: request.id, contents });
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "PDF rendering failed",
    });
  }
};

export {};
