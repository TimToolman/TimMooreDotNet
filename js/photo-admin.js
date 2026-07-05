/**
 * Photo Admin - add, delete, and reorder photos from any device (dashboard only).
 *
 * The site is static (GitHub Pages), so changes are saved by committing to the
 * repo through the GitHub API. A fine-grained personal access token (scoped to
 * this repo, Contents: read/write) is pasted once per device and kept in
 * localStorage — it is never committed to the repo.
 */

(function () {
    const OWNER = 'TimToolman';
    const REPO = 'TimMooreDotNet';
    const BRANCH = 'main';
    const PHOTOS_PATH = 'images/photos';
    const MANIFEST_PATH = PHOTOS_PATH + '/manifest.json';
    const TOKEN_KEY = 'ghPhotoToken';
    const API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
    const MAX_DIMENSION = 1920;
    const JPEG_QUALITY = 0.85;

    let managing = false;
    let orderDirty = false;
    let busy = false;

    let manageBtn, addBtn, saveOrderBtn, fileInput, statusEl, tokenPanel, tokenInput, tokenSaveBtn, grid;

    document.addEventListener('DOMContentLoaded', () => {
        manageBtn = document.getElementById('manage-photos-btn');
        addBtn = document.getElementById('add-photos-btn');
        saveOrderBtn = document.getElementById('save-order-btn');
        fileInput = document.getElementById('photo-file-input');
        statusEl = document.getElementById('photo-admin-status');
        tokenPanel = document.getElementById('photo-token-panel');
        tokenInput = document.getElementById('photo-token-input');
        tokenSaveBtn = document.getElementById('photo-token-save');
        grid = document.getElementById('gallery-grid');

        if (!manageBtn) return; // not on the dashboard

        manageBtn.addEventListener('click', toggleManage);
        addBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) uploadFiles(Array.from(fileInput.files));
        });
        saveOrderBtn.addEventListener('click', saveOrder);
        tokenSaveBtn.addEventListener('click', saveToken);
    });

    window.photoAdmin = {
        isManaging: () => managing,
        onGalleryRendered: decorateGallery
    };

    /* ---------- mode + token ---------- */

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || '';
    }

    function toggleManage() {
        if (managing) {
            exitManage();
            return;
        }
        if (!getToken()) {
            tokenPanel.style.display = tokenPanel.style.display === 'none' ? 'block' : 'none';
            return;
        }
        enterManage();
    }

    async function saveToken() {
        const token = tokenInput.value.trim();
        if (!token) return;
        showStatus('Checking token…');
        try {
            const res = await fetch(API, {
                headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
            });
            if (!res.ok) throw new Error('GitHub said ' + res.status + '. Check the token and its permissions.');
            localStorage.setItem(TOKEN_KEY, token);
            tokenInput.value = '';
            tokenPanel.style.display = 'none';
            showStatus('Token saved on this device.', false, 3000);
            enterManage();
        } catch (err) {
            showStatus('Token check failed: ' + err.message, true);
        }
    }

    function enterManage() {
        managing = true;
        tokenPanel.style.display = 'none';
        manageBtn.textContent = 'Done';
        addBtn.style.display = '';
        decorateGallery();
    }

    function exitManage() {
        if (orderDirty && !confirm('You have unsaved order changes. Leave without saving?')) return;
        managing = false;
        orderDirty = false;
        manageBtn.textContent = 'Manage Photos';
        addBtn.style.display = 'none';
        saveOrderBtn.style.display = 'none';
        tokenPanel.style.display = 'none';
        renderGallery();
    }

    /* ---------- gallery decoration (edit controls) ---------- */

    function decorateGallery() {
        if (!managing || !grid) return;
        Array.from(grid.children).forEach((item, index) => {
            item.classList.add('managing');
            const controls = document.createElement('div');
            controls.className = 'photo-edit-controls';
            controls.innerHTML =
                '<button type="button" class="photo-edit-btn" data-action="left" aria-label="Move earlier">&#9664;</button>' +
                '<button type="button" class="photo-edit-btn photo-edit-delete" data-action="delete" aria-label="Delete photo">&#10005;</button>' +
                '<button type="button" class="photo-edit-btn" data-action="right" aria-label="Move later">&#9654;</button>';
            controls.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                e.stopPropagation();
                if (busy) return;
                const action = btn.dataset.action;
                if (action === 'delete') deletePhoto(index);
                if (action === 'left') movePhoto(index, -1);
                if (action === 'right') movePhoto(index, 1);
            });
            item.appendChild(controls);
        });
    }

    function movePhoto(index, delta) {
        const target = index + delta;
        if (target < 0 || target >= galleryImages.length) return;
        const tmp = galleryImages[index];
        galleryImages[index] = galleryImages[target];
        galleryImages[target] = tmp;
        orderDirty = true;
        saveOrderBtn.style.display = '';
        renderGallery();
    }

    async function saveOrder() {
        if (busy) return;
        busy = true;
        showStatus('Saving order…');
        try {
            await saveManifest('Reorder photos');
            orderDirty = false;
            saveOrderBtn.style.display = 'none';
            showStatus('Order saved. The live site updates in about a minute.', false, 5000);
        } catch (err) {
            showStatus('Could not save order: ' + err.message, true);
        } finally {
            busy = false;
        }
    }

    /* ---------- add ---------- */

    async function uploadFiles(files) {
        if (busy) return;
        busy = true;
        let uploaded = 0;
        try {
            for (let i = 0; i < files.length; i++) {
                showStatus('Uploading ' + (i + 1) + ' of ' + files.length + '…');
                const file = files[i];
                let blob;
                try {
                    blob = await resizeImage(file);
                } catch (err) {
                    showStatus('Skipped ' + file.name + ' (could not read image — HEIC is not supported, use JPG/PNG).', true, 6000);
                    continue;
                }
                const filename = uniqueFilename(file.name);
                const base64 = await blobToBase64(blob);
                await ghPut(PHOTOS_PATH + '/' + filename, base64, 'Add photo ' + filename);
                galleryImages.push({
                    name: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
                    filename: filename,
                    url: URL.createObjectURL(blob)
                });
                uploaded++;
            }
            if (uploaded) {
                await saveManifest('Add ' + uploaded + ' photo(s) to manifest');
                renderGallery();
                showStatus(uploaded + ' photo(s) added. The live site updates in about a minute.', false, 5000);
            }
        } catch (err) {
            showStatus('Upload failed: ' + err.message, true);
        } finally {
            fileInput.value = '';
            busy = false;
        }
    }

    function uniqueFilename(originalName) {
        let base = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
        if (!base) base = 'photo';
        let name = base + '.jpg';
        let counter = 2;
        const taken = new Set(galleryImages.map(img => img.filename));
        while (taken.has(name)) {
            name = base + '_' + counter + '.jpg';
            counter++;
        }
        return name;
    }

    function resizeImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (!w || !h) return reject(new Error('empty image'));
                if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
                    const scale = MAX_DIMENSION / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    blob => blob ? resolve(blob) : reject(new Error('could not encode image')),
                    'image/jpeg',
                    JPEG_QUALITY
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('could not decode image'));
            };
            img.src = url;
        });
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = () => reject(new Error('could not read file'));
            reader.readAsDataURL(blob);
        });
    }

    /* ---------- delete ---------- */

    async function deletePhoto(index) {
        const img = galleryImages[index];
        if (!img) return;
        if (!confirm('Delete "' + img.filename + '"? This cannot be undone.')) return;
        busy = true;
        showStatus('Deleting…');
        try {
            const sha = await getFileSha(PHOTOS_PATH + '/' + img.filename);
            if (sha) {
                await ghDelete(PHOTOS_PATH + '/' + img.filename, sha, 'Delete photo ' + img.filename);
            }
            galleryImages.splice(index, 1);
            await saveManifest('Remove ' + img.filename + ' from manifest');
            renderGallery();
            showStatus('Photo deleted. The live site updates in about a minute.', false, 5000);
        } catch (err) {
            showStatus('Delete failed: ' + err.message, true);
        } finally {
            busy = false;
        }
    }

    /* ---------- GitHub API helpers ---------- */

    function ghHeaders() {
        return {
            Authorization: 'Bearer ' + getToken(),
            Accept: 'application/vnd.github+json'
        };
    }

    async function ghError(res) {
        let detail = res.status + '';
        try {
            const body = await res.json();
            if (body.message) detail = res.status + ' ' + body.message;
        } catch (e) { /* ignore */ }
        if (res.status === 401) detail += ' — token may be expired; tap Manage Photos to re-enter it.';
        return new Error(detail);
    }

    async function getFileSha(path) {
        const res = await fetch(API + '/contents/' + path + '?ref=' + BRANCH, { headers: ghHeaders() });
        if (res.status === 404) return null;
        if (!res.ok) throw await ghError(res);
        const body = await res.json();
        return body.sha;
    }

    async function ghPut(path, base64Content, message, sha) {
        const payload = { message: message, content: base64Content, branch: BRANCH };
        if (sha) payload.sha = sha;
        const res = await fetch(API + '/contents/' + path, {
            method: 'PUT',
            headers: ghHeaders(),
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw await ghError(res);
        return res.json();
    }

    async function ghDelete(path, sha, message) {
        const res = await fetch(API + '/contents/' + path, {
            method: 'DELETE',
            headers: ghHeaders(),
            body: JSON.stringify({ message: message, sha: sha, branch: BRANCH })
        });
        if (!res.ok) throw await ghError(res);
        return res.json();
    }

    async function saveManifest(message) {
        const filenames = galleryImages.map(img => img.filename);
        const json = JSON.stringify(filenames, null, 2) + '\n';
        const base64 = btoa(unescape(encodeURIComponent(json)));
        const sha = await getFileSha(MANIFEST_PATH);
        await ghPut(MANIFEST_PATH, base64, message, sha);
    }

    /* ---------- status ---------- */

    let statusTimer = null;

    function showStatus(message, isError, autoHideMs) {
        if (statusTimer) clearTimeout(statusTimer);
        statusEl.style.display = 'block';
        statusEl.textContent = message;
        statusEl.classList.toggle('photo-admin-status-error', !!isError);
        if (autoHideMs) {
            statusTimer = setTimeout(() => { statusEl.style.display = 'none'; }, autoHideMs);
        }
    }
})();
