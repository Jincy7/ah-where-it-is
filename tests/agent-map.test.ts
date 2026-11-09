import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
import * as contracts from '../src/lib/agent/contracts';
import { runConversation } from '../src/lib/agent/conversation';
import * as storageSchema from '../src/lib/storage/schema';
import * as proposalSchema from '../src/lib/storage/map-proposal-schema';
import * as mapTypes from '../src/lib/storage/map-types';
import { VisionError } from '../src/lib/ai/gemini';
import { matchStorageNames } from '../src/lib/agent/container-lookup';
import type { executeStorageTool } from '../src/lib/agent/tools';

const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const emptyScene: mapTypes.StorageMapSceneData = {map:null,regions:[],anchors:[],locations:[],containers:[],evidence_at:'2026-11-09T00:00:00Z',truncated:false,resolution:null};
const plain = (value:unknown) => JSON.parse(JSON.stringify(value));

type Service = Record<string,(...args:unknown[])=>unknown>;
function fixture(service: Service = {}, maps: Service = {}) {
  const source = readFileSync(new URL('../src/lib/agent/tools.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports: {executeStorageTool?:typeof executeStorageTool} = {};
  const defaults: Service = {
    getActionStatus: async () => ({action_id:ids[0],revision:1,status:'prepared',type:'create_location'}),
    prepareChange: async change => ({...change as object,action_id:ids[0],revision:2,status:'prepared'}),
    getLocation: async id => ({location:{id,name:'서재'},items:[]}),
    getContainer: async id => ({container:{id,name:'서랍'},items:[]}),
    searchItems: async () => ids.map(id=>({id,name:'여권'})),
  };
  runInNewContext(compiled, {
    exports,
    require(name:string) {
      if (name === 'server-only') return {};
      if (name === 'zod') return zod;
      if (name === './contracts') return contracts;
      if (name === './container-lookup') return {matchStorageNames};
      if (name === '@/lib/storage/service') return {...defaults,...service};
      if (name === '@/lib/storage/map-service') return {getStorageMap:async()=>emptyScene,resolveStorageMap:async()=>emptyScene,...maps};
      if (name === '@/lib/storage/map-proposal-schema') return proposalSchema;
      if (name === '@/lib/storage/map-proposal-service') return {proposeStorageMap:async()=>assert.fail('Unexpected proposal')};
      if (name === '@/lib/storage/map-types') return mapTypes;
      if (name === '@/lib/storage/schema') return storageSchema;
      if (name === '@/lib/ai/gemini') return {VisionError};
      if (['@/lib/ai/schema','@/lib/storage/media','@/lib/ai/server','@/lib/ai/openai'].includes(name)) return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return (name:contracts.ToolName,args:Record<string,unknown>,context=contracts.contextSchema.parse({}))=>exports.executeStorageTool!(name,args,context);
}

test('map tools accept only an explicit full map or a UUID-backed domain target',()=>{
  assert.ok(contracts.mapToolArgumentsSchema.safeParse({kind:'all',id:null}).success);
  assert.ok(contracts.mapToolArgumentsSchema.safeParse({kind:'item',id:ids[0]}).success);
  for(const args of [{kind:'all',id:ids[0]},{kind:'item',id:null},{kind:'location',id:'서재'},{kind:'room',id:ids[0]},{kind:'all',id:null,html:'<svg/>'}]) {
    assert.equal(contracts.mapToolArgumentsSchema.safeParse(args).success,false);
  }
  const tools=contracts.agentTools;
  assert.ok(tools.some(tool=>tool.name==='show_storage_map'));
  assert.ok(!contracts.agentChangeTypes.some(type=>(type as string)==='save_storage_map'));
});

test('show_storage_map is read-only and keeps actual target identity',async()=>{
  const calls:unknown[]=[];
  const tool=fixture({prepareChange:()=>assert.fail('read must not write')},{
    getStorageMap:async()=>{calls.push('all');return emptyScene;},
    resolveStorageMap:async target=>{calls.push(plain(target));return emptyScene;},
  });
  const full=await tool('show_storage_map',{kind:'all',id:null}) as {mapView:mapTypes.StorageMapView};
  assert.equal(full.mapView.kind,'storage_map');
  assert.equal(full.mapView.map_id,null);
  assert.equal(full.mapView.target,undefined);
  const item=await tool('show_storage_map',{kind:'item',id:ids[0]}) as {mapView:mapTypes.StorageMapView};
  assert.deepEqual(item.mapView.target,{kind:'item',id:ids[0]});
  assert.deepEqual(calls,['all',{kind:'item',id:ids[0]}]);
  await assert.rejects(tool('show_storage_map',{kind:'item',id:'invented'}));
});

test('successful item and hierarchy lookups return actual map events without an extra model call',async()=>{
  const tool=fixture();
  const search=await tool('search_items',{query:'여권',container_id:null}) as {mapView:mapTypes.StorageMapView};
  assert.deepEqual(plain(search.mapView.highlight_item_ids),[ids[0]], 'only the resolved result receives a precise highlight');
  assert.equal(search.mapView.target?.id,ids[0]);
  for(const kind of ['location','container'] as const) {
    const result=await tool(kind==='location'?'get_location':'get_container',{[`${kind}_id`]:ids[0]}) as {mapView:mapTypes.StorageMapView};
    assert.deepEqual(plain(result.mapView.target),{kind,id:ids[0]});
  }
});

test('map lookup failure preserves inventory results and explicitly reports failed map refresh',async()=>{
  const tool=fixture({}, {resolveStorageMap:async()=>{throw new Error('private secret');}});
  const result=await tool('search_items',{query:'여권',container_id:null}) as {items:unknown[];mapError:string;mapView?:unknown};
  assert.equal(result.items.length,2);
  assert.equal(result.mapView,undefined);
  assert.match(result.mapError,/지도를 불러오지 못/);
  assert.doesNotMatch(JSON.stringify(result),/secret/);
  await assert.rejects(tool('show_storage_map',{kind:'item',id:ids[0]}));
});

test('agent cannot overwrite a prepared map or prepare model-generated map geometry',async()=>{
  let writes=0;
  const tool=fixture({
    getActionStatus:async()=>({action_id:ids[0],revision:1,status:'prepared',type:'save_storage_map'}),
    prepareChange:async()=>{writes++;},
  });
  const context=contracts.contextSchema.parse({activeActionId:ids[0],activeActionRevision:1});
  await assert.rejects(tool('prepare_change',{type:'create_location',payload_json:'{"name":"서재"}'},context),/지도 변경안/);
  await assert.rejects(tool('prepare_change',{type:'save_storage_map',payload_json:'{}'}));
  assert.equal(writes,0);
  assert.ok((await tool('show_storage_map',{kind:'all',id:null},context) as {mapView:unknown}).mapView);
});

test('uncertain action locks preparation and cancellation while status and map reads stay usable',async()=>{
  let writes=0;
  const tool=fixture({prepareChange:async()=>{writes++;},cancelChange:async()=>{writes++;}});
  const context=contracts.contextSchema.parse({activeActionId:ids[0],activeActionRevision:1,activeActionLocked:true});
  await assert.rejects(tool('prepare_change',{type:'create_location',payload_json:'{"name":"서재"}'},context),/결과를 먼저/);
  await assert.rejects(tool('cancel_change',{action_id:ids[0]},context),/결과를 먼저/);
  await tool('get_action_status',{action_id:ids[0]},context);
  await tool('show_storage_map',{kind:'all',id:null},context);
  assert.equal(writes,0);
});

test('agent supports place create/rename/delete through reviewed changes, preserving actual IDs',async()=>{
  const prepared:unknown[]=[];
  const tool=fixture({prepareChange:async change=>{prepared.push(plain(change));return change;}});
  for(const [type,payload] of [
    ['create_location',{name:'서재',description:'책상 옆'}],
    ['update_location',{location_id:ids[0],name:'작업실',description:'책상 옆'}],
    ['delete_location',{location_id:ids[0]}],
  ] as const) {
    await tool('prepare_change',{type,payload_json:JSON.stringify(payload)});
  }
  assert.equal(prepared.length,3);
  assert.deepEqual(prepared[2],{type:'delete_location',payload:{location_id:ids[0]}});
  const instructions=contracts.agentInstructions(contracts.contextSchema.parse({}));
  assert.match(instructions,/같은 이름의 장소가 여러 개면/);
  assert.match(instructions,/보관함·물품은 유지/);
  assert.match(instructions,/지도 구획만 지우려는 요청을 장소 삭제로 바꾸지/);
  assert.match(instructions,/최종 실행은 화면의 확인 버튼/);
});

test('a later text tool call sees the latest prepared action identity within the same request',async()=>{
  const context=contracts.contextSchema.parse({});
  let rounds=0;
  await runConversation({message:'장소 만들기',history:[],context},{
    request:async()=>++rounds<3?{status:'completed',output:[{type:'function_call',name:'prepare_change',call_id:String(rounds),arguments:'{}'}]}:{status:'completed',output:[]},
    execute:async()=>{
      if(rounds===1)assert.equal(context.activeActionId,null);
      else {assert.equal(context.activeActionId,ids[0]);assert.equal(context.activeActionRevision,1);}
      return {action:{action_id:ids[0],revision:rounds,status:'prepared'}};
    },
  });
  assert.equal(context.activeActionRevision,2);
});

test('model tool results omit large geometry while retaining UI events and evidence',async()=>{
  const view=mapTypes.createStorageMapView({...emptyScene,regions:[{id:ids[0],location_id:ids[1],client_location_key:null,color_key:'green',cells:[{col:0,row:0}],location_name:'서재'}]});
  const result={mapView:view};
  const compact=contracts.modelToolResult(result) as {mapView:Record<string,unknown>};
  assert.equal(compact.mapView.scene,undefined);
  assert.ok(view.scene);
  let rounds=0;
  const reply=await runConversation({message:'지도',history:[],context:contracts.contextSchema.parse({})},{
    request:async body=>{
      if(rounds++) {assert.doesNotMatch(JSON.stringify(body.input),/"cells"/);return {status:'completed',output:[]};}
      return {status:'completed',output:[{type:'function_call',name:'show_storage_map',call_id:'map',arguments:'{"kind":"all","id":null}'}]};
    },execute:async()=>result,
  });
  assert.equal((reply.events[0].result as typeof result).mapView.scene?.regions.length,1);
});
