import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { contextSchema } from '../src/lib/agent/contracts';
import type { StorageAction } from '../src/lib/storage/types';

test('agent place CRUD and map reads share reviewed transactions and owned records', {
  skip:process.env.RUN_AGENT_INTEGRATION!=='1',timeout:120_000,
},async()=>{
  loadEnvFile('.env.local');
  const url=process.env.SUPABASE_URL!;
  const app=process.env.TEST_APP_URL??'http://localhost:4201';
  for(const value of [url,app])assert.ok(['localhost','127.0.0.1'].includes(new URL(value).hostname));
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const users:string[]=[];
  async function account(){
    const email=`map-agent-${randomUUID()}@example.com`,password=randomUUID();
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
    assert.ifError(created.error);
    const id=created.data.user!.id;users.push(id);
    const cookies:{name:string;value:string}[]=[];
    const client=createServerClient(url,process.env.SUPABASE_ANON_KEY!,{cookies:{
      getAll:()=>cookies,setAll:values=>{for(const value of values){const i=cookies.findIndex(c=>c.name===value.name);if(i<0)cookies.push(value);else cookies[i]=value;}},
    }});
    assert.ifError((await client.auth.signInWithPassword({email,password})).error);
    const post=(path:string,body:unknown)=>fetch(app+path,{method:'POST',headers:{cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; '),origin:app,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
    const tool=(name:string,args:Record<string,unknown>,context=contextSchema.parse({}))=>post('/api/agent/tool',{name,arguments:args,context});
    async function confirm(action:StorageAction){return result(await post(`/api/storage/actions/${action.action_id}/confirm`,{revision:action.revision,payload_hash:action.payload_hash,idempotency_key:action.idempotency_key}));}
    return {id,client,post,tool,confirm};
  }
  async function result(response:Response,status=200){const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;}
  try{
    const a=await account(),b=await account();
    const create=(await result(await a.tool('prepare_change',{type:'create_location',payload_json:'{"name":"서재","description":"책상 옆"}'}))).result.action as StorageAction;
    assert.equal((await a.client.from('locations').select('id',{count:'exact'})).count,0,'agent only prepares a place');
    await a.confirm(create);
    const location=(await result(await a.tool('list_locations',{}))).result.locations[0];
    const foreign=await b.client.from('locations').insert({user_id:b.id,name:'비공개 장소'}).select().single();assert.ifError(foreign.error);
    const container=await a.client.from('containers').insert({user_id:a.id,name:'서랍',location_id:location.id}).select().single();assert.ifError(container.error);
    const item=await a.client.from('items').insert({container_id:container.data!.id,name:'여권',quantity:1}).select().single();assert.ifError(item.error);
    const region=randomUUID();
    const map=(await result(await a.post('/api/storage/actions',{type:'save_storage_map',payload:{
      base_map_revision:null,map_draft_id:randomUUID(),draft_revision:1,name:'우리 집',columns:12,rows:8,
      regions:[{id:region,location_id:location.id,client_location_key:null,color_key:'green',cells:[{col:1,row:1}]}],
      new_locations:[],anchors:[{region_id:region,container_id:container.data!.id,col:1,row:1}],
    }}))).action as StorageAction;
    const mapContext=contextSchema.parse({activeActionId:map.action_id,activeActionRevision:map.revision});
    await result(await a.tool('prepare_change',{type:'create_location',payload_json:'{"name":"덮어쓰기"}'},mapContext),409);
    await result(await a.tool('prepare_change',{type:'save_storage_map',payload_json:JSON.stringify(map.payload)}),400);
    await a.confirm(map);
    const query=(await result(await a.tool('search_items',{query:'여권',container_id:null}))).result;
    assert.equal(query.mapView.kind,'storage_map');assert.equal(query.mapView.target.id,item.data!.id);
    assert.equal(query.mapView.scene.resolution.placement,'placed');assert.equal(query.mapView.scene.resolution.anchor.container_id,container.data!.id);
    const rename=(await result(await a.tool('prepare_change',{type:'update_location',payload_json:JSON.stringify({location_id:location.id,name:'작업실',description:'책상 옆'})}))).result.action as StorageAction;
    assert.equal((await a.client.from('locations').select('name').eq('id',location.id).single()).data?.name,'서재');
    await a.confirm(rename);
    const current=(await result(await a.tool('show_storage_map',{kind:'item',id:item.data!.id}))).result.mapView;
    assert.equal(current.scene.regions[0].location_name,'작업실');
    assert.equal(current.scene.resolution.location.name,'작업실');
    await result(await a.tool('get_location',{location_id:foreign.data!.id}),404);
    const isolated=(await result(await a.tool('show_storage_map',{kind:'location',id:foreign.data!.id}))).result.mapView;
    assert.equal(isolated.scene.resolution.status,'deleted');assert.ok(!JSON.stringify(isolated).includes('비공개 장소'));
    const remove=(await result(await a.tool('prepare_change',{type:'delete_location',payload_json:JSON.stringify({location_id:location.id})}))).result.action as StorageAction;
    assert.deepEqual(remove.preview.before?.map_region_ids,[region]);assert.equal(remove.preview.before?.map_revision,current.scene.map.revision);
    await a.confirm(remove);
    const after=(await result(await a.tool('show_storage_map',{kind:'item',id:item.data!.id}))).result.mapView;
    assert.equal(after.scene.regions.length,0);assert.equal(after.scene.anchors.length,0);
    assert.equal(after.scene.resolution.placement,'no_location');assert.equal(after.scene.resolution.item.id,item.data!.id);
    assert.equal((await a.client.from('containers').select('location_id').eq('id',container.data!.id).single()).data?.location_id,null);
    assert.ok(after.scene.map.revision>current.scene.map.revision);
  }finally{for(const id of users)assert.ifError((await admin.auth.admin.deleteUser(id)).error);}
});
