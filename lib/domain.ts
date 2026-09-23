export type BookingStatus = "INQUIRY" | "TENTATIVE" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERPAID" | "REFUNDED";

export type Client = {
  id: string;
  display_name: string;
  phone: string | null;
  facebook_url: string | null;
  address: string | null;
  maps_url: string | null;
  created_at: string;
};

export type Booking = {
  id: string;
  client_id: string;
  event_name: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: BookingStatus;
  notes: string | null;
};
