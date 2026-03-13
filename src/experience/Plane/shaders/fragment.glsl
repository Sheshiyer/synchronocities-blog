precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uOpacity;
uniform vec3 uBackgroundColor;
uniform vec3 uBlob1Color;
uniform vec3 uBlob2Color;
uniform vec3 uAccentColor;

// Simplex-style noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.0003;

  // Organic blob shapes using layered noise
  float n1 = snoise(uv * 2.0 + vec2(t * 0.7, t * 0.5));
  float n2 = snoise(uv * 3.0 + vec2(-t * 0.4, t * 0.8));
  float n3 = snoise(uv * 1.5 + vec2(t * 0.3, -t * 0.6));

  // Radial gradient from center
  vec2 center = uv - 0.5;
  float dist = length(center);
  float radial = smoothstep(0.7, 0.0, dist);

  // Blob masks
  float blob1 = smoothstep(0.0, 0.6, n1 * 0.5 + 0.5) * radial;
  float blob2 = smoothstep(0.1, 0.7, n2 * 0.5 + 0.5) * (1.0 - radial * 0.5);

  // Accent highlights
  float highlight = smoothstep(0.3, 0.8, n3 * 0.5 + 0.5) * radial * 0.3;

  // Compose color layers
  vec3 color = uBackgroundColor;
  color = mix(color, uBlob1Color, blob1 * 0.7);
  color = mix(color, uBlob2Color, blob2 * 0.5);
  color = mix(color, uAccentColor, highlight);

  // Subtle vignette
  float vignette = 1.0 - smoothstep(0.3, 0.85, dist);
  color *= 0.7 + 0.3 * vignette;

  // Film grain
  float grain = (fract(sin(dot(uv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.03;
  color += grain;

  gl_FragColor = vec4(color, uOpacity);
}
