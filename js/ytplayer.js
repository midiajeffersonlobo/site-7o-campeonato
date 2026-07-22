/* ==========================================================================
   LocalClipPlayer
   Wrapper fino sobre um elemento <video> local (arquivo já cortado no
   trecho desejado — sem necessidade de "start/end" como no antigo player
   do YouTube). Mantém a mesma interface usada pelos controles customizados
   (play/pause, seekBy, seekToFraction, barra de progresso, fullscreen).
   ========================================================================== */

class LocalClipPlayer {
  /**
   * @param {Object} opts
   * @param {HTMLVideoElement} opts.videoEl - elemento <video> já presente no DOM
   * @param {boolean} [opts.ambient=false] - modo decorativo: autoplay, mudo, loop, sem interação
   * @param {boolean} [opts.loop=true] - ao alcançar o fim, volta ao início
   * @param {Function} [opts.onReady]
   * @param {Function} [opts.onProgress] - chamado periodicamente com (progress 0..1, currentTime)
   * @param {Function} [opts.onStateChange] - chamado com (isPlaying: boolean)
   */
  constructor(opts) {
    this.video = opts.videoEl;
    this.ambient = !!opts.ambient;
    this.loop = opts.loop !== false;
    this.onReadyCb = opts.onReady || null;
    this.onProgressCb = opts.onProgress || null;
    this.onStateChangeCb = opts.onStateChange || null;

    // Compatibilidade com formatTime(currentTime - player.start) do main.js
    this.start = 0;

    this._revealed = false;

    this._init();
  }

  _init() {
    if (!this.video) return;
    this.video.loop = this.loop && this.ambient; // loop nativo só no modo ambiente; no modo controlado o loop é manual
    this.video.muted = true;

    this.video.addEventListener('loadedmetadata', () => this._handleReady());
    if (this.video.readyState >= 1) this._handleReady();

    this.video.addEventListener('play', () => this._handleStateChange(true));
    this.video.addEventListener('pause', () => this._handleStateChange(false));
    this.video.addEventListener('timeupdate', () => this._handleProgress());
    this.video.addEventListener('ended', () => {
      if (this.loop) {
        this.video.currentTime = 0;
        this.video.play().catch(() => {});
      }
    });

    if (this.ambient) {
      this.video.play().catch(() => {});
    }
  }

  _handleReady() {
    if (this.onReadyCb) this.onReadyCb(this);
  }

  _handleStateChange(isPlaying) {
    if (!this._revealed && isPlaying) {
      this._revealed = true;
      window.setTimeout(() => {
        this.video.classList.add('is-ready');
      }, 150);
    }
    if (this.onStateChangeCb) this.onStateChangeCb(isPlaying);
  }

  _handleProgress() {
    if (!this.video.duration) return;
    const t = this.video.currentTime;
    const progress = Math.min(1, Math.max(0, t / this.video.duration));
    if (this.onProgressCb) this.onProgressCb(progress, t);
  }

  play() {
    if (this.video) this.video.play().catch(() => {});
  }

  pause() {
    if (this.video) this.video.pause();
  }

  toggle() {
    if (!this.video) return;
    if (this.video.paused) this.play(); else this.pause();
  }

  isPlaying() {
    return !!this.video && !this.video.paused;
  }

  /** Avança ou retrocede N segundos, sempre dentro da duração do clipe. */
  seekBy(deltaSeconds) {
    if (!this.video || !this.video.duration) return;
    const target = Math.min(this.video.duration - 0.1, Math.max(0, this.video.currentTime + deltaSeconds));
    this.video.currentTime = target;
  }

  /** Define a posição por uma fração 0..1 do clipe (usado por barras de progresso customizadas). */
  seekToFraction(fraction) {
    if (!this.video || !this.video.duration) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    this.video.currentTime = clamped * this.video.duration;
  }

  destroy() {
    if (this.video) this.video.pause();
  }
}

window.LocalClipPlayer = LocalClipPlayer;
