'use client';
import type {CSSProperties} from 'react';
import {useState} from 'react';
import {CircleCheck,WalletCards,Boxes,PartyPopper,ArrowRight} from 'lucide-react';
export type CloseoutSummary={recordedReceipts:number;inventoryItemsUpdated:number;unpaidCosts:number;consumablesCost:number;transportationCost:number;operatorSalary:number;totalDirectCosts:number};
const peso=(n:number)=>`₱${n.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export function CloseoutSuccess({bookingName,summary,onClose}:{bookingName:string;summary:CloseoutSummary;onClose:()=>void}){
 const [expanded,setExpanded]=useState(false);
 return <section className="calendar-setup-dialog reconciliation-dialog closeout-success">
  <div className="closeout-confetti" aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} style={{'--x':`${(i*37)%100}%`,'--delay':`${(i%8)*.07}s`,'--turn':`${i%2?720:-540}deg`,'--drift':`${(i%5-2)*45}px`,'--confetti-color':['#df334f','#f5b942','#40b88b','#a790ef'][i%4]} as CSSProperties}/>)}</div>
  <div className="closeout-medal" aria-hidden="true"><CircleCheck/></div>
  <p className="eyebrow">Another event, another happy memory</p>
  <h2 id="reconciliation-title">Great work, Salikha team!</h2>
  <p className="closeout-success-lead">Event completed. Closeout saved.</p>
  <p className="closeout-event-name">{bookingName}</p>
  <div className="closeout-confirmations" role="status">
   <div><WalletCards aria-hidden="true"/><span><strong>{summary.recordedReceipts>0?`${peso(summary.recordedReceipts)} recorded in Cashflow`:'Cashflow checked'}</strong><small>{summary.recordedReceipts>0?'Booking payments are already recorded. No duplicate collection was added.':'No posted booking payments were found. No new payment was created by closeout.'}</small></span><CircleCheck aria-hidden="true"/></div>
   <div><Boxes aria-hidden="true"/><span><strong>{summary.inventoryItemsUpdated>0?'Inventory updated':'Inventory closeout recorded'}</strong><small>{summary.inventoryItemsUpdated>0?`Actual consumption saved for ${summary.inventoryItemsUpdated} inventory item(s).`:'No inventory was consumed in this closeout. Stock remains unchanged.'}</small></span><CircleCheck aria-hidden="true"/></div>
  </div>
  {summary.unpaidCosts>0&&<p className="closeout-pending-costs">{peso(summary.unpaidCosts)} in transport / salary costs saved to Cashflow → Unpaid bills. Payment is still pending.</p>}
  <p className="closeout-motivation"><PartyPopper aria-hidden="true"/>Salamat sa effort! Every detail you take care of makes the next celebration even better.</p>
  {expanded&&<dl className="closeout-summary" id="closeout-saved-summary"><div><dt>Consumed stock cost</dt><dd>{peso(summary.consumablesCost)}</dd></div><div><dt>Transportation</dt><dd>{peso(summary.transportationCost)}</dd></div><div><dt>Operator salary</dt><dd>{peso(summary.operatorSalary)}</dd></div><div><dt>Total direct costs</dt><dd>{peso(summary.totalDirectCosts)}</dd></div></dl>}
  <div className="closeout-success-actions"><button className="secondary-button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} aria-controls="closeout-saved-summary">{expanded?'Hide summary':'View summary'}</button><button className="primary-button" data-intent="success" onClick={onClose} autoFocus>Back to bookings <ArrowRight aria-hidden="true"/></button></div>
 </section>;
}
