import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
import * as contracts from '../src/lib/agent/contracts';
import * as proposalSchema from '../src/lib/storage/map-proposal-schema';
import { VisionError } from '../src/lib/ai/gemini';
import type { StorageMapDraft } from '../src/lib/storage/map-types';
import type { executeStorageTool } from '../src/lib/agent/tools';
import { runConversation } from '../src/lib/agent/conversation';
import { agentInstructions, agentTools, contextSchema, modelToolResult, toolCallSchema } from '../src/lib/agent/contracts';

test('agent exposes semantic map proposals while keeping final map saves outside model tools',()=>{
  const tool=agentTools.find(tool=>String(tool.name)==='propose_storage_map');
  assert.ok(tool,'natural-language map requests need a proposal tool');
  assert.ok(toolCallSchema.safeParse({name:'propose_storage_map',arguments:{request_json:'{}'}}).success);
  assert.ok(!agentTools.some(tool=>/confirm|commit|save_storage_map/.test(tool.name)));
});

test('map instructions distinguish recommended places from recorded places and keep screen confirmation',()=>{
  const instructions=agentInstructions(contextSchema.parse({}));
  assert.match(instructions,/propose_storage_map/);
  assert.match(instructions,/추천 장소/);
  assert.match(instructions,/동명|같은 이름의 장소가 여러 개면/);
  assert.match(instructions,/최종 실행은 화면의 확인 버튼/);
  assert.doesNotMatch(instructions,/자연어로 구획을 이동·편집하거나 새 지도 좌표를 만들지 마세요/);
});

test('model receives semantic proposal context without generated geometry or inventory-wide scene',()=>{
  const proposal={proposal_id:'proposal',revision:2,relations:[{subject:'서재',relation:'left_of',object:'거실'}],locations:[{name:'서재',source:'existing'}],draft:{regions:[{cells:[{col:2,row:3}]}]},scene:{regions:[{cells:[{col:2,row:3}]}]}};
  const compact=modelToolResult({mapProposal:proposal});
  assert.doesNotMatch(JSON.stringify(compact),/"cells"|"col"|"row"/);
  assert.ok(proposal.draft.regions[0].cells.length,'compacting model context must not modify the UI proposal');
});

const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const draft:StorageMapDraft={base_map_revision:3,map_draft_id:id,draft_revision:5,name:'우리 집',columns:12,rows:8,regions:[{id:other,location_id:id,client_location_key:null,color_key:'green',cells:[{col:0,row:0}]}],new_locations:[],anchors:[]};
const relation={subject:id,relation:'left_of' as const,target:other};
function toolFixture(action={action_id:id,revision:1,status:'prepared',type:'register_items'}){
  const source=readFileSync(new URL('../src/lib/agent/tools.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const calls:unknown[]=[];
  const exports:{executeStorageTool?:typeof executeStorageTool}={};
  runInNewContext(compiled,{exports,require:(name:string)=>{
    if(name==='zod')return zod;
    if(name==='./contracts')return contracts;
    if(name==='@/lib/storage/map-proposal-schema')return proposalSchema;
    if(name==='@/lib/storage/map-proposal-service')return {proposeStorageMap:async(request:unknown)=>{calls.push(request);return {proposal_id:other,draft:{...draft,draft_revision:6},relations:[relation]}}};
    if(name==='@/lib/storage/service')return {getActionStatus:async()=>action,prepareChange:()=>assert.fail('proposal must not prepare a database write')};
    if(name==='@/lib/ai/gemini')return {VisionError};
    return {};
  }});
  return {calls,tool:(args:Record<string,unknown>,context=contextSchema.parse({}))=>exports.executeStorageTool!('propose_storage_map',args,context)};
}

test('proposal tool takes semantic intent and preserves the validated UI draft and previous relations',async()=>{
  const fixture=toolFixture();
  const context=contextSchema.parse({activeActionId:id,activeActionRevision:1,mapProposal:{draft,previous_relations:[relation]}});
  const result=await fixture.tool({request_json:JSON.stringify({relations:[{subject:other,relation:'above',target:id}]})},context);
  assert.ok((result as {mapProposal:unknown}).mapProposal);
  assert.equal(fixture.calls.length,1,'a prepared item action still permits a local map suggestion');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls[0])),{relations:[{subject:other,relation:'above',target:id}],draft,previous_relations:[relation]});
});

test('uncertain and prepared-map states reject proposal replacement before invoking layout service',async()=>{
  const preparedMap=toolFixture({action_id:id,revision:1,status:'prepared',type:'save_storage_map'});
  await assert.rejects(preparedMap.tool({request_json:'{}'},contextSchema.parse({activeActionId:id,activeActionRevision:1})),/지도 변경안/);
  const locked=toolFixture();
  await assert.rejects(locked.tool({request_json:'{}'},contextSchema.parse({activeActionLocked:true})),/결과를 먼저/);
  const stale=toolFixture();
  await assert.rejects(stale.tool({request_json:'{}'},contextSchema.parse({activeActionId:id,activeActionRevision:2})),/변경안이 달라/);
  assert.equal(preparedMap.calls.length+locked.calls.length+stale.calls.length,0);
});

test('proposal tool rejects raw geometry, replacement UI context, and malformed model JSON',async()=>{
  const fixture=toolFixture();
  for(const request_json of ['invalid',JSON.stringify({draft}),JSON.stringify({regions:[]}),JSON.stringify({previous_relations:[]}),JSON.stringify({relations:[{subject:id,relation:'inside',target:other}]})]){
    await assert.rejects(fixture.tool({request_json}),(error:unknown)=>error instanceof VisionError&&error.status===400);
  }
  assert.equal(fixture.calls.length,0);
});

test('proposal context is shape checked and only semantic identities reach model instructions',()=>{
  assert.equal(contextSchema.safeParse({mapProposal:{draft:{...draft,map_draft_id:'invented'},previous_relations:[]}}).success,false);
  const context=contextSchema.parse({mapProposal:{draft,previous_relations:[relation]}});
  const instructions=agentInstructions(context);
  assert.doesNotMatch(instructions,/"cells"|"col"|"row"/);
  assert.match(instructions,/"draft_revision":5/);
  assert.match(instructions,/left_of/);
});

test('explicit relation replacement passes a scoped removal while additive requests keep prior constraints',async()=>{
  const fixture=toolFixture();
  const previous={subject:id,relation:'next_to' as const,target:other};
  const context=contextSchema.parse({mapProposal:{draft,previous_relations:[previous]}});
  await fixture.tool({request_json:JSON.stringify({remove_relations:[{subject:id,target:other}],relations:[{subject:id,relation:'above',target:other}]})},context);
  const request=JSON.parse(JSON.stringify(fixture.calls[0]));
  assert.deepEqual(request.remove_relations,[{subject:id,target:other}]);
  assert.deepEqual(request.previous_relations,[previous]);
  assert.equal(request.relations[0].relation,'above');
  const instructions=agentInstructions(context);
  assert.match(instructions,/옆 말고 위로/);
  assert.match(instructions,/단순히 조건을 추가하는 요청에서는 기존 관계를 임의로 지우지/);
});

test('sequential proposal tools advance draft identity and relation context without exposing generated cells',async()=>{
  const context=contextSchema.parse({mapProposal:{draft,previous_relations:[]}});
  let round=0;
  const result=await runConversation({message:'서재를 거실 왼쪽으로',history:[],context},{
    request:async body=>{
      assert.doesNotMatch(String(body.instructions),/"cells"/);
      assert.doesNotMatch(JSON.stringify(body.input),/cells/);
      return ++round<3?{status:'completed',output:[{type:'function_call',name:'propose_storage_map',call_id:String(round),arguments:'{"request_json":"{}"}'}]}:{status:'completed',output:[]};
    },
    execute:async()=>{
      assert.equal(context.mapProposal?.draft.draft_revision,round===1?5:6);
      if(round===2)assert.deepEqual(context.mapProposal?.previous_relations,[relation]);
      return {mapProposal:{proposal_id:other,draft:{...draft,draft_revision:5+round},relations:[relation]}};
    },
  });
  assert.equal(result.events.length,2);
  assert.equal(context.mapProposal?.draft.draft_revision,7);
});

test('map guidance covers narrative new places, between, boundaries, center and compound siblings', () => {
  const instructions = agentInstructions(contextSchema.parse({}));
  assert.match(instructions, /between/); assert.match(instructions, /other_target/); assert.match(instructions, /at_right_edge/); assert.match(instructions, /center/);
  assert.match(instructions, /서술.*새 장소|새 장소.*서술/);
  assert.match(instructions, /각각|모두/); assert.match(instructions, /옷방 베란다/);
});
test('semantic tool accepts rich constraints without coordinates and preserves them in context', async () => {
  const fixture = toolFixture();
  const relations = [{ subject: '화장실', relation: 'between', target: id, other_target: other, axis: 'auto' }, { subject: '화장실', relation: 'at_right_edge', target: 'map' }, { subject: '거실', relation: 'center', target: 'map' }];
  await fixture.tool({ request_json: JSON.stringify({ new_location_names: ['화장실', '거실'], relations }) });
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls[0])).relations, relations);
  assert.equal(contextSchema.safeParse({ mapProposal: { draft, previous_relations: relations } }).success, true);
});
