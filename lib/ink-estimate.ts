export const SHEETS_PER_PAPER_PACK=20;
export function paperSheetCount(lines:{itemName:string;unit:string;quantity:number;category?:string}[]){
 return lines.reduce((n,l)=>n+((/paper|papel/i.test(l.itemName)||l.category==='Paper')&&!/magnetic|frame/i.test(l.itemName)?l.quantity*(/^packs?$/i.test(l.unit.trim())?20:/^(piece|pieces|pc|pcs|sheet|sheets)$/i.test(l.unit.trim())?1:0):0),0);
}
export function estimatePrintInk(sheets:number,mlPerSheet:number,referenceMl:number,tanks:{color:string;bottle_ml:string|number;bottle_price:string|number;level_percent:string|number|null}[]){
 if(!Number.isInteger(sheets)||sheets<0||sheets>1000000)throw Error('Enter a whole number of printed 4R sheets (0 to 1,000,000).');
 if(!Number.isFinite(mlPerSheet)||mlPerSheet<=0||mlPerSheet>10||!Number.isFinite(referenceMl)||referenceMl<=0)throw Error('Invalid ink estimation profile.');
 if(tanks.length!==6||new Set(tanks.map(t=>t.color)).size!==6)throw Error('Six ink tanks are required.');
 const totalMl=Number((sheets*mlPerSheet).toFixed(6));const perColor=totalMl/6;
 const colors=tanks.map(t=>{const size=Number(t.bottle_ml),price=Number(t.bottle_price);if(size<=0||price<0||!Number.isFinite(size)||!Number.isFinite(price))throw Error('Invalid ink bottle costing.');const before=t.level_percent===null?null:Number(t.level_percent);return {color:t.color,ml:perColor,bottleMl:size,bottlePrice:price,cost:perColor/size*price,beforePercent:before,afterPercent:before===null?null:Math.max(0,Number((before-perColor/referenceMl*100).toFixed(2))),lowEstimate:before!==null&&before<perColor/referenceMl*100};});
 return {sheets,totalMl,cost:Math.round(colors.reduce((n,c)=>n+c.cost,0)*100)/100,colors,mlPerSheet,referenceMl,unknownLevels:colors.filter(c=>c.beforePercent===null).length,lowEstimate:colors.some(c=>c.lowEstimate)};
}
