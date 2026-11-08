import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMessage } from '../src/components/storage-workspace/chat-message';

const render = (content: string, role: 'user' | 'assistant' = 'assistant') => renderToStaticMarkup(createElement(ChatMessage, { content, role }));

test('assistant replies render emphasis, separate paragraphs, and semantic nested lists', () => {
  const html = render('**공구함**에서 *충전기*를 찾았어요.\n\n마지막 기록 위치예요.\n\n- 책상\n  - 서랍\n\n1. 확인하기\n2. 옮기기');
  assert.match(html, /<strong>공구함<\/strong>/);
  assert.match(html, /<em>충전기<\/em>/);
  assert.equal((html.match(/<p(?:\s|>)/g) ?? []).length, 2);
  assert.equal((html.match(/<ul(?:\s|>)/g) ?? []).length, 2);
  assert.match(html, /<ol(?:\s|>)/);
  assert.equal((html.match(/<li(?:\s|>)/g) ?? []).length, 4);
  assert.doesNotMatch(html, /\*\*공구함\*\*/);
});

test('inline and fenced code remain literal and escaped', () => {
  const html = render('`**물품**`을 확인하세요.\n\n```html\n<script>alert("test")</script>\n```');
  assert.match(html, /<code[^>]*>\*\*물품\*\*<\/code>/);
  assert.match(html, /<pre[^>]*><code[^>]*>&lt;script&gt;/);
  assert.doesNotMatch(html, /<script[\s>]/i);
});

test('raw HTML and executable URLs cannot become interactive content', () => {
  const html = render('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[위험](javascript:alert%281%29) [변형](java&#x73;cript:alert%281%29) [파일](data:text/html;base64,PHNjcmlwdD4=)');
  assert.doesNotMatch(html, /<(?:img|script|iframe|svg)[\s>]/i);
  assert.doesNotMatch(html, /\shref=/);
  assert.match(html, /위험/);
  assert.match(html, /변형/);
  assert.match(html, /파일/);
});

test('safe links remain accessible and markdown images do not load remote assets', () => {
  const html = render('[도움말](https://example.com/help) [보관함](/storage?container=example)\n\n![등록 당시 사진](https://example.com/tracking.png)');
  assert.match(html, /href="https:\/\/example.com\/help"/);
  assert.match(html, /href="\/storage\?container=example"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /새 탭/);
  assert.match(html, /등록 당시 사진/);
  assert.doesNotMatch(html, /<(?:img|link)[\s>]/i);
  assert.doesNotMatch(html, /tracking\.png/);
});

test('user messages preserve their exact plain-text Markdown and escape HTML', () => {
  const html = render('**강조 문법**\n<script>직접 입력</script>', 'user');
  assert.match(html, /\*\*강조 문법\*\*/);
  assert.match(html, /&lt;script&gt;직접 입력&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<(?:strong|script)[\s>]/i);
  assert.match(html, /whitespace-pre-wrap/);
});
