/* =============================================
   NEURAL CANVAS v2.0 — script.js
   ============================================= */

class NeuralCanvas {
  constructor() {
    this.canvas      = document.getElementById('mainCanvas');
    this.ctx         = this.canvas.getContext('2d');
    this.original    = null;   // original ImageData
    this.currentFilter = 'none';
    this.isProcessing  = false;
    this.currentMode   = 'canvas'; // canvas | compare

    this.adj = { intensity: 100, contrast: 0, brightness: 0, saturation: 0, blur: 0 };

    this._initNoise();
    this._initListeners();
    this._restoreTheme();
  }

  /* ---- NOISE CANVAS ---- */
  _initNoise() {
    const nc = document.getElementById('noiseCanvas');
    if (!nc) return;
    const w = nc.width  = window.innerWidth;
    const h = nc.height = window.innerHeight;
    const ctx = nc.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ---- LISTENERS ---- */
  _initListeners() {
    /* Upload */
    const fileInput  = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');

    fileInput.addEventListener('change', e => {
      if (e.target.files[0]) this._load(e.target.files[0]);
    });
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => {
      e.preventDefault(); uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault(); uploadArea.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) this._load(f);
    });

    /* Filter cards */
    document.querySelectorAll('.filter-card').forEach(btn => {
      btn.addEventListener('click', () => this._applyFilter(btn.dataset.filter));
    });

    /* Sliders */
    const sliderCfg = [
      { id: 'intensity',   min: 0,    max: 100,  unit: '%' },
      { id: 'contrast',    min: -50,  max: 50,   unit: '%' },
      { id: 'brightness',  min: -50,  max: 50,   unit: '%' },
      { id: 'saturation',  min: -100, max: 100,  unit: '%' },
      { id: 'blur',        min: 0,    max: 10,   unit: 'px' },
    ];
    sliderCfg.forEach(({ id, min, max, unit }) => {
      const el  = document.getElementById(`${id}Slider`);
      const val = document.getElementById(`${id}Value`);
      const fill = document.getElementById(`${id}Fill`);

      el.addEventListener('input', () => {
        const v = parseInt(el.value);
        this.adj[id] = v;
        val.textContent = `${v}${unit}`;
        // fill calculation
        const pct = ((v - min) / (max - min)) * 100;
        if (fill) fill.style.width = `${pct}%`;
        this._debounce(() => this._render(), 80)();
      });
    });

    /* Buttons */
    document.getElementById('resetBtn').addEventListener('click',    () => this._reset());
    document.getElementById('compareBtn').addEventListener('click',  () => this._toggleMode('compare'));
    document.getElementById('viewBtn').addEventListener('click',     () => this._toggleMode('canvas'));
    document.getElementById('downloadBtn').addEventListener('click', () => this._download());
    document.getElementById('shareBtn').addEventListener('click',    () => this._share());
    document.getElementById('themeToggle').addEventListener('click', () => this._toggleTheme());
    document.getElementById('resetAdjBtn').addEventListener('click', () => this._resetAdj());
  }

  /* ---- THEME ---- */
  _restoreTheme() {
    const t = localStorage.getItem('nc-theme') || 'dark';
    if (t === 'light') this._setTheme('light');
  }
  _setTheme(t) {
    document.body.classList.toggle('light-theme', t === 'light');
    const moon = document.getElementById('moonIcon');
    const sun  = document.getElementById('sunIcon');
    if (moon) moon.style.display = t === 'light' ? 'none' : 'block';
    if (sun)  sun.style.display  = t === 'light' ? 'block' : 'none';
    localStorage.setItem('nc-theme', t);
  }
  _toggleTheme() {
    const isLight = document.body.classList.contains('light-theme');
    this._setTheme(isLight ? 'dark' : 'light');
  }

  /* ---- LOAD ---- */
  _load(file) {
    if (!file.type.startsWith('image/')) { this._toast('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        this._setup(img);
        this._showCanvas();
        this._populateInfo(file, img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  _setup(img) {
    const maxW = 900, maxH = 650;
    let { width: w, height: h } = img;
    if (w > maxW) { h = (h * maxW) / w; w = maxW; }
    if (h > maxH) { w = (w * maxH) / h; h = maxH; }
    this.canvas.width = Math.round(w);
    this.canvas.height = Math.round(h);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(img, 0, 0, Math.round(w), Math.round(h));
    this.original = this.ctx.getImageData(0, 0, Math.round(w), Math.round(h));
    // store thumb
    this._thumbDataUrl = this.canvas.toDataURL();
  }

  _showCanvas() {
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('canvasContainer').style.display = 'block';
    document.getElementById('compareView').style.display    = 'none';

    const toolbar = document.getElementById('canvasToolbar');
    toolbar.style.opacity        = '1';
    toolbar.style.pointerEvents  = 'auto';

    document.getElementById('downloadBtn').disabled = false;
    document.getElementById('shareBtn').disabled    = false;
    document.getElementById('statsStrip').style.display = 'flex';
    this._updateStats();
    this.currentMode = 'canvas';
    this._setActiveToolBtn('viewBtn');
  }

  _populateInfo(file, img) {
    const info  = document.getElementById('imageInfo');
    const thumb = document.getElementById('infoThumb');
    const name  = document.getElementById('infoName');
    const dims  = document.getElementById('infoDims');

    thumb.src = this._thumbDataUrl;
    name.textContent = file.name.length > 24 ? file.name.slice(0, 22) + '…' : file.name;
    dims.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
    info.style.display = 'block';
  }

  /* ---- FILTER ---- */
  _applyFilter(name) {
    document.querySelectorAll('.filter-card').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-filter="${name}"]`).classList.add('active');
    document.getElementById('activeBadge').textContent =
      name.charAt(0).toUpperCase() + name.slice(1) || 'Original';
    this.currentFilter = name;
    this._render();
    this._updateStats();
  }

  _render() {
    if (!this.original || this.isProcessing) return;
    this._showProc();
    setTimeout(() => {
      let id = new ImageData(
        new Uint8ClampedArray(this.original.data),
        this.original.width, this.original.height
      );
      const t0 = performance.now();
      id = this._applyEffect(id, this.currentFilter);
      id = this._applyAdj(id);
      this.ctx.putImageData(id, 0, 0);
      const ms = Math.round(performance.now() - t0);
      document.getElementById('statTime').textContent = ms;
      this._hideProc();
      // refresh compare if visible
      if (this.currentMode === 'compare') this._showCompare();
    }, 16);
  }

  /* ---- EFFECTS ---- */
  _applyEffect(id, name) {
    const intensity = this.adj.intensity / 100;
    switch (name) {
      case 'vintage':    return this._vintage(id, intensity);
      case 'oil':        return this._oilPaint(id, intensity);
      case 'watercolor': return this._watercolor(id, intensity);
      case 'sketch':     return this._sketch(id, intensity);
      case 'neon':       return this._neon(id, intensity);
      case 'dramatic':   return this._dramatic(id, intensity);
      case 'dreamy':     return this._dreamy(id, intensity);
      case 'pixelate':   return this._pixelate(id, intensity);
      default:           return id;
    }
  }

  _vintage(id, t) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      const tr = 0.393*r + 0.769*g + 0.189*b;
      const tg = 0.349*r + 0.686*g + 0.168*b;
      const tb = 0.272*r + 0.534*g + 0.131*b;
      d[i]   = r + (Math.min(255, tr) - r) * t;
      d[i+1] = g + (Math.min(255, tg) - g) * t;
      d[i+2] = b + (Math.min(255, tb) - b) * t;
    }
    return id;
  }

  _oilPaint(id, t) {
    const d = id.data, w = id.width, h = id.height;
    const out = new Uint8ClampedArray(d);
    const r = Math.max(1, Math.round(3 * t));
    for (let y = r; y < h - r; y++) {
      for (let x = r; x < w - r; x++) {
        let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const ni = ((y+dy)*w + (x+dx)) * 4;
            rSum += d[ni]; gSum += d[ni+1]; bSum += d[ni+2]; cnt++;
          }
        }
        const oi = (y*w + x) * 4;
        out[oi]   = rSum / cnt;
        out[oi+1] = gSum / cnt;
        out[oi+2] = bSum / cnt;
        out[oi+3] = d[oi+3];
      }
    }
    return new ImageData(out, w, h);
  }

  _watercolor(id, t) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]   = d[i]   + (255 - d[i])   * 0.15 * t;
      d[i+1] = d[i+1] + (255 - d[i+1]) * 0.15 * t;
      d[i+2] = d[i+2] + (255 - d[i+2]) * 0.15 * t;
    }
    return id;
  }

  _sketch(id, t) {
    const d = id.data, w = id.width, h = id.height;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0; i < d.length; i += 4)
      gray[i/4] = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        const idx = y*w + x;
        const e = Math.abs(gray[idx] - gray[idx-1]) + Math.abs(gray[idx] - gray[idx+1]) +
                  Math.abs(gray[idx] - gray[idx-w]) + Math.abs(gray[idx] - gray[idx+w]);
        const v = 255 - Math.min(255, e * t * 1.5);
        const pi = idx * 4;
        d[pi] = d[pi+1] = d[pi+2] = v;
      }
    }
    return id;
  }

  _neon(id, t) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      const edge = gray > 128 ? 1 : 0;
      d[i]   = Math.min(255, d[i]   * (1 + t * 0.8) + edge * 30 * t);
      d[i+1] = Math.min(255, d[i+1] * (1 + t * 0.4));
      d[i+2] = Math.min(255, d[i+2] * (1 + t * 1.2) + edge * 50 * t);
    }
    return id;
  }

  _dramatic(id, t) {
    const d = id.data;
    const c = 1 + t * 0.8;
    for (let i = 0; i < d.length; i += 4) {
      d[i]   = Math.min(255, Math.max(0, (d[i]   / 255 - 0.5) * c + 0.5) * 255);
      d[i+1] = Math.min(255, Math.max(0, (d[i+1] / 255 - 0.5) * c + 0.5) * 255);
      d[i+2] = Math.min(255, Math.max(0, (d[i+2] / 255 - 0.5) * c + 0.5) * 255);
    }
    return id;
  }

  _dreamy(id, t) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]   = d[i]   + (255 - d[i])   * 0.22 * t;
      d[i+1] = d[i+1] + (255 - d[i+1]) * 0.18 * t;
      d[i+2] = d[i+2] + (255 - d[i+2]) * 0.28 * t;
    }
    return id;
  }

  _pixelate(id, t) {
    const d = id.data, w = id.width, h = id.height;
    const size = Math.max(2, Math.round(t * 20));
    const out = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        let r = 0, g = 0, b = 0, cnt = 0;
        for (let dy = 0; dy < size && y+dy < h; dy++) {
          for (let dx = 0; dx < size && x+dx < w; dx++) {
            const ni = ((y+dy)*w + (x+dx)) * 4;
            r += d[ni]; g += d[ni+1]; b += d[ni+2]; cnt++;
          }
        }
        r /= cnt; g /= cnt; b /= cnt;
        for (let dy = 0; dy < size && y+dy < h; dy++) {
          for (let dx = 0; dx < size && x+dx < w; dx++) {
            const oi = ((y+dy)*w + (x+dx)) * 4;
            out[oi] = r; out[oi+1] = g; out[oi+2] = b; out[oi+3] = d[oi+3];
          }
        }
      }
    }
    return new ImageData(out, w, h);
  }

  /* ---- ADJUSTMENTS ---- */
  _applyAdj(id) {
    const d = id.data;
    const contrast   = (this.adj.contrast   / 100) + 1;
    const brightness = this.adj.brightness;
    const saturation = (this.adj.saturation / 100) + 1;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i+1], b = d[i+2];
      // brightness
      r = Math.min(255, Math.max(0, r + brightness));
      g = Math.min(255, Math.max(0, g + brightness));
      b = Math.min(255, Math.max(0, b + brightness));
      // contrast
      r = ((r/255 - 0.5) * contrast + 0.5) * 255;
      g = ((g/255 - 0.5) * contrast + 0.5) * 255;
      b = ((b/255 - 0.5) * contrast + 0.5) * 255;
      // saturation
      const gray = 0.299*r + 0.587*g + 0.114*b;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
      d[i]   = Math.min(255, Math.max(0, r));
      d[i+1] = Math.min(255, Math.max(0, g));
      d[i+2] = Math.min(255, Math.max(0, b));
    }

    if (this.adj.blur > 0) return this._blur(id, this.adj.blur);
    return id;
  }

  _blur(id, radius) {
    const d = id.data, w = id.width, h = id.height;
    const out = new Uint8ClampedArray(d);
    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        let r=0, g=0, b=0, a=0, cnt=0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ni = ((y+dy)*w + (x+dx)) * 4;
            r += d[ni]; g += d[ni+1]; b += d[ni+2]; a += d[ni+3]; cnt++;
          }
        }
        const oi = (y*w + x) * 4;
        out[oi] = r/cnt; out[oi+1] = g/cnt; out[oi+2] = b/cnt; out[oi+3] = a/cnt;
      }
    }
    return new ImageData(out, w, h);
  }

  /* ---- MODE TOGGLE ---- */
  _toggleMode(mode) {
    if (mode === this.currentMode && mode !== 'compare') return;
    if (mode === 'compare') this._showCompare();
    else this._showCanvas();
  }

  _showCompare() {
    if (!this.original) return;
    this.currentMode = 'compare';
    this._setActiveToolBtn('compareBtn');

    // Original thumb
    const oc = document.createElement('canvas');
    oc.width = this.canvas.width; oc.height = this.canvas.height;
    oc.getContext('2d').putImageData(this.original, 0, 0);
    document.getElementById('beforeImg').src = oc.toDataURL();
    document.getElementById('afterImg').src  = this.canvas.toDataURL();

    document.getElementById('canvasContainer').style.display = 'none';
    document.getElementById('compareView').style.display = 'flex';
  }

  _setActiveToolBtn(id) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  /* ---- RESET ---- */
  _reset() {
    if (!this.original) return;
    this.ctx.putImageData(this.original, 0, 0);
    this.currentFilter = 'none';
    document.querySelectorAll('.filter-card').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-filter="none"]').classList.add('active');
    document.getElementById('activeBadge').textContent = 'Original';
    this._resetAdj();
    if (this.currentMode === 'compare') this._showCompare();
    this._updateStats();
    this._toast('Reset to original');
  }

  _resetAdj() {
    const defaults = { intensity: 100, contrast: 0, brightness: 0, saturation: 0, blur: 0 };
    const units    = { intensity: '%', contrast: '%', brightness: '%', saturation: '%', blur: 'px' };
    const ranges   = { intensity:[0,100], contrast:[-50,50], brightness:[-50,50], saturation:[-100,100], blur:[0,10] };
    Object.entries(defaults).forEach(([k, v]) => {
      this.adj[k] = v;
      const el   = document.getElementById(`${k}Slider`);
      const val  = document.getElementById(`${k}Value`);
      const fill = document.getElementById(`${k}Fill`);
      if (el)  el.value = v;
      if (val) val.textContent = `${v}${units[k]}`;
      if (fill) {
        const [min, max] = ranges[k];
        fill.style.width = `${((v - min) / (max - min)) * 100}%`;
      }
    });
    if (this.original) this._render();
  }

  /* ---- PROCESSING ---- */
  _showProc() {
    this.isProcessing = true;
    document.getElementById('processingOverlay').style.display = 'flex';
  }
  _hideProc() {
    this.isProcessing = false;
    document.getElementById('processingOverlay').style.display = 'none';
  }

  /* ---- STATS ---- */
  _updateStats() {
    const name = this.currentFilter;
    document.getElementById('statFilter').textContent =
      name === 'none' ? 'None' : name.charAt(0).toUpperCase() + name.slice(1);
    document.getElementById('statSize').textContent =
      `${this.canvas.width}×${this.canvas.height}`;
  }

  /* ---- DOWNLOAD ---- */
  _download() {
    const link = document.createElement('a');
    link.download = `neural-canvas-${this.currentFilter}-${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
    this._toast('Image downloaded!');
  }

  /* ---- SHARE ---- */
  async _share() {
    this.canvas.toBlob(async blob => {
      const file = new File([blob], 'neural-canvas.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: 'Neural Canvas Creation', files: [file] });
        } catch (e) { if (e.name !== 'AbortError') this._copyFallback(); }
      } else {
        this._copyFallback();
      }
    });
  }

  async _copyFallback() {
    try {
      const blob = await new Promise(r => this.canvas.toBlob(r));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this._toast('Image copied to clipboard!');
    } catch {
      this._toast('Share not supported on this browser');
    }
  }

  /* ---- TOAST ---- */
  _toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ---- DEBOUNCE ---- */
  _debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
}

document.addEventListener('DOMContentLoaded', () => new NeuralCanvas());
