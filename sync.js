/* ==========================================================
   SALES ORDER APP — SINKRONISASI (Supabase)
   Data tetap disimpan di localStorage (jalan offline), lalu
   disinkronkan ke tabel sales_sync_records per akun login.
   ========================================================== */
(() => {
    "use strict";

    const SUPABASE_URL = "https://klawvreeiytmkmlptjij.supabase.co";
    // Kunci publishable (aman ditaruh di front-end; akses dibatasi RLS per user)
    const SUPABASE_KEY = "sb_publishable_lrPEqNbtPS9jgXLeHq1LFg_rEpG-4Jg";
    const TABLE = "sales_sync_records";

    const K = {
        orders: "sales_orders",
        customers: "saved_customers",
        adminList: "admin_wa_list",
        active: "active_admin_wa",
    };
    const WATCH = new Set(Object.values(K));
    const PLACEHOLDER_WA = "6281234567890"; // nomor bawaan app, tidak ikut disinkronkan
    const SKIP_KEY = "sync_skip_login";
    const SNAP_PREFIX = "sync_snapshot_";

    const el = (id) => document.getElementById(id);
    let sb = null;
    let user = null;
    let applying = false;
    let running = false;
    let again = false;
    let timer = null;
    let channel = null;

    /* ---------- Util ---------- */
    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return fallback;
            const v = JSON.parse(raw);
            return v ?? fallback;
        } catch {
            return fallback;
        }
    }

    // JSON dengan urutan key stabil (jsonb di server tidak menjaga urutan key)
    function canon(v) {
        if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
        if (v && typeof v === "object") {
            return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
        }
        return JSON.stringify(v);
    }

    function toast(msg, type) {
        if (typeof showToast === "function") showToast(msg, type);
    }

    /* ---------- Status UI ---------- */
    function setStatus(state) {
        const btn = el("syncBtn");
        if (!btn) return;
        const map = {
            synced: ["fa-cloud-arrow-up", "Tersinkron. Ketuk untuk keluar akun."],
            syncing: ["fa-arrows-rotate fa-spin", "Menyinkronkan..."],
            offline: ["fa-cloud-bolt", "Offline. Akan disinkronkan saat online."],
            error: ["fa-triangle-exclamation", "Gagal sinkron. Ketuk untuk coba lagi."],
            local: ["fa-cloud", "Mode lokal. Ketuk untuk masuk dan sinkron."],
        };
        const [icon, title] = map[state] || map.local;
        btn.className = "btn-icon sync-" + state;
        btn.title = title;
        btn.setAttribute("aria-label", title);
        btn.innerHTML = `<i class="fas ${icon}"></i>`;
        btn.dataset.state = state;
    }

    /* ---------- Data lokal -> daftar record ---------- */
    function localRecords() {
        const m = new Map();
        readJSON(K.orders, []).forEach((o) => {
            if (o && o.id) m.set("order:" + o.id, { kind: "order", id: String(o.id), data: o });
        });
        readJSON(K.customers, []).forEach((c) => {
            if (c && c.id) m.set("customer:" + c.id, { kind: "customer", id: String(c.id), data: c });
        });
        readJSON(K.adminList, []).forEach((n) => {
            const num = String(n || "");
            if (num && num !== PLACEHOLDER_WA) {
                m.set("admin_wa:" + num, { kind: "admin_wa", id: num, data: { number: num } });
            }
        });
        const active = localStorage.getItem(K.active);
        if (active && active !== PLACEHOLDER_WA) {
            m.set("setting:active_admin_wa", { kind: "setting", id: "active_admin_wa", data: { value: active } });
        }
        return m;
    }

    function snapKey() {
        return SNAP_PREFIX + (user ? user.id : "none");
    }
    function loadSnap() {
        return readJSON(snapKey(), null);
    }
    function saveSnap(local) {
        const snap = {};
        local.forEach((rec, key) => (snap[key] = canon(rec.data)));
        localStorage.setItem(snapKey(), JSON.stringify(snap));
    }
    function hasPending(snap) {
        if (snap === null) return false;
        const local = localRecords();
        for (const [key, rec] of local) if (snap[key] !== canon(rec.data)) return true;
        for (const key of Object.keys(snap)) if (!local.has(key)) return true;
        return false;
    }

    /* ---------- Push / Pull ---------- */
    function row(rec, deleted) {
        return { user_id: user.id, kind: rec.kind, id: rec.id, data: deleted ? {} : rec.data, deleted };
    }

    async function upsertRows(rows) {
        for (let i = 0; i < rows.length; i += 200) {
            const { error } = await sb
                .from(TABLE)
                .upsert(rows.slice(i, i + 200), { onConflict: "user_id,kind,id" });
            if (error) throw error;
        }
    }

    // initial=true: dorong hanya record lokal yang belum ada di server (gabung data)
    async function push(initial, serverKeys) {
        const local = localRecords();
        const snap = initial ? {} : loadSnap() || {};
        const rows = [];

        for (const [key, rec] of local) {
            if (initial) {
                if (!serverKeys.has(key)) rows.push(row(rec, false));
            } else if (snap[key] !== canon(rec.data)) {
                rows.push(row(rec, false));
            }
        }
        if (!initial) {
            for (const key of Object.keys(snap)) {
                if (local.has(key)) continue;
                const i = key.indexOf(":");
                rows.push({ user_id: user.id, kind: key.slice(0, i), id: key.slice(i + 1), data: {}, deleted: true });
            }
        }

        if (rows.length) await upsertRows(rows);
        if (!initial) saveSnap(local);
    }

    async function fetchAll() {
        const all = [];
        for (let from = 0; ; from += 1000) {
            const { data, error } = await sb
                .from(TABLE)
                .select("kind,id,data,deleted,updated_at")
                .order("updated_at", { ascending: false })
                .order("id", { ascending: true })
                .range(from, from + 999);
            if (error) throw error;
            all.push(...data);
            if (data.length < 1000) break;
        }
        return all;
    }

    function setIfChanged(key, value) {
        const next = JSON.stringify(value);
        if (localStorage.getItem(key) === next) return false;
        localStorage.setItem(key, next);
        return true;
    }

    // return false jika ada perubahan lokal yang belum terkirim (batalkan, kirim dulu)
    function applyServer(rows) {
        if (hasPending(loadSnap())) return false;

        const live = rows.filter((r) => !r.deleted);
        const orders = live
            .filter((r) => r.kind === "order")
            .map((r) => r.data)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const customers = live.filter((r) => r.kind === "customer").map((r) => r.data);
        const adminList = live.filter((r) => r.kind === "admin_wa").map((r) => r.id).reverse();
        const activeRow = live.find((r) => r.kind === "setting" && r.id === "active_admin_wa");

        const prevCustomer = el("savedCustomerSelect") ? el("savedCustomerSelect").value : "";
        let chOrders = false, chCust = false, chAdmin = false;

        applying = true;
        try {
            chOrders = setIfChanged(K.orders, orders);
            chCust = setIfChanged(K.customers, customers);

            if (adminList.length) {
                chAdmin = setIfChanged(K.adminList, adminList);
                const wanted = activeRow && activeRow.data ? activeRow.data.value : "";
                const current = localStorage.getItem(K.active) || "";
                const next = adminList.includes(wanted) ? wanted : adminList.includes(current) ? current : adminList[0];
                if (next !== current) {
                    localStorage.setItem(K.active, next);
                    chAdmin = true;
                }
            } else if (typeof ensureDefaultAdminWA === "function") {
                localStorage.removeItem(K.adminList);
                localStorage.removeItem(K.active);
                ensureDefaultAdminWA();
                chAdmin = true;
            }
        } finally {
            applying = false;
        }

        if (chOrders && typeof renderHistory === "function") renderHistory();
        if (chAdmin && typeof renderAdminWADropdown === "function") renderAdminWADropdown();
        if (chCust && typeof renderSavedCustomerDropdown === "function") renderSavedCustomerDropdown(prevCustomer);

        saveSnap(localRecords());
        return true;
    }

    async function runOnce() {
        if (loadSnap() === null) {
            // Login pertama di perangkat ini: gabungkan data lokal dengan server
            const serverRows = await fetchAll();
            const serverKeys = new Set(serverRows.map((r) => r.kind + ":" + r.id));
            await push(true, serverKeys);
            applyServer(await fetchAll());
        } else {
            await push(false);
            if (!applyServer(await fetchAll())) again = true;
        }
    }

    async function sync() {
        if (!sb || !user) return;
        if (running) {
            again = true;
            return;
        }
        running = true;
        setStatus("syncing");
        try {
            let guard = 0;
            do {
                again = false;
                await runOnce();
            } while (again && ++guard < 5);
            setStatus("synced");
        } catch (e) {
            console.warn("Sync gagal:", e);
            setStatus(navigator.onLine ? "error" : "offline");
        } finally {
            running = false;
        }
    }

    function scheduleSync(delay = 700) {
        if (!user) return;
        clearTimeout(timer);
        timer = setTimeout(sync, delay);
    }

    /* ---------- Pantau perubahan localStorage dari app.js ---------- */
    function hookStorage() {
        const origSet = Storage.prototype.setItem;
        const origRemove = Storage.prototype.removeItem;
        Storage.prototype.setItem = function (k) {
            origSet.apply(this, arguments);
            if (this === localStorage && WATCH.has(k) && !applying) scheduleSync();
        };
        Storage.prototype.removeItem = function (k) {
            origRemove.apply(this, arguments);
            if (this === localStorage && WATCH.has(k) && !applying) scheduleSync();
        };
    }

    /* ---------- Realtime ---------- */
    function subscribe() {
        unsubscribe();
        channel = sb
            .channel("sales-sync-" + user.id)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: TABLE, filter: "user_id=eq." + user.id },
                () => scheduleSync(300)
            )
            .subscribe();
    }
    function unsubscribe() {
        if (channel && sb) sb.removeChannel(channel);
        channel = null;
    }

    /* ---------- Login / Logout ---------- */
    function showAuth(show) {
        const o = el("authOverlay");
        if (!o) return;
        o.classList.toggle("active", !!show);
        if (show) {
            el("authError").textContent = "";
            setTimeout(() => el("authEmail") && el("authEmail").focus(), 50);
        }
    }

    function friendlyAuthError(err) {
        const msg = (err && err.message) || "";
        if (/invalid login credentials/i.test(msg)) return "Email atau password salah.";
        if (/email not confirmed/i.test(msg)) return "Email belum dikonfirmasi.";
        if (/rate limit|too many/i.test(msg)) return "Terlalu banyak percobaan. Coba lagi sebentar.";
        if (/failed to fetch|network/i.test(msg)) return "Tidak ada koneksi internet.";
        return "Gagal masuk: " + msg;
    }

    async function onSignedIn(session) {
        user = session.user;
        localStorage.removeItem(SKIP_KEY);
        showAuth(false);
        subscribe();
        await sync();
    }

    async function doLogin(e) {
        e.preventDefault();
        const email = el("authEmail").value.trim();
        const password = el("authPassword").value;
        const btn = el("authSubmit");
        const err = el("authError");
        if (!email || !password) {
            err.textContent = "Isi email dan password.";
            return;
        }
        btn.disabled = true;
        err.textContent = "";
        try {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;
            el("authPassword").value = "";
            toast("Berhasil masuk. Menyinkronkan data...", "success");
            await onSignedIn(data.session);
        } catch (ex) {
            err.textContent = friendlyAuthError(ex);
        } finally {
            btn.disabled = false;
        }
    }

    function clearLocalData() {
        applying = true;
        try {
            Object.values(K).forEach((k) => localStorage.removeItem(k));
            if (user) localStorage.removeItem(snapKey());
        } finally {
            applying = false;
        }
        if (typeof ensureDefaultAdminWA === "function") {
            applying = true;
            try { ensureDefaultAdminWA(); } finally { applying = false; }
        }
        if (typeof renderHistory === "function") renderHistory();
        if (typeof renderAdminWADropdown === "function") renderAdminWADropdown();
        if (typeof renderSavedCustomerDropdown === "function") renderSavedCustomerDropdown();
    }

    async function doLogout() {
        // pastikan semua perubahan sudah terkirim sebelum data lokal dibersihkan
        try {
            clearTimeout(timer);
            await push(false);
        } catch {
            toast("Tidak bisa keluar: ada data yang belum tersinkron. Coba lagi saat online.", "error");
            return;
        }
        unsubscribe();
        await sb.auth.signOut();
        clearLocalData();
        user = null;
        setStatus("local");
        showAuth(true);
        toast("Anda sudah keluar.", "info");
    }

    function onSyncBtn() {
        const state = el("syncBtn").dataset.state;
        if (!user) {
            showAuth(true);
        } else if (state === "error" || state === "offline") {
            sync();
        } else if (typeof showConfirm === "function") {
            showConfirm("Keluar dari akun? Data tetap aman di server dan akan dimuat lagi saat Anda masuk.", doLogout, "Ya, Keluar");
        }
    }

    /* ---------- Start ---------- */
    async function start() {
        setStatus("local");
        if (!window.supabase || !window.supabase.createClient) {
            console.warn("Supabase library tidak termuat; mode lokal.");
            return;
        }
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        });
        hookStorage();

        el("syncBtn").addEventListener("click", onSyncBtn);
        el("authForm").addEventListener("submit", doLogin);
        el("authSkip").addEventListener("click", () => {
            localStorage.setItem(SKIP_KEY, "1");
            showAuth(false);
        });

        const refresh = () => user && sync();
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") refresh();
        });
        window.addEventListener("online", refresh);
        window.addEventListener("offline", () => user && setStatus("offline"));

        const { data } = await sb.auth.getSession();
        if (data && data.session) {
            await onSignedIn(data.session);
        } else if (!localStorage.getItem(SKIP_KEY)) {
            showAuth(true);
        }

        sb.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT" && user) {
                unsubscribe();
                user = null;
                setStatus("local");
            }
        });
    }

    document.addEventListener("DOMContentLoaded", start);
})();
