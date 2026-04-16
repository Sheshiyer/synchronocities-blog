import { startTransition, useDeferredValue, useEffect, useState } from 'react';

import {
  ARCHIVE_PRESET_DEFINITIONS,
  filterArchiveRecords,
  parseArchivePreset,
  type ArchiveDataset,
  type ArchivePresetId,
  type ArchiveRecord,
} from '../lib/archive.ts';

interface ArchiveDiscoveryProps {
  dataset: ArchiveDataset;
}

function isMapEntry(record: ArchiveRecord) {
  return record.entryKind === 'hub' || record.entryKind === 'reference';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatKind(record: ArchiveRecord) {
  if (record.card) {
    return `Travel Arc ${record.card}`;
  }

  if (record.entryKind === 'hub') {
    return 'Hub';
  }

  if (record.entryKind === 'reference') {
    return 'Reference';
  }

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

function updateBrowserUrl(preset?: ArchivePresetId, topic?: string, query?: string) {
  const params = new URLSearchParams(window.location.search);

  if (preset) {
    params.set('preset', preset);
  } else {
    params.delete('preset');
  }

  if (topic) {
    params.set('topic', topic);
  } else {
    params.delete('topic');
  }

  if (query?.trim()) {
    params.set('q', query.trim());
  } else {
    params.delete('q');
  }

  const nextSearch = params.toString();
  const nextUrl = nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname;
  window.history.replaceState({}, '', nextUrl);
}

export default function ArchiveDiscovery({ dataset }: ArchiveDiscoveryProps) {
  const [isInteractive, setIsInteractive] = useState(false);
  const [activePreset, setActivePreset] = useState<ArchivePresetId | undefined>();
  const [activeTopic, setActiveTopic] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialPreset = parseArchivePreset(params.get('preset'));
    const initialTopic = params.get('topic')?.trim() || undefined;
    const initialQuery = params.get('q')?.trim() || '';

    setActivePreset(initialPreset);
    setActiveTopic(initialTopic);
    setQuery(initialQuery);
    setIsInteractive(true);
  }, []);

  useEffect(() => {
    if (!isInteractive) {
      return;
    }

    updateBrowserUrl(activePreset, activeTopic, deferredQuery);
  }, [activePreset, activeTopic, deferredQuery, isInteractive]);

  const hasActiveFilters = Boolean(activePreset || activeTopic || deferredQuery.trim());
  const filteredRecords = filterArchiveRecords(dataset, {
    preset: activePreset,
    topic: activeTopic,
    query: deferredQuery,
  });

  const defaultLibraryRecords = dataset.records
    .filter((record) => !record.card && !isMapEntry(record))
    .sort((left, right) => right.date.localeCompare(left.date));
  const defaultMapRecords = dataset.records
    .filter(isMapEntry)
    .sort((left, right) => right.date.localeCompare(left.date));
  const visibleMapRecords = hasActiveFilters ? [] : defaultMapRecords;
  const visibleRows = hasActiveFilters ? filteredRecords : defaultLibraryRecords;
  const visibleTopics = dataset.topicFacets.slice(0, 36);

  return (
    <div className="space-y-12">
      <section
        style={{
          padding: '0 6vw',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2vw',
            marginBottom: '3vh',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(0.6rem, 0.65vw, 0.7rem)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--color-sacred-gold)',
              opacity: 0.6,
              whiteSpace: 'nowrap',
            }}
          >
            Discovery Controls
          </span>
          <div
            style={{
              flex: 1,
              height: '1px',
              background: 'linear-gradient(90deg, rgba(197,160,23,0.2), transparent)',
            }}
          />
        </div>

        <div
          style={{
            border: '1px solid rgba(138,155,168,0.12)',
            background: 'linear-gradient(180deg, rgba(14,20,40,0.82), rgba(7,11,29,0.94))',
            borderRadius: '1rem',
            padding: '1.25rem',
            boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              {ARCHIVE_PRESET_DEFINITIONS.map((preset) => {
                const active = preset.id === activePreset;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!isInteractive}
                    onClick={() => {
                      startTransition(() => {
                        setActivePreset(active ? undefined : preset.id);
                      });
                    }}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      padding: '0.7rem 0.9rem',
                      borderRadius: '999px',
                      border: active
                        ? '1px solid rgba(197,160,23,0.45)'
                        : '1px solid rgba(138,155,168,0.16)',
                      background: active ? 'rgba(197,160,23,0.14)' : 'rgba(14,20,40,0.5)',
                      color: active ? 'var(--color-sacred-gold)' : 'var(--color-muted-silver)',
                      opacity: isInteractive ? 1 : 0.55,
                      cursor: isInteractive ? 'pointer' : 'not-allowed',
                    }}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: '0.9rem',
              }}
            >
              <label
                style={{
                  display: 'grid',
                  gap: '0.45rem',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--color-muted-silver)',
                    opacity: 0.75,
                  }}
                >
                  Search The Library
                </span>
                <input
                  type="search"
                  value={query}
                  disabled={!isInteractive}
                  suppressHydrationWarning
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    startTransition(() => {
                      setQuery(nextValue);
                    });
                  }}
                  placeholder={isInteractive ? 'Search titles, concepts, tags, and clusters' : 'Interactive search activates when JavaScript is available'}
                  style={{
                    width: '100%',
                    borderRadius: '0.9rem',
                    border: '1px solid rgba(138,155,168,0.18)',
                    background: 'rgba(7,11,29,0.72)',
                    color: 'var(--color-parchment)',
                    padding: '0.95rem 1rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.98rem',
                    opacity: isInteractive ? 1 : 0.7,
                  }}
                />
              </label>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}
              >
                {visibleTopics.map(({ topic, count }) => {
                  const active = topic === activeTopic;
                  return (
                    <button
                      key={topic}
                      type="button"
                      disabled={!isInteractive}
                      onClick={() => {
                        startTransition(() => {
                          setActiveTopic(active ? undefined : topic);
                        });
                      }}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        padding: '0.55rem 0.8rem',
                        borderRadius: '999px',
                        border: active
                          ? '1px solid rgba(16,181,167,0.4)'
                          : '1px solid rgba(138,155,168,0.14)',
                        background: active ? 'rgba(16,181,167,0.1)' : 'rgba(14,20,40,0.42)',
                        color: active ? 'var(--color-coherence-emerald)' : 'var(--color-muted-silver)',
                        opacity: isInteractive ? 1 : 0.6,
                        cursor: isInteractive ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {topic}
                      <span style={{ marginLeft: '0.4rem', opacity: 0.5 }}>{count}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={!isInteractive || !hasActiveFilters}
                  onClick={() => {
                    startTransition(() => {
                      setActivePreset(undefined);
                      setActiveTopic(undefined);
                      setQuery('');
                    });
                  }}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    padding: '0.55rem 0.8rem',
                    borderRadius: '999px',
                    border: '1px solid rgba(198,93,59,0.2)',
                    background: 'rgba(198,93,59,0.08)',
                    color: 'var(--color-terracotta)',
                    opacity: isInteractive && hasActiveFilters ? 0.9 : 0.35,
                    cursor: isInteractive && hasActiveFilters ? 'pointer' : 'not-allowed',
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '0.8rem',
                alignItems: 'center',
                borderTop: '1px solid rgba(138,155,168,0.12)',
                paddingTop: '0.9rem',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--color-muted-silver)',
                  fontSize: '0.92rem',
                  opacity: 0.8,
                  maxWidth: '50rem',
                }}
              >
                {hasActiveFilters
                  ? `${filteredRecords.length} matching archive record${filteredRecords.length === 1 ? '' : 's'}. Presets, topics, and search terms compose together.`
                  : 'Browse the full library below. Interactive controls activate after the page hydrates; the default archive remains browsable without them.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {visibleMapRecords.length > 0 && (
        <section
          style={{
            padding: '0 6vw',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2vw',
              marginBottom: '4vh',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(0.6rem, 0.65vw, 0.7rem)',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: 'var(--color-sacred-gold)',
                opacity: 0.6,
                whiteSpace: 'nowrap',
              }}
            >
              Maps & Indexes
            </span>
            <div
              style={{
                flex: 1,
                height: '1px',
                background: 'linear-gradient(90deg, rgba(197,160,23,0.2), transparent)',
              }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
            }}
          >
            {visibleMapRecords.map((record) => (
              <a
                key={record.slug}
                href={`/posts/${record.slug}`}
                style={{
                  display: 'grid',
                  gap: '0.8rem',
                  padding: '1.1rem',
                  borderRadius: '1rem',
                  border: '1px solid rgba(138,155,168,0.14)',
                  background: 'linear-gradient(180deg, rgba(14,20,40,0.72), rgba(7,11,29,0.96))',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--color-coherence-emerald)',
                      opacity: 0.8,
                    }}
                  >
                    {formatKind(record)}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      color: 'var(--color-muted-silver)',
                      opacity: 0.55,
                    }}
                  >
                    {record.series ?? 'entry route'}
                  </span>
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.25rem',
                    lineHeight: 1.15,
                    color: 'var(--color-parchment)',
                  }}
                >
                  {record.title}
                </h3>

                {record.excerpt && (
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.95rem',
                      lineHeight: 1.65,
                      color: 'var(--color-muted-silver)',
                      opacity: 0.78,
                      maxWidth: 'none',
                    }}
                  >
                    {record.excerpt}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.45rem',
                  }}
                >
                  {record.concepts.slice(0, 3).map((concept) => (
                    <span
                      key={`${record.slug}-${concept}`}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        padding: '0.4rem 0.55rem',
                        borderRadius: '999px',
                        border: '1px solid rgba(138,155,168,0.14)',
                        color: 'var(--color-muted-silver)',
                        opacity: 0.7,
                      }}
                    >
                      {concept}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section
        style={{
          padding: '0 6vw 8vh',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2vw',
            marginBottom: '4vh',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(0.6rem, 0.65vw, 0.7rem)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--color-sacred-gold)',
              opacity: 0.6,
              whiteSpace: 'nowrap',
            }}
          >
            {hasActiveFilters ? 'Filtered Archive' : 'Research Library'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(0.55rem, 0.6vw, 0.65rem)',
              color: 'var(--color-muted-silver)',
              opacity: 0.3,
            }}
          >
            {visibleRows.length}
          </span>
          <div
            style={{
              flex: 1,
              height: '1px',
              background: 'linear-gradient(90deg, rgba(197,160,23,0.2), transparent)',
            }}
          />
        </div>

        {visibleRows.length > 0 ? (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {visibleRows.map((record) => (
              <a
                key={record.slug}
                href={`/posts/${record.slug}`}
                style={{
                  display: 'grid',
                  gap: '0.85rem',
                  padding: '1rem 1.1rem',
                  borderRadius: '0.9rem',
                  border: '1px solid rgba(138,155,168,0.1)',
                  background: 'rgba(14,20,40,0.36)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    alignItems: 'baseline',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.55rem',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: record.card ? 'var(--color-sacred-gold)' : 'var(--color-coherence-emerald)',
                        opacity: 0.8,
                      }}
                    >
                      {formatKind(record)}
                    </span>
                    {record.readTimeMinutes ? (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.7rem',
                          color: 'var(--color-muted-silver)',
                          opacity: 0.55,
                        }}
                      >
                        {record.readTimeMinutes} min
                      </span>
                    ) : null}
                    {record.sectionCount > 0 ? (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.7rem',
                          color: 'var(--color-muted-silver)',
                          opacity: 0.45,
                        }}
                      >
                        {record.sectionCount} sections
                      </span>
                    ) : null}
                  </div>

                  <time
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      color: 'var(--color-muted-silver)',
                      opacity: 0.45,
                    }}
                  >
                    {formatDate(record.date)}
                  </time>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '0.55rem',
                  }}
                >
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.25rem',
                      lineHeight: 1.1,
                      color: 'var(--color-parchment)',
                    }}
                  >
                    {record.title}
                  </h3>

                  {record.excerpt ? (
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.98rem',
                        lineHeight: 1.68,
                        color: 'var(--color-muted-silver)',
                        opacity: 0.8,
                        maxWidth: 'none',
                      }}
                    >
                      {record.excerpt}
                    </p>
                  ) : null}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.45rem',
                  }}
                >
                  {(record.concepts.length > 0 ? record.concepts : record.tags).slice(0, 4).map((topic) => (
                    <span
                      key={`${record.slug}-${topic}`}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        padding: '0.42rem 0.58rem',
                        borderRadius: '999px',
                        border: '1px solid rgba(138,155,168,0.12)',
                        color: 'var(--color-muted-silver)',
                        opacity: 0.74,
                      }}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div
            style={{
              border: '1px solid rgba(138,155,168,0.12)',
              borderRadius: '1rem',
              padding: '1.2rem',
              background: 'rgba(14,20,40,0.45)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--color-muted-silver)',
                opacity: 0.82,
                maxWidth: 'none',
              }}
            >
              No archive records matched that combination yet. Clear one of the active filters or broaden the search terms.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
