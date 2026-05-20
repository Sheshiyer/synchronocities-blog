/**
 * <CorpusChat /> — RAG widget that streams answers from /chat with
 * citations to the synchronocities corpus.
 *
 * Usage (in an Astro page):
 *   <CorpusChat client:only="react" />
 *
 * Voice + UX:
 *   - Citations appear FIRST (before tokens stream) so users see sources
 *     immediately rather than waiting for the whole answer
 *   - Inline [n] markers in the answer link to the citation list above
 *   - "Stop" button cancels the stream via AbortController
 *   - History is kept in-memory only (no persistence) — page refresh wipes
 */

import { useCallback, useRef, useState } from 'react';
import { streamChat, type ChatCitation, type ChatStreamEvent } from '../lib/aiClient';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  pending?: boolean;
}

export default function CorpusChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(async () => {
    const q = input.trim();
    if (!q || busy) return;

    const userTurn: Turn = { role: 'user', content: q };
    const assistantTurn: Turn = { role: 'assistant', content: '', pending: true };

    const newTurns = [...turns, userTurn, assistantTurn];
    setTurns(newTurns);
    setInput('');
    setBusy(true);

    const history = turns
      .filter((t) => !t.pending)
      .map((t) => ({ role: t.role, content: t.content }));

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      let buffer = '';
      let citations: ChatCitation[] = [];

      for await (const evt of streamChat({ query: q, history, k: 5, signal: ac.signal })) {
        if (evt.type === 'citations') {
          citations = evt.data;
          setTurns((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1]!;
            copy[copy.length - 1] = { ...last, citations };
            return copy;
          });
        } else if (evt.type === 'token') {
          buffer += evt.data;
          setTurns((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1]!;
            copy[copy.length - 1] = { ...last, content: buffer };
            return copy;
          });
        } else if (evt.type === 'done' || evt.type === 'error') {
          setTurns((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1]!;
            copy[copy.length - 1] = {
              ...last,
              pending: false,
              content:
                evt.type === 'error' ? `Error: ${evt.data.error}` : last.content,
            };
            return copy;
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTurns((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1]!;
        copy[copy.length - 1] = { ...last, pending: false, content: `Error: ${msg}` };
        return copy;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [input, busy, turns]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
  }, []);

  return (
    <div className="corpus-chat" style={styles.container}>
      <div style={styles.history}>
        {turns.length === 0 && (
          <div style={styles.placeholder}>
            Ask anything about the corpus — concepts, posts, threads.
            <br />
            <small>Answers are grounded in the 125 posts, with citations.</small>
          </div>
        )}
        {turns.map((t, i) => (
          <TurnView key={i} turn={t} />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={styles.form}
      >
        <input
          style={styles.input}
          placeholder="What is the matched-cavity principle?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        {busy ? (
          <button type="button" onClick={stop} style={styles.button}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} style={styles.button}>
            Ask
          </button>
        )}
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div style={styles.userTurn}>
        <strong>You:</strong> {turn.content}
      </div>
    );
  }
  return (
    <div style={styles.assistantTurn}>
      {turn.citations && turn.citations.length > 0 && (
        <details style={styles.citations} open>
          <summary>Sources ({turn.citations.length})</summary>
          <ol style={{ marginTop: '0.5em' }}>
            {turn.citations.map((c) => (
              <li key={c.n}>
                <a href={`/posts/${c.slug}`} style={styles.citationLink}>
                  {c.title}
                </a>{' '}
                <small style={{ opacity: 0.6 }}>({c.similarity.toFixed(2)})</small>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div style={styles.assistantContent}>
        {turn.content || (turn.pending ? <em style={{ opacity: 0.5 }}>…</em> : '')}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '400px',
    maxHeight: '70vh',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    background: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  history: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  placeholder: {
    textAlign: 'center',
    opacity: 0.5,
    padding: '2rem',
    fontSize: '0.9rem',
  },
  userTurn: {
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '6px',
  },
  assistantTurn: {
    padding: '0.5rem 0.75rem',
  },
  citations: {
    marginBottom: '0.75rem',
    fontSize: '0.85rem',
    opacity: 0.85,
  },
  citationLink: {
    color: 'inherit',
    textDecoration: 'underline',
  },
  assistantContent: {
    whiteSpace: 'pre-wrap',
    lineHeight: 1.6,
  },
  form: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: 'inherit',
    fontSize: '0.95rem',
  },
  button: {
    padding: '0.5rem 1.25rem',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
};
