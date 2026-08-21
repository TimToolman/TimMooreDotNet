/**
 * Paris Trip tab — itinerary planner for September 21–30, 2026.
 *
 * Data lives in data/paris-trip.json in the repo. Edits always save to
 * localStorage instantly; when the GitHub token from the photo manager is
 * present, they also commit back to the repo so every device that opens
 * the shared link sees the same plan. Same sync pattern as garage.js.
 */

(function () {
    const OWNER = 'TimToolman';
    const REPO = 'TimMooreDotNet';
    const BRANCH = 'main';
    const DATA_PATH = 'data/paris-trip.json';
    const TOKEN_KEY = 'ghPhotoToken';
    const LS_KEY = 'paris-trip-v1';
    const API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;

    const TRIP_START = '2026-09-21';
    const TRIP_END = '2026-09-30';

    const CATEGORIES = {
        lodging:   { label: 'Lodging',   color: '#5856d6' },
        dinner:    { label: 'Dining',    color: '#c93400' },
        event:     { label: 'Event',     color: '#af52de' },
        train:     { label: 'Train',     color: '#248a3d' },
        excursion: { label: 'Excursion', color: '#0071a4' },
        flight:    { label: 'Flight',    color: '#0071e3' },
        other:     { label: 'Other',     color: '#6e6e73' }
    };

    const ICONS = {
        lodging: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
        dinner: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"/><path d="M21 15v7"/>',
        event: '<path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/>',
        train: '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/><path d="M8 15h.01"/><path d="M16 15h.01"/>',
        excursion: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3 6.3-2.1Z"/>',
        flight: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z"/>',
        other: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
    };

    const PIN_ICON = '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';

    // Built-in seed for the very first load, before data/paris-trip.json
    // exists on the site. Mirrors the seed committed in that file.
    const DEFAULT_EVENTS = [
        { id: 'seed1', date: '2026-09-21', start: '10:35', end: '', category: 'flight', title: 'Arrive Paris CDG', location: 'Charles de Gaulle Airport, Terminal 2E', notes: 'Sample entry — tap to replace with your real flight details.' },
        { id: 'seed2', date: '2026-09-21', start: '15:00', end: '', category: 'lodging', title: 'Airbnb check-in — Le Marais', location: 'Rue des Archives, 75004 Paris', notes: 'Sample — add your Airbnb address, host contact, and door codes.' },
        { id: 'seed3', date: '2026-09-21', start: '19:30', end: '21:30', category: 'dinner', title: 'Welcome dinner', location: 'Chez Janou, 2 Rue Roger Verlomme, 75003 Paris', notes: 'Sample — swap in your reservation.' },
        { id: 'seed4', date: '2026-09-24', start: '09:00', end: '17:00', category: 'excursion', title: 'Day trip to Versailles', location: 'Château de Versailles', notes: 'Sample — RER C from St-Michel, about 45 minutes each way.' },
        { id: 'seed5', date: '2026-09-27', start: '11:00', end: '', category: 'event', title: 'Louvre timed entry', location: 'Musée du Louvre, Rue de Rivoli', notes: 'Sample — book timed tickets ahead.' }
    ];

    let events = null;
    let selectedDay = 'all'; // 'all' or a YYYY-MM-DD string
    let status = 'Loading…';
    let editing = null; // null, or the event object being edited ({} fields copied)

    let ghSaveTimer = null;
    let ghSaving = false;
    let ghDirty = false;

    let root, daysEl, dayBarEl, statusEl, modalEl;

    document.addEventListener('DOMContentLoaded', () => {
        root = document.getElementById('paris-root');
        if (!root) return;
        buildSkeleton();
        loadEvents();
    });

    /* ---------- dates ---------- */

    function tripDays() {
        const days = [];
        const d = parseDate(TRIP_START);
        const end = parseDate(TRIP_END);
        while (d <= end) {
            days.push(toKey(d));
            d.setDate(d.getDate() + 1);
        }
        return days;
    }

    function parseDate(key) {
        const p = key.split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]);
    }

    function toKey(d) {
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function dayName(key) { return WEEKDAYS[parseDate(key).getDay()]; }
    function dayLabel(key) {
        const d = parseDate(key);
        return MONTHS[d.getMonth()] + ' ' + d.getDate();
    }
    function chipLabel(key) {
        const d = parseDate(key);
        return { wd: WEEKDAYS[d.getDay()].slice(0, 3).toUpperCase(), num: d.getDate() };
    }

    function fmtTime(t) {
        if (!t) return '';
        const p = t.split(':');
        let h = +p[0];
        const suffix = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return h + ':' + p[1] + ' ' + suffix;
    }

    function countdownText() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const start = parseDate(TRIP_START);
        const end = parseDate(TRIP_END);
        const dayMs = 24 * 60 * 60 * 1000;
        if (today < start) {
            const n = Math.round((start - today) / dayMs);
            return n + (n === 1 ? ' day to go' : ' days to go');
        }
        if (today <= end) {
            return 'Day ' + (Math.round((today - start) / dayMs) + 1) + ' of 10';
        }
        return 'Trip complete';
    }

    /* ---------- data ---------- */

    async function loadEvents() {
        let fromSite = null;
        let fromLocal = null;
        try {
            const res = await fetch(DATA_PATH + '?t=' + Date.now());
            if (res.ok) fromSite = await res.json();
        } catch (e) { /* offline or not published yet */ }
        try {
            fromLocal = JSON.parse(localStorage.getItem(LS_KEY));
        } catch (e) { /* ignore */ }

        // The published copy is the source of truth for viewers. Local edits
        // win only on the syncing device (token present) or while offline —
        // that keeps family devices from silently diverging from the plan.
        const localNewer = fromLocal && fromLocal.events &&
            (!fromSite || (fromLocal.updated || '') >= (fromSite.updated || ''));
        let chosen = fromSite;
        if (localNewer && (localStorage.getItem(TOKEN_KEY) || !fromSite)) {
            chosen = fromLocal;
        }
        events = (chosen && chosen.events) ? chosen.events : DEFAULT_EVENTS.map(e => Object.assign({}, e));
        status = 'Saved';
        renderAll();

        // Publish local edits the site never received (made offline or before
        // the token was set up).
        if (chosen === fromLocal && fromSite && (fromLocal.updated || '') > (fromSite.updated || '') &&
            localStorage.getItem(TOKEN_KEY)) {
            status = 'Syncing…';
            renderStatus();
            ghSave();
        }
    }

    function scheduleSave() {
        status = 'Saving…';
        renderStatus();
        const snapshot = { updated: new Date().toISOString(), events: events };
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
        } catch (e) { /* storage full — GitHub save still applies */ }

        if (!localStorage.getItem(TOKEN_KEY)) {
            status = 'Saved on this device only — set up the sync token in the Photos tab to publish for everyone';
            renderStatus();
            return;
        }
        clearTimeout(ghSaveTimer);
        ghSaveTimer = setTimeout(ghSave, 1500);
    }

    async function ghSave() {
        if (ghSaving) { ghDirty = true; return; }
        ghSaving = true;
        try {
            const snapshot = { updated: new Date().toISOString(), events: events };
            await ghPutFile(DATA_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'Update Paris trip itinerary');
            status = 'Saved';
        } catch (err) {
            status = authErrorMessage(err) ||
                ('Saved on this device — sync failed (' + err.message + ')');
        } finally {
            ghSaving = false;
            renderStatus();
            if (ghDirty) { ghDirty = false; ghSave(); }
        }
    }

    function authErrorMessage(err) {
        if (!/GitHub 401/.test(err && err.message)) return null;
        localStorage.removeItem(TOKEN_KEY);
        return 'GitHub token expired or revoked — paste a new one in the Photos tab to keep syncing.';
    }

    function ghHeaders() {
        return {
            Authorization: 'Bearer ' + localStorage.getItem(TOKEN_KEY),
            Accept: 'application/vnd.github+json'
        };
    }

    async function ghPutFile(path, content, message) {
        let sha;
        const getRes = await fetch(API + '/contents/' + path + '?ref=' + BRANCH, { headers: ghHeaders() });
        if (getRes.ok) sha = (await getRes.json()).sha;
        const payload = {
            message: message,
            content: btoa(unescape(encodeURIComponent(content))),
            branch: BRANCH
        };
        if (sha) payload.sha = sha;
        const putRes = await fetch(API + '/contents/' + path, {
            method: 'PUT',
            headers: ghHeaders(),
            body: JSON.stringify(payload)
        });
        if (!putRes.ok) throw new Error('GitHub ' + putRes.status);
    }

    /* ---------- rendering ---------- */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function icon(name, size) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            (ICONS[name] || ICONS.other) + '</svg>';
    }

    function buildSkeleton() {
        root.innerHTML =
            '<div class="paris-app">' +
                '<div class="paris-hero">' +
                    '<div class="paris-eyebrow">The Moores &middot; September 21&ndash;30, 2026</div>' +
                    '<h2 class="paris-headline">Paris</h2>' +
                    '<p class="paris-subhead" id="paris-countdown"></p>' +
                    '<div class="paris-cta-row">' +
                        '<button class="paris-btn paris-btn-primary" id="paris-add-btn" type="button">Add a plan</button>' +
                    '</div>' +
                '</div>' +
                '<div class="paris-daybar" id="paris-daybar"></div>' +
                '<div class="paris-days" id="paris-days"></div>' +
                '<div class="paris-status" id="paris-status"></div>' +
            '</div>' +
            '<div class="paris-modal" id="paris-modal" style="display:none;">' +
                '<div class="paris-modal-backdrop"></div>' +
                '<div class="paris-sheet" role="dialog" aria-modal="true" aria-label="Edit plan">' +
                    '<div class="paris-sheet-head">' +
                        '<button class="paris-btn-text" id="paris-cancel" type="button">Cancel</button>' +
                        '<div class="paris-sheet-title" id="paris-sheet-title">New Plan</div>' +
                        '<button class="paris-btn-text paris-btn-strong" id="paris-save" type="button">Save</button>' +
                    '</div>' +
                    '<div class="paris-sheet-body">' +
                        '<label class="paris-label" for="paris-f-title">Title</label>' +
                        '<input class="paris-input" id="paris-f-title" type="text" placeholder="Dinner at&hellip;" autocomplete="off">' +
                        '<label class="paris-label">Category</label>' +
                        '<div class="paris-cat-grid" id="paris-cat-grid"></div>' +
                        '<div class="paris-field-row">' +
                            '<div class="paris-field">' +
                                '<label class="paris-label" for="paris-f-date">Day</label>' +
                                '<select class="paris-input" id="paris-f-date"></select>' +
                            '</div>' +
                            '<div class="paris-field">' +
                                '<label class="paris-label" for="paris-f-start">Start</label>' +
                                '<input class="paris-input" id="paris-f-start" type="time">' +
                            '</div>' +
                            '<div class="paris-field">' +
                                '<label class="paris-label" for="paris-f-end">End</label>' +
                                '<input class="paris-input" id="paris-f-end" type="time">' +
                            '</div>' +
                        '</div>' +
                        '<div class="paris-help">Leave start empty for an all-day item.</div>' +
                        '<label class="paris-label" for="paris-f-location">Location / address</label>' +
                        '<input class="paris-input" id="paris-f-location" type="text" placeholder="Name, street, arrondissement" autocomplete="off">' +
                        '<label class="paris-label" for="paris-f-notes">Details</label>' +
                        '<textarea class="paris-input paris-textarea" id="paris-f-notes" rows="4" placeholder="Confirmation numbers, door codes, reservation times, who&rsquo;s going&hellip;"></textarea>' +
                        '<div class="paris-sheet-footer">' +
                            '<button class="paris-btn paris-btn-danger" id="paris-delete" type="button">Delete Plan</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        daysEl = document.getElementById('paris-days');
        dayBarEl = document.getElementById('paris-daybar');
        statusEl = document.getElementById('paris-status');
        modalEl = document.getElementById('paris-modal');

        // Day select options
        const dateSel = document.getElementById('paris-f-date');
        tripDays().forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = dayName(key).slice(0, 3) + ', ' + dayLabel(key);
            dateSel.appendChild(opt);
        });

        // Category picker
        const catGrid = document.getElementById('paris-cat-grid');
        Object.keys(CATEGORIES).forEach(key => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'paris-cat-pill';
            b.dataset.cat = key;
            b.style.setProperty('--cat-color', CATEGORIES[key].color);
            b.innerHTML = icon(key, 16) + '<span>' + CATEGORIES[key].label + '</span>';
            b.addEventListener('click', () => {
                catGrid.querySelectorAll('.paris-cat-pill').forEach(p => p.classList.remove('selected'));
                b.classList.add('selected');
            });
            catGrid.appendChild(b);
        });

        document.getElementById('paris-add-btn').addEventListener('click', () => openModal(null, null));
        document.getElementById('paris-cancel').addEventListener('click', closeModal);
        document.getElementById('paris-save').addEventListener('click', saveFromModal);
        document.getElementById('paris-delete').addEventListener('click', deleteFromModal);
        modalEl.querySelector('.paris-modal-backdrop').addEventListener('click', closeModal);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modalEl.style.display !== 'none') closeModal();
        });
    }

    function renderAll() {
        document.getElementById('paris-countdown').textContent =
            countdownText() + ' · ' + events.length + (events.length === 1 ? ' plan' : ' plans');
        renderDayBar();
        renderDays();
        renderStatus();
    }

    function renderDayBar() {
        let html = '<button class="paris-day-chip paris-day-chip-all' + (selectedDay === 'all' ? ' active' : '') +
            '" data-day="all" type="button">All<br>Days</button>';
        tripDays().forEach(key => {
            const c = chipLabel(key);
            html += '<button class="paris-day-chip' + (selectedDay === key ? ' active' : '') +
                '" data-day="' + key + '" type="button">' +
                '<span class="paris-chip-wd">' + c.wd + '</span>' +
                '<span class="paris-chip-num">' + c.num + '</span></button>';
        });
        dayBarEl.innerHTML = html;
        dayBarEl.querySelectorAll('.paris-day-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                selectedDay = chip.dataset.day;
                renderDayBar();
                renderDays();
            });
        });
    }

    function eventsFor(key) {
        return events
            .filter(e => e.date === key)
            .sort((a, b) => {
                if (!a.start && b.start) return -1;
                if (a.start && !b.start) return 1;
                if (a.start !== b.start) return (a.start || '') < (b.start || '') ? -1 : 1;
                return (a.title || '').localeCompare(b.title || '');
            });
    }

    function renderDays() {
        const days = selectedDay === 'all' ? tripDays() : [selectedDay];
        let html = '';
        days.forEach(key => {
            const list = eventsFor(key);
            html += '<section class="paris-day">' +
                '<div class="paris-day-head">' +
                    '<div><span class="paris-day-name">' + dayName(key) + '</span>' +
                    '<span class="paris-day-date">' + dayLabel(key) + '</span></div>' +
                    '<button class="paris-btn paris-btn-sm paris-day-add" data-day="' + key + '" type="button">+ Add</button>' +
                '</div>';
            if (list.length === 0) {
                html += '<div class="paris-empty">Nothing planned yet</div>';
            } else {
                html += '<div class="paris-blocks">';
                list.forEach(e => { html += blockHtml(e); });
                html += '</div>';
            }
            html += '</section>';
        });
        daysEl.innerHTML = html;

        daysEl.querySelectorAll('.paris-day-add').forEach(btn => {
            btn.addEventListener('click', () => openModal(null, btn.dataset.day));
        });
        daysEl.querySelectorAll('.paris-block').forEach(el => {
            el.addEventListener('click', ev => {
                if (ev.target.closest('a')) return; // let the map link work
                const found = events.find(e => e.id === el.dataset.id);
                if (found) openModal(found, null);
            });
        });
    }

    function blockHtml(e) {
        const cat = CATEGORIES[e.category] || CATEGORIES.other;
        const time = e.start
            ? fmtTime(e.start) + (e.end ? ' – ' + fmtTime(e.end) : '')
            : 'All day';
        let html = '<div class="paris-block" data-id="' + esc(e.id) + '" role="button" tabindex="0">' +
            '<div class="paris-block-icon" style="--cat-color:' + cat.color + ';">' + icon(e.category, 18) + '</div>' +
            '<div class="paris-block-main">' +
                '<div class="paris-block-meta"><span class="paris-block-time">' + esc(time) + '</span>' +
                '<span class="paris-block-cat" style="color:' + cat.color + ';">' + cat.label + '</span></div>' +
                '<div class="paris-block-title">' + esc(e.title || 'Untitled') + '</div>';
        if (e.location) {
            html += '<a class="paris-block-loc" target="_blank" rel="noopener" href="https://maps.google.com/?q=' +
                encodeURIComponent(e.location) + '">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                PIN_ICON + '</svg>' + esc(e.location) + '</a>';
        }
        if (e.notes) html += '<div class="paris-block-notes">' + esc(e.notes) + '</div>';
        html += '</div><div class="paris-block-chevron">&rsaquo;</div></div>';
        return html;
    }

    function renderStatus() {
        statusEl.textContent = status;
    }

    /* ---------- modal ---------- */

    function openModal(existing, presetDay) {
        editing = existing || null;
        document.getElementById('paris-sheet-title').textContent = existing ? 'Edit Plan' : 'New Plan';
        document.getElementById('paris-delete').style.display = existing ? '' : 'none';
        document.getElementById('paris-f-title').value = existing ? (existing.title || '') : '';
        document.getElementById('paris-f-date').value = existing ? existing.date :
            (presetDay || (selectedDay !== 'all' ? selectedDay : TRIP_START));
        document.getElementById('paris-f-start').value = existing ? (existing.start || '') : '';
        document.getElementById('paris-f-end').value = existing ? (existing.end || '') : '';
        document.getElementById('paris-f-location').value = existing ? (existing.location || '') : '';
        document.getElementById('paris-f-notes').value = existing ? (existing.notes || '') : '';
        const cat = existing ? (existing.category || 'other') : 'event';
        document.querySelectorAll('#paris-cat-grid .paris-cat-pill').forEach(p => {
            p.classList.toggle('selected', p.dataset.cat === cat);
        });
        modalEl.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('paris-f-title').focus();
    }

    function closeModal() {
        modalEl.style.display = 'none';
        document.body.style.overflow = '';
        editing = null;
    }

    function saveFromModal() {
        const title = document.getElementById('paris-f-title').value.trim();
        if (!title) {
            document.getElementById('paris-f-title').focus();
            return;
        }
        const selected = document.querySelector('#paris-cat-grid .paris-cat-pill.selected');
        const data = {
            date: document.getElementById('paris-f-date').value,
            start: document.getElementById('paris-f-start').value,
            end: document.getElementById('paris-f-end').value,
            category: selected ? selected.dataset.cat : 'other',
            title: title,
            location: document.getElementById('paris-f-location').value.trim(),
            notes: document.getElementById('paris-f-notes').value.trim()
        };
        if (editing) {
            Object.assign(editing, data);
        } else {
            data.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            events.push(data);
        }
        closeModal();
        renderAll();
        scheduleSave();
    }

    function deleteFromModal() {
        if (!editing) return;
        const btn = document.getElementById('paris-delete');
        if (!btn.dataset.confirming) {
            btn.dataset.confirming = '1';
            btn.textContent = 'Tap again to delete';
            setTimeout(() => {
                delete btn.dataset.confirming;
                btn.textContent = 'Delete Plan';
            }, 2500);
            return;
        }
        delete btn.dataset.confirming;
        btn.textContent = 'Delete Plan';
        events = events.filter(e => e.id !== editing.id);
        closeModal();
        renderAll();
        scheduleSave();
    }
})();
