"use client";

type InvoiceExportFormat = "pdf" | "jpg";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 72;

export function fitInvoiceOnPage(width: number, height: number) {
  const scale = Math.min((PAGE_WIDTH - PAGE_MARGIN * 2) / width, (PAGE_HEIGHT - PAGE_MARGIN * 2) / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  return { x: (PAGE_WIDTH - drawnWidth) / 2, y: PAGE_MARGIN, width: drawnWidth, height: drawnHeight };
}

export async function exportInvoicePage(element: HTMLElement, invoiceNumber: string, format: InvoiceExportFormat) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  const imageUrl = await toPng(element, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
  const image = new Image();
  image.src = imageUrl;
  await image.decode();

  const page = document.createElement("canvas");
  page.width = PAGE_WIDTH;
  page.height = PAGE_HEIGHT;
  const context = page.getContext("2d");
  if (!context) throw new Error("This browser cannot render the invoice download.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  const bounds = fitInvoiceOnPage(image.width, image.height);
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
  const jpg = page.toDataURL("image/jpeg", 0.94);
  const filename = `Salikha-Invoice-${invoiceNumber.replace(/[^a-z0-9_-]/gi, "-")}`;

  if (format === "pdf") {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.addImage(jpg, "JPEG", 0, 0, 210, 297);
    pdf.save(`${filename}.pdf`);
    return;
  }

  const link = document.createElement("a");
  link.href = jpg;
  link.download = `${filename}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
