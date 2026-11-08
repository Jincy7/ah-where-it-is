'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentInstructions, type AgentContext, type ToolEvent } from '@/lib/agent/contracts';

type VoiceState='idle'|'connecting'|'listening'|'working'|'speaking'|'error';
type Options={context:AgentContext;active:boolean;onEvent:(event:ToolEvent)=>void;onTranscript:(role:'user'|'assistant',text:string)=>void};

export function useVoice(options:Options) {
  const [state,setState]=useState<VoiceState>('idle');
  const [error,setError]=useState('');
  const [muted,setMuted]=useState(false);
  const current=useRef(options);
  const peer=useRef<RTCPeerConnection|null>(null);
  const channel=useRef<RTCDataChannel|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const audio=useRef<HTMLAudioElement|null>(null);
  const generation=useRef(0);
  const abort=useRef<AbortController|null>(null);
  const timers=useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop=useCallback(()=>{
    generation.current++;
    abort.current?.abort();abort.current=null;
    timers.current.forEach(clearTimeout);timers.current=[];
    channel.current?.close();channel.current=null;
    peer.current?.close();peer.current=null;
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
    if(audio.current){audio.current.pause();audio.current.srcObject=null;audio.current=null;}
    setState('idle');setMuted(false);
  },[]);
  const fail=useCallback((message:string)=>{stop();setError(message);setState('error');},[stop]);
  useEffect(()=>{
    current.current=options;
    if(channel.current?.readyState==='open') channel.current.send(JSON.stringify({type:'session.update',session:{type:'realtime',instructions:agentInstructions(options.context)}}));
  },[options]);
  useEffect(()=>{if(!options.active) stop();},[options.active,stop]);
  useEffect(()=>stop,[stop]);

  const start=useCallback(async()=>{
    if(!current.current.active)return;
    stop();setError('');setState('connecting');
    const token=generation.current;
    const controller=new AbortController();abort.current=controller;
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined') {fail('이 브라우저에서는 음성을 사용할 수 없습니다. 텍스트로 계속해주세요.');return;}
    try {
      const media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;
      const connection=new RTCPeerConnection();peer.current=connection;
      const speaker=document.createElement('audio');speaker.autoplay=true;audio.current=speaker;
      connection.ontrack=event=>{speaker.srcObject=event.streams[0];void speaker.play().catch(()=>fail('음성 재생을 시작하지 못했습니다. 다시 연결해주세요.'));};
      media.getTracks().forEach(track=>connection.addTrack(track,media));
      const dc=connection.createDataChannel('oai-events');channel.current=dc;
      const seen=new Set<string>();
      let toolRounds=0;
      const send=(event:unknown)=>{if(token===generation.current&&dc.readyState==='open')dc.send(JSON.stringify(event));};
      const connectTimer=setTimeout(()=>{if(token===generation.current)fail('음성 연결 시간이 초과되었습니다. 다시 시도해주세요.');},30000);
      timers.current.push(connectTimer);
      dc.onopen=()=>{
        if(token!==generation.current)return;
        clearTimeout(connectTimer);setState('listening');
        timers.current.push(setTimeout(()=>{if(token===generation.current){stop();setError('10분이 지나 음성 연결을 종료했습니다. 필요하면 다시 시작해주세요.');}},10*60*1000));
      };
      dc.onclose=()=>{if(token===generation.current)fail('음성 연결이 종료되었습니다. 초안은 유지됩니다. 다시 연결하거나 텍스트로 계속해주세요.');};
      connection.onconnectionstatechange=()=>{
        if(token===generation.current&&['failed','disconnected'].includes(connection.connectionState))fail('음성 연결이 끊겼습니다. 초안은 유지됩니다.');
      };
      dc.onmessage=async event=>{
        if(token!==generation.current)return;
        let data:Record<string,unknown>;
        try{data=JSON.parse(event.data);}catch{return;}
        if(data.type==='error'){fail('음성 요청을 처리하지 못했습니다. 다시 연결하거나 텍스트로 계속해주세요.');return;}
        if(data.type==='input_audio_buffer.speech_started'){toolRounds=0;setState('listening');return;}
        if(data.type==='input_audio_buffer.speech_stopped'){setState('working');return;}
        if(data.type==='output_audio_buffer.started'){setState('speaking');return;}
        if(data.type==='output_audio_buffer.stopped'){setState('listening');return;}
        if(data.type==='conversation.item.input_audio_transcription.completed'&&typeof data.transcript==='string')current.current.onTranscript('user',data.transcript);
        if(data.type==='response.output_audio_transcript.done'&&typeof data.transcript==='string')current.current.onTranscript('assistant',data.transcript);
        if(data.type!=='response.done')return;
        const response=data.response as {output?:Array<{type:string;name:string;call_id:string;arguments:string}>;status?:string}|undefined;
        if(response?.status==='failed'){fail('음성 응답에 실패했습니다. 텍스트로 계속해주세요.');return;}
        if(response?.status!=='completed'){if(response?.status!=='cancelled')fail('음성 응답을 완료하지 못했습니다. 텍스트로 계속해주세요.');return;}
        const calls=response?.output?.filter(item=>item.type==='function_call'&&!seen.has(item.call_id))??[];
        if(!calls.length)return;
        if(++toolRounds>5){fail('한 번의 음성 요청에서 처리할 수 있는 작업 수를 넘었습니다. 결과를 확인하고 다시 요청해주세요.');return;}
        if(calls.length>4){fail('음성 요청이 너무 복잡합니다. 한 작업씩 요청해주세요.');return;}
        setState('working');
        for(const call of calls){
          seen.add(call.call_id);
          try{
            const result=await fetch('/api/agent/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:call.name,arguments:JSON.parse(call.arguments),context:current.current.context}),signal:controller.signal});
            const body=await result.json();
            if(token!==generation.current)return;
            if(!result.ok){fail(body.error||'기록을 확인하지 못했습니다. 텍스트로 계속해주세요.');return;}
            else {current.current.onEvent(body as ToolEvent);send({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(body.result)}});}
          }catch{
            if(token===generation.current)fail('도구 연결에 실패했습니다. 현재 변경안을 확인하고 텍스트로 계속해주세요.');
            return;
          }
        }
        send({type:'response.create'});
      };
      const offer=await connection.createOffer();await connection.setLocalDescription(offer);
      if(token!==generation.current)return;
      const result=await fetch('/api/agent/realtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,context:current.current.context}),signal:controller.signal});
      if(!result.ok){const body=await result.json();throw new Error(body.error||'음성 연결에 실패했습니다');}
      const sdp=await result.text();
      if(token!==generation.current)return;
      await connection.setRemoteDescription({type:'answer',sdp});
    }catch(reason){if(token===generation.current)fail(reason instanceof DOMException&&reason.name==='NotAllowedError'?'마이크 권한이 필요합니다. 브라우저 설정에서 허용하거나 텍스트로 계속해주세요.':reason instanceof Error?reason.message:'음성을 연결하지 못했습니다.');}
  },[fail,stop]);
  const toggleMute=()=>{const next=!muted;stream.current?.getAudioTracks().forEach(track=>track.enabled=!next);setMuted(next);};
  return {state,error,muted,start,stop,toggleMute};
}
