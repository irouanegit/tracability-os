import {
  renderProductionBatchPdfContents,
  renderProductionPdfContents,
  type ProductionPdfData,
} from "./productionTraceabilityPdf";

type ProductionPdfWorkerResponse = {
  id: string;
  contents?: string;
  error?: string;
};

function renderWithWorker(mode: "single", data: ProductionPdfData): Promise<string>;
function renderWithWorker(mode: "batch", data: ProductionPdfData[]): Promise<string>;
function renderWithWorker(mode: "single" | "batch", data: ProductionPdfData | ProductionPdfData[]) {
  if (typeof Worker === "undefined") {
    return mode === "single"
      ? renderProductionPdfContents(data as ProductionPdfData)
      : renderProductionBatchPdfContents(data as ProductionPdfData[]);
  }

  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL("./productionPdf.worker.ts", import.meta.url), { type: "module" });
    const requestId = crypto.randomUUID();

    worker.onmessage = (event: MessageEvent<ProductionPdfWorkerResponse>) => {
      if (event.data.id !== requestId) return;
      worker.terminate();
      if (event.data.error || !event.data.contents) {
        reject(new Error(event.data.error || "PDF rendering failed"));
        return;
      }
      resolve(event.data.contents);
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "PDF worker failed"));
    };

    worker.postMessage({ id: requestId, mode, data });
  }).catch((error) => {
    console.warn("PDF worker unavailable; falling back to main thread rendering", error);
    return mode === "single"
      ? renderProductionPdfContents(data as ProductionPdfData)
      : renderProductionBatchPdfContents(data as ProductionPdfData[]);
  });
}

export function renderSingleProductionPdfInWorker(data: ProductionPdfData) {
  return renderWithWorker("single", data);
}

export function renderProductionBatchPdfInWorker(data: ProductionPdfData[]) {
  return renderWithWorker("batch", data);
}
