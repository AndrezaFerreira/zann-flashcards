// ============================================================
// ZWORDS SERVICE WORKER
// ============================================================

const STATIC_CACHE =
    "zwords-static-vb928ded5c1";

const MEDIA_CACHE =
    "zwords-media-v1";


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
        // ZIP PACKAGES
        // Never cache ZIP packages themselves
        // ====================================================

        if (
            pathname.includes(
                "/packages/"
            )
        ) {
            return;
        }


        // ====================================================
        // IMAGES + AUDIO
        // Cache first
        // ====================================================

        if (
            pathname.includes(
                "/images/"
            )
            ||
            pathname.includes(
                "/audio/"
            )
        ) {

            event.respondWith(
                mediaRequest(
                    event.request
                )
            );

            return;
        }


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