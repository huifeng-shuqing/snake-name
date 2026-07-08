// ============================================
//   贪吃蛇 - 游戏逻辑（创新升级版）
// ============================================

// ---------- 常量与配置 ----------
const CANVAS_WIDTH  = 600;
const CANVAS_HEIGHT = 600;
const GRID_SIZE     = 20;
const GRID_COUNT    = CANVAS_WIDTH / GRID_SIZE; // 30×30

const BASE_SPEED    = 130;
const SPEED_DECAY   = 8;
const MIN_SPEED     = 50;

const COLORS = {
    bg:               '#0a0a1a',
    grid:             'rgba(255,255,255,0.03)',
    snakeHead:        '#4ade80',
    snakeHeadGlow:    '#86efac',
    snakeBodyStart:   '#22c55e',
    snakeBodyEnd:     '#166534',
    food:             '#e94560',
    foodGlow:         '#ff6b81',
    specialFood:      '#facc15',
    specialFoodGlow:  '#fde047',
    goldenFood:       '#ffa502',
    goldenFoodGlow:   '#ffcf48',
    text:             '#eee',
    textMuted:        '#999',
    obstacle:         '#4a5568',
    obstacleBorder:   '#718096',
    shield:           '#3b82f6',
    shieldGlow:       '#60a5fa',
    speedBoost:       '#f59e0b',
    speedBoostGlow:   '#fbbf24',
    doubleScore:      '#a855f7',
    doubleScoreGlow:  '#c084fc',
    portal:           '#06b6d4',
    portalGlow:       '#22d3ee',
};

// 道具类型定义
const POWERUP_TYPES = {
    shield:    { color: COLORS.shield,    glow: COLORS.shieldGlow,    icon: '🛡️', label: '护盾',  duration: Infinity },
    speed:     { color: COLORS.speedBoost, glow: COLORS.speedBoostGlow, icon: '⚡', label: '加速',  duration: 8000 },
    double:    { color: COLORS.doubleScore, glow: COLORS.doubleScoreGlow, icon: '⭐', label: '双倍',duration: 10000 },
};

const COMBO_TIMEOUT   = 2000;  // ms，连击超时
const MAX_OBSTACLES   = 15;    // 障碍物上限
const PORTAL_COOLDOWN = 3000;  // ms，传送门冷却

// ---------- DOM 元素 ----------
const canvas       = document.getElementById('gameCanvas');
const ctx          = canvas.getContext('2d');
const scoreEl      = document.getElementById('score');
const highScoreEl  = document.getElementById('highScore');
const levelEl      = document.getElementById('level');
const comboEl      = document.getElementById('combo');
const comboDisplay = document.getElementById('comboDisplay');
const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg   = document.getElementById('overlayMsg');
const actionBtn    = document.getElementById('actionBtn');
const restartBtn   = document.getElementById('restartBtn');
const pauseBtn     = document.getElementById('pauseBtn');
const shieldInd    = document.getElementById('shieldIndicator');
const speedInd     = document.getElementById('speedIndicator');
const doubleInd    = document.getElementById('doubleIndicator');

canvas.width  = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// ---------- 游戏状态 ----------
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = null;
let specialFood = null;
let score = 0;
let highScore = 0;
let level = 1;
let gameLoop = null;
let isRunning = false;
let isPaused = false;
let isGameOver = false;
let particles = [];
let trail = [];
let frameCount = 0;

// --- 新玩法状态 ---
// Combo
let combo = 0;
let comboTimer = 0;
let floatingTexts = [];

// 道具
let powerUps = [];
let activeShield = false;
let activeSpeedUntil = 0;
let activeDoubleUntil = 0;

// 障碍物
let obstacles = [];

// 传送门
let portals = [];
let portalCooldown = 0;

// 屏幕震动
let shakeAmount = 0;
let shakeDuration = 0;

// 彩虹色相
let hueShift = 0;

// 移动金苹果
let goldenFood = null;
let goldenFoodMoveCounter = 0;

// ---------- 本地存储 ----------
function loadHighScore() {
    const saved = localStorage.getItem('snake_highScore_v2');
    return saved ? parseInt(saved, 10) : 0;
}
function saveHighScore(s) {
    localStorage.setItem('snake_highScore_v2', s.toString());
    highScore = s;
    highScoreEl.textContent = s;
}
highScore = loadHighScore();
highScoreEl.textContent = highScore;

// ---------- 工具函数 ----------
function randomGridPos() {
    return {
        x: Math.floor(Math.random() * GRID_COUNT),
        y: Math.floor(Math.random() * GRID_COUNT),
    };
}

function posOnSnake(pos) {
    return snake.some(seg => seg.x === pos.x && seg.y === pos.y);
}

function posOnObstacle(pos) {
    return obstacles.some(o => o.x === pos.x && o.y === pos.y);
}

function posOnPortal(pos) {
    return portals.some(p => (p.x1 === pos.x && p.y1 === pos.y) || (p.x2 === pos.x && p.y2 === pos.y));
}

function posOnPowerUp(pos) {
    return powerUps.some(p => p.x === pos.x && p.y === pos.y);
}

function posOnFood(pos) {
    if (food && food.x === pos.x && food.y === pos.y) return true;
    if (specialFood && specialFood.x === pos.x && specialFood.y === pos.y) return true;
    if (goldenFood && goldenFood.x === pos.x && goldenFood.y === pos.y) return true;
    return false;
}

function isPosBlocked(pos) {
    return posOnSnake(pos) || posOnObstacle(pos) || posOnPortal(pos) || posOnPowerUp(pos) || posOnFood(pos);
}

function generateFood() {
    let pos;
    let tries = 0;
    do {
        pos = randomGridPos();
        tries++;
    } while (isPosBlocked(pos) && tries < 500);
    return pos;
}

// 特殊食物
function tryGenerateSpecialFood() {
    if (score > 0 && score % 5 === 0 && !specialFood && Math.random() < 0.3) {
        let pos;
        let tries = 0;
        do {
            pos = randomGridPos();
            tries++;
        } while (isPosBlocked(pos) && tries < 500);
        if (tries < 500) {
            specialFood = { ...pos, timer: 80 };
        }
    }
}

// 道具生成
function tryGeneratePowerUp() {
    if (powerUps.length > 0) return; // 同时最多 1 个
    // 5% 基础概率 + 每关 2%
    const chance = 0.05 + (level - 1) * 0.02;
    if (Math.random() < chance) {
        const types = Object.keys(POWERUP_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];
        let pos;
        let tries = 0;
        do {
            pos = randomGridPos();
            tries++;
        } while (isPosBlocked(pos) && tries < 500);
        if (tries < 500) {
            powerUps.push({ x: pos.x, y: pos.y, type, timer: 720 }); // 12 秒 @ 60fps 估算
        }
    }
}

// 障碍物生成
function generateObstacles() {
    if (level < 3) { obstacles = []; return; }
    const count = Math.min(Math.floor(level / 2), MAX_OBSTACLES);
    obstacles = [];
    let tries = 0;
    while (obstacles.length < count && tries < 1000) {
        const pos = randomGridPos();
        if (!isPosBlocked(pos) && !posOnObstacle(pos)) {
            // 不要挡住蛇头前方 3 格
            const head = snake[0];
            const tooClose = (
                Math.abs(pos.x - head.x) < 4 && Math.abs(pos.y - head.y) < 4
            );
            if (!tooClose) {
                obstacles.push(pos);
            }
        }
        tries++;
    }
}

// 传送门生成
function generatePortals() {
    if (level < 5) { portals = []; return; }
    let p1, p2;
    let tries = 0;
    do {
        p1 = randomGridPos();
        tries++;
    } while ((isPosBlocked(p1) || posOnObstacle(p1)) && tries < 500);
    tries = 0;
    do {
        p2 = randomGridPos();
        tries++;
    } while (
        (isPosBlocked(p2) || posOnObstacle(p2) || (p1.x === p2.x && p1.y === p2.y)) && tries < 500
    );
    portals = [{ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }];
    portalCooldown = 0;
}

// 金苹果生成
function tryGenerateGoldenFood() {
    if (level < 4 || goldenFood) return;
    const chance = 0.002 + (level - 4) * 0.003; // 每帧概率
    if (Math.random() < chance) {
        let pos;
        let tries = 0;
        do {
            pos = randomGridPos();
            tries++;
        } while (isPosBlocked(pos) && tries < 500);
        if (tries < 500) {
            goldenFood = { x: pos.x, y: pos.y, timer: 600 }; // 10 秒
        }
    }
}

// 金苹果移动
function moveGoldenFood() {
    if (!goldenFood) return;
    goldenFoodMoveCounter++;
    if (goldenFoodMoveCounter % 4 !== 0) return;

    const dirs = [
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    ];
    // 随机打乱
    for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const d of dirs) {
        const nx = goldenFood.x + d.x;
        const ny = goldenFood.y + d.y;
        if (nx < 0 || nx >= GRID_COUNT || ny < 0 || ny >= GRID_COUNT) continue;
        if (posOnObstacle({ x: nx, y: ny })) continue;
        if (posOnSnake({ x: nx, y: ny })) continue;
        goldenFood.x = nx;
        goldenFood.y = ny;
        break;
    }
}

// 浮动文字
function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({
        x: x * GRID_SIZE + GRID_SIZE / 2,
        y: y * GRID_SIZE + GRID_SIZE / 2,
        text,
        color,
        life: 1,
        decay: 0.025,
    });
}

function updateFloatingTexts() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y -= 1.5;
        ft.life -= ft.decay;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
}

function drawFloatingTexts() {
    for (const ft of floatingTexts) {
        ctx.save();
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 16px "Segoe UI", "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    }
}

// 屏幕震动
function triggerShake(amount, duration) {
    shakeAmount = Math.max(shakeAmount, amount);
    shakeDuration = Math.max(shakeDuration, duration);
}

function updateShake(dt) {
    if (shakeDuration > 0) {
        shakeDuration -= dt;
        if (shakeDuration <= 0) shakeAmount = 0;
    }
}

// 道具计时
function updatePowerUpTimers() {
    const now = Date.now();
    if (activeSpeedUntil && now >= activeSpeedUntil) {
        activeSpeedUntil = 0;
        updatePowerUpIndicators();
    }
    if (activeDoubleUntil && now >= activeDoubleUntil) {
        activeDoubleUntil = 0;
        updatePowerUpIndicators();
    }
    // 地上道具消失
    for (let i = powerUps.length - 1; i >= 0; i--) {
        powerUps[i].timer--;
        if (powerUps[i].timer <= 0) powerUps.splice(i, 1);
    }
}

function activatePowerUp(type) {
    const now = Date.now();
    switch (type) {
        case 'shield':
            activeShield = true;
            break;
        case 'speed':
            activeSpeedUntil = now + POWERUP_TYPES.speed.duration;
            break;
        case 'double':
            activeDoubleUntil = now + POWERUP_TYPES.double.duration;
            break;
    }
    updatePowerUpIndicators();
}

function updatePowerUpIndicators() {
    shieldInd.classList.toggle('active', activeShield);
    speedInd.classList.toggle('active', activeSpeedUntil > 0);
    doubleInd.classList.toggle('active', activeDoubleUntil > 0);
}

// 获取当前分数倍率
function getScoreMultiplier() {
    let mult = 1;
    if (combo > 0) mult += combo * 0.5;
    if (activeDoubleUntil > 0) mult *= 2;
    return mult;
}

// ---------- 粒子系统 ----------
function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 1.5 + Math.random() * 3;
        particles.push({
            x: x * GRID_SIZE + GRID_SIZE / 2,
            y: y * GRID_SIZE + GRID_SIZE / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: 0.02 + Math.random() * 0.04,
            color,
            radius: 2 + Math.random() * 3,
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---------- 拖尾 ----------
function addTrail(seg) {
    trail.push({ x: seg.x, y: seg.y, life: 0.6 });
}

function updateTrail() {
    for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].life -= 0.04;
        if (trail[i].life <= 0) trail.splice(i, 1);
    }
}

function drawTrail() {
    for (const t of trail) {
        ctx.save();
        ctx.globalAlpha = t.life * 0.3;
        ctx.fillStyle = COLORS.snakeBodyStart;
        ctx.fillRect(
            t.x * GRID_SIZE + 2, t.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4
        );
        ctx.restore();
    }
}

// ---------- 初始化 ----------
function initGame() {
    const startX = Math.floor(GRID_COUNT / 2);
    const startY = Math.floor(GRID_COUNT / 2);
    snake = [
        { x: startX, y: startY },
        { x: startX - 1, y: startY },
        { x: startX - 2, y: startY },
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    level = 1;
    isGameOver = false;
    particles = [];
    trail = [];
    frameCount = 0;

    // 新状态
    combo = 0;
    comboTimer = 0;
    floatingTexts = [];
    powerUps = [];
    activeShield = false;
    activeSpeedUntil = 0;
    activeDoubleUntil = 0;
    obstacles = [];
    portals = [];
    portalCooldown = 0;
    shakeAmount = 0;
    shakeDuration = 0;
    hueShift = 0;
    goldenFood = null;
    goldenFoodMoveCounter = 0;

    updatePowerUpIndicators();
    comboDisplay.classList.add('hidden');
    comboEl.textContent = 'x1';

    food = generateFood();
    specialFood = null;

    // 初始生成障碍物和传送门（根据关卡）
    generateObstacles();
    generatePortals();

    scoreEl.textContent = '0';
    levelEl.textContent = '1';
}

// ---------- 游戏循环 ----------
function step() {
    if (!isRunning || isPaused) return;

    const now = Date.now();
    frameCount++;

    // Combo 超时检测
    if (comboTimer > 0 && now >= comboTimer) {
        combo = 0;
        comboTimer = 0;
        comboDisplay.classList.add('hidden');
        comboEl.textContent = 'x1';
    }

    // 更新计时器
    updatePowerUpTimers();
    updateFloatingTexts();
    updateShake(16); // ~60fps

    // 金苹果
    tryGenerateGoldenFood();
    if (goldenFood) {
        goldenFood.timer--;
        if (goldenFood.timer <= 0) goldenFood = null;
        else moveGoldenFood();
    }

    // 道具生成
    tryGeneratePowerUp();

    // 应用方向
    direction = { ...nextDirection };

    // 拖尾
    addTrail(snake[snake.length - 1]);

    // 计算新头部
    const head = snake[0];
    let newHead = {
        x: head.x + direction.x,
        y: head.y + direction.y,
    };

    // --- 传送门检测 ---
    let teleported = false;
    if (portals.length > 0 && portalCooldown <= 0) {
        const portal = portals[0];
        if (newHead.x === portal.x1 && newHead.y === portal.y1) {
            newHead = { x: portal.x2, y: portal.y2 };
            teleported = true;
        } else if (newHead.x === portal.x2 && newHead.y === portal.y2) {
            newHead = { x: portal.x1, y: portal.y1 };
            teleported = true;
        }
        if (teleported) {
            portalCooldown = PORTAL_COOLDOWN;
            spawnParticles(portal.x1, portal.y1, COLORS.portalGlow, 20);
            spawnParticles(portal.x2, portal.y2, COLORS.portalGlow, 20);
            spawnFloatingText(newHead.x, newHead.y, '🌀', COLORS.portalGlow);
        }
    }
    if (portalCooldown > 0) portalCooldown -= 16;

    // --- 穿墙检测 ---
    if (newHead.x < 0 || newHead.x >= GRID_COUNT || newHead.y < 0 || newHead.y >= GRID_COUNT) {
        if (activeShield) {
            activeShield = false;
            updatePowerUpIndicators();
            spawnParticles(head.x, head.y, COLORS.shieldGlow, 20);
            spawnFloatingText(head.x, head.y, '🛡️ 护盾破碎!', COLORS.shieldGlow);
            // 反弹：推回界内
            newHead.x = Math.max(0, Math.min(GRID_COUNT - 1, newHead.x));
            newHead.y = Math.max(0, Math.min(GRID_COUNT - 1, newHead.y));
            // 确保新头位置不撞蛇身
            if (snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
                gameOver();
                return;
            }
        } else {
            gameOver();
            return;
        }
    }

    // --- 障碍物碰撞 ---
    if (posOnObstacle(newHead)) {
        if (activeShield) {
            activeShield = false;
            updatePowerUpIndicators();
            spawnParticles(newHead.x, newHead.y, COLORS.shieldGlow, 16);
            spawnFloatingText(head.x, head.y, '🛡️ 护盾破碎!', COLORS.shieldGlow);
            obstacles = obstacles.filter(o => !(o.x === newHead.x && o.y === newHead.y));
        } else {
            gameOver();
            return;
        }
    }

    // --- 撞自身检测 ---
    const bodyToCheck = snake.slice(0, -1);
    if (bodyToCheck.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
        if (activeShield) {
            activeShield = false;
            updatePowerUpIndicators();
            spawnParticles(newHead.x, newHead.y, COLORS.shieldGlow, 16);
            spawnFloatingText(head.x, head.y, '🛡️ 护盾破碎!', COLORS.shieldGlow);
            // 不允许通过，回退
            gameOver();
            return;
        } else {
            gameOver();
            return;
        }
    }

    // 移动蛇
    snake.unshift(newHead);

    // --- 吃食物判定 ---
    let ate = false;
    let basePoints = 1;
    let ateWhat = '';

    if (food && newHead.x === food.x && newHead.y === food.y) {
        ate = true;
        basePoints = 1;
        ateWhat = 'food';
        spawnParticles(food.x, food.y, COLORS.foodGlow, 12);
        food = generateFood();
        tryGenerateSpecialFood();
    } else if (specialFood && newHead.x === specialFood.x && newHead.y === specialFood.y) {
        ate = true;
        basePoints = 3;
        ateWhat = 'special';
        spawnParticles(specialFood.x, specialFood.y, COLORS.specialFoodGlow, 16);
        specialFood = null;
    } else if (goldenFood && newHead.x === goldenFood.x && newHead.y === goldenFood.y) {
        ate = true;
        basePoints = 5;
        ateWhat = 'golden';
        spawnParticles(goldenFood.x, goldenFood.y, COLORS.goldenFoodGlow, 24);
        goldenFood = null;
        // 必掉落道具
        const types = Object.keys(POWERUP_TYPES);
        const puType = types[Math.floor(Math.random() * types.length)];
        let puPos;
        let tries = 0;
        do { puPos = randomGridPos(); tries++; }
        while (isPosBlocked(puPos) && tries < 500);
        if (tries < 500) {
            powerUps.push({ x: puPos.x, y: puPos.y, type: puType, timer: 720 });
        }
    }

    // --- 拾取道具 ---
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        if (newHead.x === pu.x && newHead.y === pu.y) {
            activatePowerUp(pu.type);
            spawnParticles(pu.x, pu.y, POWERUP_TYPES[pu.type].glow, 14);
            spawnFloatingText(pu.x, pu.y, POWERUP_TYPES[pu.type].icon + ' ' + POWERUP_TYPES[pu.type].label, POWERUP_TYPES[pu.type].glow);
            powerUps.splice(i, 1);
        }
    }

    if (ate) {
        // Combo
        combo++;
        comboTimer = Date.now() + COMBO_TIMEOUT;
        comboEl.textContent = 'x' + combo;
        comboDisplay.classList.remove('hidden');

        const mult = getScoreMultiplier();
        const finalPoints = Math.round(basePoints * mult);
        score += finalPoints;
        scoreEl.textContent = score;

        // 浮动文字
        let ftText = '+' + finalPoints;
        if (combo > 1) ftText += ' 🔥x' + combo;
        const ftColor = ateWhat === 'golden' ? COLORS.goldenFoodGlow :
                        ateWhat === 'special' ? COLORS.specialFoodGlow : COLORS.foodGlow;
        spawnFloatingText(newHead.x, newHead.y, ftText, ftColor);

        // 关卡升级
        const newLevel = Math.floor(score / 10) + 1;
        if (newLevel > level) {
            level = newLevel;
            levelEl.textContent = level;
            spawnParticles(newHead.x, newHead.y, '#fff', 20);
            generateObstacles();
            generatePortals();
            triggerShake(3, 200);
            spawnFloatingText(newHead.x, newHead.y, '⬆ Lv.' + level, '#ffffff');
        }

        if (score > highScore) {
            saveHighScore(score);
        }
    } else {
        snake.pop();
    }

    // 特殊食物计时
    if (specialFood) {
        specialFood.timer--;
        if (specialFood.timer <= 0) specialFood = null;
    }

    // 彩虹色相
    hueShift = (hueShift + 1 + combo * 0.5) % 360;

    updateParticles();
    updateTrail();
    draw();

    // 动态速度（加速道具影响）
    let speed = Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_DECAY);
    if (activeSpeedUntil > 0) speed = Math.round(speed * 0.7); // 提速 30%
    scheduleNext(speed);
}

function scheduleNext(ms) {
    clearTimeout(gameLoop);
    gameLoop = setTimeout(step, ms);
}

// ---------- 渲染 ----------
function draw() {
    ctx.save();

    // 屏幕震动
    if (shakeAmount > 0) {
        const sx = (Math.random() - 0.5) * shakeAmount * 2;
        const sy = (Math.random() - 0.5) * shakeAmount * 2;
        ctx.translate(sx, sy);
    }

    ctx.clearRect(-10, -10, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);

    // 背景
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-10, -10, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);

    // 网格线
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(i * GRID_SIZE, 0);
        ctx.lineTo(i * GRID_SIZE, CANVAS_HEIGHT);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * GRID_SIZE);
        ctx.lineTo(CANVAS_WIDTH, i * GRID_SIZE);
        ctx.stroke();
    }

    // 拖尾
    drawTrail();

    // 障碍物
    drawObstacles();

    // 传送门
    drawPortals();

    // 食物
    if (food) drawFoodItem(food, COLORS.food, COLORS.foodGlow, 'circle');
    if (specialFood) {
        const blink = specialFood.timer < 20 ? Math.sin(Date.now() / 60) > 0 : true;
        if (blink) drawFoodItem(specialFood, COLORS.specialFood, COLORS.specialFoodGlow, 'star');
    }
    if (goldenFood) drawFoodItem(goldenFood, COLORS.goldenFood, COLORS.goldenFoodGlow, 'golden');

    // 道具
    drawPowerUps();

    // 蛇身（HSL 彩虹色）
    drawSnake();

    // 粒子
    drawParticles();

    // 浮动文字
    drawFloatingTexts();

    ctx.restore();
}

function drawObstacles() {
    for (const o of obstacles) {
        const x = o.x * GRID_SIZE;
        const y = o.y * GRID_SIZE;
        const pad = 1;

        // 主体
        ctx.fillStyle = COLORS.obstacle;
        ctx.fillRect(x + pad, y + pad, GRID_SIZE - pad * 2, GRID_SIZE - pad * 2);

        // 纹理（裂缝效果）
        ctx.strokeStyle = COLORS.obstacleBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 6);
        ctx.lineTo(x + 10, y + 12);
        ctx.moveTo(x + 12, y + 4);
        ctx.lineTo(x + 8, y + 14);
        ctx.stroke();

        // 高光边
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x + pad, y + pad, GRID_SIZE - pad * 2, 3);
        ctx.fillRect(x + pad, y + pad, 3, GRID_SIZE - pad * 2);
    }
}

function drawPortals() {
    for (const portal of portals) {
        drawSinglePortal(portal.x1, portal.y1, portal);
        drawSinglePortal(portal.x2, portal.y2, portal);
    }
}

function drawSinglePortal(gx, gy, portal) {
    const cx = gx * GRID_SIZE + GRID_SIZE / 2;
    const cy = gy * GRID_SIZE + GRID_SIZE / 2;
    const maxR = GRID_SIZE / 2 - 2;

    const onCooldown = portalCooldown > 0;
    const alpha = onCooldown ? 0.35 : 0.9;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 外圈光晕
    ctx.shadowColor = COLORS.portalGlow;
    ctx.shadowBlur = onCooldown ? 4 : 12;

    // 旋转漩涡
    const time = Date.now() / 200;
    for (let i = 0; i < 3; i++) {
        const angle = time + (i * Math.PI * 2) / 3;
        const r = maxR * 0.3;
        const sx = cx + Math.cos(angle) * maxR * 0.35;
        const sy = cy + Math.sin(angle) * maxR * 0.35;

        ctx.fillStyle = COLORS.portal;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // 中心环
    ctx.strokeStyle = COLORS.portalGlow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * 0.65, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function drawPowerUps() {
    for (const pu of powerUps) {
        const cx = pu.x * GRID_SIZE + GRID_SIZE / 2;
        const cy = pu.y * GRID_SIZE + GRID_SIZE / 2;
        const r = GRID_SIZE / 2 - 3;
        const blink = pu.timer < 120 ? Math.sin(Date.now() / 60) > 0 : true;
        if (!blink) continue;

        const pt = POWERUP_TYPES[pu.type];

        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.shadowColor = pt.glow;
        ctx.shadowBlur = 10;

        switch (pu.type) {
            case 'shield':
                // 六边形
                drawPolygon(ctx, cx, cy, r, 6);
                break;
            case 'speed':
                // 闪电形状
                ctx.beginPath();
                ctx.moveTo(cx + r * 0.4, cy - r);
                ctx.lineTo(cx - r * 0.2, cy - r * 0.1);
                ctx.lineTo(cx + r * 0.2, cy - r * 0.1);
                ctx.lineTo(cx - r * 0.4, cy + r);
                ctx.lineTo(cx + r * 0.2, cy + r * 0.1);
                ctx.lineTo(cx - r * 0.2, cy + r * 0.1);
                ctx.closePath();
                ctx.fill();
                break;
            case 'double':
                // 菱形
                ctx.beginPath();
                ctx.moveTo(cx, cy - r);
                ctx.lineTo(cx + r, cy);
                ctx.lineTo(cx, cy + r);
                ctx.lineTo(cx - r, cy);
                ctx.closePath();
                ctx.fill();
                break;
        }

        ctx.restore();
    }
}

function drawPolygon(ctx, cx, cy, r, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (i * Math.PI * 2) / sides - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

function drawFoodItem(pos, color, glowColor, shape) {
    const cx = pos.x * GRID_SIZE + GRID_SIZE / 2;
    const cy = pos.y * GRID_SIZE + GRID_SIZE / 2;
    const r = GRID_SIZE / 2 - 3;

    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;

    switch (shape) {
        case 'circle':
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'star':
            drawStar(ctx, cx, cy, r, r * 0.5, 5);
            break;
        case 'golden':
            // 旋转五星
            const rot = Date.now() / 300;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            drawStar(ctx, 0, 0, r, r * 0.45, 5);
            ctx.restore();
            break;
    }

    ctx.restore();
}

function drawStar(ctx, cx, cy, outerR, innerR, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

function drawSnake() {
    for (let i = snake.length - 1; i >= 0; i--) {
        const seg = snake[i];
        const t = snake.length > 1 ? i / (snake.length - 1) : 0;
        const pad = 2;
        const size = GRID_SIZE - pad * 2;

        if (i === 0) {
            // 头部 - 始终亮色以便识别
            ctx.fillStyle = '#f0fff0';
            ctx.shadowColor = COLORS.snakeHeadGlow;
            ctx.shadowBlur = activeShield ? 16 : 10;

            // 护盾光环
            if (activeShield) {
                ctx.shadowColor = COLORS.shieldGlow;
                ctx.shadowBlur = 18;
            }
        } else {
            // 蛇身 - HSL 彩虹渐变
            const hue = (hueShift + t * 120) % 360;
            const sat = 70 + t * 20;
            const light = 40 + t * 15;
            ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        roundRect(ctx, seg.x * GRID_SIZE + pad, seg.y * GRID_SIZE + pad, size, size, i === 0 ? 6 : 4);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        if (i === 0) drawEyes(seg);
    }
}

function drawEyes(head) {
    const cx = head.x * GRID_SIZE + GRID_SIZE / 2;
    const cy = head.y * GRID_SIZE + GRID_SIZE / 2;
    const eyeR = 2.5;
    const pupilR = 1.2;

    let eyeOffX, eyeOffY;
    if (direction.x === 1)      { eyeOffX = 4; eyeOffY = 4; }
    else if (direction.x === -1) { eyeOffX = -4; eyeOffY = 4; }
    else if (direction.y === -1) { eyeOffX = 4; eyeOffY = -4; }
    else                         { eyeOffX = 4; eyeOffY = 4; }

    const eyes = [
        { x: cx + eyeOffX, y: cy - eyeOffY },
        { x: cx - eyeOffX, y: cy - eyeOffY },
    ];

    if (direction.y !== 0) {
        eyes[0] = { x: cx + 4, y: cy + eyeOffY };
        eyes[1] = { x: cx - 4, y: cy + eyeOffY };
    }

    for (const eye of eyes) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(eye.x + direction.x * 1, eye.y + direction.y * 1, pupilR, 0, Math.PI * 2);
        ctx.fill();
    }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
}

// ---------- 游戏流程 ----------
function startGame() {
    initGame();
    isRunning = true;
    isPaused = false;
    overlay.classList.add('hidden');
    draw();
    const speed = Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_DECAY);
    scheduleNext(speed);
}

function pauseGame() {
    if (!isRunning || isGameOver) return;
    isPaused = !isPaused;
    clearTimeout(gameLoop);

    if (isPaused) {
        overlayTitle.textContent = '⏸️ 已暂停';
        overlayMsg.textContent = '休息一下，准备好了就继续';
        actionBtn.textContent = '继续游戏';
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
        overlayTitle.textContent = '🐍 贪吃蛇';
        const speed = Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_DECAY);
        scheduleNext(speed);
    }
}

function gameOver() {
    isRunning = false;
    isGameOver = true;
    clearTimeout(gameLoop);

    combo = 0;
    comboTimer = 0;
    comboDisplay.classList.add('hidden');
    comboEl.textContent = 'x1';

    if (snake.length > 0) {
        spawnParticles(snake[0].x, snake[0].y, '#ef4444', 20);
    }

    triggerShake(6, 400);
    draw();

    overlayTitle.textContent = '💀 游戏结束';
    overlayMsg.textContent = `最终得分: ${score}  ·  关卡: ${level}`;
    actionBtn.textContent = '再来一局';
    overlay.classList.remove('hidden');

    if (score > highScore) {
        saveHighScore(score);
    }
}

function restartGame() {
    clearTimeout(gameLoop);
    initGame();
    isRunning = true;
    isPaused = false;
    draw();
    overlay.classList.add('hidden');
    overlayTitle.textContent = '🐍 贪吃蛇';
    actionBtn.textContent = '开始游戏';
    const speed = Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_DECAY);
    scheduleNext(speed);
}

// ---------- 事件绑定 ----------
actionBtn.addEventListener('click', () => {
    if (isPaused) {
        pauseGame();
    } else if (isGameOver || !isRunning) {
        startGame();
    } else {
        startGame();
    }
});

restartBtn.addEventListener('click', restartGame);
pauseBtn.addEventListener('click', pauseGame);

document.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
        e.preventDefault();
    }

    if (!isRunning && e.key === ' ') {
        startGame();
        return;
    }
    if (!isRunning) return;

    switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W':
            if (direction.y === 0) nextDirection = { x: 0, y: -1 };
            break;
        case 'ArrowDown':  case 's': case 'S':
            if (direction.y === 0) nextDirection = { x: 0, y: 1 };
            break;
        case 'ArrowLeft':  case 'a': case 'A':
            if (direction.x === 0) nextDirection = { x: -1, y: 0 };
            break;
        case 'ArrowRight': case 'd': case 'D':
            if (direction.x === 0) nextDirection = { x: 1, y: 0 };
            break;
        case ' ':
            pauseGame();
            break;
    }
});

// ---------- 初始绘制 ----------
initGame();
draw();
