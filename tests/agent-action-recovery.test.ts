import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import * as timeline from '../src/components/storage-workspace/timeline';
import * as workflow from '../src/components/storage-workspace/map-workflow';
import * as mapTypes from '../src/lib/storage/map-types';
import type { StorageAction, WorkspaceData } from '../src/lib/storage/types';
import type { StorageWorkspace } from '../src/components/storage-workspace/storage-workspace';
import type { ActionCard } from '../src/components/storage-workspace/action-card';

const require = createRequire(import.meta.url);
type Element = {type:unknown;props:Record<string,unknown>&{children?:unknown}};
function find(element:unknown,predicate:(element:Element)=>boolean):Element|undefined {
  if(!element||typeof element!=='object')return undefined;
  const node=element as Element;
  if(predicate(node))return node;
  return [node.props?.children].flat(Infinity).map(child=>find(child,predicate)).find(Boolean);
}
function childrenText(value:unknown):string {
  if(typeof value==='string'||typeof value==='number')return String(value);
  if(Array.isArray(value))return value.map(childrenText).join('');
  if(value&&typeof value==='object')return childrenText((value as Element).props?.children);
  return '';
}
const draft:mapTypes.StorageMapDraft={base_map_revision:null,map_draft_id:randomUUID(),draft_revision:2,name:'우리 집',columns:12,rows:8,regions:[],anchors:[],new_locations:[]};
const prepared:StorageAction={action_id:randomUUID(),revision:1,type:'save_storage_map',status:'prepared',payload:{...draft},payload_hash:'a'.repeat(64),idempotency_key:randomUUID(),expected_versions:{},preview:{title:'집 지도 저장',before:null,after:null,affected_items:[]},receipt:null};

function workspaceFixture(options: { initialDraft?: mapTypes.StorageMapDraft; initialAction?: StorageAction; request?: (url: string) => Promise<unknown> } = {}) {
  const slots:unknown[]=[];
  const layoutEffects:Array<()=>void>=[];
  let cursor=0;
  const endpoints:string[]=[];
  let attempt=0;
  class StorageRequestError extends Error {constructor(message:string,public status:number){super(message)}}
  const react={
    useState<T>(initial:T|(()=>T)) {
      const index=cursor++;
      if(!(index in slots))slots[index]=typeof initial==='function'?(initial as ()=>T)():initial;
      return [slots[index],(value:T|((previous:T)=>T))=>{slots[index]=typeof value==='function'?(value as (previous:T)=>T)(slots[index] as T):value}];
    },
    useRef<T>(initial:T){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]},
    useCallback<T>(callback:T){cursor++;return callback},
    useEffect(){cursor++},
    useLayoutEffect(effect:()=>void){cursor++;layoutEffects.push(effect)},
  };
  function compile(file:string){return ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText}
  const exports:{StorageWorkspace?:typeof StorageWorkspace}={};
  runInNewContext(compile('../src/components/storage-workspace/storage-workspace.tsx'),{
    exports,
    crypto:{randomUUID},
    URLSearchParams,
    TypeError, SyntaxError,
    fetch:async(url:string)=>{endpoints.push(url);assert.fail(`Unexpected confirm/network request: ${url}`)},
    require:(name:string)=>{
      if(name==='react')return react;
      if(name==='next/navigation')return {useSearchParams:()=>new URLSearchParams()};
      if(name==='sonner')return {toast:{error:()=>{}}};
      if(name==='./contracts')return {StorageRequestError,storageRequest:async(url:string)=>{
        endpoints.push(url);
        if(options.request)return options.request(url);
        assert.match(url,/\/cancel$/,'an uncertain cancellation never sends a confirmation');
        if(attempt++===0)throw new TypeError('connection lost');
        return {action:{...prepared,status:'cancelled'}};
      }};
      if(name==='./timeline')return timeline;
      if(name==='./map-workflow')return workflow;
      if(name==='./photo-state')return {photoDraftAcceptsAction:()=>true};
      if(name==='@/lib/storage/map-types')return mapTypes;
      if(name.startsWith('@/components/')||name.startsWith('./'))return new Proxy({},{get:(_,key)=>key});
      return require(name);
    },
  });
  const render=()=>{
    cursor=0;
    const element=exports.StorageWorkspace!() as Element;
    layoutEffects.splice(0).forEach(effect=>effect());
    return element;
  };
  const component=(name:string)=>find(render(),node=>node.type===name)!;
  const mapEditor=component('StorageMapEditor');
  (mapEditor.props.onDraftChange as (value:mapTypes.StorageMapDraft)=>void)(options.initialDraft ?? draft);
  const assistant=component('AssistantPanel');
  (assistant.props.onAction as (action:StorageAction)=>void)(options.initialAction ?? prepared);
  const components=(name:string)=>{
    const nodes:Element[]=[];
    find(render(),node=>{if(node.type===name)nodes.push(node);return false});
    return nodes;
  };
  return {component,components,endpoints,compile};
}

function cardFixture(compile:(file:string)=>string,props:Parameters<typeof ActionCard>[0]) {
  const exports:{ActionCard?:typeof ActionCard}={};
  runInNewContext(compile('../src/components/storage-workspace/action-card.tsx'),{
    exports,
    require:(name:string)=>{
      if(name==='react')return {useState:<T>(value:T)=>[value,()=>{}]};
      if(name.startsWith('@/components/'))return new Proxy({},{get:(_,key)=>key});
      return require(name);
    },
  });
  return exports.ActionCard!(props) as Element;
}

test('lost cancellation response retries cancel with the same action instead of saving the map',async()=>{
  const fixture=workspaceFixture();
  let action=fixture.component('ActionCard');
  await (action.props.onCancel as ()=>Promise<void>)();
  action=fixture.component('ActionCard');
  assert.equal(action.props.uncertain,true);
  assert.equal(action.props.uncertainOperation,'cancel');
  const card=cardFixture(fixture.compile,action.props as Parameters<typeof ActionCard>[0]);
  const retry=find(card,node=>node.type==='Button'&&childrenText(node.props.children).includes('취소 다시 요청'));
  assert.ok(retry,'the visible action explicitly retries cancellation');
  (retry.props.onClick as ()=>void)();
  // ActionCard intentionally invokes the async parent callback with void.
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(fixture.endpoints,[`/api/storage/actions/${prepared.action_id}/cancel`,`/api/storage/actions/${prepared.action_id}/cancel`]);
  action=fixture.component('ActionCard');
  assert.equal((action.props.action as StorageAction).status,'cancelled');
  assert.equal(action.props.uncertain,false);
  assert.equal(fixture.component('StorageMapEditor').props.draft,draft,'cancelling an approval preserves the independent map draft');
});

const savedScene:mapTypes.StorageMapSceneData={
  map:{id:randomUUID(),name:'우리 집',columns:12,rows:8,revision:1,schema_version:1,updated_at:'2026-11-09T00:00:00Z'},
  regions:[],anchors:[],locations:[],containers:[],evidence_at:'2026-11-09T00:00:00Z',truncated:false,resolution:null,
};
const freshInventory:WorkspaceData={
  items:[],containers:[],truncated:false,
  locations:[{id:randomUUID(),name:'저장한 새 장소',user_id:randomUUID(),description:null,created_at:'2026-11-09T00:00:00Z',updated_at:'2026-11-09T00:00:00Z',version:1}],
};
function completedMap(action:StorageAction=prepared):StorageAction {
  return {...action,status:'completed',receipt:{action_id:action.action_id,type:'save_storage_map',completed_at:'2026-11-09T00:00:00Z',result:{map_id:savedScene.map!.id,revision:savedScene.map!.revision}}};
}
function readReceiptData(url:string):Promise<unknown> {
  if(url==='/api/storage/map')return Promise.resolve(savedScene);
  if(url==='/api/storage')return Promise.resolve(freshInventory);
  assert.fail(`Unexpected reconciliation request: ${url}`);
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('agent completed receipt clears matching map draft, refreshes inventory, and appends one saved map',async()=>{
  const fixture=workspaceFixture({request:readReceiptData});
  const receipt=completedMap();
  const assistant=fixture.component('AssistantPanel');
  const onAction=assistant.props.onAction as (value:StorageAction)=>void;
  onAction(receipt);
  onAction(receipt); // Two status responses can arrive before React rerenders.
  await settle();
  assert.equal(fixture.component('StorageMapEditor').props.draft,null);
  assert.equal((fixture.component('ActionCard').props.action as StorageAction).status,'completed');
  assert.deepEqual(fixture.endpoints,['/api/storage/map','/api/storage']);
  const maps=fixture.components('StorageMapChatCard');
  assert.equal(maps.length,1);
  assert.equal((maps[0].props.view as mapTypes.StorageMapView).scene,savedScene);
  assert.equal(maps[0].props.refreshKey,1);
  assert.equal((fixture.component('ManagementDialog').props.data as WorkspaceData).locations[0].name,'저장한 새 장소');
  (fixture.component('AssistantPanel').props.onAction as (value:StorageAction)=>void)(receipt);
  await settle();
  assert.equal(fixture.components('StorageMapChatCard').length,1);
  assert.deepEqual(fixture.endpoints,['/api/storage/map','/api/storage'],'replayed receipt does not repeat reconciliation');
});

test('stale completed receipt cannot clear a newer map draft or refresh its records',async()=>{
  const newerDraft={...draft,draft_revision:3};
  const newerAction={...prepared,revision:2,payload:{...newerDraft},payload_hash:'b'.repeat(64)};
  const fixture=workspaceFixture({initialDraft:newerDraft,initialAction:newerAction,request:readReceiptData});
  (fixture.component('AssistantPanel').props.onAction as (value:StorageAction)=>void)(completedMap());
  await settle();
  assert.equal(fixture.component('StorageMapEditor').props.draft,newerDraft);
  const active=fixture.component('ActionCard').props.action as StorageAction;
  assert.equal(active.revision,2);assert.equal(active.status,'prepared');
  assert.deepEqual(fixture.endpoints,[]);
  assert.equal(fixture.components('StorageMapChatCard').length,0);
});

test('completed map receipt preserves a different local draft and leaves a reloadable card after map read fails',async()=>{
  const fixture=workspaceFixture({request:async url=>{
    if(url==='/api/storage/map')throw new TypeError('map refresh unavailable');
    return readReceiptData(url);
  }});
  const otherDraft={...draft,map_draft_id:randomUUID(),draft_revision:7};
  (fixture.component('StorageMapEditor').props.onDraftChange as (value:mapTypes.StorageMapDraft)=>void)(otherDraft);
  (fixture.component('AssistantPanel').props.onAction as (value:StorageAction)=>void)(completedMap());
  await settle();
  assert.equal(fixture.component('StorageMapEditor').props.draft,otherDraft);
  const maps=fixture.components('StorageMapChatCard');
  assert.equal(maps.length,1);
  const view=maps[0].props.view as mapTypes.StorageMapView;
  assert.equal(view.scene,undefined);assert.equal(view.map_id,savedScene.map!.id);
  assert.equal(view.created_map_revision,1);
  assert.deepEqual(fixture.endpoints,['/api/storage/map','/api/storage']);
});
