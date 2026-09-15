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

    // IndexedDB has no native cross-tab change event, unlike
    // localStorage's own "storage" event (which fires in every OTHER
    // same-origin tab, never the one that made the change) -- writing a
    // small ping here after every word_status write lets ZWords and
    // ZBooks notice each other's changes live, when both happen to be
    // open at once, without polling. The ping's value only carries
    // which word changed + a timestamp; listeners re-read the real
    // record from IndexedDB rather than trusting the ping's payload.
    const WORD_STATUS_UPDATED_KEY = "zwords_word_status_updated";

    function pingWordStatusUpdated(word) {

        try {

            localStorage.setItem(
                WORD_STATUS_UPDATED_KEY,
                JSON.stringify({ word, at: Date.now() })
            );

        } catch (error) {

            // Best-effort only -- a blocked/full localStorage should
            // not fail the write that already succeeded in IndexedDB.

        }

    }

    // Single source of truth for the R2 media host, so ZBooks builds
    // image URLs the exact same way ZWords' app.js does, from one place,
    // instead of a second hardcoded copy living in the zbooks repo (a
    // second copy is exactly how this went wrong once already -- see
    // buildImageUrl below).
    const MEDIA_BASE_URL =
        "https://pub-278133aaa2ee4e8c96dc7c89f8a6ef6e.r2.dev/";

    // Card "image" fields carry the local pipeline path
    // ("images_all/<uuid>.webp"), but the R2 bucket stores images under
    // "images/" -- app.js has always done this replace before building
    // the URL. Centralized here after ZBooks briefly skipped it and
    // linked straight to images_all/, which 404s on R2.
    function buildImageUrl(imagePath) {

        if (!imagePath) {
            return null;
        }

        return (
            MEDIA_BASE_URL +
            imagePath.replace("images_all/", "images/")
        );

    }

    // audio_map.json values look like "audio_all/1.mp3" (the "audio_all/"
    // prefix is stripped, matching app.js's getAudioPath);
    // irregular_forms_audio_map.json values already look like
    // "irregular_forms/abided.mp3" (no "audio_all/" to strip, so the
    // replace below is a harmless no-op) -- one helper covers both, the
    // same way app.js's several *AudioPath functions already do it.
    function buildAudioUrl(audioFile) {

        if (!audioFile) {
            return null;
        }

        return (
            MEDIA_BASE_URL +
            "audio/" +
            audioFile.replace("audio_all/", "")
        );

    }


    // ============================================================
    // PER-SENSE PROGRESS (localStorage, not IndexedDB)
    //
    // ZWords itself tracks New/Learning/Known per sense_id, not per
    // word, in localStorage under PROGRESS_STORAGE_KEY (app.js's own
    // studyProgress/getCardProgressKey/loadStudyProgress/
    // saveStudyProgress, kept exactly as they already are there --
    // this is a second, independent implementation of the same simple
    // key format, so ZBooks can read/write the *exact* card ZWords
    // itself would, not a word-level approximation of it).
    //
    // localStorage is origin-scoped, same as the IndexedDB store above,
    // so this reaches the same data ZWords reads -- ZWords just won't
    // notice the change until its own page is reloaded (studyProgress
    // is only read from localStorage once, at ZWords startup).
    // ============================================================

    const PROGRESS_STORAGE_KEY = "zwords_progress_v1";

    function getSenseProgressKey(deck, senseId) {
        return `${deck}::${senseId}`;
    }

    function loadSenseProgress() {

        try {

            const saved = localStorage.getItem(PROGRESS_STORAGE_KEY);

            if (!saved) {
                return {};
            }

            const parsed = JSON.parse(saved);

            return (parsed && typeof parsed === "object") ? parsed : {};

        } catch (error) {

            console.error("Could not load sense progress:", error);
            return {};

        }

    }

    function saveSenseProgress(progress) {

        try {

            localStorage.setItem(
                PROGRESS_STORAGE_KEY,
                JSON.stringify(progress)
            );

        } catch (error) {

            console.error("Could not save sense progress:", error);

        }

    }

    function getSenseStatus(deck, senseId) {

        const progress = loadSenseProgress();
        const status = progress[getSenseProgressKey(deck, senseId)];

        return (status === "learning" || status === "known")
            ? status
            : "new";

    }

    function setSenseStatus(deck, senseId, status) {

        const progress = loadSenseProgress();
        const key = getSenseProgressKey(deck, senseId);

        if (status === "new") {
            delete progress[key];
        } else {
            progress[key] = status;
        }

        saveSenseProgress(progress);

    }

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
                pingWordStatusUpdated(record.word);
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

    // Pending words are the one piece of data that genuinely needs to
    // be the same for every reader, not just every tab on one person's
    // device -- a word someone marks "Add to ZWords" on their own phone
    // needs to show up in the curator's own "New Words" list, which a
    // per-browser IndexedDB store can never do. Backed by a small
    // Cloudflare Worker + KV (zwords-api) instead of the local
    // PENDING_WORDS_STORE that used to hold these; same function
    // signatures as before, so nothing calling these needs to change.
    // Study progress (Learning/Known) is NOT part of this -- that
    // stays per-person, in each browser's own IndexedDB, on purpose.
    const PENDING_WORDS_API_URL =
        "https://zwords-api.zwords-api.workers.dev/pending-words";

    async function putPendingWord(record) {

        const response = await fetch(PENDING_WORDS_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
        });

        if (!response.ok) {
            throw new Error(
                `Could not save pending word (${response.status})`
            );
        }

    }


    async function loadAllPendingWords() {

        const response = await fetch(PENDING_WORDS_API_URL);

        if (!response.ok) {
            throw new Error(
                `Could not load pending words (${response.status})`
            );
        }

        return response.json();

    }


    // Used once a pending word has been turned into a real card by the
    // pipeline (or if it was added by mistake) to clear it from the
    // review list -- ZWords' own "New Words" section is where this gets
    // called from.
    async function deletePendingWord(word) {

        const response = await fetch(
            `${PENDING_WORDS_API_URL}/${encodeURIComponent(word)}`,
            { method: "DELETE" }
        );

        if (!response.ok) {
            throw new Error(
                `Could not remove pending word (${response.status})`
            );
        }

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
        MEDIA_BASE_URL,
        WORD_STATUS_UPDATED_KEY,
        buildImageUrl,
        buildAudioUrl,
        getSenseProgressKey,
        getSenseStatus,
        setSenseStatus,
        normalizeSharedWord,
        loadAllWordStatus,
        putWordStatusRecord,
        putPendingWord,
        loadAllPendingWords,
        deletePendingWord,
        getDisplayColor
    };

})();
