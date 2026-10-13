import {normalizeOrder} from './core.mjs';
export const demoRecords=[
  {id:'ON-101',label:'Notes w lnianej oprawie',paypalOrderId:'DEMOORDER101',expectedAmount:'129.00',currency:'PLN'},
  {id:'ON-102',label:'Zestaw kartek',paypalOrderId:'DEMOORDER102',expectedAmount:'49.90',currency:'PLN'},
  {id:'ON-103',label:'Ceramiczny kubek',paypalOrderId:'DEMOORDER103',expectedAmount:'89.00',currency:'PLN'},
  {id:'ON-104',label:'Torba na codzienność',paypalOrderId:'DEMOORDER104',expectedAmount:'75.00',currency:'PLN'},
  {id:'ON-105',label:'Zakładki do książek',paypalOrderId:'DEMOORDER105',expectedAmount:'35.00',currency:'PLN'},
  {id:'ON-106',label:'Planer na biurko',paypalOrderId:'DEMOORDER106',expectedAmount:'59.00',currency:'PLN'}
];
const order=(id,status,value,currency='PLN',captureStatus='COMPLETED')=>({id,status,purchase_units:[{payments:value===null?{}:{captures:[{id:`CAP${id}`,status:captureStatus,amount:{currency_code:currency,value}}]}}]});
export function demoSnapshots(now=new Date().toISOString()) {
  return Object.fromEntries([
    order('DEMOORDER101','COMPLETED','129.00'),order('DEMOORDER102','APPROVED',null),
    order('DEMOORDER103','COMPLETED','60.00'),order('DEMOORDER104','COMPLETED','75.00','USD'),
    order('DEMOORDER105','COMPLETED','35.00','PLN','REFUNDED'),order('DEMOORDER106','COMPLETED',null)
  ].map(o=>[o.id,normalizeOrder(o,o.id,{source:'demo',checkedAt:now})]));
}
