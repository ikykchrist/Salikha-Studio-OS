import 'server-only';
import type { PoolClient } from 'pg';

export async function postBookingDownpayment(db: PoolClient, payment: {
  bookingId: string;
  eventName: string;
  amount: number;
  date: string;
  account: { id: string; name: string };
  reference: string;
  externalReference?: string;
  actorId: string | null;
}) {
  const { bookingId, eventName, amount, date, account, reference, externalReference, actorId } = payment;
  await db.query(`insert into public.cash_transactions
    (account_id,transaction_date,type,description,amount,direction,status,reference,created_by,purpose,booking_id,external_reference)
    values($1,$2,'BOOKING_RECEIPT',$3,$4,'INFLOW','POSTED',$5,$6,'BOOKING_RECEIPT',$7,$8)`,
    [account.id, date, `Downpayment - ${eventName}`, amount, reference, actorId, bookingId, externalReference?.trim().slice(0, 250) || null]);
  await db.query('insert into public.payments(booking_id,amount,payment_date,method,reference,created_by) values($1,$2,$3,$4,$5,$6)',
    [bookingId, amount, date, account.name, reference, actorId]);
}
