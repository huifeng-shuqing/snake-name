// ============================================
//   贪吃蛇 - 游戏逻辑
// ============================================

// ---------- 常量与配置 ----------
const CANVAS_WIDTH  = 600;
const CANVAS_HEIGHT = 600;
const GRID_SIZE     = 20;          // 每个格子的像素大小
const GRID_COUNT    = CANVAS_WIDTH / GRID_SIZE; // 30×30 网格

const BASE_SPEED    = 130;         // 基础速度 (ms/帧) - 关卡 1
const SPEED_DECAY   = 8;           // 每关减少的毫秒数
const MIN_SPEED     = 50;          // 速度下限

// 蛇的颜色渐变
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
    text:             '#eee',
    textMuted:        '#999',
};

// ---------- DOM 元素 ----------
const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const scoreEl   = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const levelEl   = document.getElementById('level');
const overlay   = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg  = document.getElementById('overlayMsg');
const actionBtn   = document.getElementById('actionBtn');
const restartBtn  = document.getElementById('restartBtn');
const pauseBtn    = document.getElementById('pauseBtn');

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
let trail = [];           // { x, y, life }

// ---------- 本地存储 ----------
function loadHighScore() {
    const saved = localStorage.getItem('snake_highScore');
    return saved ? parseInt(saved, 10) : 0;
}

function saveHighScore(s) {
    localStorage.setItem('snake_highScore', s.toString());
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

function generateFood() {
    let pos;
    do {
        pos = randomGridPos();
    } while (posOnSnake(pos));
    return pos;
}

// 特殊食物：每吃 5 个普通食物有 30% 概率生成，双倍分数且可穿过蛇身
function tryGenerateSpecialFood() {
    if (score > 0 && score % 5 === 0 && !specialFood && Math.random() < 0.3) {
        let pos;
        do {
            pos = randomGridPos();
        } while (posOnSnake(pos) || (food && food.x === pos.x && food.y === pos.y));
        specialFood = { ...pos, timer: 80 }; // 80 帧后消失
    }
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

// 蛇移动时的拖尾
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
            t.x * GRID_SIZE + 2,
            t.y * GRID_SIZE + 2,
            GRID_SIZE - 4,
            GRID_SIZE - 4
        );
        ctx.restore();
    }
}

// ---------- 初始化 / 重置 ----------
function initGame() {
    // 蛇初始位置：中间偏左，向右移动
    const startX = Math.floor(GRID_COUNT / 2);
    const startY = Math.floor(GRID_COUNT / 2);
    snake = [
        { x: startX,     y: startY },
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
    food = generateFood();
    specialFood = null;

    scoreEl.textContent = '0';
    levelEl.textContent = '1';
}

// ---------- 游戏循环 ----------
function step() {
    if (!isRunning || isPaused) return;

    // 应用方向
    direction = { ...nextDirection };

    // 蛇尾拖尾
    addTrail(snake[snake.length - 1]);

    // 计算新头部
    const head = snake[0];
    const newHead = {
        x: head.x + direction.x,
        y: head.y + direction.y,
    };

    // 穿墙检测
    if (
        newHead.x < 0 || newHead.x >= GRID_COUNT ||
        newHead.y < 0 || newHead.y >= GRID_COUNT
    ) {
        gameOver();
        return;
    }

    // 撞自身检测（头部与身体除尾部外碰撞，因为尾部即将移走）
    // 先检查除尾部外的身体段
    const bodyToCheck = snake.slice(0, -1);
    if (bodyToCheck.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
        gameOver();
        return;
    }

    // 移动蛇
    snake.unshift(newHead);

    // 吃食物判定
    let ate = false;
    let pointsEarned = 1;

    if (food && newHead.x === food.x && newHead.y === food.y) {
        ate = true;
        spawnParticles(food.x, food.y, COLORS.foodGlow, 12);
        food = generateFood();
        tryGenerateSpecialFood();
    } else if (specialFood && newHead.x === specialFood.x && newHead.y === specialFood.y) {
        ate = true;
        pointsEarned = 3;
        spawnParticles(specialFood.x, specialFood.y, COLORS.specialFoodGlow, 16);
        specialFood = null;
    }

    if (ate) {
        score += pointsEarned;
        scoreEl.textContent = score;

        // 关卡升级：每 10 分升一关
        const newLevel = Math.floor(score / 10) + 1;
        if (newLevel > level) {
            level = newLevel;
            levelEl.textContent = level;
            spawnParticles(newHead.x, newHead.y, '#fff', 20);
        }

        if (score > highScore) {
            saveHighScore(score);
        }
    } else {
        // 没吃到食物就移除尾部
        snake.pop();
    }

    // 特殊食物计时
    if (specialFood) {
        specialFood.timer--;
        if (specialFood.timer <= 0) {
            specialFood = null;
        }
    }

    updateParticles();
    updateTrail();
    draw();

    // 动态速度
    const speed = Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_DECAY);
    scheduleNext(speed);
}

function scheduleNext(ms) {
    clearTimeout(gameLoop);
    gameLoop = setTimeout(step, ms);
}

// ---------- 渲染 ----------
function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 背景
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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

    // 蛇身（从尾到头绘制，头部在最上面）
    for (let i = snake.length - 1; i >= 0; i--) {
        const seg = snake[i];
        const t = snake.length > 1 ? i / (snake.length - 1) : 0;

        // 颜色渐变
        const r = lerp(0x16, 0x22, t);
        const g = lerp(0x65, 0xc5, t);
        const b = lerp(0x34, 0x5e, t);

        const pad = 2;
        const size = GRID_SIZE - pad * 2;

        if (i === 0) {
            // 头部
            ctx.fillStyle = COLORS.snakeHead;
            ctx.shadowColor = COLORS.snakeHeadGlow;
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        roundRect(
            ctx,
            seg.x * GRID_SIZE + pad,
            seg.y * GRID_SIZE + pad,
            size,
            size,
            i === 0 ? 6 : 4
        );
        ctx.fill();

        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // 头部眼睛
        if (i === 0) {
            drawEyes(seg);
        }
    }

    // 食物
    if (food) {
        drawFood(food, COLORS.food, COLORS.foodGlow);
    }

    // 特殊食物
    if (specialFood) {
        // 闪烁效果（快消失时闪烁）
        const blink = specialFood.timer < 20 ? Math.sin(Date.now() / 60) > 0 : true;
        if (blink) {
            drawFood(specialFood, COLORS.specialFood, COLORS.specialFoodGlow, true);
        }
    }

    // 粒子
    drawParticles();
}

function drawFood(pos, color, glowColor, isSpecial = false) {
    const cx = pos.x * GRID_SIZE + GRID_SIZE / 2;
    const cy = pos.y * GRID_SIZE + GRID_SIZE / 2;
    const r = GRID_SIZE / 2 - 3;

    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;

    if (isSpecial) {
        // 星形
        drawStar(ctx, cx, cy, r, r * 0.5, 5);
    } else {
        // 圆形
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
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

function drawEyes(head) {
    const cx = head.x * GRID_SIZE + GRID_SIZE / 2;
    const cy = head.y * GRID_SIZE + GRID_SIZE / 2;
    const eyeR = 2.5;
    const pupilR = 1.2;

    let eyeOffX, eyeOffY;
    if (direction.x === 1) {
        eyeOffX = 4; eyeOffY = 4;
    } else if (direction.x === -1) {
        eyeOffX = -4; eyeOffY = 4;
    } else if (direction.y === -1) {
        eyeOffX = 4; eyeOffY = -4;
    } else {
        eyeOffX = 4; eyeOffY = 4;
    }

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

        // 瞳孔
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(
            eye.x + direction.x * 1,
            eye.y + direction.y * 1,
            pupilR,
            0,
            Math.PI * 2
        );
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

    // 死亡粒子
    if (snake.length > 0) {
        spawnParticles(snake[0].x, snake[0].y, '#ef4444', 20);
        // 再绘一帧展示粒子
        draw();
    }

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
        pauseGame(); // 取消暂停
    } else if (isGameOver || !isRunning) {
        startGame();
    } else {
        startGame();
    }
});

restartBtn.addEventListener('click', restartGame);
pauseBtn.addEventListener('click', pauseGame);

// 键盘控制
document.addEventListener('keydown', (e) => {
    // 阻止方向键滚动页面
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
        e.preventDefault();
    }

    if (!isRunning && e.key === ' ') {
        startGame();
        return;
    }
    if (!isRunning) return;

    switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            if (direction.y === 0) nextDirection = { x: 0, y: -1 };
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            if (direction.y === 0) nextDirection = { x: 0, y: 1 };
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            if (direction.x === 0) nextDirection = { x: -1, y: 0 };
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
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