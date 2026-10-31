'use client';

import {useRef,useState} from 'react';
import {Copy,MessageCircle,RotateCcw} from 'lucide-react';

type Contact={id:string;name:string;email:string;phone:string;messenger:string};
const templates=[
 {id:'event',label:'Event Follow Up',when:'Before the event · confirm details and offer help'},
 {id:'inquiry',label:'Inquiry Follow Up',when:'After sending a quotation · invite the client to continue'},
 {id:'feedback',label:'Post-event Thank You & Feedback',when:'After the event · build the relationship'},
 {id:'returning',label:'Returning Client / Rebooking',when:'Reconnect with a previous client about their next celebration'},
 {id:'cold',label:'Cold Outreach Message',when:'Introduce Salikha to a prospective client'},
 {id:'call',label:'Cold Call Script',when:'A short introduction for a phone conversation'},
 {id:'promo',label:'Promo Notification',when:'Share an actual approved offer with a relevant client'},
 {id:'referral',label:'Referral Request',when:'Ask a happy client to recommend Salikha'},
] as const;
type TemplateId=typeof templates[number]['id'];

function compose(action:TemplateId,name:string,event:string,offer:string){
 const greeting=`Hi ${name || 'po'}!`;
 const occasion=event.trim() || 'inyong event';
 switch(action){
  case 'event': return `${greeting} Kumusta po? This is Salikha Studio. Follow-up lang po para sa ${occasion}. May updates po ba sa venue, schedule, theme, or program na kailangan naming ihanda? Happy po kaming tumulong para maging smooth ang inyong celebration. Pwede po ninyong i-send dito ang latest details. 😊`;
  case 'inquiry': return `${greeting} This is Salikha Studio. Kumusta po ang plans ninyo para sa ${occasion}? Follow-up lang po sa package na napag-usapan natin. May questions po ba kayo sa inclusions or may gusto kayong i-adjust? Send lang po ang preferred date at venue para ma-check namin ang availability at mahanap ang bagay na setup para sa inyo. 😊`;
  case 'feedback': return `${greeting} Maraming salamat po sa pagtiwala sa Salikha Studio para sa ${occasion}! Sana po ay naging memorable ang experience ninyo at ng inyong guests. Kumusta po ang service namin? We'd love to hear what you enjoyed and what we can improve. Looking forward po kami sa next celebration ninyo! ❤️`;
  case 'returning': return `${greeting} Kumusta po kayo? Salikha Studio here! Thank you po ulit sa naging tiwala ninyo sa amin. May upcoming birthday, reunion, or company event po ba kayo or ang family ninyo? We'd love to be part of it again. Send lang po ang target date at event details para makapag-suggest kami ng suitable package. 😊`;
  case 'cold': return `${greeting} I'm from Salikha Studio. We offer photobooth and photo services for birthdays, family celebrations, and company events. May upcoming event po ba kayo na nangangailangan ng photo experience for your guests? If okay po sa inyo, may I send our packages for your reference? No worries po if hindi pa ngayon. 😊`;
  case 'call': return `Hello ${name || 'po'}! This is Salikha Studio. Okay lang po ba ang isang mabilis na introduction?\n\nWe provide photobooth and photo services for celebrations and company events. May upcoming event po ba kayo na we can help with?\n\nIf interested: Ano pong date, venue, at type of event? May preferred budget or setup po ba kayo?\n\nMay I send our packages through your preferred contact channel, then follow up at a time convenient for you?\n\nIf not interested: Thank you po sa time ninyo. Have a great day!`;
  case 'promo': return `${greeting} Salikha Studio here! Sharing our current offer in case may upcoming celebration po kayo:\n\n${offer.trim() || '[Enter the approved promo details above]'}\n\nInterested po ba kayong malaman kung anong package ang bagay sa ${occasion}? Reply lang po with your target date and venue so we can check availability and explain the offer's terms. 😊`;
  case 'referral': return `${greeting} Thank you po ulit for choosing Salikha Studio! If happy po kayo sa experience natin, baka may friends, family, or colleagues kayong may upcoming event. We'd appreciate it po if you could recommend us or share our contact with them. Happy po kaming mag-send ng package options kapag sila na ang nag-reach out. Maraming salamat po sa support! ❤️`;
 }
}

export function ClientMessageTemplates({clients,clientId,onClientChange,onUse}:{clients:Contact[];clientId:string;onClientChange:(id:string)=>void;onUse:(message:string)=>void}){
 const [action,setAction]=useState<TemplateId>('event');
 const [event,setEvent]=useState(''),[offer,setOffer]=useState(''),[edited,setEdited]=useState<string|null>(null),[notice,setNotice]=useState('');
 const messageRef=useRef<HTMLTextAreaElement>(null);
 const contact=clients.find(c=>c.id===clientId);
 const template=templates.find(t=>t.id===action)!;
 const draft=edited??compose(action,contact?.name||'',event,offer);
 const ready=Boolean(contact&&draft.trim()&&(action!=='promo'||offer.trim()));
 const reset=()=>{setEdited(null);setNotice('');};
 return <article className="panel client-message-templates">
  <div className="panel-heading"><div><p className="eyebrow">Client care / Repeat bookings</p><h2>Ready-to-copy messages</h2></div><MessageCircle aria-hidden="true"/></div>
  <p className="workflow-help">Choose a client and action, personalize the draft, then copy it into your conversation. Use the call script when reaching out by phone.</p>
  <div className="form-grid">
   <label>Message for client<select value={clientId} onChange={e=>{onClientChange(e.target.value);reset();}}><option value="">Choose client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Message action<select value={action} onChange={e=>{setAction(e.target.value as TemplateId);reset();}}>{templates.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
   <label className="wide-field">Event / occasion (optional)<input value={event} maxLength={200} placeholder="e.g. Ryden's birthday on November 8" onChange={e=>{setEvent(e.target.value);reset();}}/></label>
   {action==='promo'&&<label className="wide-field">Approved promo details<textarea rows={3} value={offer} maxLength={1500} placeholder="Enter the real offer, inclusions, validity dates and conditions." onChange={e=>{setOffer(e.target.value);reset();}}/><small>Enter your actual offer before copying. No discount or deadline is assumed.</small></label>}
   <label className="wide-field">{action==='call'?'Editable call script':'Editable message'}<small>{template.when}</small><textarea ref={messageRef} rows={8} maxLength={3500} value={draft} onChange={e=>{setEdited(e.target.value);setNotice('');}}/></label>
  </div>
  <div className="workflow-actions">
   <button type="button" className="primary-button" data-intent="info" disabled={!ready} onClick={async()=>{try{await navigator.clipboard.writeText(draft);setNotice('Copied. Paste it into your conversation when ready.');}catch{messageRef.current?.focus();messageRef.current?.select();setNotice('Automatic copy is unavailable. The text is selected; press Ctrl+C to copy.');}}}><Copy size={17}/> Copy {action==='call'?'call script':'message'}</button>
   <button type="button" className="secondary-button" onClick={reset}><RotateCcw size={17}/> Reset draft</button>
   <button type="button" className="secondary-button" disabled={!ready} onClick={()=>{onUse(`${template.label}\n\n${draft}`);setNotice('Added to the follow-up form below. Choose a due date and Save activity to schedule it.');}}>Use as follow-up</button>
   {contact&&/^https?:\/\//i.test(contact.messenger)&&<a className="secondary-button" target="_blank" rel="noreferrer" href={contact.messenger}>Open Messenger / profile</a>}
  </div>
  {!contact&&<p className="workflow-help">Choose a client to personalize and copy a message.</p>}
  <p className="workflow-help">Copying or opening a chat does not send a message or mark a follow-up complete. Record the outcome below after reaching out.</p>
  {notice&&<p className="workflow-callout" data-tone="info" role="status">{notice}</p>}
 </article>;
}
