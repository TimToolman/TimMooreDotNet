/**
 * Garage Boxes tab — vanilla JS port of garage-box-lookup.jsx.
 *
 * Data lives in data/garage-boxes.json in the repo. Edits always save to
 * localStorage instantly; when the GitHub token from the photo manager is
 * present, they also commit back to the repo so other devices stay in sync.
 * Box photos are static files in images/garage/, mapped in js/garage-photos.js.
 */

(function () {
    const OWNER = 'TimToolman';
    const REPO = 'TimMooreDotNet';
    const BRANCH = 'main';
    const DATA_PATH = 'data/garage-boxes.json';
    const CSV_PATH = 'data/garage-boxes.csv';
    const PHOTOS_DATA_PATH = 'data/garage-photos.json';
    const PHOTOS_DIR = 'images/garage';
    const PHOTOS_LS_KEY = 'garage-box-photos-v1';
    const TOKEN_KEY = 'ghPhotoToken';
    const ANTHROPIC_KEY_KEY = 'anthropicApiKey';
    const LS_KEY = 'garage-box-inventory-v1';
    const API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
    const MAX_PHOTO_DIMENSION = 1920;
    const JPEG_QUALITY = 0.85;

    let boxes = null;
    let photoMap = {};
    let query = '';
    let status = 'Loading…';
    // At most one transient editor is open at a time:
    // { type: 'editNum'|'editItem'|'confirmItem'|'move'|'confirmBox', boxId, idx }
    let ui = null;
    let lightbox = null; // { boxId, index }

    let ghSaveTimer = null;
    let ghSaving = false;
    let ghDirty = false;

    let root, grid, meta, note, searchInput, clearBtn;

    document.addEventListener('DOMContentLoaded', () => {
        root = document.getElementById('garage-root');
        if (!root) return;
        buildSkeleton();
        loadBoxes();
    });

    /* ---------- data ---------- */

    async function loadBoxes() {
        const photosReady = loadPhotos();
        let fromSite = null;
        let fromLocal = null;
        try {
            const res = await fetch(DATA_PATH + '?t=' + Date.now());
            if (res.ok) fromSite = await res.json();
        } catch (e) { /* offline or missing */ }
        try {
            fromLocal = JSON.parse(localStorage.getItem(LS_KEY));
        } catch (e) { /* ignore */ }

        // Use whichever copy is newer; localStorage wins ties (it holds
        // this device's edits made while GitHub Pages was still deploying).
        let chosen = fromSite;
        if (fromLocal && fromLocal.boxes && (!fromSite || (fromLocal.updated || '') >= (fromSite.updated || ''))) {
            chosen = fromLocal;
        }
        boxes = (chosen && chosen.boxes) ? chosen.boxes : [];
        status = 'Saved';
        await photosReady;
        renderAll();

        // If this device has edits the site never received (made before the
        // token was set up, or while offline), publish them now.
        if (chosen === fromLocal && fromSite && (fromLocal.updated || '') > (fromSite.updated || '') &&
            localStorage.getItem(TOKEN_KEY)) {
            status = 'Syncing…';
            renderMeta();
            ghSave();
        }
    }

    /* ---------- photos data ---------- */

    // Photo edits follow the same pattern as boxes: data/garage-photos.json in
    // the repo (fetched with a cache-buster) is the source of truth, with a
    // localStorage copy covering the gap while GitHub Pages deploys. The static
    // GARAGE_PHOTOS map in js/garage-photos.js is only the seed for first run.
    async function loadPhotos() {
        let fromSite = null;
        let fromLocal = null;
        try {
            const res = await fetch(PHOTOS_DATA_PATH + '?t=' + Date.now());
            if (res.ok) fromSite = await res.json();
        } catch (e) { /* not published yet or offline */ }
        try {
            fromLocal = JSON.parse(localStorage.getItem(PHOTOS_LS_KEY));
        } catch (e) { /* ignore */ }
        let chosen = fromSite;
        if (fromLocal && fromLocal.photos && (!fromSite || (fromLocal.updated || '') >= (fromSite.updated || ''))) {
            chosen = fromLocal;
        }
        photoMap = (chosen && chosen.photos) ? chosen.photos
            : (typeof GARAGE_PHOTOS !== 'undefined' ? GARAGE_PHOTOS : {});
    }

    function photosFor(boxId) {
        if (!photoMap[boxId]) photoMap[boxId] = [];
        return photoMap[boxId];
    }

    function cleanPhotoMap() {
        const out = {};
        Object.keys(photoMap).forEach(id => {
            const list = (photoMap[id] || []).map(p => ({ src: p.src, caption: p.caption || '' }));
            if (list.length) out[id] = list;
        });
        return out;
    }

    async function savePhotoMap(message) {
        const snapshot = { updated: new Date().toISOString(), photos: cleanPhotoMap() };
        try {
            localStorage.setItem(PHOTOS_LS_KEY, JSON.stringify(snapshot));
        } catch (e) { /* storage full — GitHub save still applies */ }
        await ghPutFile(PHOTOS_DATA_PATH, JSON.stringify(snapshot, null, 2) + '\n', message);
    }

    function scheduleSave() {
        status = 'Saving…';
        renderMeta();
        const snapshot = { updated: new Date().toISOString(), boxes: boxes };
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
        } catch (e) { /* storage full — GitHub save still applies */ }

        if (!localStorage.getItem(TOKEN_KEY)) {
            status = 'Saved on this device (log token in Photos tab to sync)';
            renderMeta();
            return;
        }
        clearTimeout(ghSaveTimer);
        ghSaveTimer = setTimeout(ghSave, 1500);
    }

    async function ghSave() {
        if (ghSaving) { ghDirty = true; return; }
        ghSaving = true;
        try {
            const snapshot = { updated: new Date().toISOString(), boxes: boxes };
            const json = JSON.stringify(snapshot, null, 2) + '\n';
            await ghPutFile(DATA_PATH, json, 'Update garage boxes');
            // Keep a permanent, spreadsheet-friendly copy alongside the JSON.
            await ghPutFile(CSV_PATH, boxesToCsv(), 'Update garage boxes CSV');
            status = 'Saved';
        } catch (err) {
            status = authErrorMessage(err) ||
                ('Saved on this device — sync failed (' + err.message + ')');
        } finally {
            ghSaving = false;
            renderMeta();
            if (ghDirty) { ghDirty = false; ghSave(); }
        }
    }

    // The GitHub token lives in this device's localStorage (shared with the
    // photo manager). If it's missing, show the token panel in the photo
    // viewer and return false — no window.prompt, which embedded browsers
    // (VS Code, some webviews) don't implement.
    function ensureToken() {
        if (localStorage.getItem(TOKEN_KEY)) return true;
        lbNeedToken = true;
        renderLightbox();
        return false;
    }

    // A 401 means the stored token expired or was revoked. Drop it so the
    // token panel reappears, and return the message to show the user.
    function authErrorMessage(err) {
        if (!/GitHub 401/.test(err && err.message)) return null;
        localStorage.removeItem(TOKEN_KEY);
        lbNeedToken = true;
        return 'GitHub token expired or revoked — paste a new one to keep syncing.';
    }

    function ghHeaders() {
        return {
            Authorization: 'Bearer ' + localStorage.getItem(TOKEN_KEY),
            Accept: 'application/vnd.github+json'
        };
    }

    async function ghPutFile(path, content, message) {
        return ghPutBase64(path, btoa(unescape(encodeURIComponent(content))), message);
    }

    async function ghPutBase64(path, base64, message) {
        let sha;
        const getRes = await fetch(API + '/contents/' + path + '?ref=' + BRANCH, { headers: ghHeaders() });
        if (getRes.ok) sha = (await getRes.json()).sha;
        const payload = {
            message: message,
            content: base64,
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

    async function ghDeleteFile(path, message) {
        const getRes = await fetch(API + '/contents/' + path + '?ref=' + BRANCH, { headers: ghHeaders() });
        if (getRes.status === 404) return; // already gone
        if (!getRes.ok) throw new Error('GitHub ' + getRes.status);
        const sha = (await getRes.json()).sha;
        const res = await fetch(API + '/contents/' + path, {
            method: 'DELETE',
            headers: ghHeaders(),
            body: JSON.stringify({ message: message, sha: sha, branch: BRANCH })
        });
        if (!res.ok) throw new Error('GitHub ' + res.status);
    }

    /* ---------- CSV export ---------- */

    function csvField(v) {
        v = String(v == null ? '' : v);
        return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }

    function boxesToCsv() {
        const rows = [['box_id', 'box_number', 'box_label', 'box_note', 'item']];
        boxes.slice().sort((a, b) => a.number - b.number).forEach(b => {
            if (b.items.length === 0) {
                rows.push([b.id, b.number, b.label, b.note, '']);
            } else {
                b.items.forEach(it => rows.push([b.id, b.number, b.label, b.note, it]));
            }
        });
        return rows.map(r => r.map(csvField).join(',')).join('\n') + '\n';
    }

    function downloadCsv() {
        const blob = new Blob([boxesToCsv()], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'garage-boxes.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    /* ---------- skeleton ---------- */

    function buildSkeleton() {
        root.className = 'gbx';
        root.innerHTML =
            '<div class="gbx-hero">' +
            '  <h2 class="gbx-headline">What’s in the box?</h2>' +
            '  <div class="gbx-meta" id="gbx-meta"></div>' +
            '</div>' +
            '<div class="gbx-searchwrap">' +
            '  <input class="gbx-search" id="gbx-search" placeholder="Search — try “tarp”, “LSU”, or “cord”">' +
            '  <button class="gbx-clear" id="gbx-clearbtn" title="Clear search" style="display:none;">✕</button>' +
            '</div>' +
            '<div class="gbx-results-note" id="gbx-note" style="display:none;"></div>' +
            '<div class="gbx-grid" id="gbx-grid"></div>' +
            '<div class="gbx-toolbar">' +
            '  <button class="gbx-addbox-icon" id="gbx-addbox" type="button" title="Add box" aria-label="Add box">+</button>' +
            '</div>' +
            '<div class="gbx-footer">Changes save automatically. Tap a box number to renumber, the name to rename, ⇄ to move an item, ✕ to remove it, an item’s text to edit it, and any photo to view it full-screen — in the viewer use the camera button to take a photo, the picture button to add one from your library, and the trash button to delete one.' +
            '<div class="gbx-footer-actions"><button class="gbx-addbox" id="gbx-downloadcsv" type="button">Download CSV</button></div></div>';

        grid = root.querySelector('#gbx-grid');
        meta = root.querySelector('#gbx-meta');
        note = root.querySelector('#gbx-note');
        searchInput = root.querySelector('#gbx-search');
        clearBtn = root.querySelector('#gbx-clearbtn');

        searchInput.addEventListener('input', () => {
            query = searchInput.value;
            clearBtn.style.display = query ? '' : 'none';
            renderGrid();
            renderNote();
        });
        clearBtn.addEventListener('click', clearSearch);
        root.querySelector('#gbx-addbox').addEventListener('click', addBox);
        root.querySelector('#gbx-downloadcsv').addEventListener('click', downloadCsv);
    }

    function clearSearch() {
        query = '';
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderGrid();
        renderNote();
    }

    /* ---------- rendering ---------- */

    /* Simple line-style icons (stroke only, inherit button color) */
    const ICONS = {
        camera: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
        trash: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
        image: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    };

    // A hidden file input + tile/button pair. `capture` launches the camera
    // directly (needed on Android, whose photo picker has no camera option);
    // without it the picker shows the photo library.
    function makePhotoInput(withCapture, onFile) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (withCapture) input.setAttribute('capture', 'environment');
        input.style.display = 'none';
        input.addEventListener('change', () => {
            if (input.files && input.files[0]) onFile(input.files[0]);
        });
        return input;
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function highlight(text, q) {
        const escaped = esc(text);
        if (!q) return escaped;
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) return escaped;
        return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' + esc(text.slice(idx + q.length));
    }

    function renderAll() {
        renderMeta();
        renderNote();
        renderGrid();
    }

    function renderMeta() {
        if (!meta || boxes === null) return;
        const totalItems = boxes.reduce((n, b) => n + b.items.length, 0);
        meta.textContent = boxes.length + ' boxes · ' + totalItems + ' items · ' + status;
    }

    function renderNote() {
        const q = query.trim().toLowerCase();
        if (!q) { note.style.display = 'none'; return; }
        const matchCount = boxes.reduce((n, b) => n + b.items.filter(it => it.toLowerCase().includes(q)).length, 0);
        const matchBoxes = matchingBoxes(q);
        note.style.display = '';
        note.innerHTML = '<span>' +
            (matchCount === 0 && matchBoxes.length === 0
                ? 'No matches — try a shorter word.'
                : 'Showing ' + matchBoxes.length + ' of ' + boxes.length + (boxes.length === 1 ? ' box' : ' boxes') +
                  ' · ' + matchCount + ' matching item' + (matchCount === 1 ? '' : 's')) +
            '</span><button class="gbx-clearsearch" type="button">Clear search — show all boxes</button>';
        note.querySelector('button').addEventListener('click', clearSearch);
    }

    function matchingBoxes(q) {
        return boxes.filter(b =>
            String(b.number).includes(q) ||
            b.label.toLowerCase().includes(q) ||
            b.items.some(it => it.toLowerCase().includes(q))
        );
    }

    function renderGrid() {
        if (boxes === null) return;
        const q = query.trim().toLowerCase();
        const sorted = boxes.slice().sort((a, b) => a.number - b.number);
        const matches = q ? matchingBoxes(q) : null;
        const visible = q ? sorted.filter(b => matches.some(m => m.id === b.id)) : sorted;

        grid.innerHTML = '';
        visible.forEach(box => grid.appendChild(renderCard(box, q)));
        renderMeta();
    }

    function uiIs(type, boxId, idx) {
        return ui && ui.type === type && ui.boxId === boxId && (idx === undefined || ui.idx === idx);
    }

    function setUi(next) {
        ui = next;
        renderGrid();
    }

    function renderCard(box, q) {
        const card = document.createElement('div');
        card.className = 'gbx-card';
        const photos = photosFor(box.id);

        /* head */
        const head = document.createElement('div');
        head.className = 'gbx-card-head';
        if (uiIs('editNum', box.id)) {
            const numInput = document.createElement('input');
            numInput.className = 'gbx-numinput';
            numInput.value = String(box.number);
            numInput.inputMode = 'numeric';
            numInput.addEventListener('input', () => {
                numInput.value = numInput.value.replace(/\D/g, '').slice(0, 3);
            });
            const commit = () => {
                const n = parseInt(numInput.value, 10);
                if (!isNaN(n)) { box.number = n; scheduleSave(); }
                setUi(null);
            };
            numInput.addEventListener('blur', commit);
            numInput.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
            head.appendChild(numInput);
            setTimeout(() => numInput.select(), 0);
        } else {
            const numBtn = document.createElement('button');
            numBtn.className = 'gbx-boxnum';
            numBtn.type = 'button';
            numBtn.title = 'Tap to change box number';
            numBtn.textContent = box.number;
            numBtn.addEventListener('click', () => setUi({ type: 'editNum', boxId: box.id }));
            head.appendChild(numBtn);
        }

        const headText = document.createElement('div');
        headText.style.cssText = 'flex:1;min-width:0;';
        let labelEl;
        if (uiIs('editLabel', box.id)) {
            labelEl = document.createElement('input');
            labelEl.className = 'gbx-label-edit';
            labelEl.value = box.label;
            labelEl.placeholder = 'Box name';
            const commitLabel = () => {
                const v = labelEl.value.trim();
                if (v && v !== box.label) { box.label = v; scheduleSave(); }
                setUi(null);
            };
            labelEl.addEventListener('blur', commitLabel);
            labelEl.addEventListener('keydown', e => {
                if (e.key === 'Enter') commitLabel();
                else if (e.key === 'Escape') setUi(null);
            });
            setTimeout(() => { labelEl.focus(); labelEl.select(); }, 0);
        } else {
            labelEl = document.createElement('div');
            labelEl.className = 'gbx-label' + (box.label ? '' : ' gbx-label-empty');
            labelEl.title = 'Tap to rename';
            if (box.label) labelEl.innerHTML = highlight(box.label, q);
            else labelEl.textContent = 'Box name';
            labelEl.addEventListener('click', () => setUi({ type: 'editLabel', boxId: box.id }));
        }
        const count = document.createElement('div');
        count.className = 'gbx-count';
        count.textContent =
            (box.items.length === 0 ? 'Empty' : box.items.length + (box.items.length === 1 ? ' item' : ' items')) +
            (photos.length ? ' · ' + photos.length + (photos.length === 1 ? ' photo' : ' photos') : '');
        headText.appendChild(labelEl);
        headText.appendChild(count);
        head.appendChild(headText);
        card.appendChild(head);

        if (box.note) {
            const noteEl = document.createElement('div');
            noteEl.className = 'gbx-note';
            noteEl.textContent = box.note;
            card.appendChild(noteEl);
        }

        /* items */
        const boxMatches = !q || matchingBoxes(q).some(m => m.id === box.id);
        if (box.items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'gbx-empty';
            empty.textContent = 'No items yet — add the first one below.';
            card.appendChild(empty);
        } else {
            const ul = document.createElement('ul');
            ul.className = 'gbx-items';
            box.items.forEach((item, i) => {
                ul.appendChild(renderItem(box, item, i, q, boxMatches));
            });
            card.appendChild(ul);
        }

        /* add row */
        const addRow = document.createElement('div');
        addRow.className = 'gbx-addrow';
        const addInput = document.createElement('input');
        addInput.className = 'gbx-addinput';
        addInput.placeholder = 'Add an item…';
        const addBtn = document.createElement('button');
        addBtn.className = 'gbx-addbtn';
        addBtn.type = 'button';
        addBtn.textContent = 'Add';
        addBtn.disabled = true;
        addInput.addEventListener('input', () => { addBtn.disabled = !addInput.value.trim(); });
        const commitAdd = () => {
            const v = addInput.value.trim();
            if (!v) return;
            box.items.push(v);
            scheduleSave();
            renderGrid();
        };
        addInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitAdd(); });
        addBtn.addEventListener('click', commitAdd);
        addRow.appendChild(addInput);
        addRow.appendChild(addBtn);
        card.appendChild(addRow);

        /* photo thumbnails (+ camera tile so photo-less boxes can get one) */
        const thumbs = document.createElement('div');
        thumbs.className = 'gbx-thumbs';
        photos.forEach((p, i) => {
            const b = document.createElement('button');
            b.className = 'gbx-thumb';
            b.type = 'button';
            b.setAttribute('aria-label', 'Open photo ' + (i + 1) + ' of Box ' + box.number);
            const img = document.createElement('img');
            img.src = p.local || p.src;
            img.alt = p.caption || 'Box ' + box.number + ' photo';
            img.loading = 'lazy';
            b.appendChild(img);
            b.addEventListener('click', () => openLightboxGbx(box.id, i));
            thumbs.appendChild(b);
        });
        const addTile = document.createElement('button');
        addTile.className = 'gbx-thumb gbx-thumb-add';
        addTile.type = 'button';
        addTile.title = 'Add photos';
        addTile.setAttribute('aria-label', 'Add photos of Box ' + box.number);
        addTile.innerHTML = ICONS.camera;
        addTile.addEventListener('click', () => openLightboxGbx(box.id, 0));
        thumbs.appendChild(addTile);
        card.appendChild(thumbs);

        /* footer: delete box */
        const foot = document.createElement('div');
        foot.className = 'gbx-card-foot';
        if (uiIs('confirmBox', box.id)) {
            const span = document.createElement('span');
            span.className = 'gbx-confirm';
            span.textContent = 'Delete Box ' + box.number + (box.items.length ? ' and its ' + box.items.length + ' items' : '') + '?';
            const yes = document.createElement('button');
            yes.className = 'gbx-confirm-yes';
            yes.type = 'button';
            yes.textContent = 'Delete';
            yes.addEventListener('click', () => {
                boxes = boxes.filter(b => b.id !== box.id);
                if (lightbox && lightbox.boxId === box.id) closeLightboxGbx();
                scheduleSave();
                setUi(null);
            });
            const no = document.createElement('button');
            no.className = 'gbx-confirm-no';
            no.type = 'button';
            no.textContent = 'Keep';
            no.addEventListener('click', () => setUi(null));
            foot.appendChild(span);
            foot.appendChild(yes);
            foot.appendChild(no);
        } else {
            const del = document.createElement('button');
            del.className = 'gbx-delbox';
            del.type = 'button';
            del.textContent = 'Delete box';
            del.addEventListener('click', () => setUi({ type: 'confirmBox', boxId: box.id }));
            foot.appendChild(del);
        }
        card.appendChild(foot);

        return card;
    }

    function renderItem(box, item, i, q, boxMatches) {
        const li = document.createElement('li');
        li.style.listStyle = 'none';
        const row = document.createElement('div');
        const itemMatches = !q || item.toLowerCase().includes(q);
        row.className = 'gbx-item' + (q && boxMatches && !itemMatches ? ' gbx-nomatch' : '');

        if (uiIs('editItem', box.id, i)) {
            const input = document.createElement('input');
            input.className = 'gbx-item-edit';
            input.value = item;
            const commit = () => {
                const v = input.value.trim();
                if (v && v !== item) { box.items[i] = v; scheduleSave(); }
                setUi(null);
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') commit();
                else if (e.key === 'Escape') setUi(null);
            });
            row.appendChild(input);
            setTimeout(() => { input.focus(); input.select(); }, 0);
        } else {
            const span = document.createElement('span');
            span.className = 'gbx-item-text';
            span.title = 'Tap to edit';
            span.innerHTML = highlight(item, q);
            span.addEventListener('click', () => setUi({ type: 'editItem', boxId: box.id, idx: i }));
            row.appendChild(span);
        }

        const moveBtn = document.createElement('button');
        moveBtn.className = 'gbx-iconbtn gbx-move';
        moveBtn.type = 'button';
        moveBtn.title = 'Move to another box';
        moveBtn.textContent = '⇄';
        moveBtn.addEventListener('click', () =>
            setUi(uiIs('move', box.id, i) ? null : { type: 'move', boxId: box.id, idx: i }));
        row.appendChild(moveBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'gbx-iconbtn gbx-del';
        delBtn.type = 'button';
        delBtn.title = 'Remove item';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () =>
            setUi(uiIs('confirmItem', box.id, i) ? null : { type: 'confirmItem', boxId: box.id, idx: i }));
        row.appendChild(delBtn);

        li.appendChild(row);

        if (uiIs('confirmItem', box.id, i)) {
            const confirmRow = document.createElement('div');
            confirmRow.className = 'gbx-moverow';
            const label = document.createElement('span');
            label.textContent = 'Remove “' + (item.length > 34 ? item.slice(0, 34) + '…' : item) + '”?';
            const yes = document.createElement('button');
            yes.className = 'gbx-confirm-yes';
            yes.type = 'button';
            yes.textContent = 'Remove';
            yes.addEventListener('click', () => {
                box.items.splice(i, 1);
                scheduleSave();
                setUi(null);
            });
            const no = document.createElement('button');
            no.className = 'gbx-movecancel';
            no.type = 'button';
            no.textContent = 'Keep';
            no.addEventListener('click', () => setUi(null));
            confirmRow.appendChild(label);
            confirmRow.appendChild(yes);
            confirmRow.appendChild(no);
            li.appendChild(confirmRow);
        }

        if (uiIs('move', box.id, i)) {
            const moveRow = document.createElement('div');
            moveRow.className = 'gbx-moverow';
            const label = document.createElement('span');
            label.textContent = 'Move to:';
            moveRow.appendChild(label);
            boxes.filter(b => b.id !== box.id).sort((a, b) => a.number - b.number).forEach(target => {
                const chip = document.createElement('button');
                chip.className = 'gbx-movechip';
                chip.type = 'button';
                chip.textContent = '#' + target.number;
                chip.addEventListener('click', () => {
                    box.items.splice(i, 1);
                    target.items.push(item);
                    scheduleSave();
                    setUi(null);
                });
                moveRow.appendChild(chip);
            });
            const cancel = document.createElement('button');
            cancel.className = 'gbx-movecancel';
            cancel.type = 'button';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => setUi(null));
            moveRow.appendChild(cancel);
            li.appendChild(moveRow);
        }

        return li;
    }

    function addBox() {
        const nextNum = boxes.length ? Math.max.apply(null, boxes.map(b => b.number)) + 1 : 1;
        boxes.push({ id: 'box_' + Date.now(), number: nextNum, label: 'New box', note: '', items: [] });
        scheduleSave();
        renderGrid();
    }

    /* ---------- lightbox ---------- */

    let lbEl = null;
    let lbKeyHandler = null;
    let lbBusy = false;
    let lbStatus = '';
    let lbNeedToken = false;
    // Post-capture AI analysis of the new photo:
    // { boxId, index, base64, phase: 'needkey'|'running'|'review'|'error', caption, items, error }
    let lbAnalysis = null;

    function openLightboxGbx(boxId, index) {
        lightbox = { boxId: boxId, index: index };
        lbStatus = '';
        lbNeedToken = false;
        lbAnalysis = null;
        renderLightbox();
    }

    function closeLightboxGbx() {
        lightbox = null;
        lbStatus = '';
        lbNeedToken = false;
        lbAnalysis = null;
        if (lbEl) { lbEl.remove(); lbEl = null; }
        if (lbKeyHandler) { document.removeEventListener('keydown', lbKeyHandler); lbKeyHandler = null; }
        document.body.style.overflow = '';
    }

    function renderLightbox() {
        if (lbEl) { lbEl.remove(); lbEl = null; }
        if (lbKeyHandler) { document.removeEventListener('keydown', lbKeyHandler); lbKeyHandler = null; }
        if (!lightbox) return;
        const box = boxes.find(b => b.id === lightbox.boxId);
        const photos = photosFor(lightbox.boxId);
        if (!box) { closeLightboxGbx(); return; }
        const index = photos.length ? Math.min(lightbox.index, photos.length - 1) : 0;
        const photo = photos.length ? photos[index] : null;

        lbEl = document.createElement('div');
        lbEl.className = 'gbx gbx-modal';
        lbEl.setAttribute('role', 'dialog');
        lbEl.setAttribute('aria-modal', 'true');

        const top = document.createElement('div');
        top.className = 'gbx-modal-top';
        top.innerHTML =
            '<div class="gbx-modal-titles"><div class="gbx-modal-title">Box ' + esc(box.number) + ' · ' + esc(box.label) + '</div>' +
            '<div class="gbx-modal-counter">' +
            (photo
                ? 'Photo ' + (index + 1) + ' of ' + photos.length + (photo.caption ? ' — ' + esc(photo.caption) : '')
                : 'No photos yet') + '</div>' +
            (lbStatus ? '<div class="gbx-modal-status">' + esc(lbStatus) + '</div>' : '') +
            '</div>';

        const actions = document.createElement('div');
        actions.className = 'gbx-modal-actions';

        const camInput = makePhotoInput(true, f => addPhotoToBox(box, f));
        const libInput = makePhotoInput(false, f => addPhotoToBox(box, f));

        const addBtn = document.createElement('button');
        addBtn.className = 'gbx-modal-close gbx-modal-addphoto';
        addBtn.type = 'button';
        addBtn.title = 'Take a photo and add it to this box';
        addBtn.setAttribute('aria-label', 'Take a photo');
        addBtn.innerHTML = ICONS.camera;
        addBtn.disabled = lbBusy;
        addBtn.addEventListener('click', () => {
            if (!ensureToken()) return;
            camInput.click();
        });

        const libBtn = document.createElement('button');
        libBtn.className = 'gbx-modal-close gbx-modal-addphoto';
        libBtn.type = 'button';
        libBtn.title = 'Add a photo from the library';
        libBtn.setAttribute('aria-label', 'Add a photo from the library');
        libBtn.innerHTML = ICONS.image;
        libBtn.disabled = lbBusy;
        libBtn.addEventListener('click', () => {
            if (!ensureToken()) return;
            libInput.click();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'gbx-modal-close gbx-modal-delphoto';
        delBtn.type = 'button';
        delBtn.title = 'Delete this photo';
        delBtn.setAttribute('aria-label', 'Delete photo');
        delBtn.innerHTML = ICONS.trash;
        delBtn.disabled = lbBusy || !photo;
        delBtn.addEventListener('click', () => deletePhotoFromBox(box, index));

        const closeBtn = document.createElement('button');
        closeBtn.className = 'gbx-modal-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', closeLightboxGbx);

        actions.appendChild(addBtn);
        actions.appendChild(libBtn);
        actions.appendChild(delBtn);
        actions.appendChild(closeBtn);
        actions.appendChild(camInput);
        actions.appendChild(libInput);
        top.appendChild(actions);
        lbEl.appendChild(top);

        if (lbNeedToken) {
            const panel = document.createElement('div');
            panel.className = 'gbx-modal-tokenpanel';
            const msg = document.createElement('p');
            msg.textContent = 'To save photos from this device, paste a GitHub token once. ' +
                'Create a fine-grained token at github.com → Settings → Developer settings, ' +
                'scoped to TimMooreDotNet with Contents: Read and write.';
            const row = document.createElement('div');
            row.className = 'gbx-modal-tokenrow';
            const tokenInput = document.createElement('input');
            tokenInput.type = 'password';
            tokenInput.placeholder = 'github_pat_…';
            tokenInput.autocomplete = 'off';
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.textContent = 'Save';
            const commitToken = () => {
                const t = tokenInput.value.trim();
                if (!t) return;
                localStorage.setItem(TOKEN_KEY, t);
                lbNeedToken = false;
                lbStatus = 'Token saved — tap the camera or upload button again.';
                status = 'Token saved on this device';
                renderMeta();
                renderLightbox();
            };
            saveBtn.addEventListener('click', commitToken);
            tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitToken(); });
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => { lbNeedToken = false; renderLightbox(); });
            row.appendChild(tokenInput);
            row.appendChild(saveBtn);
            row.appendChild(cancelBtn);
            panel.appendChild(msg);
            panel.appendChild(row);
            lbEl.appendChild(panel);
            setTimeout(() => tokenInput.focus(), 0);
        }

        const stage = document.createElement('div');
        stage.className = 'gbx-modal-stage';
        const showIndex = (i) => { lightbox.index = i; renderLightbox(); };
        const prev = () => { if (index > 0) showIndex(index - 1); };
        const next = () => { if (index < photos.length - 1) showIndex(index + 1); };

        if (photos.length > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.className = 'gbx-modal-arrow gbx-modal-prev';
            prevBtn.type = 'button';
            prevBtn.disabled = index === 0;
            prevBtn.setAttribute('aria-label', 'Previous photo');
            prevBtn.textContent = '‹';
            prevBtn.addEventListener('click', prev);
            stage.appendChild(prevBtn);
        }
        if (photo) {
            const img = document.createElement('img');
            img.className = 'gbx-modal-img';
            img.src = photo.local || photo.src;
            img.alt = photo.caption || box.label;
            stage.appendChild(img);
        } else {
            const empty = document.createElement('div');
            empty.className = 'gbx-modal-empty';
            const msg = document.createElement('p');
            msg.textContent = 'No photos of this box yet.';
            empty.appendChild(msg);
            const btnRow = document.createElement('div');
            btnRow.className = 'gbx-modal-emptybtns';
            const takeBtn = document.createElement('button');
            takeBtn.type = 'button';
            takeBtn.className = 'gbx-modal-bigbtn';
            takeBtn.innerHTML = ICONS.camera + '<span>Take a photo</span>';
            takeBtn.addEventListener('click', () => {
                if (!ensureToken()) return;
                camInput.click();
            });
            const uploadBtn = document.createElement('button');
            uploadBtn.type = 'button';
            uploadBtn.className = 'gbx-modal-bigbtn';
            uploadBtn.innerHTML = ICONS.image + '<span>Upload a photo</span>';
            uploadBtn.addEventListener('click', () => {
                if (!ensureToken()) return;
                libInput.click();
            });
            btnRow.appendChild(takeBtn);
            btnRow.appendChild(uploadBtn);
            empty.appendChild(btnRow);
            stage.appendChild(empty);
        }
        if (photos.length > 1) {
            const nextBtn = document.createElement('button');
            nextBtn.className = 'gbx-modal-arrow gbx-modal-next';
            nextBtn.type = 'button';
            nextBtn.disabled = index === photos.length - 1;
            nextBtn.setAttribute('aria-label', 'Next photo');
            nextBtn.textContent = '›';
            nextBtn.addEventListener('click', next);
            stage.appendChild(nextBtn);
        }
        stage.addEventListener('click', e => { if (e.target === stage) closeLightboxGbx(); });

        // touch swipe
        let touchX = null, touchDX = 0;
        stage.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; touchDX = 0; }, { passive: true });
        stage.addEventListener('touchmove', e => { if (touchX !== null) touchDX = e.touches[0].clientX - touchX; }, { passive: true });
        stage.addEventListener('touchend', () => {
            if (Math.abs(touchDX) > 48) { if (touchDX < 0) next(); else prev(); }
            touchX = null; touchDX = 0;
        });
        lbEl.appendChild(stage);

        if (photos.length > 1) {
            const bottom = document.createElement('div');
            bottom.className = 'gbx-modal-bottom';
            photos.forEach((p, i) => {
                const t = document.createElement('button');
                t.className = 'gbx-modal-dotthumb' + (i === index ? ' gbx-active' : '');
                t.type = 'button';
                t.setAttribute('aria-label', 'Photo ' + (i + 1));
                const ti = document.createElement('img');
                ti.src = p.local || p.src;
                ti.alt = '';
                t.appendChild(ti);
                t.addEventListener('click', () => showIndex(i));
                bottom.appendChild(t);
            });
            lbEl.appendChild(bottom);
        }

        if (lbAnalysis && lbAnalysis.boxId === lightbox.boxId) {
            lbEl.appendChild(renderAnalysisPanel(box));
        }

        lbKeyHandler = (e) => {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
            if (e.key === 'Escape') closeLightboxGbx();
            else if (e.key === 'ArrowLeft') prev();
            else if (e.key === 'ArrowRight') next();
        };
        document.addEventListener('keydown', lbKeyHandler);
        document.body.style.overflow = 'hidden';
        document.body.appendChild(lbEl);
    }

    /* ---------- photo add / delete (from the lightbox) ---------- */

    // Decode, downscale, and re-encode a captured photo as JPEG base64.
    function fileToJpegBase64(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (!w || !h) { reject(new Error('empty image')); return; }
                if (w > MAX_PHOTO_DIMENSION || h > MAX_PHOTO_DIMENSION) {
                    const scale = MAX_PHOTO_DIMENSION / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                try {
                    resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1]);
                } catch (e) {
                    reject(new Error('could not encode image'));
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('could not read image — HEIC is not supported, use JPG/PNG'));
            };
            img.src = url;
        });
    }

    async function addPhotoToBox(box, file) {
        if (lbBusy) return;
        lbBusy = true;
        lbStatus = 'Uploading photo…';
        lbAnalysis = null;
        if (lightbox) renderLightbox();
        else { status = 'Uploading photo…'; renderMeta(); }
        try {
            const base64 = await fileToJpegBase64(file);
            const filename = String(box.id).replace(/[^a-zA-Z0-9_-]/g, '') + '-' + Date.now() + '.jpg';
            const path = PHOTOS_DIR + '/' + filename;
            await ghPutBase64(path, base64, 'Add garage photo ' + filename);
            const photos = photosFor(box.id);
            photos.push({ src: path, caption: '', local: 'data:image/jpeg;base64,' + base64 });
            await savePhotoMap('Add ' + filename + ' to garage photos');
            // Open (or move) the viewer onto the new photo, then offer AI analysis.
            lightbox = { boxId: box.id, index: photos.length - 1 };
            status = 'Saved';
            lbStatus = 'Photo added — other devices update in about a minute.';
            lbAnalysis = {
                boxId: box.id,
                index: photos.length - 1,
                base64: base64,
                phase: localStorage.getItem(ANTHROPIC_KEY_KEY) ? 'running' : 'needkey',
                caption: '',
                items: '',
                error: ''
            };
        } catch (err) {
            lbStatus = authErrorMessage(err) || ('Could not add photo: ' + err.message);
            if (!lightbox) status = lbStatus;
        }
        lbBusy = false;
        renderLightbox();
        renderGrid();
        if (lbAnalysis && lbAnalysis.phase === 'running') runPhotoAnalysis(box);
    }

    async function deletePhotoFromBox(box, index) {
        if (lbBusy) return;
        if (!ensureToken()) return;
        const photos = photosFor(box.id);
        const photo = photos[index];
        if (!photo) return;
        if (!confirm('Delete this photo? This cannot be undone.')) return;
        lbBusy = true;
        lbStatus = 'Deleting photo…';
        lbAnalysis = null;
        renderLightbox();
        try {
            await ghDeleteFile(photo.src, 'Delete garage photo ' + photo.src.split('/').pop());
            photos.splice(index, 1);
            await savePhotoMap('Remove a garage photo');
            lbStatus = '';
            if (lightbox) lightbox.index = Math.min(index, Math.max(0, photos.length - 1));
        } catch (err) {
            lbStatus = authErrorMessage(err) || ('Could not delete photo: ' + err.message);
        }
        lbBusy = false;
        renderLightbox();
        renderGrid();
    }

    /* ---------- AI photo analysis ---------- */

    async function runPhotoAnalysis(box) {
        const a = lbAnalysis;
        if (!a) return;
        a.phase = 'running';
        a.error = '';
        renderLightbox();
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': localStorage.getItem(ANTHROPIC_KEY_KEY),
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-opus-4-8',
                    max_tokens: 1024,
                    output_config: {
                        format: {
                            type: 'json_schema',
                            schema: {
                                type: 'object',
                                properties: {
                                    caption: { type: 'string', description: 'Short caption for the photo, under 8 words' },
                                    items: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Distinct physical items visible in the photo, as short inventory names'
                                    }
                                },
                                required: ['caption', 'items'],
                                additionalProperties: false
                            }
                        }
                    },
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: a.base64 } },
                            {
                                type: 'text',
                                text: 'This photo shows the contents of garage storage bin #' + box.number +
                                    (box.label ? ' ("' + box.label + '")' : '') +
                                    '. List the distinct physical items visible, using short names suitable for an inventory list, and write a short caption for the photo.'
                            }
                        ]
                    }]
                })
            });
            if (res.status === 401) {
                // Stored key is invalid or revoked — drop it and re-show the key panel.
                localStorage.removeItem(ANTHROPIC_KEY_KEY);
                if (lbAnalysis === a) { a.phase = 'needkey'; renderLightbox(); }
                return;
            }
            if (!res.ok) {
                let msg = 'API error ' + res.status;
                try {
                    const body = await res.json();
                    if (body.error && body.error.message) msg = body.error.message;
                } catch (e) { /* keep status message */ }
                throw new Error(msg);
            }
            const data = await res.json();
            if (data.stop_reason === 'refusal') throw new Error('the model declined to analyze this image');
            const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
            const parsed = JSON.parse(text);
            if (!lbAnalysis || lbAnalysis !== a) return; // panel was dismissed meanwhile
            a.caption = parsed.caption || '';
            a.items = (parsed.items || []).join('\n');
            a.phase = 'review';
        } catch (err) {
            if (!lbAnalysis || lbAnalysis !== a) return;
            a.error = err.message;
            a.phase = 'error';
        }
        renderLightbox();
    }

    async function saveAnalysis(box) {
        const a = lbAnalysis;
        if (!a) return;
        const photos = photosFor(box.id);
        const photo = photos[a.index];
        const caption = a.caption.trim();
        const items = a.items.split('\n').map(s => s.trim()).filter(Boolean);
        lbAnalysis = null;
        if (items.length) {
            items.forEach(it => box.items.push(it));
            scheduleSave();
        }
        lbStatus = items.length
            ? items.length + (items.length === 1 ? ' item' : ' items') + ' added to Box ' + box.number + '.'
            : 'Saved.';
        renderLightbox();
        renderGrid();
        if (photo && caption && caption !== (photo.caption || '')) {
            photo.caption = caption;
            try {
                await savePhotoMap('Caption garage photo');
            } catch (err) {
                lbStatus = 'Caption sync failed: ' + err.message;
            }
            renderLightbox();
        }
    }

    function renderAnalysisPanel(box) {
        const a = lbAnalysis;
        const panel = document.createElement('div');
        panel.className = 'gbx-modal-panel';

        const dismiss = (label) => {
            const b = document.createElement('button');
            b.className = 'gbx-modal-panel-cancel';
            b.type = 'button';
            b.textContent = label;
            b.addEventListener('click', () => { lbAnalysis = null; renderLightbox(); });
            return b;
        };

        if (a.phase === 'needkey') {
            panel.innerHTML =
                '<h3>Analyze this photo with AI?</h3>' +
                '<p class="gbx-modal-panel-note">Paste an Anthropic API key to auto-identify the items in new photos. The key is stored only on this device.</p>';
            const keyInput = document.createElement('input');
            keyInput.type = 'password';
            keyInput.placeholder = 'sk-ant-…';
            keyInput.autocomplete = 'off';
            panel.appendChild(keyInput);
            const btns = document.createElement('div');
            btns.className = 'gbx-modal-panel-btns';
            const go = document.createElement('button');
            go.className = 'gbx-modal-panel-save';
            go.type = 'button';
            go.textContent = 'Save key & analyze';
            go.addEventListener('click', () => {
                const k = keyInput.value.trim();
                if (!k) return;
                localStorage.setItem(ANTHROPIC_KEY_KEY, k);
                runPhotoAnalysis(box);
            });
            btns.appendChild(go);
            btns.appendChild(dismiss('Skip'));
            panel.appendChild(btns);
            return panel;
        }

        if (a.phase === 'running') {
            panel.innerHTML = '<h3>Analyzing photo…</h3><p class="gbx-modal-panel-note">Asking AI what’s in this photo.</p>';
            const btns = document.createElement('div');
            btns.className = 'gbx-modal-panel-btns';
            btns.appendChild(dismiss('Cancel'));
            panel.appendChild(btns);
            return panel;
        }

        if (a.phase === 'error') {
            panel.innerHTML = '<h3>Analysis failed</h3><p class="gbx-modal-panel-note">' + esc(a.error) + '</p>';
            const btns = document.createElement('div');
            btns.className = 'gbx-modal-panel-btns';
            const retry = document.createElement('button');
            retry.className = 'gbx-modal-panel-save';
            retry.type = 'button';
            retry.textContent = 'Retry';
            retry.addEventListener('click', () => runPhotoAnalysis(box));
            btns.appendChild(retry);
            btns.appendChild(dismiss('Dismiss'));
            panel.appendChild(btns);
            return panel;
        }

        // phase === 'review'
        panel.innerHTML =
            '<h3>AI photo analysis — is this accurate?</h3>' +
            '<p class="gbx-modal-panel-note">Edit the caption and items below, then save. Each line becomes an item in Box ' + esc(box.number) + '.</p>';
        const capLabel = document.createElement('label');
        capLabel.textContent = 'Photo caption';
        const capInput = document.createElement('input');
        capInput.type = 'text';
        capInput.value = a.caption;
        capInput.addEventListener('input', () => { a.caption = capInput.value; });
        const itemsLabel = document.createElement('label');
        itemsLabel.textContent = 'Detected items (one per line)';
        const itemsArea = document.createElement('textarea');
        itemsArea.value = a.items;
        itemsArea.addEventListener('input', () => { a.items = itemsArea.value; });
        panel.appendChild(capLabel);
        panel.appendChild(capInput);
        panel.appendChild(itemsLabel);
        panel.appendChild(itemsArea);
        const btns = document.createElement('div');
        btns.className = 'gbx-modal-panel-btns';
        const save = document.createElement('button');
        save.className = 'gbx-modal-panel-save';
        save.type = 'button';
        save.textContent = 'Save to box';
        save.addEventListener('click', () => saveAnalysis(box));
        btns.appendChild(save);
        btns.appendChild(dismiss('Discard'));
        panel.appendChild(btns);
        return panel;
    }
})();
