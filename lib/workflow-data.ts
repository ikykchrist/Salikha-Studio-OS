import 'server-only';
import { getLocalPostgresPool } from './local-postgres';

// A consistent snapshot: all reports and money screens use these same records.
export async function workflowData() {
  const db = await getLocalPostgresPool().connect();
  try {
    await db.query('begin isolation level repeatable read read only');
    const accounts = await db.query('select * from public.cash_accounts order by name');
    const transactions = await db.query(`select t.*, t.transaction_date::text as transaction_date, a.name as account_name, u.full_name as actor_name from public.cash_transactions t join public.cash_accounts a on a.id=t.account_id left join public.system_users u on u.id=t.created_by order by t.transaction_date, t.created_at, t.id`);
    const expenses = await db.query(`select e.*, e.expense_date::text as expense_date, e.paid_date::text as paid_date, b.event_name from public.expenses e left join public.bookings b on b.id=e.booking_id order by e.expense_date desc, e.created_at desc`);
    const bookings = await db.query(`select b.*, b.event_date::text as event_date, c.display_name as client_name, p.name as package_name from public.bookings b join public.clients c on c.id=b.client_id left join public.service_packages p on p.id=b.package_id order by b.event_date,b.id`);
    const movements = await db.query(`select m.*, coalesce(m.movement_date,(m.created_at at time zone 'Asia/Manila')::date)::text as movement_date, i.name as item_name, i.unit from public.inventory_movements m join public.inventory_items i on i.id=m.inventory_item_id order by m.created_at,m.id`);
    const items = await db.query('select * from public.inventory_items order by name');
    const reconciliations = await db.query(`select r.*, r.reconciled_date::text as reconciled_date, a.name as account_name from public.cash_reconciliations r join public.cash_accounts a on a.id=r.account_id order by r.reconciled_date desc,r.created_at desc`);
    await db.query('commit');
    return {accounts:accounts.rows, transactions:transactions.rows, expenses:expenses.rows, bookings:bookings.rows, movements:movements.rows, items:items.rows, reconciliations:reconciliations.rows};
  } catch(e) {await db.query('rollback'); throw e;} finally {db.release();}
}
