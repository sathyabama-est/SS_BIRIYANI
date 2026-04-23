/* =========================================================
   BillStation POS — app.js
   Main application logic: login, menu, cart, analytics,
   modals, toasts, keyboard shortcuts, dark mode.
   ========================================================= */

// ---- AUTH ----
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
    const theme = Storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeBtn(theme);

    if (sessionStorage.getItem('bs_auth') === '1') {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initApp();
    } else {
        setTimeout(() => document.getElementById('login-input').focus(), 50);
    }

    document.getElementById('login-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleLogin();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.target.id === 'reset-password-input') {
            e.preventDefault();

            const btn = document.querySelector('#reset-modal .btn-warning');
            if (btn) {
                btn.click();
            }
        }
    });
    document.getElementById('confirm-ok-btn').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeConfirmModal();
    });

    document.getElementById('item-price-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') saveItem();
    });
    document.getElementById('item-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('item-price-input').focus();
    });
});

// ---- APP STATE ----
let cart = [];
let recentlyUsed = [];
let undoStack = [];

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

// ---- MENU RENDERING (no per-item edit/delete) ----
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
      <div class="menu-item-name">${escHtml(item.name)}</div>
      <div class="menu-item-price">₹${item.price.toFixed(2)}</div>
      <div class="menu-item-sold">${item.totalSold || 0} sold</div>
    `;

        div.addEventListener('click', () => addToCart(item));
        grid.appendChild(div);
    });
}

// ---- SEARCH ----
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
    document.getElementById('cash-received').value = '';
    document.getElementById('change-result').textContent = '';
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

    Storage.addSaleEntries(cart);
    cart.forEach(ci => Storage.incrementSold(ci.id, ci.qty));

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    showToast(`Bill generated! Total: ₹${total.toFixed(2)}`, 'success');

    undoStack.push({ action: 'checkout', items: [...cart] });
    cart = [];
    recentlyUsed = [];
    document.getElementById('cash-received').value = '';
    document.getElementById('change-result').textContent = '';
    renderCart();
    renderMenu(searchQuery);
    updateAnalytics();
}

// ---- BALANCE CALCULATOR ----
function calculateChange() {
    const cashInput = document.getElementById('cash-received');
    const cash = parseFloat(cashInput.value);
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const resultDiv = document.getElementById('change-result');

    if (isNaN(cash) || cash < 0) {
        resultDiv.textContent = 'Enter valid amount';
        resultDiv.style.color = 'var(--red)';
        return;
    }

    if (cash < total) {
        resultDiv.textContent = `Short by ₹${(total - cash).toFixed(2)}`;
        resultDiv.style.color = 'var(--red)';
    } else {
        const change = cash - total;
        resultDiv.textContent = change === 0 ? 'Exact amount' : `Change: ₹${change.toFixed(2)}`;
        resultDiv.style.color = 'var(--green)';
    }
}

// ---- ANALYTICS ----
function updateAnalytics() {
    const today = Storage.getTodaysSales();

    const revenue = today.reduce((s, e) => s + e.total, 0);
    const itemsSold = today.reduce((s, e) => s + e.quantity, 0);

    // Group into bills (within 2 seconds proximity)
    const sorted = [...today].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const bills = [];
    let currentBill = null;

    sorted.forEach(entry => {
        const entryTime = new Date(entry.datetime).getTime();
        if (!currentBill || (entryTime - currentBill.lastTime > 2000)) {
            currentBill = { items: [entry], lastTime: entryTime };
            bills.push(currentBill);
        } else {
            currentBill.items.push(entry);
            currentBill.lastTime = entryTime;
        }
    });

    document.getElementById('stat-revenue').textContent = `₹${revenue.toFixed(0)}`;
    document.getElementById('stat-items-sold').textContent = itemsSold;
    document.getElementById('stat-bills').textContent = bills.length;

    const tally = {};
    today.forEach(e => { tally[e.item] = (tally[e.item] || 0) + e.quantity; });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('stat-top-item').textContent = top ? `${top[0]} (${top[1]})` : '—';

    // Render recent bills (newest first)
    const listEl = document.getElementById('recent-bills-list');
    if (bills.length === 0) {
        listEl.innerHTML = `<p class="no-data">No bills today</p>`;
        return;
    }

    // Show last 10 bills
    const recentBills = bills.slice(-10); // get last 10 directly
    listEl.innerHTML = '';

    const fragment = document.createDocumentFragment();

    for (let i = recentBills.length - 1; i >= 0; i--) {
        const bill = recentBills[i];

        let billTotal = 0;
        let itemCount = 0;

        for (let j = 0; j < bill.items.length; j++) {
            billTotal += bill.items[j].total;
            itemCount += bill.items[j].quantity;
        }

        const firstItem = bill.items[0];
        const timeStr = firstItem && firstItem.datetime ?
            new Date(firstItem.datetime).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit'
            }) :
            '';

        const card = document.createElement('div');
        card.className = 'bill-card';

        const ids = bill.items.map(e => `'${e.id}'`).join(',');

        card.innerHTML = `
        <div class="bill-info">
          <span class="bill-meta">Bill #${recentBills.length - i} — ${itemCount} items · ${timeStr}</span>
        </div>
        <span class="bill-total">₹${billTotal.toFixed(2)}</span>
        <button class="bill-delete-btn" onclick="deleteBill('${escapeHtmlAttr(firstItem?.datetime)}', ${ids})" title="Delete bill">✕</button>
    `;

        fragment.appendChild(card);
    }

    listEl.appendChild(fragment);
}

function deleteBill(firstDatetime, itemIds) {
    showConfirm(
        'Delete Bill',
        'Are you sure you want to delete this entire bill from the sales log?',
        () => {
            const allSales = Storage.getSalesLog();
            // Remove entries with the same first datetime (to identify the bill) and matching item ids
            const updated = allSales.filter(s => {
                if (itemIds.includes(s.id)) {
                    // Also ensure it's the same bill timestamp proximity
                    const billTime = new Date(firstDatetime).getTime();
                    const sTime = new Date(s.datetime).getTime();
                    return Math.abs(billTime - sTime) > 2000;
                }
                return true;
            });
            localStorage.setItem('bs_sales_log', JSON.stringify(updated));
            updateAnalytics();
            showToast('Bill deleted', 'info');
        }
    );
}

function escapeHtmlAttr(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
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

// ---- SELECT ITEM MODAL (for Edit / Delete) ----
let selectModalCallback = null;

function openEditSelectModal() {
    openSelectItemModal('Edit Item', (item) => {
        openEditItemModal(item.id);
    });
}

function openDeleteSelectModal() {
    openSelectItemModal('Delete Item', (item) => {
        confirmDeleteItem(item.id);
    });
}

function openSelectItemModal(title, callback) {
    const modal = document.getElementById('select-item-modal');
    document.getElementById('select-modal-title').textContent = title;
    const list = document.getElementById('select-item-list');
    const items = Storage.getMenu();

    if (items.length === 0) {
        list.innerHTML = '<p class="no-data">No items available</p>';
    } else {
        list.innerHTML = items.map(item => `
        <div class="item-select-row" onclick="selectModalPick('${item.id}')">
          <span class="item-select-name">${escHtml(item.name)}</span>
          <span class="item-select-price">₹${item.price.toFixed(2)}</span>
        </div>
      `).join('');
    }

    selectModalCallback = callback;
    modal.classList.remove('hidden');
}

function selectModalPick(id) {
    const item = Storage.getMenu().find(i => i.id === id);
    if (!item) return;
    const cb = selectModalCallback; // save the callback first
    closeSelectItemModal(); // now it's safe to close (clears selectModalCallback)
    if (cb) cb(item); // then execute it
}

function closeSelectItemModal() {
    document.getElementById('select-item-modal').classList.add('hidden');
    selectModalCallback = null;
}

function closeSelectItemModalOutside(e) {
    if (e.target === document.getElementById('select-item-modal')) closeSelectItemModal();
}

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
            recentlyUsed = [];
            showToast('Full reset done. Reloading...', 'info');
            setTimeout(() => location.reload(), 1200);
            return;
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
            closeSelectItemModal();
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