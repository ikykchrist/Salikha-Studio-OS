"use client";

type InvoiceExportFormat = "pdf" | "jpg";

const ARTWORK_WIDTH = 720;
const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const SIDE_MARGIN = 14;
const TOP_MARGIN = 15;
const CONTENT_WIDTH = A4_WIDTH - SIDE_MARGIN * 2;
const CONTENT_HEIGHT = A4_HEIGHT - TOP_MARGIN * 2;

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot render the invoice download.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

async function captureInvoice(element: HTMLElement) {
  const { toCanvas } = await import("html-to-image");
  const staging = document.createElement("div");
  staging.setAttribute("aria-hidden", "true");
  Object.assign(staging.style, { position: "fixed", top: "0", left: "-10000px", width: ARTWORK_WIDTH + "px" });
  const copy = element.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.removeAttribute("aria-labelledby");
  copy.querySelector("[id]")?.removeAttribute("id");
  Object.assign(copy.style, { width: "100%", maxWidth: "none", padding: "34px", margin: "0", boxShadow: "none" });
  staging.append(copy);
  document.body.append(staging);
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(copy.querySelectorAll("img"), (image) => image.decode()));
    const bounds = copy.getBoundingClientRect();
    const breaks = Array.from(copy.querySelectorAll("[data-invoice-break]"), (node) => node.getBoundingClientRect().top - bounds.top);
    const canvas = await toCanvas(copy, { backgroundColor: "#ffffff", pixelRatio: 3 });
    return { canvas, breaks: breaks.map((point) => Math.round(point * canvas.height / bounds.height)) };
  } finally {
    staging.remove();
  }
}

export async function exportInvoicePage(element: HTMLElement, invoiceNumber: string, format: InvoiceExportFormat) {
  const { canvas, breaks } = await captureInvoice(element);
  const filename = `Salikha-Invoice-${invoiceNumber.replace(/[^a-z0-9_-]/gi, "-")}`;
  const millimetersPerPixel = CONTENT_WIDTH / canvas.width;

  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const maxPagePixels = Math.floor(CONTENT_HEIGHT / millimetersPerPixel);
    let top = 0;
    const pages: { top: number; height: number }[] = [];
    while (top < canvas.height) {
      const limit = Math.min(top + maxPagePixels, canvas.height);
      const breakPoint = limit === canvas.height ? limit : breaks.findLast((value) => value > top && value <= limit) ?? limit;
      pages.push({ top, height: breakPoint - top });
      top = breakPoint;
    }
    pages.forEach(({ top, height }, index) => {
      if (index) pdf.addPage();
      let artwork = canvas;
      if (pages.length > 1) {
        const page = makeCanvas(canvas.width, height);
        page.context.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
        artwork = page.canvas;
      }
      pdf.addImage(artwork, "PNG", SIDE_MARGIN, TOP_MARGIN, CONTENT_WIDTH, height * millimetersPerPixel, undefined, "FAST");
      if (pages.length > 1) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor("#655862");
        pdf.text(invoiceNumber, SIDE_MARGIN, A4_HEIGHT - 6);
        pdf.text(`${index + 1} / ${pages.length}`, A4_WIDTH - SIDE_MARGIN, A4_HEIGHT - 6, { align: "right" });
      }
    });
    pdf.save(`${filename}.pdf`);
    return;
  }

  const horizontalMargin = Math.round(SIDE_MARGIN / millimetersPerPixel);
  const verticalMargin = Math.round(TOP_MARGIN / millimetersPerPixel);
  const width = canvas.width + horizontalMargin * 2;
  const page = makeCanvas(width, Math.max(Math.round(width * A4_HEIGHT / A4_WIDTH), canvas.height + verticalMargin * 2));
  page.context.drawImage(canvas, horizontalMargin, verticalMargin);
  const link = document.createElement("a");
  link.href = page.canvas.toDataURL("image/jpeg", 0.95);
  link.download = `${filename}.jpg`;
  document.body.append(link);
  link.click();
  link.remove();
}
