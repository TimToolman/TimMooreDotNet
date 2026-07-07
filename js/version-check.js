/**
 * Auto-refresh after deploys.
 *
 * Every page carries the version it was built with in a <meta name="site-version">
 * tag, and the repo root has version.json with the latest deployed version
 * (both stamped by the pre-commit hook via bump-version.sh). Compare the two;
 * if the site has moved on, reload once with a cache-busting query so the
 * browser and CDN serve the new HTML, CSS, and JS.
 *
 * Runs on load AND every time the tab becomes visible again (throttled), so a
 * phone tab left open for days still picks up new deploys without a manual
 * refresh.
 */

(function () {
    var meta = document.querySelector('meta[name="site-version"]');
    if (!meta || !meta.content) return;
    var mine = meta.content;
    var lastCheck = 0;

    function check() {
        var now = Date.now();
        if (now - lastCheck < 60000) return; // at most once a minute
        lastCheck = now;

        fetch('version.json?t=' + now, { cache: 'no-store' })
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
    }

    check();
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
    });
    // bfcache restore (iOS Safari back/forward) skips normal load events.
    window.addEventListener('pageshow', function (e) { if (e.persisted) check(); });
})();
