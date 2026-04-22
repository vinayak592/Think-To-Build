/* ============================================
   TECH-FUSION MAIN PAGE — JavaScript
   Particles, typing effect, terminal animation,
   counter animation, and scroll reveals
   ============================================ */

(function () {
  'use strict';

  // ==============================
  // 1. PARTICLE CANVAS ANIMATION
  // ==============================
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let mouse = { x: null, y: null };
  const PARTICLE_COUNT = 80;
  const CONNECTION_DIST = 150;
  const MOUSE_RADIUS = 200;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.6;
      this.vy = (Math.random() - 0.5) * 0.6;
      this.radius = Math.random() * 2 + 0.5;
      this.baseAlpha = Math.random() * 0.5 + 0.2;
      this.alpha = this.baseAlpha;
      // Random color from palette
      const colors = [
        { r: 96, g: 165, b: 250 },   // blue
        { r: 167, g: 139, b: 250 },   // purple
        { r: 34, g: 211, b: 238 },    // cyan
        { r: 244, g: 114, b: 182 },   // pink
      ];
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      // Bounce off edges
      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

      // Mouse interaction
      if (mouse.x !== null) {
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          this.vx += (dx / dist) * force * 0.15;
          this.vy += (dy / dist) * force * 0.15;
          this.alpha = Math.min(1, this.baseAlpha + force * 0.5);
        } else {
          this.alpha += (this.baseAlpha - this.alpha) * 0.05;
        }
      }

      // Limit velocity
      const maxSpeed = 1.5;
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed > maxSpeed) {
        this.vx = (this.vx / speed) * maxSpeed;
        this.vy = (this.vy / speed) * maxSpeed;
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.alpha})`;
      ctx.fill();

      // Glow effect
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.alpha * 0.1})`;
      ctx.fill();
    }
  }

  function initParticles() {
    particles = [];
    const count = Math.min(PARTICLE_COUNT, Math.floor((canvas.width * canvas.height) / 15000));
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECTION_DIST) {
          const alpha = (1 - dist / CONNECTION_DIST) * 0.15;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    drawConnections();
    requestAnimationFrame(animateParticles);
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    initParticles();
  });

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mouseout', () => {
    mouse.x = null;
    mouse.y = null;
  });

  resizeCanvas();
  initParticles();
  animateParticles();

  // ==============================
  // 2. TYPING EFFECT
  // ==============================
  const phrases = [
    'technology meets creativity.',
    'AI powers innovation.',
    'code shapes the future.',
    'ideas become reality.',
    'teams compete & conquer.',
  ];

  const typeEl = document.getElementById('type-effect');
  let phraseIdx = 0;
  let charIdx = 0;
  let isDeleting = false;
  let typeSpeed = 80;

  function typeLoop() {
    const current = phrases[phraseIdx];

    if (isDeleting) {
      typeEl.textContent = current.substring(0, charIdx - 1);
      charIdx--;
      typeSpeed = 40;
    } else {
      typeEl.textContent = current.substring(0, charIdx + 1);
      charIdx++;
      typeSpeed = 80;
    }

    if (!isDeleting && charIdx === current.length) {
      typeSpeed = 2000; // pause at end
      isDeleting = true;
    } else if (isDeleting && charIdx === 0) {
      isDeleting = false;
      phraseIdx = (phraseIdx + 1) % phrases.length;
      typeSpeed = 500; // pause before next word
    }

    setTimeout(typeLoop, typeSpeed);
  }

  setTimeout(typeLoop, 1500);

  // ==============================
  // 3. NUMBER COUNTER ANIMATION
  // ==============================
  function animateCounter(el, target, duration = 2000, suffix = '') {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(eased * target);
      el.textContent = value + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // Trigger counters when hero is visible
  let countersTriggered = false;
  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !countersTriggered) {
        countersTriggered = true;
        animateCounter(document.getElementById('stat-teams'), 50, 2000, '+');
        animateCounter(document.getElementById('stat-challenges'), 5, 1500);
        animateCounter(document.getElementById('stat-prizes'), 10, 1800, 'K');
      }
    });
  }, { threshold: 0.5 });

  const heroStats = document.querySelector('.hero-stats');
  if (heroStats) heroObserver.observe(heroStats);

  // ==============================
  // 4. SCROLL REVEAL
  // ==============================
  const revealElements = document.querySelectorAll('.feature-card, .nav-card');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, idx) => {
      if (entry.isIntersecting) {
        // Stagger the reveal
        const index = Array.from(revealElements).indexOf(entry.target);
        setTimeout(() => {
          entry.target.classList.add('revealed');
        }, index * 100);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  revealElements.forEach(el => revealObserver.observe(el));

  // ==============================
  // 5. NAVBAR SCROLL EFFECT
  // ==============================
  const nav = document.getElementById('top-nav');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  });

  // ==============================
  // 6. TERMINAL TYPING ANIMATION
  // ==============================
  const terminalLines = [
    { cmdEl: 't-line-1', outputEl: 't-output-1', text: 'techfusion --init --mode=competition', delay: 800 },
    { cmdEl: 't-line-2', outputEl: 't-output-2', wrapEl: 't-line-2-wrap', text: 'techfusion status --all', delay: 600 },
    { cmdEl: 't-line-3', outputEl: 't-output-3', wrapEl: 't-line-3-wrap', text: 'techfusion listen --participants', delay: 600 },
  ];

  let terminalStarted = false;

  function typeTerminalLine(lineConfig, callback) {
    if (lineConfig.wrapEl) {
      document.getElementById(lineConfig.wrapEl).style.display = 'flex';
    }
    const el = document.getElementById(lineConfig.cmdEl);
    let i = 0;
    const text = lineConfig.text;

    function typeChar() {
      if (i < text.length) {
        el.textContent += text[i];
        i++;
        setTimeout(typeChar, 30 + Math.random() * 30);
      } else {
        // Show output
        setTimeout(() => {
          document.getElementById(lineConfig.outputEl).style.display = 'flex';
          if (callback) setTimeout(callback, lineConfig.delay);
        }, 300);
      }
    }

    typeChar();
  }

  function startTerminal() {
    if (terminalStarted) return;
    terminalStarted = true;

    typeTerminalLine(terminalLines[0], () => {
      typeTerminalLine(terminalLines[1], () => {
        typeTerminalLine(terminalLines[2]);
      });
    });
  }

  const terminalObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        startTerminal();
        terminalObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const terminalSection = document.querySelector('.terminal-section');
  if (terminalSection) terminalObserver.observe(terminalSection);

  // ==============================
  // 7. SMOOTH SCROLL FOR ANCHORS
  // ==============================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ==============================
  // 8. CARD TILT EFFECT (subtle)
  // ==============================
  document.querySelectorAll('.nav-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -3;
      const rotateY = ((x - centerX) / centerX) * 3;

      card.querySelector('.card-content').style.transform =
        `translateY(-6px) perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      card.querySelector('.card-content').style.transform = 'translateY(0) perspective(1000px) rotateX(0) rotateY(0)';
    });
  });

})();
