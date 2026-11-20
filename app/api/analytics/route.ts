import { requireUser } from "../../../lib/auth";
import { countBookingsByMonth, profitBreakdown, profitHistory, type BusinessAnalytics } from "../../../lib/booking-analytics";
import { buildFinancialReport } from "../../../lib/financial-report";
import { workflowData } from "../../../lib/workflow-data";
import { todayManila } from "../../../lib/workflow-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  try {
    const source = await workflowData({ includePackages: true });
    const through = todayManila();
    const report = buildFinancialReport(source, "0001-01-01", through);
    const summary: BusinessAnalytics = {
      months: countBookingsByMonth(source.bookings.map(row => ({
        event_date: row.event_date, package_id: row.package_id, status: row.status,
      }))),
      packages: source.packages,
      through,
      income: (Math.round(report.revenue * 100) + Math.round(report.otherIncome * 100)) / 100,
      cost: (Math.round(report.directCosts * 100) + Math.round(report.operatingCosts * 100)) / 100,
      profit: report.operatingProfit,
      history: profitHistory(report),
      breakdown: profitBreakdown(report, source.expenses.map(row => ({ id: row.id, category: row.category }))),
    };
    return Response.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Analytics could not load. Check the database connection and try again." }, { status: 503 });
  }
}
