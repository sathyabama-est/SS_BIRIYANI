/* =========================================================
   BillStation POS — storage.js
   All localStorage read/write operations
   ========================================================= */

const Storage = (() => {

    const KEYS = {
        MENU: 'bs_menu_items',
        SALES: 'bs_sales_log',
        SUMMARY: 'bs_daily_summary',
        THEME: 'bs_theme',
    };

    // Default menu items (15 items)
    const DEFAULT_MENU = [
        { id: uid(), name: 'Biriyani', price: 100, totalSold: 0 },
        { id: uid(), name: 'Biriyani OFF', price: 80, totalSold: 0 },
        { id: uid(), name: 'Biriyani OG', price: 160, totalSold: 0 },
        { id: uid(), name: '100g - CHICKEN 65', price: 100, totalSold: 0 },
        { id: uid(), name: '250g - CHICKEN 65', price: 200, totalSold: 0 },
        { id: uid(), name: '500g - CHICKEN 65', price: 300, totalSold: 0 },
        { id: uid(), name: 'Bread Halwa S', price: 40, totalSold: 0 },
        { id: uid(), name: 'Bread Halwa M', price: 80, totalSold: 0 },
    ];

    function uid() {
        return Math.random().toString(36).slice(2, 10);
    }

    // ---- MENU ----
    function getMenu() {
        const raw = localStorage.getItem(KEYS.MENU);
        if (!raw) {
            const d = DEFAULT_MENU.map(i => ({...i, id: uid() }));
            saveMenu(d);
            return d;
        }
        return JSON.parse(raw);
    }

    function saveMenu(items) {
        localStorage.setItem(KEYS.MENU, JSON.stringify(items));
    }

    function addMenuItem(name, price) {
        const items = getMenu();
        const item = { id: uid(), name, price: parseFloat(price), totalSold: 0 };
        items.push(item);
        saveMenu(items);
        return item;
    }

    function updateMenuItem(id, name, price) {
        const items = getMenu();
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) {
            items[idx].name = name;
            items[idx].price = parseFloat(price);
            saveMenu(items);
            return items[idx];
        }
        return null;
    }

    function deleteMenuItem(id) {
        const items = getMenu().filter(i => i.id !== id);
        saveMenu(items);
    }

    function incrementSold(id, qty) {
        const items = getMenu();
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) {
            items[idx].totalSold = (items[idx].totalSold || 0) + qty;
            saveMenu(items);
        }
    }

    // ---- SALES LOG ----
    function getSalesLog() {
        const raw = localStorage.getItem(KEYS.SALES);
        return raw ? JSON.parse(raw) : [];
    }

    function addSaleEntries(cartItems) {
        const log = getSalesLog();
        const now = new Date().toISOString();
        cartItems.forEach(ci => {
            log.push({
                id: uid(),
                item: ci.name,
                price: ci.price,
                quantity: ci.qty,
                total: ci.price * ci.qty,
                datetime: now,
            });
        });
        localStorage.setItem(KEYS.SALES, JSON.stringify(log));
    }

    function getTodaysSales() {
        const log = getSalesLog();
        const today = new Date().toDateString();
        return log.filter(e => new Date(e.datetime).toDateString() === today);
    }

    function clearTodaySales() {
        const log = getSalesLog();
        const today = new Date().toDateString();
        const filtered = log.filter(e => new Date(e.datetime).toDateString() !== today);
        localStorage.setItem(KEYS.SALES, JSON.stringify(filtered));
    }

    function clearAllSales() {
        localStorage.removeItem(KEYS.SALES);
    }

    // ---- FULL RESET ----
    function fullReset() {
        localStorage.removeItem(KEYS.MENU);
        localStorage.removeItem(KEYS.SALES);
        localStorage.removeItem(KEYS.SUMMARY);
    }

    // ---- THEME ----
    function getTheme() {
        return localStorage.getItem(KEYS.THEME) || 'dark';
    }

    function setTheme(t) {
        localStorage.setItem(KEYS.THEME, t);
    }

    return {
        getMenu,
        saveMenu,
        addMenuItem,
        updateMenuItem,
        deleteMenuItem,
        incrementSold,
        getSalesLog,
        addSaleEntries,
        getTodaysSales,
        clearTodaySales,
        clearAllSales,
        fullReset,
        getTheme,
        setTheme,
        uid,
    };

})();