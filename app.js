// ============================================================
// STATE
// ============================================================

let cards = [];

let audioMap = {};

let irregularFormsAudioMap = {};

let definitionAudioMap = {};

let exampleAudioMap = {};

let currentIndex = 0;

let currentDeck = "";

let currentStudyMode = null;

let currentSide = "front";

let currentAudio = null;

const deckCache = {};

let searchIndex = [];

let searchReady = false;

let searchLoading = false;

let searchTimer = null;


// ============================================================
// STUDY PROGRESS STATE
// ============================================================

const PROGRESS_STORAGE_KEY =
    "zwords_progress_v1";

let studyProgress = {};


// ============================================================
// ELEMENTS
// ============================================================

const app =
    document.querySelector(
        ".app"
    );

const home =
    document.querySelector(
        ".home"
    );

const collections =
    document.querySelector(
        ".collections"
    );

const wordsButton =
    document.getElementById(
        "words"
    );

const phrasesButton =
    document.getElementById(
        "phrases"
    );

const irregularsButton =
    document.getElementById(
        "irregulars"
    );


// ============================================================
// DECK FILES
// ============================================================

const deckFiles = {
    words:
        "data/02_cards_words.json",

    phrases:
        "data/03_cards_phrases.json",

    irregulars:
        "data/04_cards_irregular_verbs.json?v=3"
};


// ============================================================
// INDEXEDDB
// ============================================================

const DB_NAME =
    "zwords_db";

const DB_VERSION =
    1;

const CARD_STORE =
    "cards";


function openDatabase() {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const request =
                indexedDB.open(
                    DB_NAME,
                    DB_VERSION
                );


            request.onupgradeneeded =
                event => {

                    const db =
                        event.target.result;


                    if (
                        !db.objectStoreNames.contains(
                            CARD_STORE
                        )
                    ) {

                        const store =
                            db.createObjectStore(
                                CARD_STORE,
                                {
                                    keyPath:
                                        "db_key"
                                }
                            );


                        store.createIndex(
                            "deck",
                            "deck",
                            {
                                unique:
                                    false
                            }
                        );

                    }

                };


            request.onsuccess =
                () => {

                    resolve(
                        request.result
                    );

                };


            request.onerror =
                () => {

                    reject(
                        request.error
                    );

                };

        }
    );

}


// ============================================================
// SAVE DECK TO INDEXEDDB
// ============================================================

async function saveDeckToDatabase(
    deck,
    deckCards
) {

    const db =
        await openDatabase();


    return new Promise(
        (
            resolve,
            reject
        ) => {

            const transaction =
                db.transaction(
                    CARD_STORE,
                    "readwrite"
                );

            const store =
                transaction.objectStore(
                    CARD_STORE
                );


            for (
                let index = 0;
                index < deckCards.length;
                index++
            ) {

                const card =
                    deckCards[
                        index
                    ];


                store.put({
                    ...card,

                    db_key:
                        `${deck}:${index}`,

                    deck,

                    deck_index:
                        index
                });

            }


            transaction.oncomplete =
                () => {

                    db.close();

                    resolve();

                };


            transaction.onerror =
                () => {

                    db.close();

                    reject(
                        transaction.error
                    );

                };

        }
    );

}


// ============================================================
// LOAD DECK FROM INDEXEDDB
// ============================================================

async function loadDeckFromDatabase(
    deck
) {

    const db =
        await openDatabase();


    return new Promise(
        (
            resolve,
            reject
        ) => {

            const transaction =
                db.transaction(
                    CARD_STORE,
                    "readonly"
                );

            const store =
                transaction.objectStore(
                    CARD_STORE
                );

            const index =
                store.index(
                    "deck"
                );

            const request =
                index.getAll(
                    deck
                );


            request.onsuccess =
                () => {

                    const result =
                        request.result
                            .sort(
                                (
                                    a,
                                    b
                                ) =>
                                    a.deck_index
                                    -
                                    b.deck_index
                            );

                    db.close();

                    resolve(
                        result
                    );

                };


            request.onerror =
                () => {

                    db.close();

                    reject(
                        request.error
                    );

                };

        }
    );

}


// ============================================================
// CHECK DECK IN INDEXEDDB
// ============================================================

async function hasDeckInDatabase(
    deck
) {

    const db =
        await openDatabase();


    return new Promise(
        (
            resolve,
            reject
        ) => {

            const transaction =
                db.transaction(
                    CARD_STORE,
                    "readonly"
                );

            const store =
                transaction.objectStore(
                    CARD_STORE
                );

            const index =
                store.index(
                    "deck"
                );

            const request =
                index.count(
                    deck
                );


            request.onsuccess =
                () => {

                    db.close();

                    resolve(
                        request.result > 0
                    );

                };


            request.onerror =
                () => {

                    db.close();

                    reject(
                        request.error
                    );

                };

        }
    );

}


// ============================================================
// HOME BUTTONS
// ============================================================

wordsButton?.addEventListener(
    "click",
    () =>
        openStudyMenu(
            "words"
        )
);


phrasesButton?.addEventListener(
    "click",
    () =>
        openStudyMenu(
            "phrases"
        )
);


irregularsButton?.addEventListener(
    "click",
    () =>
        openStudyMenu(
            "irregulars"
        )
);


// ============================================================
// HOME SEARCH UI
// ============================================================

const searchContainer =
    document.createElement(
        "section"
    );

searchContainer.className =
    "home-search";


searchContainer.innerHTML = `
    <div class="home-search-box">

        <input
            id="dictionarySearch"
            class="home-search-input"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search a word or phrase..."
            aria-label="Search a word or phrase"
        >

        <span class="home-search-icon">
            🔍
        </span>

    </div>

    <div
        id="searchStatus"
        class="search-status"
    ></div>

    <div
        id="searchResults"
        class="search-results"
    ></div>
`;


if (
    home
    &&
    collections
) {

    home.insertBefore(
        searchContainer,
        collections
    );

}


const searchInput =
    document.getElementById(
        "dictionarySearch"
    );

const searchResults =
    document.getElementById(
        "searchResults"
    );

const searchStatus =
    document.getElementById(
        "searchStatus"
    );


// ============================================================
// LOAD JSON
// ============================================================

async function loadJson(
    path
) {

    const separator =
        path.includes(
            "?"
        )
            ? "&"
            : "?";


    const url =
        `${path}${separator}v=20260912-7`;


    const response =
        await fetch(
            url,
            {
                cache:
                    "default"
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `HTTP ${response.status}: ${url}`
        );

    }


    return await response.json();

}


// ============================================================
// LOAD DECK
// ============================================================

async function loadDeck(
    deck
) {

    if (
        deckCache[
            deck
        ]
    ) {

        return deckCache[
            deck
        ];

    }


    const file =
        deckFiles[
            deck
        ];


    if (
        !file
    ) {

        throw new Error(
            `Unknown deck: ${deck}`
        );

    }


    const data =
        await loadJson(
            file
        );


    deckCache[
        deck
    ] =
        data;


    return data;

}


// ============================================================
// STUDY PROGRESS
// ============================================================

function loadStudyProgress() {

    try {

        const savedProgress =
            localStorage.getItem(
                PROGRESS_STORAGE_KEY
            );


        if (
            !savedProgress
        ) {

            return {};

        }


        const parsedProgress =
            JSON.parse(
                savedProgress
            );


        return (
            parsedProgress
            &&
            typeof parsedProgress
            ===
            "object"
        )
            ? parsedProgress
            : {};


    } catch (
        error
    ) {

        console.error(
            "Could not load study progress:",
            error
        );


        return {};

    }

}


function saveStudyProgress() {

    try {

        localStorage.setItem(
            PROGRESS_STORAGE_KEY,
            JSON.stringify(
                studyProgress
            )
        );


    } catch (
        error
    ) {

        console.error(
            "Could not save study progress:",
            error
        );

    }

}


function getCardProgressKey(
    deck,
    card
) {

    const cardIdentifier =
        card.sense_id
        ||
        card.id
        ||
        [
            card.word
            ||
            "",

            card.part_of_speech
            ||
            "",

            card.definition_number
            ||
            "",

            card.definition
            ||
            ""
        ].join(
            "::"
        );


    return `${deck}::${cardIdentifier}`;

}


function getCardStatus(
    deck,
    card
) {

    const progressKey =
        getCardProgressKey(
            deck,
            card
        );


    const status =
        studyProgress[
            progressKey
        ];


    if (
        status ===
        "learning"
        ||
        status ===
        "known"
    ) {

        return status;

    }


    return "new";

}


function setCardStatus(
    deck,
    card,
    status
) {

    if (
        status !==
        "new"
        &&
        status !==
        "learning"
        &&
        status !==
        "known"
    ) {

        return;

    }


    const progressKey =
        getCardProgressKey(
            deck,
            card
        );


    if (
        status ===
        "new"
    ) {

        delete studyProgress[
            progressKey
        ];

    } else {

        studyProgress[
            progressKey
        ] =
            status;

    }


    saveStudyProgress();

}


function getStudyModeCards(
    deck,
    deckCards,
    status
) {

    return deckCards.filter(
        card =>
            getCardStatus(
                deck,
                card
            ) ===
            status
    );

}


// ============================================================
// INITIALIZE STUDY PROGRESS
// ============================================================

studyProgress =
    loadStudyProgress();


// ============================================================
// STUDY MENU
// ============================================================

async function openStudyMenu(
    deck
) {

    try {

        currentDeck =
            deck;

        currentStudyMode =
            null;

        currentIndex =
            0;

        currentSide =
            "front";

        stopCurrentAudio();

        hideSearch();


        app.innerHTML =
            "<p>Loading...</p>";


        const deckCards =
            await loadDeck(
                deck
            );


        const counts = {
            new:
                0,

            learning:
                0,

            known:
                0
        };


        for (
            const card
            of deckCards
        ) {

            const status =
                getCardStatus(
                    deck,
                    card
                );


            if (
                Object.prototype
                    .hasOwnProperty.call(
                        counts,
                        status
                    )
            ) {

                counts[
                    status
                ]++;

            }

        }


        const deckTitle =
            deck ===
            "words"
                ? "Words"
                : deck ===
                    "phrases"
                    ? "Phrases"
                    : "Irregular Verbs";


        app.innerHTML = `

            <div class="card-header">

                <button
                    id="studyMenuBackButton"
                    type="button"
                >
                    ← Back
                </button>

            </div>


            <section class="study-menu">

                <div class="study-menu-header">

                    <h1>
                        ${
                            escapeHtml(
                                deckTitle
                            )
                        }
                    </h1>

                    <p>
                        Choose a deck
                    </p>

                </div>


                <div class="study-menu-grid">


                    <button
                        class="study-menu-card"
                        data-study-mode="new"
                        type="button"
                    >

                        <span
                            class="study-menu-card-title"
                        >
                            New
                        </span>

                        <span
                            class="study-menu-card-count"
                        >
                            ${
                                counts.new
                                    .toLocaleString(
                                        "en-US"
                                    )
                            }
                            cards
                        </span>

                    </button>


                    <button
                        class="study-menu-card"
                        data-study-mode="learning"
                        type="button"
                    >

                        <span
                            class="study-menu-card-title"
                        >
                            Learning
                        </span>

                        <span
                            class="study-menu-card-count"
                        >
                            ${
                                counts.learning
                                    .toLocaleString(
                                        "en-US"
                                    )
                            }
                            cards
                        </span>

                    </button>


                    <button
                        class="study-menu-card"
                        data-study-mode="known"
                        type="button"
                    >

                        <span
                            class="study-menu-card-title"
                        >
                            Known
                        </span>

                        <span
                            class="study-menu-card-count"
                        >
                            ${
                                counts.known
                                    .toLocaleString(
                                        "en-US"
                                    )
                            }
                            cards
                        </span>

                    </button>

                </div>

            </section>
        `;


        document
            .getElementById(
                "studyMenuBackButton"
            )
            ?.addEventListener(
                "click",
                goHome
            );


        document
            .querySelectorAll(
                ".study-menu-card"
            )
            .forEach(
                button => {

                    button
                        .addEventListener(
                            "click",
                            () => {

                                const studyMode =
                                    button.dataset
                                        .studyMode;


                                openStudyDeck(
                                    deck,
                                    studyMode
                                );

                            }
                        );

                }
            );


    } catch (
        error
    ) {

        console.error(
            error
        );


        app.innerHTML =
            "<p>Error loading collection.</p>";

    }

}


// ============================================================
// OPEN STUDY DECK
// ============================================================

async function openStudyDeck(
    deck,
    studyMode
) {

    if (
        studyMode !==
        "new"
        &&
        studyMode !==
        "learning"
        &&
        studyMode !==
        "known"
    ) {

        return;

    }


    currentDeck =
        deck;

    currentStudyMode =
        studyMode;

    currentIndex =
        0;

    currentSide =
        "front";


    await openDeck(
        deck,
        {
            studyMode:
                studyMode
        }
    );

}


// ============================================================
// OPEN DECK
// ============================================================

async function openDeck(
    deck,
    target = null
) {

    try {

        currentDeck =
            deck;

        currentSide =
            "front";

        stopCurrentAudio();

        hideSearch();

        app.innerHTML =
            "<p>Loading...</p>";


        const [
            deckCards,
            loadedAudioMap,
            loadedIrregularFormsAudioMap,
            loadedDefinitionAudioMap,
            loadedExampleAudioMap
        ] =
            await Promise.all(
                [

                    loadDeck(
                        deck
                    ),

                    Object.keys(
                        audioMap
                    ).length
                        ? Promise.resolve(
                            audioMap
                        )
                        : loadJson(
                            "data/audio_map.json"
                        ),

                    Object.keys(
                        irregularFormsAudioMap
                    ).length
                        ? Promise.resolve(
                            irregularFormsAudioMap
                        )
                        : loadJson(
                            "data/irregular_forms_audio_map.json"
                        ),

                    Object.keys(
                        definitionAudioMap
                    ).length
                        ? Promise.resolve(
                            definitionAudioMap
                        )
                        : loadJson(
                            "data/definition_audio_map.json"
                        ),

                    Object.keys(
                        exampleAudioMap
                    ).length
                        ? Promise.resolve(
                            exampleAudioMap
                        )
                        : loadJson(
                            "data/example_audio_map.json"
                        )

                ]
            );


        audioMap =
            loadedAudioMap;

        irregularFormsAudioMap =
            loadedIrregularFormsAudioMap;

        definitionAudioMap =
            loadedDefinitionAudioMap;

        exampleAudioMap =
            loadedExampleAudioMap;


        const requestedStudyMode =
            target?.studyMode
            ||
            null;


        if (
            requestedStudyMode ===
            "new"
            ||
            requestedStudyMode ===
            "learning"
            ||
            requestedStudyMode ===
            "known"
        ) {

            currentStudyMode =
                requestedStudyMode;


            cards =
                getStudyModeCards(
                    deck,
                    deckCards,
                    requestedStudyMode
                );

        } else {

            currentStudyMode =
                null;

            cards =
                deckCards;

        }


        if (
            currentStudyMode
            &&
            !cards.length
        ) {

            openStudyMenu(
                deck
            );

            return;

        }


        currentIndex =
            0;


        if (
            target?.senseId
            &&
            !currentStudyMode
        ) {

            const foundIndex =
                cards.findIndex(
                    card =>
                        card.sense_id
                        ===
                        target.senseId
                );


            if (
                foundIndex >=
                0
            ) {

                currentIndex =
                    foundIndex;

            }

        } else if (
            Number.isInteger(
                target?.index
            )
            &&
            target.index >=
            0
            &&
            target.index <
            cards.length
            &&
            !currentStudyMode
        ) {

            currentIndex =
                target.index;

        }


        showCard({
            playAudio:
                true
        });


    } catch (
        error
    ) {

        console.error(
            error
        );


        app.innerHTML =
            "<p>Error loading cards.</p>";

    }

}


// ============================================================
// CAPITALIZE FIRST LETTER
// ============================================================

function capitalizeFirstLetter(
    text
) {

    if (
        !text
    ) {

        return "";

    }


    const characters =
        Array.from(
            text
        );


    for (
        let i = 0;
        i < characters.length;
        i++
    ) {

        if (
            /\p{L}/u.test(
                characters[
                    i
                ]
            )
        ) {

            characters[
                i
            ] =
                characters[
                    i
                ]
                    .toUpperCase();


            break;

        }

    }


    return characters.join(
        ""
    );

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(
    value
) {

    return String(
        value ??
        ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


// ============================================================
// NORMALIZE SEARCH
// ============================================================

function normalizeSearch(
    value
) {

    return String(
        value ??
        ""
    )
        .normalize(
            "NFD"
        )
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .trim()
        .replace(
            /\s+/g,
            " "
        )
        .toLowerCase();

}


// ============================================================
// AUDIO PATH
// ============================================================

function getAudioPath(
    card
) {

    const normalizedWord =
        String(
            card.word ??
            ""
        )
            .trim()
            .replace(
                /\s+/g,
                " "
            );


    const audioFile =
        audioMap[
            normalizedWord
        ];


    if (
        !audioFile
    ) {

        return null;

    }


    return `audio/${
        audioFile.replace(
            "audio_all/",
            ""
        )
    }`;

}


// ============================================================
// AUDIO
// ============================================================

function stopCurrentAudio() {

    if (
        !currentAudio
    ) {

        return;

    }


    currentAudio.pause();

    currentAudio.currentTime =
        0;

    currentAudio =
        null;

}


function playCardAudio(
    audioPath
) {

    if (
        !audioPath
    ) {

        return;

    }


    stopCurrentAudio();


    currentAudio =
        new Audio(
            audioPath
        );


    currentAudio
        .play()
        .catch(
            () => {}
        );

}


// ============================================================
// IRREGULAR FORM AUDIO
// ============================================================

function getIrregularFormAudioPath(
    form
) {

    const normalizedForm =
        String(
            form ??
            ""
        )
            .trim()
            .replace(
                /\s+/g,
                " "
            );


    const audioFile =
        irregularFormsAudioMap[
            normalizedForm
        ];


    if (
        !audioFile
    ) {

        return null;

    }


    return `audio/${audioFile}`;

}


function renderIrregularForm(
    form
) {

    const audioPath =
        getIrregularFormAudioPath(
            form
        );


    return `
        <span class="irregular-word">

            <span class="irregular-word-text">
                ${
                    escapeHtml(
                        form
                    )
                }
            </span>

            ${
                audioPath
                    ? `
                        <button
                            type="button"
                            class="irregular-audio-button"
                            data-audio="${
                                escapeHtml(
                                    audioPath
                                )
                            }"
                            aria-label="Play ${escapeHtml(form)}"
                            title="Play ${escapeHtml(form)}"
                        >
                            🔊
                        </button>
                    `
                    : ""
            }

        </span>
    `;

}


function renderIrregularForms(
    forms
) {

    const normalizedForms =
        Array.isArray(
            forms
        )
            ? forms
            : (
                forms
                    ? [
                        forms
                    ]
                    : []
            );


    return normalizedForms
        .map(
            renderIrregularForm
        )
        .join(
            `<span class="irregular-separator"> / </span>`
        );

}


// ============================================================
// DEFINITION / EXAMPLE AUDIO
// ============================================================

function normalizeAudioText(
    text
) {

    return String(
        text ??
        ""
    )
        .trim()
        .replace(
            /\s+/g,
            " "
        );

}


function getDefinitionAudioPath(
    text
) {

    const normalizedText =
        normalizeAudioText(
            text
        );


    if (
        !normalizedText
    ) {

        return null;

    }


    const audioFile =
        definitionAudioMap[
            normalizedText
        ];


    if (
        !audioFile
    ) {

        return null;

    }


    return `audio/${audioFile}`;

}


function getExampleAudioPath(
    text
) {

    const normalizedText =
        normalizeAudioText(
            text
        );


    if (
        !normalizedText
    ) {

        return null;

    }


    const audioFile =
        exampleAudioMap[
            normalizedText
        ];


    if (
        !audioFile
    ) {

        return null;

    }


    return `audio/${audioFile}`;

}


// ============================================================
// SHOW CARD
// ============================================================

function showCard({
    playAudio = false
} = {}) {

    if (
        !cards.length
        ||
        !cards[
            currentIndex
        ]
    ) {

        return;

    }


    const card =
        cards[
            currentIndex
        ];


    const imagePath =
        card.image
            ? card.image.replace(
                "images_all/",
                "images/"
            )
            : null;


    const audioPath =
        getAudioPath(
            card
        );


    const isBack =
        currentSide
        ===
        "back";


    const displayedDefinition =
        capitalizeFirstLetter(
            isBack
                ? (
                    card.definition_pt
                    ||
                    "Translation not available yet."
                )
                : (
                    card.definition
                    ||
                    ""
                )
        );


    const definitionAudioPath =
        !isBack
            ? getDefinitionAudioPath(
                card.definition
                ||
                ""
            )
            : null;


    let displayedExample =
        "";


    if (
        isBack
    ) {

        if (
            card.example
        ) {

            displayedExample =
                capitalizeFirstLetter(
                    card.example_pt
                    ||
                    "Translation not available yet."
                );

        }

    } else {

        displayedExample =
            capitalizeFirstLetter(
                card.example
                ||
                ""
            );

    }


    const exampleAudioPath =
        !isBack
            ? getExampleAudioPath(
                card.example
                ||
                ""
            )
            : null;


    const irregularForms =
        currentDeck ===
        "irregulars"

            ? `
                <div class="irregular-forms">

                    <div class="irregular-form">

                        <span class="irregular-form-label">
                            Past Simple
                        </span>

                        <span class="irregular-form-value">
                            ${
                                renderIrregularForms(
                                    card.past_simple
                                    ||
                                    []
                                )
                            }
                        </span>

                    </div>


                    <div class="irregular-form">

                        <span class="irregular-form-label">
                            Past Participle
                        </span>

                        <span class="irregular-form-value">
                            ${
                                renderIrregularForms(
                                    card.past_participle
                                    ||
                                    []
                                )
                            }
                        </span>

                    </div>

                </div>
            `

            : "";


    const partOfSpeech =
        (
            card.part_of_speech
            &&
            currentDeck !==
            "irregulars"
        )
            ? `
                <div class="part-of-speech">
                    ${
                        escapeHtml(
                            card.part_of_speech
                        )
                    }
                </div>
            `
            : "";


    const metaContent =
        currentDeck ===
        "irregulars"
            ? irregularForms
            : partOfSpeech;


    const flipButtonText =
        isBack
            ? "Show English"
            : "Show Translation";


    const mediaContent =
        imagePath
            ? `
                <img
                    class="card-image"
                    src="${
                        escapeHtml(
                            imagePath
                        )
                    }"
                    alt="${
                        escapeHtml(
                            card.word
                            ||
                            ""
                        )
                    }"
                >
            `
            : `
                <div
                    class="card-image-placeholder"
                ></div>
            `;


    const frequencyRankBadge =
        (
            currentDeck ===
            "words"
            ||
            currentDeck ===
            "irregulars"
        )
        &&
        Number.isInteger(
            Number(
                card.frequency_rank
            )
        )
            ? `
                <div
                    class="frequency-rank-badge"
                    title="Frequency rank among 34,002 words"
                    aria-label="Frequency rank ${
                        Number(
                            card.frequency_rank
                        )
                            .toLocaleString(
                                "en-US"
                            )
                    }"
                >
                    #${
                        Number(
                            card.frequency_rank
                        )
                            .toLocaleString(
                                "en-US"
                            )
                    }
                </div>
            `
            : "";


    app.innerHTML = `

        <div class="card-header">

            <button id="backButton">
                ← Back
            </button>

            <span>
                ${currentIndex + 1}
                /
                ${cards.length}
            </span>

        </div>


        <div class="card-stage">

            <button
                id="previousCardButton"
                class="card-nav-button previous"
                aria-label="Previous card"
                title="Previous card"
            >
                ‹
            </button>


            <article
                class="flashcard ${
                    isBack
                        ? "flashcard-back"
                        : "flashcard-front"
                }"
            >

                <div class="card-media">
                    ${mediaContent}
                    ${frequencyRankBadge}
                </div>


                <div class="card-content">

                    <h1>
                        ${
                            escapeHtml(
                                card.word
                                ||
                                ""
                            )
                        }
                    </h1>


                    <div
                        class="pronunciation-row ${
                            !card.pronunciation
                                ? "audio-only"
                                : ""
                        }"
                    >

                        ${
                            card.pronunciation
                                ? `
                                    <div class="pronunciation">
                                        ${
                                            escapeHtml(
                                                card.pronunciation
                                            )
                                        }
                                    </div>
                                `
                                : ""
                        }

                        ${
                            audioPath
                                ? `
                                    <button
                                        id="audioButton"
                                        class="audio-button"
                                        type="button"
                                        aria-label="Play pronunciation"
                                        title="Play pronunciation"
                                    >
                                        🔊
                                    </button>
                                `
                                : ""
                        }

                    </div>


                    <div class="card-meta-row">
                        ${metaContent}
                    </div>


                    <div class="definition-row">

                        <p class="definition">
                            ${
                                escapeHtml(
                                    displayedDefinition
                                )
                            }
                        </p>

                        ${
                            definitionAudioPath
                                ? `
                                    <button
                                        id="definitionAudioButton"
                                        class="text-audio-button"
                                        type="button"
                                        aria-label="Play definition"
                                        title="Play definition"
                                    >
                                        🔊
                                    </button>
                                `
                                : ""
                        }

                    </div>


                    <div class="example-row">

                        <p class="example">
                            ${
                                displayedExample
                                    ? escapeHtml(
                                        displayedExample
                                    )
                                    : ""
                            }
                        </p>

                        ${
                            (
                                displayedExample
                                &&
                                exampleAudioPath
                            )
                                ? `
                                    <button
                                        id="exampleAudioButton"
                                        class="text-audio-button"
                                        type="button"
                                        aria-label="Play example"
                                        title="Play example"
                                    >
                                        🔊
                                    </button>
                                `
                                : ""
                        }

                    </div>

                </div>

            </article>


            <button
                id="nextCardButton"
                class="card-nav-button next"
                aria-label="Next card"
                title="Next card"
            >
                ›
            </button>

        </div>


        <div class="answer-buttons">

            <button
                id="shouldLearnButton"
                class="should-learn-button"
                type="button"
            >
                Should Learn
            </button>

            <button
                id="flipButton"
                class="flip-button"
                type="button"
            >
                ${flipButtonText}
            </button>

            <button
                id="alreadyKnewButton"
                class="already-knew-button"
                type="button"
            >
                Already Knew
            </button>

        </div>
    `;


    document
        .getElementById(
            "backButton"
        )
        ?.addEventListener(
            "click",
            () => {

                if (
                    currentStudyMode
                ) {

                    openStudyMenu(
                        currentDeck
                    );

                } else {

                    goHome();

                }

            }
        );


    document
        .getElementById(
            "previousCardButton"
        )
        ?.addEventListener(
            "click",
            previousCard
        );


    document
        .getElementById(
            "nextCardButton"
        )
        ?.addEventListener(
            "click",
            nextCard
        );


    document
        .getElementById(
            "flipButton"
        )
        ?.addEventListener(
            "click",
            flipCard
        );


    document
        .getElementById(
            "shouldLearnButton"
        )
        ?.addEventListener(
            "click",
            () => {

                const currentCard =
                    cards[
                        currentIndex
                    ];


                if (
                    !currentCard
                ) {

                    return;

                }


                const previousStatus =
                    getCardStatus(
                        currentDeck,
                        currentCard
                    );


                setCardStatus(
                    currentDeck,
                    currentCard,
                    "learning"
                );


                if (
                    !currentStudyMode
                ) {

                    nextCard();

                    return;

                }


                if (
                    previousStatus ===
                    "learning"
                ) {

                    nextCard();

                    return;

                }


                removeCurrentCardFromStudyDeck();

            }
        );


    document
        .getElementById(
            "alreadyKnewButton"
        )
        ?.addEventListener(
            "click",
            () => {

                const currentCard =
                    cards[
                        currentIndex
                    ];


                if (
                    !currentCard
                ) {

                    return;

                }


                const previousStatus =
                    getCardStatus(
                        currentDeck,
                        currentCard
                    );


                setCardStatus(
                    currentDeck,
                    currentCard,
                    "known"
                );


                if (
                    !currentStudyMode
                ) {

                    nextCard();

                    return;

                }


                if (
                    previousStatus ===
                    "known"
                ) {

                    nextCard();

                    return;

                }


                removeCurrentCardFromStudyDeck();

            }
        );


    document
        .querySelectorAll(
            ".irregular-audio-button"
        )
        .forEach(
            button => {

                button
                    .addEventListener(
                        "click",
                        event => {

                            event.stopPropagation();


                            const audioPath =
                                button.dataset
                                    .audio;


                            if (
                                audioPath
                            ) {

                                playCardAudio(
                                    audioPath
                                );

                            }

                        }
                    );

            }
        );


    if (
        definitionAudioPath
    ) {

        document
            .getElementById(
                "definitionAudioButton"
            )
            ?.addEventListener(
                "click",
                event => {

                    event.stopPropagation();


                    playCardAudio(
                        definitionAudioPath
                    );

                }
            );

    }


    if (
        exampleAudioPath
    ) {

        document
            .getElementById(
                "exampleAudioButton"
            )
            ?.addEventListener(
                "click",
                event => {

                    event.stopPropagation();


                    playCardAudio(
                        exampleAudioPath
                    );

                }
            );

    }


    if (
        audioPath
    ) {

        document
            .getElementById(
                "audioButton"
            )
            ?.addEventListener(
                "click",
                event => {

                    event.stopPropagation();


                    playCardAudio(
                        audioPath
                    );

                }
            );

    }


    if (
        playAudio
        &&
        audioPath
    ) {

        setTimeout(
            () =>
                playCardAudio(
                    audioPath
                ),
            30
        );

    }

}


// ============================================================
// FLIP CARD
// ============================================================

function flipCard() {

    currentSide =
        currentSide ===
        "front"
            ? "back"
            : "front";


    showCard({
        playAudio:
            false
    });

}


// ============================================================
// REMOVE CURRENT CARD FROM STUDY DECK
// ============================================================

function removeCurrentCardFromStudyDeck() {

    if (
        !cards.length
    ) {

        return;

    }


    stopCurrentAudio();


    cards.splice(
        currentIndex,
        1
    );


    if (
        !cards.length
    ) {

        openStudyMenu(
            currentDeck
        );

        return;

    }


    if (
        currentIndex >=
        cards.length
    ) {

        currentIndex =
            cards.length -
            1;

    }


    currentSide =
        "front";


    showCard({
        playAudio:
            true
    });

}


// ============================================================
// MOVE CARD
// ============================================================

function moveCard(
    direction
) {

    if (
        !cards.length
    ) {

        return;

    }


    currentIndex =
        (
            currentIndex
            +
            direction
            +
            cards.length
        )
        %
        cards.length;


    currentSide =
        "front";


    showCard({
        playAudio:
            true
    });

}


// ============================================================
// NEXT / PREVIOUS
// ============================================================

function nextCard() {

    moveCard(
        1
    );

}


function previousCard() {

    moveCard(
        -1
    );

}


// ============================================================
// KEYBOARD NAVIGATION
// ============================================================

document.addEventListener(
    "keydown",
    event => {

        const element =
            document.activeElement;


        const typing =
            element
            &&
            (
                element.tagName ===
                "INPUT"
                ||
                element.tagName ===
                "TEXTAREA"
                ||
                element.isContentEditable
            );


        if (
            typing
            ||
            !currentDeck
            ||
            !cards.length
        ) {

            return;

        }


        if (
            event.key ===
            "ArrowRight"
        ) {

            event.preventDefault();

            nextCard();

            return;

        }


        if (
            event.key ===
            "ArrowLeft"
        ) {

            event.preventDefault();

            previousCard();

        }

    }
);


// ============================================================
// PREPARE SEARCH
// ============================================================

async function prepareSearch() {

    if (
        searchReady
        ||
        searchLoading
    ) {

        return;

    }


    searchLoading =
        true;


    searchStatus.textContent =
        "Loading dictionary...";


    try {

        const [
            wordCards,
            phraseCards
        ] =
            await Promise.all(
                [

                    loadDeck(
                        "words"
                    ),

                    loadDeck(
                        "phrases"
                    )

                ]
            );


        searchIndex = [

            ...wordCards.map(
                (
                    card,
                    index
                ) =>
                    createSearchItem(
                        card,
                        "words",
                        index
                    )
            ),

            ...phraseCards.map(
                (
                    card,
                    index
                ) =>
                    createSearchItem(
                        card,
                        "phrases",
                        index
                    )
            )

        ];


        searchReady =
            true;


        searchStatus.textContent =
            "";


    } catch (
        error
    ) {

        console.error(
            error
        );


        searchStatus.textContent =
            "Could not load search.";


    } finally {

        searchLoading =
            false;

    }

}


// ============================================================
// SEARCH ITEM
// ============================================================

function createSearchItem(
    card,
    deck,
    index
) {

    return {

        deck,

        index,

        senseId:
            card.sense_id
            ||
            null,

        word:
            card.word
            ||
            "",

        normalizedWord:
            normalizeSearch(
                card.word
                ||
                ""
            ),

        definition:
            card.definition
            ||
            "",

        partOfSpeech:
            card.part_of_speech
            ||
            ""

    };

}


// ============================================================
// SEARCH SCORE
// ============================================================

function getSearchScore(
    item,
    query
) {

    const word =
        item.normalizedWord;


    if (
        word ===
        query
    ) {

        return 0;

    }


    if (
        word.startsWith(
            query
        )
    ) {

        return 1;

    }


    const words =
        word.split(
            " "
        );


    if (
        words.some(
            part =>
                part ===
                query
        )
    ) {

        return 2;

    }


    if (
        words.some(
            part =>
                part.startsWith(
                    query
                )
        )
    ) {

        return 3;

    }


    if (
        word.includes(
            query
        )
    ) {

        return 4;

    }


    return Infinity;

}


// ============================================================
// SEARCH
// ============================================================

function searchCards(
    queryText
) {

    const query =
        normalizeSearch(
            queryText
        );


    if (
        !query
    ) {

        searchResults.innerHTML =
            "";


        searchResults
            .classList
            .remove(
                "visible"
            );


        searchStatus.textContent =
            "";


        return;

    }


    if (
        !searchReady
    ) {

        return;

    }


    const results =
        [];


    for (
        const item
        of searchIndex
    ) {

        const score =
            getSearchScore(
                item,
                query
            );


        if (
            score ===
            Infinity
        ) {

            continue;

        }


        results.push({
            item,
            score
        });


        if (
            results.length >=
            500
        ) {

            break;

        }

    }


    results.sort(
        (
            a,
            b
        ) =>
            a.score
            -
            b.score
            ||
            a.item.word.localeCompare(
                b.item.word,
                "en",
                {
                    sensitivity:
                        "base"
                }
            )
            ||
            a.item.index
            -
            b.item.index
    );


    renderSearchResults(
        results.slice(
            0,
            40
        ),
        query
    );

}


// ============================================================
// RENDER SEARCH RESULTS
// ============================================================

function renderSearchResults(
    results,
    query
) {

    if (
        !results.length
    ) {

        searchResults.innerHTML = `
            <div class="search-empty">
                No word or phrase found for
                "<strong>${
                    escapeHtml(
                        query
                    )
                }</strong>"
            </div>
        `;


        searchResults
            .classList
            .add(
                "visible"
            );


        searchStatus.textContent =
            "0 results";


        return;

    }


    searchStatus.textContent =
        `${results.length}${
            results.length ===
            40
                ? "+"
                : ""
        } result${
            results.length ===
            1
                ? ""
                : "s"
        }`;


    searchResults.innerHTML =
        results
            .map(
                (
                    result,
                    resultIndex
                ) => {

                    const item =
                        result.item;


                    const deckLabel =
                        item.deck ===
                        "words"
                            ? "Word"
                            : "Phrase";


                    return `
                        <button
                            class="search-result"
                            type="button"
                            data-result-index="${
                                resultIndex
                            }"
                        >

                            <span
                                class="search-result-word"
                            >
                                ${
                                    escapeHtml(
                                        item.word
                                    )
                                }
                            </span>

                            <span
                                class="search-result-meta"
                            >

                                <span
                                    class="search-result-type"
                                >
                                    ${deckLabel}
                                </span>

                                ${
                                    item.partOfSpeech
                                        ? `
                                            <span>
                                                ${
                                                    escapeHtml(
                                                        item.partOfSpeech
                                                    )
                                                }
                                            </span>
                                        `
                                        : ""
                                }

                            </span>

                            ${
                                item.definition
                                    ? `
                                        <span
                                            class="search-result-definition"
                                        >
                                            ${
                                                escapeHtml(
                                                    capitalizeFirstLetter(
                                                        item.definition
                                                    )
                                                )
                                            }
                                        </span>
                                    `
                                    : ""
                            }

                        </button>
                    `;

                }
            )
            .join(
                ""
            );


    searchResults
        .classList
        .add(
            "visible"
        );


    searchResults
        .querySelectorAll(
            ".search-result"
        )
        .forEach(
            (
                button,
                resultIndex
            ) => {

                button
                    .addEventListener(
                        "click",
                        () => {

                            const item =
                                results[
                                    resultIndex
                                ].item;


                            openDeck(
                                item.deck,
                                {
                                    index:
                                        item.index,

                                    senseId:
                                        item.senseId
                                }
                            );

                        }
                    );

            }
        );

}


// ============================================================
// SEARCH INPUT
// ============================================================

searchInput?.addEventListener(
    "focus",
    async () => {

        await prepareSearch();


        if (
            searchInput.value.trim()
        ) {

            searchCards(
                searchInput.value
            );

        }

    }
);


searchInput?.addEventListener(
    "input",
    async () => {

        clearTimeout(
            searchTimer
        );


        await prepareSearch();


        searchTimer =
            setTimeout(
                () =>
                    searchCards(
                        searchInput.value
                    ),
                80
            );

    }
);


// ============================================================
// SEARCH ENTER
// ============================================================

searchInput?.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Enter"
        ) {

            return;

        }


        const firstResult =
            searchResults
                .querySelector(
                    ".search-result"
                );


        if (
            firstResult
        ) {

            event.preventDefault();

            firstResult.click();

        }

    }
);


// ============================================================
// CLOSE SEARCH
// ============================================================

document.addEventListener(
    "click",
    event => {

        if (
            !searchContainer.contains(
                event.target
            )
        ) {

            searchResults
                .classList
                .remove(
                    "visible"
                );

        }

    }
);


// ============================================================
// HIDE SEARCH
// ============================================================

function hideSearch() {

    searchContainer.style.display =
        "none";


    searchResults
        .classList
        .remove(
            "visible"
        );

}


// ============================================================
// OFFLINE DOWNLOAD
// ============================================================

const OFFLINE_MEDIA_CACHE =
    "zwords-media-v1";

const OFFLINE_STATIC_CACHE =
    "zwords-static-vf2634284c1";

const OFFLINE_PROGRESS_KEY =
    "zwords_offline_packages_v1";

const OFFLINE_COMPLETE_MARKER =
    "./__zwords_offline_complete_v1__";

let offlineDownloadRunning =
    false;

// ============================================================
// OFFLINE CORE FILES
// ============================================================

const OFFLINE_CORE_FILES = [

    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./offline-manifest.json",
    "./libs/fflate.min.js",

    "./data/02_cards_words.json",
    "./data/03_cards_phrases.json",
    "./data/04_cards_irregular_verbs.json",

    "./data/audio_map.json",
    "./data/irregular_forms_audio_map.json",
    "./data/definition_audio_map.json",
    "./data/example_audio_map.json",

    "./icons/icon-180.png",
    "./icons/icon-192.png",
    "./icons/icon-512.png"

];

// ============================================================
// OFFLINE PROGRESS
// ============================================================

function getOfflineCompletedPackages() {

    try {

        const saved =
            localStorage.getItem(
                OFFLINE_PROGRESS_KEY
            );


        if (
            !saved
        ) {

            return new Set();

        }


        const parsed =
            JSON.parse(
                saved
            );


        return new Set(
            Array.isArray(
                parsed
            )
                ? parsed
                : []
        );


    } catch (
        error
    ) {

        console.error(
            "Could not read offline progress:",
            error
        );


        return new Set();

    }

}


function saveOfflineCompletedPackages(
    completed
) {

    try {

        localStorage.setItem(
            OFFLINE_PROGRESS_KEY,
            JSON.stringify(
                [
                    ...completed
                ]
            )
        );


    } catch (
        error
    ) {

        console.error(
            "Could not save offline progress:",
            error
        );

    }

}


// ============================================================
// OFFLINE COMPLETE MARKER
// ============================================================

async function hasOfflineCompleteMarker() {

    try {

        const cache =
            await caches.open(
                OFFLINE_STATIC_CACHE
            );


        const marker =
            await cache.match(
                OFFLINE_COMPLETE_MARKER,
                {
                    ignoreSearch:
                        true
                }
            );


        return Boolean(
            marker
        );


    } catch (
        error
    ) {

        console.error(
            "Could not check offline marker:",
            error
        );


        return false;

    }

}


async function saveOfflineCompleteMarker() {

    const cache =
        await caches.open(
            OFFLINE_STATIC_CACHE
        );


    const markerData = {

        complete:
            true,

        installedAt:
            new Date()
                .toISOString(),

        mediaCache:
            OFFLINE_MEDIA_CACHE,

        staticCache:
            OFFLINE_STATIC_CACHE

    };


    await cache.put(
        OFFLINE_COMPLETE_MARKER,
        new Response(
            JSON.stringify(
                markerData
            ),
            {
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        )
    );

}


// ============================================================
// REMOVE OFFLINE COMPLETE MARKER
// ============================================================

async function removeOfflineCompleteMarker() {

    try {

        const cache =
            await caches.open(
                OFFLINE_STATIC_CACHE
            );


        await cache.delete(
            OFFLINE_COMPLETE_MARKER,
            {
                ignoreSearch:
                    true
            }
        );


    } catch (
        error
    ) {

        console.error(
            "Could not remove offline marker:",
            error
        );

    }

}


// ============================================================
// CONTENT TYPE
// ============================================================

function getOfflineContentType(
    filename
) {

    const lower =
        filename.toLowerCase();


    if (
        lower.endsWith(
            ".webp"
        )
    ) {

        return "image/webp";

    }


    if (
        lower.endsWith(
            ".png"
        )
    ) {

        return "image/png";

    }


    if (
        lower.endsWith(
            ".jpg"
        )
        ||
        lower.endsWith(
            ".jpeg"
        )
    ) {

        return "image/jpeg";

    }


    if (
        lower.endsWith(
            ".mp3"
        )
    ) {

        return "audio/mpeg";

    }


    if (
        lower.endsWith(
            ".m4a"
        )
    ) {

        return "audio/mp4";

    }


    if (
        lower.endsWith(
            ".wav"
        )
    ) {

        return "audio/wav";

    }


    if (
        lower.endsWith(
            ".ogg"
        )
    ) {

        return "audio/ogg";

    }


    if (
        lower.endsWith(
            ".json"
        )
    ) {

        return "application/json";

    }


    return "application/octet-stream";

}


// ============================================================
// FORMAT SIZE
// ============================================================

function formatOfflineBytes(
    bytes
) {

    const gb =
        bytes
        /
        1024
        /
        1024
        /
        1024;


    if (
        gb >= 1
    ) {

        return `${gb.toFixed(2)} GB`;

    }


    return `${
        (
            bytes
            /
            1024
            /
            1024
        ).toFixed(1)
    } MB`;

}

// ============================================================
// INSTALL CORE FILES
// ============================================================

async function installOfflineCore(
    status
) {

    const cache =
        await caches.open(
            OFFLINE_STATIC_CACHE
        );


    for (
        let i = 0;
        i < OFFLINE_CORE_FILES.length;
        i++
    ) {

        const file =
            OFFLINE_CORE_FILES[
                i
            ];


        status.textContent =
            `Preparing app ${
                i + 1
            } / ${
                OFFLINE_CORE_FILES.length
            }`;


        // ====================================================
        // ALREADY CACHED
        // ====================================================

        const cached =
            await cache.match(
                file,
                {
                    ignoreSearch:
                        true
                }
            );


        if (
            cached
        ) {

            console.log(
                "Core file already cached:",
                file
            );

            continue;

        }


        // ====================================================
        // DOWNLOAD WITH RETRY
        // ====================================================

        let lastError =
            null;

        let installed =
            false;


        for (
            let attempt = 1;
            attempt <= 4;
            attempt++
        ) {

            try {

                status.textContent =
                    `Preparing app ${
                        i + 1
                    } / ${
                        OFFLINE_CORE_FILES.length
                    } • attempt ${attempt}`;


                const response =
                    await fetch(
                        file
                    );


                if (
                    !response.ok
                ) {

                    throw new Error(
                        `HTTP ${response.status}`
                    );

                }


                await cache.put(
                    file,
                    response.clone()
                );


                installed =
                    true;


                console.log(
                    "Core file installed:",
                    file
                );


                break;


            } catch (
                error
            ) {

                lastError =
                    error;


                console.warn(
                    `Core file ${file}, attempt ${attempt} failed:`,
                    error
                );


                if (
                    attempt < 4
                ) {

                    status.textContent =
                        `Retrying ${
                            file
                        } • attempt ${
                            attempt + 1
                        } / 4`;


                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                attempt * 2000
                            )
                    );

                }

            }

        }


        if (
            !installed
        ) {

            throw new Error(
                `Could not install core file: ${file} · ${
                    lastError?.message
                    ||
                    "Unknown error"
                }`
            );

        }

    }

}


// ============================================================
// DOWNLOAD ONE PACKAGE
// ============================================================

async function downloadOfflinePackage(
    pkg,
    onProgress
) {

    let lastError =
        null;


    for (
        let attempt = 1;
        attempt <= 4;
        attempt++
    ) {

        try {

            const response =
                await fetch(
                    pkg.url
                );


            if (
                !response.ok
            ) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }


            if (
                !response.body
            ) {

                throw new Error(
                    "Streaming unavailable"
                );

            }


            const reader =
                response.body
                    .getReader();


            const chunks =
                [];


            let received =
                0;


            while (
                true
            ) {

                const {
                    done,
                    value
                } =
                    await reader.read();


                if (
                    done
                ) {

                    break;

                }


                chunks.push(
                    value
                );


                received +=
                    value.byteLength;


                onProgress(
                    received
                );

            }


            return new Blob(
                chunks,
                {
                    type:
                        "application/zip"
                }
            );


        } catch (
            error
        ) {

            lastError =
                error;


            console.warn(
                `Package ${
                    pkg.id
                }, attempt ${
                    attempt
                } failed:`,
                error
            );


            if (
                attempt < 4
            ) {

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            attempt * 2000
                        )
                );

            }

        }

    }


    throw lastError;

}


// ============================================================
// INSTALL PACKAGE
// ============================================================

async function installOfflinePackage(
    zipBlob,
    pkg,
    status
) {

    const zipBuffer =
        await zipBlob
            .arrayBuffer();


    status.textContent =
        `Unpacking ${pkg.id}...`;


    const unzipped =
        fflate.unzipSync(
            new Uint8Array(
                zipBuffer
            )
        );


    const entries =
        Object.entries(
            unzipped
        );


    if (
        !entries.length
    ) {

        throw new Error(
            `Package ${pkg.id} is empty.`
        );

    }


    const cache =
        await caches.open(
            OFFLINE_MEDIA_CACHE
        );


    let installed =
        0;


    for (
        const [
            filename,
            fileData
        ]
        of entries
    ) {

        if (
            filename.endsWith(
                "/"
            )
        ) {

            continue;

        }


        const cleanFilename =
            filename.replace(
                /^\.?\//,
                ""
            );


        const fileUrl =
            new URL(
                cleanFilename,
                window.location.href
            ).href;


        const response =
            new Response(
                fileData,
                {
                    headers: {
                        "Content-Type":
                            getOfflineContentType(
                                cleanFilename
                            )
                    }
                }
            );


        try {

            await cache.put(
                fileUrl,
                response
            );


        } catch (
            error
        ) {

            if (
                error?.name ===
                "QuotaExceededError"
            ) {

                throw new Error(
                    "Storage limit reached on this device."
                );

            }


            throw error;

        }


        installed++;


        if (
            installed % 100 === 0
            ||
            installed === entries.length
        ) {

            status.textContent =
                `Installing ${pkg.id}: ${
                    installed.toLocaleString(
                        "en-US"
                    )
                } / ${
                    entries.length.toLocaleString(
                        "en-US"
                    )
                }`;

        }

    }


    if (
        Number(
            pkg.fileCount
        ) > 0
        &&
        installed !==
        Number(
            pkg.fileCount
        )
    ) {

        throw new Error(
            `Package ${pkg.id} installed ${installed} files, expected ${pkg.fileCount}.`
        );

    }


    return installed;

}


// ============================================================
// INITIALIZE OFFLINE DOWNLOAD
// ============================================================

async function initializeOfflineTest() {

    const button =
        document.getElementById(
            "offlineTestButton"
        );


    const status =
        document.getElementById(
            "offlineTestStatus"
        );


    const progressBar =
        document.getElementById(
            "offlineTestProgressBar"
        );


    if (
        !button
        ||
        !status
        ||
        !progressBar
    ) {

        return;

    }


    // ========================================================
    // ALREADY FULLY INSTALLED
    // ========================================================

    if (
        await hasOfflineCompleteMarker()
    ) {

        progressBar.style.width =
            "100%";


        status.textContent =
            "Offline installation complete";


        button.textContent =
            "Offline Content Installed";


        button.disabled =
            true;


        return;

    }


    // ========================================================
    // PARTIAL INSTALLATION
    // ========================================================

    const previousCompleted =
        getOfflineCompletedPackages();


    if (
        previousCompleted.size
    ) {

        status.textContent =
            `${
                previousCompleted.size
            } packages already installed. Tap to resume.`;

    }


    // ========================================================
    // DOWNLOAD BUTTON
    // ========================================================

    button.addEventListener(
        "click",
        async () => {

            if (
                offlineDownloadRunning
            ) {

                return;

            }


            offlineDownloadRunning =
                true;


            button.disabled =
                true;


            try {

                // ====================================================
                // PERSISTENT STORAGE
                // ====================================================

                if (
                    navigator.storage
                    ?.persist
                ) {

                    try {

                        const persisted =
                            await navigator.storage
                                .persist();


                        console.log(
                            "Persistent storage:",
                            persisted
                        );


                    } catch (
                        error
                    ) {

                        console.warn(
                            "Persistent storage unavailable:",
                            error
                        );

                    }

                }


                // ====================================================
                // INSTALLATION IS NOT COMPLETE YET
                // ====================================================

                await removeOfflineCompleteMarker();


                // ====================================================
                // CORE APP
                // ====================================================

                status.textContent =
                    "Preparing ZWords for offline use...";


                await installOfflineCore(
                    status
                );


                // ====================================================
                // MANIFEST
                // ====================================================

                status.textContent =
                    "Loading offline package list...";


                const manifestResponse =
                    await fetch(
                        "offline-manifest.json"
                    );


                if (
                    !manifestResponse.ok
                ) {

                    throw new Error(
                        `Manifest HTTP ${
                            manifestResponse.status
                        }`
                    );

                }


                const manifest =
                    await manifestResponse
                        .json();


                const packages =
                    manifest.packages;


                if (
                    !Array.isArray(
                        packages
                    )
                    ||
                    !packages.length
                ) {

                    throw new Error(
                        "Offline manifest contains no packages."
                    );

                }


                const completed =
                    getOfflineCompletedPackages();


                // ====================================================
                // REMOVE INVALID OLD PACKAGE IDS
                // ====================================================

                const validPackageIds =
                    new Set(
                        packages.map(
                            pkg =>
                                pkg.id
                        )
                    );


                for (
                    const packageId
                    of [
                        ...completed
                    ]
                ) {

                    if (
                        !validPackageIds.has(
                            packageId
                        )
                    ) {

                        completed.delete(
                            packageId
                        );

                    }

                }


                saveOfflineCompletedPackages(
                    completed
                );


                // ====================================================
                // TOTAL SIZE
                // ====================================================

                const totalBytes =
                    packages.reduce(
                        (
                            sum,
                            pkg
                        ) =>
                            sum
                            +
                            Number(
                                pkg.sizeBytes
                                ||
                                0
                            ),
                        0
                    );


                let completedBytes =
                    packages.reduce(
                        (
                            sum,
                            pkg
                        ) =>
                            completed.has(
                                pkg.id
                            )
                                ? sum
                                    +
                                    Number(
                                        pkg.sizeBytes
                                        ||
                                        0
                                    )
                                : sum,
                        0
                    );


                let completedFiles =
                    packages.reduce(
                        (
                            sum,
                            pkg
                        ) =>
                            completed.has(
                                pkg.id
                            )
                                ? sum
                                    +
                                    Number(
                                        pkg.fileCount
                                        ||
                                        0
                                    )
                                : sum,
                        0
                    );


                // ====================================================
                // INITIAL PROGRESS
                // ====================================================

                if (
                    totalBytes > 0
                ) {

                    const initialPercent =
                        (
                            completedBytes
                            /
                            totalBytes
                        )
                        *
                        100;


                    progressBar.style.width =
                        `${
                            Math.min(
                                100,
                                initialPercent
                            ).toFixed(
                                2
                            )
                        }%`;

                }


                // ====================================================
                // PACKAGES
                //
                // Each package still gets its own internal retry (see
                // downloadOfflinePackage). On top of that, a package that
                // keeps failing does NOT stop the whole run anymore -- it
                // is set aside and the loop moves on to the next package,
                // so one bad/blocked package never blocks the other ~440.
                // Left-over packages are retried automatically in extra
                // rounds (with a pause between rounds) before finally
                // giving up and asking the user to tap again.
                // ====================================================

                async function downloadAndInstallPackage(pkg, index) {

                    let currentBytes = 0;

                    status.textContent =
                        `Package ${index + 1} / ${packages.length}: ${pkg.id}`;

                    const zipBlob =
                        await downloadOfflinePackage(
                            pkg,
                            received => {

                                currentBytes = received;

                                const overallBytes =
                                    completedBytes + currentBytes;

                                const percent =
                                    totalBytes
                                        ? (overallBytes / totalBytes) * 100
                                        : 0;

                                progressBar.style.width =
                                    `${Math.min(100, percent).toFixed(2)}%`;

                                status.textContent =
                                    `${percent.toFixed(2)}% • ` +
                                    `${formatOfflineBytes(overallBytes)} / ` +
                                    `${formatOfflineBytes(totalBytes)} • ${pkg.id}`;

                            }
                        );

                    // INSTALL PACKAGE CONTENT

                    const installedFiles =
                        await installOfflinePackage(zipBlob, pkg, status);

                    // PACKAGE COMPLETE

                    completed.add(pkg.id);

                    saveOfflineCompletedPackages(completed);

                    completedBytes +=
                        Number(pkg.sizeBytes || zipBlob.size);

                    completedFiles += installedFiles;

                    const completedPercent =
                        totalBytes
                            ? (completedBytes / totalBytes) * 100
                            : 100;

                    progressBar.style.width =
                        `${Math.min(100, completedPercent).toFixed(2)}%`;

                    status.textContent =
                        `${completed.size} / ${packages.length} packages installed`;

                }


                let pendingPackages =
                    packages
                        .map((pkg, index) => ({ pkg, index }))
                        .filter(({ pkg }) => !completed.has(pkg.id));

                const MAX_AUTO_RETRY_ROUNDS = 6;

                const RETRY_ROUND_DELAY_MS = 15000;

                for (
                    let round = 1;
                    round <= MAX_AUTO_RETRY_ROUNDS && pendingPackages.length;
                    round++
                ) {

                    const stillFailing = [];

                    for (const { pkg, index } of pendingPackages) {

                        try {

                            await downloadAndInstallPackage(pkg, index);

                        } catch (error) {

                            console.warn(
                                `Package ${pkg.id} failed on round ${round}:`,
                                error
                            );

                            stillFailing.push({ pkg, index });

                        }

                    }

                    pendingPackages = stillFailing;

                    if (
                        pendingPackages.length
                        &&
                        round < MAX_AUTO_RETRY_ROUNDS
                    ) {

                        status.textContent =
                            `${pendingPackages.length} package(s) failed, ` +
                            `retrying automatically in ` +
                            `${RETRY_ROUND_DELAY_MS / 1000}s...`;

                        await new Promise(
                            resolve => setTimeout(resolve, RETRY_ROUND_DELAY_MS)
                        );

                    }

                }

                if (pendingPackages.length) {

                    throw new Error(
                        `${pendingPackages.length} package(s) still failing ` +
                        `after ${MAX_AUTO_RETRY_ROUNDS} automatic retry rounds.`
                    );

                }


                // ====================================================
                // VERIFY ALL PACKAGES COMPLETED
                // ====================================================

                if (
                    completed.size !==
                    packages.length
                ) {

                    throw new Error(
                        `Offline installation incomplete: ${completed.size} / ${packages.length} packages.`
                    );

                }


                // ====================================================
                // VERIFY EXPECTED MEDIA FILE COUNT
                // ====================================================

                const expectedMediaFiles =
                    packages.reduce(
                        (
                            sum,
                            pkg
                        ) =>
                            sum
                            +
                            Number(
                                pkg.fileCount
                                ||
                                0
                            ),
                        0
                    );


                if (
                    completedFiles !==
                    expectedMediaFiles
                ) {

                    throw new Error(
                        `Offline media count mismatch: ${completedFiles} installed, ${expectedMediaFiles} expected.`
                    );

                }


                // ====================================================
                // COMPLETE
                // ====================================================

                await saveOfflineCompleteMarker();


                progressBar.style.width =
                    "100%";


                status.textContent =
                    `Offline installation complete: ${
                        completedFiles.toLocaleString(
                            "en-US"
                        )
                    } media files installed`;


                button.textContent =
                    "Offline Content Installed";


                button.disabled =
                    true;


                console.log(
                    "Offline installation complete:",
                    {
                        packages:
                            completed.size,

                        mediaFiles:
                            completedFiles,

                        totalBytes:
                            totalBytes,

                        mediaCache:
                            OFFLINE_MEDIA_CACHE,

                        staticCache:
                            OFFLINE_STATIC_CACHE
                    }
                );


            } catch (
                error
            ) {

                console.error(
                    "Offline installation failed:",
                    error
                );


                status.textContent =
                    `Stopped: ${
                        error.message
                    }. Tap again to resume.`;


            } finally {

                offlineDownloadRunning =
                    false;


                if (
                    !await hasOfflineCompleteMarker()
                ) {

                    button.disabled =
                        false;

                }

            }

        }
    );

}


// ============================================================
// INITIALIZE OFFLINE DOWNLOAD
// ============================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeOfflineTest
    );

} else {

    initializeOfflineTest();

}


// ============================================================
// FFLATE CHECK
// ============================================================

console.log(
    "fflate loaded:",
    typeof fflate !==
    "undefined"
);


// ============================================================
// HOME
// ============================================================

function goHome() {

    stopCurrentAudio();

    location.reload();

}