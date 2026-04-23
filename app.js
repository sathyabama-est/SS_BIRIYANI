/* =========================================================
   BillStation POS — app.js
   Main application logic: login, menu, cart, analytics,
   modals, toasts, keyboard shortcuts, dark mode.
   ========================================================= */

// ---- AUTH ----
// Obfuscated: btoa('060105') = "MDYwMTA1"
const ACCESS_HASH = 'MDYwMTA1';

function checkPassword(val) {
    return btoa(val) === ACCESS_HASH;
}

function handleLogin() {
    const val = document.getElementById('login-input').value.trim();
    if (checkPassword(val)) {
        sessionStorage.setItem('bs_auth', '1');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initApp();
    } else {
        const card = document.getElementById('login-card');
        const err = document.getElementById('login-error');
        err.textContent = 'Incorrect access code. Try again.';
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        document.getElementById('login-input').value = '';
        document.getElementById('login-input').focus();
    }
}

function doLogout() {
    sessionStorage.removeItem('bs_auth');
    location.reload();
}

// ---- BOOT ----
document.addEventListener('DOMContentLoaded', () => {
    // Apply stored theme before anything shows
    const theme = Storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeBtn(theme);

    // Check session
    if (sessionStorage.getItem('bs_auth') === '1') {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initApp();
    } else {
        // Focus password input
        setTimeout(() => document.getElementById('login-input').focus(), 50);
    }

    // Enter key on login
    document.getElementById('login-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleLogin();
    });
});

// ---- APP STATE ----
let cart = []; // [{ id, name, price, qty }]
let recentlyUsed = []; // item ids recently added
let undoStack = []; // for undo last action

// ---- INIT ----
function initApp() {
    renderMenu();
    renderCart();
    updateAnalytics();
    startClock();
    setupKeyboardShortcuts();
    showToast('Welcome back! 👋', 'info');
}

// ---- CLOCK ----
function startClock() {
    function tick() {
        const now = new Date();
        document.getElementById('live-time').textContent =
            now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('live-date').textContent =
            now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    tick();
    setInterval(tick, 1000);
}

// ---- THEME ----
function toggleDarkMode() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Storage.setTheme(next);
    updateThemeBtn(next);
}

function updateThemeBtn(theme) {
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
}

// ---- MENU RENDERING ----
let searchQuery = '';

function renderMenu(filter = '') {
    const items = Storage.getMenu();
    const grid = document.getElementById('menu-grid');
    const q = filter.toLowerCase();

    const filtered = q ?
        items.filter(i => i.name.toLowerCase().includes(q)) :
        items;

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1">
      <span>🔍</span><p>No items found</p></div>`;
        return;
    }

    grid.innerHTML = '';
    filtered.forEach((item, idx) => {
        const isRecent = recentlyUsed.includes(item.id);
        const div = document.createElement('div');
        div.className = 'menu-item-card' + (isRecent ? ' recently-used' : '');
        div.dataset.id = item.id;

        const shortcut = (idx < 9 && !q) ? `<span class="shortcut-badge">${idx + 1}</span>` : '';

        div.innerHTML = `
      ${shortcut}
      <div class="menu-item-actions">
        <button title="Edit" onclick="event.stopPropagation();openEditItemModal('${item.id}')">✎</button>
        <button title="Delete" onclick="event.stopPropagation();confirmDeleteItem('${item.id}')">✕</button>
      </div>
      <div class="menu-item-name">${escHtml(item.name)}</div>
      <div class="menu-item-price">₹${item.price.toFixed(2)}</div>
      <div class="menu-item-sold">${item.totalSold || 0} sold</div>
    `;

        div.addEventListener('click', () => addToCart(item));
        grid.appendChild(div);
    });
}

// ---- SEARCH (debounced) ----
let searchTimer = null;

function debounceSearch(val) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        searchQuery = val;
        renderMenu(val);
    }, 200);
}

// ---- CART ----
function addToCart(item) {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
    }

    // Mark recently used
    if (!recentlyUsed.includes(item.id)) recentlyUsed.push(item.id);
    if (recentlyUsed.length > 5) recentlyUsed.shift();

    playClick();
    renderCart();
    renderMenu(searchQuery);
    updateCartTotals();
    showToast(`${item.name} added`, 'success');
}

function changeQty(id, delta) {
    const idx = cart.findIndex(c => c.id === id);
    if (idx < 0) return;
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    renderCart();
    updateCartTotals();
}

function removeFromCart(id) {
    const idx = cart.findIndex(c => c.id === id);
    if (idx >= 0) {
        undoStack.push({ action: 'removeItem', item: {...cart[idx] } });
        cart.splice(idx, 1);
    }
    renderCart();
    updateCartTotals();
}

function clearCart() {
    if (cart.length === 0) return;
    undoStack.push({ action: 'clearCart', items: [...cart] });
    cart = [];
    renderCart();
    updateCartTotals();
    showToast('Cart cleared', 'info');
}

function renderCart() {
    const tbody = document.getElementById('cart-body');
    const empty = document.getElementById('cart-empty');
    const table = document.getElementById('cart-table');

    if (cart.length === 0) {
        tbody.innerHTML = '';
        table.style.display = 'none';
        empty.style.display = 'flex';
        document.getElementById('checkout-btn').disabled = true;
        return;
    }

    table.style.display = 'table';
    empty.style.display = 'none';
    document.getElementById('checkout-btn').disabled = false;

    tbody.innerHTML = '';
    cart.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${escHtml(item.name)}</td>
      <td>
        <div class="qty-controls">
          <button class="qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
        </div>
      </td>
      <td>₹${item.price.toFixed(2)}</td>
      <td>₹${(item.price * item.qty).toFixed(2)}</td>
      <td><button class="remove-btn" onclick="removeFromCart('${item.id}')">✕</button></td>
    `;
        tbody.appendChild(tr);
    });
    updateCartTotals();
}

function updateCartTotals() {
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    document.getElementById('subtotal').textContent = `₹${sub.toFixed(2)}`;
    document.getElementById('grand-total').textContent = `₹${sub.toFixed(2)}`;
}

// ---- CHECKOUT ----
function checkout() {
    if (cart.length === 0) return;

    // Save sales
    Storage.addSaleEntries(cart);

    // Increment sold counts
    cart.forEach(ci => Storage.incrementSold(ci.id, ci.qty));

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    showToast(`Bill generated! Total: ₹${total.toFixed(2)}`, 'success');

    undoStack.push({ action: 'checkout', items: [...cart] });
    cart = [];
    recentlyUsed = [];
    renderCart();
    renderMenu(searchQuery);
    updateAnalytics();
}

// ---- ANALYTICS ----
function updateAnalytics() {
    const today = Storage.getTodaysSales();

    const revenue = today.reduce((s, e) => s + e.total, 0);
    const itemsSold = today.reduce((s, e) => s + e.quantity, 0);

    // Count bills (group by datetime proximity — 1 second window = 1 bill)
    const billTimes = [...new Set(today.map(e =>
        Math.floor(new Date(e.datetime).getTime() / 2000)))];

    document.getElementById('stat-revenue').textContent = `₹${revenue.toFixed(0)}`;
    document.getElementById('stat-items-sold').textContent = itemsSold;
    document.getElementById('stat-bills').textContent = billTimes.length;

    // Top item
    const tally = {};
    today.forEach(e => { tally[e.item] = (tally[e.item] || 0) + e.quantity; });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('stat-top-item').textContent = top ?
        `${top[0]} (${top[1]})` :
        '—';

    // Sales log list (last 20)
    const listEl = document.getElementById('sales-log-list');
    const last20 = [...today].reverse().slice(0, 20);
    if (last20.length === 0) {
        listEl.innerHTML = `<p class="no-data">No sales today</p>`;
        return;
    }
    listEl.innerHTML = '';
    last20.forEach(e => {
        const time = new Date(e.datetime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const div = document.createElement('div');
        div.className = 'sale-log-item';
        div.innerHTML = `
      <div>
        <div class="sale-name">${escHtml(e.item)}</div>
        <div class="sale-meta">×${e.quantity} · ${time}</div>
      </div>
      <div class="sale-amount">₹${e.total.toFixed(2)}</div>
    `;
        listEl.appendChild(div);
    });
}

// ---- ITEM MODAL ----
function openAddItemModal() {
    document.getElementById('item-modal-title').textContent = 'Add Item';
    document.getElementById('item-name-input').value = '';
    document.getElementById('item-price-input').value = '';
    document.getElementById('item-edit-id').value = '';
    document.getElementById('item-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('item-name-input').focus(), 50);
}

function openEditItemModal(id) {
    const item = Storage.getMenu().find(i => i.id === id);
    if (!item) return;
    document.getElementById('item-modal-title').textContent = 'Edit Item';
    document.getElementById('item-name-input').value = item.name;
    document.getElementById('item-price-input').value = item.price;
    document.getElementById('item-edit-id').value = id;
    document.getElementById('item-modal').classList.remove('hidden');
}

function closeItemModal() {
    document.getElementById('item-modal').classList.add('hidden');
}

function closeItemModalOutside(e) {
    if (e.target === document.getElementById('item-modal')) closeItemModal();
}

function saveItem() {
    const name = document.getElementById('item-name-input').value.trim();
    const price = parseFloat(document.getElementById('item-price-input').value);
    const editId = document.getElementById('item-edit-id').value;

    if (!name) { showToast('Please enter item name', 'error'); return; }
    if (isNaN(price) || price < 0) { showToast('Please enter valid price', 'error'); return; }

    if (editId) {
        Storage.updateMenuItem(editId, name, price);
        showToast('Item updated', 'success');
    } else {
        Storage.addMenuItem(name, price);
        showToast('Item added', 'success');
    }

    closeItemModal();
    renderMenu(searchQuery);
}

// Enter key in modal
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('item-price-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') saveItem();
    });
    document.getElementById('item-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('item-price-input').focus();
    });
});

// ---- DELETE ITEM ----
function confirmDeleteItem(id) {
    const item = Storage.getMenu().find(i => i.id === id);
    if (!item) return;
    showConfirm(
        'Delete Item',
        `Delete "${item.name}"? This cannot be undone.`,
        () => {
            Storage.deleteMenuItem(id);
            renderMenu(searchQuery);
            showToast('Item deleted', 'info');
        }
    );
}

// ---- RESET MODAL ----
function showResetModal() {
    document.getElementById('reset-password-input').value = '';
    document.getElementById('reset-error').textContent = '';
    document.getElementById('reset-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('reset-password-input').focus(), 50);
}

function closeResetModal() {
    document.getElementById('reset-modal').classList.add('hidden');
}

function closeResetModalOutside(e) {
    if (e.target === document.getElementById('reset-modal')) closeResetModal();
}

function doReset(type) {
    const pw = document.getElementById('reset-password-input').value.trim();
    if (!checkPassword(pw)) {
        document.getElementById('reset-error').textContent = 'Incorrect access code.';
        return;
    }

    const labels = { today: 'Clear Today\'s Data', sales: 'Clear All Sales', full: 'Full Reset' };
    const descs = {
        today: 'This will remove all of today\'s sales data.',
        sales: 'This will remove ALL sales history.',
        full: 'This will delete ALL data including menu items and reset to defaults.',
    };

    closeResetModal();
    showConfirm(labels[type], descs[type], () => {
        if (type === 'today') {
            Storage.clearTodaySales();
            showToast('Today\'s data cleared', 'info');
        } else if (type === 'sales') {
            Storage.clearAllSales();
            showToast('All sales cleared', 'info');
        } else if (type === 'full') {
            Storage.fullReset();
            cart = [];
            showToast('Full reset done. Reloading...', 'info');
            setTimeout(() => location.reload(), 1200);
        }
        renderMenu(searchQuery);
        renderCart();
        updateAnalytics();
    });
}

// ---- CONFIRM MODAL ----
let confirmCallback = null;

function showConfirm(title, message, cb) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = cb;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    confirmCallback = null;
}

document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
});

// ---- TOAST ----
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '✓', error: '✕', info: '•' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type]}</span> ${escHtml(message)}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.25s ease forwards';
        setTimeout(() => toast.remove(), 250);
    }, 2500);
}

// ---- KEYBOARD SHORTCUTS ----
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        // Ignore when typing in inputs
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
            const items = Storage.getMenu();
            if (items[num - 1]) addToCart(items[num - 1]);
            return;
        }

        if (e.key === 'Escape') {
            closeItemModal();
            closeResetModal();
            closeConfirmModal();
        }

        if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            undoLastAction();
        }
    });
}

// ---- UNDO ----
function undoLastAction() {
    if (undoStack.length === 0) { showToast('Nothing to undo', 'info'); return; }
    const last = undoStack.pop();
    if (last.action === 'removeItem') {
        cart.push(last.item);
        renderCart();
        showToast('Undo: item restored', 'info');
    } else if (last.action === 'clearCart') {
        cart = last.items;
        renderCart();
        showToast('Undo: cart restored', 'info');
    } else {
        showToast('Cannot undo checkout', 'info');
    }
}

// ---- SOUND ----
function playClick() {
    try {
        const ctx = new(window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) { /* silently fail */ }
}

// ---- UTIL ----
function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}