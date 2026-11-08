'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DictationSession, supportedDictationTypes, type DictationState } from './dictation';

type Options = { active: boolean; onTranscript: (text: string) => void };

export function useDictation(options: Options) {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState('');
  const current = useRef(options);
  const session = useRef<DictationSession | null>(null);
  useLayoutEffect(() => { current.current = options; });
  useEffect(() => {
    const controller = new DictationSession({
      getUserMedia: () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('이 브라우저에서는 음성 입력을 사용할 수 없습니다. 직접 입력해주세요.');
        return navigator.mediaDevices.getUserMedia({ audio: true });
      },
      createRecorder: stream => {
        const types = typeof MediaRecorder.isTypeSupported === 'function' ? supportedDictationTypes(type => MediaRecorder.isTypeSupported(type)) : [];
        for (const mimeType of types) {
          try { return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 }); } catch { /* Try another supported format. */ }
        }
        return new MediaRecorder(stream, { audioBitsPerSecond: 64_000 });
      },
      fetch: (url, init) => fetch(url, init),
      onState: setState,
      onError: setError,
      onText: text => current.current.onTranscript(text),
    });
    controller.setActive(current.current.active);
    session.current = controller;
    return () => { controller.dispose(); if (session.current === controller) session.current = null; };
  }, []);
  useEffect(() => { session.current?.setActive(options.active); }, [options.active]);
  const start = useCallback(() => session.current?.start() ?? Promise.resolve(false), []);
  const stop = useCallback(() => session.current?.stop(), []);
  const cancel = useCallback(() => session.current?.cancel(), []);
  return { state, error, busy: ['requesting', 'recording', 'transcribing'].includes(state), start, stop, cancel };
}
