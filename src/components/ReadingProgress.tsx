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
          style={{
            position: 'fixed',
            top: '0.8rem',
            right: '0.8rem',
            zIndex: 40,
            maxWidth: 'min(18rem, calc(100vw - 1.6rem))',
            padding: '0.55rem 0.75rem',
            borderRadius: '9999px',
            border: '1px solid rgba(197, 160, 23, 0.18)',
            background: 'rgba(5, 9, 24, 0.82)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.25)',
            color: 'var(--color-muted-silver)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            lineHeight: 1.3,
            letterSpacing: '0.02em',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem 0.6rem' }}>
            {sectionTitle && (
              <span style={{ color: 'rgba(242, 241, 236, 0.92)' }}>
                {sectionTitle}
              </span>
            )}

            {minutesLeft !== null && (
              <span style={{ opacity: 0.82 }}>
                {minutesLeft} min left
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
