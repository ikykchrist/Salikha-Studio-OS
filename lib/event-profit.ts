import type {FinancialSource} from './financial-report';
export function eventProfit(source:FinancialSource,id:string){
 const b=source.bookings.find(b=>b.id===id);if(!b)return null;
 const cents=(n:string|number)=>Math.round(Number(n)*100);
 const stock=source.movements.filter(m=>m.booking_id===id&&['USAGE','RETURN'].includes(m.movement_type));
 const hasUsage=stock.some(m=>m.movement_type==='USAGE');
 const expenses=source.expenses.filter(e=>e.booking_id===id&&e.classification==='DIRECT'&&!['VOIDED','DRAFT'].includes(e.status)&&e.accounting_treatment!=='INVENTORY_PURCHASE'&&!(e.category==='Consumables'&&hasUsage));
 const costs=[...expenses.map(e=>({id:e.id,date:e.expense_date,description:e.description,category:e.category,amount:cents(e.amount)/100,status:e.status})),...stock.map(m=>({id:m.id,date:m.movement_date,description:`${m.movement_type==='RETURN'?'Returned':'Consumed'}: ${m.item_name}`,category:'Stock',amount:Math.round(Number(m.quantity)*Number(m.unit_cost)*100)*(m.movement_type==='RETURN'?-1:1)/100,status:'RECORDED'}))];
 const directCosts=costs.reduce((n,c)=>n+cents(c.amount),0);
 const cancelled=['CANCELLED','ARCHIVED'].includes(b.status),earned=b.status==='DONE';
 const revenue=cancelled?0:cents(b.total_amount),profit=revenue-directCosts;
 return {id:b.id,event:b.event_name,client:b.client_name,date:b.event_date,status:b.status,earned,closedOut:Boolean(b.consumables_reconciled_at),bookedValue:cents(b.total_amount)/100,revenue:revenue/100,collected:cents(b.paid_amount)/100,directCosts:directCosts/100,profit:profit/100,margin:revenue?profit/revenue*100:null,costs};
}
