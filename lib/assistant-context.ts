import "server-only";
import { workflowData } from "./workflow-data";
import { buildFinancialReport } from "./financial-report";
import { todayManila } from "./workflow-validation";

const short = (value: unknown, length = 90) => String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, length);
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

export async function assistantStudioContext() {
  const data = await workflowData();
  const today = todayManila();
  const monthStart = `${today.slice(0, 7)}-01`;
  const report = buildFinancialReport(data, monthStart, today);
  const nextMonth = new Date(`${today}T12:00:00Z`);
  nextMonth.setUTCDate(nextMonth.getUTCDate() + 30);
  const horizon = nextMonth.toISOString().slice(0, 10);
  const active = data.bookings.filter(b => !["CANCELLED", "ARCHIVED"].includes(b.status));
  const upcoming = active.filter(b => b.event_date && b.event_date >= today && b.event_date <= horizon && b.status !== "DONE")
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))).slice(0, 20);
  const outstanding = active.filter(b => Number(b.total_amount) > Number(b.paid_amount))
    .sort((a, b) => (Number(b.total_amount) - Number(b.paid_amount)) - (Number(a.total_amount) - Number(a.paid_amount))).slice(0, 15);
  const lowStock = data.items.filter(i => i.is_active && Number(i.on_hand) <= Number(i.reorder_level))
    .sort((a, b) => Number(a.on_hand) - Number(b.on_hand)).slice(0, 20);
  return {
    asOfManila: today,
    basis: "Read-only snapshot from the same database and financial report calculation used by Salikha Reports. Currency PHP. No client phone, email, internal notes, or source documents included.",
    period: { from: monthStart, to: today },
    financial: {
      revenueFromDoneEvents: report.revenue,
      directCosts: report.directCosts,
      grossProfit: report.grossProfit,
      operatingCosts: report.operatingCosts,
      otherIncome: report.otherIncome,
      operatingProfit: report.operatingProfit,
      cashIn: report.cashIn,
      cashOut: report.cashOut,
      netCash: report.netCash,
      totalCashBalance: report.closing,
      accountBalances: report.accounts.map(a => ({ account: short(a.name, 50), balance: a.closing, needsReview: a.needsReview })),
      warnings: report.warnings.slice(0, 8),
    },
    bookings: {
      activeCount: active.length,
      pendingCount: active.filter(b => b.status === "PENDING").length,
      upcomingNext30Days: upcoming.map(b => ({ reference: b.id.slice(0, 8), event: short(b.event_name), date: b.event_date, status: b.status, package: short(b.package_name), bookedValue: money(b.total_amount), collected: money(b.paid_amount), balance: money(Number(b.total_amount) - Number(b.paid_amount)) })),
      largestUnpaid: outstanding.map(b => ({ reference: b.id.slice(0, 8), event: short(b.event_name), date: b.event_date || "TBA", balance: money(Number(b.total_amount) - Number(b.paid_amount)) })),
    },
    inventory: { lowStockCount: data.items.filter(i => i.is_active && Number(i.on_hand) <= Number(i.reorder_level)).length,
      lowStock: lowStock.map(i => ({ item: short(i.name), onHand: Number(i.on_hand), reorderAt: Number(i.reorder_level), unit: short(i.unit, 25) })) },
  };
}
