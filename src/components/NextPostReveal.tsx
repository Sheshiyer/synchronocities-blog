import { useEffect, useRef, useState } from 'react';

interface NextPostProps {
  title: string;
  slug: string;
  card?: string;
  cardName?: string;
  heroPhase?: string;
  accentColor?: string;
  heroImage?: string;
  excerpt?: string;
}

export default function NextPostReveal({
  title,
  slug,
  card,
  cardName,
  heroPhase,
  accentColor = 'var(--color-sacred-gold)',
  heroImage,
  excerpt,
}: NextPostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const ratio = entry.intersectionRatio;
          setProgress(Math.min(ratio * 2, 1)); // accelerate reveal

          if (ratio > 0.6 && !triggered) {
            setTriggered(true);
          }
        });
      },
      { threshold: Array.from({ length: 20 }, (_, i) => i / 20) }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [triggered]);

  const handleClick = () => {
    window.location.href = `/posts/${slug}`;
  };

  const scale = 0.92 + progress * 0.08;
  const opacity = 0.3 + progress * 0.7;
  const blur = (1 - progress) * 8;
  const translateY = (1 - progress) * 40;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="relative w-full min-h-[70vh] cursor-pointer overflow-hidden"
      style={{
        background: `linear-gradient(180deg, transparent 0%, rgba(7,11,29,0.95) 15%, rgba(7,11,29,1) 100%)`,
      }}
    >
      {/* Pull indicator */}
      <div className="flex flex-col items-center pt-12 pb-8">
        <div
          className="w-8 h-1 rounded-full mb-4 transition-all duration-300"
          style={{
            background: accentColor,
            opacity: 0.2 + progress * 0.5,
            transform: `scaleX(${0.5 + progress * 0.5})`,
          }}
        />
        <span
          className="text-[10px] uppercase tracking-[0.25em] transition-all duration-300"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-muted-silver)',
            opacity: 0.3 + progress * 0.4,
          }}
        >
          {triggered ? 'Continue reading' : 'Next in spiral'}
        </span>
      </div>

      {/* Next post card */}
      <div
        className="relative mx-auto max-w-[800px] px-6 md:px-10 transition-all duration-500 ease-out"
        style={{
          transform: `scale(${scale}) translateY(${translateY}px)`,
          opacity,
          filter: `blur(${blur}px)`,
        }}
      >
        {/* Hero image background */}
        {heroImage && (
          <div className="absolute inset-0 -z-10 rounded-2xl overflow-hidden">
            <img
              src={heroImage}
              alt=""
              className="w-full h-full object-cover"
              style={{ opacity: 0.12, filter: 'saturate(0.5)' }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at center, transparent 20%, rgba(7,11,29,0.95) 80%)`,
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="relative py-10 md:py-16 text-center">
          {/* Card numeral */}
          {card && (
            <span
              className="text-[60px] md:text-[80px] font-bold leading-none block mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                color: accentColor,
                opacity: 0.12 + progress * 0.08,
              }}
            >
              {card}
            </span>
          )}

          {/* Card name */}
          {cardName && (
            <span
              className="text-xs uppercase tracking-[0.2em] block mb-3"
              style={{
                fontFamily: 'var(--font-mono)',
                color: accentColor,
                opacity: 0.6,
              }}
            >
              {cardName}
            </span>
          )}

          {/* Title */}
          <h2
            className="text-[24px] md:text-[36px] font-semibold leading-[1.15] mb-4 mx-auto max-w-[600px]"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-parchment)',
            }}
          >
            {title}
          </h2>

          {/* Hero phase */}
          {heroPhase && (
            <span
              className="text-[10px] uppercase tracking-[0.15em] block mb-5"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-muted-silver)',
                opacity: 0.5,
              }}
            >
              {heroPhase}
            </span>
          )}

          {/* Excerpt */}
          {excerpt && (
            <p
              className="text-sm leading-relaxed mx-auto max-w-[480px]"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--color-muted-silver)',
                opacity: 0.6,
              }}
            >
              {excerpt}
            </p>
          )}

          {/* CTA hint */}
          <div
            className="mt-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] transition-all duration-300"
            style={{
              fontFamily: 'var(--font-mono)',
              color: accentColor,
              opacity: triggered ? 0.7 : 0.3,
            }}
          >
            <span
              className="inline-block w-6 h-px transition-all duration-500"
              style={{
                background: accentColor,
                transform: `scaleX(${0.5 + progress * 0.5})`,
              }}
            />
            Enter
            <span
              className="inline-block w-6 h-px transition-all duration-500"
              style={{
                background: accentColor,
                transform: `scaleX(${0.5 + progress * 0.5})`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
