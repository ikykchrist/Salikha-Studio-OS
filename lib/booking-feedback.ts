'use client';
import {getLocalDatabase} from './local-database';
import {showToast} from './toasts';
export async function notifyBookingSync(id:string,sync?:{queued:boolean;requestedAt:string;scheduleTba?:boolean}){
 if(!sync?.queued)return;
 try{
  for(let attempt=0;attempt<8;attempt++){
   await new Promise(resolve=>setTimeout(resolve,1500));
   const result=await getLocalDatabase().from('calendar_events').select('sync_status, last_synced_at, updated_at').eq('booking_id',id).maybeSingle();
   const row=result.data;
   if(result.error)break;
   if(!row||new Date(row.updated_at).getTime()<new Date(sync.requestedAt).getTime())continue;
   if(row.sync_status==='SYNCED'){showToast('Booking synced to Google Calendar.');return;}
   if(row.sync_status==='REMOVED'){showToast(sync.scheduleTba?'Schedule TBA. No Google Calendar event until date and both times are set.':'Booking removed from Google Calendar.');return;}
   if(row.sync_status==='FAILED'){showToast('Booking saved. Calendar sync failed; retry from Calendar.','warning');return;}
  }
  showToast('Booking saved. Calendar sync is not confirmed yet; check Calendar sync status.','warning');
 }catch{showToast('Booking saved. Calendar sync could not be confirmed.','warning');}
}
