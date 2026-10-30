import type { FinancialReport } from './financial-report';

// Self-contained, paginated PDF writer. All monetary values use PHP, not an
// unsupported peso glyph in the standard PDF fonts. Raw source IDs stay in detail.
export function financialReportPdf(r:FinancialReport,kind:'cashflow'|'revenue'){
  const streams:string[][]=[];let page:string[]=[];let y=0;
  const ascii=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[^\x20-\x7e]/g,'?').replace(/([\\()])/g,'\\$1');
  const text=(s:string,size=10,bold=false,x=44)=>{page.push(`BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${ascii(s)}) Tj ET`);};
  const fresh=()=>{if(page.length)streams.push(page);page=[];y=799;text('SALIKHA / STUDIO OPERATIONS',10,true);y-=28;text(kind==='cashflow'?'Cash flow statement':'Revenue and operating profit',22,true);y-=21;text(`${r.from} to ${r.to} | PHP | Generated ${r.generatedAt.slice(0,16).replace('T',' ')} UTC`,9);y-=25;};
  const line=(s:string,bold=false)=>{
    const width=(value:string)=>[...value].reduce((sum,c)=>sum+(/[ilI.,:;'!|]/.test(c)?2.8:/[MW@]/.test(c)?9:/[A-Z0-9]/.test(c)?6.7:c===' '?3:5.8),0);
    let buffer='';for(const word of s.split(/\s+/)){if(width(buffer+' '+word)>490&&buffer){if(y<65)fresh();text(buffer,10,bold);y-=16;buffer='';}for(const char of word){if(width(buffer+char)>490){if(y<65)fresh();text(buffer,10,bold);y-=16;buffer='';}buffer+=char;}buffer+=' ';}
    if(buffer){if(y<65)fresh();text(buffer.trim(),10,bold);y-=16;}
  };
  const space=()=>{y-=12;};
  const amount=(n:number)=>`PHP ${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  fresh();
  if(kind==='cashflow'){
    line(`Opening book cash     ${amount(r.opening)}`,true);line(`External cash received     ${amount(r.cashIn)}`);line(`External cash paid     ${amount(r.cashOut)}`);line(`Net cash movement     ${amount(r.netCash)}`);line(`Closing book cash     ${amount(r.closing)}`,true);space();
    line('CASH FLOWS BY ACTIVITY',true);for(const g of r.flowGroups){line(`${g.label}: in ${amount(g.cashIn)} | out ${amount(g.cashOut)} | net ${amount(g.net)}`);}space();
    line('ACCOUNT RECONCILIATION',true);for(const a of r.accounts){line(`${a.name}: opening ${amount(a.opening)} | closing ${amount(a.closing)}`);line(`Last count: ${a.reconciledDate||'Never'} | ${a.needsReview?'REVIEW REQUIRED':'Reconciled'} | variance ${a.variance===null?'Not counted':amount(a.variance)}`);}space();
    line('CASH POSTING DETAILS (including transfers and voided records)',true);
    for(const t of r.ledger){line(`${t.transaction_date} | ${t.account_name} | ${t.status} | ${t.direction==='INFLOW'?'+':'-'}${amount(Number(t.amount))}`,true);line(`${t.description} | ${t.purpose}`);line(`ID ${t.id} | Actor: ${t.actor_name||'Legacy / unavailable'}`);if(t.external_reference)line(`Receipt / bank reference: ${t.external_reference}`);if(t.void_reason)line(`Void reason: ${t.void_reason}`);space();}
    if(!r.ledger.length)line('No cash postings in this period.');
  }else{
    line(`Earned booking revenue     ${amount(r.revenue)}`,true);line(`Direct costs including consumed stock     ${amount(r.directCosts)}`);line(`Gross profit     ${amount(r.grossProfit)}`);line(`Operating costs     ${amount(r.operatingCosts)}`);line(`Other recorded income     ${amount(r.otherIncome)}`);line(`Operating profit / (loss)     ${amount(r.operatingProfit)}`,true);line(`Operating margin     ${r.margin.toFixed(1)}%`);space();
    line('COMPLETED SERVICE DETAILS',true);for(const b of r.revenueRows){line(`${b.date} | ${b.description} | ${amount(b.revenue)}`,true);line(`${b.client} | ${b.package} | ID ${b.id}`);}if(!r.revenueRows.length)line('No completed services in this period.');space();
    line('COST SCHEDULE',true);for(const c of r.costRows){line(`${c.date} | ${c.category} | ${amount(c.amount)}`,true);line(c.description);line(`Source ${c.reference}`);}if(!r.costRows.length)line('No recorded costs in this period.');
  }
  space();line('BASIS AND REVIEW NOTES',true);line(r.basis);line('Transfers between your accounts are excluded from combined cash in/out.');line('Owner capital, draws, loan principal and stock purchases are not operating profit.');line('Operating result is before unrecorded depreciation, tax and financing costs.');line('This is a management report, not an independently audited financial statement.');
  for(const warning of r.warnings){space();line(`REVIEW: ${warning}`);}
  streams.push(page);
  const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  streams.forEach((commands,i)=>{commands.push(`BT /F1 8 Tf 44 30 Td (Salikha Studio OS | Page ${i+1} of ${streams.length} | Internal management report) Tj ET`);const content=commands.join('\n');const contentId=objects.length+2;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);});
  objects[1]=`<< /Type /Pages /Kids [${streams.map((_,i)=>`${5+i*2} 0 R`).join(' ')}] /Count ${streams.length} >>`;
  let output='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
