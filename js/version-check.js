/**
 * Auto-refresh after deploys.
 *
 * Every page carries the version it was built with in a <meta name="site-version">
 * tag, and the repo root has version.json with the latest deployed version
 * (both stamped by the pre-commit hook via bump-version.sh). On load, compare
 * the two; if the site has moved on, reload once with a cache-busting query
 * so the browser and CDN serve the new HTML, CSS, and JS.
 */

(function () {
    var meta = document.querySelector('meta[name="site-version"]');
    if (!meta || !meta.content) return;
    var mine = meta.content;

    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data || !data.v) return;

            var url = new URL(window.location.href);

            if (data.v === mine) {
                // Up to date — clean any cache-busting param from a prior reload.
                if (url.searchParams.has('_')) {
                    url.searchParams.delete('_');
                    history.replaceState(null, '', url.toString());
                }
                return;
            }

            // Only reload once per new version, so a slow CDN can't loop us.
            if (sessionStorage.getItem('site-version-reloaded') === data.v) return;
            sessionStorage.setItem('site-version-reloaded', data.v);

            url.searchParams.set('_', data.v);
            window.location.replace(url.toString());
        })
        .catch(function () { /* offline — never block the page */ });
})();
