-- Dictation is independent of chat turns and live voice sessions. The existing
-- atomic quota function applies its default 30 requests/hour to this scope.
alter table public.ai_usage_limits drop constraint ai_usage_limits_scope_check;
alter table public.ai_usage_limits add constraint ai_usage_limits_scope_check
  check (scope in ('analysis', 'key-write', 'chat', 'realtime', 'tool', 'transcription'));
