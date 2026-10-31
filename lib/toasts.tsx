'use client';
import {useEffect,useState} from 'react';
import {CircleCheck,AlertCircle,X} from 'lucide-react';
type Toast={id:number;message:string;tone:'success'|'warning'};
export function showToast(message:string,tone:Toast['tone']='success'){
 window.dispatchEvent(new CustomEvent('salikha-toast',{detail:{id:Date.now()+Math.random(),message,tone}}));
}
export function ToastHost(){
 const [toasts,setToasts]=useState<Toast[]>([]);
 useEffect(()=>{const timers=new Set<ReturnType<typeof setTimeout>>();const receive=(event:Event)=>{const toast=(event as CustomEvent<Toast>).detail;setToasts(current=>[...current.slice(-3),toast]);const timer=setTimeout(()=>{setToasts(current=>current.filter(t=>t.id!==toast.id));timers.delete(timer);},7000);timers.add(timer);};window.addEventListener('salikha-toast',receive);return()=>{window.removeEventListener('salikha-toast',receive);timers.forEach(clearTimeout);};},[]);
 return <div className="success-toast-stack" aria-live="polite" aria-atomic="false">{toasts.map(t=><div key={t.id} className="success-toast" data-tone={t.tone} role="status">{t.tone==='success'?<CircleCheck aria-hidden="true"/>:<AlertCircle aria-hidden="true"/>}<span>{t.message}</span><button aria-label="Dismiss notification" onClick={()=>setToasts(current=>current.filter(item=>item.id!==t.id))}><X aria-hidden="true"/></button></div>)}</div>;
}
