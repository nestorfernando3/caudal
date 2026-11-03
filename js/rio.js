// El río que acompaña el descenso: un sombreador a pantalla completa que dibuja el cauce en
// coordenadas de la página. Bajo la portada es el agua quieta del remanso; luego se estrecha en un
// arroyo rápido, se ensancha, corre con dos colores en la confluencia, se abre en brazos en el delta
// y termina en el mar, que llena la pantalla. El puntero le deja ondas.
(() => {
  const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lienzo = document.getElementById('rio');
  const gl = lienzo.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) { lienzo.remove(); return; }
  const N = 16;

  const vs = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0., 1.); }`;
  const fs = `precision highp float;
    uniform vec2 uView; uniform float uDpr, uScroll, uT, uMovil;
    uniform vec4 uY;            // fin de la portada, confluencias, delta y mar (px de la página)
    uniform vec2 uTr[3];        // cabeceras de tramo: el río pasa por el hueco entre texto y libro
    uniform vec4 uOndas[${N}];  // x, y de página, momento, fuerza

    float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * ruido(p); p = p * 2.03 + 7.1; a *= .5; } return v; }
    vec2 azar(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
    float red(vec2 p, float t) { vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = azar(i + g);
        o = .5 + .42 * sin(t + 6.2831 * o); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      return 1. - smoothstep(0., .13, d2 - d1); }

    float centro(float y) {
      if (uMovil > .5) return 17. + 5. * sin(y * .009) + 3. * sin(y * .021);
      float amp = clamp((uView.x - 760.) / 700., .3, 1.);
      float c = uView.x * .5 + amp * (58. * sin(y * .0019) + 26. * sin(y * .0047 + 1.7) + 10. * sin(y * .013));
      for (int k = 0; k < 3; k++) {
        float a = smoothstep(uTr[k].x - 260., uTr[k].x, y) * (1. - smoothstep(uTr[k].y, uTr[k].y + 260., y));
        c = mix(c, uView.x * .585 + 14. * sin(y * .004), a);
      }
      return c;
    }
    float semiancho(float y) {
      float m = uMovil > .5 ? .22 : 1.;
      float w = mix(7., 42., smoothstep(uY.x, uY.y, y)) * m;
      w = mix(w, 54. * m, smoothstep(uY.y, uY.z, y));
      return w;
    }
    void main() {
      vec2 fc = gl_FragCoord.xy / uDpr;
      float x = fc.x, y = uScroll + (uView.y - fc.y);
      float poza = 1. - smoothstep(uY.x - uView.y * .45, uY.x + uView.y * .35, y);
      float mar = smoothstep(uY.w - uView.y * .9, uY.w - uView.y * .1, y);
      float c = centro(y), w = semiancho(y);
      float lado = sign(x - c);
      float d = abs(x - c) - w * (.82 + .45 * fbm(vec2(y * .006, lado * 3.1)));   // orillas irregulares
      // delta: el cauce se abre en tres brazos
      float delta = smoothstep(uY.z, uY.z + 500., y) * (1. - mar) * (1. - uMovil);
      if (delta > 0.) {
        float abre = min(105., (y - uY.z) * .12);
        float b1 = abs(x - (c - abre + 18. * sin(y * .006))) - w * .34;
        float b2 = abs(x - (c + 10. * sin(y * .008 + 2.))) - w * .5;
        float b3 = abs(x - (c + abre + 18. * sin(y * .007 + 4.))) - w * .34;
        d = mix(d, min(b1, min(b2, b3)), delta);
      }
      d = mix(d, -uView.x, max(poza, mar));
      float orilla = (1. - smoothstep(0., 12., d)) * .16;   // tierra mojada junto al agua
      float a = 1. - smoothstep(-1.2, 1.2, d);
      if (a <= 0. && orilla <= 0.) discard;

      // corriente: más rápida arriba, lenta abajo
      float vel = mix(150., 40., smoothstep(uY.x, uY.z, y));
      float rel = clamp((x - c) / max(w, 1.), -1., 1.);
      vec2 q = vec2(x * .03, (y - uT * vel) * .009);
      float vetas = fbm(vec2(q.x * 2.4 + rel * .6, q.y));
      float vetas2 = fbm(vec2(q.x * 5., q.y * 2.2 + 3.));

      vec3 arroyo = vec3(.6, .8, .8), rioc = vec3(.38, .58, .54), pardo = vec3(.56, .44, .29), azul = vec3(.24, .5, .6);
      vec3 deltac = vec3(.36, .57, .54), marc = vec3(.1, .31, .39), pozac = vec3(.8, .83, .72);
      vec3 col = mix(arroyo, rioc, smoothstep(uY.x, uY.y, y));
      // confluencia: dos aguas que corren juntas sin mezclarse
      float conf = smoothstep(uY.y - 200., uY.y + 300., y) * (1. - smoothstep(uY.z - 300., uY.z + 200., y));
      float frontera = c + 8. * sin(y * .03 + uT * .8) + 5. * (vetas - .5) * 6.;
      vec3 dos = mix(pardo, azul, smoothstep(-3., 3., x - frontera));
      col = mix(col, dos, conf);
      col = mix(col, deltac, smoothstep(uY.z - 100., uY.z + 400., y));
      col *= 1. - .22 * (1. - rel * rel) * (1. - poza) * (1. - mar);     // más hondo en el centro
      col += (pow(vetas, 2.5) * .35 + pow(vetas2, 6.) * .9) * (1. - mar * .5) * (1. - poza);
      float rapidos = (1. - smoothstep(uY.x, uY.x + 1800., y)) * (1. - poza);
      col += rapidos * pow(vetas2, 2.) * .35;                            // espuma de rápidos
      col += (1. - smoothstep(-7., 0., -abs(d + 3.5) - 0.)) * 0.;        // (reservado)
      col += smoothstep(-6., 0., d) * .25 * vetas * (1. - poza) * (1. - mar); // espuma en la orilla

      // remanso bajo la portada: agua clara con la red de luz
      vec2 pq = vec2(x, y) * .006;
      float luz = red(pq * 1.6 + .2 * vec2(sin(pq.y * 3. + uT * .5), cos(pq.x * 2. - uT * .4)), uT * .8);
      col = mix(col, pozac + luz * .22, poza);
      // mar: oleaje lateral, destellos y franjas de espuma
      float ola = sin(y * .018 - uT * 1.1 + fbm(vec2(x * .004, y * .004 + uT * .05)) * 5.);
      vec3 marCol = marc + vec3(.05, .09, .1) * ola + pow(fbm(vec2(x * .02 + uT * .3, y * .05)), 5.) * vec3(1.2);
      col = mix(col, marCol, mar);

      // ondas del puntero
      for (int i = 0; i < ${N}; i++) {
        vec4 o = uOndas[i]; float edad = uT - o.z;
        if (edad < 0. || edad > 3.5) continue;
        float r = length(vec2(x, y) - o.xy) - edad * 120.;
        col += exp(-r * r * .0025) * exp(-edad * 1.3) * o.w * sin(r * .22) * .5;
      }

      vec3 tierra = vec3(.16, .2, .17);
      vec4 sal = vec4(tierra * orilla, orilla);
      sal = mix(sal, vec4(col, 1.), a);
      gl_FragColor = vec4(sal.rgb * (a > 0. ? 1. : 1.), sal.a);
    }`;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); lienzo.remove(); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const ondas = new Float32Array(N * 4).fill(0); for (let i = 0; i < N; i++) ondas[i * 4 + 2] = -100;
  let prox = 0, dpr = 1;

  function medir() {
    const movil = innerWidth < 760;
    dpr = Math.min(devicePixelRatio || 1, movil ? 1 : 1.25);
    lienzo.width = Math.round(innerWidth * dpr); lienzo.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    const top = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().top + scrollY : 1e6; };
    const rango = sel => { const e = document.querySelector(sel); if (!e) return [1e6, 1e6]; const r = e.getBoundingClientRect(); return [r.top + scrollY, r.bottom + scrollY]; };
    gl.uniform2f(U('uView'), innerWidth, innerHeight);
    gl.uniform1f(U('uDpr'), dpr);
    gl.uniform1f(U('uMovil'), movil ? 1 : 0);
    gl.uniform4f(U('uY'), document.querySelector('.portada').offsetHeight, top('#confluencias'), top('#delta'), top('#rutas'));
    gl.uniform2fv(U('uTr'), new Float32Array([...rango('#cabeceras .tramo-cabeza'), ...rango('#confluencias .tramo-cabeza'), ...rango('#delta .tramo-cabeza')]));
  }
  medir();
  addEventListener('resize', medir);
  new ResizeObserver(medir).observe(document.body);

  let ultimaOnda = { x: -999, y: -999, t: 0 };
  const t0 = performance.now();
  const reloj = () => (performance.now() - t0) / 1000;
  addEventListener('pointermove', e => {
    const p = { x: e.clientX, y: e.clientY + scrollY }, t = reloj();
    const d = Math.hypot(p.x - ultimaOnda.x, p.y - ultimaOnda.y);
    if (d > 26 || t - ultimaOnda.t > .12) {
      ondas.set([p.x, p.y, t, Math.min(.5, .12 + d * .006)], prox * 4); prox = (prox + 1) % N; ultimaOnda = { ...p, t };
    }
  }, { passive: true });
  addEventListener('pointerdown', e => {
    if (e.target.closest('a, button, .escena, .selector')) return;
    ondas.set([e.clientX, e.clientY + scrollY, reloj(), 1.1], prox * 4); prox = (prox + 1) % N;
    if (e.clientY > document.querySelector('.portada').getBoundingClientRect().bottom && window.Sonido) window.Sonido.gota(.8);
  });

  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  (function cuadro() {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U('uScroll'), scrollY);
    gl.uniform1f(U('uT'), QUIETO ? 0 : reloj());
    gl.uniform4fv(U('uOndas'), ondas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(cuadro);
  })();
})();
