interface JourneyProgressProps {
  cards: Array<{
    numeral: string;
    accentColor: string;
    slug: string;
    title: string;
    cardName: string;
    entryCount: number;
  }>;
  currentNumeral: string;
  currentSlug: string;
}

export default function JourneyProgress({ cards, currentNumeral, currentSlug }: JourneyProgressProps) {
  return (
    <nav className="journey-progress" aria-label="Journey progress">
      {cards.map((card, i) => {
        const isActive = card.numeral === currentNumeral || card.slug === currentSlug;
        const detailLabel = card.entryCount > 1
          ? `${card.cardName} · ${card.entryCount} linked entries`
          : `${card.cardName} · ${card.title}`;

        return (
          <span key={card.numeral} style={{ display: 'contents' }}>
            {i > 0 && <span className="journey-dot-line" />}
            <a
              href={`/posts/${card.slug}`}
              className={`journey-dot ${isActive ? 'active' : ''}`}
              style={isActive ? { background: card.accentColor, color: card.accentColor } : {}}
              title={`${card.numeral} · ${detailLabel}`}
              aria-label={`Go to ${detailLabel}`}
              aria-current={isActive ? 'step' : undefined}
            />
          </span>
        );
      })}
    </nav>
  );
}
