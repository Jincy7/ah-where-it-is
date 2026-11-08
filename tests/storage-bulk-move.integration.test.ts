import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { StorageAction } from '../src/lib/storage/types';

test('bulk moves require a complete unchanged source snapshot and commit once atomically', { skip: process.env.RUN_STORAGE_INTEGRATION !== '1', timeout: 90_000 }, async () => {
  loadEnvFile('.env.local');
  const url=process.env.SUPABASE_URL!;
  const app=process.env.TEST_APP_URL??'http://localhost:4201';
  for(const endpoint of [url,app]) assert.ok(['localhost','127.0.0.1'].includes(new URL(endpoint).hostname),'Local fixtures only');
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const users:string[]=[];
  async function account() {
    const email=`bulk-move-${randomUUID()}@example.com`,password=randomUUID();
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);
    const id=created.data.user!.id;users.push(id);
    const cookies:{name:string;value:string}[]=[];
    const client=createServerClient(url,process.env.SUPABASE_ANON_KEY!,{cookies:{getAll:()=>cookies,setAll:values=>{for(const value of values){const i=cookies.findIndex(c=>c.name===value.name);if(i<0)cookies.push(value);else cookies[i]=value;}}}});
    assert.ifError((await client.auth.signInWithPassword({email,password})).error);
    const cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');
    const post=(path:string,body:unknown)=>fetch(app+path,{method:'POST',headers:{cookie,origin:app,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
    async function box(name:string) {const result=await client.from('containers').insert({user_id:id,name}).select().single();assert.ifError(result.error);return result.data;}
    async function seed(containerId:string,count:number) {
      for(let offset=0;offset<count;offset+=500){const inserted=await client.from('items').insert(Array.from({length:Math.min(500,count-offset)},(_,i)=>({container_id:containerId,name:`물품 ${offset+i+1}`,quantity:(offset+i)%3+1})));assert.ifError(inserted.error);}
    }
    const requestPrepare=(source:string,target:string,extra:Record<string,unknown>={})=>post('/api/storage/actions',{type:'move_items',payload:{source_container_id:source,container_id:target},...extra});
    async function prepare(source:string,target:string,extra:Record<string,unknown>={}):Promise<StorageAction>{const response=await requestPrepare(source,target,extra);const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data.action;}
    const confirm=(action:StorageAction)=>post(`/api/storage/actions/${action.action_id}/confirm`,{revision:action.revision,payload_hash:action.payload_hash,idempotency_key:action.idempotency_key});
    async function count(containerId:string){const result=await client.from('items').select('id',{count:'exact',head:true}).eq('container_id',containerId);assert.ifError(result.error);return result.count;}
    return{id,client,post,box,seed,prepare,requestPrepare,confirm,count};
  }
  try {
    const a=await account(),b=await account();
    const source=await a.box('출발 공구함'),target=await a.box('도착 책상'),foreign=await b.box('다른 계정');
    await a.seed(source.id,3);await a.seed(target.id,1);
    assert.equal((await a.requestPrepare(source.id,source.id)).status,400);
    assert.equal((await a.requestPrepare(source.id,foreign.id)).status,404);
    assert.equal((await b.requestPrepare(source.id,foreign.id)).status,404);
    const action=await a.prepare(source.id,target.id);
    assert.equal(action.preview.affected_items.length,3);
    assert.equal(Object.keys(action.expected_versions).filter(k=>k.startsWith('items:')).length,3);
    assert.ok(action.expected_versions[`contents:${source.id}`]);
    assert.ok(action.expected_versions[`containers:${source.id}`]);assert.ok(action.expected_versions[`containers:${target.id}`]);
    assert.equal(await a.count(source.id),3,'preparing must not move records');
    const mediaId=randomUUID();
    assert.ifError((await admin.from('media_assets').insert({id:mediaId,user_id:a.id,path:`${a.id}/${mediaId}.jpg`,status:'attached'})).error);
    assert.ifError((await admin.from('item_media').insert({item_id:action.preview.affected_items[0].id,media_id:mediaId})).error);
    assert.equal((await b.confirm(action)).status,404);
    const responses=await Promise.all([a.confirm(action),a.confirm(action),a.confirm(action)]);
    const receipts=await Promise.all(responses.map(async response=>{const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data.receipt;}));
    assert.equal(receipts[0].result.length,3);
    assert.deepEqual(receipts[1],receipts[0]);assert.deepEqual(receipts[2],receipts[0]);
    assert.equal(await a.count(source.id),0);assert.equal(await a.count(target.id),4);
    assert.deepEqual(receipts[0].result.map((item:{quantity:number})=>item.quantity).sort(),[1,2,3]);
    assert.equal((await a.client.from('item_media').select('item_id').eq('media_id',mediaId)).data?.length,1,'photo links stay attached to moved IDs');
    assert.equal((await a.requestPrepare(source.id,target.id)).status,422,'empty source cannot produce a move approval');

    await a.seed(source.id,2);
    const staleItem=await a.prepare(source.id,target.id);
    assert.ifError((await a.client.from('items').update({quantity:4}).eq('id',staleItem.preview.affected_items[0].id)).error);
    assert.equal((await a.confirm(staleItem)).status,409);assert.equal(await a.count(source.id),2);assert.equal(await a.count(target.id),4);
    const staleContents=await a.prepare(source.id,target.id);
    await a.seed(source.id,1);
    assert.equal((await a.confirm(staleContents)).status,409,'newly inserted records were not approved');assert.equal(await a.count(source.id),3);assert.equal(await a.count(target.id),4);
    const staleMembership=await a.prepare(source.id,target.id);
    assert.ifError((await a.client.from('items').update({container_id:target.id}).eq('id',staleMembership.preview.affected_items[0].id)).error);
    assert.equal((await a.confirm(staleMembership)).status,409,'source membership must match approval');assert.equal(await a.count(source.id),2);assert.equal(await a.count(target.id),5);

    const alternative=await a.box('정정한 목적지');
    const original=await a.prepare(source.id,target.id);
    const revised=await a.prepare(source.id,alternative.id,{action_id:original.action_id,revision:original.revision});
    assert.equal((await a.confirm(original)).status,409);
    assert.equal((await a.confirm(revised)).status,200);assert.equal(await a.count(source.id),0);assert.equal(await a.count(alternative.id),2);
    assert.equal(await a.count(target.id),5,'only the corrected destination receives the snapshot');

    const largeSource=await a.box('페이지가 나뉘는 출발지'),largeTarget=await a.box('페이지가 나뉘는 도착지');
    await a.seed(largeSource.id,1001);
    const complete=await a.prepare(largeSource.id,largeTarget.id);
    assert.equal(complete.preview.affected_items.length,1001,'all pages belong to the approval');
    assert.equal(Object.keys(complete.expected_versions).filter(k=>k.startsWith('items:')).length,1001);
    const largeResponse=await a.confirm(complete);const largeBody=await largeResponse.json();assert.equal(largeResponse.status,200,JSON.stringify(largeBody));
    assert.equal(largeBody.receipt.result.length,1001);assert.equal(await a.count(largeSource.id),0);assert.equal(await a.count(largeTarget.id),1001);
    console.log('PASS bulk move: full snapshot, ownership, atomic retry, stale item/content/membership conflicts, corrected destination, retained media and 1001-item pagination');
  } finally {
    for(const id of users) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
});
