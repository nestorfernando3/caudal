// Sonido del río, sintetizado en el navegador (Web Audio): no hay archivos de audio.
// Arranca con el primer toque en cualquier parte de la página (los navegadores no dejan sonar
// antes) y cambia con la altitud: viento y arroyo arriba, pájaros en el bosque, río ancho abajo
// y olas al llegar al mar. El botón lo apaga y lo enciende.
window.Sonido = (() => {
  let ctx = null, activo = false, apagadoPorUsuario = false;
  const capas = {}, nivel = { burbujas: 0, pajaros: 0, balbuceo: 0, olas: 0 };
  const boton = document.getElementById('sonido');

  function ruido(tipo, seg = 4) {
    const n = ctx.sampleRate * seg, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let ult = 0, r1 = 0, r2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (tipo === 'marron') { ult = (ult + .02 * w) / 1.02; d[i] = ult * 3.5; }
        else if (tipo === 'rosa') { r1 = .99765 * r1 + w * .099; r2 = .963 * r2 + w * .2965; d[i] = (r1 + r2 + w * .1848) * .3; }
        else d[i] = w;
      }
    }
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s;
  }
  function cadena(fuente, filtros, destino) {
    let nodo = fuente;
    for (const [tipo, f, q] of filtros) { const fl = ctx.createBiquadFilter(); fl.type = tipo; fl.frequency.value = f; fl.Q.value = q ?? .7; nodo.connect(fl); nodo = fl; }
    const g = ctx.createGain(); g.gain.value = 0; nodo.connect(g); g.connect(destino); return g;
  }

  // Balbuceo del arroyo: varias bandas estrechas de ruido que saltan de tono sin parar
  function balbuceo(salida) {
    const fuente = ruido('blanco', 3), bandas = [];
    for (let i = 0; i < 5; i++) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6 + Math.random() * 6; f.frequency.value = 800;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      fuente.connect(f); f.connect(g); if (p) { p.pan.value = (i - 2) * .35; g.connect(p); p.connect(salida); } else g.connect(salida);
      bandas.push({ f, g });
    }
    setInterval(() => {
      if (!activo) return;
      const t = ctx.currentTime;
      for (const b of bandas) if (Math.random() < .6) {
        b.f.frequency.setTargetAtTime(500 + Math.random() * 2600, t, .02 + Math.random() * .05);
        b.g.gain.setTargetAtTime(Math.random() * .9 * nivel.balbuceo, t, .03);
      }
    }, 70);
  }
  function burbuja(vol, base) {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    const f = base || 450 + Math.random() * 1500, dur = .03 + Math.random() * .07;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.5 + Math.random()), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(capas.salida); o.start(t); o.stop(t + dur + .02);
  }
  function pajaro(vol) { // trino: notas cortas con barrido de tono y un poco de vibrato
    const t0 = ctx.currentTime, notas = 3 + Math.floor(Math.random() * 6), base = 2400 + Math.random() * 2200, paso = .06 + Math.random() * .05;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) { pan.pan.value = Math.random() * 1.6 - .8; pan.connect(capas.salida); }
    for (let i = 0; i < notas; i++) {
      const t = t0 + i * paso, o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), prof = ctx.createGain();
      lfo.frequency.value = 30 + Math.random() * 40; prof.gain.value = base * .04; lfo.connect(prof); prof.connect(o.frequency);
      o.frequency.setValueAtTime(base * (1 + Math.random() * .3), t);
      o.frequency.exponentialRampToValueAtTime(base * (.65 + Math.random() * .7), t + paso * .8);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + paso * .9);
      o.connect(g); g.connect(pan || capas.salida); o.start(t); o.stop(t + paso); lfo.start(t); lfo.stop(t + paso);
    }
  }
  function ola() { // cada ola sube despacio, revienta y se retira
    const t = ctx.currentTime, sube = 2 + Math.random() * 1.5, baja = 3.5 + Math.random() * 2, v = nivel.olas * (.6 + Math.random() * .4);
    for (const [g, k] of [[capas.olaGrave, .55], [capas.olaEspuma, .1]]) {
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(v * k, t + sube); g.gain.linearRampToValueAtTime(v * k * .12, t + sube + baja);
    }
  }

  function iniciar() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
    capas.salida = ctx.createGain(); capas.salida.gain.value = 0; capas.salida.connect(comp);
    const blanco = ruido('blanco'), rosa = ruido('rosa'), marron = ruido('marron');
    capas.viento = cadena(rosa, [['bandpass', 420, .6]], capas.salida);
    capas.arroyo = cadena(blanco, [['highpass', 1200], ['lowpass', 6500]], capas.salida);
    capas.rio = cadena(marron, [['lowpass', 380]], capas.salida);
    capas.rioMedio = cadena(rosa, [['bandpass', 700, .5]], capas.salida);
    capas.olaGrave = cadena(marron, [['lowpass', 650]], capas.salida);
    capas.olaEspuma = cadena(blanco, [['highpass', 2200], ['lowpass', 9000]], capas.salida);
    // el viento sube y baja solo
    const lfo = ctx.createOscillator(), prof = ctx.createGain(); lfo.frequency.value = .07; prof.gain.value = .02; lfo.connect(prof); prof.connect(capas.viento.gain); lfo.start();
    balbuceo(capas.salida);
    const programar = (fn, min, max) => { const r = () => { fn(); setTimeout(r, min + Math.random() * (max - min)); }; r(); };
    programar(() => { if (activo && nivel.burbujas > .03) burbuja(.045 * nivel.burbujas); }, 35, 180);
    programar(() => { if (activo && nivel.pajaros > .03) pajaro(.03 * nivel.pajaros); }, 1200, 4800);
    programar(() => { if (activo && nivel.olas > .03) ola(); }, 5500, 8500);
  }
  const entre = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  function ajustar() {
    if (!ctx) return;
    const alt = window.ALTITUD ?? 4200, t = ctx.currentTime;
    const alto = entre(2600, 4100, alt), arroyo = entre(700, 2400, alt) * (1 - alto * .35);
    const pajaros = entre(300, 1300, alt) * (1 - entre(3300, 4100, alt) * .8);
    const rio = entre(2400, 900, alt) * entre(-5, 30, alt), mar = entre(30, 0, alt);
    capas.viento.gain.setTargetAtTime(.05 * alto, t, .5);
    capas.arroyo.gain.setTargetAtTime(.022 * arroyo, t, .5);
    capas.rio.gain.setTargetAtTime(.5 * rio, t, .6);
    capas.rioMedio.gain.setTargetAtTime(.05 * rio, t, .6);
    nivel.balbuceo = .07 * arroyo; nivel.burbujas = arroyo; nivel.pajaros = pajaros; nivel.olas = mar;
  }
  function encender(si) {
    if (!ctx) iniciar();
    activo = si;
    if (si) ctx.resume();
    capas.salida.gain.setTargetAtTime(si ? 1 : 0, ctx.currentTime, .4);
    boton.setAttribute('aria-pressed', si);
    boton.querySelector('span').textContent = si ? 'Sonido activado' : 'Activar sonido';
    ajustar();
  }
  boton.addEventListener('click', () => { apagadoPorUsuario = activo; encender(!activo); });
  // primer toque en cualquier parte: el río empieza a sonar (salvo que se haya apagado a propósito)
  const primero = e => { if (e.target.closest('#sonido') || apagadoPorUsuario || activo) return; encender(true); };
  addEventListener('pointerdown', primero, { capture: true });
  addEventListener('keydown', primero, { capture: true });
  addEventListener('scroll', ajustar, { passive: true });
  setInterval(ajustar, 1000);

  let ultimaBurbuja = 0;
  return {
    gota(f = 1) { if (!activo) return; burbuja(.18 * f, 320 + Math.random() * 260); setTimeout(() => burbuja(.07 * f), 55); setTimeout(() => burbuja(.04 * f), 120); },
    rastro(v) { if (!activo || v < 10) return; const ahora = performance.now(); if (ahora - ultimaBurbuja < 60) return; ultimaBurbuja = ahora; burbuja(Math.min(.07, v * .0015)); }
  };
})();
