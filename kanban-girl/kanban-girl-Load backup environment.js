// 定义备用 CDN 地址（可自定义顺序）
const FALLBACK_REACT = [
    'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js'
];
const FALLBACK_REACT_DOM = [
    'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js'
];

// 回退加载函数（通用）
function loadFallback(scriptElement, fallbackUrls, globalCheck) {
    if (globalCheck && window[globalCheck]) return;

    for (let i = 0; i < fallbackUrls.length; i++) {
        const url = fallbackUrls[i];
        const existing = document.querySelector(`script[src="${url}"]`);
        if (existing) continue;

        const newScript = document.createElement('script');
        newScript.src = url;
        document.head.appendChild(newScript);
        break;
    }
}

function loadReactFallback(scriptElement) {
    loadFallback(scriptElement, FALLBACK_REACT, 'React');
}

function loadReactDOMFallback(scriptElement) {
    loadFallback(scriptElement, FALLBACK_REACT_DOM, 'ReactDOM');
}

// 确保 React 和 ReactDOM 都存在后再执行你的应用代码
function startApp() {
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
        console.error('React or ReactDOM not loaded!');
        return;
    }
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement('h1', null, 'Hello World with fallback!'));
}

// 立即执行，或等待 DOM 加载完成
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}