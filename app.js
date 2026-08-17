"use strict";

/* ====================================================================
   Rock Paper Scissors – MediaPipe Hands + Camera Utility
   The Camera class handles getUserMedia + RAF loop automatically.
   We only need to initialise Hands, pass frames, and read results.
===================================================================== */

// ── State ─────────────────────────────────────────────────────────────
const state = {
    cameraRunning : false,
    mirrored      : true,
    soundEnabled  : true,
    autoMode      : false,
    isPlaying     : false,
    currentGesture: 'NONE',
    playerScore   : 0,
    cpuScore      : 0,
    drawScore     : 0,
    streak        : 0,
    history       : []
};

// ── DOM ───────────────────────────────────────────────────────────────
const video        = document.getElementById('video');
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const camOverlay   = document.getElementById('camOverlay');
const camMsg       = document.getElementById('camMsg');
const freezeOverlay= document.getElementById('freezeOverlay');
const freezeEmoji  = document.getElementById('freezeEmoji');
const camDot       = document.getElementById('camDot');
const gesturePill  = document.getElementById('gesturePill');
const gestureEmoji = document.getElementById('gestureEmoji');
const gestureLabel = document.getElementById('gestureLabel');

const btnPlay    = document.getElementById('btnPlay');
const btnAuto    = document.getElementById('btnAuto');
const btnReset   = document.getElementById('btnReset');
const btnSound   = document.getElementById('btnSound');
const btnMirror  = document.getElementById('btnMirror');
const btnToggle  = document.getElementById('btnToggleCam');

const countdown  = document.getElementById('countdown');
const cdNumber   = document.getElementById('cdNumber');
const resultBox  = document.getElementById('resultBox');
const resultTitle= document.getElementById('resultTitle');
const resultSub  = document.getElementById('resultSub');

const scorePlayer= document.getElementById('scorePlayer');
const scoreCPU   = document.getElementById('scoreCPU');
const scoreDraw  = document.getElementById('scoreDraw');
const scoreStreak= document.getElementById('scoreStreak');

const cpuMove    = document.getElementById('cpuMove');
const cpuLabel   = document.getElementById('cpuLabel');
const cpuBadge   = document.getElementById('cpuBadge');

const gRock      = document.getElementById('gRock');
const gPaper     = document.getElementById('gPaper');
const gScissors  = document.getElementById('gScissors');
const histList   = document.getElementById('histList');
const histCount  = document.getElementById('histCount');

// ── Audio (Web Audio API) ─────────────────────────────────────────────
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}
function playTone(freq, dur, type = 'sine') {
    if (!state.soundEnabled) return;
    try {
        const ac = getAudioCtx();
        const o  = ac.createOscillator();
        const g  = ac.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.14, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + dur);
    } catch(e) {}
}
const sfx = {
    beep : () => playTone(440,  0.10),
    go   : () => playTone(880,  0.18),
    win  : () => [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f,0.14,'triangle'), i*80)),
    lose : () => [392,311,262]     .forEach((f,i) => setTimeout(() => playTone(f,0.18,'sawtooth'), i*110)),
    draw : () => { playTone(440,0.12); setTimeout(() => playTone(440,0.16),130); }
};

// ── Gesture helpers ──────────────────────────────────────────────────
const EMOJI = { ROCK:'✊', PAPER:'✋', SCISSORS:'✌️', NONE:'🔍' };

function classify(landmarks) {
    /* landmarks: array of 21 {x,y,z} points in normalised coords [0..1]
       MediaPipe index mapping:
         Wrist=0
         Thumb: 1-4 (tip=4)
         Index: 5-8 (tip=8)  pip=6
         Middle:9-12(tip=12) pip=10
         Ring: 13-16(tip=16) pip=14
         Pinky:17-20(tip=20) pip=18
    */
    if (!landmarks || landmarks.length < 21) return 'NONE';

    const d = (a,b) => Math.hypot(a.x-b.x, a.y-b.y, (a.z||0)-(b.z||0));
    const w = landmarks[0]; // wrist

    // A finger is "extended" when its tip is farther from the wrist
    // than its PIP joint is, with a small margin.
    const indexUp  = d(landmarks[8],  w) > d(landmarks[6],  w) * 1.05;
    const middleUp = d(landmarks[12], w) > d(landmarks[10], w) * 1.05;
    const ringUp   = d(landmarks[16], w) > d(landmarks[14], w) * 1.05;
    const pinkyUp  = d(landmarks[20], w) > d(landmarks[18], w) * 1.05;

    const count = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

    // Check Scissors first (strict two-finger check)
    if (indexUp && middleUp && !ringUp && !pinkyUp) return 'SCISSORS';
    // Paper: 3 or 4 fingers up
    if (count >= 3) return 'PAPER';
    // Rock: 0 or 1 finger up
    if (count <= 1) return 'ROCK';

    return 'NONE';
}

function setGestureUI(g) {
    gRock.classList.remove('active');
    gPaper.classList.remove('active');
    gScissors.classList.remove('active');
    switch (g) {
        case 'ROCK':
            gestureEmoji.textContent = '✊';
            gestureLabel.textContent = 'ROCK Detected';
            gesturePill.style.borderColor = '#6366f1';
            gRock.classList.add('active');
            break;
        case 'PAPER':
            gestureEmoji.textContent = '✋';
            gestureLabel.textContent = 'PAPER Detected';
            gesturePill.style.borderColor = '#10b981';
            gPaper.classList.add('active');
            break;
        case 'SCISSORS':
            gestureEmoji.textContent = '✌️';
            gestureLabel.textContent = 'SCISSORS Detected';
            gesturePill.style.borderColor = '#f59e0b';
            gScissors.classList.add('active');
            break;
        default:
            gestureEmoji.textContent = '🔍';
            gestureLabel.textContent = state.cameraRunning ? 'Show your hand…' : 'Camera Off';
            gesturePill.style.borderColor = 'rgba(255,255,255,0.1)';
    }
}

// ── MediaPipe Setup ───────────────────────────────────────────────────
let mpCamera = null;

function initMediaPipe() {
    // Make sure the global Hands constructor is available
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
        camMsg.innerHTML = 'Loading scripts… <small>please wait</small>';
        setTimeout(initMediaPipe, 600);
        return;
    }

    camMsg.innerHTML = 'Initialising AI model…<br><small>First load: ~5–10 s</small>';

    const hands = new Hands({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`
    });

    hands.setOptions({
        maxNumHands      : 1,
        modelComplexity  : 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence : 0.5
    });

    hands.onResults(results => {
        // Size canvas to match video
        if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const lm = results.multiHandLandmarks[0];
            drawLandmarks(lm);
            const g = classify(lm);
            state.currentGesture = g;
            setGestureUI(g);
            camDot.classList.add('live');
        } else {
            state.currentGesture = 'NONE';
            setGestureUI('NONE');
            camDot.classList.remove('live');
        }
    });

    // Camera utility: handles getUserMedia + per-frame send
    mpCamera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width : 640,
        height: 480
    });

    startCamera();
}

function startCamera() {
    if (!mpCamera) { initMediaPipe(); return; }

    camMsg.innerHTML = 'Requesting camera permission…<br><small>Please click Allow when prompted</small>';

    mpCamera.start()
        .then(() => {
            state.cameraRunning = true;
            camOverlay.style.display = 'none'; // hide overlay → show live feed
            btnPlay.disabled = false;
            applyMirror();
        })
        .catch(err => {
            console.error('Camera start error:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                camMsg.innerHTML = '⚠️ Camera access denied.<br>Allow camera access in browser settings, then refresh.';
            } else if (err.name === 'NotFoundError') {
                camMsg.innerHTML = '⚠️ No camera detected on this device.';
            } else {
                camMsg.innerHTML = `⚠️ Camera error: ${err.message || 'unknown'}`;
            }
        });
}

function stopCamera() {
    if (mpCamera) mpCamera.stop();
    state.cameraRunning = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    camOverlay.style.display = 'flex';
    camMsg.textContent = 'Camera stopped.';
    camDot.classList.remove('live');
    btnPlay.disabled = true;
    state.currentGesture = 'NONE';
    setGestureUI('NONE');
}

function applyMirror() {
    [video, canvas].forEach(el => {
        el.classList.toggle('mirrored', state.mirrored);
    });
}

// ── Draw skeleton ─────────────────────────────────────────────────────
const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17]
];
const TIPS = new Set([4,8,12,16,20]);

function drawLandmarks(lm) {
    const W = canvas.width, H = canvas.height;
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth   = 2.5;
    CONNECTIONS.forEach(([a,b]) => {
        if (!lm[a]||!lm[b]) return;
        ctx.beginPath();
        ctx.moveTo(lm[a].x*W, lm[a].y*H);
        ctx.lineTo(lm[b].x*W, lm[b].y*H);
        ctx.stroke();
    });
    lm.forEach((p,i) => {
        ctx.beginPath();
        ctx.arc(p.x*W, p.y*H, TIPS.has(i)?6:4, 0, Math.PI*2);
        ctx.fillStyle   = TIPS.has(i) ? '#10b981' : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
    });
}

// ── Game Round Logic ──────────────────────────────────────────────────
const MOVES = ['ROCK','PAPER','SCISSORS'];

function playRound() {
    if (state.isPlaying) return;

    // Unlock audio on this user gesture
    try { getAudioCtx(); } catch(e) {}

    state.isPlaying  = true;
    btnPlay.disabled = true;
    freezeOverlay.classList.remove('show');
    resultBox.style.display   = 'none';
    countdown.style.display   = 'flex';
    cpuMove.textContent  = '❓';
    cpuLabel.textContent = 'Thinking…';
    cpuBadge.textContent = 'Ready…';

    let count = 3;
    cdNumber.textContent = count;
    sfx.beep();

    const iv = setInterval(() => {
        count--;
        if (count > 0) { cdNumber.textContent = count; sfx.beep(); }
        else {
            clearInterval(iv);
            cdNumber.textContent = 'GO!';
            sfx.go();
            setTimeout(resolveRound, 350);
        }
    }, 900);
}

function resolveRound() {
    let playerMove = state.currentGesture;
    let autoUsed   = false;

    if (playerMove === 'NONE') {
        playerMove = MOVES[Math.floor(Math.random() * 3)];
        autoUsed   = true;
    }

    const cpuChoice = MOVES[Math.floor(Math.random() * 3)];

    // Show frozen player move
    freezeEmoji.textContent = EMOJI[playerMove];
    freezeOverlay.classList.add('show');

    // Show CPU choice
    cpuMove.textContent  = EMOJI[cpuChoice];
    cpuLabel.textContent = `Computer chose ${cpuChoice}`;
    cpuBadge.textContent = cpuChoice;

    // Determine result
    let result;
    if (playerMove === cpuChoice) result = 'DRAW';
    else if (
        (playerMove==='ROCK'    && cpuChoice==='SCISSORS') ||
        (playerMove==='PAPER'   && cpuChoice==='ROCK')     ||
        (playerMove==='SCISSORS'&& cpuChoice==='PAPER')
    ) result = 'WIN';
    else result = 'LOSS';

    // Update scores
    if (result === 'WIN')       { state.playerScore++; state.streak++; sfx.win(); }
    else if (result === 'LOSS') { state.cpuScore++;    state.streak=0; sfx.lose(); }
    else                        { state.drawScore++;                   sfx.draw(); }

    scorePlayer.textContent = state.playerScore;
    scoreCPU.textContent    = state.cpuScore;
    scoreDraw.textContent   = state.drawScore;
    scoreStreak.textContent = `🔥 ${state.streak}`;

    // Show result text
    countdown.style.display = 'none';
    resultBox.style.display = 'flex';

    if (result === 'WIN') {
        resultTitle.textContent = '🎉 YOU WIN!';
        resultTitle.className   = 'result-title win';
    } else if (result === 'LOSS') {
        resultTitle.textContent = '🤖 COMPUTER WINS!';
        resultTitle.className   = 'result-title loss';
    } else {
        resultTitle.textContent = "🤝 IT'S A DRAW!";
        resultTitle.className   = 'result-title draw';
    }

    resultSub.textContent = autoUsed
        ? `(No gesture detected — ${playerMove} used randomly)   CPU: ${EMOJI[cpuChoice]} ${cpuChoice}`
        : `You: ${EMOJI[playerMove]} ${playerMove}   vs   CPU: ${EMOJI[cpuChoice]} ${cpuChoice}`;

    addHistory(playerMove, cpuChoice, result);

    state.isPlaying  = false;
    btnPlay.disabled = false;

    setTimeout(() => freezeOverlay.classList.remove('show'), 2500);

    if (state.autoMode) {
        setTimeout(() => { if (state.autoMode && state.cameraRunning) playRound(); }, 3200);
    }
}

// ── History ───────────────────────────────────────────────────────────
function addHistory(p, c, r) {
    state.history.unshift({ p, c, r });
    if (state.history.length > 15) state.history.pop();
    renderHistory();
}
function renderHistory() {
    histCount.textContent = `${state.history.length} Rounds`;
    if (!state.history.length) {
        histList.innerHTML = '<p class="empty-msg">No rounds yet — start a match!</p>';
        return;
    }
    histList.innerHTML = state.history.map(h => `
        <div class="hist-item">
            <div class="hist-moves">
                <span>You: <strong>${EMOJI[h.p]} ${h.p}</strong></span>
                <span>vs</span>
                <span>CPU: <strong>${EMOJI[h.c]} ${h.c}</strong></span>
            </div>
            <span class="hist-tag ${h.r.toLowerCase()}">${h.r}</span>
        </div>`).join('');
}

// ── Event Listeners ───────────────────────────────────────────────────
btnPlay.addEventListener('click', playRound);

btnMirror.addEventListener('click', () => {
    state.mirrored = !state.mirrored;
    applyMirror();
});

btnToggle.addEventListener('click', () => {
    if (state.cameraRunning) stopCamera();
    else startCamera();
});

btnAuto.addEventListener('click', () => {
    state.autoMode = !state.autoMode;
    btnAuto.textContent = state.autoMode ? '⚡ Auto: ON' : '⚡ Auto: OFF';
    btnAuto.classList.toggle('btn-active', state.autoMode);
    if (state.autoMode && !state.isPlaying && state.cameraRunning) playRound();
});

btnReset.addEventListener('click', () => {
    Object.assign(state, { playerScore:0, cpuScore:0, drawScore:0, streak:0, history:[] });
    scorePlayer.textContent = '0'; scoreCPU.textContent = '0';
    scoreDraw.textContent   = '0'; scoreStreak.textContent = '🔥 0';
    resultTitle.textContent = 'Scores Reset!';
    resultTitle.className   = 'result-title';
    resultSub.textContent   = "Click 'PLAY ROUND' to start a new match.";
    resultBox.style.display = 'flex';
    renderHistory();
});

btnSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    btnSound.textContent = state.soundEnabled ? '🔊' : '🔇';
});

// ── Boot ──────────────────────────────────────────────────────────────
// Wait for all scripts to load then init
window.addEventListener('load', () => setTimeout(initMediaPipe, 200));
