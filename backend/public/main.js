/* ============================================
   THINK TO BUILD MAIN PAGE — JavaScript
   Particles, typing effect, terminal animation,
   counter animation, and scroll reveals
   ============================================ */

(function () {
  'use strict';

  // ==============================
  // 1. 3D PARTICLE ANIMATION (Three.js)
  // ==============================
  const canvas = document.getElementById('particle-canvas');
  
  // Basic Three.js setup
  const scene = new THREE.Scene();
  // We want to add a subtle fog for depth
  scene.fog = new THREE.FogExp2(0x050a18, 0.0015);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 500;

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Create particles
  const particlesGeometry = new THREE.BufferGeometry();
  const particlesCount = 1500;
  
  const posArray = new Float32Array(particlesCount * 3);
  const colorsArray = new Float32Array(particlesCount * 3);
  
  const colorPalette = [
    new THREE.Color(0x60a5fa), // blue-400
    new THREE.Color(0xa78bfa), // purple-400
    new THREE.Color(0x22d3ee), // cyan-400
    new THREE.Color(0xf472b6)  // pink-400
  ];

  for(let i = 0; i < particlesCount * 3; i+=3) {
    // Spread particles in a large 3D area
    posArray[i] = (Math.random() - 0.5) * 2000;
    posArray[i+1] = (Math.random() - 0.5) * 2000;
    posArray[i+2] = (Math.random() - 0.5) * 2000;
    
    // Assign random color from palette
    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    colorsArray[i] = color.r;
    colorsArray[i+1] = color.g;
    colorsArray[i+2] = color.b;
  }

  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));

  // Create a custom material that makes particles glow and use vertex colors
  const particlesMaterial = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  // Create the particle system mesh
  const particleMesh = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particleMesh);

  // Mouse interaction variables
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  const windowHalfX = window.innerWidth / 2;
  const windowHalfY = window.innerHeight / 2;

  document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX - windowHalfX);
    mouseY = (event.clientY - windowHalfY);
  });

  // Animation Loop
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Rotate the entire particle field slowly
    particleMesh.rotation.y = elapsedTime * 0.05;
    particleMesh.rotation.x = elapsedTime * 0.02;

    // Parallax effect based on mouse
    targetX = mouseX * 0.001;
    targetY = mouseY * 0.001;
    
    camera.position.x += (mouseX * 0.2 - camera.position.x) * 0.02;
    camera.position.y += (-mouseY * 0.2 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }

  animate();

  // Handle Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

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
    { cmdEl: 't-line-1', outputEl: 't-output-1', text: 'thinktobuild --init --mode=competition', delay: 800 },
    { cmdEl: 't-line-2', outputEl: 't-output-2', wrapEl: 't-line-2-wrap', text: 'thinktobuild status --all', delay: 600 },
    { cmdEl: 't-line-3', outputEl: 't-output-3', wrapEl: 't-line-3-wrap', text: 'thinktobuild listen --participants', delay: 600 },
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
  // 8. CARD TILT EFFECT (Fully Animated 3D)
  // ==============================
  document.querySelectorAll('.nav-card, .feature-card').forEach(card => {
    // Add glare element if not present
    if(!card.querySelector('.card-glare')) {
      const glare = document.createElement('div');
      glare.className = 'card-glare';
      card.appendChild(glare);
    }

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // Professional subtle rotation (max ~6 degrees)
      const rotateX = ((y - centerY) / centerY) * -6; 
      const rotateY = ((x - centerX) / centerX) * 6;

      // Select inner content container (.card-content or the card itself if no content wrapper)
      const content = card.querySelector('.card-content') || card;
      
      // Apply immediate transform tracking the mouse
      content.style.transition = 'none';
      content.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;

      // Move glare smoothly
      const glare = card.querySelector('.card-glare');
      if(glare) {
        glare.style.transform = `translate(${x}px, ${y}px)`;
        glare.style.opacity = '0.15'; // Subtle glare
      }
    });

    card.addEventListener('mouseleave', () => {
      const content = card.querySelector('.card-content') || card;
      // Smoothly return to original state
      content.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
      content.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
      
      const glare = card.querySelector('.card-glare');
      if(glare) {
        glare.style.opacity = '0';
      }
    });
  });

})();
