/* ==========================================================================
   LockedYTPlayer
   Player do YouTube (via IFrame API) restrito a um trecho [start, end].
   - Sem controles nativos, sem barra de progresso arrastável para fora do trecho.
   - Suporta modo "ambiente" (autoplay, mudo, sem UI) e modo "controlado"
     (play/pause/avançar/voltar customizados, dentro dos limites).
   ========================================================================== */

// Promise resolvida quando a API do YouTube estiver pronta
window.__ytApiReadyResolve = null;
window.ytApiReady = new Promise((resolve) => { window.__ytApiReadyResolve = resolve; });
window.onYouTubeIframeAPIReady = function () {
  window.__ytApiReadyResolve(window.YT);
};

class LockedYTPlayer {
  /**
   * @param {Object} opts
   * @param {string} opts.elementId - id do elemento onde o iframe será criado
   * @param {string} opts.videoId - ID do vídeo do YouTube
   * @param {number} opts.start - início do trecho, em segundos
   * @param {number} opts.end - fim do trecho, em segundos
   * @param {boolean} [opts.ambient=false] - modo decorativo: autoplay, mudo, loop, sem interação
   * @param {boolean} [opts.loop=true] - ao alcançar o fim, volta ao início
   * @param {Function} [opts.onReady]
   * @param {Function} [opts.onProgress] - chamado periodicamente com (progress 0..1, currentTime)
   * @param {Function} [opts.onStateChange] - chamado com (isPlaying: boolean)
   */
  constructor(opts) {
    this.elementId = opts.elementId;
    this.videoId = opts.videoId;
    this.start = opts.start;
    this.end = opts.end;
    this.ambient = !!opts.ambient;
    this.loop = opts.loop !== false;
    this.onReadyCb = opts.onReady || null;
    this.onProgressCb = opts.onProgress || null;
    this.onStateChangeCb = opts.onStateChange || null;

    this.player = null;
    this._monitorId = null;
    this._ready = false;
    this._userWantsPlay = this.ambient;
    this._revealed = false;

    this._init();
  }

  _init() {
    window.ytApiReady.then((YT) => {
      this.player = new YT.Player(this.elementId, {
        videoId: this.videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          start: Math.floor(this.start),
          mute: 1,
          autoplay: this.ambient ? 1 : 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => this._handleReady(e),
          onStateChange: (e) => this._handleStateChange(e, YT),
        },
      });
    });
  }

  _handleReady(e) {
    this._ready = true;
    e.target.seekTo(this.start, true);
    e.target.mute();
    if (this.ambient) {
      e.target.playVideo();
    } else {
      // Garante que vídeos controlados manualmente nunca iniciem sozinhos.
      e.target.pauseVideo();
    }
    this._startMonitor();
    if (this.onReadyCb) this.onReadyCb(this);
  }

  _handleStateChange(e, YT) {
    if (e.data === YT.PlayerState.ENDED) {
      // O YouTube só dispara ENDED ao fim real do vídeo; nosso monitor
      // intercepta antes disso, mas mantemos como salvaguarda.
      this.player.seekTo(this.start, true);
      if (this._userWantsPlay) this.player.playVideo();
    }

    // Revela o vídeo somente depois que ele já está de fato reproduzindo,
    // escondendo o "flash" inicial do título e do ícone de play/pause
    // que o próprio YouTube exibe por uma fração de segundo ao carregar.
    if (!this._revealed && e.data === YT.PlayerState.PLAYING) {
      this._revealed = true;
      window.setTimeout(() => {
        const el = document.getElementById(this.elementId);
        if (el) el.classList.add('is-ready');
      }, 350);
    }

    if (this.onStateChangeCb && YT) {
      this.onStateChangeCb(e.data === YT.PlayerState.PLAYING);
    }
  }

  _startMonitor() {
    clearInterval(this._monitorId);
    this._monitorId = setInterval(() => {
      if (!this.player || typeof this.player.getCurrentTime !== 'function') return;
      let t;
      try { t = this.player.getCurrentTime(); } catch (err) { return; }
      if (t === undefined) return;

      if (t >= this.end - 0.15) {
        if (this.loop) {
          this.player.seekTo(this.start, true);
        } else {
          this.player.pauseVideo();
          this.player.seekTo(this.end, true);
        }
      } else if (t < this.start - 0.5) {
        this.player.seekTo(this.start, true);
      }

      if (this.onProgressCb) {
        const progress = Math.min(1, Math.max(0, (t - this.start) / (this.end - this.start)));
        this.onProgressCb(progress, t);
      }
    }, 200);
  }

  play() {
    this._userWantsPlay = true;
    if (this.player && this.player.playVideo) this.player.playVideo();
  }

  pause() {
    this._userWantsPlay = false;
    if (this.player && this.player.pauseVideo) this.player.pauseVideo();
  }

  toggle() {
    if (!this.player || !this.player.getPlayerState) return;
    const state = this.player.getPlayerState();
    if (state === 1) this.pause(); else this.play();
  }

  isPlaying() {
    if (!this.player || !this.player.getPlayerState) return false;
    return this.player.getPlayerState() === 1;
  }

  /** Avança ou retrocede N segundos, sempre restrito ao trecho [start, end]. */
  seekBy(deltaSeconds) {
    if (!this.player || !this.player.getCurrentTime) return;
    const t = this.player.getCurrentTime();
    const target = Math.min(this.end - 0.2, Math.max(this.start, t + deltaSeconds));
    this.player.seekTo(target, true);
  }

  /** Define a posição por uma fração 0..1 do trecho (usado por barras de progresso customizadas). */
  seekToFraction(fraction) {
    if (!this.player || !this.player.seekTo) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    const target = this.start + clamped * (this.end - this.start);
    this.player.seekTo(target, true);
  }

  destroy() {
    clearInterval(this._monitorId);
    if (this.player && this.player.destroy) {
      try { this.player.destroy(); } catch (e) { /* noop */ }
    }
  }
}

window.LockedYTPlayer = LockedYTPlayer;
