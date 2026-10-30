export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0,10) === v;
export function cents(v: unknown) {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(String(v))) throw Error('Enter an amount with at most two decimal places.');
  return Math.round(Number(v) * 100);
}
export const todayManila = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const money = (v: number) => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v);
