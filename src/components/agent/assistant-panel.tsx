'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Camera, ImagePlus, ListPlus, Loader2, Mic, MicOff, Plus, Search, Send, Settings2, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import type { AssistantPanelProps, PhotoDraftUpdate } from '@/components/storage-workspace/contracts';
import type { AgentReply, ToolEvent } from '@/lib/agent/contracts';
import type { StorageMapView } from '@/lib/storage/map-types';
import type { StorageAction, WorkspaceItem } from '@/lib/storage/types';
import { conversationHistory } from './conversation';
import { useVoice } from './use-voice';
import { useDictation } from './use-dictation';
import { DictationDraftBuffer } from './dictation';

const voiceLabels = { idle: '', connecting: '음성 연결 중', listening: '듣는 중', working: '기록 확인 중', speaking: '말하는 중', error: '음성 연결 실패' };

export function AssistantPanel(props: AssistantPanelProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uninsertedTranscript, setUninsertedTranscript] = useState('');
  const [lastAudioMode, setLastAudioMode] = useState<'dictation' | 'voice' | null>(null);
  const inputValue = useRef('');
  const setDraft = useCallback((value: string) => { inputValue.current = value; setInput(value); }, []);
  const current = useRef(props);
  const mode = useRef<'idle' | 'text' | 'voice' | 'dictation'>('idle');
  const voiceAttempt = useRef(0);
  const dictationAttempt = useRef(0);
  const composing = useRef(false);
  const dictationDraft = useRef<DictationDraftBuffer | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const lastPrompt = useRef<number | undefined>(undefined);

  // Delayed text and voice responses must use the current workspace callbacks.
  useLayoutEffect(() => { current.current = props; });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      current.current.onBusyChange?.(false);
    };
  }, []);

  const context = useMemo(() => ({
    selectedContainerId: props.selectedContainerId,
    searchScope: props.searchScope,
    registrationContainerId: props.registrationContainerId,
    activeActionId: props.activeAction?.action_id ?? null,
    activeActionRevision: props.activeAction?.revision ?? null,
    activeActionLocked: props.activeActionLocked ?? false,
    photoDrafts: props.photoDrafts ?? [],
  }), [props.selectedContainerId, props.searchScope, props.registrationContainerId, props.activeAction?.action_id, props.activeAction?.revision, props.activeActionLocked, props.photoDrafts]);

  const onEvent = useCallback((event: ToolEvent) => {
    const result = event.result as { items?: WorkspaceItem[]; action?: StorageAction; photoDraft?: PhotoDraftUpdate; mapView?: StorageMapView; mapError?: string; container_matches?: unknown[]; location_matches?: unknown[] };
    if (result.photoDraft && !current.current.onPhotoDraft(result.photoDraft)) {
      setError('사진 후보가 바뀌어 정정을 적용하지 못했습니다. 현재 내용을 확인해주세요.');
    }
    const hierarchyResult = event.name === 'get_location' || event.name === 'get_container' || result.container_matches?.length || result.location_matches?.length;
    if (result.items && !(result.items.length === 0 && hierarchyResult)) current.current.onSearchResults(result.items);
    if (result.action) current.current.onAction(result.action);
    if (result.mapView) current.current.onMapView(result.mapView);
    if (result.mapError) setError(result.mapError);
  }, []);
  const onTranscript = useCallback((role: 'user' | 'assistant', content: string) => {
    if (content.trim()) current.current.onMessage({ id: crypto.randomUUID(), role, content });
  }, []);
  useEffect(() => {
    const buffer = new DictationDraftBuffer({
      readDraft: () => inputValue.current,
      writeDraft: text => {
        setDraft(text);
        setUninsertedTranscript('');
        setError('');
        textarea.current?.focus();
      },
      onOverflow: text => {
        setUninsertedTranscript(text);
        setError('입력 가능한 2,000자를 넘어 음성 내용을 추가하지 못했습니다. 작성 중인 내용을 줄인 뒤 아래 음성 내용을 확인해주세요.');
      },
      schedule: callback => { const frame = requestAnimationFrame(callback); return () => cancelAnimationFrame(frame); },
    });
    dictationDraft.current = buffer;
    return () => { buffer.clear(); if (dictationDraft.current === buffer) dictationDraft.current = null; };
  }, [setDraft]);
  useEffect(() => {
    if (props.active === false) {
      dictationDraft.current?.clear();
      dictationDraft.current?.endComposition();
      composing.current = false;
    }
  }, [props.active]);
  const onDictation = useCallback((text: string) => { dictationDraft.current?.enqueue(text); }, []);
  const dictation = useDictation({ active: props.active ?? true, onTranscript: onDictation });
  const voice = useVoice({ context, active: props.active ?? true, onEvent, onTranscript });
  const connected = !['idle', 'error'].includes(voice.state);
  const disabled = props.active === false || busy;

  useEffect(() => {
    if (!connected && mode.current === 'voice') mode.current = 'idle';
    if (!dictation.busy && mode.current === 'dictation') mode.current = 'idle';
    current.current.onBusyChange?.(busy || connected || dictation.busy);
  }, [busy, connected, voice.state, dictation.busy, dictation.state]);

  useLayoutEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (!props.prompt || props.prompt.id === lastPrompt.current) return;
    lastPrompt.current = props.prompt.id;
    if (mode.current !== 'idle' || composing.current || dictationDraft.current?.hasPending || inputValue.current.trim()) {
      setError('작성 중인 내용이 있어 추천 문구를 넣지 않았습니다. 먼저 내용을 확인해주세요.');
      return;
    }
    setDraft(props.prompt.text.slice(0, 2000));
    const frame = requestAnimationFrame(() => textarea.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [props.prompt, setDraft]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (current.current.active === false || mode.current !== 'idle' || composing.current) return;
    dictationDraft.current?.flush();
    if (!inputValue.current.trim()) return;
    const message = inputValue.current.trim();
    dictationDraft.current?.clear();
    const history = conversationHistory(current.current.messages);
    const controller = new AbortController();
    request.current = controller;
    mode.current = 'text';
    setError('');
    setLastAudioMode(null);
    setBusy(true);
    current.current.onMessage({ id: crypto.randomUUID(), role: 'user', content: message });
    setDraft('');
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, context }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!mounted.current) return;
      if (!response.ok) throw new Error(body.error || 'AI 도움을 연결하지 못했습니다');
      const reply = body as AgentReply;
      // The parent appends the result cards immediately after this answer.
      current.current.onMessage({ id: crypto.randomUUID(), role: 'assistant', content: reply.message });
      reply.events.forEach(onEvent);
    } catch (reason) {
      if (!mounted.current) return;
      setError(controller.signal.aborted ? '응답 시간이 초과되었습니다. 다시 시도해주세요.' : reason instanceof Error ? reason.message : 'AI 도움에 실패했습니다. 다시 시도해주세요.');
      if (!inputValue.current) setDraft(message);
    } finally {
      clearTimeout(timeout);
      request.current = null;
      mode.current = 'idle';
      if (mounted.current) setBusy(false);
    }
  };

  const toggleVoice = () => {
    if (mode.current === 'voice') {
      voiceAttempt.current++;
      voice.stop();
      mode.current = 'idle';
    } else if (mode.current === 'idle' && current.current.active !== false && !composing.current) {
      dictationDraft.current?.flush();
      mode.current = 'voice';
      const attempt = ++voiceAttempt.current;
      setError('');
      setLastAudioMode('voice');
      void voice.start().then(started => {
        if (!started && attempt === voiceAttempt.current && mode.current === 'voice') mode.current = 'idle';
      });
    }
  };
  const toggleDictation = () => {
    if (mode.current === 'dictation') {
      if (dictation.state === 'recording') dictation.stop();
      return;
    }
    if (mode.current !== 'idle' || current.current.active === false) return;
    mode.current = 'dictation';
    const attempt = ++dictationAttempt.current;
    setError('');
    setLastAudioMode('dictation');
    void dictation.start().then(started => {
      if (!started && attempt === dictationAttempt.current && mode.current === 'dictation') mode.current = 'idle';
    });
  };
  const cancelDictation = () => {
    dictationAttempt.current++;
    dictation.cancel();
    dictationDraft.current?.clear();
    setUninsertedTranscript('');
    if (mode.current === 'dictation') mode.current = 'idle';
    setError('');
  };
  const dictationLabel = dictation.state === 'requesting' ? '마이크 권한 확인 중' : dictation.state === 'recording' ? '녹음 중 · 최대 60초' : dictation.state === 'transcribing' ? '글로 바꾸는 중…' : '';
  const audioError = lastAudioMode === 'dictation' ? dictation.error : lastAudioMode === 'voice' ? voice.error : '';
  const hasPhotoActions = !!(props.onAttachPhoto || props.onTakePhoto);
  const hasOtherActions = !!(props.onManage || props.onDirectRegister || props.onSearch);

  return <section className="space-y-2" aria-label="메시지 입력">
    {(props.contextLabel || busy || connected || dictation.busy) && <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {props.contextLabel && <span className="min-w-0 truncate">등록 대상 · {props.contextLabel}</span>}
      <span role="status" className="ml-auto">{busy ? '답변을 준비하는 중…' : dictation.busy ? dictationLabel : connected ? voice.muted ? '음성 모드 · 마이크 꺼짐' : voiceLabels[voice.state] : ''}</span>
    </div>}
    <form onSubmit={submit} className="rounded-2xl border bg-background p-2 shadow-sm">
      <Textarea
        ref={textarea}
        aria-label="AI 요청"
        value={input}
        onChange={event => setDraft(event.target.value)}
        onCompositionStart={() => { composing.current = true; dictationDraft.current?.beginComposition(); }}
        onCompositionEnd={event => {
          setDraft(event.currentTarget.value);
          composing.current = false;
          dictationDraft.current?.endComposition();
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.nativeEvent.keyCode !== 229) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        disabled={disabled || connected}
        maxLength={2000}
        rows={1}
        placeholder="무엇을 찾거나 정리할까요?"
        className="min-h-11 max-h-40 resize-none overflow-y-auto border-0 px-2 py-3 shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center gap-1">
        {(hasPhotoActions || hasOtherActions) && <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl" disabled={disabled || connected || dictation.busy} aria-label="사진 및 작업 추가"><Plus className="size-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="min-w-44">
            {props.onAttachPhoto && <DropdownMenuItem onSelect={props.onAttachPhoto} className="min-h-11"><ImagePlus />사진 첨부</DropdownMenuItem>}
            {props.onTakePhoto && <DropdownMenuItem onSelect={props.onTakePhoto} className="min-h-11"><Camera />사진 촬영</DropdownMenuItem>}
            {hasPhotoActions && hasOtherActions && <DropdownMenuSeparator />}
            {props.onDirectRegister && <DropdownMenuItem onSelect={props.onDirectRegister} className="min-h-11"><ListPlus />직접 등록</DropdownMenuItem>}
            {props.onSearch && <DropdownMenuItem onSelect={props.onSearch} className="min-h-11"><Search />물품 찾기</DropdownMenuItem>}
            {props.onManage && <DropdownMenuItem onSelect={props.onManage} className="min-h-11"><Settings2 />보관함 관리</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>}
        <div className="ml-auto flex items-center gap-1">
          {dictation.busy && <Button type="button" variant="ghost" size="icon" onClick={cancelDictation} className="size-11 rounded-xl" aria-label="음성 입력 취소" title="음성 입력 취소"><X className="size-4" /></Button>}
          <Button type="button" variant={dictation.state === 'recording' ? 'secondary' : 'ghost'} size="icon" onClick={toggleDictation} disabled={disabled || connected || dictation.state === 'requesting' || dictation.state === 'transcribing'} className="size-11 rounded-xl" aria-label={dictation.state === 'recording' ? '음성 입력 마치기' : '음성 입력'} title={dictation.state === 'recording' ? '음성 입력 마치기' : '음성 입력'}>{dictation.state === 'requesting' || dictation.state === 'transcribing' ? <Loader2 className="size-5 animate-spin" /> : dictation.state === 'recording' ? <Square className="size-4" /> : <Mic className="size-5" />}</Button>
          {connected && <Button type="button" variant="ghost" size="icon" onClick={voice.toggleMute} disabled={disabled} className="size-11 rounded-xl" aria-label={voice.muted ? '음성 모드 마이크 켜기' : '음성 모드 마이크 음소거'} aria-pressed={voice.muted}>{voice.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}</Button>}
          <Button type="button" variant={connected ? 'secondary' : 'ghost'} onClick={toggleVoice} disabled={disabled || dictation.busy} className="h-11 gap-1.5 rounded-xl px-2 text-xs" aria-label={connected ? '음성 모드 종료' : '음성 모드'} title={connected ? '음성 모드 종료' : '음성 모드'}>{connected ? <Square className="size-4" /> : <AudioLines className="size-4" />}<span>{connected ? '종료' : '음성 모드'}</span></Button>
          <Button type="submit" size="icon" disabled={disabled || connected || dictation.busy || !input.trim()} className="size-11 rounded-xl" aria-label="요청 보내기">{busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}</Button>
        </div>
      </div>
    </form>
    <p className="px-1 text-center text-[11px] leading-relaxed text-muted-foreground">음성 입력은 녹음을 OpenAI로 보내 글로만 바꿉니다. 전송은 직접 눌러주세요. 음성 모드는 AI 음성으로 대화합니다.</p>
    {(error || audioError) && <p role="alert" className="px-1 text-sm text-destructive">{error || audioError} <a href="/settings" className="underline">AI 키 설정</a></p>}
    {uninsertedTranscript && <details className="px-1 text-sm"><summary className="cursor-pointer text-muted-foreground">추가하지 못한 음성 내용</summary><p className="mt-2 whitespace-pre-wrap break-words">{uninsertedTranscript}</p></details>}
  </section>;
}
