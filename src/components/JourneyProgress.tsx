interface JourneyProgressProps {
  cards: Array<{ numeral: string; accentColor: string; slug: string }>;
  currentCard: string;
}

export default function JourneyProgress({ cards, currentCard }: JourneyProgressProps) {
  return (
    <nav className="journey-progress" aria-label="Journey progress">
      {cards.map((card, i) => (
        <span key={card.numeral} style={{ display: 'contents' }}>
          {i > 0 && <span className="journey-dot-line" />}
          <a
            href={`/posts/${card.slug}`}
            className={`journey-dot ${card.numeral === currentCard ? 'active' : ''}`}
            style={card.numeral === currentCard ? { background: card.accentColor, color: card.accentColor } : {}}
            title={card.numeral}
            aria-current={card.numeral === currentCard ? 'step' : undefined}
          />
        </span>
      ))}
    </nav>
  );
}
