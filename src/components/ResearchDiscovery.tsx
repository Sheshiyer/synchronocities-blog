import { useDeferredValue, useMemo, useState } from 'react';
import {
  buildSearchIndex,
  searchArchiveIndex,
  type ArchiveRecord,
  type ArchiveDataset,
} from '../lib/archive';

interface ResearchDiscoveryProps {
  dataset: ArchiveDataset;
  initialQuery?: string;
  initialFilter?: FilterId;
}

type FilterId =
  | 'all'
  | 'foundational'
  | 'pilot'
  | 'hub'
  | 'reference'
  | 'signal-essay'
  | 'field-note';

const FILTERS: ReadonlyArray<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'foundational', label: 'Foundational' },
  { id: 'pilot', label: 'Downstream Mind' },
  { id: 'signal-essay', label: 'Signal Essays' },
  { id: 'field-note', label: 'Field Notes' },
  { id: 'hub', label: 'Hubs' },
  { id: 'reference', label: 'References' },
];

function recordMatchesFilter(record: ArchiveRecord, filter: FilterId): boolean {
  if (filter === 'all') return true;
  if (filter === 'foundational') return record.foundational === true;
  if (filter === 'pilot') return record.tags?.includes('downstream-mind') ?? false;
  if (filter === 'hub') return record.entryKind === 'hub';
  if (filter === 'reference') return record.entryKind === 'reference';
  if (filter === 'signal-essay') return record.articleMode === 'signal-essay';
  if (filter === 'field-note') return record.articleMode === 'field-note';
  return true;
}

function formatKind(record: ArchiveRecord): string {
  if (record.card) return `Travel Arc ${record.card}`;
  if (record.entryKind === 'hub') return 'Hub';
  if (record.entryKind === 'reference') return 'Reference';
  switch (record.articleMode) {
    case 'signal-essay':
      return 'Signal Essay';
    case 'field-note':
      return 'Field Note';
    case 'research-essay':
      return 'Research Essay';
    default:
      return 'Essay';
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ResearchDiscovery({
  dataset,
  initialQuery = '',
  initialFilter = 'all',
}: ResearchDiscoveryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const deferredQuery = useDeferredValue(query);

  const searchIndex = useMemo(
    () => buildSearchIndex(dataset.records),
    [dataset.records],
  );

  const filtered = useMemo(() => {
    const trimmed = deferredQuery.trim();
    let results: ArchiveRecord[];

    if (trimmed.length === 0) {
      results = dataset.records;
    } else {
      const hits = searchArchiveIndex(searchIndex, trimmed);
      const slugSet = new Set(hits.map((h) => h.slug));
      results = dataset.records.filter((r) => slugSet.has(r.slug));
    }

    return results
      .filter((r) => recordMatchesFilter(r, filter))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dataset.records, deferredQuery, filter, searchIndex]);

  const total = dataset.records.length;
  const visible = filtered.length;

  return (
    <div className="grid gap-10">
      {/* Search input — command-line style, no card panel */}
      <div className="grid gap-3">
        <div className="flex items-baseline justify-between border-b border-[rgba(197,160,23,0.22)] pb-3">
          <span
            className="text-[0.62rem] uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.32em',
              color: 'var(--color-sacred-gold)',
              opacity: 0.72,
            }}
          >
            Search the library
          </span>
          <span
            className="text-[0.62rem] tabular-nums uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.18em',
              color: 'var(--color-muted-silver)',
              opacity: 0.42,
            }}
          >
            {visible === total
              ? `${total} entries`
              : `${visible} of ${total}`}
          </span>
        </div>

        <label className="grid gap-2">
          <div className="flex items-center gap-3 border-b border-[rgba(138,155,168,0.22)] pb-3 transition-colors focus-within:border-[var(--color-sacred-gold)]">
            <span
              aria-hidden="true"
              className="text-[0.95rem] tabular-nums"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-coherence-emerald)',
                opacity: 0.62,
              }}
            >
              &gt;
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="title, concept, tag, cluster"
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-transparent text-base text-[var(--color-parchment)] placeholder:text-[var(--color-muted-silver)]/40 focus:outline-none"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="shrink-0 text-[0.7rem] uppercase transition-colors hover:text-[var(--color-sacred-gold)]"
                style={{
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.22em',
                  color: 'var(--color-muted-silver)',
                  opacity: 0.6,
                }}
              >
                clear
              </button>
            )}
          </div>
        </label>

        {/* Filter chips — text-link style, not pill cards */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          {FILTERS.map(({ id, label }) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className="text-[0.7rem] uppercase transition-colors"
                style={{
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.22em',
                  color: active
                    ? 'var(--color-sacred-gold)'
                    : 'var(--color-muted-silver)',
                  opacity: active ? 1 : 0.6,
                  borderBottom: active
                    ? '1px solid var(--color-sacred-gold)'
                    : '1px solid transparent',
                  paddingBottom: '0.2rem',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results — flat list of all matching posts */}
      {filtered.length > 0 ? (
        <ul className="grid gap-0">
          {filtered.map((record, idx) => (
            <li key={record.slug}>
              <a
                href={`/posts/${record.slug}`}
                className="group grid grid-cols-12 gap-x-4 gap-y-1 border-t border-[rgba(138,155,168,0.1)] py-4 transition-transform duration-300 hover:translate-x-1"
              >
                <span
                  className="col-span-2 text-[0.62rem] tabular-nums sm:col-span-1"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-sacred-gold)',
                    opacity: 0.5,
                  }}
                >
                  {String(idx + 1).padStart(3, '0')}
                </span>
                <div className="col-span-10 sm:col-span-7 lg:col-span-8">
                  <h3
                    className="text-[0.98rem] leading-snug text-[var(--color-parchment)] transition-colors duration-300 group-hover:text-[var(--color-sacred-gold)]"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 500,
                    }}
                  >
                    {record.title}
                  </h3>
                  {record.excerpt && (
                    <p
                      className="mt-1 line-clamp-2 max-w-[68ch] text-[0.85rem] leading-snug"
                      style={{
                        fontFamily: 'var(--font-body)',
                        color: 'var(--color-muted-silver)',
                        opacity: 0.6,
                      }}
                    >
                      {record.excerpt}
                    </p>
                  )}
                </div>
                <span
                  className="col-span-6 mt-1 text-[0.6rem] uppercase sm:col-span-2 sm:mt-0 lg:col-span-2"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.18em',
                    color: 'var(--color-muted-silver)',
                    opacity: 0.5,
                  }}
                >
                  {formatKind(record)}
                </span>
                <time
                  className="col-span-6 mt-1 text-right text-[0.6rem] tabular-nums sm:col-span-2 sm:mt-0 sm:text-left lg:col-span-1"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-muted-silver)',
                    opacity: 0.4,
                  }}
                >
                  {formatDate(record.date)}
                </time>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="border-t border-[rgba(138,155,168,0.12)] py-12 text-center"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-muted-silver)',
            opacity: 0.45,
          }}
        >
          <p className="text-[0.9rem]">No entries match.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
            className="mt-3 text-[0.7rem] uppercase transition-colors hover:text-[var(--color-sacred-gold)]"
            style={{ letterSpacing: '0.22em' }}
          >
            Reset →
          </button>
        </div>
      )}
    </div>
  );
}
