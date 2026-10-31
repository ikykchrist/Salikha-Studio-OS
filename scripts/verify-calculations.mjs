// Pure calculation QA. Does not connect to a database or write business records.
import assert from 'node:assert/strict';
import {buildFinancialReport} from '../lib/financial-report.ts';
import {cents,validDate} from '../lib/workflow-validation.ts';

let checks=0;
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const transaction=(id,amount,direction,purpose,extra={})=>({id,account_id:'cash',account_name:'Cash',transaction_date:'2026-01-15',created_at:'2026-01-15T10:00:00Z',amount,direction,purpose,status:'POSTED',reference:null,booking_id:null,...extra});
const booking=(id,status,total,paid)=>({id,status,total_amount:total,paid_amount:paid,event_date:'2026-01-15',event_name:id,client_name:'QA client',package_name:'QA package',consumables_reconciled_at:'2026-01-15T10:00:00Z'});
const expense=(id,amount,classification,extra={})=>({id,amount,classification,expense_date:'2026-01-15',description:id,status:'PAID',category:'Other',accounting_treatment:'EXPENSE',booking_id:null,...extra});
const source={
 accounts:[{id:'cash',name:'Cash',opening_balance:1000,is_active:true},{id:'bank',name:'Bank',opening_balance:0,is_active:true}],
 bookings:[booking('done','DONE',1000,300),booking('pending','PENDING',500,100),booking('cancelled','CANCELLED',500,0)],
 transactions:[transaction('receipt',300,'INFLOW','BOOKING_RECEIPT',{booking_id:'done'}),transaction('deposit',100,'INFLOW','BOOKING_RECEIPT',{booking_id:'pending'}),transaction('transfer-out',50,'OUTFLOW','TRANSFER'),transaction('transfer-in',50,'INFLOW','TRANSFER',{account_id:'bank',account_name:'Bank'}),transaction('capital',200,'INFLOW','OWNER_CAPITAL'),transaction('loan',100,'INFLOW','LOAN_RECEIVED'),transaction('rent',50,'OUTFLOW','EXPENSE_PAYMENT'),transaction('stock',500,'OUTFLOW','EXPENSE_PAYMENT'),transaction('voided',900,'INFLOW','BOOKING_RECEIPT',{status:'VOIDED'})],
 expenses:[expense('rent',50,'OPERATING'),expense('unpaid event cost',100,'DIRECT',{status:'PENDING',booking_id:'done'}),expense('unused stock',500,'DIRECT',{accounting_treatment:'INVENTORY_PURCHASE'}),expense('future service',90,'DIRECT',{booking_id:'pending'})],
 movements:[{id:'usage',booking_id:'done',movement_date:'2026-01-15',movement_type:'USAGE',quantity:3,unit_cost:20,item_name:'Paper'},{id:'return',booking_id:'done',movement_date:'2026-01-16',movement_type:'RETURN',quantity:1,unit_cost:20,item_name:'Paper'}],
 reconciliations:[],
};
const report=buildFinancialReport(source,'2026-01-01','2026-01-31');
equal(report.opening,1000);
equal(report.cashIn,700); // Receipts, capital and loan; excludes own-account transfers.
equal(report.cashOut,550);
equal(report.closing,1150);
equal(report.accounts.reduce((sum,a)=>sum+a.closing,0),report.closing);
equal(report.revenue,1000); // Pending deposits are cash, not earned service revenue.
equal(report.directCosts,140); // Incurred cost + consumption - returned stock.
equal(report.operatingCosts,50);
equal(report.operatingProfit,810);
equal(report.outstanding.map(b=>[b.id,b.balance]),[['done',700],['pending',400]]);
equal(report.ledger.filter(t=>t.status==='VOIDED').length,1); // Retain audit visibility.
equal(report.costRows.some(c=>c.description==='unused stock'),false);
equal(report.costRows.some(c=>c.description==='future service'),false);
equal(buildFinancialReport({...source,movements:source.movements.slice(0,1)},'2026-01-01','2026-01-31').directCosts,160);
equal(buildFinancialReport({...source,transactions:[...source.transactions,transaction('prior',100,'INFLOW','OWNER_CAPITAL',{transaction_date:'2025-12-31'})]},'2026-01-01','2026-01-31').opening,1100);
equal(buildFinancialReport({...source,transactions:[...source.transactions,transaction('future',999,'INFLOW','OTHER_INCOME',{transaction_date:'2026-02-01'})]},'2026-01-01','2026-01-31').closing,1150);
equal(cents('0.29'),29);
equal(validDate('2026-02-30'),false);
assert.throws(()=>cents('10.001'));checks++;
console.log(`PASS: ${checks} financial calculation and validation checks. No database mutations.`);
