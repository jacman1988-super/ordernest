const currencies = new Set(['PLN','EUR','USD']);
const safeId = /^[A-Z0-9-]{1,36}$/;
export function moneyMinor(value, currency) {
  if (!currencies.has(currency) || typeof value !== 'string' || !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)) throw new Error('INVALID_AMOUNT');
  const [major, decimals=''] = value.split('.');
  const result = BigInt(major)*100n + BigInt(decimals.padEnd(2,'0'));
  if (result > 1000000000n) throw new Error('AMOUNT_LIMIT');
  return Number(result);
}
export function validateRecords(records) {
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
export function normalizeOrder(order, requestedId, {source='demo',checkedAt=new Date().toISOString()}={}) {
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
export function reconcile(records, snapshots, {now=Date.now(),maxAgeMs=10*60*1000}={}) {
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
export function createChecklist(report) {
  if (!report || !Array.isArray(report.rows)) throw new Error('INVALID_REPORT');
  return {kind:'draft',items:report.rows.filter(r=>r.category!=='matched').map(r=>({recordId:r.id,category:r.category,reason:r.reason,paypalOrderId:r.paypalOrderId})),paymentActionsTaken:false};
}
export function explainExceptions(report) {
  const counts=new Map();
  for(const r of report.rows.filter(r=>r.category!=='matched'))counts.set(r.reason,(counts.get(r.reason)||0)+1);
  return Array.from(counts,([reason,count])=>({reason,count}));
}
