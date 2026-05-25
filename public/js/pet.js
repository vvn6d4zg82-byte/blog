(function() {
  if (typeof window.__INITIAL_DATA__ === 'undefined') return;

  const container = document.getElementById('amiyaPet');
  const canvas = document.getElementById('amiyaCanvas');
  if (!container || !canvas) return;

  const animations = ['idle', 'walk', 'wave', 'special'];

  async function loadSpineRuntime() {
    if (typeof spine === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-canvas@4.2.0/dist/spine-canvas.iife.js');
    }

    const modelPath = '/models/amiya/';
    const atlasUrl = modelPath + 'build_char_002_amiya.atlas';
    const skelUrl = modelPath + 'build_char_002_amiya.skel';

    try {
      const atlasText = await fetch(atlasUrl).then(r => r.text());
      const atlas = new spine.TextureAtlas(atlasText, function(path) {
        return new spine.ImageTexture(new Image());
      });

      const skelData = await fetch(skelUrl).then(r => r.arrayBuffer());
      const skelBinary = new Uint8Array(skelData);
      const skelReader = new spine.SkeletonBinary(atlas);
      const skeletonData = skelReader.readSkeletonData(skelBinary);

      const canvasEl = canvas;
      const ctx = canvasEl.getContext('2d');
      canvasEl.width = 200;
      canvasEl.height = 240;

      const renderer = new spine.CanvasRenderer(ctx);

      const skeleton = new spine.Skeleton(skeletonData);
      skeleton.setSkinByName('default');
      skeleton.setSlotsToSetupPose();
      skeleton.updateWorldTransform();

      const stateData = new spine.AnimationStateData(skeletonData);
      const state = new spine.AnimationState(stateData);

      let currentAnimIndex = 0;
      const animNames = skeletonData.animations.map(a => a.name);

      if (animNames.length > 0) {
        state.setAnimation(0, animNames[0], true);
      }

      function renderLoop() {
        state.update(1/60);
        state.apply(skeleton);
        skeleton.updateWorldTransform();

        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        renderer.begin();
        renderer.drawSkeleton(skeleton, false);
        renderer.end();

        requestAnimationFrame(renderLoop);
      }

      renderLoop();

      let readyToClick = true;
      container.addEventListener('click', function() {
        if (!readyToClick) return;
        readyToClick = false;
        setTimeout(() => { readyToClick = true; }, 500);

        currentAnimIndex = (currentAnimIndex + 1) % animNames.length;
        state.setAnimation(0, animNames[currentAnimIndex], true);
      });

    } catch(e) {
      console.warn('Spine character not available:', e.message);
      drawFallback();
    }
  }

  function drawFallback() {
    const ctx = canvas.getContext('2d');
    canvas.width = 120;
    canvas.height = 150;
    ctx.fillStyle = '#f5f0f0';
    ctx.beginPath();
    ctx.ellipse(60, 35, 30, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2a6a';
    ctx.fillRect(38, 65, 44, 50);
    ctx.fillStyle = '#f5f0f0';
    ctx.fillRect(45, 117, 12, 25);
    ctx.fillRect(63, 117, 12, 25);
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(48, 37, 3, 0, Math.PI * 2);
    ctx.arc(72, 37, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(49, 38, 1.5, 0, Math.PI * 2);
    ctx.arc(73, 38, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSpineRuntime);
  } else {
    loadSpineRuntime();
  }
})();