(function() {
  const loader = document.getElementById('loader');
  const startScreen = document.getElementById('startScreen');
  const startBtn = document.getElementById('startBtn');
  const mainContent = document.getElementById('mainContent');

  setTimeout(() => {
    loader.classList.add('hidden');
    startScreen.classList.remove('hidden');
    initMusic();
  }, 1500);

  const starsContainer = document.getElementById('loaderStars');
  for (let i = 0; i < 50; i++) {
    const star = document.createElement('div');
    star.style.cssText = `
      position: absolute;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      background: #fff;
      border-radius: 50%;
      top: ${Math.random() * 100}%;
      left: ${Math.random() * 100}%;
      opacity: ${Math.random() * 0.8 + 0.2};
      animation: twinkle ${Math.random() * 3 + 2}s ease-in-out infinite;
      animation-delay: ${Math.random() * 2}s;
    `;
    starsContainer.appendChild(star);
  }

  if (startBtn) {
    startBtn.addEventListener('click', function() {
      enterMain();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !startScreen.classList.contains('hidden')) {
        enterMain();
      }
    });
  }

  function enterMain() {
    startScreen.classList.add('hidden');
    mainContent.classList.add('visible');
    startStarCursor();
    if (audioPlayer && !musicPlaying) {
      toggleMusic();
    }
  }
})();

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes twinkle {
    0%, 100% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.5); }
  }
`;
document.head.appendChild(styleSheet);

function startStarCursor() {
  const symbols = ['✦', '⭐', '✧', '·'];
  document.addEventListener('mousemove', function(e) {
    if (Math.random() > 0.15) return;
    const star = document.createElement('div');
    star.className = 'star-cursor';
    star.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    star.style.left = (e.clientX + (Math.random() - 0.5) * 30) + 'px';
    star.style.top = (e.clientY + (Math.random() - 0.5) * 30) + 'px';
    star.style.color = ['#b48cff', '#ffd700', '#ff6bcd', '#fff'][Math.floor(Math.random() * 4)];
    document.body.appendChild(star);
    setTimeout(() => star.remove(), 600);
  });
}

let audioPlayer = null;
let musicPlaying = false;

function initMusic() {
  const musicUrl = document.querySelector('meta[name="music-url"]')?.content;
  if (!musicUrl) return;
  audioPlayer = new Audio(musicUrl);
  audioPlayer.loop = true;
  audioPlayer.volume = 0.3;
}

function toggleMusic() {
  if (!audioPlayer) return;
  if (musicPlaying) {
    audioPlayer.pause();
    document.getElementById('music-toggle').style.color = '#b48cff';
  } else {
    audioPlayer.play();
    document.getElementById('music-toggle').style.color = '#ffd700';
  }
  musicPlaying = !musicPlaying;
}