const API_URL = "/api/learning";

let editingId = null;


/* ================= PAGE LOADER ================= */

window.addEventListener("load", () => {

    setTimeout(() => {

        document
            .getElementById("pageLoader")
            .classList.add("hidden");

    }, 500);

});


/* ================= LOAD DATA ================= */

async function loadLearningItems() {

    try {

        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error("Failed to load data");
        }

        const items = await response.json();

        renderDashboard(items);

    } catch (error) {

        console.error(error);

        showToast(
            "Unable to connect to backend"
        );
    }
}


/* ================= DASHBOARD ================= */

function renderDashboard(items) {

    updateStats(items);

    renderProgress(items);

    renderLearningList(items);

    updateHeroProgress(items);
}


/* ================= STATS ================= */

function updateStats(items) {

    const total = items.length;

    const completed =
        items.filter(
            item =>
                item.status === "Completed"
        ).length;

    const inProgress =
        items.filter(
            item =>
                item.status === "In Progress"
        ).length;

    const average =
        total === 0
            ? 0
            : Math.round(
                items.reduce(
                    (sum, item) =>
                        sum +
                        Number(item.progress),
                    0
                ) / total
            );


    document.getElementById(
        "totalTopics"
    ).textContent = total;


    document.getElementById(
        "completedTopics"
    ).textContent = completed;


    document.getElementById(
        "progressTopics"
    ).textContent = inProgress;


    animateNumber(
        document.getElementById(
            "averageProgress"
        ),
        average,
        "%"
    );
}


/* ================= HERO ================= */

function updateHeroProgress(items) {

    const total = items.length;

    const average =
        total === 0
            ? 0
            : Math.round(
                items.reduce(
                    (sum, item) =>
                        sum +
                        Number(item.progress),
                    0
                ) / total
            );


    document.getElementById(
        "heroProgress"
    ).textContent = `${average}%`;


    document.getElementById(
        "heroProgressBar"
    ).style.width = `${average}%`;


    const orbital =
        document.querySelector(
            ".orbital"
        );


    orbital.style.background =
        `conic-gradient(
            var(--primary) ${average * 3.6}deg,
            rgba(255,255,255,.08) 0deg
        )`;


    const completed =
        items.filter(
            item =>
                item.status === "Completed"
        ).length;


    const heroText =
        document.getElementById(
            "heroCompletedText"
        );


    if (total === 0) {

        heroText.textContent =
            "Start your journey";

    } else {

        heroText.textContent =
            `${completed} topic${completed === 1 ? "" : "s"} completed`;

    }
}


/* ================= PROGRESS CARDS ================= */

function renderProgress(items) {

    const container =
        document.getElementById(
            "progressGrid"
        );


    if (items.length === 0) {

        container.innerHTML = `
            <div class="empty">

                <div style="font-size:32px;">
                    🚀
                </div>

                <div style="margin-top:8px;">
                    Your learning journey starts here.
                </div>

                <div style="margin-top:5px;font-size:9px;">
                    Add your first DevOps topic.
                </div>

            </div>
        `;

        return;
    }


    container.innerHTML =
        items
            .slice(0, 6)
            .map(item => {

                return `
                    <div class="progress-card">

                        <div class="progress-top">

                            <span class="progress-title">
                                ${escapeHtml(item.title)}
                            </span>

                            <span class="progress-percent">
                                ${item.progress}%
                            </span>

                        </div>


                        <div class="progress-bar">

                            <div
                                class="progress-fill"
                                style="width:${item.progress}%"
                            ></div>

                        </div>


                        <div class="progress-meta">

                            ${escapeHtml(item.category)}
                            •
                            ${escapeHtml(item.status)}

                        </div>

                    </div>
                `;

            })
            .join("");
}


/* ================= LEARNING LIST ================= */

function renderLearningList(items) {

    const container =
        document.getElementById(
            "learningList"
        );


    if (items.length === 0) {

        container.innerHTML = `
            <div class="empty">

                No learning items yet.

            </div>
        `;

        return;
    }


    container.innerHTML =
        items
            .map(item => {

                let statusClass =
                    "not-started";


                if (
                    item.status ===
                    "Completed"
                ) {
                    statusClass =
                        "completed";
                }


                if (
                    item.status ===
                    "In Progress"
                ) {
                    statusClass =
                        "progress";
                }


                return `
                    <div class="learning-card">

                        <div>

                            <div class="learning-title">
                                ${escapeHtml(item.title)}
                            </div>

                            <span class="category">
                                ${escapeHtml(item.category)}
                            </span>

                        </div>


                        <div>

                            <span class="status ${statusClass}">
                                ${escapeHtml(item.status)}
                            </span>

                        </div>


                        <div class="item-progress">

                            <div class="progress-bar">

                                <div
                                    class="progress-fill"
                                    style="width:${item.progress}%"
                                ></div>

                            </div>

                            <span>
                                ${item.progress}%
                            </span>

                        </div>


                        <div class="actions">

                            <button
                                class="action-btn"
                                onclick="editItem(${item.id})"
                                title="Edit"
                            >
                                ✏️
                            </button>

                            <button
                                class="action-btn"
                                onclick="deleteItem(${item.id})"
                                title="Delete"
                            >
                                🗑️
                            </button>

                        </div>

                    </div>
                `;

            })
            .join("");
}


/* ================= SAVE ================= */

async function saveItem(event) {

    event.preventDefault();


    const title =
        document
            .getElementById("title")
            .value
            .trim();


    const category =
        document
            .getElementById("category")
            .value;


    const status =
        document
            .getElementById("status")
            .value;


    const progress =
        Number(
            document
                .getElementById("progress")
                .value
        );


    const data = {
        title,
        category,
        status,
        progress
    };


    try {

        let response;


        if (editingId) {

            response =
                await fetch(
                    `${API_URL}/${editingId}`,
                    {
                        method: "PUT",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(data)
                    }
                );

        } else {

            response =
                await fetch(
                    API_URL,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(data)
                    }
                );
        }


        if (!response.ok) {

            throw new Error(
                "Save failed"
            );

        }


        const wasEditing =
            Boolean(editingId);


        closeModal();

        resetForm();

        await loadLearningItems();


        showToast(
            wasEditing
                ? "✓ Learning updated"
                : "✓ Learning added"
        );


    } catch (error) {

        console.error(error);

        showToast(
            "Something went wrong"
        );
    }
}


/* ================= EDIT ================= */

async function editItem(id) {

    try {

        const response =
            await fetch(API_URL);

        const items =
            await response.json();


        const item =
            items.find(
                item =>
                    item.id === id
            );


        if (!item) {
            return;
        }


        editingId = id;


        document.getElementById(
            "title"
        ).value =
            item.title;


        document.getElementById(
            "category"
        ).value =
            item.category;


        document.getElementById(
            "status"
        ).value =
            item.status;


        document.getElementById(
            "progress"
        ).value =
            item.progress;


        updateRangeValue();

        openModal();


    } catch (error) {

        console.error(error);

        showToast(
            "Unable to edit item"
        );
    }
}


/* ================= DELETE ================= */

async function deleteItem(id) {

    if (
        !confirm(
            "Delete this learning item?"
        )
    ) {
        return;
    }


    try {

        const response =
            await fetch(
                `${API_URL}/${id}`,
                {
                    method: "DELETE"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Delete failed"
            );
        }


        await loadLearningItems();


        showToast(
            "✓ Learning deleted"
        );


    } catch (error) {

        console.error(error);

        showToast(
            "Unable to delete item"
        );
    }
}


/* ================= MODAL ================= */

function openModal() {

    document
        .getElementById("modal")
        .classList.add("show");


    setTimeout(() => {

        document
            .getElementById("title")
            .focus();

    }, 250);
}


function closeModal() {

    document
        .getElementById("modal")
        .classList.remove("show");

    editingId = null;
}


function resetForm() {

    document
        .getElementById("learningForm")
        .reset();


    document
        .getElementById("progress")
        .value = 0;


    updateRangeValue();
}


/* ================= RANGE ================= */

function updateRangeValue() {

    const value =
        document
            .getElementById("progress")
            .value;


    document.getElementById(
        "rangeValue"
    ).textContent =
        `${value}%`;
}


/* ================= TOAST ================= */

function showToast(message) {

    const toast =
        document.getElementById(
            "toast"
        );


    toast.textContent = message;

    toast.classList.add("show");


    setTimeout(() => {

        toast.classList.remove(
            "show"
        );

    }, 2500);
}


/* ================= NUMBER ANIMATION ================= */

function animateNumber(
    element,
    target,
    suffix = ""
) {

    const duration = 500;

    const start =
        Number(
            element.textContent
                .replace("%", "")
        ) || 0;


    const startTime =
        performance.now();


    function update(currentTime) {

        const elapsed =
            currentTime - startTime;


        const progress =
            Math.min(
                elapsed / duration,
                1
            );


        const eased =
            1 -
            Math.pow(
                1 - progress,
                3
            );


        const value =
            Math.round(
                start +
                (target - start) *
                eased
            );


        element.textContent =
            `${value}${suffix}`;


        if (progress < 1) {

            requestAnimationFrame(
                update
            );
        }
    }


    requestAnimationFrame(
        update
    );
}


/* ================= ESCAPE HTML ================= */

function escapeHtml(text) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        text;


    return div.innerHTML;
}


/* ================= EVENTS ================= */

document
    .getElementById(
        "learningForm"
    )
    .addEventListener(
        "submit",
        saveItem
    );


document
    .getElementById(
        "modal"
    )
    .addEventListener(
        "click",
        event => {

            if (
                event.target.id ===
                "modal"
            ) {

                closeModal();

            }

        }
    );


document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {

            closeModal();

        }

    }
);


/* ================= NAVIGATION ================= */

const navLinks =
    document.querySelectorAll(
        ".nav-link"
    );


window.addEventListener(
    "scroll",
    () => {

        let current = "";


        document
            .querySelectorAll(
                "section[id]"
            )
            .forEach(section => {

                const top =
                    section.offsetTop -
                    150;


                if (
                    window.scrollY >=
                    top
                ) {

                    current =
                        section.id;

                }

            });


        navLinks.forEach(link => {

            link.classList.remove(
                "active"
            );


            if (
                link
                    .getAttribute("href")
                    ?.includes(current)
            ) {

                link.classList.add(
                    "active"
                );

            }

        });

    }
);


/* ================= START ================= */

loadLearningItems();

