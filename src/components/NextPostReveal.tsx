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
  accentColor = '#C5A017',
  heroImage,
  excerpt,
}: NextPostProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const apertureRef = useRef<HTMLDivElement>(null);
  const bgLayerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const numeralRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const excerptRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const scanlineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const pin = pinRef.current;
    if (!wrap || !pin) return;

    const ctx = gsap.context(() => {
      // ─── PINNED SCROLL TIMELINE ───
      // The section pins in place while scroll drives the reveal
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrap,
          start: 'top top',
          end: '+=200%',
          pin: pin,
          scrub: 1.2,
          anticipatePin: 1,
        },
      });

      // ─── PHASE 1: Aperture opens (0 → 0.35) ───
      // Circular clip-path expands from center
      if (apertureRef.current) {
        tl.fromTo(
          apertureRef.current,
          { clipPath: 'circle(0% at 50% 50%)' },
          { clipPath: 'circle(85% at 50% 50%)', duration: 0.35, ease: 'power2.inOut' },
          0
        );
      }

      // Ambient glow pulses in
      if (glowRef.current) {
        tl.fromTo(
          glowRef.current,
          { opacity: 0, scale: 0.6 },
          { opacity: 0.6, scale: 1.2, duration: 0.4, ease: 'power1.out' },
          0.05
        );
      }

      // Background image with parallax (moves slower)
      if (bgLayerRef.current) {
        tl.fromTo(
          bgLayerRef.current,
          { scale: 1.3, y: '15vh', opacity: 0 },
          { scale: 1.05, y: '-5vh', opacity: 0.25, duration: 0.9, ease: 'none' },
          0
        );
      }

      // Vignette darkens edges
      if (vignetteRef.current) {
        tl.fromTo(
          vignetteRef.current,
          { opacity: 0.3 },
          { opacity: 0.85, duration: 0.5, ease: 'power1.in' },
          0.1
        );
      }

      // ─── PHASE 2: Typography emerges (0.25 → 0.6) ───
      // Numeral: massive, parallax at different rate
      if (numeralRef.current) {
        tl.fromTo(
          numeralRef.current,
          { y: '20vh', opacity: 0, scale: 0.7, rotateX: 15 },
          { y: '-2vh', opacity: 0.2, scale: 1, rotateX: 0, duration: 0.5, ease: 'power3.out' },
          0.2
        );
      }

      // Card name
      if (nameRef.current) {
        tl.fromTo(
          nameRef.current,
          { y: '8vh', opacity: 0, letterSpacing: '0.5em' },
          { y: 0, opacity: 0.7, letterSpacing: '0.2em', duration: 0.3, ease: 'power2.out' },
          0.32
        );
      }

      // Title — the hero moment
      if (titleRef.current) {
        tl.fromTo(
          titleRef.current,
          { y: '10vh', opacity: 0, filter: 'blur(8px)' },
          { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.35, ease: 'power3.out' },
          0.35
        );
      }

      // Phase subtitle
      if (phaseRef.current) {
        tl.fromTo(
          phaseRef.current,
          { y: '4vh', opacity: 0 },
          { y: 0, opacity: 0.45, duration: 0.2, ease: 'power2.out' },
          0.45
        );
      }

      // ─── PHASE 3: Details + CTA (0.55 → 0.8) ───
      if (excerptRef.current) {
        tl.fromTo(
          excerptRef.current,
          { y: '5vh', opacity: 0 },
          { y: 0, opacity: 0.55, duration: 0.25, ease: 'power2.out' },
          0.55
        );
      }

      // Scanline sweep
      if (scanlineRef.current) {
        tl.fromTo(
          scanlineRef.current,
          { y: '-100%', opacity: 0 },
          { y: '100%', opacity: 0.03, duration: 0.6, ease: 'none' },
          0.3
        );
      }

      if (ctaRef.current) {
        tl.fromTo(
          ctaRef.current,
          { opacity: 0, y: '2vh' },
          { opacity: 0.8, y: 0, duration: 0.2, ease: 'back.out(2)' },
          0.65
        );
      }

      // ─── PHASE 4: Final pull — everything settles (0.8 → 1.0) ───
      // Slight zoom of entire card for "falling into" effect
      if (apertureRef.current) {
        tl.to(
          apertureRef.current,
          { scale: 1.03, duration: 0.2, ease: 'power1.in' },
          0.8
        );
      }

      // Numeral continues parallax drift
      if (numeralRef.current) {
        tl.to(
          numeralRef.current,
          { y: '-6vh', opacity: 0.12, duration: 0.2, ease: 'none' },
          0.8
        );
      }
    }, wrap);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{ height: '300vh', position: 'relative' }}
    >
      <div
        ref={pinRef}
        onClick={() => { window.location.href = `/posts/${slug}`; }}
        className="relative w-full overflow-hidden cursor-pointer"
        style={{
          height: '100dvh',
          background: '#050918',
        }}
      >
        {/* ── Ambient glow ── */}
        <div
          ref={glowRef}
          className="absolute pointer-events-none"
          style={{
            top: '20%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '60vw',
            height: '60vh',
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${accentColor}18 0%, ${accentColor}08 40%, transparent 70%)`,
            filter: 'blur(4vw)',
            opacity: 0,
          }}
        />

        {/* ── Scanline sweep ── */}
        <div
          ref={scanlineRef}
          className="absolute inset-x-0 pointer-events-none"
          style={{
            height: '30vh',
            background: `linear-gradient(180deg, transparent, ${accentColor}08, transparent)`,
            opacity: 0,
          }}
        />

        {/* ── Circular aperture reveal ── */}
        <div
          ref={apertureRef}
          className="absolute inset-0"
          style={{
            clipPath: 'circle(0% at 50% 50%)',
          }}
        >
          {/* Background image — parallax layer */}
          {heroImage && (
            <div
              ref={bgLayerRef}
              className="absolute inset-0"
              style={{
                opacity: 0,
                willChange: 'transform',
              }}
            >
              <img
                src={heroImage}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: 'saturate(0.3) brightness(0.4)' }}
              />
            </div>
          )}

          {/* Vignette overlay */}
          <div
            ref={vignetteRef}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 50% 45%, transparent 25%, rgba(5,9,24,0.7) 55%, rgba(5,9,24,0.95) 80%)',
              opacity: 0.3,
            }}
          />

          {/* ── Content layer ── */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ perspective: '120vw' }}
          >
            {/* Numeral — massive, parallax */}
            {card && (
              <span
                ref={numeralRef}
                className="absolute block font-bold leading-none select-none pointer-events-none"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(6rem, 18vw, 22rem)',
                  color: accentColor,
                  opacity: 0,
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 0,
                }}
              >
                {card}
              </span>
            )}

            {/* Foreground text — centered stack */}
            <div
              className="relative flex flex-col items-center text-center"
              style={{
                zIndex: 1,
                gap: '1.5vh',
                maxWidth: '55vw',
              }}
            >
              {/* Card name */}
              {cardName && (
                <span
                  ref={nameRef}
                  className="block"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.6rem, 0.75vw, 0.8rem)',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: accentColor,
                    opacity: 0,
                  }}
                >
                  {cardName}
                </span>
              )}

              {/* Title */}
              <h2
                ref={titleRef}
                className="font-semibold"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.8rem, 4.5vw, 4rem)',
                  lineHeight: 1.08,
                  color: 'var(--color-parchment)',
                  maxWidth: '48vw',
                  opacity: 0,
                }}
              >
                {title}
              </h2>

              {/* Hero phase */}
              {heroPhase && (
                <span
                  ref={phaseRef}
                  className="block"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.55rem, 0.6vw, 0.7rem)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--color-muted-silver)',
                    opacity: 0,
                    marginTop: '0.5vh',
                  }}
                >
                  {heroPhase}
                </span>
              )}

              {/* Excerpt */}
              {excerpt && (
                <p
                  ref={excerptRef}
                  className="leading-relaxed"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'clamp(0.8rem, 1vw, 1.05rem)',
                    color: 'var(--color-muted-silver)',
                    maxWidth: '38vw',
                    opacity: 0,
                    marginTop: '1vh',
                  }}
                >
                  {excerpt}
                </p>
              )}

              {/* CTA */}
              <div
                ref={ctaRef}
                className="inline-flex items-center"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'clamp(0.6rem, 0.7vw, 0.75rem)',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: accentColor,
                  marginTop: '3vh',
                  gap: '1vw',
                  opacity: 0,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '3vw',
                    height: '1px',
                    background: `linear-gradient(90deg, transparent, ${accentColor})`,
                  }}
                />
                Enter
                <span
                  style={{
                    display: 'inline-block',
                    width: '3vw',
                    height: '1px',
                    background: `linear-gradient(90deg, ${accentColor}, transparent)`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
