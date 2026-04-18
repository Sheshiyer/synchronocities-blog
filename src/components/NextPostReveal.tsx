import { useEffect, useRef, useState } from 'react';
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
  // Footer data
  revolution?: number;
  tags?: string[];
  returnHref?: string;
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
  revolution = 1,
  tags = [],
  returnHref = '/',
}: NextPostProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const circleTrackRef = useRef<SVGCircleElement>(null);
  const progressTextRef = useRef<HTMLSpanElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const numeralRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const excerptRef = useRef<HTMLParagraphElement>(null);
  const actionPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncMotionPreference();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', syncMotionPreference);
      return () => mediaQuery.removeEventListener('change', syncMotionPreference);
    }

    mediaQuery.addListener(syncMotionPreference);
    return () => mediaQuery.removeListener(syncMotionPreference);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const pin = pinRef.current;
    const circle = circleRef.current;
    if (!wrap || !pin) return;

    if (prefersReducedMotion) {
      if (footerRef.current) {
        footerRef.current.style.opacity = '0';
        footerRef.current.style.pointerEvents = 'none';
      }
      if (revealRef.current) {
        revealRef.current.style.clipPath = 'circle(100% at 50% 50%)';
        revealRef.current.style.transform = 'scale(1)';
      }
      if (bgRef.current) {
        bgRef.current.style.opacity = '0.26';
        bgRef.current.style.transform = 'scale(1)';
      }
      if (glowRef.current) {
        glowRef.current.style.opacity = '0.16';
        glowRef.current.style.transform = 'translate(-50%, -50%) scale(1)';
      }
      if (numeralRef.current) {
        numeralRef.current.style.opacity = '0.08';
        numeralRef.current.style.transform = 'translate(-50%, -50%)';
      }
      if (nameRef.current) {
        nameRef.current.style.opacity = '0.7';
      }
      if (titleRef.current) {
        titleRef.current.style.opacity = '1';
        titleRef.current.style.filter = 'none';
      }
      if (phaseRef.current) {
        phaseRef.current.style.opacity = '0.4';
      }
      if (excerptRef.current) {
        excerptRef.current.style.opacity = '0.5';
      }
      if (actionPanelRef.current) {
        actionPanelRef.current.style.opacity = '1';
      }

      return;
    }

    if (footerRef.current) {
      footerRef.current.style.opacity = '';
      footerRef.current.style.pointerEvents = '';
      footerRef.current.style.transform = '';
    }
    if (revealRef.current) {
      revealRef.current.style.clipPath = '';
      revealRef.current.style.transform = '';
    }
    if (bgRef.current) {
      bgRef.current.style.opacity = '';
      bgRef.current.style.transform = '';
    }
    if (glowRef.current) {
      glowRef.current.style.opacity = '';
      glowRef.current.style.transform = '';
    }
    if (numeralRef.current) {
      numeralRef.current.style.opacity = '';
      numeralRef.current.style.transform = '';
    }
    if (nameRef.current) {
      nameRef.current.style.opacity = '';
    }
    if (titleRef.current) {
      titleRef.current.style.opacity = '';
      titleRef.current.style.filter = '';
    }
    if (phaseRef.current) {
      phaseRef.current.style.opacity = '';
    }
    if (excerptRef.current) {
      excerptRef.current.style.opacity = '';
    }
    if (actionPanelRef.current) {
      actionPanelRef.current.style.opacity = '';
    }

    if (!circle) return;

    // SVG circle math
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrap,
          start: 'top top',
          end: '+=180%',
          pin: pin,
          scrub: 0.45,
          anticipatePin: 1,
          onUpdate: (self) => {
            const p = self.progress;

            // Update circle progress
            const offset = circumference - (p * circumference);
            circle.style.strokeDashoffset = `${offset}`;

            // Update percentage text
            if (progressTextRef.current) {
              progressTextRef.current.textContent = `${Math.round(p * 100)}`;
            }

            // Track opacity on circle track
            if (circleTrackRef.current) {
              circleTrackRef.current.style.opacity = `${0.08 + p * 0.12}`;
            }
          },
        },
      });

      // ── PHASE 1: Footer fades out, circle appears (0 → 0.2) ──
      if (footerRef.current) {
        tl.to(
          footerRef.current,
          { opacity: 0, y: '-4vh', duration: 0.15, ease: 'power2.in' },
          0
        );
      }

      // Glow emerges
      if (glowRef.current) {
        tl.fromTo(
          glowRef.current,
          { opacity: 0, scale: 0.4 },
          { opacity: 0.5, scale: 1.5, duration: 0.8, ease: 'power1.out' },
          0.05
        );
      }

      // ── PHASE 2: Background + numeral emerge (0.15 → 0.5) ──
      if (bgRef.current) {
        tl.fromTo(
          bgRef.current,
          { scale: 1.25, opacity: 0 },
          { scale: 1, opacity: 0.3, duration: 0.6, ease: 'power2.out' },
          0.15
        );
      }

      // Reveal layer
      if (revealRef.current) {
        tl.fromTo(
          revealRef.current,
          { clipPath: 'circle(0% at 50% 50%)' },
          { clipPath: 'circle(100% at 50% 50%)', duration: 0.6, ease: 'power2.inOut' },
          0.1
        );
      }

      // Numeral — massive, arrives from below with parallax
      if (numeralRef.current) {
        tl.fromTo(
          numeralRef.current,
          { y: '30vh', opacity: 0, scale: 0.6 },
          { y: 0, opacity: 0.12, scale: 1, duration: 0.5, ease: 'power3.out' },
          0.2
        );
        // Continue drifting up
        tl.to(
          numeralRef.current,
          { y: '-8vh', opacity: 0.08, duration: 0.5, ease: 'none' },
          0.7
        );
      }

      // ── PHASE 3: Text reveals stagger (0.35 → 0.7) ──
      if (nameRef.current) {
        tl.fromTo(
          nameRef.current,
          { y: '6vh', opacity: 0, letterSpacing: '0.6em' },
          { y: 0, opacity: 0.7, letterSpacing: '0.25em', duration: 0.25, ease: 'power2.out' },
          0.35
        );
      }

      if (titleRef.current) {
        tl.fromTo(
          titleRef.current,
          { y: '8vh', opacity: 0, filter: 'blur(6px)' },
          { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power3.out' },
          0.4
        );
      }

      if (phaseRef.current) {
        tl.fromTo(
          phaseRef.current,
          { y: '3vh', opacity: 0 },
          { y: 0, opacity: 0.4, duration: 0.2, ease: 'power2.out' },
          0.5
        );
      }

      if (excerptRef.current) {
        tl.fromTo(
          excerptRef.current,
          { y: '4vh', opacity: 0 },
          { y: 0, opacity: 0.5, duration: 0.2, ease: 'power2.out' },
          0.55
        );
      }

      if (actionPanelRef.current) {
        tl.fromTo(
          actionPanelRef.current,
          { y: '4vh', opacity: 0, scale: 0.98 },
          { y: 0, opacity: 1, scale: 1, duration: 0.22, ease: 'power2.out' },
          0.72
        );
      }

      // ── PHASE 4: Everything slowly zooms in (0.7 → 1.0) ──
      if (revealRef.current) {
        tl.to(
          revealRef.current,
          { scale: 1.08, duration: 0.3, ease: 'power1.in' },
          0.7
        );
      }
    }, wrap);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <div ref={wrapRef} style={{ height: prefersReducedMotion ? '140vh' : '240vh' }}>
      <div
        ref={pinRef}
        className="relative w-full overflow-hidden"
        style={{ height: '100dvh', background: '#050918' }}
      >
        {/* ── Footer content (fades out on scroll) ── */}
        <div
          ref={footerRef}
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 1 }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(0.6rem, 0.7vw, 0.75rem)',
              color: 'var(--color-muted-silver)',
              opacity: 0.3,
            }}
          >
            Revolution {revolution}
          </span>

          {tags.length > 0 && (
            <div
              className="flex flex-wrap justify-center"
              style={{ gap: '0.6vw', marginTop: '2vh', maxWidth: '60vw' }}
            >
              {tags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.55rem, 0.65vw, 0.7rem)',
                    padding: '0.5vh 1vw',
                    borderRadius: '9999px',
                    color: 'var(--color-muted-silver)',
                    opacity: 0.3,
                    border: `1px solid ${accentColor}18`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <a
            href={returnHref}
            className="transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(0.55rem, 0.65vw, 0.7rem)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'var(--color-muted-silver)',
              opacity: 0.35,
              marginTop: '3vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            Return to Spiral
          </a>

          {/* Scroll hint */}
          <div
            style={{
              position: 'absolute',
              bottom: '4vh',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1vh',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(0.5rem, 0.55vw, 0.6rem)',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
              color: accentColor,
              opacity: 0.3,
            }}
          >
              Choose your next path
            </span>
            <div
              style={{
                width: '1px',
                height: '3vh',
                background: `linear-gradient(180deg, ${accentColor}40, transparent)`,
              }}
            />
          </div>
        </div>

        {/* ── Circle progress indicator ── */}
        {!prefersReducedMotion && (
          <div
            className="absolute flex flex-col items-center justify-center"
            style={{
              zIndex: 4,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          >
            <svg
              width="10vw"
              height="10vw"
              viewBox="0 0 80 80"
              style={{ minWidth: '80px', minHeight: '80px', maxWidth: '120px', maxHeight: '120px' }}
            >
              {/* Track */}
              <circle
                ref={circleTrackRef}
                cx="40" cy="40" r="36"
                fill="none"
                stroke="var(--color-muted-silver)"
                strokeWidth="1"
                opacity="0.08"
              />
              {/* Progress */}
              <circle
                ref={circleRef}
                cx="40" cy="40" r="36"
                fill="none"
                stroke={accentColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{
                  transition: 'stroke-dashoffset 0.1s ease-out',
                }}
              />
            </svg>
            <span
              ref={progressTextRef}
              style={{
                position: 'absolute',
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(0.7rem, 0.8vw, 0.9rem)',
                color: accentColor,
                opacity: 0.6,
              }}
            >
              0
            </span>
          </div>
        )}

        {/* ── Ambient glow ── */}
        <div
          ref={glowRef}
          className="absolute pointer-events-none"
          style={{
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '50vw',
            height: '50vh',
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${accentColor}12 0%, ${accentColor}06 40%, transparent 70%)`,
            filter: 'blur(5vw)',
            opacity: 0,
            zIndex: 0,
          }}
        />

        {/* ── Reveal layer (clip-path animated) ── */}
        <div
          ref={revealRef}
          className="absolute inset-0"
          style={{ clipPath: 'circle(0% at 50% 50%)', zIndex: 2 }}
        >
          {/* Background image — parallax */}
          {heroImage && (
            <div
              ref={bgRef}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'transform' }}
            >
              <img
                src={heroImage}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: 'saturate(0.25) brightness(0.35)' }}
              />
            </div>
          )}

          {/* Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 50% 45%, transparent 20%, rgba(5,9,24,0.6) 50%, rgba(5,9,24,0.95) 80%)',
            }}
          />

          {/* ── Content ── */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ perspective: '100vw' }}
          >
            {/* Numeral — massive background element */}
            {card && (
              <span
                ref={numeralRef}
                className="absolute block font-bold leading-none select-none pointer-events-none"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(8rem, 25vw, 30rem)',
                  color: accentColor,
                  opacity: 0,
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {card}
              </span>
            )}

            {/* Foreground text */}
            <div
              className="relative flex flex-col items-center text-center"
              style={{ zIndex: 1, gap: '1.2vh', width: '80vw', maxWidth: '80vw' }}
            >
              {cardName && (
                <span
                  ref={nameRef}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.65rem, 0.8vw, 0.85rem)',
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    color: accentColor,
                    opacity: 0,
                  }}
                >
                  {cardName}
                </span>
              )}

              <h2
                ref={titleRef}
                className="font-semibold"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(2rem, 5.5vw, 5rem)',
                  lineHeight: 1.05,
                  color: 'var(--color-parchment)',
                  maxWidth: '70vw',
                  opacity: 0,
                }}
              >
                {title}
              </h2>

              {heroPhase && (
                <span
                  ref={phaseRef}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.55rem, 0.65vw, 0.7rem)',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'var(--color-muted-silver)',
                    opacity: 0,
                    marginTop: '0.5vh',
                  }}
                >
                  {heroPhase}
                </span>
              )}

              {excerpt && (
                <p
                  ref={excerptRef}
                  className="leading-relaxed"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'clamp(0.85rem, 1.1vw, 1.1rem)',
                    color: 'var(--color-muted-silver)',
                    maxWidth: '50vw',
                    opacity: 0,
                    marginTop: '1.5vh',
                  }}
                >
                  {excerpt}
                </p>
              )}
            </div>
          </div>

          <div
            ref={actionPanelRef}
            className="absolute left-1/2 bottom-[7vh] w-[min(90vw,46rem)] -translate-x-1/2"
            style={{
              zIndex: 4,
              opacity: 0,
              pointerEvents: 'auto',
            }}
          >
            <div
              className="flex flex-col"
              style={{
                gap: '1.4vh',
                padding: 'clamp(1rem, 2vw, 1.5rem)',
                borderRadius: '1.5rem',
                border: `1px solid ${accentColor}24`,
                background: 'linear-gradient(180deg, rgba(5, 9, 24, 0.78), rgba(5, 9, 24, 0.92))',
                boxShadow: `0 1.5rem 4rem rgba(0, 0, 0, 0.35), 0 0 0 1px ${accentColor}12 inset`,
                backdropFilter: 'blur(12px)',
              }}
            >
              <div
                className="flex flex-col"
                style={{ gap: '0.45rem' }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.55rem, 0.7vw, 0.72rem)',
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: accentColor,
                    opacity: 0.75,
                  }}
                >
                  Continue the current thread
                </span>
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-body)',
                    fontSize: 'clamp(0.88rem, 1.05vw, 1.02rem)',
                    lineHeight: 1.55,
                    color: 'var(--color-muted-silver)',
                    maxWidth: '38rem',
                  }}
                >
                  The story does not auto-advance anymore. Read next, return to the spiral, or stay with the page you just finished.
                </p>
              </div>

              <div
                className="flex flex-wrap items-center"
                style={{ gap: '0.75rem' }}
              >
                <a
                  href={`/posts/${slug}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.95rem 1.35rem',
                    borderRadius: '9999px',
                    border: `1px solid ${accentColor}`,
                    background: `linear-gradient(135deg, ${accentColor}1a, ${accentColor}0d)`,
                    color: 'var(--color-parchment)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.58rem, 0.72vw, 0.75rem)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    minWidth: '13rem',
                  }}
                >
                  Read Next
                </a>
                <a
                  href={returnHref}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.95rem 1.35rem',
                    borderRadius: '9999px',
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--color-muted-silver)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.58rem, 0.72vw, 0.75rem)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    minWidth: '13rem',
                  }}
                >
                  Back to Spiral
                </a>
                <a
                  href="#post-reading"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.95rem 1.35rem',
                    borderRadius: '9999px',
                    border: `1px solid ${accentColor}26`,
                    background: `${accentColor}0a`,
                    color: 'var(--color-muted-silver)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(0.58rem, 0.72vw, 0.75rem)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    minWidth: '13rem',
                  }}
                >
                  Stay Here
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
