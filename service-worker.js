// ============================================================
// ZWORDS SERVICE WORKER
// ============================================================

const STATIC_CACHE =
    "zwords-static-v81790dede5";

const MEDIA_CACHE =
    "zwords-media-v1";

// Must match MEDIA_BASE_URL in app.js exactly -- images/audio are
// hosted on R2 (cross-origin), not this same origin.
const MEDIA_BASE_URL =
    "https://pub-278133aaa2ee4e8c96dc7c89f8a6ef6e.r2.dev/";


// ============================================================
// INSTALL
// ============================================================

self.addEventListener(
    "install",
    event => {

        event.waitUntil(
            self.skipWaiting()
        );

    }
);


// ============================================================
// ACTIVATE
// ============================================================

self.addEventListener(
    "activate",
    event => {

        event.waitUntil(
            (async () => {

                const validCaches = [
                    STATIC_CACHE,
                    MEDIA_CACHE
                ];


                const cacheNames =
                    await caches.keys();


                await Promise.all(
                    cacheNames.map(
                        cacheName => {

                            if (
                                cacheName.startsWith(
                                    "zwords-"
                                )
                                &&
                                !validCaches.includes(
                                    cacheName
                                )
                            ) {

                                return caches.delete(
                                    cacheName
                                );

                            }


                            return Promise.resolve();

                        }
                    )
                );


                await self.clients.claim();

            })()
        );

    }
);


// ============================================================
// FETCH
// ============================================================

self.addEventListener(
    "fetch",
    event => {

        if (
            event.request.method
            !==
            "GET"
        ) {
            return;
        }


        const requestURL =
            new URL(
                event.request.url
            );


        // ====================================================
        // R2-HOSTED MEDIA (IMAGES + AUDIO)
        // Cache first. Checked before the same-origin bailout
        // below because R2 is a different origin from this app.
        // Zip packages live under the same R2 bucket but are
        // never cached here -- only unzipped/cached via the
        // bulk offline-install flow in app.js.
        // ====================================================

        if (
            requestURL.href.startsWith(
                MEDIA_BASE_URL
            )
            &&
            !requestURL.pathname.includes(
                "/packages/"
            )
        ) {

            event.respondWith(
                mediaRequest(
                    event.request
                )
            );

            return;
        }


        if (
            requestURL.origin
            !==
            self.location.origin
        ) {
            return;
        }


        const pathname =
            requestURL.pathname;


        // ====================================================
        // JSON DATA
        // Cache first with ignoreSearch
        // ====================================================

        if (
            pathname.includes(
                "/data/"
            )
            &&
            pathname.endsWith(
                ".json"
            )
        ) {

            event.respondWith(
                staticRequest(
                    event.request
                )
            );

            return;
        }


        // ====================================================
        // PAGE NAVIGATION
        // ====================================================

        if (
            event.request.mode
            ===
            "navigate"
        ) {

            event.respondWith(
                navigationRequest(
                    event.request
                )
            );

            return;
        }


        // ====================================================
        // STATIC FILES
        // ====================================================

        event.respondWith(
            staticRequest(
                event.request
            )
        );

    }
);


// ============================================================
// MEDIA REQUEST
// ============================================================

async function mediaRequest(
    request
) {

    const cache =
        await caches.open(
            MEDIA_CACHE
        );


    const cached =
        await cache.match(
            request,
            {
                ignoreSearch:
                    true
            }
        );


    if (
        cached
    ) {
        return cached;
    }


    try {

        const response =
            await fetch(
                request
            );


        if (
            response
            &&
            response.ok
        ) {

            await cache.put(
                request,
                response.clone()
            );

        }


        return response;


    } catch (
        error
    ) {

        return new Response(
            "",
            {
                status:
                    504,

                statusText:
                    "Offline media unavailable"
            }
        );

    }

}


// ============================================================
// STATIC + DATA REQUEST
// ============================================================

async function staticRequest(
    request
) {

    const cache =
        await caches.open(
            STATIC_CACHE
        );


    const cached =
        await cache.match(
            request,
            {
                ignoreSearch:
                    true
            }
        );


    if (
        cached
    ) {
        return cached;
    }


    try {

        const response =
            await fetch(
                request
            );


        if (
            response
            &&
            response.ok
        ) {

            await cache.put(
                request,
                response.clone()
            );

        }


        return response;


    } catch (
        error
    ) {

        return new Response(
            "",
            {
                status:
                    504,

                statusText:
                    "Offline resource unavailable"
            }
        );

    }

}


// ============================================================
// NAVIGATION
// ============================================================

async function navigationRequest(
    request
) {

    const cache =
        await caches.open(
            STATIC_CACHE
        );


    try {

        const response =
            await fetch(
                request
            );


        if (
            response
            &&
            response.ok
        ) {

            await cache.put(
                "./index.html",
                response.clone()
            );

        }


        return response;


    } catch (
        error
    ) {

        const cachedPage =
            await cache.match(
                "./index.html",
                {
                    ignoreSearch:
                        true
                }
            )
            ||
            await cache.match(
                "./",
                {
                    ignoreSearch:
                        true
                }
            );


        if (
            cachedPage
        ) {
            return cachedPage;
        }


        return new Response(
            "ZWords is unavailable offline.",
            {
                status:
                    503,

                headers: {
                    "Content-Type":
                        "text/plain; charset=utf-8"
                }
            }
        );

    }

}