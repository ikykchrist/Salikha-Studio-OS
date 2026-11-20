import type { FinancialReport } from "./financial-report";

type Booking = { event_date: string | null; package_id: string | null; status: string };
type ServicePackage = { id: string; name: string; is_active: boolean; calendar_color: string | null };

export function countBookingsByMonth(bookings: Booking[]) {
  const months: Record<string, Record<string, number>> = {};
  for (const booking of bookings) {
    if (!booking.event_date || !["PENDING", "CONFIRMED", "DONE"].includes(booking.status)) continue;
    const month = booking.event_date.slice(0, 7);
    const counts = months[month] ??= {};
    const id = booking.package_id ?? "unassigned";
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return months;
}

export function monthlyPackages(packages: ServicePackage[], counts: Record<string, number>) {
  const rows = packages.filter(pkg => pkg.is_active || counts[pkg.id])
    .map(pkg => ({ id: pkg.id, name: pkg.name, color: pkg.calendar_color, count: counts[pkg.id] ?? 0 }));
  if (counts.unassigned) rows.push({ id: "unassigned", name: "No package assigned", color: null, count: counts.unassigned });
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function profitHistory(report: FinancialReport) {
  const [year, month] = report.to.split("-").map(Number);
  const periods = new Map<string, { grossCents: number; netCents: number; recorded: boolean }>();
  const months = Array.from({ length: 12 }, (_, index) =>
    new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 7));
  const years = Array.from({ length: 5 }, (_, index) => String(year - 4 + index));
  for (const period of [...months, ...years]) periods.set(period, { grossCents: 0, netCents: 0, recorded: false });

  function record(date: string | null, gross: number, net: number) {
    if (!date) return;
    for (const key of [date.slice(0, 7), date.slice(0, 4)]) {
      const period = periods.get(key);
      if (!period) continue;
      period.grossCents += Math.round(gross * 100);
      period.netCents += Math.round(net * 100);
      period.recorded = true;
    }
  }
  for (const row of report.revenueRows) record(row.date, row.revenue, row.revenue);
  for (const row of report.costRows) record(row.date, row.category === "DIRECT" ? -row.amount : 0, -row.amount);
  for (const tx of report.ledger) {
    if (tx.status === "POSTED" && tx.purpose === "OTHER_INCOME") record(tx.transaction_date, 0, Number(tx.amount));
  }
  const series = (keys: string[]) => keys.map(period => {
    const { grossCents, netCents, recorded } = periods.get(period)!;
    return { period, gross: grossCents / 100, net: netCents / 100, recorded };
  });
  return { monthly: series(months), annual: series(years) };
}

export type BusinessAnalytics = {
  months: ReturnType<typeof countBookingsByMonth>;
  packages: ServicePackage[];
  through: string;
  income: number;
  cost: number;
  profit: number;
  history: ReturnType<typeof profitHistory>;
  breakdown: {
    bookingRevenue: number;
    otherIncome: number;
    grossProfit: number;
    directCosts: number;
    operatingCosts: number;
    directGroups: { label: string; amount: number }[];
    operatingGroups: { label: string; amount: number }[];
  };
};

export function profitBreakdown(report: FinancialReport, expenses: { id: string; category: string }[]): BusinessAnalytics["breakdown"] {
  const categories = new Map(expenses.map(row => [row.id, row.category || "Other expenses"]));
  const direct = new Map<string, number>();
  const operating = new Map<string, number>();
  for (const row of report.costRows) {
    const groups = row.category === "DIRECT" ? direct : operating;
    const label = categories.get(row.reference) ?? "Stock and ink usage";
    groups.set(label, (groups.get(label) ?? 0) + Math.round(row.amount * 100));
  }
  const list = (groups: Map<string, number>) => Array.from(groups, ([label, cents]) => ({ label, amount: cents / 100 }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  return { bookingRevenue: report.revenue, otherIncome: report.otherIncome, grossProfit: report.grossProfit,
    directCosts: report.directCosts, operatingCosts: report.operatingCosts, directGroups: list(direct), operatingGroups: list(operating) };
}
