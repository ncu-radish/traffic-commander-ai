import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import { API_BASE } from '../config/api';
import './ChatPanel.css';

const CHAT_ENDPOINT = `${API_BASE}/chat/`;

/** Seeded What-if prompts — lowers friction during a live demo. */
const QUICK_PROMPTS = [
  '若 BL17 人數增至 40,000 人，應觸發哪些條款？',
  '光復南路封閉時，主疏散路徑該選哪一條？為何排除其他？',
  '目前是否觸發 SOP 第 6 條多語化通報？',
];

interface ChatPanelProps {
  /** Segment selected on the map; offered as context for the next question. */
  focusedSegmentId?: string | null;
  /** Current timeline position, sent so answers align with what's on screen. */
  currentTimestamp?: string;
}

export default function ChatPanel({
  focusedSegmentId,
  currentTimestamp,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'system-1',
      role: 'system',
      content:
        '牽牽 已就緒。可詢問當前交通狀況，或提出假設性情境（What-if）。回覆將引用 SOP 條款。',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  // A map selection moves the caret here so the operator can just type.
  useEffect(() => {
    if (focusedSegmentId) inputRef.current?.focus();
  }, [focusedSegmentId]);

  const send = async (text: string) => {
    const userContent = text.trim();
    if (!userContent || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date().toISOString(),
    };

    // Snapshot history before appending, matching the previous contract.
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Prefix screen context so replies track the visible timeline state.
    const contextParts: string[] = [];
    if (currentTimestamp) contextParts.push(`當前時間：${currentTimestamp}`);
    if (focusedSegmentId) contextParts.push(`關注路段：${focusedSegmentId}`);
    const message = contextParts.length
      ? `[${contextParts.join('，')}]\n${userContent}`
      : userContent;

    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toISOString(),
          sopReferences: data.sop_references,
        },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            '無法連線至 AI 服務。請確認後端已啟動，且 LLM_PROVIDER 設定正確（.env）。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const showQuickPrompts = messages.length <= 1 && !isTyping;

  return (
    <div className="chat">
      <div className="chat__header">
        <span className="dot dot--live" />
        策略諮詢顧問
        {focusedSegmentId && (
          <span className="chat__context badge badge-info" title="來自地圖選取">
            {focusedSegmentId}
          </span>
        )}
      </div>

      <div className="chat__scroll scroll-y" ref={scrollRef}>
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}

        {isTyping && (
          <div className="chat__thinking">
            <span className="spinner" />
            <span>檢索 SOP 並推理中…</span>
          </div>
        )}

        {showQuickPrompts && (
          <div className="chat__prompts">
            <span className="chat__prompts-label">建議提問</span>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                className="chat__prompt"
                onClick={() => send(p)}
                disabled={isTyping}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat__composer">
        <input
          ref={inputRef}
          type="text"
          className="input chat__input"
          placeholder="輸入問題或假設情境…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
          aria-label="輸入問題"
        />
        <button
          className="btn btn-primary"
          onClick={() => send(input)}
          disabled={!input.trim() || isTyping}
        >
          發送
        </button>
      </div>
    </div>
  );
}

/* ─── Message ─────────────────────────────────────────────────── */

function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'system') {
    return <div className="chat__system">{message.content}</div>;
  }

  const isUser = message.role === 'user';

  return (
    <div className={`chat__msg ${isUser ? 'chat__msg--user' : 'chat__msg--ai'}`}>
      {!isUser && <span className="chat__msg-role">牽牽</span>}
      <div className="chat__msg-body">
        {isUser ? (
          message.content
        ) : (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {message.sopReferences && message.sopReferences.length > 0 && (
        <div className="chat__msg-refs">
          {message.sopReferences.map((ref) => (
            <span key={ref} className="badge badge-info">
              {ref}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
