import type { FinancialReport } from './financial-report';
import { combinedRunningBalances } from './running-balance';

// A4 statement layout modeled on the supplied account-history reference.
// Standard PDF fonts use PHP rather than an unsupported peso glyph.
export function financialReportPdf(r:FinancialReport,kind:'cashflow'|'revenue'){
  const pages:string[][]=[];let page:string[]=[],y=0;
  const left=40,width=515,bottom=48;
  const red='0.72 0.12 0.20',pale='0.985 0.925 0.935',ink='0.20 0.17 0.19';
  const clean=(s:string)=>s.replace(/\s/g,' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[^\x20-\x7e]/g,'?');
  const escape=(s:string)=>clean(s).replace(/([\\()])/g,'\\$1');
  const measure=(s:string,size:number,bold=false)=>[...clean(s)].reduce((n,c)=>n+(/[ilI.,:;'!|]/.test(c)?0.26:/[MW@]/.test(c)?0.88:c===' '?0.25:/[A-Z]/.test(c)?0.72:0.51),0)*size*(bold?1.04:1);
  const text=(s:string,x:number,yy:number,size=8,bold=false,color=ink)=>page.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm (${escape(s)}) Tj ET`);
  const rect=(x:number,yy:number,w:number,h:number,color:string)=>page.push(`${color} rg ${x} ${yy} ${w} ${h} re f`);
  const money=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const wrap=(value:string,max:number,size=7.4)=>{
    const lines:string[]=[];let line='';
    for(const word of clean(value).split(/\s+/)){
      if(line&&measure(line+' '+word,size)>max){lines.push(line);line='';}
      for(const c of word){if(measure(line+c,size)>max&&line){lines.push(line);line='';}line+=c;}
      line+=' ';
    }
    if(line.trim())lines.push(line.trim());return lines.length?lines:[''];
  };
  const fresh=()=>{
    if(page.length)pages.push(page);page=[];
    const title=kind==='cashflow'?'Salikha Transaction History':'Salikha Revenue Report';
    text(title,(595-measure(title,21,true))/2,797,21,true,red);
    const dates=`${r.from} to ${r.to}`;text(dates,(595-measure(dates,10))/2,771,10,false,red);
    y=750;
  };
  const section=(title:string)=>{if(y<bottom+45)fresh();y-=12;text(title,left,y,10,true,red);y-=12;};
  type Column={label:string;width:number;right?:boolean};
  const table=(columns:Column[],rows:string[][])=>{
    const header=()=>{rect(left,y-15,width,15,red);let x=left;for(const col of columns){text(col.label,col.right?x+col.width-4-measure(col.label,7,true):x+4,y-10,7,true,'1 1 1');x+=col.width;}y-=15;};
    header();let stripe=0;
    for(const row of rows){
      const cells=columns.map((col,i)=>wrap(row[i]||'',col.width-8));
      const count=Math.max(...cells.map(c=>c.length));let offset=0;
      // Keep ordinary rows intact; split only a row taller than a full page.
      if(count*9+6>y-bottom&&count*9+6<=750-15-bottom){fresh();header();}
      while(offset<count){
        if(y-bottom<16){fresh();header();}
        const take=Math.min(count-offset,Math.max(1,Math.floor((y-bottom-6)/9)));
        const height=take*9+6;
        if(stripe%2===0)rect(left,y-height,width,height,pale);
        let x=left;
        columns.forEach((col,i)=>{for(let n=0;n<take;n++){const s=cells[i][offset+n]||'';text(s,col.right?x+col.width-4-measure(s,7.4):x+4,y-10-n*9,7.4);}x+=col.width;});
        y-=height;offset+=take;
      }
      stripe++;
    }
    y-=8;
  };
  const notes=(value:string)=>{for(const line of wrap(value,width,8)){if(y<bottom+12)fresh();text(line,left,y,8);y-=11;}y-=5;};
  fresh();
  if(kind==='cashflow'){
    // PostgreSQL returns Date objects server-side; JSON clients receive strings.
    const ordered=r.ledger.map(t=>({...t,created_at:typeof t.created_at==='string'?t.created_at:new Date(t.created_at).toISOString()})).sort((a,b)=>a.transaction_date.localeCompare(b.transaction_date)||a.created_at.localeCompare(b.created_at));
    const balances=combinedRunningBalances([{id:'opening',name:'Opening',opening_balance:r.opening,is_active:true}],ordered);
    const rows:string[][]=[['','STARTING BALANCE','','','',money(r.opening)]];
    for(const t of ordered)rows.push([t.transaction_date,`${t.description} / ${t.account_name}${t.status==='POSTED'?'':` - ${t.status} (no cash effect)`}`,t.external_reference||t.reference||t.id,t.status==='POSTED'&&t.direction==='OUTFLOW'?money(Number(t.amount)):'',t.status==='POSTED'&&t.direction==='INFLOW'?money(Number(t.amount)):'',money(balances.get(t.id)??r.opening)]);
    rows.push(['','ENDING BALANCE','','','',money(r.closing)]);
    table([{label:'Date',width:57},{label:'Description / Account',width:180},{label:'Reference No.',width:113},{label:'Debit',width:55,right:true},{label:'Credit',width:55,right:true},{label:'Balance',width:55,right:true}],rows);
    section('Cash flow summary (PHP)');
    table([{label:'Activity',width:260},{label:'Cash in',width:85,right:true},{label:'Cash out',width:85,right:true},{label:'Net',width:85,right:true}],r.flowGroups.map(g=>[g.label,money(g.cashIn),money(g.cashOut),money(g.net)]));
    section('Account reconciliation (PHP)');
    table([{label:'Account',width:125},{label:'Opening',width:75,right:true},{label:'Closing',width:75,right:true},{label:'Last count',width:75},{label:'Review / Variance',width:165}],r.accounts.map(a=>[a.name,money(a.opening),money(a.closing),a.reconciledDate||'Never',`${a.needsReview?'Review required':'Reconciled'} / ${a.variance===null?'Not counted':money(a.variance)}`]));
    section('Posting audit trail');
    table([{label:'Date',width:60},{label:'Posting ID',width:175},{label:'Purpose',width:115},{label:'Posted by',width:165}],ordered.map(t=>[t.transaction_date,t.id,t.purpose,t.actor_name||'Legacy / unavailable']));
    const voids=ordered.filter(t=>t.void_reason);if(voids.length){section('Voided record explanations');for(const t of voids)notes(`${t.id}: ${t.void_reason}`);}
  }else{
    table([{label:'Performance summary (PHP)',width:400},{label:'Amount',width:115,right:true}],[['Earned booking revenue',money(r.revenue)],['Direct costs including consumed stock',money(r.directCosts)],['Gross profit',money(r.grossProfit)],['Operating costs',money(r.operatingCosts)],['Other recorded income',money(r.otherIncome)],['Operating profit / (loss)',money(r.operatingProfit)],['Operating margin',`${r.margin.toFixed(1)}%`]]);
    section('Completed service details (PHP)');
    table([{label:'Event date',width:60},{label:'Event / Client / Package',width:240},{label:'Revenue',width:75,right:true},{label:'Collected',width:70,right:true},{label:'Due',width:70,right:true}],r.revenueRows.length?r.revenueRows.map(b=>[b.date||'TBA',`${b.description} / ${b.client} / ${b.package} / ID ${b.id}`,money(b.revenue),money(b.collected),money(b.balance)]):[['','No completed services in this period.','','','']]);
    section('Cost schedule (PHP)');
    table([{label:'Date',width:60},{label:'Description',width:235},{label:'Classification / Reference',width:145},{label:'Amount',width:75,right:true}],r.costRows.length?r.costRows.map(c=>[c.date,c.description,`${c.category} / ${c.reference}`,money(c.amount)]):[['','No recorded costs in this period.','','']]);
  }
  section('Basis and review notes');
  notes(r.basis);
  notes('Amounts in PHP. Debit = cash out; credit = cash in. Balance combines cash and all accounts. Transfers between your own accounts do not change the combined balance; their individual debit and credit legs remain visible. Voided postings have no cash effect.');
  notes('Owner capital, draws, loan principal and stock purchases are not operating profit. Operating result is before unrecorded depreciation, tax and financing costs. Internal management report; not an independently audited financial statement.');
  for(const warning of r.warnings)notes(`REVIEW: ${warning}`);
  pages.push(page);
  const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>','<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>'];
  pages.forEach((commands,i)=>{
    const footer=`Salikha Studio OS | PHP | Page ${i+1} of ${pages.length}`;
    commands.push(`BT /F1 7 Tf ${ink} rg 1 0 0 1 40 25 Tm (${escape(footer)}) Tj ET`);
    commands.push(`BT /F1 7 Tf ${ink} rg 1 0 0 1 310 25 Tm (Generated ${escape(r.generatedAt.slice(0,16).replace('T',' '))} UTC) Tj ET`);
    const content=commands.join('\n'),contentId=objects.length+2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });
  objects[1]=`<< /Type /Pages /Kids [${pages.map((_,i)=>`${5+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  let output='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
