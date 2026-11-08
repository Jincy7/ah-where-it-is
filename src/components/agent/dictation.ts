export const MAX_DICTATION_BYTES = 10 * 1024 * 1024;
export const MAX_DICTATION_MS = 60_000;
export const DICTATION_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;
export type DictationState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error';

export function supportedDictationTypes(supports: (mime: string) => boolean): string[] {
  return DICTATION_MIME_TYPES.filter(type => supports(type));
}

/** Preserve the latest typed draft and reject overflow rather than silently truncating speech. */
export function appendDictation(draft: string, transcript: string, limit = 2000) {
  const spoken = transcript.trim();
  const text = spoken ? `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}${spoken}` : draft;
  return text.length <= limit ? { text, accepted: true } : { text: draft, accepted: false };
}

type Dependencies = {
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  onState: (state: DictationState) => void;
  onError: (message: string) => void;
  onText: (text: string) => void;
  maxDurationMs?: number;
  maxBytes?: number;
  permissionTimeoutMs?: number;
  requestTimeoutMs?: number;
};

/** Owns one bounded recording; generations invalidate late permission and network responses. */
export class DictationSession {
  state: DictationState = 'idle';
  private generation = 0;
  private active = true;
  private disposed = false;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private request: AbortController | null = null;
  private cancelPermission: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(private readonly deps: Dependencies) {}

  private transition(state: DictationState) { this.state = state; if (!this.disposed) this.deps.onState(state); }
  private valid(token: number) { return !this.disposed && this.active && token === this.generation; }
  private timer(callback: () => void, duration: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, duration);
    this.timers.add(timer);
    return timer;
  }
  private clearTimer(timer: ReturnType<typeof setTimeout>) { clearTimeout(timer); this.timers.delete(timer); }
  private stopTracks() { this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; }
  private release() {
    this.timers.forEach(clearTimeout); this.timers.clear();
    this.cancelPermission?.(); this.cancelPermission = null;
    this.request?.abort(); this.request = null;
    const recorder = this.recorder; this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* Already stopped. */ } }
    }
    this.stopTracks();
  }
  private fail(message: string) {
    this.generation++;
    this.release();
    if (!this.disposed) this.deps.onError(message);
    this.transition('error');
  }
  setActive(active: boolean) { this.active = active; if (!active) this.cancel(); }
  cancel() {
    this.generation++;
    this.release();
    if (!this.disposed) this.deps.onError('');
    this.transition('idle');
  }
  dispose() { this.disposed = true; this.cancel(); }

  async start(): Promise<boolean> {
    if (!this.active || this.disposed || !['idle', 'error'].includes(this.state)) return false;
    this.release();
    const token = ++this.generation;
    this.deps.onError('');
    this.transition('requesting');
    const permissionTimer = this.timer(() => { if (this.valid(token)) this.fail('마이크 권한을 확인하지 못했습니다. 권한을 허용한 뒤 다시 눌러주세요.'); }, this.deps.permissionTimeoutMs ?? 30_000);
    try {
      // Browsers may leave their permission promise unresolved indefinitely. Finish
      // our attempt on cancellation, while still releasing any late native stream.
      const stream = await new Promise<MediaStream | null>((resolve, reject) => {
        this.cancelPermission = () => resolve(null);
        this.deps.getUserMedia().then(stream => {
          if (!this.valid(token)) { stream.getTracks().forEach(track => track.stop()); resolve(null); }
          else resolve(stream);
        }, reject);
      });
      this.clearTimer(permissionTimer);
      if (!this.valid(token) || !stream) { stream?.getTracks().forEach(track => track.stop()); return false; }
      this.cancelPermission = null;
      this.stream = stream;
      const recorder = this.deps.createRecorder(stream);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      const limit = this.deps.maxBytes ?? MAX_DICTATION_BYTES;
      recorder.ondataavailable = event => {
        if (!this.valid(token) || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > limit) { this.fail('음성 파일이 10MB를 넘었습니다. 더 짧게 나누어 입력해주세요.'); return; }
        chunks.push(event.data);
        if (bytes === limit && this.state === 'recording') this.stop();
      };
      recorder.onerror = () => { if (this.valid(token)) this.fail('녹음을 계속하지 못했습니다. 마이크를 확인하고 다시 시도해주세요.'); };
      recorder.onstop = () => {
        if (!this.valid(token)) return;
        this.stopTracks();
        void this.transcribe(token, chunks, recorder.mimeType);
      };
      recorder.start(1000);
      this.transition('recording');
      this.timer(() => { if (this.valid(token)) this.stop(); }, this.deps.maxDurationMs ?? MAX_DICTATION_MS);
      return true;
    } catch (reason) {
      if (this.valid(token)) {
        const name = reason instanceof Error ? reason.name : '';
        this.fail(name === 'NotAllowedError' || name === 'SecurityError'
          ? '마이크 권한이 필요합니다. 브라우저 설정에서 허용하거나 직접 입력해주세요.'
          : name === 'NotFoundError' ? '사용할 수 있는 마이크를 찾지 못했습니다.'
          : reason instanceof Error ? reason.message : '음성 입력을 시작하지 못했습니다. 다시 시도해주세요.');
      }
      return false;
    }
  }

  stop() {
    if (this.state !== 'recording' || !this.recorder) return;
    this.transition('transcribing');
    this.timers.forEach(clearTimeout); this.timers.clear();
    try { if (this.recorder.state !== 'inactive') this.recorder.stop(); }
    catch { this.fail('녹음을 마무리하지 못했습니다. 다시 시도해주세요.'); }
    finally { this.stopTracks(); }
  }

  private async transcribe(token: number, chunks: Blob[], recorderMime: string) {
    this.timers.forEach(clearTimeout); this.timers.clear();
    this.transition('transcribing');
    const mime = recorderMime || chunks.find(chunk => chunk.type)?.type || '';
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) { this.fail('녹음된 소리가 없습니다. 다시 입력해주세요.'); return; }
    if (!mime) { this.fail('녹음 형식을 확인하지 못했습니다. 다른 브라우저에서 시도해주세요.'); return; }
    if (blob.size > (this.deps.maxBytes ?? MAX_DICTATION_BYTES)) { this.fail('음성 파일이 너무 큽니다. 더 짧게 나누어 입력해주세요.'); return; }
    const controller = new AbortController(); this.request = controller;
    const timeout = this.timer(() => controller.abort(), this.deps.requestTimeoutMs ?? 90_000);
    try {
      const response = await this.deps.fetch('/api/agent/transcribe', { method: 'POST', headers: { 'Content-Type': mime }, body: blob, signal: controller.signal });
      const body: { text?: unknown; error?: unknown } = await response.json();
      if (!this.valid(token)) return;
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : '음성을 글로 바꾸지 못했습니다. 다시 시도해주세요.');
      if (typeof body.text !== 'string' || !body.text.trim()) throw new Error('인식된 말이 없습니다. 다시 입력해주세요.');
      this.deps.onText(body.text.trim());
      this.transition('idle');
    } catch (reason) {
      if (this.valid(token)) this.fail(controller.signal.aborted ? '음성 변환 시간이 초과되었습니다. 다시 시도해주세요.' : reason instanceof Error ? reason.message : '음성을 변환하지 못했습니다. 다시 시도해주세요.');
    } finally {
      this.clearTimer(timeout);
      if (this.valid(token)) { this.request = null; this.recorder = null; }
    }
  }
}

type DraftBufferOptions = {
  readDraft: () => string;
  writeDraft: (text: string) => void;
  onOverflow: (transcript: string) => void;
  schedule: (callback: () => void) => () => void;
};

/** Composition commits may emit a final change after compositionend. Read the draft at flush time. */
export class DictationDraftBuffer {
  private composing = false;
  private pending: string[] = [];
  private cancelScheduled: (() => void) | null = null;
  constructor(private readonly options: DraftBufferOptions) {}
  get hasPending() { return this.pending.length > 0; }
  beginComposition() { this.composing = true; this.cancelScheduled?.(); this.cancelScheduled = null; }
  endComposition() { this.composing = false; this.scheduleFlush(); }
  enqueue(text: string) {
    if (text.trim()) this.pending.push(text.trim());
    this.scheduleFlush();
  }
  private scheduleFlush() {
    if (this.composing || !this.pending.length) return;
    this.cancelScheduled?.();
    this.cancelScheduled = this.options.schedule(() => { this.cancelScheduled = null; this.flush(); });
  }
  flush() {
    this.cancelScheduled?.(); this.cancelScheduled = null;
    if (this.composing || !this.pending.length) return;
    const transcript = this.pending.join(' ');
    const result = appendDictation(this.options.readDraft(), transcript);
    if (!result.accepted) { this.options.onOverflow(transcript); return; }
    this.pending = [];
    this.options.writeDraft(result.text);
  }
  clear() { this.cancelScheduled?.(); this.cancelScheduled = null; this.pending = []; }
}
