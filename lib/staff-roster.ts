export const staffRoles = ["Photobooth Operator", "Photoman Operator"] as const;
export type StaffRole = typeof staffRoles[number];

export type StaffProfile = {
  name: string;
  address: string;
  phone: string;
  email: string;
  facebookUrl: string;
  assignment: StaffRole;
};

export type StaffEvent = {
  id: string;
  bookingId: string | null;
  eventName: string;
  eventDate: string | null;
  status: string;
  receivedAmount: string;
};

export type StaffMember = StaffProfile & {
  id: string;
  eventCount: number;
  upcomingCount: number;
  totalReceived: string;
  events: StaffEvent[];
};

export type StaffBooking = { id: string; eventName: string; eventDate: string | null; status: string };
