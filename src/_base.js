import { q, color2Hex, clearThree } from './helpers.js'

const win = typeof window == 'object'
let THREE = (win && window.THREE) || {}
if (win && !window.VANTA) window.VANTA = {}
const VANTA = (win && window.VANTA) || {}
VANTA.register = (name, Effect) => {
  return VANTA[name] = (opts) => new Effect(opts)
}
export { VANTA }

const error = function () {
  Array.prototype.unshift.call(arguments, '[VANTA]')
  return console.error.apply(this, arguments)
}

VANTA.VantaBase = class VantaBase {
  constructor(userOptions = {}) {
    if (!win) return false
    VANTA.current = this
    this.resize = this.resize.bind(this)
    this.animationLoop = this.animationLoop.bind(this)
    this.restart = this.restart.bind(this)

    const defaultOptions = (typeof this.getDefaultOptions === 'function') ? this.getDefaultOptions() : this.defaultOptions
    this.options = Object.assign({
      minHeight: 200,
      minWidth: 200,
      scale: 1,
      scaleMobile: 1,
    }, defaultOptions)

    if (userOptions instanceof HTMLElement || typeof userOptions === 'string') {
      userOptions = { el: userOptions }
    }
    Object.assign(this.options, userOptions)

    if (this.options.THREE) {
      THREE = this.options.THREE // Optionally use a custom build of three.js
    }

    // Set element
    this.el = this.options.el
    if (this.el == null) {
      error("Instance needs \"el\" param!")
    } else if (!(this.options.el instanceof HTMLElement)) {
      const selector = this.el
      this.el = q(selector)
      if (!this.el) {
        error("Cannot find element", selector)
        return
      }
    }

    this.prepareEl()
    this.initThree()
    this.setSize() // Init needs size

    try {
      this.init()
    } catch (e) {
      error('Init error', e)
      if (this.renderer && this.renderer.domElement) {
        this.el.removeChild(this.renderer.domElement)
      }
      if (this.options.backgroundColor) {
        console.log('[VANTA] Falling back to backgroundColor')
        this.el.style.background = color2Hex(this.options.backgroundColor)
      }
      return
    }

    this.resize()
    this.animationLoop(0)

    const ad = window.addEventListener
    ad('resize', this.resize)
    window.requestAnimationFrame(this.resize) // Force a resize after the first frame
  }

  setOptions(userOptions = {}) {
    Object.assign(this.options, userOptions)
  }

  prepareEl() {
    let i, child
    if (typeof Node !== 'undefined' && Node.TEXT_NODE) {
      for (i = 0; i < this.el.childNodes.length; i++) {
        const n = this.el.childNodes[i]
        if (n.nodeType === Node.TEXT_NODE) {
          const s = document.createElement('span')
          s.textContent = n.textContent
          n.parentElement.insertBefore(s, n)
          n.remove()
        }
      }
    }
    for (i = 0; i < this.el.children.length; i++) {
      child = this.el.children[i]
      if (getComputedStyle(child).position === 'static') {
        child.style.position = 'relative'
      }
      if (getComputedStyle(child).zIndex === 'auto') {
        child.style.zIndex = 1
      }
    }
    if (getComputedStyle(this.el).position === 'static') {
      this.el.style.position = 'relative'
    }
  }

  applyCanvasStyles(canvasEl, opts = {}) {
    Object.assign(canvasEl.style, {
      position: 'absolute',
      zIndex: 0,
      top: 0,
      left: 0,
      background: '',
    })
    if (this.options.pixelated) {
      canvasEl.style.imageRendering = 'pixelated'
    }
    Object.assign(canvasEl.style, opts)
    canvasEl.classList.add('vanta-canvas')
  }

  initThree() {
    if (!THREE.WebGLRenderer) {
      console.warn("[VANTA] No THREE defined on window")
      return
    }
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true  // Ensures canvas isn't cleared between frames
    });

    // Disable automatic rendering and clearing
    this.renderer.autoClear = false;

    this.el.appendChild(this.renderer.domElement)
    this.applyCanvasStyles(this.renderer.domElement)
    if (isNaN(this.options.backgroundAlpha)) {
      this.options.backgroundAlpha = 1
    }

    this.scene = new THREE.Scene()
  }

  getCanvasElement() {
    if (this.renderer) {
      return this.renderer.domElement // three.js
    }
    if (this.p5renderer) {
      return this.p5renderer.canvas // p5
    }
  }

  getCanvasRect() {
    const canvas = this.getCanvasElement()
    if (!canvas) return false
    return canvas.getBoundingClientRect()
  }

  setSize() {
    this.scale || (this.scale = 1)
    if (this.options.scale) {
      this.scale = this.options.scale
    }
    this.width = Math.max(this.el.offsetWidth, this.options.minWidth)
    this.height = Math.max(this.el.offsetHeight, this.options.minHeight)
  }

  resize() {
    this.setSize()
    if (this.camera) {
      this.camera.aspect = this.width / this.height
      if (typeof this.camera.updateProjectionMatrix === "function") {
        this.camera.updateProjectionMatrix()
      }
    }
    if (this.renderer) {
      this.renderer.setSize(this.width, this.height)
      this.renderer.setPixelRatio(1 / this.scale)
    }
    typeof this.onResize === "function" ? this.onResize() : void 0
  }

  isOnScreen() {
    const elHeight = this.el.offsetHeight
    const elRect = this.el.getBoundingClientRect()
    const scrollTop = (window.pageYOffset ||
      (document.documentElement || document.body.parentNode || document.body).scrollTop
    )
    const offsetTop = elRect.top + scrollTop
    const minScrollTop = offsetTop - window.innerHeight
    const maxScrollTop = offsetTop + elHeight
    return minScrollTop <= scrollTop && scrollTop <= maxScrollTop
  }

  animationLoop(t) {
    // === Time tracking (unchanged) ===
    this.t ||= 0
    this.t2 ||= 0
    const now = t * 1000
    if (this.prevNow) {
      let elapsedTime = (now - this.prevNow) / (1000 / 60)
      elapsedTime = Math.max(0.2, Math.min(elapsedTime, 5))
      this.t += elapsedTime
      this.t2 += (this.options.speed || 1) * elapsedTime
      if (this.uniforms) {
        this.uniforms.iTime.value = this.t2 * 0.016667
      }
    }
    this.prevNow = now

    const bgColor = this.options.backgroundColor; // Or color2Hex(this.options.backgroundColor)
    const bgAlpha = this.options.backgroundAlpha;

    this.renderer.setClearColor(bgColor, bgAlpha);
    // Clear the color, depth, and stencil buffers.
    this.renderer.clear(true, true, true);

    // 3. Call the effect's update logic
    // This is where object positions, visibility, etc., are updated based on the new time.
    if (typeof this.onUpdate === "function") {
      this.onUpdate();
    }

    // 4. Render the scene with the updated objects
    this.renderer.render(this.scene, this.camera);

    // === Callbacks (unchanged) ===
    if (this.fps && this.fps.update) this.fps.update()
    if (typeof this.afterRender === "function") this.afterRender()
  }


  restart() {
    if (this.scene) {
      while (this.scene.children.length) {
        this.scene.remove(this.scene.children[0])
      }
    }
    if (typeof this.onRestart === "function") {
      this.onRestart()
    }
    this.init()
  }

  init() {
    if (typeof this.onInit === "function") {
      this.onInit()
    }
  }

  destroy() {
    if (typeof this.onDestroy === "function") {
      this.onDestroy()
    }
    const rm = window.removeEventListener
    rm('resize', this.resize)
    window.cancelAnimationFrame(this.req)

    const scene = this.scene
    if (scene && scene.children) {
      clearThree(scene)
    }
    if (this.renderer) {
      if (this.renderer.domElement) {
        this.el.removeChild(this.renderer.domElement)
      }
      this.renderer = null
      this.scene = null
    }

    if (VANTA.current === this) {
      VANTA.current = null
    }
  }
}

export default VANTA.VantaBase