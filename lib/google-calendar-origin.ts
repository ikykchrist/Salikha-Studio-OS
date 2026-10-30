export function calendarOrigin(){
 const raw=process.env.APP_ORIGIN||'http://localhost:3000';const url=new URL(raw);
 if(url.origin!==raw||url.username||url.password)throw Error('APP_ORIGIN must be an origin without a path.');
 const local=['localhost','127.0.0.1'].includes(url.hostname);
 if(!local&&url.protocol!=='https:')throw Error('Hosted Google Calendar requires HTTPS.');
 if(process.env.NODE_ENV!=='production'&&!local)throw Error('Development OAuth must use localhost.');
 return url.origin;
}
export function calendarRedirectUri(){const expected=calendarOrigin()+'/api/google-calendar/callback';if(process.env.GOOGLE_CALENDAR_REDIRECT_URI!==expected)throw Error('GOOGLE_CALENDAR_REDIRECT_URI must match APP_ORIGIN + /api/google-calendar/callback.');return expected;}
