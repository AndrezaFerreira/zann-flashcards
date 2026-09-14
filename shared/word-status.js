// ============================================================
// ZWORDS SHARED WORD STATUS
//
// Single source of truth for per-word learning status, shared
// between ZWords and ZBooks via IndexedDB (both PWAs are hosted
// under the same GitHub Pages origin, so this database is
// visible to both, offline, with no backend/sync required).
//
// Loaded as a plain script (no bundler/module system, matching
// the rest of the project) -- everything is exposed through the
// single global below so it works identically from a <script>
// tag in ZWords' own index.html or from ZBooks loading this
// exact file via an absolute same-origin URL.
// ============================================================

(function () {

    const SHARED_DB_NAME = "zwords_shared_db";
    const SHARED_DB_VERSION = 1;
    const WORD_STATUS_STORE = "word_status";
    const PENDING_WORDS_STORE = "pending_words";

    // Words ranked below this (out of ~75k in the ZWords dataset)
    // are treated as "rare" for the automatic purple indicator.
    // Configurable in one place -- not stored per word, always
    // recomputed from the word's frequency_rank.
    const RARE_RANK_THRESHOLD = 20000;


    // ============================================================
    // NORMALIZE WORD
    //
    // Same normalization ZWords already uses for search
    // (app.js normalizeSearch), duplicated here so this file has
    // no dependency on app.js and can be loaded standalone by
    // ZBooks.
    // ============================================================

    function normalizeSharedWord(value) {
        const COMBINING_MARKS =
            new RegExp("[\\u0300-\\u036f]", "g");

        return String(value ?? "")
            .normalize("NFD")
            .replace(COMBINING_MARKS, "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
    }


    // ============================================================
    // OPEN DATABASE
    // ============================================================

    function openSharedDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(
                SHARED_DB_NAME,
                SHARED_DB_VERSION
            );

            request.onupgradeneeded = event => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(WORD_STATUS_STORE)) {
                    db.createObjectStore(WORD_STATUS_STORE, {
                        keyPath: "word"
                    });
                }

                if (!db.objectStoreNames.contains(PENDING_WORDS_STORE)) {
                    db.createObjectStore(PENDING_WORDS_STORE, {
                        keyPath: "word"
                    });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }


    // ============================================================
    // WORD STATUS -- READ ALL (for building an in-memory mirror)
    // ============================================================

    async function loadAllWordStatus() {
        const db = await openSharedDb();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(WORD_STATUS_STORE, "readonly");
            const request = tx.objectStore(WORD_STATUS_STORE).getAll();

            request.onsuccess = () => {
                db.close();
                resolve(request.result || []);
            };

            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    }


    // ============================================================
    // WORD STATUS -- WRITE ONE RECORD
    // ============================================================

    async function putWordStatusRecord(record) {
        const db = await openSharedDb();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(WORD_STATUS_STORE, "readwrite");
            tx.objectStore(WORD_STATUS_STORE).put(record);

            tx.oncomplete = () => {
                db.close();
                resolve();
            };

            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }


    // ============================================================
    // PENDING WORDS -- "I want to learn this" for words not yet
    // in the ZWords dataset at all.
    // ============================================================

    async function putPendingWord(record) {
        const db = await openSharedDb();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(PENDING_WORDS_STORE, "readwrite");
            tx.objectStore(PENDING_WORDS_STORE).put(record);

            tx.oncomplete = () => {
                db.close();
                resolve();
            };

            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }


    async function loadAllPendingWords() {
        const db = await openSharedDb();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(PENDING_WORDS_STORE, "readonly");
            const request = tx.objectStore(PENDING_WORDS_STORE).getAll();

            request.onsuccess = () => {
                db.close();
                resolve(request.result || []);
            };

            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    }


    // ============================================================
    // DISPLAY COLOR
    //
    // Color is always computed at display time from the record +
    // the word's static frequency_rank -- never stored directly,
    // so changing RARE_RANK_THRESHOLD later needs no data
    // migration. Precedence: known > learning > rare > seen > none.
    // ============================================================

    function getDisplayColor(record, frequencyRank) {
        const explicitStatus =
            record
                ? record.explicitStatus
                : null;

        if (explicitStatus === "known") {
            return "known";
        }

        if (explicitStatus === "learning") {
            return "learning";
        }

        if (
            typeof frequencyRank === "number"
            && frequencyRank > RARE_RANK_THRESHOLD
        ) {
            return "rare";
        }

        if (record && record.lookupCount > 0) {
            return "seen";
        }

        return "none";
    }


    // ============================================================
    // PUBLIC API
    // ============================================================

    window.ZWordsSharedStatus = {
        SHARED_DB_NAME,
        WORD_STATUS_STORE,
        PENDING_WORDS_STORE,
        RARE_RANK_THRESHOLD,
        normalizeSharedWord,
        loadAllWordStatus,
        putWordStatusRecord,
        putPendingWord,
        loadAllPendingWords,
        getDisplayColor
    };

})();
