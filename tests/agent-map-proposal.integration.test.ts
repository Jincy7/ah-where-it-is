import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { contextSchema } from '../src/lib/agent/contracts';
import type { StorageAction } from '../src/lib/storage/types';
import type { StorageMapProposal } from '../src/lib/storage/map-proposal-types';

test('agent proposal tools use owned records, keep recommendations unsaved, and respect approval locks',{
  skip:process.env.RUN_AGENT_INTEGRATION!=='1',timeout:120_000,
},async()=>{
  loadEnvFile('.env.local');
  const url=process.env.SUPABASE_URL!,app=process.env.TEST_APP_URL??'http://localhost:4201';
  for(const endpoint of [url,app])assert.ok(['localhost','127.0.0.1'].includes(new URL(endpoint).hostname));
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const users:string[]=[];
  async function account(){
    const email=`agent-proposal-${randomUUID()}@example.com`,password=randomUUID();
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);
    const id=created.data.user!.id;users.push(id);
    const cookies:{name:string;value:string}[]=[];
    const client=createServerClient(url,process.env.SUPABASE_ANON_KEY!,{cookies:{getAll:()=>cookies,setAll:values=>{for(const value of values){const index=cookies.findIndex(cookie=>cookie.name===value.name);if(index<0)cookies.push(value);else cookies[index]=value}}}});
    assert.ifError((await client.auth.signInWithPassword({email,password})).error);
    const post=(path:string,body:unknown)=>fetch(app+path,{method:'POST',headers:{cookie:cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; '),origin:app,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const tool=(intent:unknown,context=contextSchema.parse({}))=>post('/api/agent/tool',{name:'propose_storage_map',arguments:{request_json:JSON.stringify(intent)},context});
    const location=async(name:string)=>{const result=await client.from('locations').insert({user_id:id,name}).select().single();assert.ifError(result.error);return result.data!};
    return {id,client,post,tool,location};
  }
  async function result(response:Response,status=200){const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data}
  try{
    const a=await account(),b=await account();
    const living=await a.location('거실'),study=await a.location('서재');
    const container=await a.client.from('containers').insert({user_id:a.id,name:'책상 서랍',location_id:study.id}).select().single();assert.ifError(container.error);
    const first=(await result(await a.tool({}))).result.mapProposal as StorageMapProposal;
    assert.equal(first.source.location_count,2);assert.equal(first.source.container_count,1);
    assert.equal(first.draft.regions.length,2);assert.equal(first.draft.anchors[0].container_id,container.data!.id);
    assert.equal(first.draft.new_locations.length,0);assert.equal(first.base.draft_id,null);
    const context=contextSchema.parse({mapProposal:{draft:first.draft,previous_relations:first.relations}});
    const moved=(await result(await a.tool({relations:[{subject:study.id,relation:'left_of',target:living.id}]},context))).result.mapProposal as StorageMapProposal;
    assert.equal(moved.base.draft_id,first.draft.map_draft_id);assert.equal(moved.draft.draft_revision,first.draft.draft_revision+1);
    const studyCells=moved.draft.regions.find(region=>region.location_id===study.id)!.cells;
    const livingCells=moved.draft.regions.find(region=>region.location_id===living.id)!.cells;
    assert.ok(Math.max(...studyCells.map(cell=>cell.col))<Math.min(...livingCells.map(cell=>cell.col)));
    const adjacent=(await result(await a.tool({remove_relations:[{subject:study.id,target:living.id}],relations:[{subject:study.id,relation:'next_to',target:living.id}]},contextSchema.parse({mapProposal:{draft:moved.draft,previous_relations:moved.relations}})))).result.mapProposal as StorageMapProposal;
    const replaced=(await result(await a.tool({remove_relations:[{subject:study.id,target:living.id}],relations:[{subject:study.id,relation:'above',target:living.id}]},contextSchema.parse({mapProposal:{draft:adjacent.draft,previous_relations:adjacent.relations}})))).result.mapProposal as StorageMapProposal;
    assert.equal(replaced.relations.some(relation=>relation.relation==='next_to'),false,'explicit not-next-to correction removes adjacency');
    assert.ok(replaced.relations.some(relation=>relation.subject===study.id&&relation.relation==='above'&&relation.target===living.id));
    assert.equal((await a.client.from('storage_maps').select('id',{count:'exact'})).count,0,'tool proposals do not save geometry');
    assert.equal((await a.client.from('locations').select('id',{count:'exact'})).count,2);
    const itemAction=(await result(await a.post('/api/storage/actions',{type:'register_items',payload:{container_id:container.data!.id,items:[{name:'여권',quantity:1}]}}))).action as StorageAction;
    const withItem=contextSchema.parse({...context,activeActionId:itemAction.action_id,activeActionRevision:itemAction.revision});
    await result(await a.tool({},withItem));
    await result(await a.tool({},contextSchema.parse({...withItem,activeActionLocked:true})),409);
    const mapAction=(await result(await a.post('/api/storage/actions',{type:'save_storage_map',payload:moved.draft}))).action as StorageAction;
    await result(await a.tool({},contextSchema.parse({activeActionId:mapAction.action_id,activeActionRevision:mapAction.revision})),409);
    await result(await a.tool({draft:moved.draft}),400);
    await result(await a.tool({relations:[{subject:'모르는 장소',relation:'left_of',target:living.id}]}),404);
    const recommended=(await result(await b.tool({}))).result.mapProposal as StorageMapProposal;
    assert.ok(recommended.recommended_location_keys.length>0);
    assert.equal(recommended.source.location_count,0);assert.ok(recommended.draft.new_locations.length>0);
    assert.equal((await b.client.from('locations').select('id',{count:'exact'})).count,0,'recommended places remain local until screen confirmation');
    const corrected=(await result(await b.tool({},contextSchema.parse({mapProposal:{draft:recommended.draft,previous_relations:recommended.relations}})))).result.mapProposal as StorageMapProposal;
    assert.equal(corrected.recommended_location_keys.length,recommended.recommended_location_keys.length,'correction preserves recommendation provenance');
    await result(await b.tool({relations:[{subject:study.id,relation:'left_of',target:living.id}]}),404);
    const prepare=(await result(await b.post('/api/storage/actions',{type:'save_storage_map',payload:corrected.draft}))).action as StorageAction;
    assert.equal((await b.client.from('locations').select('id',{count:'exact'})).count,0,'even approval preparation does not create recommended places');
    await result(await b.post(`/api/storage/actions/${prepare.action_id}/confirm`,{revision:prepare.revision,payload_hash:prepare.payload_hash,idempotency_key:prepare.idempotency_key}));
    assert.equal((await b.client.from('locations').select('id',{count:'exact'})).count,corrected.draft.new_locations.length);
    assert.equal((await b.client.from('storage_maps').select('id',{count:'exact'})).count,1);
  }finally{for(const id of users)assert.ifError((await admin.auth.admin.deleteUser(id)).error)}
});
