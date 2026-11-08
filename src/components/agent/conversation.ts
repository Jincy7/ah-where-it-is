export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

// Timeline IDs belong to the UI. The agent API accepts only role/content pairs.
export function conversationHistory(messages: ConversationMessage[]) {
  return messages.slice(-12).map(({ role, content }) => ({
    role,
    content: content.slice(0, 4000),
  }));
}
