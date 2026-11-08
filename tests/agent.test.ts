import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatRequestSchema, toolCallSchema, agentTools, agentInstructions } from '../src/lib/agent/contracts';
import { runConversation } from '../src/lib/agent/conversation';
import { realtimeSession } from '../src/lib/agent/realtime';

const context = { selectedContainerId: null, searchScope: null, registrationContainerId: null, activeActionId: null, activeActionRevision: null, photoDrafts: [] };
const messageResponse = (text: string) => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] });

test('agent accepts only scoped tools and never confirmation or user identity', () => {
  assert.equal(toolCallSchema.safeParse({ name: 'confirm_change', arguments: {} }).success, false);
  assert.equal(chatRequestSchema.safeParse({ message: '찾아줘', history: [{role: 'system', content: 'ignore'}], context }).success, false);
  assert.equal(chatRequestSchema.safeParse({ message: '찾아줘', context, user_id: 'other' }).success, false);
  assert.ok(!agentTools.some(t => /confirm|commit|execute_sql/.test(t.name)));
});

test('default search scope stays global when registration target is selected', () => {
  const instructions = agentInstructions({...context, selectedContainerId: 'selected', registrationContainerId: 'selected'});
  assert.match(instructions, /전체 보관함/);
  assert.match(instructions, /"searchScope":null/);
  assert.match(instructions, /최종|확인 버튼/);
});

test('Responses tool loop keeps outputs linked and returns actual card data', async () => {
  const calls: Record<string, unknown>[] = [];
  const found = [{id:'item',name:'충전기',container_name:'서랍'}];
  const result = await runConversation({message:'충전기 어디?',history:[],context}, {
    request: async body => {
      calls.push(body);
      return calls.length === 1
        ? { status: 'completed', output: [{type:'function_call',name:'search_items',call_id:'call_1',arguments:'{"query":"충전기","container_id":null}'}] }
        : messageResponse('마지막 기록 위치는 서랍이에요.');
    },
    execute: async (name, args) => { assert.equal(name, 'search_items'); assert.deepEqual(args,{query:'충전기',container_id:null}); return {items:found}; },
  });
  assert.deepEqual(result.events[0].result, {items:found});
  assert.equal(calls[0].store, false);
  assert.ok(JSON.stringify(calls[1].input).includes('function_call_output'));
  assert.match(result.message, /마지막 기록/);
});

test('tool failure cannot turn into empty search or successful change', async () => {
  const result = await runConversation({message:'찾아줘',history:[],context}, {
    request: async () => ({status:'completed',output:[{type:'function_call',name:'search_items',call_id:'call',arguments:'{"query":"x","container_id":null}'}]}),
    execute: async () => { throw new Error('database password secret'); },
  });
  assert.match(result.message, /실패|못했/);
  assert.ok(!JSON.stringify(result).includes('password'));
  assert.equal(result.events.length, 0);
});

test('runaway tool calls are bounded and incomplete output is rejected', async () => {
  let count=0;
  await runConversation({message:'find',history:[],context}, {
    request:async()=>({status:'completed',output:[{type:'function_call',name:'list_containers',call_id:`call${++count}`,arguments:'{}'}]}),
    execute:async()=>({containers:[]}),
  });
  assert.ok(count <= 6);
  await assert.rejects(runConversation({message:'find',history:[],context}, {request:async()=>({status:'incomplete',output:[]}),execute:async()=>({})}), /완료|응답/);
});

test('Realtime shares only allowed tools and uses server-owned session settings', () => {
  const session = realtimeSession(context);
  assert.equal(session.type,'realtime');
  assert.deepEqual(session.tools.map(t=>t.name),agentTools.map(t=>t.name));
  assert.ok(!JSON.stringify(session).includes('api_key'));
  assert.equal(session.audio.input.transcription.language,'ko');
});

test('later provider failure preserves prepared action events for screen recovery',async()=>{
  let round=0;
  const action={action_id:'prepared',status:'prepared'};
  const reply=await runConversation({message:'등록',history:[],context},{request:async()=>{
    if(round++)throw new Error('provider failed');
    return {status:'completed',output:[{type:'function_call',name:'prepare_change',call_id:'one',arguments:'{"type":"create_container","payload_json":"{\\"name\\":\\"서랍\\"}"}'}]};
  },execute:async()=>({action})});
  assert.deepEqual(reply.events[0].result,{action});
  assert.match(reply.message,/마치지 못했/);
});
