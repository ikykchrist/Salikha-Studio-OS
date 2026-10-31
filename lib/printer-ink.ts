export const inkColors=[{code:'BK',name:'Black',hex:'#252934'},{code:'C',name:'Cyan',hex:'#009fda'},{code:'M',name:'Magenta',hex:'#d62e91'},{code:'Y',name:'Yellow',hex:'#edc526'},{code:'LC',name:'Light Cyan',hex:'#79d8ef'},{code:'LM',name:'Light Magenta',hex:'#ef9bce'}] as const;
export function validateInkUpdate(b:Record<string,unknown>){
 if(![1,2].includes(Number(b.printerNo))||!inkColors.some(c=>c.code===b.color)||!['LEVEL','REFILL'].includes(String(b.action)))throw Error('Choose a printer, ink color and action.');
 const numeric=(v:unknown,places:number)=>['number','string'].includes(typeof v)&&new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(String(v));
 const level=Number(b.level);if(!numeric(b.level,2)||!Number.isFinite(level)||level<0||level>100)throw Error('Enter a checked level from 0 to 100%.');
 const notes=String(b.notes||'').trim();if(notes.length<3||notes.length>1000)throw Error('Enter a short note (3 to 1,000 characters).');
 const addedMl=b.action==='REFILL'?Number(b.addedMl):null;if(addedMl!==null&&(!Number.isFinite(addedMl)||addedMl<=0||addedMl>10000||!/^\d+(\.\d{1,3})?$/.test(String(b.addedMl))))throw Error('Enter the actual refill volume in mL, with up to 3 decimal places.');
 const bottleMl=Number(b.bottleMl),bottlePrice=Number(b.bottlePrice);if(!numeric(b.bottleMl,3)||!numeric(b.bottlePrice,2)||!Number.isFinite(bottleMl)||bottleMl<=0||bottleMl>10000||!Number.isFinite(bottlePrice)||bottlePrice<0||bottlePrice>1000000||b.bottlePrice===''||b.bottleMl==='')throw Error('Enter a valid bottle size and price.');
 return {printerNo:Number(b.printerNo),color:String(b.color),action:String(b.action),level:Math.round(level*100)/100,notes,addedMl,bottleMl:Math.round(bottleMl*1000)/1000,bottlePrice:Math.round(bottlePrice*100)/100};
}
export function refillValue(ml:number,bottleMl:number,bottlePrice:number){return Math.round(ml/bottleMl*bottlePrice*100)/100;}
