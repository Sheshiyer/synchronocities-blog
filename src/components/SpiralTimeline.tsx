import { useEffect, useRef, useState, useCallback, type FC } from 'react';
import { gsap } from 'gsap';
import { MAJOR_ARCANA, type MajorArcana } from '../lib/tarot';

interface PostData {
  slug: string;
  title: string;
  card?: string;
  date: string;
  excerpt?: string;
  revolution: number;
}

interface SpiralTimelineProps {
  posts: PostData[];
}

/** Generate spiral point at a given angle and revolution */
function spiralPoint(
  angleDeg: number,
  revolution: number,
  cx: number,
  cy: number,
  baseRadius: number,
  growthRate: number
): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  const totalAngle = angleRad + (revolution - 1) * Math.PI * 2;
  const r = baseRadius + growthRate * totalAngle;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

/** Generate SVG path for the spiral curve */
function generateSpiralPath(
  cx: number,
  cy: number,
  baseRadius: number,
  growthRate: number,
  revolutions: number,
  steps: number = 360
): string {
  const points: string[] = [];
  const totalSteps = steps * revolutions;

  for (let i = 0; i <= totalSteps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const r = baseRadius + growthRate * angle;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  return points.join(' ');
}

const SpiralTimeline: FC<SpiralTimelineProps> = ({ posts }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState<MajorArcana | null>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, rotation: 0 });
  const nodesRef = useRef<(SVGGElement | null)[]>([]);

  const viewSize = 800;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const baseRadius = 120;
  const growthRate = 28;
  const maxRevolutions = Math.max(1, ...posts.map(p => p.revolution));

  // Count posts per card
  const postsByCard = posts.reduce<Record<string, PostData[]>>((acc, post) => {
    if (post.card) {
      acc[post.card] = acc[post.card] || [];
      acc[post.card].push(post);
    }
    return acc;
  }, {});

  const [isAnimated, setIsAnimated] = useState(false);

  // Entrance animation: draw the spiral path
  useEffect(() => {
    if (!svgRef.current) return;

    const path = svgRef.current.querySelector('.spiral-path') as SVGPathElement | null;
    if (!path) return;

    const pathLength = path.getTotalLength();
    path.style.strokeDasharray = `${pathLength}`;
    path.style.strokeDashoffset = `${pathLength}`;

    // Animate path drawing
    gsap.to(path, {
      strokeDashoffset: 0,
      duration: 2.5,
      ease: 'power2.inOut',
      onComplete: () => setIsAnimated(true),
    });

    // Fade in everything else after a short delay
    const timer = setTimeout(() => setIsAnimated(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Hover glow animation
  useEffect(() => {
    if (hoveredCard === null) return;
    const node = nodesRef.current[hoveredCard];
    if (!node) return;

    const anim = gsap.to(node.querySelector('.node-glow'), {
      attr: { r: 20 },
      opacity: 0.6,
      duration: 0.3,
      ease: 'power2.out',
    });

    return () => {
      gsap.to(node.querySelector('.node-glow'), {
        attr: { r: 8 },
        opacity: 0.2,
        duration: 0.3,
      });
      anim.kill();
    };
  }, [hoveredCard]);

  // Drag to rotate
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('.card-node')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, rotation };
  }, [rotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    setRotation(dragStart.current.rotation + dx * 0.3);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(prev => Math.max(0.5, Math.min(3, prev - e.deltaY * 0.001)));
  }, []);

  const spiralPath = generateSpiralPath(cx, cy, baseRadius, growthRate, maxRevolutions);

  return (
    <div
      ref={containerRef}
      className="relative w-full flex items-center justify-center overflow-hidden select-none"
      style={{ height: 'calc(100vh - 70px)', cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="w-auto h-full max-h-[min(80vh,800px)] aspect-square"
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Spiral Path */}
        <path
          className="spiral-path"
          d={spiralPath}
          fill="none"
          stroke="url(#khaGradient)"
          strokeWidth="1.5"
          opacity="0.6"
        />

        {/* Gradient Definitions */}
        <defs>
          <linearGradient id="khaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#070B1D" />
            <stop offset="50%" stopColor="#2D0050" />
            <stop offset="100%" stopColor="#0B50FB" />
          </linearGradient>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C5A017" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#C5A017" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sigilGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10B5A7" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#2D0050" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#070B1D" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Center Sigil */}
        <g className="sigil-center" style={{ opacity: isAnimated ? 1 : 0, transition: 'opacity 0.8s ease-out' }}>
          <circle cx={cx} cy={cy} r="40" fill="url(#sigilGlow)" />
          <circle cx={cx} cy={cy} r="25" fill="none" stroke="#C5A017" strokeWidth="0.5" opacity="0.6" />
          <circle cx={cx} cy={cy} r="15" fill="none" stroke="#10B5A7" strokeWidth="0.5" opacity="0.4" />
          {/* Compass points */}
          {[0, 90, 180, 270].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            return (
              <line
                key={angle}
                x1={cx + 20 * Math.cos(rad)}
                y1={cy + 20 * Math.sin(rad)}
                x2={cx + 30 * Math.cos(rad)}
                y2={cy + 30 * Math.sin(rad)}
                stroke="#C5A017"
                strokeWidth="0.5"
                opacity="0.4"
              />
            );
          })}
        </g>

        {/* Card Nodes */}
        {MAJOR_ARCANA.map((card, i) => {
          const pos = spiralPoint(card.angle, 1, cx, cy, baseRadius, growthRate);
          const cardPosts = postsByCard[card.numeral] || [];
          const hasContent = cardPosts.length > 0;
          const isHovered = hoveredCard === i;
          const isActive = activeCard?.number === card.number;

          return (
            <g
              key={card.number}
              ref={(el) => { nodesRef.current[i] = el; }}
              className="card-node"
              style={{
                cursor: 'pointer',
                opacity: isAnimated ? 1 : 0,
                transition: `opacity 0.4s ease-out ${0.05 * i}s`,
              }}
              onMouseEnter={() => setHoveredCard(i)}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={(e) => {
                e.stopPropagation();
                setActiveCard(isActive ? null : card);
              }}
            >
              {/* Glow */}
              <circle
                className="node-glow"
                cx={pos.x}
                cy={pos.y}
                r={8}
                fill={hasContent ? '#C5A017' : '#2D0050'}
                opacity={hasContent ? 0.2 : 0.08}
              />

              {/* Node circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={hasContent ? 8 : 4}
                fill={hasContent ? card.color : '#0E1428'}
                stroke={hasContent ? '#C5A017' : '#8A9BA8'}
                strokeWidth={hasContent ? 1.5 : 0.5}
                opacity={hasContent ? 1 : 0.4}
              />

              {/* Post count badge */}
              {cardPosts.length > 1 && (
                <text
                  x={pos.x + 8}
                  y={pos.y - 8}
                  fontSize="7"
                  fill="#C5A017"
                  fontFamily="var(--font-mono)"
                >
                  {cardPosts.length}
                </text>
              )}

              {/* Hover label */}
              {isHovered && (
                <g
                  style={{
                    transform: `rotate(${-rotation}deg)`,
                    transformOrigin: `${pos.x}px ${pos.y}px`,
                  }}
                >
                  <rect
                    x={pos.x - 45}
                    y={pos.y - 30}
                    width="90"
                    height="22"
                    rx="3"
                    fill="#0E1428"
                    stroke="#C5A017"
                    strokeWidth="0.5"
                    opacity="0.95"
                  />
                  <text
                    x={pos.x}
                    y={pos.y - 18}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#C5A017"
                    fontFamily="var(--font-display)"
                    fontWeight="600"
                    letterSpacing="0.05em"
                  >
                    {card.numeral}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y - 11}
                    textAnchor="middle"
                    fontSize="6"
                    fill="#F0EDE3"
                    fontFamily="var(--font-body)"
                  >
                    {card.thothName}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Constellation connections between adjacent cards with content */}
        {MAJOR_ARCANA.filter(card => postsByCard[card.numeral]?.length).map((card, idx, arr) => {
          if (idx === 0) return null;
          const prev = arr[idx - 1];
          const p1 = spiralPoint(prev.angle, 1, cx, cy, baseRadius, growthRate);
          const p2 = spiralPoint(card.angle, 1, cx, cy, baseRadius, growthRate);
          return (
            <line
              key={`conn-${card.number}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#C5A017"
              strokeWidth="0.5"
              opacity="0.15"
              strokeDasharray="2 4"
            />
          );
        })}
      </svg>

      {/* Active Card Panel */}
      {activeCard && (
        <div
          className="absolute right-0 top-0 h-full w-[360px] max-w-[90vw] overflow-y-auto"
          style={{
            background: 'linear-gradient(180deg, #0E1428 0%, #070B1D 100%)',
            borderLeft: '1px solid rgba(197, 160, 23, 0.2)',
          }}
        >
          <div className="p-8">
            {/* Close button */}
            <button
              onClick={() => setActiveCard(null)}
              className="absolute top-4 right-4 text-[#8A9BA8] hover:text-[#C5A017] transition-colors text-lg"
            >
              ✕
            </button>

            {/* Card Header */}
            <div className="mb-8">
              <span
                className="text-[42px] font-bold opacity-20 block leading-none"
                style={{ fontFamily: 'var(--font-display)', color: activeCard.color }}
              >
                {activeCard.numeral}
              </span>
              <h2
                className="text-2xl font-semibold mt-2"
                style={{ fontFamily: 'var(--font-display)', color: '#F0EDE3' }}
              >
                {activeCard.thothName}
              </h2>
              <div className="flex gap-3 mt-3 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                <span className="text-[#8A9BA8]">{activeCard.element}</span>
                <span className="text-[#C5A017]">{activeCard.keyword}</span>
                {activeCard.compass && (
                  <span className="text-[#10B5A7]">{activeCard.compass}</span>
                )}
              </div>
              <p className="text-sm text-[#8A9BA8] mt-2">
                {activeCard.heroPhase}
              </p>
            </div>

            {/* Posts */}
            <div className="space-y-4">
              {(postsByCard[activeCard.numeral] || []).map((post) => (
                <a
                  key={post.slug}
                  href={`/posts/${post.slug}`}
                  className="block p-4 rounded-lg transition-all duration-300 hover:border-[#C5A017]"
                  style={{
                    backgroundColor: 'rgba(14, 20, 40, 0.6)',
                    border: '1px solid rgba(138, 155, 168, 0.15)',
                  }}
                >
                  <h3
                    className="text-base font-medium text-[#F0EDE3] mb-1"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="text-sm text-[#8A9BA8] line-clamp-2">{post.excerpt}</p>
                  )}
                  <div className="flex gap-2 mt-2 text-xs text-[#8A9BA8]" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</span>
                    <span>•</span>
                    <span>Rev {post.revolution}</span>
                  </div>
                </a>
              ))}

              {(!postsByCard[activeCard.numeral] || postsByCard[activeCard.numeral].length === 0) && (
                <div className="text-center py-8 text-[#8A9BA8] text-sm">
                  <p className="opacity-50">This position on the spiral awaits its story.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
        <p className="text-xs text-[#8A9BA8] opacity-40" style={{ fontFamily: 'var(--font-mono)' }}>
          drag to rotate · scroll to zoom · click a node to explore
        </p>
      </div>
    </div>
  );
};

export default SpiralTimeline;
