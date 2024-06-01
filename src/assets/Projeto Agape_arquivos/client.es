import "/@fs/home/agleta/Projects/projeto-agape/node_modules/vite/dist/client/env.mjs";

class HMRContext {
    constructor(hmrClient, ownerPath) {
        this.hmrClient = hmrClient;
        this.ownerPath = ownerPath;
        if (!hmrClient.dataMap.has(ownerPath)) {
            hmrClient.dataMap.set(ownerPath, {});
        }
        // when a file is hot updated, a new context is created
        // clear its stale callbacks
        const mod = hmrClient.hotModulesMap.get(ownerPath);
        if (mod) {
            mod.callbacks = [];
        }
        // clear stale custom event listeners
        const staleListeners = hmrClient.ctxToListenersMap.get(ownerPath);
        if (staleListeners) {
            for (const [event, staleFns] of staleListeners) {
                const listeners = hmrClient.customListenersMap.get(event);
                if (listeners) {
                    hmrClient.customListenersMap.set(event, listeners.filter((l) => !staleFns.includes(l)));
                }
            }
        }
        this.newListeners = new Map();
        hmrClient.ctxToListenersMap.set(ownerPath, this.newListeners);
    }
    get data() {
        return this.hmrClient.dataMap.get(this.ownerPath);
    }
    accept(deps, callback) {
        if (typeof deps === 'function' || !deps) {
            // self-accept: hot.accept(() => {})
            this.acceptDeps([this.ownerPath], ([mod]) => deps === null || deps === void 0 ? void 0 : deps(mod));
        }
        else if (typeof deps === 'string') {
            // explicit deps
            this.acceptDeps([deps], ([mod]) => callback === null || callback === void 0 ? void 0 : callback(mod));
        }
        else if (Array.isArray(deps)) {
            this.acceptDeps(deps, callback);
        }
        else {
            throw new Error(`invalid hot.accept() usage.`);
        }
    }
    // export names (first arg) are irrelevant on the client side, they're
    // extracted in the server for propagation
    acceptExports(_, callback) {
        this.acceptDeps([this.ownerPath], ([mod]) => callback === null || callback === void 0 ? void 0 : callback(mod));
    }
    dispose(cb) {
        this.hmrClient.disposeMap.set(this.ownerPath, cb);
    }
    prune(cb) {
        this.hmrClient.pruneMap.set(this.ownerPath, cb);
    }
    // Kept for backward compatibility (#11036)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    decline() { }
    invalidate(message) {
        this.hmrClient.notifyListeners('vite:invalidate', {
            path: this.ownerPath,
            message,
        });
        this.send('vite:invalidate', { path: this.ownerPath, message });
        this.hmrClient.logger.debug(`[vite] invalidate ${this.ownerPath}${message ? `: ${message}` : ''}`);
    }
    on(event, cb) {
        const addToMap = (map) => {
            const existing = map.get(event) || [];
            existing.push(cb);
            map.set(event, existing);
        };
        addToMap(this.hmrClient.customListenersMap);
        addToMap(this.newListeners);
    }
    off(event, cb) {
        const removeFromMap = (map) => {
            const existing = map.get(event);
            if (existing === undefined) {
                return;
            }
            const pruned = existing.filter((l) => l !== cb);
            if (pruned.length === 0) {
                map.delete(event);
                return;
            }
            map.set(event, pruned);
        };
        removeFromMap(this.hmrClient.customListenersMap);
        removeFromMap(this.newListeners);
    }
    send(event, data) {
        this.hmrClient.messenger.send(JSON.stringify({ type: 'custom', event, data }));
    }
    acceptDeps(deps, callback = () => { }) {
        const mod = this.hmrClient.hotModulesMap.get(this.ownerPath) || {
            id: this.ownerPath,
            callbacks: [],
        };
        mod.callbacks.push({
            deps,
            fn: callback,
        });
        this.hmrClient.hotModulesMap.set(this.ownerPath, mod);
    }
}
class HMRMessenger {
    constructor(connection) {
        this.connection = connection;
        this.queue = [];
    }
    send(message) {
        this.queue.push(message);
        this.flush();
    }
    flush() {
        if (this.connection.isReady()) {
            this.queue.forEach((msg) => this.connection.send(msg));
            this.queue = [];
        }
    }
}
class HMRClient {
    constructor(logger, connection, 
    // This allows implementing reloading via different methods depending on the environment
    importUpdatedModule) {
        this.logger = logger;
        this.importUpdatedModule = importUpdatedModule;
        this.hotModulesMap = new Map();
        this.disposeMap = new Map();
        this.pruneMap = new Map();
        this.dataMap = new Map();
        this.customListenersMap = new Map();
        this.ctxToListenersMap = new Map();
        this.updateQueue = [];
        this.pendingUpdateQueue = false;
        this.messenger = new HMRMessenger(connection);
    }
    async notifyListeners(event, data) {
        const cbs = this.customListenersMap.get(event);
        if (cbs) {
            await Promise.allSettled(cbs.map((cb) => cb(data)));
        }
    }
    clear() {
        this.hotModulesMap.clear();
        this.disposeMap.clear();
        this.pruneMap.clear();
        this.dataMap.clear();
        this.customListenersMap.clear();
        this.ctxToListenersMap.clear();
    }
    // After an HMR update, some modules are no longer imported on the page
    // but they may have left behind side effects that need to be cleaned up
    // (.e.g style injections)
    // TODO Trigger their dispose callbacks.
    prunePaths(paths) {
        paths.forEach((path) => {
            const fn = this.pruneMap.get(path);
            if (fn) {
                fn(this.dataMap.get(path));
            }
        });
    }
    warnFailedUpdate(err, path) {
        if (!err.message.includes('fetch')) {
            this.logger.error(err);
        }
        this.logger.error(`[hmr] Failed to reload ${path}. ` +
            `This could be due to syntax errors or importing non-existent ` +
            `modules. (see errors above)`);
    }
    /**
     * buffer multiple hot updates triggered by the same src change
     * so that they are invoked in the same order they were sent.
     * (otherwise the order may be inconsistent because of the http request round trip)
     */
    async queueUpdate(payload) {
        this.updateQueue.push(this.fetchUpdate(payload));
        if (!this.pendingUpdateQueue) {
            this.pendingUpdateQueue = true;
            await Promise.resolve();
            this.pendingUpdateQueue = false;
            const loading = [...this.updateQueue];
            this.updateQueue = [];
            (await Promise.all(loading)).forEach((fn) => fn && fn());
        }
    }
    async fetchUpdate(update) {
        const { path, acceptedPath } = update;
        const mod = this.hotModulesMap.get(path);
        if (!mod) {
            // In a code-splitting project,
            // it is common that the hot-updating module is not loaded yet.
            // https://github.com/vitejs/vite/issues/721
            return;
        }
        let fetchedModule;
        const isSelfUpdate = path === acceptedPath;
        // determine the qualified callbacks before we re-import the modules
        const qualifiedCallbacks = mod.callbacks.filter(({ deps }) => deps.includes(acceptedPath));
        if (isSelfUpdate || qualifiedCallbacks.length > 0) {
            const disposer = this.disposeMap.get(acceptedPath);
            if (disposer)
                await disposer(this.dataMap.get(acceptedPath));
            try {
                fetchedModule = await this.importUpdatedModule(update);
            }
            catch (e) {
                this.warnFailedUpdate(e, acceptedPath);
            }
        }
        return () => {
            for (const { deps, fn } of qualifiedCallbacks) {
                fn(deps.map((dep) => (dep === acceptedPath ? fetchedModule : undefined)));
            }
            const loggedPath = isSelfUpdate ? path : `${acceptedPath} via ${path}`;
            this.logger.debug(`[vite] hot updated: ${loggedPath}`);
        };
    }
}

const hmrConfigName = "vite.config.js";
const base$1 = "/" || '/';
// set :host styles to make playwright detect the element as visible
const template = /*html*/ `
<style>
:host {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  --monospace: 'SFMono-Regular', Consolas,
  'Liberation Mono', Menlo, Courier, monospace;
  --red: #ff5555;
  --yellow: #e2aa53;
  --purple: #cfa4ff;
  --cyan: #2dd9da;
  --dim: #c9c9c9;

  --window-background: #181818;
  --window-color: #d8d8d8;
}

.backdrop {
  position: fixed;
  z-index: 99999;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
  margin: 0;
  background: rgba(0, 0, 0, 0.66);
}

.window {
  font-family: var(--monospace);
  line-height: 1.5;
  width: 800px;
  color: var(--window-color);
  margin: 30px auto;
  padding: 25px 40px;
  position: relative;
  background: var(--window-background);
  border-radius: 6px 6px 8px 8px;
  box-shadow: 0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22);
  overflow: hidden;
  border-top: 8px solid var(--red);
  direction: ltr;
  text-align: left;
}

pre {
  font-family: var(--monospace);
  font-size: 16px;
  margin-top: 0;
  margin-bottom: 1em;
  overflow-x: scroll;
  scrollbar-width: none;
}

pre::-webkit-scrollbar {
  display: none;
}

pre.frame::-webkit-scrollbar {
  display: block;
  height: 5px;
}

pre.frame::-webkit-scrollbar-thumb {
  background: #999;
  border-radius: 5px;
}

pre.frame {
  scrollbar-width: thin;
}

.message {
  line-height: 1.3;
  font-weight: 600;
  white-space: pre-wrap;
}

.message-body {
  color: var(--red);
}

.plugin {
  color: var(--purple);
}

.file {
  color: var(--cyan);
  margin-bottom: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.frame {
  color: var(--yellow);
}

.stack {
  font-size: 13px;
  color: var(--dim);
}

.tip {
  font-size: 13px;
  color: #999;
  border-top: 1px dotted #999;
  padding-top: 13px;
  line-height: 1.8;
}

code {
  font-size: 13px;
  font-family: var(--monospace);
  color: var(--yellow);
}

.file-link {
  text-decoration: underline;
  cursor: pointer;
}

kbd {
  line-height: 1.5;
  font-family: ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.75rem;
  font-weight: 700;
  background-color: rgb(38, 40, 44);
  color: rgb(166, 167, 171);
  padding: 0.15rem 0.3rem;
  border-radius: 0.25rem;
  border-width: 0.0625rem 0.0625rem 0.1875rem;
  border-style: solid;
  border-color: rgb(54, 57, 64);
  border-image: initial;
}
</style>
<div class="backdrop" part="backdrop">
  <div class="window" part="window">
    <pre class="message" part="message"><span class="plugin" part="plugin"></span><span class="message-body" part="message-body"></span></pre>
    <pre class="file" part="file"></pre>
    <pre class="frame" part="frame"></pre>
    <pre class="stack" part="stack"></pre>
    <div class="tip" part="tip">
      Click outside, press <kbd>Esc</kbd> key, or fix the code to dismiss.<br>
      
      
    </div>
  </div>
</div>
`;
const fileRE = /(?:[a-zA-Z]:\\|\/).*?:\d+:\d+/g;
const codeframeRE = /^(?:>?\s*\d+\s+\|.*|\s+\|\s*\^.*)\r?\n/gm;
// Allow `ErrorOverlay` to extend `HTMLElement` even in environments where
// `HTMLElement` was not originally defined.
const { HTMLElement = class {
} } = globalThis;
class ErrorOverlay extends HTMLElement {
    constructor(err, links = true) {
        var _a;
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.innerHTML = template;
        codeframeRE.lastIndex = 0;
        const hasFrame = err.frame && codeframeRE.test(err.frame);
        const message = hasFrame
            ? err.message.replace(codeframeRE, '')
            : err.message;
        if (err.plugin) {
            this.text('.plugin', `[plugin:${err.plugin}] `);
        }
        this.text('.message-body', message.trim());
        const [file] = (((_a = err.loc) === null || _a === void 0 ? void 0 : _a.file) || err.id || 'unknown file').split(`?`);
        if (err.loc) {
            this.text('.file', `${file}:${err.loc.line}:${err.loc.column}`, links);
        }
        else if (err.id) {
            this.text('.file', file);
        }
        if (hasFrame) {
            this.text('.frame', err.frame.trim());
        }
        this.text('.stack', err.stack, links);
        this.root.querySelector('.window').addEventListener('click', (e) => {
            e.stopPropagation();
        });
        this.addEventListener('click', () => {
            this.close();
        });
        this.closeOnEsc = (e) => {
            if (e.key === 'Escape' || e.code === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this.closeOnEsc);
    }
    text(selector, text, linkFiles = false) {
        const el = this.root.querySelector(selector);
        if (!linkFiles) {
            el.textContent = text;
        }
        else {
            let curIndex = 0;
            let match;
            fileRE.lastIndex = 0;
            while ((match = fileRE.exec(text))) {
                const { 0: file, index } = match;
                if (index != null) {
                    const frag = text.slice(curIndex, index);
                    el.appendChild(document.createTextNode(frag));
                    const link = document.createElement('a');
                    link.textContent = file;
                    link.className = 'file-link';
                    link.onclick = () => {
                        fetch(new URL(`${base$1}__open-in-editor?file=${encodeURIComponent(file)}`, import.meta.url));
                    };
                    el.appendChild(link);
                    curIndex += frag.length + file.length;
                }
            }
        }
    }
    close() {
        var _a;
        (_a = this.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(this);
        document.removeEventListener('keydown', this.closeOnEsc);
    }
}
const overlayId = 'vite-error-overlay';
const { customElements } = globalThis; // Ensure `customElements` is defined before the next line.
if (customElements && !customElements.get(overlayId)) {
    customElements.define(overlayId, ErrorOverlay);
}

console.debug('[vite] connecting...');
const importMetaUrl = new URL(import.meta.url);
// use server configuration, then fallback to inference
const serverHost = "localhost:4200/";
const socketProtocol = null || (importMetaUrl.protocol === 'https:' ? 'wss' : 'ws');
const hmrPort = null;
const socketHost = `${null || importMetaUrl.hostname}:${hmrPort || importMetaUrl.port}${"/"}`;
const directSocketHost = "localhost:4200/";
const base = "/" || '/';
let socket;
try {
    let fallback;
    // only use fallback when port is inferred to prevent confusion
    if (!hmrPort) {
        fallback = () => {
            // fallback to connecting directly to the hmr server
            // for servers which does not support proxying websocket
            socket = setupWebSocket(socketProtocol, directSocketHost, () => {
                const currentScriptHostURL = new URL(import.meta.url);
                const currentScriptHost = currentScriptHostURL.host +
                    currentScriptHostURL.pathname.replace(/@vite\/client$/, '');
                console.error('[vite] failed to connect to websocket.\n' +
                    'your current setup:\n' +
                    `  (browser) ${currentScriptHost} <--[HTTP]--> ${serverHost} (server)\n` +
                    `  (browser) ${socketHost} <--[WebSocket (failing)]--> ${directSocketHost} (server)\n` +
                    'Check out your Vite / network configuration and https://vitejs.dev/config/server-options.html#server-hmr .');
            });
            socket.addEventListener('open', () => {
                console.info('[vite] Direct websocket connection fallback. Check out https://vitejs.dev/config/server-options.html#server-hmr to remove the previous connection error.');
            }, { once: true });
        };
    }
    socket = setupWebSocket(socketProtocol, socketHost, fallback);
}
catch (error) {
    console.error(`[vite] failed to connect to websocket (${error}). `);
}
function setupWebSocket(protocol, hostAndPath, onCloseWithoutOpen) {
    const socket = new WebSocket(`${protocol}://${hostAndPath}`, 'vite-hmr');
    let isOpened = false;
    socket.addEventListener('open', () => {
        isOpened = true;
        notifyListeners('vite:ws:connect', { webSocket: socket });
    }, { once: true });
    // Listen for messages
    socket.addEventListener('message', async ({ data }) => {
        handleMessage(JSON.parse(data));
    });
    // ping server
    socket.addEventListener('close', async ({ wasClean }) => {
        if (wasClean)
            return;
        if (!isOpened && onCloseWithoutOpen) {
            onCloseWithoutOpen();
            return;
        }
        notifyListeners('vite:ws:disconnect', { webSocket: socket });
        console.log(`[vite] server connection lost. polling for restart...`);
        await waitForSuccessfulPing(protocol, hostAndPath);
        location.reload();
    });
    return socket;
}
function cleanUrl(pathname) {
    const url = new URL(pathname, location.toString());
    url.searchParams.delete('direct');
    return url.pathname + url.search;
}
let isFirstUpdate = true;
const outdatedLinkTags = new WeakSet();
const debounceReload = (time) => {
    let timer;
    return () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        timer = setTimeout(() => {
            location.reload();
        }, time);
    };
};
const pageReload = debounceReload(50);
const hmrClient = new HMRClient(console, {
    isReady: () => socket && socket.readyState === 1,
    send: (message) => socket.send(message),
}, async function importUpdatedModule({ acceptedPath, timestamp, explicitImportRequired, isWithinCircularImport, }) {
    const [acceptedPathWithoutQuery, query] = acceptedPath.split(`?`);
    const importPromise = import(
    /* @vite-ignore */
    base +
        acceptedPathWithoutQuery.slice(1) +
        `?${explicitImportRequired ? 'import&' : ''}t=${timestamp}${query ? `&${query}` : ''}`);
    if (isWithinCircularImport) {
        importPromise.catch(() => {
            console.info(`[hmr] ${acceptedPath} failed to apply HMR as it's within a circular import. Reloading page to reset the execution order. ` +
                `To debug and break the circular import, you can run \`vite --debug hmr\` to log the circular dependency path if a file change triggered it.`);
            pageReload();
        });
    }
    return await importPromise;
});
async function handleMessage(payload) {
    switch (payload.type) {
        case 'connected':
            console.debug(`[vite] connected.`);
            hmrClient.messenger.flush();
            // proxy(nginx, docker) hmr ws maybe caused timeout,
            // so send ping package let ws keep alive.
            setInterval(() => {
                if (socket.readyState === socket.OPEN) {
                    socket.send('{"type":"ping"}');
                }
            }, 30000);
            break;
        case 'update':
            notifyListeners('vite:beforeUpdate', payload);
            // if this is the first update and there's already an error overlay, it
            // means the page opened with existing server compile error and the whole
            // module script failed to load (since one of the nested imports is 500).
            // in this case a normal update won't work and a full reload is needed.
            if (isFirstUpdate && hasErrorOverlay()) {
                window.location.reload();
                return;
            }
            else {
                clearErrorOverlay();
                isFirstUpdate = false;
            }
            await Promise.all(payload.updates.map(async (update) => {
                if (update.type === 'js-update') {
                    return hmrClient.queueUpdate(update);
                }
                // css-update
                // this is only sent when a css file referenced with <link> is updated
                const { path, timestamp } = update;
                const searchUrl = cleanUrl(path);
                // can't use querySelector with `[href*=]` here since the link may be
                // using relative paths so we need to use link.href to grab the full
                // URL for the include check.
                const el = Array.from(document.querySelectorAll('link')).find((e) => !outdatedLinkTags.has(e) && cleanUrl(e.href).includes(searchUrl));
                if (!el) {
                    return;
                }
                const newPath = `${base}${searchUrl.slice(1)}${searchUrl.includes('?') ? '&' : '?'}t=${timestamp}`;
                // rather than swapping the href on the existing tag, we will
                // create a new link tag. Once the new stylesheet has loaded we
                // will remove the existing link tag. This removes a Flash Of
                // Unstyled Content that can occur when swapping out the tag href
                // directly, as the new stylesheet has not yet been loaded.
                return new Promise((resolve) => {
                    const newLinkTag = el.cloneNode();
                    newLinkTag.href = new URL(newPath, el.href).href;
                    const removeOldEl = () => {
                        el.remove();
                        console.debug(`[vite] css hot updated: ${searchUrl}`);
                        resolve();
                    };
                    newLinkTag.addEventListener('load', removeOldEl);
                    newLinkTag.addEventListener('error', removeOldEl);
                    outdatedLinkTags.add(el);
                    el.after(newLinkTag);
                });
            }));
            notifyListeners('vite:afterUpdate', payload);
            break;
        case 'custom': {
            notifyListeners(payload.event, payload.data);
            break;
        }
        case 'full-reload':
            notifyListeners('vite:beforeFullReload', payload);
            if (payload.path && payload.path.endsWith('.html')) {
                // if html file is edited, only reload the page if the browser is
                // currently on that page.
                const pagePath = decodeURI(location.pathname);
                const payloadPath = base + payload.path.slice(1);
                if (pagePath === payloadPath ||
                    payload.path === '/index.html' ||
                    (pagePath.endsWith('/') && pagePath + 'index.html' === payloadPath)) {
                    pageReload();
                }
                return;
            }
            else {
                pageReload();
            }
            break;
        case 'prune':
            notifyListeners('vite:beforePrune', payload);
            hmrClient.prunePaths(payload.paths);
            break;
        case 'error': {
            notifyListeners('vite:error', payload);
            const err = payload.err;
            if (enableOverlay) {
                createErrorOverlay(err);
            }
            else {
                console.error(`[vite] Internal Server Error\n${err.message}\n${err.stack}`);
            }
            break;
        }
        default: {
            const check = payload;
            return check;
        }
    }
}
function notifyListeners(event, data) {
    hmrClient.notifyListeners(event, data);
}
const enableOverlay = true;
function createErrorOverlay(err) {
    clearErrorOverlay();
    document.body.appendChild(new ErrorOverlay(err));
}
function clearErrorOverlay() {
    document.querySelectorAll(overlayId).forEach((n) => n.close());
}
function hasErrorOverlay() {
    return document.querySelectorAll(overlayId).length;
}
async function waitForSuccessfulPing(socketProtocol, hostAndPath, ms = 1000) {
    const pingHostProtocol = socketProtocol === 'wss' ? 'https' : 'http';
    const ping = async () => {
        // A fetch on a websocket URL will return a successful promise with status 400,
        // but will reject a networking error.
        // When running on middleware mode, it returns status 426, and an cors error happens if mode is not no-cors
        try {
            await fetch(`${pingHostProtocol}://${hostAndPath}`, {
                mode: 'no-cors',
                headers: {
                    // Custom headers won't be included in a request with no-cors so (ab)use one of the
                    // safelisted headers to identify the ping request
                    Accept: 'text/x-vite-ping',
                },
            });
            return true;
        }
        catch { }
        return false;
    };
    if (await ping()) {
        return;
    }
    await wait(ms);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (document.visibilityState === 'visible') {
            if (await ping()) {
                break;
            }
            await wait(ms);
        }
        else {
            await waitForWindowShow();
        }
    }
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function waitForWindowShow() {
    return new Promise((resolve) => {
        const onChange = async () => {
            if (document.visibilityState === 'visible') {
                resolve();
                document.removeEventListener('visibilitychange', onChange);
            }
        };
        document.addEventListener('visibilitychange', onChange);
    });
}
const sheetsMap = new Map();
// collect existing style elements that may have been inserted during SSR
// to avoid FOUC or duplicate styles
if ('document' in globalThis) {
    document
        .querySelectorAll('style[data-vite-dev-id]')
        .forEach((el) => {
        sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
    });
}
// all css imports should be inserted at the same position
// because after build it will be a single css file
let lastInsertedStyle;
function updateStyle(id, content) {
    let style = sheetsMap.get(id);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.setAttribute('data-vite-dev-id', id);
        style.textContent = content;
        if (!lastInsertedStyle) {
            document.head.appendChild(style);
            // reset lastInsertedStyle after async
            // because dynamically imported css will be splitted into a different file
            setTimeout(() => {
                lastInsertedStyle = undefined;
            }, 0);
        }
        else {
            lastInsertedStyle.insertAdjacentElement('afterend', style);
        }
        lastInsertedStyle = style;
    }
    else {
        style.textContent = content;
    }
    sheetsMap.set(id, style);
}
function removeStyle(id) {
    const style = sheetsMap.get(id);
    if (style) {
        document.head.removeChild(style);
        sheetsMap.delete(id);
    }
}
function createHotContext(ownerPath) {
    return new HMRContext(hmrClient, ownerPath);
}
/**
 * urls here are dynamic import() urls that couldn't be statically analyzed
 */
function injectQuery(url, queryToInject) {
    // skip urls that won't be handled by vite
    if (url[0] !== '.' && url[0] !== '/') {
        return url;
    }
    // can't use pathname from URL since it may be relative like ../
    const pathname = url.replace(/[?#].*$/, '');
    const { search, hash } = new URL(url, 'http://vitejs.dev');
    return `${pathname}?${queryToInject}${search ? `&` + search.slice(1) : ''}${hash || ''}`;
}

export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
//# sourceMappingURL=client.mjs.map

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpZW50Lm1qcyIsInNvdXJjZXMiOlsiaG1yLnRzIiwib3ZlcmxheS50cyIsImNsaWVudC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IFVwZGF0ZSB9IGZyb20gJ3R5cGVzL2htclBheWxvYWQnXG5pbXBvcnQgdHlwZSB7IE1vZHVsZU5hbWVzcGFjZSwgVml0ZUhvdENvbnRleHQgfSBmcm9tICd0eXBlcy9ob3QnXG5pbXBvcnQgdHlwZSB7IEluZmVyQ3VzdG9tRXZlbnRQYXlsb2FkIH0gZnJvbSAndHlwZXMvY3VzdG9tRXZlbnQnXG5cbnR5cGUgQ3VzdG9tTGlzdGVuZXJzTWFwID0gTWFwPHN0cmluZywgKChkYXRhOiBhbnkpID0+IHZvaWQpW10+XG5cbmludGVyZmFjZSBIb3RNb2R1bGUge1xuICBpZDogc3RyaW5nXG4gIGNhbGxiYWNrczogSG90Q2FsbGJhY2tbXVxufVxuXG5pbnRlcmZhY2UgSG90Q2FsbGJhY2sge1xuICAvLyB0aGUgZGVwZW5kZW5jaWVzIG11c3QgYmUgZmV0Y2hhYmxlIHBhdGhzXG4gIGRlcHM6IHN0cmluZ1tdXG4gIGZuOiAobW9kdWxlczogQXJyYXk8TW9kdWxlTmFtZXNwYWNlIHwgdW5kZWZpbmVkPikgPT4gdm9pZFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhNUkxvZ2dlciB7XG4gIGVycm9yKG1zZzogc3RyaW5nIHwgRXJyb3IpOiB2b2lkXG4gIGRlYnVnKC4uLm1zZzogdW5rbm93bltdKTogdm9pZFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhNUkNvbm5lY3Rpb24ge1xuICAvKipcbiAgICogQ2hlY2tlZCBiZWZvcmUgc2VuZGluZyBtZXNzYWdlcyB0byB0aGUgY2xpZW50LlxuICAgKi9cbiAgaXNSZWFkeSgpOiBib29sZWFuXG4gIC8qKlxuICAgKiBTZW5kIG1lc3NhZ2UgdG8gdGhlIGNsaWVudC5cbiAgICovXG4gIHNlbmQobWVzc2FnZXM6IHN0cmluZyk6IHZvaWRcbn1cblxuZXhwb3J0IGNsYXNzIEhNUkNvbnRleHQgaW1wbGVtZW50cyBWaXRlSG90Q29udGV4dCB7XG4gIHByaXZhdGUgbmV3TGlzdGVuZXJzOiBDdXN0b21MaXN0ZW5lcnNNYXBcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGhtckNsaWVudDogSE1SQ2xpZW50LFxuICAgIHByaXZhdGUgb3duZXJQYXRoOiBzdHJpbmcsXG4gICkge1xuICAgIGlmICghaG1yQ2xpZW50LmRhdGFNYXAuaGFzKG93bmVyUGF0aCkpIHtcbiAgICAgIGhtckNsaWVudC5kYXRhTWFwLnNldChvd25lclBhdGgsIHt9KVxuICAgIH1cblxuICAgIC8vIHdoZW4gYSBmaWxlIGlzIGhvdCB1cGRhdGVkLCBhIG5ldyBjb250ZXh0IGlzIGNyZWF0ZWRcbiAgICAvLyBjbGVhciBpdHMgc3RhbGUgY2FsbGJhY2tzXG4gICAgY29uc3QgbW9kID0gaG1yQ2xpZW50LmhvdE1vZHVsZXNNYXAuZ2V0KG93bmVyUGF0aClcbiAgICBpZiAobW9kKSB7XG4gICAgICBtb2QuY2FsbGJhY2tzID0gW11cbiAgICB9XG5cbiAgICAvLyBjbGVhciBzdGFsZSBjdXN0b20gZXZlbnQgbGlzdGVuZXJzXG4gICAgY29uc3Qgc3RhbGVMaXN0ZW5lcnMgPSBobXJDbGllbnQuY3R4VG9MaXN0ZW5lcnNNYXAuZ2V0KG93bmVyUGF0aClcbiAgICBpZiAoc3RhbGVMaXN0ZW5lcnMpIHtcbiAgICAgIGZvciAoY29uc3QgW2V2ZW50LCBzdGFsZUZuc10gb2Ygc3RhbGVMaXN0ZW5lcnMpIHtcbiAgICAgICAgY29uc3QgbGlzdGVuZXJzID0gaG1yQ2xpZW50LmN1c3RvbUxpc3RlbmVyc01hcC5nZXQoZXZlbnQpXG4gICAgICAgIGlmIChsaXN0ZW5lcnMpIHtcbiAgICAgICAgICBobXJDbGllbnQuY3VzdG9tTGlzdGVuZXJzTWFwLnNldChcbiAgICAgICAgICAgIGV2ZW50LFxuICAgICAgICAgICAgbGlzdGVuZXJzLmZpbHRlcigobCkgPT4gIXN0YWxlRm5zLmluY2x1ZGVzKGwpKSxcbiAgICAgICAgICApXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLm5ld0xpc3RlbmVycyA9IG5ldyBNYXAoKVxuICAgIGhtckNsaWVudC5jdHhUb0xpc3RlbmVyc01hcC5zZXQob3duZXJQYXRoLCB0aGlzLm5ld0xpc3RlbmVycylcbiAgfVxuXG4gIGdldCBkYXRhKCk6IGFueSB7XG4gICAgcmV0dXJuIHRoaXMuaG1yQ2xpZW50LmRhdGFNYXAuZ2V0KHRoaXMub3duZXJQYXRoKVxuICB9XG5cbiAgYWNjZXB0KGRlcHM/OiBhbnksIGNhbGxiYWNrPzogYW55KTogdm9pZCB7XG4gICAgaWYgKHR5cGVvZiBkZXBzID09PSAnZnVuY3Rpb24nIHx8ICFkZXBzKSB7XG4gICAgICAvLyBzZWxmLWFjY2VwdDogaG90LmFjY2VwdCgoKSA9PiB7fSlcbiAgICAgIHRoaXMuYWNjZXB0RGVwcyhbdGhpcy5vd25lclBhdGhdLCAoW21vZF0pID0+IGRlcHM/Lihtb2QpKVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlcHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAvLyBleHBsaWNpdCBkZXBzXG4gICAgICB0aGlzLmFjY2VwdERlcHMoW2RlcHNdLCAoW21vZF0pID0+IGNhbGxiYWNrPy4obW9kKSlcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGVwcykpIHtcbiAgICAgIHRoaXMuYWNjZXB0RGVwcyhkZXBzLCBjYWxsYmFjaylcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBpbnZhbGlkIGhvdC5hY2NlcHQoKSB1c2FnZS5gKVxuICAgIH1cbiAgfVxuXG4gIC8vIGV4cG9ydCBuYW1lcyAoZmlyc3QgYXJnKSBhcmUgaXJyZWxldmFudCBvbiB0aGUgY2xpZW50IHNpZGUsIHRoZXkncmVcbiAgLy8gZXh0cmFjdGVkIGluIHRoZSBzZXJ2ZXIgZm9yIHByb3BhZ2F0aW9uXG4gIGFjY2VwdEV4cG9ydHMoXG4gICAgXzogc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10sXG4gICAgY2FsbGJhY2s6IChkYXRhOiBhbnkpID0+IHZvaWQsXG4gICk6IHZvaWQge1xuICAgIHRoaXMuYWNjZXB0RGVwcyhbdGhpcy5vd25lclBhdGhdLCAoW21vZF0pID0+IGNhbGxiYWNrPy4obW9kKSlcbiAgfVxuXG4gIGRpc3Bvc2UoY2I6IChkYXRhOiBhbnkpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLmhtckNsaWVudC5kaXNwb3NlTWFwLnNldCh0aGlzLm93bmVyUGF0aCwgY2IpXG4gIH1cblxuICBwcnVuZShjYjogKGRhdGE6IGFueSkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuaG1yQ2xpZW50LnBydW5lTWFwLnNldCh0aGlzLm93bmVyUGF0aCwgY2IpXG4gIH1cblxuICAvLyBLZXB0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5ICgjMTEwMzYpXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZW1wdHktZnVuY3Rpb25cbiAgZGVjbGluZSgpOiB2b2lkIHt9XG5cbiAgaW52YWxpZGF0ZShtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmhtckNsaWVudC5ub3RpZnlMaXN0ZW5lcnMoJ3ZpdGU6aW52YWxpZGF0ZScsIHtcbiAgICAgIHBhdGg6IHRoaXMub3duZXJQYXRoLFxuICAgICAgbWVzc2FnZSxcbiAgICB9KVxuICAgIHRoaXMuc2VuZCgndml0ZTppbnZhbGlkYXRlJywgeyBwYXRoOiB0aGlzLm93bmVyUGF0aCwgbWVzc2FnZSB9KVxuICAgIHRoaXMuaG1yQ2xpZW50LmxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBbdml0ZV0gaW52YWxpZGF0ZSAke3RoaXMub3duZXJQYXRofSR7bWVzc2FnZSA/IGA6ICR7bWVzc2FnZX1gIDogJyd9YCxcbiAgICApXG4gIH1cblxuICBvbjxUIGV4dGVuZHMgc3RyaW5nPihcbiAgICBldmVudDogVCxcbiAgICBjYjogKHBheWxvYWQ6IEluZmVyQ3VzdG9tRXZlbnRQYXlsb2FkPFQ+KSA9PiB2b2lkLFxuICApOiB2b2lkIHtcbiAgICBjb25zdCBhZGRUb01hcCA9IChtYXA6IE1hcDxzdHJpbmcsIGFueVtdPikgPT4ge1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSBtYXAuZ2V0KGV2ZW50KSB8fCBbXVxuICAgICAgZXhpc3RpbmcucHVzaChjYilcbiAgICAgIG1hcC5zZXQoZXZlbnQsIGV4aXN0aW5nKVxuICAgIH1cbiAgICBhZGRUb01hcCh0aGlzLmhtckNsaWVudC5jdXN0b21MaXN0ZW5lcnNNYXApXG4gICAgYWRkVG9NYXAodGhpcy5uZXdMaXN0ZW5lcnMpXG4gIH1cblxuICBvZmY8VCBleHRlbmRzIHN0cmluZz4oXG4gICAgZXZlbnQ6IFQsXG4gICAgY2I6IChwYXlsb2FkOiBJbmZlckN1c3RvbUV2ZW50UGF5bG9hZDxUPikgPT4gdm9pZCxcbiAgKTogdm9pZCB7XG4gICAgY29uc3QgcmVtb3ZlRnJvbU1hcCA9IChtYXA6IE1hcDxzdHJpbmcsIGFueVtdPikgPT4ge1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSBtYXAuZ2V0KGV2ZW50KVxuICAgICAgaWYgKGV4aXN0aW5nID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBjb25zdCBwcnVuZWQgPSBleGlzdGluZy5maWx0ZXIoKGwpID0+IGwgIT09IGNiKVxuICAgICAgaWYgKHBydW5lZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgbWFwLmRlbGV0ZShldmVudClcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBtYXAuc2V0KGV2ZW50LCBwcnVuZWQpXG4gICAgfVxuICAgIHJlbW92ZUZyb21NYXAodGhpcy5obXJDbGllbnQuY3VzdG9tTGlzdGVuZXJzTWFwKVxuICAgIHJlbW92ZUZyb21NYXAodGhpcy5uZXdMaXN0ZW5lcnMpXG4gIH1cblxuICBzZW5kPFQgZXh0ZW5kcyBzdHJpbmc+KGV2ZW50OiBULCBkYXRhPzogSW5mZXJDdXN0b21FdmVudFBheWxvYWQ8VD4pOiB2b2lkIHtcbiAgICB0aGlzLmhtckNsaWVudC5tZXNzZW5nZXIuc2VuZChcbiAgICAgIEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ2N1c3RvbScsIGV2ZW50LCBkYXRhIH0pLFxuICAgIClcbiAgfVxuXG4gIHByaXZhdGUgYWNjZXB0RGVwcyhcbiAgICBkZXBzOiBzdHJpbmdbXSxcbiAgICBjYWxsYmFjazogSG90Q2FsbGJhY2tbJ2ZuJ10gPSAoKSA9PiB7fSxcbiAgKTogdm9pZCB7XG4gICAgY29uc3QgbW9kOiBIb3RNb2R1bGUgPSB0aGlzLmhtckNsaWVudC5ob3RNb2R1bGVzTWFwLmdldCh0aGlzLm93bmVyUGF0aCkgfHwge1xuICAgICAgaWQ6IHRoaXMub3duZXJQYXRoLFxuICAgICAgY2FsbGJhY2tzOiBbXSxcbiAgICB9XG4gICAgbW9kLmNhbGxiYWNrcy5wdXNoKHtcbiAgICAgIGRlcHMsXG4gICAgICBmbjogY2FsbGJhY2ssXG4gICAgfSlcbiAgICB0aGlzLmhtckNsaWVudC5ob3RNb2R1bGVzTWFwLnNldCh0aGlzLm93bmVyUGF0aCwgbW9kKVxuICB9XG59XG5cbmNsYXNzIEhNUk1lc3NlbmdlciB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgY29ubmVjdGlvbjogSE1SQ29ubmVjdGlvbikge31cblxuICBwcml2YXRlIHF1ZXVlOiBzdHJpbmdbXSA9IFtdXG5cbiAgcHVibGljIHNlbmQobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5xdWV1ZS5wdXNoKG1lc3NhZ2UpXG4gICAgdGhpcy5mbHVzaCgpXG4gIH1cblxuICBwdWJsaWMgZmx1c2goKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvbi5pc1JlYWR5KCkpIHtcbiAgICAgIHRoaXMucXVldWUuZm9yRWFjaCgobXNnKSA9PiB0aGlzLmNvbm5lY3Rpb24uc2VuZChtc2cpKVxuICAgICAgdGhpcy5xdWV1ZSA9IFtdXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBITVJDbGllbnQge1xuICBwdWJsaWMgaG90TW9kdWxlc01hcCA9IG5ldyBNYXA8c3RyaW5nLCBIb3RNb2R1bGU+KClcbiAgcHVibGljIGRpc3Bvc2VNYXAgPSBuZXcgTWFwPHN0cmluZywgKGRhdGE6IGFueSkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4+KClcbiAgcHVibGljIHBydW5lTWFwID0gbmV3IE1hcDxzdHJpbmcsIChkYXRhOiBhbnkpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+PigpXG4gIHB1YmxpYyBkYXRhTWFwID0gbmV3IE1hcDxzdHJpbmcsIGFueT4oKVxuICBwdWJsaWMgY3VzdG9tTGlzdGVuZXJzTWFwOiBDdXN0b21MaXN0ZW5lcnNNYXAgPSBuZXcgTWFwKClcbiAgcHVibGljIGN0eFRvTGlzdGVuZXJzTWFwID0gbmV3IE1hcDxzdHJpbmcsIEN1c3RvbUxpc3RlbmVyc01hcD4oKVxuXG4gIHB1YmxpYyBtZXNzZW5nZXI6IEhNUk1lc3NlbmdlclxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyBsb2dnZXI6IEhNUkxvZ2dlcixcbiAgICBjb25uZWN0aW9uOiBITVJDb25uZWN0aW9uLFxuICAgIC8vIFRoaXMgYWxsb3dzIGltcGxlbWVudGluZyByZWxvYWRpbmcgdmlhIGRpZmZlcmVudCBtZXRob2RzIGRlcGVuZGluZyBvbiB0aGUgZW52aXJvbm1lbnRcbiAgICBwcml2YXRlIGltcG9ydFVwZGF0ZWRNb2R1bGU6ICh1cGRhdGU6IFVwZGF0ZSkgPT4gUHJvbWlzZTxNb2R1bGVOYW1lc3BhY2U+LFxuICApIHtcbiAgICB0aGlzLm1lc3NlbmdlciA9IG5ldyBITVJNZXNzZW5nZXIoY29ubmVjdGlvbilcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBub3RpZnlMaXN0ZW5lcnM8VCBleHRlbmRzIHN0cmluZz4oXG4gICAgZXZlbnQ6IFQsXG4gICAgZGF0YTogSW5mZXJDdXN0b21FdmVudFBheWxvYWQ8VD4sXG4gICk6IFByb21pc2U8dm9pZD5cbiAgcHVibGljIGFzeW5jIG5vdGlmeUxpc3RlbmVycyhldmVudDogc3RyaW5nLCBkYXRhOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjYnMgPSB0aGlzLmN1c3RvbUxpc3RlbmVyc01hcC5nZXQoZXZlbnQpXG4gICAgaWYgKGNicykge1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGNicy5tYXAoKGNiKSA9PiBjYihkYXRhKSkpXG4gICAgfVxuICB9XG5cbiAgcHVibGljIGNsZWFyKCk6IHZvaWQge1xuICAgIHRoaXMuaG90TW9kdWxlc01hcC5jbGVhcigpXG4gICAgdGhpcy5kaXNwb3NlTWFwLmNsZWFyKClcbiAgICB0aGlzLnBydW5lTWFwLmNsZWFyKClcbiAgICB0aGlzLmRhdGFNYXAuY2xlYXIoKVxuICAgIHRoaXMuY3VzdG9tTGlzdGVuZXJzTWFwLmNsZWFyKClcbiAgICB0aGlzLmN0eFRvTGlzdGVuZXJzTWFwLmNsZWFyKClcbiAgfVxuXG4gIC8vIEFmdGVyIGFuIEhNUiB1cGRhdGUsIHNvbWUgbW9kdWxlcyBhcmUgbm8gbG9uZ2VyIGltcG9ydGVkIG9uIHRoZSBwYWdlXG4gIC8vIGJ1dCB0aGV5IG1heSBoYXZlIGxlZnQgYmVoaW5kIHNpZGUgZWZmZWN0cyB0aGF0IG5lZWQgdG8gYmUgY2xlYW5lZCB1cFxuICAvLyAoLmUuZyBzdHlsZSBpbmplY3Rpb25zKVxuICAvLyBUT0RPIFRyaWdnZXIgdGhlaXIgZGlzcG9zZSBjYWxsYmFja3MuXG4gIHB1YmxpYyBwcnVuZVBhdGhzKHBhdGhzOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgIHBhdGhzLmZvckVhY2goKHBhdGgpID0+IHtcbiAgICAgIGNvbnN0IGZuID0gdGhpcy5wcnVuZU1hcC5nZXQocGF0aClcbiAgICAgIGlmIChmbikge1xuICAgICAgICBmbih0aGlzLmRhdGFNYXAuZ2V0KHBhdGgpKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBwcm90ZWN0ZWQgd2FybkZhaWxlZFVwZGF0ZShlcnI6IEVycm9yLCBwYXRoOiBzdHJpbmcgfCBzdHJpbmdbXSk6IHZvaWQge1xuICAgIGlmICghZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ2ZldGNoJykpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKGVycilcbiAgICB9XG4gICAgdGhpcy5sb2dnZXIuZXJyb3IoXG4gICAgICBgW2htcl0gRmFpbGVkIHRvIHJlbG9hZCAke3BhdGh9LiBgICtcbiAgICAgICAgYFRoaXMgY291bGQgYmUgZHVlIHRvIHN5bnRheCBlcnJvcnMgb3IgaW1wb3J0aW5nIG5vbi1leGlzdGVudCBgICtcbiAgICAgICAgYG1vZHVsZXMuIChzZWUgZXJyb3JzIGFib3ZlKWAsXG4gICAgKVxuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVRdWV1ZTogUHJvbWlzZTwoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ+W10gPSBbXVxuICBwcml2YXRlIHBlbmRpbmdVcGRhdGVRdWV1ZSA9IGZhbHNlXG5cbiAgLyoqXG4gICAqIGJ1ZmZlciBtdWx0aXBsZSBob3QgdXBkYXRlcyB0cmlnZ2VyZWQgYnkgdGhlIHNhbWUgc3JjIGNoYW5nZVxuICAgKiBzbyB0aGF0IHRoZXkgYXJlIGludm9rZWQgaW4gdGhlIHNhbWUgb3JkZXIgdGhleSB3ZXJlIHNlbnQuXG4gICAqIChvdGhlcndpc2UgdGhlIG9yZGVyIG1heSBiZSBpbmNvbnNpc3RlbnQgYmVjYXVzZSBvZiB0aGUgaHR0cCByZXF1ZXN0IHJvdW5kIHRyaXApXG4gICAqL1xuICBwdWJsaWMgYXN5bmMgcXVldWVVcGRhdGUocGF5bG9hZDogVXBkYXRlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy51cGRhdGVRdWV1ZS5wdXNoKHRoaXMuZmV0Y2hVcGRhdGUocGF5bG9hZCkpXG4gICAgaWYgKCF0aGlzLnBlbmRpbmdVcGRhdGVRdWV1ZSkge1xuICAgICAgdGhpcy5wZW5kaW5nVXBkYXRlUXVldWUgPSB0cnVlXG4gICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgdGhpcy5wZW5kaW5nVXBkYXRlUXVldWUgPSBmYWxzZVxuICAgICAgY29uc3QgbG9hZGluZyA9IFsuLi50aGlzLnVwZGF0ZVF1ZXVlXVxuICAgICAgdGhpcy51cGRhdGVRdWV1ZSA9IFtdXG4gICAgICA7KGF3YWl0IFByb21pc2UuYWxsKGxvYWRpbmcpKS5mb3JFYWNoKChmbikgPT4gZm4gJiYgZm4oKSlcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGZldGNoVXBkYXRlKHVwZGF0ZTogVXBkYXRlKTogUHJvbWlzZTwoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ+IHtcbiAgICBjb25zdCB7IHBhdGgsIGFjY2VwdGVkUGF0aCB9ID0gdXBkYXRlXG4gICAgY29uc3QgbW9kID0gdGhpcy5ob3RNb2R1bGVzTWFwLmdldChwYXRoKVxuICAgIGlmICghbW9kKSB7XG4gICAgICAvLyBJbiBhIGNvZGUtc3BsaXR0aW5nIHByb2plY3QsXG4gICAgICAvLyBpdCBpcyBjb21tb24gdGhhdCB0aGUgaG90LXVwZGF0aW5nIG1vZHVsZSBpcyBub3QgbG9hZGVkIHlldC5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXRlanMvdml0ZS9pc3N1ZXMvNzIxXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBsZXQgZmV0Y2hlZE1vZHVsZTogTW9kdWxlTmFtZXNwYWNlIHwgdW5kZWZpbmVkXG4gICAgY29uc3QgaXNTZWxmVXBkYXRlID0gcGF0aCA9PT0gYWNjZXB0ZWRQYXRoXG5cbiAgICAvLyBkZXRlcm1pbmUgdGhlIHF1YWxpZmllZCBjYWxsYmFja3MgYmVmb3JlIHdlIHJlLWltcG9ydCB0aGUgbW9kdWxlc1xuICAgIGNvbnN0IHF1YWxpZmllZENhbGxiYWNrcyA9IG1vZC5jYWxsYmFja3MuZmlsdGVyKCh7IGRlcHMgfSkgPT5cbiAgICAgIGRlcHMuaW5jbHVkZXMoYWNjZXB0ZWRQYXRoKSxcbiAgICApXG5cbiAgICBpZiAoaXNTZWxmVXBkYXRlIHx8IHF1YWxpZmllZENhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBkaXNwb3NlciA9IHRoaXMuZGlzcG9zZU1hcC5nZXQoYWNjZXB0ZWRQYXRoKVxuICAgICAgaWYgKGRpc3Bvc2VyKSBhd2FpdCBkaXNwb3Nlcih0aGlzLmRhdGFNYXAuZ2V0KGFjY2VwdGVkUGF0aCkpXG4gICAgICB0cnkge1xuICAgICAgICBmZXRjaGVkTW9kdWxlID0gYXdhaXQgdGhpcy5pbXBvcnRVcGRhdGVkTW9kdWxlKHVwZGF0ZSlcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhpcy53YXJuRmFpbGVkVXBkYXRlKGUsIGFjY2VwdGVkUGF0aClcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgZm9yIChjb25zdCB7IGRlcHMsIGZuIH0gb2YgcXVhbGlmaWVkQ2FsbGJhY2tzKSB7XG4gICAgICAgIGZuKFxuICAgICAgICAgIGRlcHMubWFwKChkZXApID0+IChkZXAgPT09IGFjY2VwdGVkUGF0aCA/IGZldGNoZWRNb2R1bGUgOiB1bmRlZmluZWQpKSxcbiAgICAgICAgKVxuICAgICAgfVxuICAgICAgY29uc3QgbG9nZ2VkUGF0aCA9IGlzU2VsZlVwZGF0ZSA/IHBhdGggOiBgJHthY2NlcHRlZFBhdGh9IHZpYSAke3BhdGh9YFxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoYFt2aXRlXSBob3QgdXBkYXRlZDogJHtsb2dnZWRQYXRofWApXG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgdHlwZSB7IEVycm9yUGF5bG9hZCB9IGZyb20gJ3R5cGVzL2htclBheWxvYWQnXG5cbi8vIGluamVjdGVkIGJ5IHRoZSBobXIgcGx1Z2luIHdoZW4gc2VydmVkXG5kZWNsYXJlIGNvbnN0IF9fQkFTRV9fOiBzdHJpbmdcbmRlY2xhcmUgY29uc3QgX19ITVJfQ09ORklHX05BTUVfXzogc3RyaW5nXG5cbmNvbnN0IGhtckNvbmZpZ05hbWUgPSBfX0hNUl9DT05GSUdfTkFNRV9fXG5jb25zdCBiYXNlID0gX19CQVNFX18gfHwgJy8nXG5cbi8vIHNldCA6aG9zdCBzdHlsZXMgdG8gbWFrZSBwbGF5d3JpZ2h0IGRldGVjdCB0aGUgZWxlbWVudCBhcyB2aXNpYmxlXG5jb25zdCB0ZW1wbGF0ZSA9IC8qaHRtbCovIGBcbjxzdHlsZT5cbjpob3N0IHtcbiAgcG9zaXRpb246IGZpeGVkO1xuICB0b3A6IDA7XG4gIGxlZnQ6IDA7XG4gIHdpZHRoOiAxMDAlO1xuICBoZWlnaHQ6IDEwMCU7XG4gIHotaW5kZXg6IDk5OTk5O1xuICAtLW1vbm9zcGFjZTogJ1NGTW9uby1SZWd1bGFyJywgQ29uc29sYXMsXG4gICdMaWJlcmF0aW9uIE1vbm8nLCBNZW5sbywgQ291cmllciwgbW9ub3NwYWNlO1xuICAtLXJlZDogI2ZmNTU1NTtcbiAgLS15ZWxsb3c6ICNlMmFhNTM7XG4gIC0tcHVycGxlOiAjY2ZhNGZmO1xuICAtLWN5YW46ICMyZGQ5ZGE7XG4gIC0tZGltOiAjYzljOWM5O1xuXG4gIC0td2luZG93LWJhY2tncm91bmQ6ICMxODE4MTg7XG4gIC0td2luZG93LWNvbG9yOiAjZDhkOGQ4O1xufVxuXG4uYmFja2Ryb3Age1xuICBwb3NpdGlvbjogZml4ZWQ7XG4gIHotaW5kZXg6IDk5OTk5O1xuICB0b3A6IDA7XG4gIGxlZnQ6IDA7XG4gIHdpZHRoOiAxMDAlO1xuICBoZWlnaHQ6IDEwMCU7XG4gIG92ZXJmbG93LXk6IHNjcm9sbDtcbiAgbWFyZ2luOiAwO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuNjYpO1xufVxuXG4ud2luZG93IHtcbiAgZm9udC1mYW1pbHk6IHZhcigtLW1vbm9zcGFjZSk7XG4gIGxpbmUtaGVpZ2h0OiAxLjU7XG4gIHdpZHRoOiA4MDBweDtcbiAgY29sb3I6IHZhcigtLXdpbmRvdy1jb2xvcik7XG4gIG1hcmdpbjogMzBweCBhdXRvO1xuICBwYWRkaW5nOiAyNXB4IDQwcHg7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgYmFja2dyb3VuZDogdmFyKC0td2luZG93LWJhY2tncm91bmQpO1xuICBib3JkZXItcmFkaXVzOiA2cHggNnB4IDhweCA4cHg7XG4gIGJveC1zaGFkb3c6IDAgMTlweCAzOHB4IHJnYmEoMCwwLDAsMC4zMCksIDAgMTVweCAxMnB4IHJnYmEoMCwwLDAsMC4yMik7XG4gIG92ZXJmbG93OiBoaWRkZW47XG4gIGJvcmRlci10b3A6IDhweCBzb2xpZCB2YXIoLS1yZWQpO1xuICBkaXJlY3Rpb246IGx0cjtcbiAgdGV4dC1hbGlnbjogbGVmdDtcbn1cblxucHJlIHtcbiAgZm9udC1mYW1pbHk6IHZhcigtLW1vbm9zcGFjZSk7XG4gIGZvbnQtc2l6ZTogMTZweDtcbiAgbWFyZ2luLXRvcDogMDtcbiAgbWFyZ2luLWJvdHRvbTogMWVtO1xuICBvdmVyZmxvdy14OiBzY3JvbGw7XG4gIHNjcm9sbGJhci13aWR0aDogbm9uZTtcbn1cblxucHJlOjotd2Via2l0LXNjcm9sbGJhciB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbnByZS5mcmFtZTo6LXdlYmtpdC1zY3JvbGxiYXIge1xuICBkaXNwbGF5OiBibG9jaztcbiAgaGVpZ2h0OiA1cHg7XG59XG5cbnByZS5mcmFtZTo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIge1xuICBiYWNrZ3JvdW5kOiAjOTk5O1xuICBib3JkZXItcmFkaXVzOiA1cHg7XG59XG5cbnByZS5mcmFtZSB7XG4gIHNjcm9sbGJhci13aWR0aDogdGhpbjtcbn1cblxuLm1lc3NhZ2Uge1xuICBsaW5lLWhlaWdodDogMS4zO1xuICBmb250LXdlaWdodDogNjAwO1xuICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG59XG5cbi5tZXNzYWdlLWJvZHkge1xuICBjb2xvcjogdmFyKC0tcmVkKTtcbn1cblxuLnBsdWdpbiB7XG4gIGNvbG9yOiB2YXIoLS1wdXJwbGUpO1xufVxuXG4uZmlsZSB7XG4gIGNvbG9yOiB2YXIoLS1jeWFuKTtcbiAgbWFyZ2luLWJvdHRvbTogMDtcbiAgd2hpdGUtc3BhY2U6IHByZS13cmFwO1xuICB3b3JkLWJyZWFrOiBicmVhay1hbGw7XG59XG5cbi5mcmFtZSB7XG4gIGNvbG9yOiB2YXIoLS15ZWxsb3cpO1xufVxuXG4uc3RhY2sge1xuICBmb250LXNpemU6IDEzcHg7XG4gIGNvbG9yOiB2YXIoLS1kaW0pO1xufVxuXG4udGlwIHtcbiAgZm9udC1zaXplOiAxM3B4O1xuICBjb2xvcjogIzk5OTtcbiAgYm9yZGVyLXRvcDogMXB4IGRvdHRlZCAjOTk5O1xuICBwYWRkaW5nLXRvcDogMTNweDtcbiAgbGluZS1oZWlnaHQ6IDEuODtcbn1cblxuY29kZSB7XG4gIGZvbnQtc2l6ZTogMTNweDtcbiAgZm9udC1mYW1pbHk6IHZhcigtLW1vbm9zcGFjZSk7XG4gIGNvbG9yOiB2YXIoLS15ZWxsb3cpO1xufVxuXG4uZmlsZS1saW5rIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG4gIGN1cnNvcjogcG9pbnRlcjtcbn1cblxua2JkIHtcbiAgbGluZS1oZWlnaHQ6IDEuNTtcbiAgZm9udC1mYW1pbHk6IHVpLW1vbm9zcGFjZSwgTWVubG8sIE1vbmFjbywgQ29uc29sYXMsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiQ291cmllciBOZXdcIiwgbW9ub3NwYWNlO1xuICBmb250LXNpemU6IDAuNzVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGJhY2tncm91bmQtY29sb3I6IHJnYigzOCwgNDAsIDQ0KTtcbiAgY29sb3I6IHJnYigxNjYsIDE2NywgMTcxKTtcbiAgcGFkZGluZzogMC4xNXJlbSAwLjNyZW07XG4gIGJvcmRlci1yYWRpdXM6IDAuMjVyZW07XG4gIGJvcmRlci13aWR0aDogMC4wNjI1cmVtIDAuMDYyNXJlbSAwLjE4NzVyZW07XG4gIGJvcmRlci1zdHlsZTogc29saWQ7XG4gIGJvcmRlci1jb2xvcjogcmdiKDU0LCA1NywgNjQpO1xuICBib3JkZXItaW1hZ2U6IGluaXRpYWw7XG59XG48L3N0eWxlPlxuPGRpdiBjbGFzcz1cImJhY2tkcm9wXCIgcGFydD1cImJhY2tkcm9wXCI+XG4gIDxkaXYgY2xhc3M9XCJ3aW5kb3dcIiBwYXJ0PVwid2luZG93XCI+XG4gICAgPHByZSBjbGFzcz1cIm1lc3NhZ2VcIiBwYXJ0PVwibWVzc2FnZVwiPjxzcGFuIGNsYXNzPVwicGx1Z2luXCIgcGFydD1cInBsdWdpblwiPjwvc3Bhbj48c3BhbiBjbGFzcz1cIm1lc3NhZ2UtYm9keVwiIHBhcnQ9XCJtZXNzYWdlLWJvZHlcIj48L3NwYW4+PC9wcmU+XG4gICAgPHByZSBjbGFzcz1cImZpbGVcIiBwYXJ0PVwiZmlsZVwiPjwvcHJlPlxuICAgIDxwcmUgY2xhc3M9XCJmcmFtZVwiIHBhcnQ9XCJmcmFtZVwiPjwvcHJlPlxuICAgIDxwcmUgY2xhc3M9XCJzdGFja1wiIHBhcnQ9XCJzdGFja1wiPjwvcHJlPlxuICAgIDxkaXYgY2xhc3M9XCJ0aXBcIiBwYXJ0PVwidGlwXCI+XG4gICAgICBDbGljayBvdXRzaWRlLCBwcmVzcyA8a2JkPkVzYzwva2JkPiBrZXksIG9yIGZpeCB0aGUgY29kZSB0byBkaXNtaXNzLjxicj5cbiAgICAgIFlvdSBjYW4gYWxzbyBkaXNhYmxlIHRoaXMgb3ZlcmxheSBieSBzZXR0aW5nXG4gICAgICA8Y29kZSBwYXJ0PVwiY29uZmlnLW9wdGlvbi1uYW1lXCI+c2VydmVyLmhtci5vdmVybGF5PC9jb2RlPiB0byA8Y29kZSBwYXJ0PVwiY29uZmlnLW9wdGlvbi12YWx1ZVwiPmZhbHNlPC9jb2RlPiBpbiA8Y29kZSBwYXJ0PVwiY29uZmlnLWZpbGUtbmFtZVwiPiR7aG1yQ29uZmlnTmFtZX0uPC9jb2RlPlxuICAgIDwvZGl2PlxuICA8L2Rpdj5cbjwvZGl2PlxuYFxuXG5jb25zdCBmaWxlUkUgPSAvKD86W2EtekEtWl06XFxcXHxcXC8pLio/OlxcZCs6XFxkKy9nXG5jb25zdCBjb2RlZnJhbWVSRSA9IC9eKD86Pj9cXHMqXFxkK1xccytcXHwuKnxcXHMrXFx8XFxzKlxcXi4qKVxccj9cXG4vZ21cblxuLy8gQWxsb3cgYEVycm9yT3ZlcmxheWAgdG8gZXh0ZW5kIGBIVE1MRWxlbWVudGAgZXZlbiBpbiBlbnZpcm9ubWVudHMgd2hlcmVcbi8vIGBIVE1MRWxlbWVudGAgd2FzIG5vdCBvcmlnaW5hbGx5IGRlZmluZWQuXG5jb25zdCB7IEhUTUxFbGVtZW50ID0gY2xhc3Mge30gYXMgdHlwZW9mIGdsb2JhbFRoaXMuSFRNTEVsZW1lbnQgfSA9IGdsb2JhbFRoaXNcbmV4cG9ydCBjbGFzcyBFcnJvck92ZXJsYXkgZXh0ZW5kcyBIVE1MRWxlbWVudCB7XG4gIHJvb3Q6IFNoYWRvd1Jvb3RcbiAgY2xvc2VPbkVzYzogKGU6IEtleWJvYXJkRXZlbnQpID0+IHZvaWRcblxuICBjb25zdHJ1Y3RvcihlcnI6IEVycm9yUGF5bG9hZFsnZXJyJ10sIGxpbmtzID0gdHJ1ZSkge1xuICAgIHN1cGVyKClcbiAgICB0aGlzLnJvb3QgPSB0aGlzLmF0dGFjaFNoYWRvdyh7IG1vZGU6ICdvcGVuJyB9KVxuICAgIHRoaXMucm9vdC5pbm5lckhUTUwgPSB0ZW1wbGF0ZVxuXG4gICAgY29kZWZyYW1lUkUubGFzdEluZGV4ID0gMFxuICAgIGNvbnN0IGhhc0ZyYW1lID0gZXJyLmZyYW1lICYmIGNvZGVmcmFtZVJFLnRlc3QoZXJyLmZyYW1lKVxuICAgIGNvbnN0IG1lc3NhZ2UgPSBoYXNGcmFtZVxuICAgICAgPyBlcnIubWVzc2FnZS5yZXBsYWNlKGNvZGVmcmFtZVJFLCAnJylcbiAgICAgIDogZXJyLm1lc3NhZ2VcbiAgICBpZiAoZXJyLnBsdWdpbikge1xuICAgICAgdGhpcy50ZXh0KCcucGx1Z2luJywgYFtwbHVnaW46JHtlcnIucGx1Z2lufV0gYClcbiAgICB9XG4gICAgdGhpcy50ZXh0KCcubWVzc2FnZS1ib2R5JywgbWVzc2FnZS50cmltKCkpXG5cbiAgICBjb25zdCBbZmlsZV0gPSAoZXJyLmxvYz8uZmlsZSB8fCBlcnIuaWQgfHwgJ3Vua25vd24gZmlsZScpLnNwbGl0KGA/YClcbiAgICBpZiAoZXJyLmxvYykge1xuICAgICAgdGhpcy50ZXh0KCcuZmlsZScsIGAke2ZpbGV9OiR7ZXJyLmxvYy5saW5lfToke2Vyci5sb2MuY29sdW1ufWAsIGxpbmtzKVxuICAgIH0gZWxzZSBpZiAoZXJyLmlkKSB7XG4gICAgICB0aGlzLnRleHQoJy5maWxlJywgZmlsZSlcbiAgICB9XG5cbiAgICBpZiAoaGFzRnJhbWUpIHtcbiAgICAgIHRoaXMudGV4dCgnLmZyYW1lJywgZXJyLmZyYW1lIS50cmltKCkpXG4gICAgfVxuICAgIHRoaXMudGV4dCgnLnN0YWNrJywgZXJyLnN0YWNrLCBsaW5rcylcblxuICAgIHRoaXMucm9vdC5xdWVyeVNlbGVjdG9yKCcud2luZG93JykhLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICB9KVxuXG4gICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIHRoaXMuY2xvc2UoKVxuICAgIH0pXG5cbiAgICB0aGlzLmNsb3NlT25Fc2MgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJyB8fCBlLmNvZGUgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgIHRoaXMuY2xvc2UoKVxuICAgICAgfVxuICAgIH1cblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmNsb3NlT25Fc2MpXG4gIH1cblxuICB0ZXh0KHNlbGVjdG9yOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgbGlua0ZpbGVzID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjb25zdCBlbCA9IHRoaXMucm9vdC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKSFcbiAgICBpZiAoIWxpbmtGaWxlcykge1xuICAgICAgZWwudGV4dENvbnRlbnQgPSB0ZXh0XG4gICAgfSBlbHNlIHtcbiAgICAgIGxldCBjdXJJbmRleCA9IDBcbiAgICAgIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbFxuICAgICAgZmlsZVJFLmxhc3RJbmRleCA9IDBcbiAgICAgIHdoaWxlICgobWF0Y2ggPSBmaWxlUkUuZXhlYyh0ZXh0KSkpIHtcbiAgICAgICAgY29uc3QgeyAwOiBmaWxlLCBpbmRleCB9ID0gbWF0Y2hcbiAgICAgICAgaWYgKGluZGV4ICE9IG51bGwpIHtcbiAgICAgICAgICBjb25zdCBmcmFnID0gdGV4dC5zbGljZShjdXJJbmRleCwgaW5kZXgpXG4gICAgICAgICAgZWwuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoZnJhZykpXG4gICAgICAgICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKVxuICAgICAgICAgIGxpbmsudGV4dENvbnRlbnQgPSBmaWxlXG4gICAgICAgICAgbGluay5jbGFzc05hbWUgPSAnZmlsZS1saW5rJ1xuICAgICAgICAgIGxpbmsub25jbGljayA9ICgpID0+IHtcbiAgICAgICAgICAgIGZldGNoKFxuICAgICAgICAgICAgICBuZXcgVVJMKFxuICAgICAgICAgICAgICAgIGAke2Jhc2V9X19vcGVuLWluLWVkaXRvcj9maWxlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGZpbGUpfWAsXG4gICAgICAgICAgICAgICAgaW1wb3J0Lm1ldGEudXJsLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgKVxuICAgICAgICAgIH1cbiAgICAgICAgICBlbC5hcHBlbmRDaGlsZChsaW5rKVxuICAgICAgICAgIGN1ckluZGV4ICs9IGZyYWcubGVuZ3RoICsgZmlsZS5sZW5ndGhcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBjbG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLnBhcmVudE5vZGU/LnJlbW92ZUNoaWxkKHRoaXMpXG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuY2xvc2VPbkVzYylcbiAgfVxufVxuXG5leHBvcnQgY29uc3Qgb3ZlcmxheUlkID0gJ3ZpdGUtZXJyb3Itb3ZlcmxheSdcbmNvbnN0IHsgY3VzdG9tRWxlbWVudHMgfSA9IGdsb2JhbFRoaXMgLy8gRW5zdXJlIGBjdXN0b21FbGVtZW50c2AgaXMgZGVmaW5lZCBiZWZvcmUgdGhlIG5leHQgbGluZS5cbmlmIChjdXN0b21FbGVtZW50cyAmJiAhY3VzdG9tRWxlbWVudHMuZ2V0KG92ZXJsYXlJZCkpIHtcbiAgY3VzdG9tRWxlbWVudHMuZGVmaW5lKG92ZXJsYXlJZCwgRXJyb3JPdmVybGF5KVxufVxuIiwiaW1wb3J0IHR5cGUgeyBFcnJvclBheWxvYWQsIEhNUlBheWxvYWQgfSBmcm9tICd0eXBlcy9obXJQYXlsb2FkJ1xuaW1wb3J0IHR5cGUgeyBWaXRlSG90Q29udGV4dCB9IGZyb20gJ3R5cGVzL2hvdCdcbmltcG9ydCB0eXBlIHsgSW5mZXJDdXN0b21FdmVudFBheWxvYWQgfSBmcm9tICd0eXBlcy9jdXN0b21FdmVudCdcbmltcG9ydCB7IEhNUkNsaWVudCwgSE1SQ29udGV4dCB9IGZyb20gJy4uL3NoYXJlZC9obXInXG5pbXBvcnQgeyBFcnJvck92ZXJsYXksIG92ZXJsYXlJZCB9IGZyb20gJy4vb3ZlcmxheSdcbmltcG9ydCAnQHZpdGUvZW52J1xuXG4vLyBpbmplY3RlZCBieSB0aGUgaG1yIHBsdWdpbiB3aGVuIHNlcnZlZFxuZGVjbGFyZSBjb25zdCBfX0JBU0VfXzogc3RyaW5nXG5kZWNsYXJlIGNvbnN0IF9fU0VSVkVSX0hPU1RfXzogc3RyaW5nXG5kZWNsYXJlIGNvbnN0IF9fSE1SX1BST1RPQ09MX186IHN0cmluZyB8IG51bGxcbmRlY2xhcmUgY29uc3QgX19ITVJfSE9TVE5BTUVfXzogc3RyaW5nIHwgbnVsbFxuZGVjbGFyZSBjb25zdCBfX0hNUl9QT1JUX186IG51bWJlciB8IG51bGxcbmRlY2xhcmUgY29uc3QgX19ITVJfRElSRUNUX1RBUkdFVF9fOiBzdHJpbmdcbmRlY2xhcmUgY29uc3QgX19ITVJfQkFTRV9fOiBzdHJpbmdcbmRlY2xhcmUgY29uc3QgX19ITVJfVElNRU9VVF9fOiBudW1iZXJcbmRlY2xhcmUgY29uc3QgX19ITVJfRU5BQkxFX09WRVJMQVlfXzogYm9vbGVhblxuXG5jb25zb2xlLmRlYnVnKCdbdml0ZV0gY29ubmVjdGluZy4uLicpXG5cbmNvbnN0IGltcG9ydE1ldGFVcmwgPSBuZXcgVVJMKGltcG9ydC5tZXRhLnVybClcblxuLy8gdXNlIHNlcnZlciBjb25maWd1cmF0aW9uLCB0aGVuIGZhbGxiYWNrIHRvIGluZmVyZW5jZVxuY29uc3Qgc2VydmVySG9zdCA9IF9fU0VSVkVSX0hPU1RfX1xuY29uc3Qgc29ja2V0UHJvdG9jb2wgPVxuICBfX0hNUl9QUk9UT0NPTF9fIHx8IChpbXBvcnRNZXRhVXJsLnByb3RvY29sID09PSAnaHR0cHM6JyA/ICd3c3MnIDogJ3dzJylcbmNvbnN0IGhtclBvcnQgPSBfX0hNUl9QT1JUX19cbmNvbnN0IHNvY2tldEhvc3QgPSBgJHtfX0hNUl9IT1NUTkFNRV9fIHx8IGltcG9ydE1ldGFVcmwuaG9zdG5hbWV9OiR7XG4gIGhtclBvcnQgfHwgaW1wb3J0TWV0YVVybC5wb3J0XG59JHtfX0hNUl9CQVNFX199YFxuY29uc3QgZGlyZWN0U29ja2V0SG9zdCA9IF9fSE1SX0RJUkVDVF9UQVJHRVRfX1xuY29uc3QgYmFzZSA9IF9fQkFTRV9fIHx8ICcvJ1xuXG5sZXQgc29ja2V0OiBXZWJTb2NrZXRcbnRyeSB7XG4gIGxldCBmYWxsYmFjazogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkXG4gIC8vIG9ubHkgdXNlIGZhbGxiYWNrIHdoZW4gcG9ydCBpcyBpbmZlcnJlZCB0byBwcmV2ZW50IGNvbmZ1c2lvblxuICBpZiAoIWhtclBvcnQpIHtcbiAgICBmYWxsYmFjayA9ICgpID0+IHtcbiAgICAgIC8vIGZhbGxiYWNrIHRvIGNvbm5lY3RpbmcgZGlyZWN0bHkgdG8gdGhlIGhtciBzZXJ2ZXJcbiAgICAgIC8vIGZvciBzZXJ2ZXJzIHdoaWNoIGRvZXMgbm90IHN1cHBvcnQgcHJveHlpbmcgd2Vic29ja2V0XG4gICAgICBzb2NrZXQgPSBzZXR1cFdlYlNvY2tldChzb2NrZXRQcm90b2NvbCwgZGlyZWN0U29ja2V0SG9zdCwgKCkgPT4ge1xuICAgICAgICBjb25zdCBjdXJyZW50U2NyaXB0SG9zdFVSTCA9IG5ldyBVUkwoaW1wb3J0Lm1ldGEudXJsKVxuICAgICAgICBjb25zdCBjdXJyZW50U2NyaXB0SG9zdCA9XG4gICAgICAgICAgY3VycmVudFNjcmlwdEhvc3RVUkwuaG9zdCArXG4gICAgICAgICAgY3VycmVudFNjcmlwdEhvc3RVUkwucGF0aG5hbWUucmVwbGFjZSgvQHZpdGVcXC9jbGllbnQkLywgJycpXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgJ1t2aXRlXSBmYWlsZWQgdG8gY29ubmVjdCB0byB3ZWJzb2NrZXQuXFxuJyArXG4gICAgICAgICAgICAneW91ciBjdXJyZW50IHNldHVwOlxcbicgK1xuICAgICAgICAgICAgYCAgKGJyb3dzZXIpICR7Y3VycmVudFNjcmlwdEhvc3R9IDwtLVtIVFRQXS0tPiAke3NlcnZlckhvc3R9IChzZXJ2ZXIpXFxuYCArXG4gICAgICAgICAgICBgICAoYnJvd3NlcikgJHtzb2NrZXRIb3N0fSA8LS1bV2ViU29ja2V0IChmYWlsaW5nKV0tLT4gJHtkaXJlY3RTb2NrZXRIb3N0fSAoc2VydmVyKVxcbmAgK1xuICAgICAgICAgICAgJ0NoZWNrIG91dCB5b3VyIFZpdGUgLyBuZXR3b3JrIGNvbmZpZ3VyYXRpb24gYW5kIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvc2VydmVyLW9wdGlvbnMuaHRtbCNzZXJ2ZXItaG1yIC4nLFxuICAgICAgICApXG4gICAgICB9KVxuICAgICAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdvcGVuJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUuaW5mbyhcbiAgICAgICAgICAgICdbdml0ZV0gRGlyZWN0IHdlYnNvY2tldCBjb25uZWN0aW9uIGZhbGxiYWNrLiBDaGVjayBvdXQgaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9zZXJ2ZXItb3B0aW9ucy5odG1sI3NlcnZlci1obXIgdG8gcmVtb3ZlIHRoZSBwcmV2aW91cyBjb25uZWN0aW9uIGVycm9yLicsXG4gICAgICAgICAgKVxuICAgICAgICB9LFxuICAgICAgICB7IG9uY2U6IHRydWUgfSxcbiAgICAgIClcbiAgICB9XG4gIH1cblxuICBzb2NrZXQgPSBzZXR1cFdlYlNvY2tldChzb2NrZXRQcm90b2NvbCwgc29ja2V0SG9zdCwgZmFsbGJhY2spXG59IGNhdGNoIChlcnJvcikge1xuICBjb25zb2xlLmVycm9yKGBbdml0ZV0gZmFpbGVkIHRvIGNvbm5lY3QgdG8gd2Vic29ja2V0ICgke2Vycm9yfSkuIGApXG59XG5cbmZ1bmN0aW9uIHNldHVwV2ViU29ja2V0KFxuICBwcm90b2NvbDogc3RyaW5nLFxuICBob3N0QW5kUGF0aDogc3RyaW5nLFxuICBvbkNsb3NlV2l0aG91dE9wZW4/OiAoKSA9PiB2b2lkLFxuKSB7XG4gIGNvbnN0IHNvY2tldCA9IG5ldyBXZWJTb2NrZXQoYCR7cHJvdG9jb2x9Oi8vJHtob3N0QW5kUGF0aH1gLCAndml0ZS1obXInKVxuICBsZXQgaXNPcGVuZWQgPSBmYWxzZVxuXG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKFxuICAgICdvcGVuJyxcbiAgICAoKSA9PiB7XG4gICAgICBpc09wZW5lZCA9IHRydWVcbiAgICAgIG5vdGlmeUxpc3RlbmVycygndml0ZTp3czpjb25uZWN0JywgeyB3ZWJTb2NrZXQ6IHNvY2tldCB9KVxuICAgIH0sXG4gICAgeyBvbmNlOiB0cnVlIH0sXG4gIClcblxuICAvLyBMaXN0ZW4gZm9yIG1lc3NhZ2VzXG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgYXN5bmMgKHsgZGF0YSB9KSA9PiB7XG4gICAgaGFuZGxlTWVzc2FnZShKU09OLnBhcnNlKGRhdGEpKVxuICB9KVxuXG4gIC8vIHBpbmcgc2VydmVyXG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdjbG9zZScsIGFzeW5jICh7IHdhc0NsZWFuIH0pID0+IHtcbiAgICBpZiAod2FzQ2xlYW4pIHJldHVyblxuXG4gICAgaWYgKCFpc09wZW5lZCAmJiBvbkNsb3NlV2l0aG91dE9wZW4pIHtcbiAgICAgIG9uQ2xvc2VXaXRob3V0T3BlbigpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBub3RpZnlMaXN0ZW5lcnMoJ3ZpdGU6d3M6ZGlzY29ubmVjdCcsIHsgd2ViU29ja2V0OiBzb2NrZXQgfSlcblxuICAgIGNvbnNvbGUubG9nKGBbdml0ZV0gc2VydmVyIGNvbm5lY3Rpb24gbG9zdC4gcG9sbGluZyBmb3IgcmVzdGFydC4uLmApXG4gICAgYXdhaXQgd2FpdEZvclN1Y2Nlc3NmdWxQaW5nKHByb3RvY29sLCBob3N0QW5kUGF0aClcbiAgICBsb2NhdGlvbi5yZWxvYWQoKVxuICB9KVxuXG4gIHJldHVybiBzb2NrZXRcbn1cblxuZnVuY3Rpb24gY2xlYW5VcmwocGF0aG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwocGF0aG5hbWUsIGxvY2F0aW9uLnRvU3RyaW5nKCkpXG4gIHVybC5zZWFyY2hQYXJhbXMuZGVsZXRlKCdkaXJlY3QnKVxuICByZXR1cm4gdXJsLnBhdGhuYW1lICsgdXJsLnNlYXJjaFxufVxuXG5sZXQgaXNGaXJzdFVwZGF0ZSA9IHRydWVcbmNvbnN0IG91dGRhdGVkTGlua1RhZ3MgPSBuZXcgV2Vha1NldDxIVE1MTGlua0VsZW1lbnQ+KClcblxuY29uc3QgZGVib3VuY2VSZWxvYWQgPSAodGltZTogbnVtYmVyKSA9PiB7XG4gIGxldCB0aW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsXG4gIHJldHVybiAoKSA9PiB7XG4gICAgaWYgKHRpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZXIpXG4gICAgICB0aW1lciA9IG51bGxcbiAgICB9XG4gICAgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGxvY2F0aW9uLnJlbG9hZCgpXG4gICAgfSwgdGltZSlcbiAgfVxufVxuY29uc3QgcGFnZVJlbG9hZCA9IGRlYm91bmNlUmVsb2FkKDUwKVxuXG5jb25zdCBobXJDbGllbnQgPSBuZXcgSE1SQ2xpZW50KFxuICBjb25zb2xlLFxuICB7XG4gICAgaXNSZWFkeTogKCkgPT4gc29ja2V0ICYmIHNvY2tldC5yZWFkeVN0YXRlID09PSAxLFxuICAgIHNlbmQ6IChtZXNzYWdlKSA9PiBzb2NrZXQuc2VuZChtZXNzYWdlKSxcbiAgfSxcbiAgYXN5bmMgZnVuY3Rpb24gaW1wb3J0VXBkYXRlZE1vZHVsZSh7XG4gICAgYWNjZXB0ZWRQYXRoLFxuICAgIHRpbWVzdGFtcCxcbiAgICBleHBsaWNpdEltcG9ydFJlcXVpcmVkLFxuICAgIGlzV2l0aGluQ2lyY3VsYXJJbXBvcnQsXG4gIH0pIHtcbiAgICBjb25zdCBbYWNjZXB0ZWRQYXRoV2l0aG91dFF1ZXJ5LCBxdWVyeV0gPSBhY2NlcHRlZFBhdGguc3BsaXQoYD9gKVxuICAgIGNvbnN0IGltcG9ydFByb21pc2UgPSBpbXBvcnQoXG4gICAgICAvKiBAdml0ZS1pZ25vcmUgKi9cbiAgICAgIGJhc2UgK1xuICAgICAgICBhY2NlcHRlZFBhdGhXaXRob3V0UXVlcnkuc2xpY2UoMSkgK1xuICAgICAgICBgPyR7ZXhwbGljaXRJbXBvcnRSZXF1aXJlZCA/ICdpbXBvcnQmJyA6ICcnfXQ9JHt0aW1lc3RhbXB9JHtcbiAgICAgICAgICBxdWVyeSA/IGAmJHtxdWVyeX1gIDogJydcbiAgICAgICAgfWBcbiAgICApXG4gICAgaWYgKGlzV2l0aGluQ2lyY3VsYXJJbXBvcnQpIHtcbiAgICAgIGltcG9ydFByb21pc2UuY2F0Y2goKCkgPT4ge1xuICAgICAgICBjb25zb2xlLmluZm8oXG4gICAgICAgICAgYFtobXJdICR7YWNjZXB0ZWRQYXRofSBmYWlsZWQgdG8gYXBwbHkgSE1SIGFzIGl0J3Mgd2l0aGluIGEgY2lyY3VsYXIgaW1wb3J0LiBSZWxvYWRpbmcgcGFnZSB0byByZXNldCB0aGUgZXhlY3V0aW9uIG9yZGVyLiBgICtcbiAgICAgICAgICAgIGBUbyBkZWJ1ZyBhbmQgYnJlYWsgdGhlIGNpcmN1bGFyIGltcG9ydCwgeW91IGNhbiBydW4gXFxgdml0ZSAtLWRlYnVnIGhtclxcYCB0byBsb2cgdGhlIGNpcmN1bGFyIGRlcGVuZGVuY3kgcGF0aCBpZiBhIGZpbGUgY2hhbmdlIHRyaWdnZXJlZCBpdC5gLFxuICAgICAgICApXG4gICAgICAgIHBhZ2VSZWxvYWQoKVxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IGltcG9ydFByb21pc2VcbiAgfSxcbilcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlTWVzc2FnZShwYXlsb2FkOiBITVJQYXlsb2FkKSB7XG4gIHN3aXRjaCAocGF5bG9hZC50eXBlKSB7XG4gICAgY2FzZSAnY29ubmVjdGVkJzpcbiAgICAgIGNvbnNvbGUuZGVidWcoYFt2aXRlXSBjb25uZWN0ZWQuYClcbiAgICAgIGhtckNsaWVudC5tZXNzZW5nZXIuZmx1c2goKVxuICAgICAgLy8gcHJveHkobmdpbngsIGRvY2tlcikgaG1yIHdzIG1heWJlIGNhdXNlZCB0aW1lb3V0LFxuICAgICAgLy8gc28gc2VuZCBwaW5nIHBhY2thZ2UgbGV0IHdzIGtlZXAgYWxpdmUuXG4gICAgICBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIGlmIChzb2NrZXQucmVhZHlTdGF0ZSA9PT0gc29ja2V0Lk9QRU4pIHtcbiAgICAgICAgICBzb2NrZXQuc2VuZCgne1widHlwZVwiOlwicGluZ1wifScpXG4gICAgICAgIH1cbiAgICAgIH0sIF9fSE1SX1RJTUVPVVRfXylcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXBkYXRlJzpcbiAgICAgIG5vdGlmeUxpc3RlbmVycygndml0ZTpiZWZvcmVVcGRhdGUnLCBwYXlsb2FkKVxuICAgICAgLy8gaWYgdGhpcyBpcyB0aGUgZmlyc3QgdXBkYXRlIGFuZCB0aGVyZSdzIGFscmVhZHkgYW4gZXJyb3Igb3ZlcmxheSwgaXRcbiAgICAgIC8vIG1lYW5zIHRoZSBwYWdlIG9wZW5lZCB3aXRoIGV4aXN0aW5nIHNlcnZlciBjb21waWxlIGVycm9yIGFuZCB0aGUgd2hvbGVcbiAgICAgIC8vIG1vZHVsZSBzY3JpcHQgZmFpbGVkIHRvIGxvYWQgKHNpbmNlIG9uZSBvZiB0aGUgbmVzdGVkIGltcG9ydHMgaXMgNTAwKS5cbiAgICAgIC8vIGluIHRoaXMgY2FzZSBhIG5vcm1hbCB1cGRhdGUgd29uJ3Qgd29yayBhbmQgYSBmdWxsIHJlbG9hZCBpcyBuZWVkZWQuXG4gICAgICBpZiAoaXNGaXJzdFVwZGF0ZSAmJiBoYXNFcnJvck92ZXJsYXkoKSkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKClcbiAgICAgICAgcmV0dXJuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjbGVhckVycm9yT3ZlcmxheSgpXG4gICAgICAgIGlzRmlyc3RVcGRhdGUgPSBmYWxzZVxuICAgICAgfVxuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIHBheWxvYWQudXBkYXRlcy5tYXAoYXN5bmMgKHVwZGF0ZSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgICAgICAgIGlmICh1cGRhdGUudHlwZSA9PT0gJ2pzLXVwZGF0ZScpIHtcbiAgICAgICAgICAgIHJldHVybiBobXJDbGllbnQucXVldWVVcGRhdGUodXBkYXRlKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIGNzcy11cGRhdGVcbiAgICAgICAgICAvLyB0aGlzIGlzIG9ubHkgc2VudCB3aGVuIGEgY3NzIGZpbGUgcmVmZXJlbmNlZCB3aXRoIDxsaW5rPiBpcyB1cGRhdGVkXG4gICAgICAgICAgY29uc3QgeyBwYXRoLCB0aW1lc3RhbXAgfSA9IHVwZGF0ZVxuICAgICAgICAgIGNvbnN0IHNlYXJjaFVybCA9IGNsZWFuVXJsKHBhdGgpXG4gICAgICAgICAgLy8gY2FuJ3QgdXNlIHF1ZXJ5U2VsZWN0b3Igd2l0aCBgW2hyZWYqPV1gIGhlcmUgc2luY2UgdGhlIGxpbmsgbWF5IGJlXG4gICAgICAgICAgLy8gdXNpbmcgcmVsYXRpdmUgcGF0aHMgc28gd2UgbmVlZCB0byB1c2UgbGluay5ocmVmIHRvIGdyYWIgdGhlIGZ1bGxcbiAgICAgICAgICAvLyBVUkwgZm9yIHRoZSBpbmNsdWRlIGNoZWNrLlxuICAgICAgICAgIGNvbnN0IGVsID0gQXJyYXkuZnJvbShcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTExpbmtFbGVtZW50PignbGluaycpLFxuICAgICAgICAgICkuZmluZChcbiAgICAgICAgICAgIChlKSA9PlxuICAgICAgICAgICAgICAhb3V0ZGF0ZWRMaW5rVGFncy5oYXMoZSkgJiYgY2xlYW5VcmwoZS5ocmVmKS5pbmNsdWRlcyhzZWFyY2hVcmwpLFxuICAgICAgICAgIClcblxuICAgICAgICAgIGlmICghZWwpIHtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IG5ld1BhdGggPSBgJHtiYXNlfSR7c2VhcmNoVXJsLnNsaWNlKDEpfSR7XG4gICAgICAgICAgICBzZWFyY2hVcmwuaW5jbHVkZXMoJz8nKSA/ICcmJyA6ICc/J1xuICAgICAgICAgIH10PSR7dGltZXN0YW1wfWBcblxuICAgICAgICAgIC8vIHJhdGhlciB0aGFuIHN3YXBwaW5nIHRoZSBocmVmIG9uIHRoZSBleGlzdGluZyB0YWcsIHdlIHdpbGxcbiAgICAgICAgICAvLyBjcmVhdGUgYSBuZXcgbGluayB0YWcuIE9uY2UgdGhlIG5ldyBzdHlsZXNoZWV0IGhhcyBsb2FkZWQgd2VcbiAgICAgICAgICAvLyB3aWxsIHJlbW92ZSB0aGUgZXhpc3RpbmcgbGluayB0YWcuIFRoaXMgcmVtb3ZlcyBhIEZsYXNoIE9mXG4gICAgICAgICAgLy8gVW5zdHlsZWQgQ29udGVudCB0aGF0IGNhbiBvY2N1ciB3aGVuIHN3YXBwaW5nIG91dCB0aGUgdGFnIGhyZWZcbiAgICAgICAgICAvLyBkaXJlY3RseSwgYXMgdGhlIG5ldyBzdHlsZXNoZWV0IGhhcyBub3QgeWV0IGJlZW4gbG9hZGVkLlxuICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV3TGlua1RhZyA9IGVsLmNsb25lTm9kZSgpIGFzIEhUTUxMaW5rRWxlbWVudFxuICAgICAgICAgICAgbmV3TGlua1RhZy5ocmVmID0gbmV3IFVSTChuZXdQYXRoLCBlbC5ocmVmKS5ocmVmXG4gICAgICAgICAgICBjb25zdCByZW1vdmVPbGRFbCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgZWwucmVtb3ZlKClcbiAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhgW3ZpdGVdIGNzcyBob3QgdXBkYXRlZDogJHtzZWFyY2hVcmx9YClcbiAgICAgICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuZXdMaW5rVGFnLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCByZW1vdmVPbGRFbClcbiAgICAgICAgICAgIG5ld0xpbmtUYWcuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCByZW1vdmVPbGRFbClcbiAgICAgICAgICAgIG91dGRhdGVkTGlua1RhZ3MuYWRkKGVsKVxuICAgICAgICAgICAgZWwuYWZ0ZXIobmV3TGlua1RhZylcbiAgICAgICAgICB9KVxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICAgIG5vdGlmeUxpc3RlbmVycygndml0ZTphZnRlclVwZGF0ZScsIHBheWxvYWQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2N1c3RvbSc6IHtcbiAgICAgIG5vdGlmeUxpc3RlbmVycyhwYXlsb2FkLmV2ZW50LCBwYXlsb2FkLmRhdGEpXG4gICAgICBicmVha1xuICAgIH1cbiAgICBjYXNlICdmdWxsLXJlbG9hZCc6XG4gICAgICBub3RpZnlMaXN0ZW5lcnMoJ3ZpdGU6YmVmb3JlRnVsbFJlbG9hZCcsIHBheWxvYWQpXG4gICAgICBpZiAocGF5bG9hZC5wYXRoICYmIHBheWxvYWQucGF0aC5lbmRzV2l0aCgnLmh0bWwnKSkge1xuICAgICAgICAvLyBpZiBodG1sIGZpbGUgaXMgZWRpdGVkLCBvbmx5IHJlbG9hZCB0aGUgcGFnZSBpZiB0aGUgYnJvd3NlciBpc1xuICAgICAgICAvLyBjdXJyZW50bHkgb24gdGhhdCBwYWdlLlxuICAgICAgICBjb25zdCBwYWdlUGF0aCA9IGRlY29kZVVSSShsb2NhdGlvbi5wYXRobmFtZSlcbiAgICAgICAgY29uc3QgcGF5bG9hZFBhdGggPSBiYXNlICsgcGF5bG9hZC5wYXRoLnNsaWNlKDEpXG4gICAgICAgIGlmIChcbiAgICAgICAgICBwYWdlUGF0aCA9PT0gcGF5bG9hZFBhdGggfHxcbiAgICAgICAgICBwYXlsb2FkLnBhdGggPT09ICcvaW5kZXguaHRtbCcgfHxcbiAgICAgICAgICAocGFnZVBhdGguZW5kc1dpdGgoJy8nKSAmJiBwYWdlUGF0aCArICdpbmRleC5odG1sJyA9PT0gcGF5bG9hZFBhdGgpXG4gICAgICAgICkge1xuICAgICAgICAgIHBhZ2VSZWxvYWQoKVxuICAgICAgICB9XG4gICAgICAgIHJldHVyblxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFnZVJlbG9hZCgpXG4gICAgICB9XG4gICAgICBicmVha1xuICAgIGNhc2UgJ3BydW5lJzpcbiAgICAgIG5vdGlmeUxpc3RlbmVycygndml0ZTpiZWZvcmVQcnVuZScsIHBheWxvYWQpXG4gICAgICBobXJDbGllbnQucHJ1bmVQYXRocyhwYXlsb2FkLnBhdGhzKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdlcnJvcic6IHtcbiAgICAgIG5vdGlmeUxpc3RlbmVycygndml0ZTplcnJvcicsIHBheWxvYWQpXG4gICAgICBjb25zdCBlcnIgPSBwYXlsb2FkLmVyclxuICAgICAgaWYgKGVuYWJsZU92ZXJsYXkpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPdmVybGF5KGVycilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgYFt2aXRlXSBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcXG4ke2Vyci5tZXNzYWdlfVxcbiR7ZXJyLnN0YWNrfWAsXG4gICAgICAgIClcbiAgICAgIH1cbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGRlZmF1bHQ6IHtcbiAgICAgIGNvbnN0IGNoZWNrOiBuZXZlciA9IHBheWxvYWRcbiAgICAgIHJldHVybiBjaGVja1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBub3RpZnlMaXN0ZW5lcnM8VCBleHRlbmRzIHN0cmluZz4oXG4gIGV2ZW50OiBULFxuICBkYXRhOiBJbmZlckN1c3RvbUV2ZW50UGF5bG9hZDxUPixcbik6IHZvaWRcbmZ1bmN0aW9uIG5vdGlmeUxpc3RlbmVycyhldmVudDogc3RyaW5nLCBkYXRhOiBhbnkpOiB2b2lkIHtcbiAgaG1yQ2xpZW50Lm5vdGlmeUxpc3RlbmVycyhldmVudCwgZGF0YSlcbn1cblxuY29uc3QgZW5hYmxlT3ZlcmxheSA9IF9fSE1SX0VOQUJMRV9PVkVSTEFZX19cblxuZnVuY3Rpb24gY3JlYXRlRXJyb3JPdmVybGF5KGVycjogRXJyb3JQYXlsb2FkWydlcnInXSkge1xuICBjbGVhckVycm9yT3ZlcmxheSgpXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobmV3IEVycm9yT3ZlcmxheShlcnIpKVxufVxuXG5mdW5jdGlvbiBjbGVhckVycm9yT3ZlcmxheSgpIHtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxFcnJvck92ZXJsYXk+KG92ZXJsYXlJZCkuZm9yRWFjaCgobikgPT4gbi5jbG9zZSgpKVxufVxuXG5mdW5jdGlvbiBoYXNFcnJvck92ZXJsYXkoKSB7XG4gIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKG92ZXJsYXlJZCkubGVuZ3RoXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JTdWNjZXNzZnVsUGluZyhcbiAgc29ja2V0UHJvdG9jb2w6IHN0cmluZyxcbiAgaG9zdEFuZFBhdGg6IHN0cmluZyxcbiAgbXMgPSAxMDAwLFxuKSB7XG4gIGNvbnN0IHBpbmdIb3N0UHJvdG9jb2wgPSBzb2NrZXRQcm90b2NvbCA9PT0gJ3dzcycgPyAnaHR0cHMnIDogJ2h0dHAnXG5cbiAgY29uc3QgcGluZyA9IGFzeW5jICgpID0+IHtcbiAgICAvLyBBIGZldGNoIG9uIGEgd2Vic29ja2V0IFVSTCB3aWxsIHJldHVybiBhIHN1Y2Nlc3NmdWwgcHJvbWlzZSB3aXRoIHN0YXR1cyA0MDAsXG4gICAgLy8gYnV0IHdpbGwgcmVqZWN0IGEgbmV0d29ya2luZyBlcnJvci5cbiAgICAvLyBXaGVuIHJ1bm5pbmcgb24gbWlkZGxld2FyZSBtb2RlLCBpdCByZXR1cm5zIHN0YXR1cyA0MjYsIGFuZCBhbiBjb3JzIGVycm9yIGhhcHBlbnMgaWYgbW9kZSBpcyBub3Qgbm8tY29yc1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmZXRjaChgJHtwaW5nSG9zdFByb3RvY29sfTovLyR7aG9zdEFuZFBhdGh9YCwge1xuICAgICAgICBtb2RlOiAnbm8tY29ycycsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAvLyBDdXN0b20gaGVhZGVycyB3b24ndCBiZSBpbmNsdWRlZCBpbiBhIHJlcXVlc3Qgd2l0aCBuby1jb3JzIHNvIChhYil1c2Ugb25lIG9mIHRoZVxuICAgICAgICAgIC8vIHNhZmVsaXN0ZWQgaGVhZGVycyB0byBpZGVudGlmeSB0aGUgcGluZyByZXF1ZXN0XG4gICAgICAgICAgQWNjZXB0OiAndGV4dC94LXZpdGUtcGluZycsXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9IGNhdGNoIHt9XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBpZiAoYXdhaXQgcGluZygpKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgYXdhaXQgd2FpdChtcylcblxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc3RhbnQtY29uZGl0aW9uXG4gIHdoaWxlICh0cnVlKSB7XG4gICAgaWYgKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gJ3Zpc2libGUnKSB7XG4gICAgICBpZiAoYXdhaXQgcGluZygpKSB7XG4gICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgICBhd2FpdCB3YWl0KG1zKVxuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCB3YWl0Rm9yV2luZG93U2hvdygpXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHdhaXQobXM6IG51bWJlcikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKVxufVxuXG5mdW5jdGlvbiB3YWl0Rm9yV2luZG93U2hvdygpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3Qgb25DaGFuZ2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAndmlzaWJsZScpIHtcbiAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCBvbkNoYW5nZSlcbiAgICAgIH1cbiAgICB9XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigndmlzaWJpbGl0eWNoYW5nZScsIG9uQ2hhbmdlKVxuICB9KVxufVxuXG5jb25zdCBzaGVldHNNYXAgPSBuZXcgTWFwPHN0cmluZywgSFRNTFN0eWxlRWxlbWVudD4oKVxuXG4vLyBjb2xsZWN0IGV4aXN0aW5nIHN0eWxlIGVsZW1lbnRzIHRoYXQgbWF5IGhhdmUgYmVlbiBpbnNlcnRlZCBkdXJpbmcgU1NSXG4vLyB0byBhdm9pZCBGT1VDIG9yIGR1cGxpY2F0ZSBzdHlsZXNcbmlmICgnZG9jdW1lbnQnIGluIGdsb2JhbFRoaXMpIHtcbiAgZG9jdW1lbnRcbiAgICAucXVlcnlTZWxlY3RvckFsbDxIVE1MU3R5bGVFbGVtZW50Pignc3R5bGVbZGF0YS12aXRlLWRldi1pZF0nKVxuICAgIC5mb3JFYWNoKChlbCkgPT4ge1xuICAgICAgc2hlZXRzTWFwLnNldChlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdml0ZS1kZXYtaWQnKSEsIGVsKVxuICAgIH0pXG59XG5cbi8vIGFsbCBjc3MgaW1wb3J0cyBzaG91bGQgYmUgaW5zZXJ0ZWQgYXQgdGhlIHNhbWUgcG9zaXRpb25cbi8vIGJlY2F1c2UgYWZ0ZXIgYnVpbGQgaXQgd2lsbCBiZSBhIHNpbmdsZSBjc3MgZmlsZVxubGV0IGxhc3RJbnNlcnRlZFN0eWxlOiBIVE1MU3R5bGVFbGVtZW50IHwgdW5kZWZpbmVkXG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVTdHlsZShpZDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgbGV0IHN0eWxlID0gc2hlZXRzTWFwLmdldChpZClcbiAgaWYgKCFzdHlsZSkge1xuICAgIHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKVxuICAgIHN0eWxlLnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0L2NzcycpXG4gICAgc3R5bGUuc2V0QXR0cmlidXRlKCdkYXRhLXZpdGUtZGV2LWlkJywgaWQpXG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBjb250ZW50XG5cbiAgICBpZiAoIWxhc3RJbnNlcnRlZFN0eWxlKSB7XG4gICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKVxuXG4gICAgICAvLyByZXNldCBsYXN0SW5zZXJ0ZWRTdHlsZSBhZnRlciBhc3luY1xuICAgICAgLy8gYmVjYXVzZSBkeW5hbWljYWxseSBpbXBvcnRlZCBjc3Mgd2lsbCBiZSBzcGxpdHRlZCBpbnRvIGEgZGlmZmVyZW50IGZpbGVcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBsYXN0SW5zZXJ0ZWRTdHlsZSA9IHVuZGVmaW5lZFxuICAgICAgfSwgMClcbiAgICB9IGVsc2Uge1xuICAgICAgbGFzdEluc2VydGVkU3R5bGUuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmVuZCcsIHN0eWxlKVxuICAgIH1cbiAgICBsYXN0SW5zZXJ0ZWRTdHlsZSA9IHN0eWxlXG4gIH0gZWxzZSB7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBjb250ZW50XG4gIH1cbiAgc2hlZXRzTWFwLnNldChpZCwgc3R5bGUpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVTdHlsZShpZDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHN0eWxlID0gc2hlZXRzTWFwLmdldChpZClcbiAgaWYgKHN0eWxlKSB7XG4gICAgZG9jdW1lbnQuaGVhZC5yZW1vdmVDaGlsZChzdHlsZSlcbiAgICBzaGVldHNNYXAuZGVsZXRlKGlkKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIb3RDb250ZXh0KG93bmVyUGF0aDogc3RyaW5nKTogVml0ZUhvdENvbnRleHQge1xuICByZXR1cm4gbmV3IEhNUkNvbnRleHQoaG1yQ2xpZW50LCBvd25lclBhdGgpXG59XG5cbi8qKlxuICogdXJscyBoZXJlIGFyZSBkeW5hbWljIGltcG9ydCgpIHVybHMgdGhhdCBjb3VsZG4ndCBiZSBzdGF0aWNhbGx5IGFuYWx5emVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbmplY3RRdWVyeSh1cmw6IHN0cmluZywgcXVlcnlUb0luamVjdDogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gc2tpcCB1cmxzIHRoYXQgd29uJ3QgYmUgaGFuZGxlZCBieSB2aXRlXG4gIGlmICh1cmxbMF0gIT09ICcuJyAmJiB1cmxbMF0gIT09ICcvJykge1xuICAgIHJldHVybiB1cmxcbiAgfVxuXG4gIC8vIGNhbid0IHVzZSBwYXRobmFtZSBmcm9tIFVSTCBzaW5jZSBpdCBtYXkgYmUgcmVsYXRpdmUgbGlrZSAuLi9cbiAgY29uc3QgcGF0aG5hbWUgPSB1cmwucmVwbGFjZSgvWz8jXS4qJC8sICcnKVxuICBjb25zdCB7IHNlYXJjaCwgaGFzaCB9ID0gbmV3IFVSTCh1cmwsICdodHRwOi8vdml0ZWpzLmRldicpXG5cbiAgcmV0dXJuIGAke3BhdGhuYW1lfT8ke3F1ZXJ5VG9JbmplY3R9JHtzZWFyY2ggPyBgJmAgKyBzZWFyY2guc2xpY2UoMSkgOiAnJ30ke1xuICAgIGhhc2ggfHwgJydcbiAgfWBcbn1cblxuZXhwb3J0IHsgRXJyb3JPdmVybGF5IH1cbiJdLCJuYW1lcyI6WyJiYXNlIl0sIm1hcHBpbmdzIjoiOztNQWlDYSxVQUFVLENBQUE7SUFHckIsV0FDVSxDQUFBLFNBQW9CLEVBQ3BCLFNBQWlCLEVBQUE7UUFEakIsSUFBUyxDQUFBLFNBQUEsR0FBVCxTQUFTLENBQVc7UUFDcEIsSUFBUyxDQUFBLFNBQUEsR0FBVCxT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