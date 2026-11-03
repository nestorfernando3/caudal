// Remanso de la portada en 3D (Three.js).
// Dos pasadas: el fondo (lecho, peces y sombras) se dibuja en una textura; el agua, encima,
// la refracta con ondas calculadas en el sombreador y le pone reflejos y brillos del sol.
// Hojas, flores y salpicaduras van sobre el agua. Al bajar, la cámara se levanta y mira río abajo
// mientras el lienzo se desvanece y deja ver el río que sigue por la página.
import * as THREE from '../vendor/three.module.min.js';

const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOVIL = Math.min(innerWidth, innerHeight) < 700;
const MAX_ONDAS = MOVIL ? 16 : 32;
const lienzo = document.getElementById('remanso');
const portada = document.querySelector('.portada');

function sin3D() { lienzo.remove(); portada.classList.add('sin-3d'); }

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: !MOVIL, powerPreference: 'high-performance' });
} catch (e) { sin3D(); throw e; }
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // los colores de las ilustraciones pasan tal cual
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOVIL ? 1.25 : 1.75));

const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const escenaFondo = new THREE.Scene();
const escena = new THREE.Scene();
const FONDO_Y = -1.1;
let rt, ancho = 12, alto = 7;

// ---------- ondas: anillos que nacen donde cae una gota o pasa el puntero ----------
const ondas = Array.from({ length: MAX_ONDAS }, () => new THREE.Vector4(0, 0, -100, 0));
let proxOnda = 0;
const reloj = { t: 0 };
function soltarOnda(x, z, amp) { ondas[proxOnda].set(x, z, reloj.t, amp); proxOnda = (proxOnda + 1) % MAX_ONDAS; }
function alturaJS(x, z, t) { // la misma fórmula del sombreador, para que las hojas floten de verdad
  let h = 0.006 * Math.sin(x * 2.1 + t * 0.9) + 0.005 * Math.sin(z * 2.7 - t * 0.7) + 0.004 * Math.sin((x + z) * 3.3 + t * 1.3);
  for (const o of ondas) {
    const edad = t - o.z; if (edad < 0 || edad > 5) continue;
    const d = Math.hypot(x - o.x, z - o.y) - edad * 1.35;
    h += Math.exp(-d * d * 5) * Math.exp(-edad * 0.9) * o.w * Math.sin(d * 16);
  }
  return h;
}
const GLSL_ONDAS = `
  uniform vec4 uOndas[${MAX_ONDAS}]; uniform float uT;
  float altura(vec2 p) {
    float h = 0.006 * sin(p.x * 2.1 + uT * .9) + 0.005 * sin(p.y * 2.7 - uT * .7) + 0.004 * sin((p.x + p.y) * 3.3 + uT * 1.3)
            + 0.003 * sin(p.x * 5.1 - p.y * 4.2 + uT * 1.7);
    for (int i = 0; i < ${MAX_ONDAS}; i++) {
      vec4 o = uOndas[i]; float edad = uT - o.z;
      if (edad < 0. || edad > 5.) continue;
      float d = length(p - o.xy) - edad * 1.35;
      h += exp(-d * d * 5.) * exp(-edad * .9) * o.w * sin(d * 16.);
    }
    return h;
  }`;
const GLSL_RED = `
  vec2 azar(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  float red(vec2 p, float t) { // bordes de celdas de Voronoi que se mueven: la luz que el agua dibuja en el fondo
    vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = azar(i + g);
      o = .5 + .42 * sin(t + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return 1. - smoothstep(0., .13, d2 - d1);
  }`;

// ---------- lecho ----------
const matLecho = new THREE.ShaderMaterial({
  uniforms: { uMapa: { value: null }, uRep: { value: new THREE.Vector2(1, 1) }, uDes: { value: new THREE.Vector2() }, uT: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying vec3 vMundo;
    void main() { vUv = uv; vMundo = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vMundo, 1.); }`,
  fragmentShader: `uniform sampler2D uMapa; uniform vec2 uRep, uDes; uniform float uT; varying vec2 vUv; varying vec3 vMundo;
    ${GLSL_RED}
    void main() {
      vec3 col = texture2D(uMapa, vUv * uRep + uDes).rgb;
      vec2 q = vMundo.xz;
      vec2 ondula = .25 * vec2(sin(q.y * 1.3 + uT * .5), cos(q.x * 1.1 - uT * .4));
      float luz = red(q * 1.7 + ondula, uT * .8) * .62 + red(q * 2.9 + ondula * 1.3 + 3.1, uT * 1.1) * .38;
      float claro = smoothstep(.35, .8, dot(col, vec3(.333)));
      col = col * .9 + luz * claro * vec3(1., .96, .8) * .2;
      gl_FragColor = vec4(col, 1.);
    }`
});
const lecho = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), matLecho);
lecho.position.y = FONDO_Y;
escenaFondo.add(lecho);
escenaFondo.background = new THREE.Color(0xd9ccaa);

// ---------- agua ----------
const SOL = new THREE.Vector3(-0.45, 1, -0.55).normalize();
const matAgua = new THREE.ShaderMaterial({
  uniforms: { uFondo: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uT: { value: 0 }, uOndas: { value: ondas },
              uSol: { value: SOL }, uCam: { value: new THREE.Vector3() } },
  vertexShader: `varying vec3 vMundo; void main() { vMundo = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vMundo, 1.); }`,
  fragmentShader: `uniform sampler2D uFondo; uniform vec2 uRes; uniform vec3 uSol, uCam; varying vec3 vMundo;
    ${GLSL_ONDAS}
    void main() {
      vec2 p = vMundo.xz; float e = .03;
      float dx = altura(p + vec2(e, 0.)) - altura(p - vec2(e, 0.));
      float dz = altura(p + vec2(0., e)) - altura(p - vec2(0., e));
      vec3 n = normalize(vec3(-dx / (2. * e), 1., -dz / (2. * e)));
      vec2 suv = gl_FragCoord.xy / uRes + vec2(n.x, -n.z) * .05;
      vec3 bajo = texture2D(uFondo, suv).rgb;
      bajo = mix(bajo, vec3(.55, .76, .74), .07);
      vec3 vista = normalize(uCam - vMundo);
      float fres = .02 + .98 * pow(1. - max(dot(n, vista), 0.), 5.);
      vec3 cielo = mix(vec3(.62, .76, .6), vec3(.92, .96, .94), smoothstep(-.3, .5, reflect(-vista, n).z));
      vec3 col = mix(bajo, cielo, clamp(fres * .7, 0., .45));
      vec3 hv = normalize(uSol + vista);
      float s = max(dot(n, hv), 0.);
      col += (pow(s, 260.) * 1.8 + pow(s, 40.) * .05) * vec3(1., .97, .88);
      col *= 1. + (n.x * .5 - n.z * .6) * .55; // las pendientes de la onda se aclaran y oscurecen con el sol
      gl_FragColor = vec4(col, 1.);
    }`
});
const agua = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2), matAgua);
escena.add(agua);

// ---------- piezas: pez, hoja y flor ----------
function cargarImagen(src) { return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
function recortar(img, max) { // quita el margen transparente
  const t = document.createElement('canvas'); t.width = img.width; t.height = img.height; const x = t.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data; let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
  for (let y = 0; y < img.height; y += 2) for (let i = 0; i < img.width; i += 2) if (d[(y * img.width + i) * 4 + 3] > 12) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = img.width - 1; y1 = img.height - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(1, max / Math.max(bw, bh)), c = document.createElement('canvas');
  c.width = Math.round(bw * k); c.height = Math.round(bh * k); c.getContext('2d').drawImage(t, x0, y0, bw, bh, 0, 0, c.width, c.height);
  return c;
}
const textura = c => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };

const vsPez = `uniform float uFase, uGiro; varying vec2 vUv;
  void main() {
    vec3 p = position; float u = p.x + .5; float cola = pow(1. - u, 1.6);
    p.z += sin(uFase - u * 5.2) * .085 * cola + uGiro * cola * .32;
    vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }`;
function matPez(tex, sombra) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMapa: { value: tex }, uFase: { value: 0 }, uGiro: { value: 0 } },
    vertexShader: vsPez,
    fragmentShader: sombra
      ? `uniform sampler2D uMapa; varying vec2 vUv;
         void main() { float a = 0.; for (int i = -2; i <= 2; i++) for (int j = -1; j <= 1; j++) a += texture2D(uMapa, vUv + vec2(float(i) * .025, float(j) * .07)).a;
           a /= 15.; if (a < .01) discard; gl_FragColor = vec4(.06, .1, .08, a * .34); }`
      : `uniform sampler2D uMapa; varying vec2 vUv;
         void main() { vec4 c = texture2D(uMapa, vUv); if (c.a < .03) discard; gl_FragColor = vec4(mix(c.rgb, vec3(.42, .62, .58), .16), c.a); }`
  });
}
function matSombra(tex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uMapa: { value: tex } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D uMapa; varying vec2 vUv;
      void main() { float a = 0.; for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) a += texture2D(uMapa, vUv + vec2(float(i), float(j)) * .04).a;
        a /= 9.; if (a < .01) discard; gl_FragColor = vec4(.06, .1, .08, a * .26); }`
  });
}

const peces = [], flotantes = [];
const geoPez = new THREE.PlaneGeometry(1, 0.42, 24, 1).rotateX(-Math.PI / 2);
const geoPlano = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function poblar(pez, hoja, flor) {
  const np = MOVIL ? 7 : 12, nh = MOVIL ? 6 : 10, nf = MOVIL ? 7 : 13;
  const texPez = textura(pez), texHoja = textura(hoja), texFlor = textura(flor);
  for (let i = 0; i < np; i++) {
    const tam = 0.62 + Math.random() * 0.4, prof = 0.25 + Math.random() * 0.45;
    const cuerpo = new THREE.Mesh(geoPez, matPez(texPez, false)); cuerpo.scale.setScalar(tam);
    const sombra = new THREE.Mesh(geoPez, matPez(texPez, true)); sombra.scale.setScalar(tam * 1.06);
    cuerpo.position.y = FONDO_Y + prof; sombra.position.y = FONDO_Y + 0.01;
    escenaFondo.add(sombra, cuerpo);
    peces.push({ cuerpo, sombra, x: (Math.random() - .5) * ancho * .6, z: (Math.random() - .5) * alto * .6, ang: Math.random() * 6.28, vel: .5, fase: Math.random() * 6, giro: 0, prof });
  }
  for (let i = 0; i < nh + nf; i++) {
    const esHoja = i < nh, tex = esHoja ? texHoja : texFlor, img = esHoja ? hoja : flor;
    const tam = (esHoja ? 0.42 : 0.3) * (0.75 + Math.random() * 0.5);
    const malla = new THREE.Mesh(geoPlano, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.04 }));
    malla.scale.set(tam, 1, tam * img.height / img.width);
    const sombra = new THREE.Mesh(geoPlano, matSombra(tex));
    sombra.scale.copy(malla.scale).multiplyScalar(1.1); sombra.position.y = FONDO_Y + 0.015;
    escena.add(malla); escenaFondo.add(sombra);
    flotantes.push({ malla, sombra, x: (Math.random() - .5) * ancho, z: (Math.random() - .5) * alto, vx: 0, vz: 0, giro: Math.random() * 6.28, vg: 0 });
  }
}

// ---------- salpicaduras ----------
const N_GOTAS = 90;
const posGotas = new Float32Array(N_GOTAS * 3), gotas = [];
const geoGotas = new THREE.BufferGeometry(); geoGotas.setAttribute('position', new THREE.BufferAttribute(posGotas, 3));
const puntito = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(240,250,250,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const nubeGotas = new THREE.Points(geoGotas, new THREE.PointsMaterial({ size: 0.09, map: puntito, transparent: true, depthWrite: false, opacity: .9 }));
escena.add(nubeGotas);
for (let i = 0; i < N_GOTAS; i++) { gotas.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, vida: 0 }); }
function salpicar(x, z, fuerza) {
  let n = 0;
  for (const g of gotas) if (g.vida <= 0 && n < 22) {
    const a = Math.random() * 6.28, v = (0.6 + Math.random() * 1.4) * fuerza;
    Object.assign(g, { x, y: 0.02, z, vx: Math.cos(a) * v * .55, vz: Math.sin(a) * v * .55, vy: (1.6 + Math.random() * 1.8) * fuerza, vida: 1 }); n++;
  }
}

// ---------- tamaño y cámara ----------
const raton = { nx: 0, ny: 0, sx: 0, sy: 0 };
function medir() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camara.aspect = w / h; camara.updateProjectionMatrix();
  const dist = 10.4, vh = 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * dist;
  alto = vh * 1.05; ancho = vh * camara.aspect * 1.05;
  const W = ancho * 1.16, H = alto * 1.22;
  lecho.scale.set(W, 1, H); agua.scale.set(W * 1.4, 1, H * 1.6);
  const ap = W / H, ai = 1672 / 941;
  if (ap > ai) { matLecho.uniforms.uRep.value.set(1, ai / ap); matLecho.uniforms.uDes.value.set(0, (1 - ai / ap) / 2); }
  else { matLecho.uniforms.uRep.value.set(ap / ai, 1); matLecho.uniforms.uDes.value.set((1 - ap / ai) / 2, 0); }
  const k = MOVIL ? 0.6 : 0.85, pr = renderer.getPixelRatio();
  if (!rt) rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  rt.setSize(Math.round(w * pr * k), Math.round(h * pr * k));
  matAgua.uniforms.uFondo.value = rt.texture;
  renderer.getDrawingBufferSize(matAgua.uniforms.uRes.value);
}

// ---------- interacción ----------
const rayo = new THREE.Raycaster(), plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), punto = new THREE.Vector3();
const puntero = { x: 999, z: 999, vx: 0, vz: 0, t: -9, activo: false };
let susto = { x: 0, z: 0, hasta: -9 }, ultOnda = { x: 999, z: 999, t: -9 };
function aMundo(cx, cy) {
  rayo.setFromCamera({ x: cx / innerWidth * 2 - 1, y: -(cy / innerHeight) * 2 + 1 }, camara);
  return rayo.ray.intersectPlane(plano, punto) ? punto : null;
}
const sobrePortada = y => y < portada.getBoundingClientRect().bottom && visibilidad > 0.15;
addEventListener('pointermove', e => {
  raton.nx = e.clientX / innerWidth * 2 - 1; raton.ny = e.clientY / innerHeight * 2 - 1;
  if (!sobrePortada(e.clientY)) { puntero.activo = false; return; }
  const p = aMundo(e.clientX, e.clientY); if (!p) return;
  if (puntero.activo) { puntero.vx = p.x - puntero.x; puntero.vz = p.z - puntero.z; }
  puntero.x = p.x; puntero.z = p.z; puntero.t = reloj.t; puntero.activo = true;
  const v = Math.hypot(puntero.vx, puntero.vz);
  if (Math.hypot(p.x - ultOnda.x, p.z - ultOnda.z) > 0.14 || reloj.t - ultOnda.t > 0.09) {
    soltarOnda(p.x, p.z, Math.min(0.022, 0.004 + v * 0.06)); ultOnda = { x: p.x, z: p.z, t: reloj.t };
    if (window.Sonido) window.Sonido.rastro(v * 400);
  }
}, { passive: true });
addEventListener('pointerdown', e => {
  if (!sobrePortada(e.clientY) || e.target.closest('.escena, a, button')) return;
  const p = aMundo(e.clientX, e.clientY); if (!p) return;
  soltarOnda(p.x, p.z, 0.075); salpicar(p.x, p.z, 1);
  susto = { x: p.x, z: p.z, hasta: reloj.t + 0.8 };
  for (const f of flotantes) { const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 1; if (d < 2.6) { const fu = (1 - d / 2.6) * 1.6; f.vx += dx / d * fu; f.vz += dz / d * fu; f.vg += (Math.random() - .5) * 3; } }
  if (window.Sonido) window.Sonido.gota(1);
});

// ---------- vida ----------
function moverPeces(dt) {
  const t = reloj.t, asustados = t < susto.hasta, bx = ancho * .44, bz = alto * .42;
  for (const p of peces) {
    let deseo = p.ang + Math.sin(t * .7 + p.fase * 3) * .4 * dt * 3, rapidez = .55 + Math.sin(t * 1.1 + p.fase) * .2;
    if (Math.abs(p.x) > bx || Math.abs(p.z) > bz) deseo = Math.atan2(-p.z, -p.x);
    const dx = p.x - puntero.x, dz = p.z - puntero.z, d = Math.hypot(dx, dz);
    if (puntero.activo && d < 1.9) { deseo = Math.atan2(dz, dx); rapidez = 1.8 + (1.9 - d) * 2.2; }
    if (asustados) { const sx = p.x - susto.x, sz = p.z - susto.z; if (Math.hypot(sx, sz) < 4.5) { deseo = Math.atan2(sz, sx); rapidez = 5; } }
    for (const o of peces) if (o !== p) { const ox = p.x - o.x, oz = p.z - o.z, od = Math.hypot(ox, oz); if (od < .55) deseo += Math.sign(Math.sin(Math.atan2(oz, ox) - p.ang)) * .6 * dt * 3; }
    const dif = ((deseo - p.ang) % 6.2832 + 9.4248) % 6.2832 - 3.1416;
    p.giro += (THREE.MathUtils.clamp(dif * 2.5, -3, 3) - p.giro) * Math.min(1, dt * 6);
    p.ang += p.giro * dt;
    p.vel += (rapidez - p.vel) * Math.min(1, dt * 3);
    p.x += Math.cos(p.ang) * p.vel * dt; p.z += Math.sin(p.ang) * p.vel * dt;
    p.fase += dt * (5 + p.vel * 7);
    const giroVisual = THREE.MathUtils.clamp(-p.giro * .25, -.6, .6);
    for (const m of [p.cuerpo, p.sombra]) { m.rotation.y = -p.ang; m.material.uniforms.uFase.value = p.fase; m.material.uniforms.uGiro.value = giroVisual; }
    p.cuerpo.position.x = p.x; p.cuerpo.position.z = p.z;
    const h = p.cuerpo.position.y - FONDO_Y; // la sombra cae corrida según la altura y el sol
    p.sombra.position.x = p.x + SOL.x / SOL.y * -h * 0.9; p.sombra.position.z = p.z + SOL.z / SOL.y * -h * 0.9;
  }
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), arriba = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3();
function moverFlotantes(dt) {
  const t = reloj.t, e = 0.06;
  for (const f of flotantes) {
    const cx = .22 + Math.sin(f.z * .4 + t * .2) * .1, cz = Math.sin(f.x * .3 + t * .25) * .06;
    f.vx += (cx - f.vx) * dt * .5; f.vz += (cz - f.vz) * dt * .5;
    const gx = (alturaJS(f.x + e, f.z, t) - alturaJS(f.x - e, f.z, t)) / (2 * e);
    const gz = (alturaJS(f.x, f.z + e, t) - alturaJS(f.x, f.z - e, t)) / (2 * e);
    f.vx -= gx * dt * 9; f.vz -= gz * dt * 9;
    const dx = f.x - puntero.x, dz = f.z - puntero.z, d = Math.hypot(dx, dz);
    if (puntero.activo && d < .9 && t - puntero.t < .15) { const fu = (1 - d / .9) * 9; f.vx += puntero.vx * fu * dt * 10; f.vz += puntero.vz * fu * dt * 10; f.vg += (puntero.vx * dz - puntero.vz * dx) * 30; }
    f.vx *= 1 - dt * .8; f.vz *= 1 - dt * .8; f.vg *= 1 - dt * 1.5;
    f.x += f.vx * dt; f.z += f.vz * dt; f.giro += (f.vg + .05) * dt;
    const bx = ancho * .62, bz = alto * .62;
    if (f.x > bx) f.x = -bx; if (f.x < -bx) f.x = bx; if (f.z > bz) f.z = -bz; if (f.z < -bz) f.z = bz;
    const h = alturaJS(f.x, f.z, t);
    normal.set(-gx * 3, 1, -gz * 3).normalize();
    qb.setFromUnitVectors(arriba, normal); qa.setFromAxisAngle(arriba, f.giro);
    f.malla.quaternion.copy(qb).multiply(qa);
    f.malla.position.set(f.x, h + 0.02, f.z);
    f.sombra.quaternion.copy(qa);
    f.sombra.position.set(f.x - SOL.x / SOL.y * 1.1, FONDO_Y + 0.015, f.z - SOL.z / SOL.y * 1.1);
  }
}
function moverGotas(dt) {
  for (let i = 0; i < N_GOTAS; i++) {
    const g = gotas[i];
    if (g.vida > 0) {
      g.vy -= 7.5 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; g.vida -= dt * .9;
      if (g.y < 0 && g.vy < 0) { if (Math.random() < .25) soltarOnda(g.x, g.z, .01); g.vida = 0; }
    }
    posGotas[i * 3] = g.x; posGotas[i * 3 + 1] = g.vida > 0 ? g.y : -50; posGotas[i * 3 + 2] = g.z;
  }
  geoGotas.attributes.position.needsUpdate = true;
}

// ---------- transformación al bajar ----------
let visibilidad = 1;
const mira = new THREE.Vector3();
function camaraSegunBajada(dt) {
  const s = Math.min(1.6, scrollY / innerHeight);
  raton.sx += (raton.nx - raton.sx) * Math.min(1, dt * 2.5); raton.sy += (raton.ny - raton.sy) * Math.min(1, dt * 2.5);
  const k = THREE.MathUtils.smoothstep(s, 0, 1.1);
  // al bajar, la cámara se zambulle hacia el agua girando despacio, como quien se deja llevar
  const giro = k * 0.9;
  camara.position.set(raton.sx * .55 * (1 - k), 9 - k * 6.2, 2.6 * (1 - k) + raton.sy * .45 * (1 - k));
  camara.up.set(Math.sin(giro), 0, -Math.cos(giro));
  mira.set(raton.sx * .2 * (1 - k), -0.6, 0);
  camara.lookAt(mira);
  visibilidad = 1 - THREE.MathUtils.smoothstep(s, 0.45, 1.05);
  lienzo.style.opacity = visibilidad.toFixed(3);
}

// ---------- arranque ----------
let ultimo = performance.now(), proxGota = 0;
function cuadro(ahora) {
  const dt = Math.min(0.05, (ahora - ultimo) / 1000); ultimo = ahora;
  camaraSegunBajada(dt);
  if (visibilidad <= 0.001) return;
  if (!QUIETO) {
    reloj.t += dt;
    if (reloj.t > proxGota) { soltarOnda((Math.random() - .5) * ancho * .9, (Math.random() - .5) * alto * .9, .012 + Math.random() * .016); proxGota = reloj.t + .8 + Math.random() * 1.8; }
    moverPeces(dt); moverFlotantes(dt); moverGotas(dt);
  }
  matLecho.uniforms.uT.value = reloj.t; matAgua.uniforms.uT.value = reloj.t;
  matAgua.uniforms.uCam.value.copy(camara.position);
  renderer.setRenderTarget(rt); renderer.render(escenaFondo, camara);
  renderer.setRenderTarget(null); renderer.render(escena, camara);
}

(async () => {
  const [imgLecho, imgPez, imgHoja, imgFlor] = await Promise.all(['img/descenso/r01-lecho.jpg', 'img/descenso/r02-pez.webp', 'img/descenso/r03-hoja.webp', 'img/descenso/r04-flor.webp'].map(cargarImagen));
  if (!imgLecho || !imgPez || !imgHoja || !imgFlor) { sin3D(); return; }
  const texLecho = new THREE.Texture(imgLecho); texLecho.needsUpdate = true; texLecho.anisotropy = 4;
  matLecho.uniforms.uMapa.value = texLecho;
  medir();
  poblar(recortar(imgPez, 512), recortar(imgHoja, 256), recortar(imgFlor, 220));
  addEventListener('resize', () => { clearTimeout(medir.t); medir.t = setTimeout(medir, 150); });
  lienzo.classList.add('listo');
  if (QUIETO) { reloj.t = 2; moverFlotantes(0); moverPeces(0); }
  renderer.setAnimationLoop(cuadro);
})();
