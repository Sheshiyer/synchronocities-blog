import { useEffect, useState } from 'react';

type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

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

export default function PostTOC() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('#post-reading');
    if (!root) return;

    const headings = Array.from(root.querySelectorAll<HTMLElement>('h2, h3'));
    if (!headings.length) {
      setItems([]);
      setActiveId('');
      return;
    }

    const usedIds = new Map<string, number>();
    const tocItems = headings.map((heading) => {
      const text = (heading.textContent || '').trim();
      const existingId = heading.id.trim();
      const id = existingId || createSlug(text, usedIds);
      if (!heading.id) {
        heading.id = id;
      }

      return {
        id,
        text: text || 'Section',
        level: heading.tagName === 'H2' ? 2 : 3,
      };
    });

    const updateActive = () => {
      // Walk headings in order; pick the last one whose top has scrolled
      // past the active band threshold (160px from viewport top).
      // If none have, leave activeId empty so the TOC isn't falsely
      // highlighting the first heading on initial load.
      let currentId = '';

      for (const item of tocItems) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= 160) {
          currentId = item.id;
        } else {
          break;
        }
      }

      setActiveId(currentId);
    };

    setItems(tocItems);
    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, []);

  if (!items.length) {
    return null;
  }

  return (
    <aside
      aria-label="Table of contents"
      style={{
        border: '1px solid rgba(197, 160, 23, 0.18)',
        borderRadius: '1rem',
        background: 'rgba(5, 9, 24, 0.68)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
        padding: 'clamp(0.55rem, 2vw, 0.9rem)',
        color: 'var(--color-muted-silver)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '0.8rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.68rem',
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          opacity: 0.7,
        }}
      >
        <span>On this page</span>
        <span>{items.length} sections</span>
      </div>

      <nav>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' }}>
          {items.map((item) => {
            const isActive = item.id === activeId;

            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={isActive ? 'location' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.65rem',
                    padding: item.level === 3 ? '0.25rem 0 0.25rem 0.75rem' : '0.25rem 0',
                    borderRadius: '0.75rem',
                    color: isActive ? 'rgba(242, 241, 236, 0.98)' : 'inherit',
                    textDecoration: 'none',
                    fontSize: item.level === 3 ? '0.84rem' : '0.92rem',
                    lineHeight: 1.35,
                    opacity: isActive ? 1 : 0.8,
                    borderLeft: item.level === 3 ? '1px solid rgba(197, 160, 23, 0.16)' : 'none',
                    background: isActive ? 'rgba(197, 160, 23, 0.08)' : 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '0.45rem',
                      height: '0.45rem',
                      borderRadius: '9999px',
                      background: isActive ? 'var(--color-sacred-gold)' : 'rgba(197, 160, 23, 0.35)',
                      flex: '0 0 auto',
                      marginTop: '0.3rem',
                    }}
                  />
                  <span style={{ flex: '1 1 auto' }}>{item.text}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
