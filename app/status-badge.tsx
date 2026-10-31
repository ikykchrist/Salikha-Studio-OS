import {CheckCircle2,Clock3,Info,MinusCircle,AlertCircle} from 'lucide-react';

export function StatusBadge({status,label}:{status:string;label?:string}){
 const value=status.toUpperCase();
 const tone=['PAID','POSTED','DONE','COMPLETED','RECONCILED','HEALTHY','ACTIVE','READY'].includes(value)?'success':
  ['PENDING','DRAFT','SUBMITTED','REVIEW_REQUIRED','LOW_STOCK'].includes(value)?'warning':
  ['FAILED','OVERDUE','BROKEN','REJECTED'].includes(value)?'danger':
  ['CONFIRMED','PARTIAL','IN_PROGRESS'].includes(value)?'info':'neutral';
 const Icon=tone==='success'?CheckCircle2:tone==='warning'?Clock3:tone==='danger'?AlertCircle:tone==='info'?Info:MinusCircle;
 const text=label||({DONE:'Completed',REVIEW_REQUIRED:'Review required'}[value])||value.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
 return <span className="semantic-badge" data-tone={tone}><Icon size={14} aria-hidden="true"/>{text}</span>;
}
