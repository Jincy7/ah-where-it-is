import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationHistory, type ConversationMessage } from '../src/components/agent/conversation';
import { chatRequestSchema } from '../src/lib/agent/contracts';

test('controlled timeline history fits the strict chat API without exposing UI IDs', () => {
  const messages: ConversationMessage[] = Array.from({ length: 20 }, (_, index) => ({
    id: `timeline-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    content: index === 19 ? '긴 음성 답변'.repeat(1000) : `메시지 ${index}`,
  }));
  const history = conversationHistory(messages);
  const request = chatRequestSchema.parse({ message: '이어서 찾아줘', history, context: {} });
  assert.equal(request.history.length, 12);
  assert.equal(request.history[0].content, '메시지 8');
  assert.equal(request.history.at(-1)?.content.length, 4000);
  assert.deepEqual(Object.keys(history[0]).sort(), ['content', 'role']);
  assert.equal(messages.length, 20);
  assert.equal(messages[19].content, '긴 음성 답변'.repeat(1000));
});
