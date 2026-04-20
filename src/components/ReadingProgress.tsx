import { useEffect, useState } from 'react';

interface ReadingSection {
  id: string;
  title: string;
  level: 2 | 3;
  element: HTMLElement;
}

const WORDS_PER_MINUTE = 220;

function createSlug(base: string, used: Map<string, number>) {
  const slug = base
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const safeSlug = slug || 'section';
  const count = used.get(safeSlug) ?? 0;
  used.set(safeSlug, count + 1);
  return count === 0 ? safeSlug : `${safeSlug}-${count + 1}`;
}

function getReadingMinutesLeft(totalWords: number, progress: number) {
  if (!totalWords) return null;
  const remainingWords = Math.max(0, Math.round(totalWords * (1 - progress / 100)));
  return Math.max(1, Math.ceil(remainingWords / WORDS_PER_MINUTE));
}

export default function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const [sectionTitle, setSectionTitle] = useState('');
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('#post-reading');
    if (!root) return;

    const headings = Array.from(root.querySelectorAll<HTMLElement>('h2, h3'));
    if (!headings.length) {
      setMinutesLeft(null);
      setSectionTitle('');
      return;
    }

    const usedIds = new Map<string, number>();
    const sections: ReadingSection[] = headings.map((heading) => {
      const text = (heading.textContent || '').trim();
      const existingId = heading.id.trim();
      const id = existingId || createSlug(text, usedIds);
      if (!heading.id) {
        heading.id = id;
      }

      return {
        id,
        title: text || 'Section',
        level: heading.tagName === 'H2' ? 2 : 3,
        element: heading,
      };
    });

    const totalWords = (root.textContent || '')
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean).length;

    const updateState = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const nextProgress = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
      setProgress(nextProgress);

      let activeSection = sections[0];
      for (const section of sections) {
        const top = section.element.getBoundingClientRect().top;
        if (top <= 160) {
          activeSection = section;
        } else {
          break;
        }
      }

      setSectionTitle(activeSection?.title ?? '');
      setMinutesLeft(getReadingMinutesLeft(totalWords, nextProgress));
    };

    updateState();
    window.addEventListener('scroll', updateState, { passive: true });
    window.addEventListener('resize', updateState, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateState);
      window.removeEventListener('resize', updateState);
    };
  }, []);

  const showContext = Boolean(sectionTitle || minutesLeft);

  return (
    <>
      <div className="reading-progress" style={{ width: `${progress}%` }} />

      {showContext && (
        <div
          aria-live="polite"
          className="reading-context-pill"
          style={{
            position: 'fixed',
            top: '0.8rem',
            right: '0.8rem',
            zIndex: 40,
            maxWidth: 'min(20rem, calc(100vw - 1.6rem))',
            borderRadius: '0.85rem',
            background: 'linear-gradient(135deg, rgba(197, 160, 23, 0.25), rgba(45, 0, 80, 0.35), rgba(16, 181, 167, 0.2))',
            padding: '1px',
            boxShadow: '0 0 18px rgba(197, 160, 23, 0.12), 0 0 40px rgba(45, 0, 80, 0.08), 0 16px 40px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            style={{
              padding: '0.6rem 0.85rem',
              borderRadius: 'calc(0.85rem - 1px)',
              background: 'rgba(7, 11, 29, 0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              color: 'var(--color-muted-silver)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              lineHeight: 1.4,
              letterSpacing: '0.02em',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {sectionTitle && (
                <span style={{
                  color: 'var(--color-parchment)',
                  fontWeight: 500,
                  fontSize: '0.72rem',
                }}>
                  {sectionTitle}
                </span>
              )}

              {minutesLeft !== null && (
                <span style={{
                  color: 'var(--color-sacred-gold)',
                  opacity: 0.72,
                  fontSize: '0.65rem',
                  letterSpacing: '0.06em',
                }}>
                  {minutesLeft} min left
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
