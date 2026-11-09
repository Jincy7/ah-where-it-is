import 'server-only';
import { z } from 'zod';
import { analysisSchema } from '@/lib/ai/schema';
import { readOwnedMedia } from '@/lib/storage/media';
import { storageContext } from '@/lib/storage/service';
import { consumeQuota, userProviderKey } from '@/lib/ai/server';
import { analyzeOpenAIImage } from '@/lib/ai/openai';
import { analyzeImage } from '@/lib/ai/gemini';
import { cancelChange, getActionStatus, getContainer, getLocation, listContainers, listLocations, prepareChange, searchItems } from '@/lib/storage/service';
import { changeSchema } from '@/lib/storage/schema';
import { VisionError } from '@/lib/ai/gemini';
import { agentChangeTypes, mapToolArgumentsSchema, type AgentContext, type ToolName } from './contracts';
import { getStorageMap, resolveStorageMap } from '@/lib/storage/map-service';
import { createStorageMapView, type StorageMapTarget } from '@/lib/storage/map-types';
import { matchStorageNames } from './container-lookup';

const id = z.string().uuid();
async function mapForLookup(target: StorageMapTarget) {
  try {
    const scene = await resolveStorageMap(target);
    const mapView = createStorageMapView(scene, target);
    return { mapView };
  } catch {
    // A failed map refresh must not erase a successful inventory lookup.
    return { mapError: '보관 기록은 확인했지만 지도를 불러오지 못했습니다. 지도를 다시 열어 확인해주세요.' };
  }
}

export async function executeStorageTool(name: ToolName, args: Record<string,unknown>, context:AgentContext) {
  switch(name) {
    case 'search_items': {
      const input=z.object({query:z.string().trim().min(1).max(100),container_id:id.nullable()}).strict().parse(args);
      const items=await searchItems(input.query,input.container_id ?? undefined);
      if(items.length)return {items,...await mapForLookup({kind:'item',id:items[0].id})};
      const [containers,locations]=await Promise.all([listContainers(),listLocations()]);
      const matches=matchStorageNames(input.query,containers);
      const locationMatches=matchStorageNames(input.query,locations);
      return matches.length || locationMatches.length ? {
        items,
        container_matches: matches.map(container=>({id:container.id,name:container.name,location_name:container.location_name,item_count:container.item_count})),
        location_matches: locationMatches,
        hint:'물품 검색 결과는 없지만 이름이 일치하는 장소 또는 보관함이 있습니다. 장소와 보관함은 서로 다른 계층입니다. location_matches는 get_location, container_matches는 get_container로 내용물을 조회하세요. 빈 물품 목록으로 부모 기록이 없다고 답하지 말고, 여러 대상이 일치하면 구분을 요청하세요.',
      } : {items};
    }
    case 'list_locations':
      z.object({}).strict().parse(args);
      return {locations:await listLocations()};
    case 'get_location': {
      const {location_id}=z.object({location_id:id}).strict().parse(args);
      return {...await getLocation(location_id),...await mapForLookup({kind:'location',id:location_id})};
    }
    case 'list_containers':
      z.object({}).strict().parse(args);
      return {containers:await listContainers()};
    case 'get_container': {
      const {container_id}=z.object({container_id:id}).strict().parse(args);
      return {...await getContainer(container_id),...await mapForLookup({kind:'container',id:container_id})};
    }
    case 'show_storage_map': {
      const parsed=mapToolArgumentsSchema.safeParse(args);
      if(!parsed.success)throw new VisionError('지도에서 찾을 대상을 확인해주세요',400);
      const input=parsed.data;
      const target=input.kind==='all'?undefined:input;
      const scene=target?await resolveStorageMap(target):await getStorageMap();
      return {mapView:createStorageMapView(scene,target)};
    }
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
      if(context.activeActionLocked)throw new VisionError('저장 결과를 확인 중입니다. 같은 작업의 결과를 먼저 확인해주세요',409);
      const input=z.object({action_id:id}).strict().parse(args);
      if(input.action_id!==context.activeActionId)throw new VisionError('현재 화면의 작업만 취소할 수 있습니다',409);
      const action=await getActionStatus(input.action_id);
      if(action.revision!==context.activeActionRevision)throw new VisionError('변경안이 달라졌습니다. 최신 내용을 확인해주세요',409);
      return {action:await cancelChange(action.action_id,action.revision)};
    }
    case 'prepare_change': {
      if(context.activeActionLocked)throw new VisionError('저장 결과를 확인 중입니다. 같은 작업의 결과를 먼저 확인해주세요',409);
      const parsed=z.object({type:z.enum(agentChangeTypes),payload_json:z.string().max(16000)}).strict().safeParse(args);
      if(!parsed.success)throw new VisionError('허용되지 않은 변경 요청입니다',400);
      const input=parsed.data;
      let payload:unknown;
      try {payload=JSON.parse(input.payload_json);} catch {throw new VisionError('변경 내용을 읽지 못했습니다',400);}
      const change=changeSchema.parse({type:input.type,payload});
      let current;
      if(context.activeActionId) {
        current=await getActionStatus(context.activeActionId);
        if(current.revision!==context.activeActionRevision)throw new VisionError('변경안이 달라졌습니다. 최신 내용을 확인해주세요',409);
        if(current.status==='prepared'&&current.type==='save_storage_map')throw new VisionError('지도 변경안이 준비되어 있습니다. 화면에서 확정하거나 취소한 뒤 다른 변경을 요청해주세요',409);
      }
      if(change.type==='register_items'&&current?.status==='prepared'&&current.type==='register_items'&&current.payload.source_photo_id&&!change.payload.source_photo_id) {
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
