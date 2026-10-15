import test from 'node:test';import assert from 'node:assert/strict';
import {setupFailure} from './setup-errors.mjs';
test('setup distinguishes a stopped local server, blocked sockets and timeout',()=>{
 assert.equal(setupFailure(new TypeError('fetch failed',{cause:{code:'ECONNREFUSED'}})).code,'ORDERNEST_LOCAL_SERVER_UNAVAILABLE');
 assert.equal(setupFailure({cause:{errors:[{code:'EACCES'}]}}).code,'ORDERNEST_LOCAL_NETWORK_BLOCKED');
 assert.equal(setupFailure({name:'TimeoutError'}).code,'ORDERNEST_CONNECTION_TIMEOUT');
});
test('setup diagnostics preserve safe provider codes but never raw credentials or response text',()=>{
 assert.equal(setupFailure(new Error('PAYPAL_HTTP_401')).code,'PAYPAL_HTTP_401');
 const result=setupFailure(new Error('private-client-secret provider response'));
 assert.ok(!JSON.stringify(result).includes('private-client-secret'));
 assert.match(setupFailure(new Error('ORDERNEST_SANDBOX_NOT_RUNNING')).message,/Uruchom-Test-Sandbox/);
});
