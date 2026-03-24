import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const numeralRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const excerptRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const cardEl = cardRef.current;
    if (!section || !cardEl) return;

    const ctx = gsap.context(() => {
      // Main timeline scrubbed by scroll
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom bottom',
          scrub: 0.8,
          onUpdate: (self) => {
            // Navigate when user scrolls to 95%+
            if (self.progress > 0.95) {
              section.dataset.ready = 'true';
            } else {
              section.dataset.ready = 'false';
            }
          },
        },
      });

      // Divider line expands
      if (lineRef.current) {
        tl.fromTo(
          lineRef.current,
          { scaleX: 0, opacity: 0 },
          { scaleX: 1, opacity: 1, duration: 0.15, ease: 'power2.out' },
          0
        );
      }

      // Label fades in
      if (labelRef.current) {
        tl.fromTo(
          labelRef.current,
          { opacity: 0, y: '1vh' },
          { opacity: 0.5, y: 0, duration: 0.15, ease: 'power2.out' },
          0.05
        );
      }

      // Background image reveals
      if (bgRef.current) {
        tl.fromTo(
          bgRef.current,
          { scale: 1.15, opacity: 0 },
          { scale: 1, opacity: 0.15, duration: 0.6, ease: 'power2.out' },
          0.1
        );
      }

      // Card container scales up from depth
      tl.fromTo(
        cardEl,
        { scale: 0.85, y: '8vh', opacity: 0, filter: 'blur(12px)' },
        { scale: 1, y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out' },
        0.15
      );

      // Numeral floats in
      if (numeralRef.current) {
        tl.fromTo(
          numeralRef.current,
          { y: '4vh', opacity: 0, scale: 0.9 },
          { y: 0, opacity: 0.15, scale: 1, duration: 0.4, ease: 'power2.out' },
          0.2
        );
      }

      // Title slides up
      if (titleRef.current) {
        tl.fromTo(
          titleRef.current,
          { y: '3vh', opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
          0.3
        );
      }

      // Meta info
      if (metaRef.current) {
        tl.fromTo(
          metaRef.current,
          { y: '2vh', opacity: 0 },
          { y: 0, opacity: 0.5, duration: 0.3, ease: 'power2.out' },
          0.4
        );
      }

      // Excerpt
      if (excerptRef.current) {
        tl.fromTo(
          excerptRef.current,
          { y: '2vh', opacity: 0 },
          { y: 0, opacity: 0.6, duration: 0.3, ease: 'power2.out' },
          0.45
        );
      }

      // CTA
      if (ctaRef.current) {
        tl.fromTo(
          ctaRef.current,
          { opacity: 0, scale: 0.8 },
          { opacity: 0.7, scale: 1, duration: 0.25, ease: 'back.out(1.5)' },
          0.55
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  const handleClick = () => {
    window.location.href = `/posts/${slug}`;
  };

  return (
    <section
      ref={sectionRef}
      onClick={handleClick}
      className="relative w-full cursor-pointer overflow-hidden"
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, transparent 0%, rgba(7,11,29,0.97) 8vw, rgba(7,11,29,1) 100%)',
      }}
    >
      {/* Expanding divider line */}
      <div
        ref={lineRef}
        className="mx-auto"
        style={{
          width: '40vw',
          maxWidth: '60vw',
          height: '1px',
          marginTop: '4vh',
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          opacity: 0.4,
          transformOrigin: 'center',
        }}
      />

      {/* Label */}
      <span
        ref={labelRef}
        className="block text-center"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(0.55rem, 0.6vw, 0.7rem)',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--color-muted-silver)',
          marginTop: '2.5vh',
          opacity: 0,
        }}
      >
        Next in spiral
      </span>

      {/* Background hero image */}
      {heroImage && (
        <div
          ref={bgRef}
          className="absolute inset-0 -z-10"
          style={{ opacity: 0 }}
        >
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: 'saturate(0.4) brightness(0.5)' }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center 40%, transparent 10%, rgba(7,11,29,0.92) 60%, rgba(7,11,29,1) 100%)',
            }}
          />
        </div>
      )}

      {/* Next post card */}
      <div
        ref={cardRef}
        className="relative mx-auto text-center"
        style={{
          maxWidth: '50vw',
          paddingLeft: '4vw',
          paddingRight: '4vw',
          paddingTop: '6vh',
          paddingBottom: '10vh',
          opacity: 0,
        }}
      >
        {/* Card numeral */}
        {card && (
          <span
            ref={numeralRef}
            className="block font-bold leading-none"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(3rem, 8vw, 10rem)',
              color: accentColor,
              opacity: 0,
              marginBottom: '1.5vh',
            }}
          >
            {card}
          </span>
        )}

        {/* Card name */}
        {cardName && (
          <div ref={metaRef} style={{ opacity: 0 }}>
            <span
              className="block"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(0.6rem, 0.7vw, 0.75rem)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: accentColor,
                opacity: 0.7,
                marginBottom: '2vh',
              }}
            >
              {cardName}
            </span>
          </div>
        )}

        {/* Title */}
        <h2
          ref={titleRef}
          className="font-semibold leading-[1.1] mx-auto"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 3.5vw, 3.2rem)',
            color: 'var(--color-parchment)',
            maxWidth: '42vw',
            marginBottom: '2vh',
            opacity: 0,
          }}
        >
          {title}
        </h2>

        {/* Hero phase */}
        {heroPhase && (
          <span
            className="block"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(0.55rem, 0.6vw, 0.65rem)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--color-muted-silver)',
              opacity: 0.5,
              marginBottom: '2.5vh',
            }}
          >
            {heroPhase}
          </span>
        )}

        {/* Excerpt */}
        {excerpt && (
          <p
            ref={excerptRef}
            className="mx-auto leading-relaxed"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'clamp(0.8rem, 0.95vw, 1rem)',
              color: 'var(--color-muted-silver)',
              maxWidth: '35vw',
              opacity: 0,
            }}
          >
            {excerpt}
          </p>
        )}

        {/* CTA */}
        <div
          ref={ctaRef}
          className="inline-flex items-center gap-[0.8vw]"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'clamp(0.6rem, 0.65vw, 0.7rem)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: accentColor,
            marginTop: '4vh',
            opacity: 0,
          }}
        >
          <span
            className="inline-block"
            style={{
              width: '2vw',
              height: '1px',
              background: accentColor,
            }}
          />
          Enter
          <span
            className="inline-block"
            style={{
              width: '2vw',
              height: '1px',
              background: accentColor,
            }}
          />
        </div>
      </div>
    </section>
  );
}
