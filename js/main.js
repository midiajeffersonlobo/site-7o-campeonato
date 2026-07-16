/* ==========================================================================
   main.js — orquestração da landing page
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ------------------------------------------------------------------------
     1) HERO — vídeo de fundo (ambiente) + revelação do header/dock após 5s
     ------------------------------------------------------------------------ */

  const HERO_VIDEO = { id: '6fK-rtPlfxY', start: 7642, end: 7724 }; // close-background

  const heroPlayer = new LockedYTPlayer({
    elementId: 'hero-yt-player',
    videoId: HERO_VIDEO.id,
    start: HERO_VIDEO.start,
    end: HERO_VIDEO.end,
    ambient: true,
    loop: true,
  });

  const heroVideoWrap = document.getElementById('heroVideoWrap');
  const heroScrim = document.getElementById('heroScrim');
  const heroContent = document.getElementById('heroContent');
  const heroScrollHint = document.getElementById('heroScrollHint');
  const siteHeader = document.getElementById('siteHeader');
  const actionDock = document.getElementById('actionDock');
  const heroSkipBtn = document.getElementById('heroSkip');
  const heroSkipZone = document.getElementById('heroSkipZone');

  let heroRevealed = false;
  let heroTimerId = null;

  function revealSite() {
    if (heroRevealed) return;
    heroRevealed = true;
    clearTimeout(heroTimerId);

    heroVideoWrap.classList.add('is-blurred');
    heroScrim.classList.add('is-visible');
    heroContent.classList.add('is-visible');
    heroScrollHint.classList.add('is-visible');
    siteHeader.classList.add('is-visible');
    actionDock.classList.add('is-visible');

    if (heroSkipBtn) heroSkipBtn.classList.add('is-hidden');
    if (heroSkipZone) heroSkipZone.classList.add('is-hidden');
  }

  heroTimerId = window.setTimeout(revealSite, 7000);

  if (heroSkipBtn) heroSkipBtn.addEventListener('click', revealSite);
  if (heroSkipZone) heroSkipZone.addEventListener('click', revealSite);

  /* ------------------------------------------------------------------------
     2) MODAIS — abrir / fechar
     ------------------------------------------------------------------------ */

  const modals = document.querySelectorAll('.modal');
  let activeModalId = null;
  let lastFocusedEl = null;

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    lastFocusedEl = document.activeElement;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    activeModalId = id;

    if (id === 'modal-proposta') { initProposalDeck(); flashDeckNav(); }
    if (id === 'modal-documento') initPdfViewer();
    if (id === 'modal-midia') initMediaPlayers();

    const closeBtn = modal.querySelector('[data-close-modal]');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    activeModalId = null;

    // pausa qualquer vídeo travado que esteja tocando dentro do modal fechado
    modal.querySelectorAll('[data-locked-instance]').forEach((el) => {
      if (el.__lockedPlayer) el.__lockedPlayer.pause();
    });

    // Se o vídeo em destaque (lightbox) estiver aberto ao fechar a Mídia, fecha junto
    if (id === 'modal-midia') {
      const videoOverlay = document.getElementById('videoLightbox');
      if (videoOverlay && videoOverlay.classList.contains('is-open')) {
        const closeBtn = videoOverlay.querySelector('[data-video-lightbox-close]');
        if (closeBtn) closeBtn.click();
      }
    }

    if (lastFocusedEl) lastFocusedEl.focus();
  }

  document.querySelectorAll('[data-open-modal]').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.getAttribute('data-open-modal')));
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) closeModal(modal.id);
    });
  });

  document.addEventListener('keydown', (e) => {
    const openLightbox = ['mediaLightbox', 'editionsLightbox', 'videoLightbox'].find((id) => {
      const el = document.getElementById(id);
      return el && el.classList.contains('is-open');
    });
    if (openLightbox) return;
    if (e.key === 'Escape' && activeModalId) closeModal(activeModalId);
  });

  /* ------------------------------------------------------------------------
     2b) LIGHTBOX — visualização ampliada das fotos da galeria de Mídia
     ------------------------------------------------------------------------ */

  (function initMediaLightbox() {
    const lightbox = document.getElementById('mediaLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    if (!lightbox || !lightboxImg) return;

    const photos = Array.from(document.querySelectorAll('.media-item.type-photo img'));
    if (!photos.length) return;

    let currentIndex = 0;

    function show(i) {
      currentIndex = (i + photos.length) % photos.length;
      const img = photos[currentIndex];
      lightboxImg.src = img.getAttribute('src');
      lightboxImg.alt = img.getAttribute('alt') || '';
    }

    function open(i) {
      show(i);
      lightbox.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      lightbox.classList.remove('is-open');
      document.body.style.overflow = activeModalId ? 'hidden' : '';
      if (document.fullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      }
    }

    photos.forEach((img, i) => {
      img.addEventListener('click', () => open(i));
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(i);
        }
      });
    });

    lightbox.querySelector('[data-lightbox-close]').addEventListener('click', close);
    lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(currentIndex - 1));
    lightbox.querySelector('[data-lightbox-next]').addEventListener('click', () => show(currentIndex + 1));
    lightbox.querySelector('[data-lightbox-fullscreen]').addEventListener('click', () => {
      const request = lightbox.requestFullscreen || lightbox.webkitRequestFullscreen || lightbox.msRequestFullscreen;
      if (request) request.call(lightbox);
    });

    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(currentIndex + 1);
      if (e.key === 'ArrowLeft') show(currentIndex - 1);
    });
  })();

  /* ------------------------------------------------------------------------
     3) DECK DE SLIDES — Proposta resumida
     ------------------------------------------------------------------------ */

  const deckTrack = document.getElementById('deckTrack');
  const slides = Array.from(deckTrack.querySelectorAll('[data-slide]'));
  const deckCounter = document.getElementById('deckCounter');
  const deckProgress = document.getElementById('deckProgress');
  let deckIndex = 0;
  let deckInitialized = false;

  // Constrói os pontos de progresso
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'deck-dot';
    dot.addEventListener('click', () => goToSlide(i));
    deckProgress.appendChild(dot);
  });
  const deckDots = Array.from(deckProgress.children);

  function updateDeckUI() {
    deckTrack.style.transform = `translateX(-${deckIndex * 100}%)`;
    deckCounter.textContent = String(deckIndex + 1).padStart(2, '0');
    deckDots.forEach((d, i) => d.classList.toggle('is-active', i === deckIndex));

    // autoplay do vídeo ao entrar no slide 12, pausa ao sair dele
    if (proposalPlayer) {
      if (slides[deckIndex] === slides[11]) {
        proposalPlayer.play();
      } else {
        proposalPlayer.pause();
      }
    }
  }

  function goToSlide(i) {
    deckIndex = Math.min(slides.length - 1, Math.max(0, i));
    updateDeckUI();
  }

  // No mobile, as setas ficam apagadas por padrão e "acendem" ao serem usadas
  function flashDeckNav() {
    document.querySelectorAll('.deck-nav').forEach((btn) => {
      btn.classList.add('is-focused');
      clearTimeout(btn.__flashTimer);
      btn.__flashTimer = window.setTimeout(() => btn.classList.remove('is-focused'), 1400);
    });
  }

  document.querySelector('[data-deck-prev]').addEventListener('click', () => { goToSlide(deckIndex - 1); flashDeckNav(); });
  document.querySelector('[data-deck-next]').addEventListener('click', () => { goToSlide(deckIndex + 1); flashDeckNav(); });

  document.getElementById('modal-proposta').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goToSlide(deckIndex + 1);
    if (e.key === 'ArrowLeft') goToSlide(deckIndex - 1);
  });

  // swipe touch
  (function enableSwipe() {
    let startX = 0;
    let deltaX = 0;
    deckTrack.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    deckTrack.addEventListener('touchmove', (e) => { deltaX = e.touches[0].clientX - startX; }, { passive: true });
    deckTrack.addEventListener('touchend', () => {
      if (Math.abs(deltaX) > 50) {
        if (deltaX < 0) goToSlide(deckIndex + 1);
        else goToSlide(deckIndex - 1);
      }
      deltaX = 0;
    });
  })();

  // Botões internos que também abrem outros modais (slide de fechamento)
  document.querySelectorAll('#modal-proposta [data-open-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal('modal-proposta');
      openModal(btn.getAttribute('data-open-modal'));
    });
  });

  let proposalPlayer = null;

  function initProposalDeck() {
    if (deckInitialized) { updateDeckUI(); return; }
    deckInitialized = true;
    updateDeckUI();

    proposalPlayer = new LockedYTPlayer({
      elementId: 'proposalVideoYT',
      videoId: 'Ta0sR3fTbDI',
      start: 3560,
      end: 4178,
      ambient: false,
      loop: false,
    });

    wireLockedPlayerControls(document.getElementById('proposalVideoPlayer'), proposalPlayer);
  }

  /* ------------------------------------------------------------------------
     3b) SLIDE 11 — carrossel de fotos de edições anteriores
     ------------------------------------------------------------------------ */

  (function initEditionsCarousel() {
    const wrap = document.getElementById('editionsCarousel');
    const bg = document.getElementById('editionsCarouselBg');
    if (!wrap || !bg) return;

    const thumbs = Array.from(wrap.querySelectorAll('.edition-thumb'));
    let index = 0;
    let autoplay = true;
    let timerId = null;

    // Lightbox — foto ampliada sincronizada com o carrossel
    const expandBtn = document.getElementById('editionsExpand');
    const lightbox = document.getElementById('editionsLightbox');
    const lightboxImg = document.getElementById('editionsLightboxImg');

    function setActive(i) {
      index = (i + thumbs.length) % thumbs.length;
      thumbs.forEach((t, ti) => t.classList.toggle('is-active', ti === index));
      const src = thumbs[index].getAttribute('data-src');
      bg.style.backgroundImage = `url('${src}')`;
      if (lightbox && lightbox.classList.contains('is-open') && lightboxImg) {
        lightboxImg.src = src;
        lightboxImg.alt = thumbs[index].querySelector('img').getAttribute('alt') || '';
      }
    }

    function startAutoplay() {
      clearInterval(timerId);
      timerId = setInterval(() => {
        if (!autoplay) return;
        setActive(index + 1);
      }, 3000);
    }

    thumbs.forEach((btn) => {
      btn.addEventListener('click', () => {
        autoplay = false;
        setActive(parseInt(btn.getAttribute('data-index'), 10));
      });
    });

    setActive(0);
    startAutoplay();

    if (expandBtn && lightbox && lightboxImg) {
      function openLightbox() {
        autoplay = false;
        lightboxImg.src = thumbs[index].getAttribute('data-src');
        lightboxImg.alt = thumbs[index].querySelector('img').getAttribute('alt') || '';
        lightbox.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      }

      function closeLightbox() {
        lightbox.classList.remove('is-open');
        document.body.style.overflow = activeModalId ? 'hidden' : '';
        if (document.fullscreenElement) {
          (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        }
      }

      expandBtn.addEventListener('click', openLightbox);
      bg.style.cursor = 'zoom-in';
      bg.addEventListener('click', openLightbox);

      lightbox.querySelector('[data-editions-lightbox-close]').addEventListener('click', closeLightbox);
      lightbox.querySelector('[data-editions-lightbox-prev]').addEventListener('click', () => setActive(index - 1));
      lightbox.querySelector('[data-editions-lightbox-next]').addEventListener('click', () => setActive(index + 1));
      lightbox.querySelector('[data-editions-lightbox-fullscreen]').addEventListener('click', () => {
        const request = lightbox.requestFullscreen || lightbox.webkitRequestFullscreen || lightbox.msRequestFullscreen;
        if (request) request.call(lightbox);
      });

      document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('is-open')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight') setActive(index + 1);
        if (e.key === 'ArrowLeft') setActive(index - 1);
      });
    }
  })();

  /* ------------------------------------------------------------------------
     3c) CARROSSEL — "O que estamos solicitando" (modal Cronograma/Estrutura)
     ------------------------------------------------------------------------ */

  (function initReqCarousel() {
    const track = document.getElementById('reqTrack');
    const dotsWrap = document.getElementById('reqDots');
    if (!track || !dotsWrap) return;

    const cards = Array.from(track.querySelectorAll('[data-req]'));
    let index = 0;

    cards.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'deck-dot';
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });
    const dots = Array.from(dotsWrap.children);

    function update() {
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    }

    function goTo(i) {
      index = Math.min(cards.length - 1, Math.max(0, i));
      update();
    }

    document.querySelector('[data-req-prev]').addEventListener('click', () => goTo(index - 1));
    document.querySelector('[data-req-next]').addEventListener('click', () => goTo(index + 1));

    update();
  })();

  /* ------------------------------------------------------------------------
     3d) LIGHTBOX DE VÍDEO — clique no vídeo da Mídia abre em destaque (desktop)
     ------------------------------------------------------------------------ */

  (function initVideoLightbox() {
    const overlay = document.getElementById('videoLightbox');
    const stage = document.getElementById('videoLightboxStage');
    if (!overlay || !stage) return;

    let originalParent = null;
    let originalNext = null;
    let currentPlayerEl = null;

    function openVideo(playerEl) {
      originalParent = playerEl.parentElement;
      originalNext = playerEl.nextSibling;
      currentPlayerEl = playerEl;
      stage.appendChild(playerEl);
      overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function closeVideo() {
      if (currentPlayerEl && originalParent) {
        originalParent.insertBefore(currentPlayerEl, originalNext);
        if (currentPlayerEl.__lockedPlayer) currentPlayerEl.__lockedPlayer.pause();
      }
      overlay.classList.remove('is-open');
      document.body.style.overflow = activeModalId ? 'hidden' : '';
      currentPlayerEl = null;
      originalParent = null;
      originalNext = null;
    }

    document.querySelectorAll('.media-item.type-video .locked-player').forEach((playerEl) => {
      playerEl.addEventListener('click', (e) => {
        if (window.innerWidth < 861) return; // apenas desktop
        if (e.target.closest('.locked-player-controls')) return;
        if (overlay.classList.contains('is-open')) return;
        openVideo(playerEl);
      });
    });

    overlay.querySelector('[data-video-lightbox-close]').addEventListener('click', closeVideo);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeVideo();
    });

    document.addEventListener('keydown', (e) => {
      if (overlay.classList.contains('is-open') && e.key === 'Escape') closeVideo();
    });
  })();

  /* ------------------------------------------------------------------------
     4) DOCUMENTO OFICIAL — carrega o PDF só quando o modal abre
     ------------------------------------------------------------------------ */

  let pdfLoaded = false;
  function initPdfViewer() {
    if (pdfLoaded) return;
    pdfLoaded = true;
    const pdfFrame = document.getElementById('pdfFrame');
    const pdfSrc = pdfFrame.getAttribute('data-pdf-src');
    if (pdfSrc) pdfFrame.src = pdfSrc;
  }

  /* ------------------------------------------------------------------------
     5) MÍDIA — players travados carregados sob demanda
     ------------------------------------------------------------------------ */

  let mediaPlayersInitialized = false;
  function initMediaPlayers() {
    if (mediaPlayersInitialized) return;
    mediaPlayersInitialized = true;

    document.querySelectorAll('[data-media-player]').forEach((container, i) => {
      const videoId = container.getAttribute('data-video-id');
      const start = parseFloat(container.getAttribute('data-start'));
      const end = parseFloat(container.getAttribute('data-end'));
      const ytTarget = container.querySelector('.locked-player-yt');
      const uniqueId = `media-yt-${i}`;
      ytTarget.id = uniqueId;

      const player = new LockedYTPlayer({
        elementId: uniqueId,
        videoId,
        start,
        end,
        ambient: false,
        loop: false,
      });

      wireLockedPlayerControls(container, player);
    });
  }

  /* ------------------------------------------------------------------------
     6) Controles customizados reutilizáveis para LockedYTPlayer
     ------------------------------------------------------------------------ */

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function wireLockedPlayerControls(container, player) {
    container.__lockedPlayer = player;
    container.setAttribute('data-locked-instance', 'true');

    const toggleBtn = container.querySelector('[data-video-toggle]');
    const iconPlay = container.querySelector('[data-icon-play]');
    const iconPause = container.querySelector('[data-icon-pause]');
    const seekBtns = container.querySelectorAll('[data-video-seek]');
    const bar = container.querySelector('[data-video-bar]');
    const fill = container.querySelector('[data-video-fill]');
    const timeLabel = container.querySelector('[data-video-time]');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        player.toggle();
      });
    }

    seekBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseFloat(btn.getAttribute('data-video-seek'));
        player.seekBy(delta);
      });
    });

    if (bar) {
      bar.addEventListener('click', (e) => {
        const rect = bar.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;
        player.seekToFraction(fraction);
      });
    }

    const fsBtn = container.querySelector('[data-video-fullscreen]');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        const el = container;
        const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (request) request.call(el);
      });
    }

    // Atualiza ícones conforme o estado de reprodução
    const originalOnReady = player.onReadyCb;
    player.onReadyCb = (p) => {
      if (originalOnReady) originalOnReady(p);
    };

    player.onStateChangeCb = (isPlaying) => {
      if (iconPlay && iconPause) {
        iconPlay.style.display = isPlaying ? 'none' : '';
        iconPause.style.display = isPlaying ? '' : 'none';
      }
    };

    player.onProgressCb = (progress, currentTime) => {
      if (fill) fill.style.width = `${progress * 100}%`;
      if (timeLabel) timeLabel.textContent = formatTime(currentTime - player.start);
    };
  }

});
