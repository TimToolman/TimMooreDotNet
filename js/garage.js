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
    const TOKEN_KEY = 'ghPhotoToken';
    const LS_KEY = 'garage-box-inventory-v1';
    const API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;

    let boxes = null;
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
        renderAll();
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
            const base64 = btoa(unescape(encodeURIComponent(json)));
            const headers = {
                Authorization: 'Bearer ' + localStorage.getItem(TOKEN_KEY),
                Accept: 'application/vnd.github+json'
            };
            let sha;
            const getRes = await fetch(API + '/contents/' + DATA_PATH + '?ref=' + BRANCH, { headers: headers });
            if (getRes.ok) sha = (await getRes.json()).sha;
            const payload = { message: 'Update garage boxes', content: base64, branch: BRANCH };
            if (sha) payload.sha = sha;
            const putRes = await fetch(API + '/contents/' + DATA_PATH, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(payload)
            });
            if (!putRes.ok) throw new Error('GitHub ' + putRes.status);
            status = 'Saved';
        } catch (err) {
            status = 'Saved on this device — sync failed (' + err.message + ')';
        } finally {
            ghSaving = false;
            renderMeta();
            if (ghDirty) { ghDirty = false; ghSave(); }
        }
    }

    /* ---------- skeleton ---------- */

    function buildSkeleton() {
        root.className = 'gbx';
        root.innerHTML =
            '<div class="gbx-hero">' +
            '  <div class="gbx-eyebrow">Metairie garage</div>' +
            '  <h2 class="gbx-headline">What’s in the box?</h2>' +
            '  <p class="gbx-subhead">Search everything at once, tap a photo to see inside, and edit as things move.</p>' +
            '  <div class="gbx-meta" id="gbx-meta"></div>' +
            '</div>' +
            '<div class="gbx-searchwrap">' +
            '  <input class="gbx-search" id="gbx-search" placeholder="Search — try “tarp”, “LSU”, or “cord”">' +
            '  <button class="gbx-clear" id="gbx-clearbtn" title="Clear search" style="display:none;">✕</button>' +
            '</div>' +
            '<div class="gbx-results-note" id="gbx-note" style="display:none;"></div>' +
            '<div class="gbx-toolbar"><button class="gbx-addbox" id="gbx-addbox" type="button">+ Add box</button></div>' +
            '<div class="gbx-grid" id="gbx-grid"></div>' +
            '<div class="gbx-footer">Changes save automatically. Tap a box number to renumber, the name to rename, ⇄ to move an item, ✕ to remove it, an item’s text to edit it, and any photo to view it full-screen.</div>';

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
    }

    function clearSearch() {
        query = '';
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderGrid();
        renderNote();
    }

    /* ---------- rendering ---------- */

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
        const photos = (typeof GARAGE_PHOTOS !== 'undefined' && GARAGE_PHOTOS[box.id]) || [];

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
        const labelInput = document.createElement('input');
        labelInput.className = 'gbx-label';
        labelInput.value = box.label;
        labelInput.placeholder = 'Box name';
        labelInput.addEventListener('input', () => {
            box.label = labelInput.value;
            scheduleSave();
        });
        const count = document.createElement('div');
        count.className = 'gbx-count';
        count.textContent =
            (box.items.length === 0 ? 'Empty' : box.items.length + (box.items.length === 1 ? ' item' : ' items')) +
            (photos.length ? ' · ' + photos.length + (photos.length === 1 ? ' photo' : ' photos') : '');
        headText.appendChild(labelInput);
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

        /* photo thumbnails */
        if (photos.length) {
            const thumbs = document.createElement('div');
            thumbs.className = 'gbx-thumbs';
            photos.forEach((p, i) => {
                const b = document.createElement('button');
                b.className = 'gbx-thumb';
                b.type = 'button';
                b.setAttribute('aria-label', 'Open photo ' + (i + 1) + ' of Box ' + box.number);
                const img = document.createElement('img');
                img.src = p.src;
                img.alt = p.caption || 'Box ' + box.number + ' photo';
                img.loading = 'lazy';
                b.appendChild(img);
                b.addEventListener('click', () => openLightboxGbx(box.id, i));
                thumbs.appendChild(b);
            });
            card.appendChild(thumbs);
        }

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

    function openLightboxGbx(boxId, index) {
        lightbox = { boxId: boxId, index: index };
        renderLightbox();
    }

    function closeLightboxGbx() {
        lightbox = null;
        if (lbEl) { lbEl.remove(); lbEl = null; }
        if (lbKeyHandler) { document.removeEventListener('keydown', lbKeyHandler); lbKeyHandler = null; }
        document.body.style.overflow = '';
    }

    function renderLightbox() {
        if (lbEl) { lbEl.remove(); lbEl = null; }
        if (lbKeyHandler) { document.removeEventListener('keydown', lbKeyHandler); lbKeyHandler = null; }
        if (!lightbox) return;
        const box = boxes.find(b => b.id === lightbox.boxId);
        const photos = (typeof GARAGE_PHOTOS !== 'undefined' && GARAGE_PHOTOS[lightbox.boxId]) || [];
        if (!box || !photos.length) { closeLightboxGbx(); return; }
        const index = Math.min(lightbox.index, photos.length - 1);
        const photo = photos[index];

        lbEl = document.createElement('div');
        lbEl.className = 'gbx gbx-modal';
        lbEl.setAttribute('role', 'dialog');
        lbEl.setAttribute('aria-modal', 'true');

        const top = document.createElement('div');
        top.className = 'gbx-modal-top';
        top.innerHTML =
            '<div><div class="gbx-modal-title">Box ' + esc(box.number) + ' · ' + esc(box.label) + '</div>' +
            '<div class="gbx-modal-counter">Photo ' + (index + 1) + ' of ' + photos.length +
            (photo.caption ? ' — ' + esc(photo.caption) : '') + '</div></div>';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'gbx-modal-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', closeLightboxGbx);
        top.appendChild(closeBtn);
        lbEl.appendChild(top);

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
        const img = document.createElement('img');
        img.className = 'gbx-modal-img';
        img.src = photo.src;
        img.alt = photo.caption || box.label;
        stage.appendChild(img);
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
                ti.src = p.src;
                ti.alt = '';
                t.appendChild(ti);
                t.addEventListener('click', () => showIndex(i));
                bottom.appendChild(t);
            });
            lbEl.appendChild(bottom);
        }

        lbKeyHandler = (e) => {
            if (e.key === 'Escape') closeLightboxGbx();
            else if (e.key === 'ArrowLeft') prev();
            else if (e.key === 'ArrowRight') next();
        };
        document.addEventListener('keydown', lbKeyHandler);
        document.body.style.overflow = 'hidden';
        document.body.appendChild(lbEl);
    }
})();
