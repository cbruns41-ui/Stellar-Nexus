'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

test('mission timeout never retries a possibly committed POST and reports an unconfirmed outcome',async t=>{
  const {api}=await import('../public/js/api.js');let calls=0;
  t.mock.method(globalThis,'fetch',(_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));});
  await assert.rejects(api('/raids/1/defend',{method:'POST',body:{},timeoutMs:10}),error=>error.timeout===true&&/bereits ausgeführt/.test(error.message));
  assert.equal(calls,1);
});

test('a stalled response body cannot turn an aborted mission into an empty successful snapshot',async t=>{
  const {api}=await import('../public/js/api.js');
  t.mock.method(globalThis,'fetch',async(_url,{signal})=>({ok:true,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))}));
  await assert.rejects(api('/raids/1/defend',{method:'POST',body:{},timeoutMs:10}),error=>error.timeout===true);
});
