// ===== 看板娘完整 JavaScript 代码 =====
(function() {
    'use strict';

    const { useState, useEffect, useRef, useCallback, Fragment } = React;

    // ----- 配置 -----
    const STORAGE_POS = 'dsh-1024store-pet-pos';
    const STORAGE_FEEDS = 'dsh-1024store-pet-feeds';
    const STORAGE_GREETED = 'dsh-1024store-pet-greeted';
    
    const BUBBLE_DURATION = 4500;
    const SLEEP_DELAY = 60000;
    const WALK_DELAY = 25000;
    const WALK_SPEED = 70;
    const WALK_MIN_DIST = 60;
    const EDGE_PADDING = 12;
    const TILT_AMOUNT = 10;
    const DRAG_THRESHOLD = 6;

    // 精灵配置
    const SPRITE_BASE = 'kanban-girl/whale-girl/'; // ⚠️ 根据你的图片路径调整
    const SPRITE_CONFIG = {
        idle: { sheet: 'idle.png', frames: 3, fps: 2, playback: 'blink' },
        joy: { sheet: 'joy.png', frames: 2, fps: 5, playback: 'loop' },
        eat: { sheet: 'eat.png', frames: 3, fps: 8, playback: 'loop' },
        play: { sheet: 'play.png', frames: 3, fps: 4, playback: 'loop' },
        welcome: { sheet: 'welcome.png', frames: 2, fps: 3, playback: 'loop' },
        drag: { sheet: 'drag.png', frames: 1, fps: 5, playback: 'loop', motion: 'tilt' },
        think: { sheet: 'think.png', frames: 1, fps: 2, playback: 'loop', motion: 'float' },
        sleep: { sheet: 'sleep.png', frames: 2, fps: 1, playback: 'loop' },
        wake: { sheet: 'wake.png', frames: 2, fps: 3, playback: 'once' },
        walk: { sheet: 'walk.png', frames: 3, fps: 6, playback: 'pingpong' }
    };

    // 对话文本（中英文）
    const GREETINGS = {
        zh: ['嘿嘿，欢迎常来逛～', '今天也要元气满满哦！', '搜一搜，可能有惊喜～', '我每天都在这里等你呢'],
        en: ['Hehe, happy browsing!', 'Stay energized today!', 'Try searching!', 'I\'ll be right here']
    };

    const FEED_REPLIES = {
        zh: ['谢谢投喂小鱼干！', '小鱼干真好吃～', '吃饱了继续帮你看店！'],
        en: ['Thanks for the fish!', 'Yum, dried fish!', 'Fully charged now!']
    };

    const PLAY_REPLIES = {
        zh: ['来玩抛接球！', '接住啦，再高点！', '和你玩真开心～'],
        en: ['Let\'s play catch!', 'Got it — higher!', 'Playing with you is fun!']
    };

    const FEED_SPECIAL = {
        zh: n => `第 ${n} 条小鱼干啦，最爱你了！`,
        en: n => `${n} fish already — I love you the most!`
    };

    // ----- 辅助函数 -----
    function getLocale() {
        return navigator.language.startsWith('zh') ? 'zh' : 'en';
    }

    function random(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
    }

    function loadPos() {
        try {
            const raw = localStorage.getItem(STORAGE_POS);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (typeof data.x === 'number' && typeof data.y === 'number') {
                return data;
            }
        } catch {}
        return null;
    }

    function savePos(x, y) {
        try {
            localStorage.setItem(STORAGE_POS, JSON.stringify({ x, y }));
        } catch {}
    }

    function loadFeeds() {
        try {
            const val = localStorage.getItem(STORAGE_FEEDS);
            if (!val) return 0;
            const num = Number(val);
            return isFinite(num) && num > 0 ? Math.floor(num) : 0;
        } catch { return 0; }
    }

    function saveFeeds(n) {
        try { localStorage.setItem(STORAGE_FEEDS, String(n)) } catch {}
    }

    function isReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // ----- 精灵组件 -----
    function Sprite({ state, frame, layer }) {
        const config = SPRITE_CONFIG[state];
        const hasMotion = layer === 'depth' || !config.motion;
        const className = `kanban-girl-sprite${!hasMotion ? ` is-${config.motion}` : ''}${layer === 'depth' ? ' kanban-girl-depth' : ''}`;
        const frames = config.frames;
        const position = frames > 1 ? (frame / (frames - 1)) * 100 : 0;

        return React.createElement('div', {
            className: className,
            style: {
                backgroundImage: `url(${SPRITE_BASE}${config.sheet})`,
                backgroundSize: `${frames * 100}% 100%`,
                backgroundPosition: `${position}% 0`
            }
        });
    }

    // ----- 主组件 -----
    function WhaleGirl() {
        const locale = getLocale();
        const [position, setPosition] = useState(loadPos);
        const [feeds, setFeeds] = useState(loadFeeds);
        const [bubble, setBubble] = useState(null);
        const [menuOpen, setMenuOpen] = useState(false);
        const [hearts, setHearts] = useState([]);
        const [state, setState] = useState('idle');
        const [frame, setFrame] = useState(0);
        const [flip, setFlip] = useState(1);

        const rootRef = useRef(null);
        const buttonRef = useRef(null);
        const bubbleTimer = useRef(null);
        const stateTimers = useRef([]);
        const sleepTimer = useRef(null);
        const walkTimer = useRef(null);
        const animFrame = useRef(null);
        const dragData = useRef(null);
        const ignoreClick = useRef(false);
        const stateRef = useRef('idle');
        const walkState = useRef(null);
        const reducedMotion = useRef(isReducedMotion());

        stateRef.current = state;

        // ----- 核心函数 -----
        function showBubble(text) {
            if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
            setBubble({ id: Date.now(), text });
            bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_DURATION);
        }

        function runStateSequence(seq, final = 'idle') {
            stateTimers.current.forEach(t => clearTimeout(t));
            stateTimers.current = [];
            let delay = 0;
            for (const [s, dur] of seq) {
                const timer = setTimeout(() => setState(s), delay);
                stateTimers.current.push(timer);
                delay += dur;
            }
            const last = setTimeout(() => setState(final), delay);
            stateTimers.current.push(last);
        }

        function resetSleepTimer() {
            if (sleepTimer.current) clearTimeout(sleepTimer.current);
            sleepTimer.current = setTimeout(() => {
                setState(s => (s === 'idle' || s === 'think') ? 'sleep' : s);
            }, SLEEP_DELAY);
        }

        function resetWalkTimer() {
            if (walkTimer.current) clearTimeout(walkTimer.current);
            walkTimer.current = setTimeout(() => {
                if (stateRef.current === 'idle' || stateRef.current === 'think') {
                    startWalking();
                }
                resetWalkTimer();
            }, WALK_DELAY);
        }

        function stopWalking() {
            if (animFrame.current) {
                cancelAnimationFrame(animFrame.current);
                animFrame.current = null;
            }
            walkState.current = null;
        }

        function startWalking() {
            const el = rootRef.current;
            if (!el || walkState.current || animFrame.current) return;

            const rect = el.getBoundingClientRect();
            const w = rect.width;
            const maxX = Math.max(0, window.innerWidth - w - EDGE_PADDING);
            const minX = EDGE_PADDING;
            const dir = Math.random() < 0.5 ? 1 : -1;
            const targetX = dir === 1 ? minX + Math.random() * (maxX * 0.6) : maxX - Math.random() * (maxX * 0.6);
            const distance = Math.abs(targetX - rect.left);

            if (distance < WALK_MIN_DIST) return;

            setFlip(dir);
            setState('walk');
            walkState.current = {
                from: rect.left,
                target: targetX,
                y: rect.top,
                distance: distance,
                dir: dir,
                progress: 0,
                last: performance.now()
            };

            function animate(now) {
                const ws = walkState.current;
                if (!ws) return;
                const delta = Math.min(50, now - ws.last);
                ws.last = now;
                ws.progress += WALK_SPEED * delta / 1000;

                if (ws.progress >= ws.distance) {
                    stopWalking();
                    setState('idle');
                    const x = ws.target;
                    const y = ws.y;
                    setPosition({ x, y });
                    savePos(x, y);
                    return;
                }

                const pos = ws.dir === 1 ? ws.from + ws.progress : ws.from - ws.progress;
                setPosition({ x: pos, y: ws.y });
                animFrame.current = requestAnimationFrame(animate);
            }

            animFrame.current = requestAnimationFrame(animate);
        }

        function resetAllTimers() {
            resetSleepTimer();
            resetWalkTimer();
        }

        // ----- 交互函数 -----
        function handleClick() {
            if (ignoreClick.current) {
                ignoreClick.current = false;
                return;
            }
            stopWalking();
            setMenuOpen(!menuOpen);
            showBubble(random(GREETINGS[locale]));
            resetSleepTimer();
            if (stateRef.current === 'sleep') {
                runStateSequence([['wake', 1200], ['joy', 1500]]);
            } else {
                runStateSequence([['joy', 1500]]);
            }
        }

        function handleFeed() {
            const n = feeds + 1;
            setFeeds(n);
            saveFeeds(n);
            spawnHeart();
            stopWalking();
            resetSleepTimer();
            if (n > 0 && n % 5 === 0) {
                showBubble(FEED_SPECIAL[locale](n));
            } else {
                showBubble(random(FEED_REPLIES[locale]));
            }
            runStateSequence([['eat', 1300], ['joy', 1100]]);
        }

        function handlePlay() {
            spawnHeart();
            stopWalking();
            resetSleepTimer();
            showBubble(random(PLAY_REPLIES[locale]));
            runStateSequence([['play', 1700], ['joy', 1100]]);
        }

        function spawnHeart() {
            const id = Date.now() + Math.random();
            const x = Math.round(Math.random() * 28 - 14);
            setHearts(h => [...h.slice(-4), { id, x }]);
            setTimeout(() => {
                setHearts(h => h.filter(h => h.id !== id));
            }, 1300);
        }

        // ----- 拖拽 -----
        function handlePointerDown(e) {
            const el = buttonRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            dragData.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                baseX: rect.left,
                baseY: rect.top,
                moved: false
            };
            try { el.setPointerCapture(e.pointerId) } catch {}
            el.classList.add('is-dragging');
            if (stateRef.current === 'sleep') {
                runStateSequence([['wake', 1200]]);
            }
            stopWalking();
            resetSleepTimer();
        }

        function handlePointerMove(e) {
            const data = dragData.current;
            if (!data || e.pointerId !== data.pointerId) return;

            const dx = e.clientX - data.startX;
            const dy = e.clientY - data.startY;
            if (!data.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

            data.moved = true;
            stateTimers.current.forEach(t => clearTimeout(t));
            stateTimers.current = [];
            setState('drag');

            const newX = clamp(data.baseX + dx, 0, Math.max(0, window.innerWidth - 120));
            const newY = clamp(data.baseY + dy, 0, Math.max(0, window.innerHeight - 120));
            setPosition({ x: newX, y: newY });

            // 倾斜效果
            const el = buttonRef.current;
            if (el) {
                const ratioX = (e.clientX - data.baseX) / 120 - 0.5;
                const ratioY = (e.clientY - data.baseY) / 120 - 0.5;
                const tiltX = (-ratioY * 2 * TILT_AMOUNT).toFixed(2);
                const tiltY = (ratioX * 2 * TILT_AMOUNT).toFixed(2);
                el.style.setProperty('--kanban-tilt-x', `${tiltX}deg`);
                el.style.setProperty('--kanban-tilt-y', `${tiltY}deg`);
            }
        }

        function handlePointerUp(e) {
            const data = dragData.current;
            if (!data || e.pointerId !== data.pointerId) return;
            dragData.current = null;

            const el = buttonRef.current;
            if (el) {
                el.classList.remove('is-dragging');
                el.style.setProperty('--kanban-tilt-x', '0deg');
                el.style.setProperty('--kanban-tilt-y', '0deg');
                try { el.releasePointerCapture(e.pointerId) } catch {}
            }

            if (data.moved) {
                ignoreClick.current = true;
                const pos = position;
                if (pos) savePos(pos.x, pos.y);
                setState('idle');
            }
        }

        function handlePointerLeave() {
            const el = buttonRef.current;
            if (el) {
                el.style.setProperty('--kanban-tilt-x', '0deg');
                el.style.setProperty('--kanban-tilt-y', '0deg');
            }
        }

        // ----- Effects -----
        // 帧动画
        useEffect(() => {
            const config = SPRITE_CONFIG[state];
            if (reducedMotion.current) {
                setFrame(0);
                return () => {};
            }

            const timers = [];
            const fps = 1000 / config.fps;

            if (config.playback === 'blink') {
                const blink = () => {
                    const t1 = setTimeout(() => setFrame(1), 2200 + Math.random() * 3800);
                    const t2 = setTimeout(() => setFrame(2), fps);
                    const t3 = setTimeout(() => setFrame(0), fps * 2);
                    const t4 = setTimeout(blink, fps * 3);
                    timers.push(t1, t2, t3, t4);
                };
                blink();
            } else if (config.playback === 'once') {
                let idx = 0;
                const next = () => {
                    setFrame(idx);
                    idx++;
                    if (idx < config.frames) {
                        const t = setTimeout(next, fps);
                        timers.push(t);
                    }
                };
                next();
            } else if (config.playback === 'pingpong') {
                let idx = 0, dir = 1;
                const next = () => {
                    setFrame(idx);
                    idx += dir;
                    if (idx >= config.frames) { idx = config.frames - 2; dir = -1; }
                    if (idx < 0) { idx = 1; dir = 1; }
                    const t = setTimeout(next, fps);
                    timers.push(t);
                };
                const t = setTimeout(next, fps);
                timers.push(t);
            } else {
                const next = () => {
                    setFrame(f => (f + 1) % config.frames);
                    const t = setTimeout(next, fps);
                    timers.push(t);
                };
                const t = setTimeout(next, fps);
                timers.push(t);
            }

            return () => timers.forEach(t => clearTimeout(t));
        }, [state]);

        // 初始化问候
        useEffect(() => {
            if (localStorage.getItem(STORAGE_GREETED)) return;
            localStorage.setItem(STORAGE_GREETED, '1');
            const t = setTimeout(() => {
                showBubble(random(GREETINGS[locale]));
                runStateSequence([['welcome', 2600]]);
            }, 800);
            return () => clearTimeout(t);
        }, []);

        // 预加载图片
        useEffect(() => {
            Object.values(SPRITE_CONFIG).forEach(config => {
                const img = new Image();
                img.src = `${SPRITE_BASE}${config.sheet}`;
            });
        }, []);

        // 定时器管理
        useEffect(() => {
            resetAllTimers();
            return () => {
                if (sleepTimer.current) clearTimeout(sleepTimer.current);
                if (walkTimer.current) clearTimeout(walkTimer.current);
                if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
                stateTimers.current.forEach(t => clearTimeout(t));
                stopWalking();
            };
        }, []);

        // 窗口resize处理
        useEffect(() => {
            const handleResize = () => {
                const el = rootRef.current;
                if (!el || !position) return;
                const w = el.offsetWidth || 120;
                const newX = clamp(position.x, 0, Math.max(0, window.innerWidth - w));
                const newY = clamp(position.y, 0, Math.max(0, window.innerHeight - w));
                if (newX !== position.x || newY !== position.y) {
                    setPosition({ x: newX, y: newY });
                    savePos(newX, newY);
                }
            };
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }, [position]);

        // 点击外部关闭菜单
        useEffect(() => {
            if (!menuOpen) return;
            const handler = (e) => {
                if (rootRef.current && !rootRef.current.contains(e.target)) {
                    setMenuOpen(false);
                }
            };
            document.addEventListener('pointerdown', handler);
            return () => document.removeEventListener('pointerdown', handler);
        }, [menuOpen]);

        // ----- 渲染 -----
        const style = position ? {
            left: position.x,
            top: position.y
        } : {
            right: 16,
            bottom: 16
        };

        const iconFish = React.createElement('span', { style: { fontSize: 18 } }, '🐟');
        const iconGamepad = React.createElement('span', { style: { fontSize: 18 } }, '🎮');

        return React.createElement('div', {
            ref: rootRef,
            className: 'kanban-girl-root',
            style: style
        }, [
            // 气泡和菜单
            React.createElement('div', { key: 'pop', className: 'kanban-girl-pop' },
                bubble && React.createElement('p', {
                    className: 'kanban-girl-bubble',
                    role: 'status',
                    key: bubble.id
                }, bubble.text),
                menuOpen && React.createElement('div', { className: 'kanban-girl-menu', key: 'menu' },
                    React.createElement('button', {
                        className: 'kanban-girl-action',
                        'aria-label': '投喂',
                        title: '投喂小鱼干',
                        onClick: handleFeed
                    }, iconFish),
                    React.createElement('button', {
                        className: 'kanban-girl-action',
                        'aria-label': '玩耍',
                        title: '和我玩',
                        onClick: handlePlay
                    }, iconGamepad)
                )
            ),

            // 看板娘主体
            React.createElement('button', {
                key: 'girl',
                ref: buttonRef,
                className: 'kanban-girl',
                'aria-label': '看板娘',
                onClick: handleClick,
                onPointerDown: handlePointerDown,
                onPointerMove: handlePointerMove,
                onPointerUp: handlePointerUp,
                onPointerCancel: handlePointerUp,
                onPointerLeave: handlePointerLeave,
                children: React.createElement('span', {
                    className: 'kanban-girl-flip',
                    style: { transform: `scaleX(${flip})` },
                    children: React.createElement('span', { className: 'kanban-girl-3d' },
                        React.createElement(Sprite, { state: state, frame: frame, layer: 'depth' }),
                        React.createElement(Sprite, { state: state, frame: frame }),
                        React.createElement('span', { className: 'kanban-girl-shine', 'aria-hidden': true })
                    )
                })
            }),

            // 阴影
            React.createElement('div', { key: 'shadow', className: 'kanban-girl-shadow', 'aria-hidden': true }),

            // 气泡点
            React.createElement('span', { key: 'dot1', className: 'kanban-girl-bubble-dot', 'aria-hidden': true }),
            React.createElement('span', { key: 'dot2', className: 'kanban-girl-bubble-dot', 'aria-hidden': true }),
            React.createElement('span', { key: 'dot3', className: 'kanban-girl-bubble-dot', 'aria-hidden': true }),

            // 爱心
            ...hearts.map(h => React.createElement('span', {
                key: h.id,
                className: 'kanban-girl-heart',
                style: { left: `calc(50% + ${h.x}px)` },
                'aria-hidden': true
            }, '♥'))
        ]);
    }

    // ----- 挂载到页面 -----
    const container = document.getElementById('kanban-girl');
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(WhaleGirl));

})();