import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import { createCanvas } from "canvas";

export async function renderAndCropPdfFigure(
  pdfBytes: Buffer,
  pageNumber: number,
  bbox: { x: number; y: number; w: number; h: number } | null,
  fileSha: string,
  figIndex: number,
  storagePutFn: (key: string, bytes: Buffer, contentType: string) => Promise<{ key: string; url: string }>
): Promise<{ storageKey: string; url: string; needsReview: boolean; reviewNote?: string }> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
  const pdfDoc = await loadingTask.promise;
  
  const targetPageNum = Math.max(1, Math.min(pageNumber, pdfDoc.numPages));
  const page = await pdfDoc.getPage(targetPageNum);
  const viewport = page.getViewport({ scale: 2.0 }); // ~144 DPI
  
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;

  const hasValidBbox = bbox && 
    typeof bbox.x === "number" && typeof bbox.y === "number" &&
    typeof bbox.w === "number" && typeof bbox.h === "number" &&
    bbox.x >= 0 && bbox.y >= 0 && bbox.x + bbox.w <= 1.001 && bbox.y + bbox.h <= 1.001 &&
    bbox.w > 0.02 && bbox.h > 0.02;

  let imageBuffer: Buffer;
  let needsReview = false;
  let reviewNote: string | undefined;

  if (hasValidBbox && bbox) {
    const sx = Math.max(0, Math.floor(bbox.x * viewport.width));
    const sy = Math.max(0, Math.floor(bbox.y * viewport.height));
    const sw = Math.min(viewport.width - sx, Math.ceil(bbox.w * viewport.width));
    const sh = Math.min(viewport.height - sy, Math.ceil(bbox.h * viewport.height));

    if (sw >= 20 && sh >= 20) {
      const cropCanvas = createCanvas(sw, sh);
      const cropCtx = cropCanvas.getContext("2d");
      cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      imageBuffer = cropCanvas.toBuffer("image/png");
    } else {
      imageBuffer = canvas.toBuffer("image/png");
      needsReview = true;
      reviewNote = "şəkil kəsimi çox kiçikdir, tam səhifə şəkli əlavə olundu və yoxlanmalıdır";
    }
  } else {
    imageBuffer = canvas.toBuffer("image/png");
    needsReview = true;
    reviewNote = "şəkil kəsimi qutusu (bbox) yoxdur və ya etibarsızdır, tam səhifə şəkli əlavə olundu";
  }

  const storageKey = `qebulfit/media/${fileSha.slice(0, 16)}-p${targetPageNum}-f${figIndex}.png`;
  const stored = await storagePutFn(storageKey, imageBuffer, "image/png");
  return { storageKey: stored.key, url: stored.url, needsReview, reviewNote };
}
