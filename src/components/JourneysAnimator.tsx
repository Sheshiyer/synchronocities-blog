import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function JourneysAnimator() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Wait for DOM
    requestAnimationFrame(() => {
      const ctx = gsap.context(() => {

        // ── HERO TITLE — characters split + stagger ──
        const heroTitle = document.querySelector('[data-anim="hero-title"]');
        if (heroTitle) {
          const text = heroTitle.textContent || '';
          heroTitle.innerHTML = text.split('').map((ch, i) =>
            ch === ' ' ? ' ' : `<span class="hero-char" style="display:inline-block;opacity:0;transform:translateY(1.5vh)">${ch}</span>`
          ).join('');

          gsap.to('.hero-char', {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.04,
            ease: 'power3.out',
            delay: 0.2,
          });
        }

        // ── HERO SUBTITLE — fade up ──
        gsap.from('[data-anim="hero-sub"]', {
          opacity: 0,
          y: '2vh',
          duration: 0.8,
          ease: 'power2.out',
          delay: 0.6,
        });

        // ── SECTION LABELS — line draws + text fades ──
        document.querySelectorAll('[data-anim="section-label"]').forEach((label) => {
          const line = label.querySelector('[data-anim="section-line"]');
          const text = label.querySelector('[data-anim="section-text"]');

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: label,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          });

          if (text) {
            tl.from(text, {
              opacity: 0,
              x: '-1vw',
              duration: 0.5,
              ease: 'power2.out',
            }, 0);
          }

          if (line) {
            tl.from(line, {
              scaleX: 0,
              transformOrigin: 'left center',
              duration: 0.8,
              ease: 'power2.inOut',
            }, 0.1);
          }
        });

        // ── MAJOR ARCANA CARDS — staggered reveal from depth ──
        const cards = document.querySelectorAll('[data-anim="arcana-card"]');
        cards.forEach((card, i) => {
          gsap.from(card, {
            scrollTrigger: {
              trigger: card,
              start: 'top 88%',
              toggleActions: 'play none none none',
            },
            opacity: 0,
            y: '6vh',
            scale: 0.92,
            rotateX: 8,
            filter: 'blur(4px)',
            duration: 0.7,
            delay: i * 0.08,
            ease: 'power3.out',
            clearProps: 'filter',
          });
        });

        // ── CARD NUMERAL — parallax drift on scroll ──
        document.querySelectorAll('[data-anim="card-numeral"]').forEach((num) => {
          gsap.to(num, {
            scrollTrigger: {
              trigger: num,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1.5,
            },
            y: '-3vh',
            ease: 'none',
          });
        });

        // ── TOPICS — stagger pop ──
        const topics = document.querySelectorAll('[data-anim="topic"]');
        if (topics.length > 0) {
          gsap.from(topics, {
            scrollTrigger: {
              trigger: topics[0],
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
            opacity: 0,
            scale: 0.85,
            y: '1vh',
            duration: 0.4,
            stagger: 0.03,
            ease: 'back.out(2)',
          });
        }

        // ── WRITINGS LIST — staggered slide-in with scroll ──
        const rows = document.querySelectorAll('[data-anim="writing-row"]');
        rows.forEach((row, i) => {
          gsap.from(row, {
            scrollTrigger: {
              trigger: row,
              start: 'top 92%',
              toggleActions: 'play none none none',
            },
            opacity: 0,
            x: i % 2 === 0 ? '-2vw' : '2vw',
            duration: 0.5,
            delay: Math.min(i * 0.03, 0.3),
            ease: 'power2.out',
          });
        });

        // ── WRITING TITLES — scale on hover ──
        rows.forEach((row) => {
          const title = row.querySelector('[data-anim="writing-title"]');
          if (!title) return;

          row.addEventListener('mouseenter', () => {
            gsap.to(title, {
              scale: 1.02,
              x: '0.5vw',
              color: '#C5A017',
              duration: 0.35,
              ease: 'power2.out',
            });
          });

          row.addEventListener('mouseleave', () => {
            gsap.to(title, {
              scale: 1,
              x: 0,
              color: '#F0EDE3',
              duration: 0.3,
              ease: 'power2.inOut',
            });
          });
        });

        // ── CARD HOVER — title tracking + glow pulse ──
        cards.forEach((card) => {
          const titleEl = card.querySelector('[data-anim="card-title"]');
          const numEl = card.querySelector('[data-anim="card-numeral"]');

          card.addEventListener('mouseenter', () => {
            if (titleEl) {
              gsap.to(titleEl, {
                letterSpacing: '0.02em',
                textShadow: '0 0 2vw rgba(197,160,23,0.15)',
                duration: 0.4,
                ease: 'power2.out',
              });
            }
            if (numEl) {
              gsap.to(numEl, {
                scale: 1.08,
                opacity: 0.25,
                duration: 0.5,
                ease: 'power2.out',
              });
            }
          });

          card.addEventListener('mouseleave', () => {
            if (titleEl) {
              gsap.to(titleEl, {
                letterSpacing: '0em',
                textShadow: 'none',
                duration: 0.3,
                ease: 'power2.inOut',
              });
            }
            if (numEl) {
              gsap.to(numEl, {
                scale: 1,
                opacity: 0.12,
                duration: 0.4,
                ease: 'power2.inOut',
              });
            }
          });
        });

        // ── SCROLL-BASED TITLE SCALE — hero title shrinks as you scroll ──
        if (heroTitle) {
          gsap.to(heroTitle, {
            scrollTrigger: {
              trigger: heroTitle,
              start: 'top top+=15%',
              end: 'bottom top',
              scrub: 1,
            },
            scale: 0.85,
            opacity: 0.3,
            y: '-4vh',
            ease: 'none',
          });
        }

      });

      return () => ctx.revert();
    });
  }, []);

  return null;
}
