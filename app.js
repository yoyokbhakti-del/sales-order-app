/* ==========================================================
   SALES ORDER APP — JAVASCRIPT
   ========================================================== */

/* ---------- Konstanta ---------- */
const STORAGE_KEY = "sales_orders";
const THEME_KEY = "app_theme";
const ADMIN_WA_LIST_KEY = "admin_wa_list";
const ACTIVE_ADMIN_WA_KEY = "active_admin_wa";
const SAVED_CUSTOMERS_KEY = "saved_customers";

/* ---------- DOM Elements ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const customerName = $("#customerName");
const customerWA = $("#customerWA");
const customerAddr = $("#customerAddress");
const orderNotes = $("#orderNotes");

const btnAddItem = $("#btnAddItem");
const orderItemsList = $("#orderItemsList");
const displayTotalItems = $("#displayTotalItems");

const btnSimpan = $("#btnSimpan");
const btnKirimWA = $("#btnKirimWA");
const historyList = $("#historyList");
const historyBadge = $("#historyBadge");
const btnClearHistory = $("#btnClearHistory");
const themeToggle = $("#themeToggle");
const toastContainer = $("#toastContainer");
const confirmModal = $("#confirmModal");
const confirmMessage = $("#confirmMessage");
const confirmCancel = $("#confirmCancel");
const confirmOk = $("#confirmOk");

const adminWANewInput = $("#adminWANewInput");
const adminWASelect = $("#adminWASelect");
const btnAddAdminWA = $("#btnAddAdminWA");
const btnDeleteAdminWA = $("#btnDeleteAdminWA");

const savedCustomerSelect = $("#savedCustomerSelect");
const btnSaveCustomer = $("#btnSaveCustomer");
const btnDeleteCustomer = $("#btnDeleteCustomer");

/* ---------- State ---------- */
let editingOrderId = null;
let currentItems = [];

/* ---------- Helper Umum ---------- */
function showToast(message, type = "success") {
    const icons = {
        success: "fa-circle-check",
        error: "fa-circle-xmark",
        info: "fa-circle-info",
    };
    const div = document.createElement("div");
    div.className = `toast toast-${type}`;
    div.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
    toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 3500);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

/* ---------- LocalStorage: Order ---------- */
function getOrders() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveOrderToStorage(order) {
    const orders = getOrders();
    orders.unshift(order);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function updateOrderById(id, updatedOrder) {
    const orders = getOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) return false;
    orders[idx] = { ...orders[idx], ...updatedOrder, id };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    return true;
}

function deleteOrderById(id) {
    const orders = getOrders().filter((o) => o.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    renderHistory();
}

function clearAllHistory() {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
    showToast("Semua riwayat berhasil dihapus.", "info");
}

/* ---------- WA Admin ---------- */
function normalizeWANumber(raw) {
    return (raw || "").replace(/\D/g, "");
}

function getAdminWANumbers() {
    try {
        const data = localStorage.getItem(ADMIN_WA_LIST_KEY);
        const parsed = data ? JSON.parse(data) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveAdminWANumbers(numbers) {
    localStorage.setItem(ADMIN_WA_LIST_KEY, JSON.stringify(numbers));
}

function getActiveAdminWA() {
    return localStorage.getItem(ACTIVE_ADMIN_WA_KEY) || "";
}

function setActiveAdminWA(number) {
    localStorage.setItem(ACTIVE_ADMIN_WA_KEY, number);
}

function ensureDefaultAdminWA() {
    const list = getAdminWANumbers();
    if (list.length === 0) {
        const defaultNumber = "6281234567890";
        saveAdminWANumbers([defaultNumber]);
        setActiveAdminWA(defaultNumber);
        return;
    }
    const active = getActiveAdminWA();
    if (!active || !list.includes(active)) {
        setActiveAdminWA(list[0]);
    }
}

function renderAdminWADropdown() {
    const list = getAdminWANumbers();
    const active = getActiveAdminWA();
    adminWASelect.innerHTML = "";

    if (list.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "-- Belum ada nomor --";
        adminWASelect.appendChild(opt);
        return;
    }

    list.forEach((num) => {
        const opt = document.createElement("option");
        opt.value = num;
        opt.textContent = num;
        if (num === active) opt.selected = true;
        adminWASelect.appendChild(opt);
    });
}

/* ---------- Saved Customer ---------- */
function getSavedCustomers() {
    try {
        const data = localStorage.getItem(SAVED_CUSTOMERS_KEY);
        const parsed = data ? JSON.parse(data) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveSavedCustomers(customers) {
    localStorage.setItem(SAVED_CUSTOMERS_KEY, JSON.stringify(customers));
}

function buildCustomerLabel(c) {
    return `${c.name} | ${c.phone || "-"} | ${c.address}`;
}

function upsertSavedCustomerFromForm() {
    const name = customerName.value.trim();
    const phone = customerWA.value.trim();
    const address = customerAddr.value.trim();
    if (!name || !address) return false;

    const customers = getSavedCustomers();
    const key = `${name.toLowerCase()}__${address.toLowerCase()}`;
    const idx = customers.findIndex(
        (c) => `${(c.name || "").toLowerCase()}__${(c.address || "").toLowerCase()}` === key
    );

    const payload = {
        id: idx >= 0 ? customers[idx].id : Date.now().toString(36),
        name,
        phone,
        address,
    };

    if (idx >= 0) customers[idx] = payload;
    else customers.unshift(payload);

    saveSavedCustomers(customers);
    renderSavedCustomerDropdown(payload.id);
    return true;
}

function renderSavedCustomerDropdown(selectedId = "") {
    const customers = getSavedCustomers();
    savedCustomerSelect.innerHTML = "";

    if (customers.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "-- Belum ada customer tersimpan --";
        savedCustomerSelect.appendChild(opt);
        return;
    }

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "-- Pilih customer tersimpan --";
    savedCustomerSelect.appendChild(defaultOpt);

    customers.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = buildCustomerLabel(c);
        if (selectedId && c.id === selectedId) opt.selected = true;
        savedCustomerSelect.appendChild(opt);
    });
}

function applySavedCustomerById(id) {
    const c = getSavedCustomers().find((x) => x.id === id);
    if (!c) return false;
    customerName.value = c.name || "";
    customerWA.value = c.phone || "";
    customerAddr.value = c.address || "";
    showToast("Data customer berhasil dimuat.", "info");
    return true;
}

function deleteSavedCustomerById(id) {
    const customers = getSavedCustomers().filter((c) => c.id !== id);
    saveSavedCustomers(customers);
    renderSavedCustomerDropdown();
}

/* ---------- Item Manual ---------- */
function renderItems() {
    if (!Array.isArray(currentItems) || currentItems.length === 0) {
        currentItems = [{ qty: "", name: "" }];
    }

    orderItemsList.innerHTML = currentItems
        .map(
            (item, idx) => `
            <div class="detail-item-row">
                <input
                    type="text"
                    class="item-qty-input"
                    data-index="${idx}"
                    placeholder="Qty (cth: 8 kg)"
                    value="${escapeHtml(item.qty || "")}"
                />
                <input
                    type="text"
                    class="item-name-input"
                    data-index="${idx}"
                    placeholder="Nama Barang (cth: PONDTREX)"
                    value="${escapeHtml(item.name || "")}"
                />
                <button type="button" class="btn-remove-item" onclick="removeItem(${idx})">×</button>
            </div>
        `
        )
        .join("");

    bindItemInputListeners();
    updateTotalItemsDisplay();
}

function bindItemInputListeners() {
    $$(".item-qty-input").forEach((el) => {
        el.addEventListener("input", (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            if (Number.isNaN(idx) || !currentItems[idx]) return;
            currentItems[idx].qty = e.target.value;
            updateTotalItemsDisplay();
        });
    });

    $$(".item-name-input").forEach((el) => {
        el.addEventListener("input", (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            if (Number.isNaN(idx) || !currentItems[idx]) return;
            currentItems[idx].name = e.target.value;
            updateTotalItemsDisplay();
        });
    });
}

function updateTotalItemsDisplay() {
    const totalItems = currentItems.filter((it) => (it.name || "").trim() !== "").length;
    displayTotalItems.textContent = String(totalItems);
}

function addItem() {
    currentItems.push({ qty: "", name: "" });
    renderItems();
}

function removeItem(index) {
    currentItems.splice(index, 1);
    if (!currentItems.length) {
        currentItems.push({ qty: "", name: "" });
    }
    renderItems();
}

/* ---------- Validasi & Data Form ---------- */
function validateForm() {
    if (!customerName.value.trim()) {
        showToast("Nama pelanggan harus diisi.", "error");
        customerName.focus();
        return false;
    }
    if (!customerWA.value.trim()) {
        showToast("Nomor WhatsApp harus diisi.", "error");
        customerWA.focus();
        return false;
    }
    if (!customerAddr.value.trim()) {
        showToast("Alamat pengiriman harus diisi.", "error");
        customerAddr.focus();
        return false;
    }
    const validItems = currentItems.filter((it) => (it.name || "").trim() !== "");
    if (!validItems.length) {
        showToast("Isi minimal 1 nama barang pada Detail Barang.", "error");
        const firstNameInput = document.querySelector(".item-name-input");
        if (firstNameInput) firstNameInput.focus();
        return false;
    }
    return true;
}

function getFormData() {
    const cleanedItems = currentItems
        .map((it) => ({
            qty: (it.qty || "").trim(),
            name: (it.name || "").trim(),
        }))
        .filter((it) => it.name !== "");

    const totalItems = cleanedItems.length;
    return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        customerName: customerName.value.trim(),
        customerWA: customerWA.value.trim(),
        customerAddress: customerAddr.value.trim(),
        items: cleanedItems,
        totalItems,
        notes: orderNotes.value.trim() || "-",
        date: new Date().toISOString(),
    };
}

/* ---------- WA Message ---------- */
function formatDateForMessage(isoDate) {
    const d = new Date(isoDate || Date.now());
    return d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatWAMessage(order) {
    const orderNo = `PSN-${(order.id || "").slice(-3).toUpperCase() || "000"}`;
    const detailLines = (order.items || [])
        .map((it, i) => `${i + 1}. ${it.qty || "0 Kg"} -${it.name}`)
        .join("\n");

    return encodeURIComponent(
        `No. Pesanan: ${orderNo}\n` +
        `Tanggal: ${formatDateForMessage(order.date)}\n` +
        `Customer: ${order.customerName}\n` +
        `No. WA: ${order.customerWA}\n` +
        `Alamat: ${order.customerAddress}\n\n` +
        `Detail Barang :\n${detailLines}\n\n` +
        `Total Item: ${order.totalItems || 0}\n` +
        `Catatan: ${order.notes || "-"}\n` +
        `Terima kasih.`
    );
}

function sendToWA(order) {
    const activeAdmin = getActiveAdminWA();
    if (!activeAdmin) {
        showToast("Nomor WA tujuan admin belum dipilih.", "error");
        return;
    }
    const message = formatWAMessage(order);
    window.open(`https://wa.me/${activeAdmin}?text=${message}`, "_blank");
}

function resendWA(id) {
    const order = getOrders().find((o) => o.id === id);
    if (!order) {
        showToast("Pesanan tidak ditemukan.", "error");
        return;
    }
    sendToWA(order);
}

/* ---------- Riwayat ---------- */
function renderHistory() {
    const orders = getOrders();
    historyBadge.textContent = orders.length;

    if (!orders.length) {
        historyList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>Belum ada pesanan tersimpan.</p>
            </div>
        `;
        return;
    }

    historyList.innerHTML = orders
        .map((o) => {
            const date = new Date(o.date);
            const dateStr = date.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });

            const itemsPreview = (o.items || [])
                .map((it, i) => `${i + 1}. ${escapeHtml(it.name)} x ${it.qty}`)
                .join("<br>");

            return `
            <div class="history-item" data-id="${o.id}">
                <div class="h-top">
                    <div class="h-customer">
                        <i class="fas fa-user"></i> ${escapeHtml(o.customerName)}
                    </div>
                    <span class="h-date"><i class="far fa-calendar"></i> ${dateStr}</span>
                </div>
                <div class="h-details">
                    <div><i class="fab fa-whatsapp"></i> ${escapeHtml(o.customerWA)}</div>
                    <div><i class="fas fa-location-dot"></i> ${escapeHtml(o.customerAddress)}</div>
                    <div style="margin-top:6px;"><strong>Detail Barang:</strong><br>${itemsPreview}</div>
                    <div style="margin-top:6px;"><strong>Total Item:</strong> ${o.totalItems || 0}</div>
                    ${o.notes !== "-" ? `<div><i class="fas fa-note-sticky"></i> ${escapeHtml(o.notes)}</div>` : ""}
                </div>
                <div class="h-actions">
                    <button class="btn-wa-small" onclick="resendWA('${o.id}')">
                        <i class="fab fa-whatsapp"></i> Kirim Ulang WA
                    </button>
                    <button class="btn-edit-small" onclick="editOrder('${o.id}')">
                        <i class="fas fa-pen"></i> Edit
                    </button>
                    <button class="btn-delete-small" onclick="deleteOrderById('${o.id}')">
                        <i class="fas fa-trash-can"></i> Hapus
                    </button>
                </div>
            </div>
        `;
        })
        .join("");
}

/* ---------- Save / Edit ---------- */
function handleSaveOnly() {
    if (!validateForm()) return;
    upsertSavedCustomerFromForm();

    const order = getFormData();
    if (editingOrderId) {
        const ok = updateOrderById(editingOrderId, order);
        if (!ok) {
            showToast("Riwayat yang diedit tidak ditemukan.", "error");
            return;
        }
        showToast("Riwayat pesanan berhasil diperbarui!", "success");
    } else {
        saveOrderToStorage(order);
        showToast("Pesanan berhasil disimpan!", "success");
    }

    renderHistory();
    resetForm();
}

function handleSaveAndSendWA() {
    if (!validateForm()) return;
    upsertSavedCustomerFromForm();

    const order = getFormData();
    if (editingOrderId) {
        const ok = updateOrderById(editingOrderId, order);
        if (!ok) {
            showToast("Riwayat yang diedit tidak ditemukan.", "error");
            return;
        }
        order.id = editingOrderId;
        showToast("Riwayat berhasil diperbarui & dikirim ke WhatsApp!", "success");
    } else {
        saveOrderToStorage(order);
        showToast("Pesanan disimpan & dikirim ke WhatsApp!", "success");
    }

    renderHistory();
    sendToWA(order);
    resetForm();
}

function editOrder(id) {
    const order = getOrders().find((o) => o.id === id);
    if (!order) {
        showToast("Data riwayat tidak ditemukan.", "error");
        return;
    }

    editingOrderId = id;
    customerName.value = order.customerName || "";
    customerWA.value = order.customerWA || "";
    customerAddr.value = order.customerAddress || "";
    orderNotes.value = order.notes && order.notes !== "-" ? order.notes : "";

    currentItems = Array.isArray(order.items) ? [...order.items] : [];
    renderItems();

    btnSimpan.innerHTML = '<i class="fas fa-floppy-disk"></i> Update Riwayat';
    btnKirimWA.innerHTML = '<i class="fab fa-whatsapp"></i> Update &amp; Kirim via WhatsApp';

    document.querySelector('[data-tab="orderForm"]').click();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Mode edit riwayat aktif.", "info");
}

function resetForm() {
    editingOrderId = null;
    customerName.value = "";
    customerWA.value = "";
    customerAddr.value = "";
    orderNotes.value = "";
    currentItems = [{ qty: "", name: "" }];
    renderItems();

    btnSimpan.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan Pesanan';
    btnKirimWA.innerHTML = '<i class="fab fa-whatsapp"></i> Simpan &amp; Kirim via WhatsApp';
}

/* ---------- UI Lain ---------- */
function initTabs() {
    $$(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            $$(".tab-btn").forEach((b) => b.classList.remove("active"));
            $$(".tab-content").forEach((c) => c.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(btn.dataset.tab).classList.add("active");
        });
    });
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    themeToggle.addEventListener("click", () => {
        const html = document.documentElement;
        const isDark = html.getAttribute("data-theme") === "dark";
        if (isDark) {
            html.removeAttribute("data-theme");
            localStorage.setItem(THEME_KEY, "light");
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            html.setAttribute("data-theme", "dark");
            localStorage.setItem(THEME_KEY, "dark");
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }
    });
}

function showConfirm(message, onConfirm, okLabel = "Ya, Hapus") {
    confirmMessage.textContent = message;
    confirmOk.textContent = okLabel;
    confirmModal.classList.add("active");

    const cleanup = () => {
        confirmModal.classList.remove("active");
        confirmCancel.removeEventListener("click", cancelHandler);
        confirmOk.removeEventListener("click", okHandler);
    };
    const cancelHandler = () => cleanup();
    const okHandler = () => {
        cleanup();
        onConfirm();
    };

    confirmCancel.addEventListener("click", cancelHandler);
    confirmOk.addEventListener("click", okHandler);
}

/* ---------- Init ---------- */
function init() {
    ensureDefaultAdminWA();
    renderAdminWADropdown();
    renderSavedCustomerDropdown();
    renderHistory();
    renderItems();
    initTabs();
    initTheme();

    btnAddItem.addEventListener("click", addItem);

    btnSimpan.addEventListener("click", handleSaveOnly);
    btnKirimWA.addEventListener("click", handleSaveAndSendWA);

    btnAddAdminWA.addEventListener("click", () => {
        const normalized = normalizeWANumber(adminWANewInput.value);
        if (!normalized) {
            showToast("Masukkan nomor WA admin yang valid.", "error");
            return;
        }

        const list = getAdminWANumbers();
        if (list.includes(normalized)) {
            showToast("Nomor WA tersebut sudah tersimpan.", "info");
            return;
        }

        list.push(normalized);
        saveAdminWANumbers(list);
        setActiveAdminWA(normalized);
        renderAdminWADropdown();
        adminWANewInput.value = "";
        showToast("Nomor WA admin berhasil disimpan.", "success");
    });

    adminWASelect.addEventListener("change", () => {
        const value = adminWASelect.value;
        if (!value) return;
        setActiveAdminWA(value);
        showToast("Nomor WA tujuan aktif diperbarui.", "info");
    });

    btnDeleteAdminWA.addEventListener("click", () => {
        const selected = adminWASelect.value;
        if (!selected) {
            showToast("Tidak ada nomor WA yang dipilih.", "error");
            return;
        }

        const list = getAdminWANumbers().filter((n) => n !== selected);
        if (!list.length) {
            showToast("Minimal harus ada 1 nomor WA tujuan.", "error");
            return;
        }

        saveAdminWANumbers(list);
        setActiveAdminWA(list[0]);
        renderAdminWADropdown();
        showToast("Nomor WA admin berhasil dihapus.", "success");
    });

    btnSaveCustomer.addEventListener("click", () => {
        const ok = upsertSavedCustomerFromForm();
        if (!ok) {
            showToast("Isi minimal nama dan alamat customer dulu.", "error");
            return;
        }
        showToast("Customer berhasil disimpan.", "success");
    });

    savedCustomerSelect.addEventListener("change", () => {
        const id = savedCustomerSelect.value;
        if (!id) return;
        if (!applySavedCustomerById(id)) showToast("Customer tidak ditemukan.", "error");
    });

    btnDeleteCustomer.addEventListener("click", () => {
        const id = savedCustomerSelect.value;
        if (!id) {
            showToast("Pilih customer yang ingin dihapus.", "error");
            return;
        }
        deleteSavedCustomerById(id);
        showToast("Customer tersimpan berhasil dihapus.", "success");
    });

    btnClearHistory.addEventListener("click", () => {
        const orders = getOrders();
        if (!orders.length) {
            showToast("Tidak ada riwayat untuk dihapus.", "info");
            return;
        }
        showConfirm("Hapus seluruh riwayat pesanan?", clearAllHistory);
    });

    customerWA.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            customerAddr.focus();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    init();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker
                .register("./sw.js")
                .catch((err) => console.error("SW registration failed:", err));
        });
    }
});
