import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  buildSearchIndex,
  searchArchiveIndex,
  type ArchiveRecord,
  type ArchiveDataset,
} from '../lib/archive';
import FlowingMenu from './FlowingMenu';

const FALLBACK_IMAGE = '/images/og-default.png';

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

export default function ResearchDiscovery({
  dataset,
  initialQuery = '',
  initialFilter = 'all',
}: ResearchDiscoveryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const deferredQuery = useDeferredValue(query);

  // Read ?q=, ?filter= from the URL on first mount so deep-links from
  // the Maps concept facet (and elsewhere) land on a pre-filtered view.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get('q');
    const urlFilter = params.get('filter');
    if (urlQuery) setQuery(urlQuery);
    if (urlFilter && FILTERS.some((f) => f.id === urlFilter as FilterId)) {
      setFilter(urlFilter as FilterId);
    }
  }, []);

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

      {/* Results — flowing marquee list of all matching posts */}
      {filtered.length > 0 ? (
        <FlowingMenu
          items={filtered.map((record) => ({
            link: `/posts/${record.slug}`,
            text: record.title,
            image: record.heroImage ?? FALLBACK_IMAGE,
          }))}
          itemHeight="92px"
          speed={22}
          textColor="#F0EDE3"
          bgColor="transparent"
          marqueeBgColor="#C5A017"
          marqueeTextColor="#070B1D"
          borderColor="rgba(138,155,168,0.16)"
        />
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
