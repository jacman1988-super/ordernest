(()=>{
"use strict";
const currencies = new Set(['PLN','EUR','USD']);
const safeId = /^[A-Z0-9-]{1,36}$/;
function moneyMinor(value, currency) {
  if (!currencies.has(currency) || typeof value !== 'string' || !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)) throw new Error('INVALID_AMOUNT');
  const [major, decimals=''] = value.split('.');
  const result = BigInt(major)*100n + BigInt(decimals.padEnd(2,'0'));
  if (result > 1000000000n) throw new Error('AMOUNT_LIMIT');
  return Number(result);
}
function validateRecords(records) {
  if (!Array.isArray(records) || !records.length || records.length > 20) throw new Error('INVALID_RECORDS');
  const ids=new Set();
  return records.map(r=>{
    if (!r || typeof r.id!=='string' || typeof r.paypalOrderId!=='string' || !safeId.test(r.id) || !/^[A-Z0-9]{1,36}$/.test(r.paypalOrderId) || ids.has(r.id)) throw new Error('INVALID_RECORD');
    ids.add(r.id);
    if (typeof r.label!=='string' || r.label.length>80) throw new Error('INVALID_LABEL');
    const expectedMinor=moneyMinor(r.expectedAmount,r.currency);
    if (!expectedMinor) throw new Error('ZERO_EXPECTED_AMOUNT');
    return {id:r.id,paypalOrderId:r.paypalOrderId,label:r.label,expectedAmount:r.expectedAmount,currency:r.currency,expectedMinor};
  });
}
// Return only payment facts. Customer names, email, addresses and provider links
// are deliberately not retained or passed to the optional model.
function normalizeOrder(order, requestedId, {source='demo',checkedAt=new Date().toISOString()}={}) {
  if (!['demo','sandbox'].includes(source) || !order || order.id !== requestedId || typeof order.status!=='string' || !Array.isArray(order.purchase_units)) throw new Error('INVALID_PROVIDER_ORDER');
  const captures=[],seen=new Set(); let hasRefund=false;
  if (order.purchase_units.length>10) throw new Error('ORDER_LIMIT');
  for (const unit of order.purchase_units) {
    const payments=unit?.payments ?? {};
    if (!Array.isArray(payments.captures??[]) || !Array.isArray(payments.refunds??[])) throw new Error('INVALID_PAYMENTS');
    if ((payments.refunds??[]).length) hasRefund=true;
    for (const capture of payments.captures??[]) {
      if (!capture || typeof capture.id!=='string' || !capture.id || capture.id.length>80 || seen.has(capture.id) || captures.length>=20 || typeof capture.status!=='string') throw new Error('INVALID_CAPTURE');
      seen.add(capture.id);
      const currency=capture.amount?.currency_code;
      const minor=moneyMinor(capture.amount?.value,currency);
      if (['REFUNDED','PARTIALLY_REFUNDED'].includes(capture.status)) hasRefund=true;
      captures.push({id:capture.id,status:capture.status,currency,minor});
    }
  }
  return {id:requestedId,status:order.status,captures,hasRefund,source,checkedAt};
}
function reconcile(records, snapshots, {now=Date.now(),maxAgeMs=10*60*1000}={}) {
  const validated=validateRecords(records);
  if (!snapshots || typeof snapshots!=='object' || !Number.isFinite(now)) throw new Error('INVALID_SNAPSHOTS');
  const counts=new Map();
  for (const r of validated) counts.set(r.paypalOrderId,(counts.get(r.paypalOrderId)||0)+1);
  const rows=validated.map(record=>{
    const snapshot=snapshots[record.paypalOrderId];
    const row={...record,category:'unknown',reason:'no_snapshot',paidMinor:0,source:snapshot?.source??'none',checkedAt:snapshot?.checkedAt??null};
    if (counts.get(record.paypalOrderId)>1) return {...row,category:'review',reason:'duplicate_order_reference'};
    if (!snapshot || snapshot.id!==record.paypalOrderId || !['demo','sandbox'].includes(snapshot.source)) return row;
    const age=now-Date.parse(snapshot.checkedAt);
    if (!Number.isFinite(age) || age < -30000 || age>maxAgeMs) return {...row,reason:'stale_snapshot'};
    if (!Array.isArray(snapshot.captures) || snapshot.captures.length>20 || typeof snapshot.hasRefund!=='boolean') return {...row,reason:'invalid_snapshot'};
    const captureIds=new Set();
    for (const c of snapshot.captures) {
      if (!c || captureIds.has(c.id) || typeof c.id!=='string' || typeof c.status!=='string' || !currencies.has(c.currency) || !Number.isSafeInteger(c.minor) || c.minor<0 || c.minor>1000000000) return {...row,reason:'invalid_snapshot'};
      captureIds.add(c.id);
      if (c.currency!==record.currency) return {...row,category:'review',reason:'currency_mismatch'};
      if (c.status==='COMPLETED') row.paidMinor+=c.minor;
    }
    if (snapshot.hasRefund || snapshot.captures.some(c=>['REFUNDED','PARTIALLY_REFUNDED'].includes(c.status))) return {...row,category:'review',reason:'refund_requires_review'};
    if (snapshot.captures.some(c=>c.status!=='COMPLETED')) return {...row,category:'review',reason:'capture_not_final'};
    if (row.paidMinor>0 && row.paidMinor!==record.expectedMinor) return {...row,category:'review',reason:'amount_mismatch'};
    if (snapshot.status==='COMPLETED' && row.paidMinor===record.expectedMinor) return {...row,category:'matched',reason:'capture_matches_record'};
    if (!row.paidMinor && ['CREATED','APPROVED','PAYER_ACTION_REQUIRED'].includes(snapshot.status)) return {...row,category:'waiting',reason:'not_captured'};
    if (snapshot.status==='COMPLETED' && !snapshot.captures.length) return {...row,category:'review',reason:'missing_capture_evidence'};
    return {...row,category:'review',reason:'order_state_requires_review'};
  });
  const summary={matched:0,waiting:0,review:0,unknown:0};
  for(const row of rows) summary[row.category]++;
  return {rows,summary,checkedAt:new Date(now).toISOString(),allLiveSandbox:rows.every(r=>r.source==='sandbox'),paymentActionsTaken:false};
}
function createChecklist(report) {
  if (!report || !Array.isArray(report.rows)) throw new Error('INVALID_REPORT');
  return {kind:'draft',items:report.rows.filter(r=>r.category!=='matched').map(r=>({recordId:r.id,category:r.category,reason:r.reason,paypalOrderId:r.paypalOrderId})),paymentActionsTaken:false};
}
function explainExceptions(report) {
  const counts=new Map();
  for(const r of report.rows.filter(r=>r.category!=='matched'))counts.set(r.reason,(counts.get(r.reason)||0)+1);
  return Array.from(counts,([reason,count])=>({reason,count}));
}

const demoRecords=[
  {id:'ON-101',label:'Notes w lnianej oprawie',paypalOrderId:'DEMOORDER101',expectedAmount:'129.00',currency:'PLN'},
  {id:'ON-102',label:'Zestaw kartek',paypalOrderId:'DEMOORDER102',expectedAmount:'49.90',currency:'PLN'},
  {id:'ON-103',label:'Ceramiczny kubek',paypalOrderId:'DEMOORDER103',expectedAmount:'89.00',currency:'PLN'},
  {id:'ON-104',label:'Torba na codzienność',paypalOrderId:'DEMOORDER104',expectedAmount:'75.00',currency:'PLN'},
  {id:'ON-105',label:'Zakładki do książek',paypalOrderId:'DEMOORDER105',expectedAmount:'35.00',currency:'PLN'},
  {id:'ON-106',label:'Planer na biurko',paypalOrderId:'DEMOORDER106',expectedAmount:'59.00',currency:'PLN'}
];
const order=(id,status,value,currency='PLN',captureStatus='COMPLETED')=>({id,status,purchase_units:[{payments:value===null?{}:{captures:[{id:`CAP${id}`,status:captureStatus,amount:{currency_code:currency,value}}]}}]});
function demoSnapshots(now=new Date().toISOString()) {
  return Object.fromEntries([
    order('DEMOORDER101','COMPLETED','129.00'),order('DEMOORDER102','APPROVED',null),
    order('DEMOORDER103','COMPLETED','60.00'),order('DEMOORDER104','COMPLETED','75.00','USD'),
    order('DEMOORDER105','COMPLETED','35.00','PLN','REFUNDED'),order('DEMOORDER106','COMPLETED',null)
  ].map(o=>[o.id,normalizeOrder(o,o.id,{source:'demo',checkedAt:now})]));
}

function confirmedCaptureMinor(row) {
  if(!row||row.category==='unknown'||!['capture_matches_record','amount_mismatch','not_captured','order_state_requires_review'].includes(row.reason))return null;
  return Number.isSafeInteger(row.paidMinor)&&row.paidMinor>=0?row.paidMinor:null;
}
function makeReviewExport(report,checklist,trace,mode,{now=Date.now()}={}) {
  if(!['demo','sandbox'].includes(mode)||!report||!Array.isArray(report.rows)||!report.rows.length||report.rows.length>20||report.paymentActionsTaken!==false)throw new Error('INVALID_EXPORT');
  const age=now-Date.parse(report.checkedAt);
  if(!Number.isFinite(age)||age< -30000||age>600000)throw new Error('STALE_EXPORT');
  if(report.rows.some(r=>mode==='sandbox'?r.source==='demo':r.source==='sandbox'))throw new Error('EXPORT_SOURCE_MISMATCH');
  return structuredClone({application:'OrderNest',sourceMode:mode,illustrativeData:mode==='demo',report,checklist,trace,scope:'read-only draft; does not authorize fulfilment',paymentActionsTaken:false});
}
function formatReviewText(content,{lang='pl',label=row=>row.label,reason=code=>code}={}) {
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

const reasons={
 pl:{capture_matches_record:'Zakończone płatności w tej samej walucie odpowiadają oczekiwanej kwocie.',not_captured:'Zamówienie istnieje, lecz nie ma zakończonej płatności. Sama akceptacja kupującego nie oznacza zapłaty.',amount_mismatch:'Kwota zakończonych płatności różni się od zapisu sklepu. Sprawdź źródła, zanim podejmiesz dalszą decyzję.',currency_mismatch:'Waluta płatności różni się od oczekiwanej. Aplikacja nie przelicza kursów ani nie sumuje różnych walut.',refund_requires_review:'Zapis wskazuje zwrot. Sprawdź szczegóły w Sandbox; ta aplikacja nie oblicza kwoty netto po zwrocie.',missing_capture_evidence:'Zamówienie ma status COMPLETED, lecz brak zapisu zakończonej płatności. Ten status nie wystarcza do potwierdzenia kwoty.',capture_not_final:'Co najmniej jedna płatność nie ma ostatecznego statusu COMPLETED.',duplicate_order_reference:'Dwa zapisy sklepu wskazują to samo zamówienie PayPal. Wyjaśnij duplikat.',stale_snapshot:'Odczyt jest nieaktualny albo ma nieprawidłową datę.',invalid_snapshot:'Odczyt ma nieprawidłową strukturę.',no_snapshot:'Brak potwierdzonego odczytu dla tego zamówienia.',order_state_requires_review:'Stan zamówienia wymaga ręcznego sprawdzenia.'},
 en:{capture_matches_record:'Completed captures in the same currency match the expected amount.',not_captured:'The order exists, but no completed capture is recorded. Buyer approval alone is not proof of payment.',amount_mismatch:'Completed captures differ from the shop record. Check the sources before deciding what to do.',currency_mismatch:'The payment currency differs from the expected one. This app does not convert exchange rates or add different currencies.',refund_requires_review:'The record indicates a refund. Check the details in Sandbox; this app does not calculate the net amount after refunds.',missing_capture_evidence:'The order is COMPLETED, but no completed capture is present. Order status alone does not confirm the amount.',capture_not_final:'At least one capture does not have a final COMPLETED status.',duplicate_order_reference:'Two shop records reference the same PayPal order. Resolve the duplicate.',stale_snapshot:'The read is stale or has an invalid timestamp.',invalid_snapshot:'The read has an invalid structure.',no_snapshot:'No confirmed read is available for this order.',order_state_requires_review:'The order state requires manual review.'}
};
const englishLabels={'ON-101':'Linen notebook','ON-102':'Greeting card set','ON-103':'Ceramic mug','ON-104':'Everyday tote bag','ON-105':'Bookmarks','ON-106':'Desk planner'};

const copy={
 pl:{eyebrow:'Trochę więcej porządku',title:'Zamówienia pod kontrolą. Spokojny koniec dnia.',intro:'Zobacz, które kwoty pasują do zapisów płatności, a które wymagają Twojej uwagi. Przygotuj listę spraw do wyjaśnienia.',modeLabel:'Źródło danych',demoMode:'Przykładowy sklep',sandboxMode:'PayPal Sandbox — odczyt',demoSource:'Dane przykładowe · PayPal niepołączony',sandboxSource:'PayPal Sandbox · dane testowe · tylko odczyt',sandboxPending:'Wybrano Sandbox · brak odczytu dla bieżących danych',offline:'Samodzielne demo. AI i połączenie PayPal wymagają lokalnego serwera.',noKeys:'Serwer działa. Klucze PayPal Sandbox nie są skonfigurowane.',configured:'Serwer działa. Sandbox można wybrać ręcznie.',noModel:'Lokalny model AI jest niedostępny.',review:'Przejrzyj zamówienia',ask:'Przygotuj z lokalnym AI',all:'Wszystkie',matched:'Kwoty zgodne',waiting:'Oczekują',reviewStatus:'Do wyjaśnienia',unknown:'Brak potwierdzenia',today:'Widok roboczy',orders:'Twoje zamówienia',reset:'Przywróć przykład',editHint:'Możesz zmienić oczekiwaną kwotę. Zapis płatności pozostaje osobnym źródłem.',empty:'Brak zamówień w tym widoku.',perspective:'Spokojna perspektywa',detailTitle:'Jedna sprawa naraz.',detailPrompt:'Wybierz zamówienie, aby zobaczyć powód i porównanie kwot.',draftTitle:'Lista do wyjaśnienia',draftHint:'To propozycja kolejnych kroków. Ty decydujesz, co zrobić dalej.',draft:'Przygotuj listę',export:'Pobierz raport JSON',footer:'Ten prototyp nie zmienia zamówień, nie pobiera płatności i nie wysyła wiadomości. Zgodność kwot nie oznacza zgody na wysyłkę towaru.',privacy:'Dane pozostają w pamięci tej strony i nie są zapisywane. Lokalny model otrzymuje tylko zbiorcze liczby. Dane testowe PayPal wymagają kluczy przechowywanych na serwerze.',importTitle:'Wczytaj własne zapisy zamówień',importHint:'Wklej tablicę JSON: maksymalnie 20 zapisów, waluty PLN/EUR/USD. Pola: id, label, paypalOrderId, expectedAmount, currency. Nie dodawaj danych klientów. Prawdziwe identyfikatory pochodzą z Twojego Sandbox.',recordsJson:'Zapisy JSON',importButton:'Wczytaj zapisy',expected:'Oczekiwano',captured:'Zakończone płatności',orderId:'ID PayPal',recordId:'Zapis sklepu',checked:'Sprawdzono',notChecked:'Nie sprawdzono',stale:'Zapisy się zmieniły. Przejrzyj zamówienia ponownie.',busy:'Sprawdzam dane…',aiBusy:'Lokalny model wybiera narzędzia. Kwoty oblicza aplikacja…',done:'Przegląd gotowy. Żadne płatności nie zostały wykonane.',aiDone:'Lokalny AI przygotował listę przy pomocy narzędzi aplikacji.',invalid:'Sprawdź kwoty i format zapisów. Nic nie zostało wysłane.',failure:'Nie udało się potwierdzić danych. Wynik został wyczyszczony; dane przykładowe nie zastąpiły odpowiedzi PayPal.',imported:'Zapisy wczytane. Wybierz źródło i uruchom przegląd.',draftDone:'Lista robocza jest gotowa.',noExceptions:'Brak spraw do wyjaśnienia w bieżącym raporcie.',trace:'Użyte narzędzia',freshness:'Raport stracił aktualność. Uruchom przegląd ponownie.',sandboxNeedsServer:'Sandbox wymaga skonfigurowanego serwera i własnych identyfikatorów.',reconcile_orders:'Porównanie zapisów',explain_exceptions:'Podsumowanie wyjątków',draft_checklist:'Lista robocza'},
 en:{eyebrow:'A little more order',title:'Orders in hand. A calmer end to the day.',intro:'See which amounts match payment records and which need your attention. Prepare a list of things to clarify.',modeLabel:'Data source',demoMode:'Illustrative shop',sandboxMode:'PayPal Sandbox — read only',demoSource:'Illustrative data · PayPal not connected',sandboxSource:'PayPal Sandbox · test data · read only',sandboxPending:'Sandbox selected · no read for the current records',offline:'Standalone demo. AI and PayPal require the local server.',noKeys:'Server ready. PayPal Sandbox credentials are not configured.',configured:'Server ready. Sandbox can be selected manually.',noModel:'The local AI model is unavailable.',review:'Review orders',ask:'Prepare with local AI',all:'All orders',matched:'Amounts match',waiting:'Waiting',reviewStatus:'Needs review',unknown:'Unconfirmed',today:'Working view',orders:'Your orders',reset:'Reset example',editHint:'Edit an expected amount. The payment record remains a separate source.',empty:'No orders in this view.',perspective:'A calmer perspective',detailTitle:'One thing at a time.',detailPrompt:'Select an order to see its reason and amount comparison.',draftTitle:'Things to clarify',draftHint:'A draft of next steps. You decide what to do next.',draft:'Prepare checklist',export:'Download JSON report',footer:'This prototype does not change orders, capture payments or send messages. Matching amounts do not authorize fulfilment.',privacy:'Inputs stay in page memory and are not saved. The local model receives aggregate counts only. PayPal test data needs server-side credentials.',importTitle:'Import your order records',importHint:'Paste a JSON array: up to 20 records, PLN/EUR/USD. Fields: id, label, paypalOrderId, expectedAmount, currency. Do not include customer data. Real order IDs come from your own Sandbox.',recordsJson:'Records JSON',importButton:'Load records',expected:'Expected',captured:'Completed captures',orderId:'PayPal ID',recordId:'Shop record',checked:'Checked',notChecked:'Not checked',stale:'Records changed. Review orders again.',busy:'Checking records…',aiBusy:'The local model is choosing tools. The application calculates amounts…',done:'Review ready. No payments were performed.',aiDone:'Local AI prepared a checklist using application tools.',invalid:'Check the amounts and record format. Nothing was sent.',failure:'Could not confirm the data. The result was cleared; illustrative data did not replace a PayPal response.',imported:'Records loaded. Choose a source and review.',draftDone:'Draft checklist ready.',noExceptions:'No exceptions in the current report.',trace:'Tools used',freshness:'This report is no longer fresh. Review again.',sandboxNeedsServer:'Sandbox requires a configured server and your own order IDs.',reconcile_orders:'Compare records',explain_exceptions:'Summarize exceptions',draft_checklist:'Draft checklist'}
};
Object.assign(copy.pl,{manualHint:'Dodaj nazwę produktu, identyfikator zamówienia z PayPal Sandbox i oczekiwaną kwotę. Nie podawaj danych klientów.',itemLabel:'Nazwa produktu',currencyLabel:'Waluta',addRecord:'Dodaj zamówienie',clearRecords:'Zacznij od pustej listy',advanced:'Import zaawansowany',recordAdded:'Zamówienie dodane. Uruchom przegląd, aby potwierdzić jego dane.',listCleared:'Lista jest pusta. Dodaj własne zamówienie.'});
Object.assign(copy.en,{manualHint:'Add an item name, the order ID from your PayPal Sandbox and the expected amount. Do not include customer information.',itemLabel:'Item name',currencyLabel:'Currency',addRecord:'Add order',clearRecords:'Start with an empty list',advanced:'Advanced import',recordAdded:'Order added. Run a review to confirm its data.',listCleared:'The list is empty. Add your own order.'});
Object.assign(copy.pl,{exportText:'Pobierz czytelny raport',amountUnconfirmed:'Kwota niepotwierdzona',privacy:'Zapisy nie są zapisywane automatycznie. Możesz pobrać raport na swój komputer. Lokalny model otrzymuje tylko zbiorcze liczby. Dostęp Sandbox wymaga kluczy przechowywanych na serwerze.'});
Object.assign(copy.en,{exportText:'Download readable report',amountUnconfirmed:'Amount unconfirmed',privacy:'Records are not saved automatically. Download a report to keep a copy. The local model receives aggregate counts only. Sandbox access uses server-side credentials.'});
const $=id=>document.getElementById(id);
let lang='pl',records=structuredClone(demoRecords),report=null,checklist=null,trace=[],filter='all',selected='ON-103',busy=false,controller=null,revision=0,expiry=null;
const server=location.protocol==='http:'&&location.hostname==='127.0.0.1'&&location.port==='8802';
let status={sandboxConfigured:false,localModelReady:false};
let exportUrls=[];
let serverDownloads=null;
const t=key=>copy[lang][key]??key;
const label=r=>lang==='en'&&r.paypalOrderId.startsWith('DEMOORDER')?englishLabels[r.id]??r.label:r.label;
const categoryText=c=>t(c==='review'?'reviewStatus':c);
const money=(minor,currency)=>`${(minor/100).toFixed(2)} ${currency}`;
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function notice(key){$('notice').textContent=t(key);$('notice').dataset.key=key;}
function invalidate(key='stale'){revision++;controller?.abort();controller=null;clearTimeout(expiry);report=null;checklist=null;trace=[];serverDownloads=null;busy=false;renderSummary();renderDetail();for(const badge of document.querySelectorAll('.badge')){badge.className='badge unknown';badge.textContent=t('notChecked');}notice(key);updateControls();}
function updateControls(){
 $('review').disabled=busy||!records.length;$('ask').disabled=busy||!records.length||!server||!status.localModelReady;$('mode').disabled=busy;$('import').disabled=busy;$('add-record').disabled=busy||records.length>=20;$('clear-records').disabled=busy;
 $('draft').disabled=busy||!report;refreshExports();
 $('source').textContent=$('mode').value==='demo'?t('demoSource'):t(report?'sandboxSource':'sandboxPending');
 $('connection').textContent=server?`${t(status.sandboxConfigured?'configured':'noKeys')}${status.localModelReady?'':' '+t('noModel')}`:t('offline');
}
function refreshExports(){
 for(const url of exportUrls)URL.revokeObjectURL(url);exportUrls=[];
 for(const id of ['export','export-text']){const link=$(id);link.removeAttribute('href');link.removeAttribute('download');link.setAttribute('aria-disabled','true');link.setAttribute('tabindex','-1');}
 if(busy||!report)return;
 let content;try{content=makeReviewExport(report,checklist??createChecklist(report),trace,$('mode').value);}catch{return;}
 const suffix=content.illustrativeData?'DEMO':'SANDBOX';
 for(const [id,value,type,extension] of [['export',JSON.stringify(content,null,2),'application/json','json'],['export-text',formatReviewText(content,{lang,label,reason:code=>reasons[lang][code]}),'text/plain;charset=utf-8','txt']]){
  const path=serverDownloads?.[lang]?.[extension==='json'?'json':'text'];let url;
  if(server&&typeof path==='string'&&new RegExp(`^/download/[a-f0-9]{48}/${lang}\\.${extension}$`).test(path))url=path;
  else{url=URL.createObjectURL(new Blob([value],{type}));exportUrls.push(url);}
  const link=$(id);link.href=url;link.download=`OrderNest-review-${suffix}.${extension}`;link.setAttribute('aria-disabled','false');link.removeAttribute('tabindex');
 }
}
function renderSummary(){for(const c of ['matched','waiting','review','unknown'])$(`count-${c}`).textContent=report?report.summary[c]:'—';$('count-all').textContent=records.length;for(const b of document.querySelectorAll('[data-filter]')){b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));}}
function renderRows(){
 const container=$('rows');container.replaceChildren();let visible=0;
 for(const r of records){const result=report?.rows.find(x=>x.id===r.id);if(filter!=='all'&&result?.category!==filter)continue;visible++;
  const el=node('article',undefined,'order'+(selected===r.id?' selected':'')),left=node('div'),right=node('div');
  const button=node('button',label(r),'row-title');button.type='button';button.addEventListener('click',()=>{selected=r.id;renderRows();renderDetail();});left.append(button,node('p',r.id,'id'),node('span',result?categoryText(result.category):t('notChecked'),'badge '+(result?.category??'unknown')));
  const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.className='amount';input.value=r.expectedAmount;input.maxLength=12;input.id=`amount-${r.id}`;
  const caption=node('label',t('expected'),'amount-label');caption.htmlFor=input.id;right.append(caption,input,node('span',r.currency,'currency'));
  input.addEventListener('input',()=>{r.expectedAmount=input.value.trim().replace(',','.');invalidate();});el.append(left,right);container.append(el);
 }$('empty').hidden=visible>0;
}
function renderDetail(){
 const r=records.find(x=>x.id===selected),result=report?.rows.find(x=>x.id===selected);$('detail-title').textContent=r?label(r):t('detailTitle');$('detail-text').textContent=result?reasons[lang][result.reason]:t('detailPrompt');$('facts').replaceChildren();
 if(r){const captured=confirmedCaptureMinor(result);for(const [key,value] of [['recordId',r.id],['orderId',r.paypalOrderId],['expected',r.expectedAmount+' '+r.currency],['captured',captured!==null?money(captured,r.currency):t('amountUnconfirmed')],['checked',result?.checkedAt?new Date(result.checkedAt).toLocaleTimeString(lang==='pl'?'pl-PL':'en-GB',{hour:'2-digit',minute:'2-digit'}):t('notChecked')]])$('facts').append(node('dt',t(key)),node('dd',value));}
 $('checklist').replaceChildren();if(checklist){if(!checklist.items.length)$('checklist').append(node('li',t('noExceptions')));for(const item of checklist.items)$('checklist').append(node('li',`${item.recordId} · ${reasons[lang][item.reason]}`));}
 $('trace').textContent=trace.length?t('trace')+': '+trace.map(x=>t(x.tool)).join(' → '):'';
}
function render(){document.documentElement.lang=lang;document.title=lang==='pl'?'OrderNest — spokojne zamówienia':'OrderNest — a calmer order review';for(const el of document.querySelectorAll('[data-t]'))el.textContent=t(el.dataset.t);$('language').textContent=lang==='pl'?'English':'Polski';renderSummary();renderRows();renderDetail();updateControls();if($('notice').dataset.key)notice($('notice').dataset.key);}
function fresh(){if(!report)return false;if(Date.now()-Date.parse(report.checkedAt)>600000){invalidate('freshness');renderRows();return false;}return true;}
async function review(useAI=false){
 let input;try{input=validateRecords(records);}catch{invalidate('invalid');renderRows();return;}
 const mode=$('mode').value;if(mode==='sandbox'&&!server){notice('sandboxNeedsServer');return;}
 invalidate(useAI?'aiBusy':'busy');busy=true;updateControls();const current=revision;controller=new AbortController();
 try {
  let result;if(server){const res=await fetch(useAI?'/api/assistant':'/api/reconcile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,records:input}),signal:controller.signal});if(!res.ok)throw new Error('API_FAILURE');result=await res.json();}else{result={report:reconcile(input,demoSnapshots()),checklist:null,trace:[],mode:'demo'};}
  if(current!==revision)return;report=result.report;checklist=result.checklist;trace=result.trace??[];serverDownloads=result.downloads??null;notice(useAI?'aiDone':'done');expiry=setTimeout(()=>{invalidate('freshness');renderRows();},600001);render();
 } catch(error){if(current!==revision||error.name==='AbortError')return;invalidate('failure');render();}
 finally{if(current===revision){busy=false;controller=null;updateControls();}}
}
$('language').addEventListener('click',()=>{lang=lang==='pl'?'en':'pl';render();});
$('review').addEventListener('click',()=>review());$('ask').addEventListener('click',()=>review(true));
$('mode').addEventListener('change',()=>{filter='all';invalidate();render();});
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{filter=button.dataset.filter;renderSummary();renderRows();});
$('reset').addEventListener('click',()=>{records=structuredClone(demoRecords);selected='ON-103';filter='all';$('mode').value='demo';$('record-json').value='';invalidate();review();});
$('add-record').addEventListener('click',()=>{try{let number=1;while(records.some(r=>r.id===`SHOP-${number}`))number++;const next={id:`SHOP-${number}`,label:$('new-label').value.trim(),paypalOrderId:$('new-paypal').value.trim().toUpperCase(),expectedAmount:$('new-amount').value.trim().replace(',','.'),currency:$('new-currency').value||'PLN'};if(!next.label)throw new Error('LABEL');records=validateRecords([...records,next]);selected=next.id;filter='all';invalidate('recordAdded');for(const field of ['new-label','new-paypal','new-amount'])$(field).value='';render();}catch{notice('invalid');}});
$('clear-records').addEventListener('click',()=>{records=[];selected=null;filter='all';invalidate('listCleared');render();});
$('import').addEventListener('click',()=>{try{if($('record-json').value.length>16384)throw new Error('LIMIT');records=validateRecords(JSON.parse($('record-json').value));selected=records[0].id;filter='all';invalidate('imported');render();}catch{notice('invalid');}});
$('draft').addEventListener('click',()=>{if(!fresh())return;checklist=createChecklist(report);notice('draftDone');renderDetail();refreshExports();});
for(const id of ['export','export-text'])$(id).addEventListener('click',event=>{if(busy||!fresh())event.preventDefault();});
render();review();
if(server)fetch('/api/status').then(r=>{if(!r.ok)throw new Error('STATUS');return r.json();}).then(result=>{status=result;$('mode').querySelector('option[value="sandbox"]').disabled=!status.sandboxConfigured;updateControls();}).catch(()=>{status={sandboxConfigured:false,localModelReady:false};updateControls();});

})();
