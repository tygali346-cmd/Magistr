import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, type Canvas } from "canvas";

export type NormalizedBbox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const PDF_RENDER_SCALE = 2.5; // 72 * 2.5 = 180 DPI (within 150-200 DPI)
const MIN_CROP_NORMALIZED = 0.02;
const MIN_CROP_PIXELS = 20;

export function isValidBbox(bbox: NormalizedBbox | null | undefined): bbox is NormalizedBbox {
  if (!bbox) return false;
  const { x, y, w, h } = bbox;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    x >= 0 &&
    y >= 0 &&
    w > MIN_CROP_NORMALIZED &&
    h > MIN_CROP_NORMALIZED &&
    x + w <= 1.005 &&
    y + h <= 1.005
  );
}

export async function renderPdfPageCanvas(pdfBytes: Buffer, pageNumber: number): Promise<{ canvas: Canvas; pageCount: number; pageNumber: number }> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), verbosity: 0 });
  const pdfDoc = await loadingTask.promise;
  try {
    const targetPageNum = Math.max(1, Math.min(pageNumber, pdfDoc.numPages));
    const page = await pdfDoc.getPage(targetPageNum);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return { canvas, pageCount: pdfDoc.numPages, pageNumber: targetPageNum };
  } finally {
    await pdfDoc.cleanup().catch(() => {});
    await loadingTask.destroy().catch(() => {});
  }
}

export async function renderPdfPagePng(pdfBytes: Buffer, pageNumber: number): Promise<{ png: Buffer; pageCount: number; pageNumber: number }> {
  const rendered = await renderPdfPageCanvas(pdfBytes, pageNumber);
  return {
    png: rendered.canvas.toBuffer("image/png"),
    pageCount: rendered.pageCount,
    pageNumber: rendered.pageNumber,
  };
}

export type PdfPageRenderer = {
  renderPage(pageNumber: number): Promise<{ canvas: Canvas; pageNumber: number }>;
  destroy(): Promise<void>;
};

export async function createPdfPageRenderer(pdfBytes: Buffer): Promise<PdfPageRenderer> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), verbosity: 0 });
  const pdfDoc = await loadingTask.promise;
  const pageCache = new Map<number, Canvas>();

  return {
    async renderPage(pageNumber: number) {
      const targetPageNum = Math.max(1, Math.min(pageNumber, pdfDoc.numPages));
      const cached = pageCache.get(targetPageNum);
      if (cached) return { canvas: cached, pageNumber: targetPageNum };

      const page = await pdfDoc.getPage(targetPageNum);
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      pageCache.set(targetPageNum, canvas);
      return { canvas, pageNumber: targetPageNum };
    },
    async destroy() {
      pageCache.clear();
      await pdfDoc.cleanup().catch(() => {});
      await loadingTask.destroy().catch(() => {});
    },
  };
}

export async function cropAndStorePageFigure(
  pageCanvas: Canvas,
  targetPageNum: number,
  bbox: NormalizedBbox | null | undefined,
  storageKeyPrefix: string,
  figIndex: number,
  storagePutFn: (
    key: string,
    bytes: Buffer,
    contentType: string,
    options?: { deterministic?: boolean },
  ) => Promise<{ key: string; url: string }>,
): Promise<{ storageKey: string; url: string; needsReview: boolean; reviewNote?: string }> {
  let imageBuffer: Buffer;
  let needsReview = false;
  let reviewNote: string | undefined;

  if (isValidBbox(bbox)) {
    const sx = Math.max(0, Math.floor(bbox.x * pageCanvas.width));
    const sy = Math.max(0, Math.floor(bbox.y * pageCanvas.height));
    const sw = Math.min(pageCanvas.width - sx, Math.ceil(bbox.w * pageCanvas.width));
    const sh = Math.min(pageCanvas.height - sy, Math.ceil(bbox.h * pageCanvas.height));

    if (sw >= MIN_CROP_PIXELS && sh >= MIN_CROP_PIXELS) {
      const cropCanvas = createCanvas(sw, sh);
      const cropCtx = cropCanvas.getContext("2d");
      cropCtx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      imageBuffer = cropCanvas.toBuffer("image/png");
    } else {
      imageBuffer = pageCanvas.toBuffer("image/png");
      needsReview = true;
      reviewNote = "şəkil kəsimi yoxlanmalıdır";
    }
  } else {
    imageBuffer = pageCanvas.toBuffer("image/png");
    needsReview = true;
    reviewNote = "şəkil kəsimi yoxlanmalıdır";
  }

  const storageKey = `qebulfit/media/${storageKeyPrefix}-p${targetPageNum}-f${figIndex}.png`;
  const stored = await storagePutFn(storageKey, imageBuffer, "image/png", { deterministic: true });
  return { storageKey: stored.key, url: stored.url, needsReview, reviewNote };
}

export async function renderAndCropPdfFigure(
  pdfBytes: Buffer,
  pageNumber: number,
  bbox: NormalizedBbox | null | undefined,
  storageKeyPrefix: string,
  figIndex: number,
  storagePutFn: (
    key: string,
    bytes: Buffer,
    contentType: string,
    options?: { deterministic?: boolean },
  ) => Promise<{ key: string; url: string }>,
): Promise<{ storageKey: string; url: string; needsReview: boolean; reviewNote?: string }> {
  const { canvas, pageNumber: targetPageNum } = await renderPdfPageCanvas(pdfBytes, pageNumber);
  return cropAndStorePageFigure(canvas, targetPageNum, bbox, storageKeyPrefix, figIndex, storagePutFn);
}
