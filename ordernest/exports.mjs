export function confirmedCaptureMinor(row) {
  if(!row||row.category==='unknown'||!['capture_matches_record','amount_mismatch','not_captured','order_state_requires_review'].includes(row.reason))return null;
  return Number.isSafeInteger(row.paidMinor)&&row.paidMinor>=0?row.paidMinor:null;
}
export function makeReviewExport(report,checklist,trace,mode,{now=Date.now()}={}) {
  if(!['demo','sandbox'].includes(mode)||!report||!Array.isArray(report.rows)||!report.rows.length||report.rows.length>20||report.paymentActionsTaken!==false)throw new Error('INVALID_EXPORT');
  const age=now-Date.parse(report.checkedAt);
  if(!Number.isFinite(age)||age< -30000||age>600000)throw new Error('STALE_EXPORT');
  if(report.rows.some(r=>mode==='sandbox'?r.source==='demo':r.source==='sandbox'))throw new Error('EXPORT_SOURCE_MISMATCH');
  return structuredClone({application:'OrderNest',sourceMode:mode,illustrativeData:mode==='demo',report,checklist,trace,scope:'read-only draft; does not authorize fulfilment',paymentActionsTaken:false});
}
export function formatReviewText(content,{lang='pl',label=row=>row.label,reason=code=>code}={}) {
  const pl=lang==='pl';
  const wording=pl?{title:'OrderNest — przegląd zamówień',demo:'DANE PRZYKŁADOWE. Brak odczytu PayPal.',sandbox:'PAYPAL SANDBOX — wyłącznie dane testowe.',date:'Czas sprawdzenia',summary:'Podsumowanie',matched:'kwoty zgodne',waiting:'oczekujące',review:'do wyjaśnienia',unknown:'niepotwierdzone',expected:'Oczekiwano',captured:'Zakończone płatności',unconfirmed:'Niepotwierdzona kwota',draft:'Lista robocza do wyjaśnienia',noItems:'Brak spraw do wyjaśnienia.',noDraft:'Lista nie została jeszcze przygotowana.',footer:'Raport nie jest zgodą na wysyłkę towaru. Nie wykonano płatności, zwrotów ani wysyłki wiadomości.'}:
  {title:'OrderNest — order review',demo:'ILLUSTRATIVE DATA. No PayPal read performed.',sandbox:'PAYPAL SANDBOX — test data only.',date:'Checked at',summary:'Summary',matched:'amounts match',waiting:'waiting',review:'needs review',unknown:'unconfirmed',expected:'Expected',captured:'Completed captures',unconfirmed:'Amount unconfirmed',draft:'Draft review checklist',noItems:'No exceptions.',noDraft:'A checklist has not been prepared yet.',footer:'This report does not authorize fulfilment. No payments, refunds or messages were performed.'};
  const clean=value=>String(value??'').replace(/[\r\n\u0000-\u001f\u007f]/g,' ');
  const sum=content.report.summary;
  const lines=[wording.title,content.illustrativeData?wording.demo:wording.sandbox,`${wording.date}: ${content.report.checkedAt}`,'',wording.summary,`${sum.matched} ${wording.matched} · ${sum.waiting} ${wording.waiting} · ${sum.review} ${wording.review} · ${sum.unknown} ${wording.unknown}`,''];
  for(const row of content.report.rows){const captured=confirmedCaptureMinor(row);lines.push(`${clean(row.id)} — ${clean(label(row))}`,`${wording.expected}: ${clean(row.expectedAmount)} ${clean(row.currency)}`,`${wording.captured}: ${captured===null?wording.unconfirmed:(captured/100).toFixed(2)+' '+row.currency}`,clean(reason(row.reason)),'');}
  lines.push(wording.draft);
  if(!content.checklist)lines.push(wording.noDraft);
  else if(!content.checklist.items.length)lines.push(wording.noItems);
  else for(const item of content.checklist.items)lines.push(`• ${clean(item.recordId)} — ${clean(reason(item.reason))}`);
  lines.push('',wording.footer);return lines.join('\n')+'\n';
}
