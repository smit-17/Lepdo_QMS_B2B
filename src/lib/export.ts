import {
  currencySymbol,
  diamondLabelFor,
  safeUrl,
  formatCurrency,
  isItemFilled,
  itemDiamondWeight,
  optionRows,
  recalcItem,
  type OptionRow,
} from "./calc";
import { DEFAULT_PDF_VISIBILITY, type Currency, type Quotation, type QuotationItem } from "./types";

/** Excel number format that renders Indian-grouped rupee amounts, e.g. ₹1,25,000.00 */
const INR_FORMAT = '"₹"#,##,##0.00';

type Sheet = Record<string, unknown>;

/** Applies the rupee number format to every column whose header contains "(₹)". */
function applyInrFormat(sheet: Sheet, utils: { decode_range: (r: string) => unknown }) {
  const ref = sheet["!ref"] as string | undefined;
  if (!ref) return;
  const range = utils.decode_range(ref) as {
    s: { r: number; c: number };
    e: { r: number; c: number };
  };
  const encode = (r: number, c: number) => {
    let label = "";
    let col = c;
    do {
      label = String.fromCharCode(65 + (col % 26)) + label;
      col = Math.floor(col / 26) - 1;
    } while (col >= 0);
    return `${label}${r + 1}`;
  };
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const header = sheet[encode(range.s.r, c)] as { v?: unknown } | undefined;
    if (!String(header?.v ?? "").includes("(₹)")) continue;
    for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
      const cell = sheet[encode(r, c)] as { t?: string; z?: string } | undefined;
      if (cell && cell.t === "n") cell.z = INR_FORMAT;
    }
  }
}

export async function exportQuotationsToExcel(quotations: Quotation[], fileName: string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const addSheet = (rows: Record<string, unknown>[], name: string) => {
    const sheet = XLSX.utils.json_to_sheet(rows) as unknown as Sheet;
    applyInrFormat(sheet, XLSX.utils);
    XLSX.utils.book_append_sheet(workbook, sheet as never, name);
  };

  const overview = quotations.map((q) => ({
    "Quotation ID": q.id,
    Customer: q.customerName,
    Mobile: q.customerMobile,
    Seller: q.seller,
    Date: new Date(q.quotationDate).toLocaleDateString("en-IN"),
    Items: q.items.length,
    "Metal Amount (₹)": q.totals.totalMetalAmount,
    "Making Charges (₹)": q.totals.totalMakingCharges,
    "Diamond Amount (₹)": q.totals.totalDiamondAmount,
    "Items Subtotal (₹)": q.totals.itemsSubtotal,
    "Margin %": q.totals.marginPct,
    "Margin Amount (₹)": q.totals.marginAmount,
    "Final Selling Amount (₹)": q.totals.finalAmount,
  }));
  addSheet(overview, "Quotations");

  const items = quotations.flatMap((q) =>
    q.items.map((item, index) => ({
      "Quotation ID": q.id,
      "Item #": index + 1,
      SKU: item.idSku,
      Category: item.category,
      Metal: item.metalPurity,
      Grams: item.metalGrams,
      "Rate/Gram (₹)": item.metalRatePerGram,
      "Metal Amount (₹)": item.metalAmount,
      "Making Rate/Gram (₹)": item.makingRatePerGram,
      "Making Charges (₹)": item.makingCharges,
      "Diamond Weight (CT)": itemDiamondWeight(item),
      "Diamond Amount (₹)": item.diamondAmount,
      "Item Subtotal (₹)": item.subtotal,
    })),
  );
  if (items.length) addSheet(items, "Items");

  const diamonds = quotations.flatMap((q) =>
    q.items.flatMap((item, itemIndex) =>
      item.diamonds.map((d, rowIndex) => ({
        "Quotation ID": q.id,
        "Item #": itemIndex + 1,
        SKU: item.idSku,
        SR: rowIndex + 1,
        Description: d.description,
        Shape: d.shape,
        Size: d.size,
        Color: d.color,
        Clarity: d.clarity,
        Cut: d.cut,
        Certificate: d.certificate,
        Pieces: d.pieces,
        "Total Weight (CT)": d.totalWeightCt,
        "LGD per Carat (₹)": d.lgdRateFinal,
        "Moissanite per Carat (₹)": d.moissRateFinal,
        "LGD Amount (₹)": d.lgdAmount,
        "Moissanite Amount (₹)": d.moissAmount,
        Link: d.link,
      })),
    ),
  );
  if (diamonds.length) addSheet(diamonds, "Diamonds");

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

const NAVY: [number, number, number] = [45, 45, 97];
const GOLD: [number, number, number] = [226, 174, 64];
const LIGHT: [number, number, number] = [246, 246, 250];

async function loadImage(url: string): Promise<{ data: string; ratio: number } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
    const ratio = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width && img.height ? img.width / img.height : 1);
      img.onerror = () => resolve(1);
      img.src = data;
    });
    return { data, ratio };
  } catch {
    return null;
  }
}

let logoCache: { data: string; ratio: number } | null | undefined;
async function loadLogo() {
  if (logoCache === undefined) logoCache = await loadImage("/favicon.png");
  return logoCache;
}

type JsPdfDoc = InstanceType<Awaited<typeof import("jspdf")>["jsPDF"]>;
type AutoTable = Awaited<typeof import("jspdf-autotable")>["default"];

async function pdfLibs() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default };
}

function fileNameFor(quotation: Quotation) {
  return `${quotation.id}-${quotation.customerName || quotation.idSku || "quotation"}`.replace(
    /[^\w.-]+/g,
    "_",
  );
}

/** Unicode font so the rupee sign (₹) renders in PDFs (standard PDF fonts lack it). */
const PDF_FONT = "InrSans";
let fontCache: { normal: string; bold: string } | null | undefined;

async function loadPdfFonts() {
  if (fontCache !== undefined) return fontCache;
  try {
    const toBase64 = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("font fetch failed");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] as number);
      return btoa(binary);
    };
    const [normal, bold] = await Promise.all([
      toBase64("/fonts/inr-sans.ttf"),
      toBase64("/fonts/inr-sans-bold.ttf"),
    ]);
    fontCache = { normal, bold };
  } catch {
    fontCache = null;
  }
  return fontCache;
}

async function registerPdfFont(doc: JsPdfDoc): Promise<string> {
  const fonts = await loadPdfFonts();
  if (!fonts) return "helvetica";
  const api = doc as unknown as {
    addFileToVFS: (name: string, data: string) => void;
    addFont: (file: string, name: string, style: string) => void;
  };
  api.addFileToVFS("inr-sans.ttf", fonts.normal);
  api.addFont("inr-sans.ttf", PDF_FONT, "normal");
  api.addFileToVFS("inr-sans-bold.ttf", fonts.bold);
  api.addFont("inr-sans-bold.ttf", PDF_FONT, "bold");
  return PDF_FONT;
}

const DASH = "\u2014";

export class PdfOverflowError extends Error {
  constructor() {
    super(
      "This quotation has too much content to fit legibly on one A4 page. Nothing was removed — reduce content or allow a multi-page export.",
    );
    this.name = "PdfOverflowError";
  }
}

/** Progressively tighter layouts; the smallest keeps body text at ~6.5pt (still legible). */
const DENSITIES = [1, 0.9, 0.8, 0.72];

type Built = { doc: JsPdfDoc; fits: boolean; overflowItems: number[] };
type Libs = Awaited<ReturnType<typeof pdfLibs>>;
type Img = { data: string; ratio: number } | null;

/** Visible metal alternatives; legacy single-metal items become one option. */
function pdfOptions(item: QuotationItem, marginPct: number): OptionRow[] {
  if (item.metalOptions.length) return optionRows(item, marginPct).filter((o) => o.visible);
  if (!item.metalGrams && !item.metalPurity) return [];
  const legacy: QuotationItem = {
    ...item,
    metalOptions: [
      {
        purity: item.metalPurity || "Metal",
        grams: item.metalGrams,
        ratePerGram: item.metalRatePerGram,
        makingRatePerGram: item.makingRatePerGram,
        metalAmount: item.metalAmount,
        makingCharges: item.makingCharges,
        total: item.metalAmount + item.makingCharges,
        visible: true,
      },
    ],
  };
  return optionRows(legacy, marginPct);
}

/**
 * Draws ONE jewellery item on the current page (header, customer, item, metal,
 * diamonds, summary, final pricing). Returns true when it overflowed the page.
 */
function drawItemPage(
  doc: JsPdfDoc,
  autoTable: AutoTable,
  font: string,
  ctx: { source: Quotation; logo: Img; picture: Img; cur: Currency },
  item: QuotationItem,
  index: number,
  count: number,
  k: number,
): boolean {
  const { source, logo, picture, cur } = ctx;
  const money = (v: number) => formatCurrency(v, cur);
  const sym = currencySymbol(cur);
  const vis = source.pdfVisibility ?? DEFAULT_PDF_VISIBILITY;
  const diamondLabel = diamondLabelFor(item);
  const startPage = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  const limit = pageHeight - 150; // keep the strip above the footer free for the tagline
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Compact header
  const headerH = 46;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, headerH, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, headerH, pageWidth, 2, "F");
  let headerLeft = margin;
  if (logo) {
    const h = headerH - 18;
    const w = h * (logo.ratio || 1);
    try {
      doc.addImage(logo.data, margin, 9, w, h);
      headerLeft = margin + w + 8;
    } catch {
      /* ignore */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont(font, "bold");
  doc.setFontSize(15);
  doc.text("LEPDO", headerLeft, 22);
  doc.setFont(font, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("Jewellery Quotation", headerLeft, 34);
  doc.setTextColor(255, 255, 255);
  doc.setFont(font, "bold");
  doc.setFontSize(10.5);
  if (source.id && source.id !== "DRAFT") {
    doc.text(source.id, pageWidth - margin, 22, { align: "right" });
  }
  doc.setFont(font, "normal");
  doc.setFontSize(8);
  doc.text(
    `${new Date(source.quotationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}  ·  ${cur}`,
    pageWidth - margin,
    34,
    { align: "right" },
  );

  // Customer strip
  const cardTop = headerH + 8;
  const col = contentWidth / 2;
  doc.setFontSize(8);
   const wrap = (value: string, width: number) => doc.splitTextToSize(value || DASH, width) as string[];
   const address = wrap(source.customerAddress, col - 68);
   const customer = wrap(source.customerName, col - 68);
   const mobile = wrap(source.customerMobile, col - 68);
   const seller = wrap(source.seller, col - 68);
   const firstH = Math.max(customer.length, mobile.length) * 9;
   const cardH = 16 + firstH + Math.max(address.length, seller.length) * 9 + 6;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(margin, cardTop, contentWidth, cardH, 3, 3, "F");
  const kv = (label: string, value: string | string[], x: number, y: number) => {
    doc.setFont(font, "normal");
    doc.setTextColor(120, 120, 140);
    doc.text(label, x, y);
    doc.setFont(font, "bold");
    doc.setTextColor(...NAVY);
    doc.text(value, x + 48, y);
  };
   kv("Customer", customer, margin + 8, cardTop + 12);
   kv("Address", address, margin + 8, cardTop + 12 + firstH);
   kv("Mobile", mobile, margin + 8 + col, cardTop + 12);
   kv("Seller", seller, margin + 8 + col, cardTop + 12 + firstH);

  let cursor = cardTop + cardH + 12 * k;

  // Item title
  doc.setFont(font, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
   const titleWidth = contentWidth - (item.category ? 110 : 0);
   doc.text(wrap(`Item ${index + 1} of ${count}${item.idSku ? `  ${DASH}  ${item.idSku}` : ""}`, titleWidth), margin, cursor + 4);
  if (item.category) {
    doc.setFont(font, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 140);
    doc.text(item.category, pageWidth - margin, cursor + 4, { align: "right" });
  }
   cursor += 12 + Math.max(0, wrap(`Item ${index + 1} of ${count}${item.idSku ? `  ${DASH}  ${item.idSku}` : ""}`, titleWidth).length - 1) * 12;

  const table = {
    theme: "grid" as const,
    styles: {
      font,
      fontSize: 7.6 * k + 0.8,
      cellPadding: 3 * k,
      lineColor: [220, 220, 230] as [number, number, number],
      lineWidth: 0.4,
      minCellHeight: 18 * k,
      overflow: "linebreak" as const,
      valign: "middle" as const,
      textColor: [30, 30, 50] as [number, number, number],
    },
     headStyles: { font, fillColor: NAVY, textColor: 255, fontStyle: "bold" as const, halign: "center" as const, valign: "middle" as const },
    rowPageBreak: "avoid" as const,
  };
  const R = { halign: "right" as const };
  const sectionTitle = (label: string) => {
    doc.setFont(font, "bold");
    doc.setFontSize(8.5 * k + 0.8);
    doc.setTextColor(...NAVY);
    doc.text(label, margin, cursor + 7);
    cursor += 10;
  };

  const options = pdfOptions(item, source.marginPct);

   // Image and final pricing share the same horizontal band.
    const box = Math.round(110 * k);
  const top = cursor;
  if (picture) {
    const w = picture.ratio >= 1 ? box : box * picture.ratio;
    const h = picture.ratio >= 1 ? box / picture.ratio : box;
    try {
      doc.setDrawColor(220, 220, 230);
      doc.roundedRect(margin, top, box, box, 3, 3, "S");
      doc.addImage(picture.data, margin + (box - w) / 2, top + (box - h) / 2, w, h);
    } catch {
      /* unsupported image */
    }
  }
   const pct = source.marginPct;
   const showMargin = pct > 0 && vis.margin;
   const sideX = picture ? margin + box + 14 : margin;
   const sideWidth = pageWidth - margin - sideX;
   doc.setFont(font, "bold");
  doc.setFontSize(8.5 * k + 0.8);
  doc.setTextColor(...NAVY);
   doc.text("Final pricing — choose one option", sideX, top + 7);
   const finalHead = showMargin
     ? ["Purity", `Cost (${sym})`, `Margin (${sym})`, `Final (${sym})`]
     : ["Purity", `Final Price (${sym})`];
   autoTable(doc, {
     ...table,
     startY: top + 10,
     margin: { left: sideX, right: margin },
     tableWidth: sideWidth,
     head: [finalHead],
     headStyles: { ...table.headStyles, fillColor: GOLD, textColor: NAVY },
     body: options.length
       ? options.map((o) => showMargin
         ? [o.purity, money(o.selectedTotal), money(o.selectedFinal - o.selectedTotal), money(o.selectedFinal)]
         : [o.purity, money(o.selectedFinal)])
       : [[{ content: DASH, colSpan: finalHead.length, styles: { halign: "center" as const } }]],
     styles: { ...table.styles, fontSize: 7.4 * k + 0.8, cellPadding: 2.5 * k },
     columnStyles: showMargin
       ? { 0: { fontStyle: "bold" }, 1: R, 2: R, 3: { ...R, fontStyle: "bold" } }
       : { 0: { fontStyle: "bold" }, 1: { ...R, fontStyle: "bold" } },
   });
   cursor = Math.max(picture ? top + box : top, finalY()) + 8 * k;
   doc.text("Metal & making", margin, cursor + 7);
  autoTable(doc, {
    ...table,
     startY: cursor + 10,
     margin: { left: margin, right: margin },
    head: [["Purity", "Grams", `Rate/g (${sym})`, `Metal (${sym})`, `Making/g (${sym})`, `Making (${sym})`, `Metal + Making (${sym})`]],
    body: options.length
      ? options.map((o) => [
          o.purity,
          o.grams.toFixed(3),
          money(o.ratePerGram),
          money(o.metalAmount),
          money(o.makingRatePerGram),
          money(o.makingCharges),
          money(o.total),
        ])
      : [[{ content: "No metal options selected", colSpan: 7, styles: { halign: "center" as const } }]],
    columnStyles: { 0: { fontStyle: "bold" }, 1: R, 2: R, 3: R, 4: R, 5: R, 6: { ...R, fontStyle: "bold" } },
  });
   cursor = finalY() + 10 * k;

  // Diamond table
  if (item.diamonds.length) {
    sectionTitle("Diamond details");
    const body: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] =
      item.diamonds.map((d, i) => [
        String(i + 1),
        d.description || DASH,
         d.type === "Moissanite" ? "Moissanite" : "Lab-Grown",
        d.shape || DASH,
        d.size || DASH,
        d.color || DASH,
        d.clarity || DASH,
        d.cut || DASH,
        d.certificate || DASH,
        String(d.pieces),
        d.totalWeightCt.toFixed(3),
          money(d.pricePerCt),
        money(d.amount),
      ]);
    body.push([
       { content: "Diamond total", colSpan: 9, styles: { halign: "right" } },
      String(item.diamonds.reduce((sum, d) => sum + d.pieces, 0)),
      itemDiamondWeight(item).toFixed(3),
       "",
        money(item.diamondAmount),
    ]);
    autoTable(doc, {
      ...table,
      startY: cursor,
      margin: { left: margin, right: margin },
       styles: { ...table.styles, fontSize: 7 * k + 0.6, cellPadding: 2.3 * k },
        head: [["SR", "Details", "Type", "Shape", "Size", "Color", "Clarity", "Cut", "Cert.", "Pcs", "Wt (ct)", `Price/ct (${sym})`, `Amount (${sym})`]],
      body,
      columnStyles: {
        0: { cellWidth: 17, halign: "center" },
          1: { cellWidth: 45 },
          2: { cellWidth: 52 },
          3: { cellWidth: 34 },
          4: { cellWidth: 38 },
          5: { cellWidth: 28 },
          6: { cellWidth: 32 },
          7: { cellWidth: 26 },
          8: { cellWidth: 31 },
          9: { ...R, cellWidth: 24 },
          10: { ...R, cellWidth: 34 },
          11: { ...R, cellWidth: 86 },
          12: { ...R, cellWidth: 86, fontStyle: "bold" },
      },
      didDrawCell: (data: { row: { index: number }; column: { index: number }; section: string; cell: { x: number; y: number; width: number; height: number } }) => {
        // Clickable link: blue arrow in the Details cell of rows that have a valid URL.
        if (data.section !== "body" || data.column.index !== 1) return;
        const url = safeUrl(item.diamonds[data.row.index]?.link ?? "");
        if (!url) return;
        const { x, y, width, height } = data.cell;
        const s = 5;
        const ax = x + width - s - 2;
        const ay = y + height / 2 - s / 2;
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.8);
        doc.line(ax, ay + s, ax + s, ay);
        doc.line(ax + s * 0.4, ay, ax + s, ay);
        doc.line(ax + s, ay, ax + s, ay + s * 0.6);
        doc.link(x, y, width, height, { url });
      },
      didParseCell: (data: { row: { index: number }; section: string; cell: { styles: { fontStyle: string; fillColor: unknown } } }) => {
        if (data.section === "body" && data.row.index === item.diamonds.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = LIGHT;
        }
      },
    });
    cursor = finalY() + 10 * k;
  }

  // Summary cards
  sectionTitle("Summary");
  const cards: [string, string][] = [
    ["Total diamond weight", `${itemDiamondWeight(item).toFixed(3)} ct`],
      [`Total ${diamondLabel} amount`, money(item.diamondAmount)],
  ];
  const gap = 8;
   const cw = (contentWidth - gap * (cards.length - 1)) / cards.length;
  const ch = 30 * k + 4;
  cards.forEach(([label, value], i) => {
    const x = margin + i * (cw + gap);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, cursor, cw, ch, 3, 3, "F");
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 140);
    doc.text(label, x + 8, cursor + 11);
    doc.setFont(font, "bold");
    doc.setFontSize(10 * k + 1);
    doc.setTextColor(...NAVY);
    doc.text(value, x + 8, cursor + ch - 7);
  });
  cursor += ch + 6;

  autoTable(doc, {
    ...table,
    startY: cursor,
    margin: { left: margin, right: margin },
     head: [["Purity", "Grams", `Metal + Making (${sym})`, `${diamondLabel} (${sym})`, `Total (${sym})`]],
    body: options.length
      ? options.map((o) => [
          o.purity,
          o.grams.toFixed(3),
          money(o.total),
            money(o.selectedAmount),
            money(o.selectedTotal),
        ])
       : [[{ content: DASH, colSpan: 5, styles: { halign: "center" as const } }]],
     columnStyles: { 0: { fontStyle: "bold" }, 1: R, 2: R, 3: R, 4: { ...R, fontStyle: "bold" } },
  });
  cursor = finalY() + 10 * k;

  return doc.getNumberOfPages() > startPage || finalY() > limit;
}

function drawFooters(doc: JsPdfDoc, font: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerTop = pageHeight - 24;
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page += 1) {
    doc.setPage(page);
    doc.setFillColor(...NAVY);
    doc.rect(0, footerTop, pageWidth, 24, "F");
    // Tagline sits in the page body, just above the footer bar (not inside it).
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 110);
    doc.text(
      "Final cost may vary slightly based on the exact gold weight, diamond specifications & finishing.",
      28,
      pageHeight - 130,
    );
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 110);
    doc.text("Making Time: 6–10 Days", 28, pageHeight - 114);
    doc.setFont(font, "normal");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("LEPDO  ·  Fine Jewellery Manufacturing", 28, pageHeight - 16);
    doc.setTextColor(...GOLD);
    doc.text(
      `Page ${page} of ${count}  ·  Prices subject to current rates`,
      pageWidth - 28,
      pageHeight - 16,
      { align: "right" },
    );
  }
}

/**
 * One A4 page per saved jewellery item. Each item gets the densest layout it
 * needs to fit its own page; items that still overflow are reported, never cut.
 * Preview and download share this function, so pagination is identical.
 */
async function buildBest(source: Quotation): Promise<Built> {
  const { jsPDF, autoTable }: Libs = await pdfLibs();
  const items = source.items.map(recalcItem).filter(isItemFilled);
  const cur: Currency = source.currency === "USD" ? "USD" : "INR";
  const logo = await loadLogo();
  const pictures = await Promise.all(items.map((i) => (i.images[0]?.url ? loadImage(i.images[0].url) : null)));
  const newDoc = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" }) as JsPdfDoc;
    return { doc, font: await registerPdfFont(doc) };
  };

  // Pick a density per item using a scratch document.
  const densities: number[] = [];
  const overflowItems: number[] = [];
  for (let i = 0; i < items.length; i += 1) {
    let chosen = DENSITIES[DENSITIES.length - 1]!;
    let fits = false;
    for (const d of DENSITIES) {
      const scratch = await newDoc();
      const overflow = drawItemPage(scratch.doc, autoTable, scratch.font, { source, logo, picture: pictures[i] ?? null, cur }, items[i]!, i, items.length, d);
      if (!overflow) {
        chosen = d;
        fits = true;
        break;
      }
    }
    densities.push(chosen);
    if (!fits) overflowItems.push(i + 1);
  }

  const { doc, font } = await newDoc();
  items.forEach((item, i) => {
    if (i > 0) doc.addPage();
    drawItemPage(doc, autoTable, font, { source, logo, picture: pictures[i] ?? null, cur }, item, i, items.length, densities[i]!);
  });
  drawFooters(doc, font);
  return { doc, fits: overflowItems.length === 0, overflowItems };
}

/** Same document as the download, as a blob URL for an on-screen preview. */
export async function previewQuotationPdf(
  quotation: Quotation,
): Promise<{ url: string; fits: boolean; overflowItems: number[]; pages: number }> {
  const built = await buildBest(quotation);
  const blob = built.doc.output("blob") as Blob;
  return {
    url: URL.createObjectURL(blob),
    fits: built.fits,
    overflowItems: built.overflowItems,
    pages: built.doc.getNumberOfPages(),
  };
}

export async function exportQuotationToPdf(
  quotation: Quotation,
  options: { allowMultiPage?: boolean } = {},
) {
  const built = await buildBest(quotation);
  if (!built.fits && !options.allowMultiPage) throw new PdfOverflowError();
  built.doc.save(`${fileNameFor(quotation)}.pdf`);
}

/** Bulk: one PDF per quotation, delivered as a single ZIP download. */
export async function exportQuotationsToPdfZip(
  quotations: Quotation[],
  zipName = "lepdo-quotations",
) {
  if (!quotations.length) return;
  if (quotations.length === 1) return exportQuotationToPdf(quotations[0]!);

  const JSZip = await import("jszip").then((m) => m.default);
  await loadLogo();

  const zip = new JSZip();
  for (const quotation of quotations) {
    const { doc } = await buildBest(quotation);
    zip.file(`${fileNameFor(quotation)}.pdf`, doc.output("arraybuffer"));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${zipName}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}
