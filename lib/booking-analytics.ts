type Booking = { event_date: string | null; package_id: string | null; status: string };
type ServicePackage = { id: string; name: string; is_active: boolean };

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
    .map(pkg => ({ id: pkg.id, name: pkg.name, count: counts[pkg.id] ?? 0 }));
  if (counts.unassigned) rows.push({ id: "unassigned", name: "No package assigned", count: counts.unassigned });
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type BusinessAnalytics = {
  months: ReturnType<typeof countBookingsByMonth>;
  packages: ServicePackage[];
  through: string;
  income: number;
  cost: number;
  profit: number;
};
