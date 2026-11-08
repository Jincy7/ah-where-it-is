'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AssistantPanelProps, PhotoDraftUpdate } from '@/components/storage-workspace/contracts';
import type { AgentReply, ToolEvent } from '@/lib/agent/contracts';
import type { StorageAction, WorkspaceItem } from '@/lib/storage/types';
import { useVoice } from './use-voice';

type Message={role:'user'|'assistant';content:string};
const labels={idle:'음성 대기',connecting:'음성 연결 중',listening:'듣는 중',working:'기록 확인 중',speaking:'말하는 중',error:'음성 연결 실패'};
export function AssistantPanel(props:AssistantPanelProps) {
  const [messages,setMessages]=useState<Message[]>([]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [error,setError]=useState('');
  const context=useMemo(()=>({selectedContainerId:props.selectedContainerId,searchScope:props.searchScope,registrationContainerId:props.registrationContainerId,activeActionId:props.activeAction?.action_id??null,activeActionRevision:props.activeAction?.revision??null,photoDrafts:props.photoDrafts??[]}),[props.selectedContainerId,props.searchScope,props.registrationContainerId,props.activeAction?.action_id,props.activeAction?.revision,props.photoDrafts]);
  const onEvent=useCallback((event:ToolEvent)=>{
    const result=event.result as {items?:WorkspaceItem[];action?:StorageAction;photoDraft?:PhotoDraftUpdate};
    if(result.photoDraft&&props.onPhotoDraft&&!props.onPhotoDraft(result.photoDraft))setError('사진 후보가 바뀌어 정정을 적용하지 못했습니다. 현재 내용을 확인해주세요.');
    if(result.items)props.onSearchResults(result.items);
    if(result.action)props.onAction(result.action);
  },[props]);
  const onTranscript=useCallback((role:'user'|'assistant',content:string)=>setMessages(previous=>[...previous,{role,content}].slice(-30)),[]);
  const voice=useVoice({context,active:props.active??true,onEvent,onTranscript});
  const connected=!['idle','error'].includes(voice.state);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(props.active===false||!input.trim()||busyRef.current)return;
    const message=input.trim();setError('');setBusy(true);busyRef.current=true;
    // Voice and text share tools, but run one conversational request at a time.
    voice.stop();setMessages(previous=>[...previous,{role:'user',content:message}]);setInput('');
    try{
      const response=await fetch('/api/agent/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,history:messages.slice(-12),context}),signal:AbortSignal.timeout(120000)});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'AI 도움을 연결하지 못했습니다');
      const reply=body as AgentReply;
      reply.events.forEach(onEvent);
      setMessages(previous=>[...previous,{role:'assistant' as const,content:reply.message}].slice(-30));
    }catch(reason){setError(reason instanceof Error?reason.message:'AI 도움에 실패했습니다. 다시 시도해주세요.');setInput(message);}
    finally{setBusy(false);busyRef.current=false;}
  };
  return <section className="space-y-3" aria-label="AI 도움">
    <p className="text-sm text-muted-foreground">물품을 찾거나 변경을 요청하세요. 저장·이동·삭제는 아래 확인 버튼으로 확정합니다.</p>
    {messages.length>0&&<div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border p-3" aria-live="polite" aria-label="대화 기록">{messages.map((message,index)=><div key={index} className={message.role==='user'?'ml-6 rounded-lg bg-secondary px-3 py-2 text-sm':'mr-4 whitespace-pre-wrap px-1 text-sm'}><span className="sr-only">{message.role==='user'?'나':'AI 도움'}: </span>{message.content}</div>)}</div>}
    <form onSubmit={submit} className="flex gap-2"><Input aria-label="AI 요청" value={input} onChange={event=>setInput(event.target.value)} disabled={busy||props.active===false} maxLength={2000} placeholder="예: 검은색 충전기 어디 있어?" className="min-h-11"/><Button type="submit" disabled={busy||props.active===false||!input.trim()} aria-label="요청 보내기" className="min-h-11">{busy?<Loader2 className="size-4 animate-spin"/>:<Send className="size-4"/>}<span className="hidden sm:inline">보내기</span></Button></form>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={connected?voice.stop:voice.start} disabled={busy||props.active===false} className="min-h-11">{connected?<Square className="size-4"/>:<Mic className="size-4"/>}{connected?'음성 종료':'음성 시작'}</Button>{connected&&<Button variant="outline" onClick={voice.toggleMute} className="min-h-11">{voice.muted?<MicOff className="size-4"/>:<Mic className="size-4"/>}{voice.muted?'마이크 켜기':'음소거'}</Button>}<span role="status" className="text-sm text-muted-foreground">{busy?'요청을 처리하는 중…':voice.muted?'마이크 꺼짐':labels[voice.state]}</span></div>
    <p className="text-xs text-muted-foreground">요청과 필요한 보관 기록이 OpenAI로 전송됩니다. 음성을 시작하면 마이크 소리도 전송됩니다. 답변은 AI가 생성한 음성입니다.</p>
    {(error||voice.error)&&<p role="alert" className="text-sm text-destructive">{error||voice.error} <a href="/settings" className="underline">AI 키 설정</a></p>}
  </section>;
}
