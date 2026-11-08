import 'server-only';
import { z } from 'zod';
import { analysisSchema } from '@/lib/ai/schema';
import { readOwnedMedia } from '@/lib/storage/media';
import { storageContext } from '@/lib/storage/service';
import { consumeQuota, userProviderKey } from '@/lib/ai/server';
import { analyzeOpenAIImage } from '@/lib/ai/openai';
import { analyzeImage } from '@/lib/ai/gemini';
import { cancelChange, getActionStatus, getContainer, listContainers, prepareChange, searchItems } from '@/lib/storage/service';
import { changeSchema } from '@/lib/storage/schema';
import { VisionError } from '@/lib/ai/gemini';
import type { AgentContext, ToolName } from './contracts';

const id = z.string().uuid();
export async function executeStorageTool(name: ToolName, args: Record<string,unknown>, context:AgentContext) {
  switch(name) {
    case 'search_items': {
      const input=z.object({query:z.string().trim().min(1).max(100),container_id:id.nullable()}).strict().parse(args);
      return {items:await searchItems(input.query,input.container_id ?? undefined)};
    }
    case 'list_containers':
      z.object({}).strict().parse(args);
      return {containers:await listContainers()};
    case 'get_container':
      return await getContainer(z.object({container_id:id}).strict().parse(args).container_id);
    case 'analyze_photo': {
      const input=z.object({media_id:id,provider:z.enum(['openai','gemini'])}).strict().parse(args);
      const jpeg=await readOwnedMedia(input.media_id);
      const {user}=await storageContext();
      const key=await userProviderKey(user.id,input.provider);
      await consumeQuota(user.id,'analysis');
      return {analysis:await (input.provider==='openai'?analyzeOpenAIImage:analyzeImage)(key,jpeg),media_id:input.media_id};
    }
    case 'update_photo_draft': {
      const input=z.object({photo_id:id,expected_revision:z.number().int().positive(),items_json:z.string().max(40000)}).strict().parse(args);
      const draft=context.photoDrafts.find(photo=>photo.photo_id===input.photo_id);
      if(!draft||draft.revision!==input.expected_revision)throw new VisionError('사진 후보가 바뀌었습니다. 현재 내용을 확인해주세요',409);
      const analysis=analysisSchema.parse({items:JSON.parse(input.items_json)});
      return {photoDraft:{photo_id:input.photo_id,expected_revision:input.expected_revision,items:analysis.items}};
    }
    case 'get_action_status':
      return {action:await getActionStatus(z.object({action_id:id}).strict().parse(args).action_id)};
    case 'cancel_change': {
      const input=z.object({action_id:id}).strict().parse(args);
      if(input.action_id!==context.activeActionId)throw new VisionError('현재 화면의 작업만 취소할 수 있습니다',409);
      const action=await getActionStatus(input.action_id);
      if(action.revision!==context.activeActionRevision)throw new VisionError('변경안이 달라졌습니다. 최신 내용을 확인해주세요',409);
      return {action:await cancelChange(action.action_id,action.revision)};
    }
    case 'prepare_change': {
      const input=z.object({type:z.string(),payload_json:z.string().max(16000)}).strict().parse(args);
      let payload:unknown;
      try {payload=JSON.parse(input.payload_json);} catch {throw new VisionError('변경 내용을 읽지 못했습니다',400);}
      const change=changeSchema.parse({type:input.type,payload});
      let current;
      if(context.activeActionId) {
        current=await getActionStatus(context.activeActionId);
        if(current.revision!==context.activeActionRevision)throw new VisionError('변경안이 달라졌습니다. 최신 내용을 확인해주세요',409);
      }
      if(change.type==='register_items'&&current?.status==='prepared'&&current.type==='register_items'&&current.payload.source_photo_id) {
        change.payload.source_photo_id=current.payload.source_photo_id;
      }
      if(change.type==='register_items'&&change.payload.source_photo_id) {
        const photo=context.photoDrafts.find(draft=>draft.photo_id===change.payload.source_photo_id);
        if(photo)change.payload.source_photo_revision=photo.revision;
        if(photo?.retain&&!photo.media_id)throw new VisionError('사진을 함께 보관하려면 사진 아래 등록 내용 확인 버튼을 눌러주세요',409);
        if(photo?.retain&&photo.media_id&&Array.isArray(change.payload.items))change.payload.items=change.payload.items.map(item=>({...item,media_ids:[photo.media_id]}));
      }
      return {action:await prepareChange({...change,...(current?.status==='prepared'?{action_id:current.action_id,revision:current.revision}:{})})};
    }
    default: throw new VisionError('허용되지 않은 도구입니다',400);
  }
}
