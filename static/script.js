const searchResult = document.getElementById("search-result");
const filterGroup = document.getElementById("room-filter");
const dayGroup = document.getElementById("day-filter");
const periodGroup = document.getElementById("period-filter");

const compactDayField = document.getElementById("compact-day-field");
const compactPeriodField = document.getElementById("compact-period-field");
const compactTypeField = document.getElementById("compact-type-field");
const compactDayPicker = document.querySelector(".compact-day-picker");
const compactPeriodPicker = document.querySelector(".compact-period-picker");
const compactTypePicker = document.querySelector(".compact-type-picker");
const compactDayList = document.querySelector("#compact-day-options .compact-option-list");
const compactPeriodList = document.querySelector("#compact-period-options .compact-option-list");
const compactTypeList = document.querySelector("#compact-type-options .compact-option-list");

let activeDay = "Sunday";
let activePeriod = "";
let activeFilter = "all";
let longPressTimer = null;

function setCompactSelectionLabels() {
    const dayValue = activeDay || "Sunday";
    const periodValue = activePeriod ? activePeriod.split(" - ")[0] : "Select period";
    const typeValue = activeFilter ? (activeFilter === "all" ? "All" : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)) : "All";
    document.querySelector(".compact-day-picker .selected-value").textContent = dayValue;
    document.querySelector(".compact-period-picker .selected-value").textContent = periodValue;
    document.querySelector(".compact-type-picker .selected-value").textContent = typeValue;
}

function syncCompactOptions() {
    if (dayGroup) {
        compactDayList.innerHTML = Array.from(dayGroup.querySelectorAll(".filter-item")).map((button) => {
            const activeClass = button.classList.contains("active") ? " active" : "";
            return `<button type="button" class="compact-option${activeClass}" data-group="day" data-value="${button.dataset.value}">${button.textContent}</button>`;
        }).join("");
    }

    if (periodGroup) {
        compactPeriodList.innerHTML = Array.from(periodGroup.querySelectorAll(".filter-item")).map((button) => {
            const activeClass = button.classList.contains("active") ? " active" : "";
            return `<button type="button" class="compact-option${activeClass}" data-group="period" data-value="${button.dataset.value}">${button.textContent}</button>`;
        }).join("");
    }

    const roomFilter = document.getElementById("room-filter");
    if (roomFilter) {
        compactTypeList.innerHTML = Array.from(roomFilter.querySelectorAll(".filter-item")).map((button) => {
            const activeClass = button.classList.contains("active") ? " active" : "";
            return `<button type="button" class="compact-option${activeClass}" data-group="type" data-value="${button.dataset.value}">${button.textContent}</button>`;
        }).join("");
    }
}

function openCompactPicker(picker) {
    closeAllCompactPickers();
    picker.classList.add("open");
    picker.setAttribute("aria-expanded", "true");
}

function closeCompactPicker(picker) {
    picker.classList.remove("open");
    picker.setAttribute("aria-expanded", "false");
}

function closeAllCompactPickers() {
    closeCompactPicker(compactDayPicker);
    closeCompactPicker(compactPeriodPicker);
    closeCompactPicker(compactTypePicker);
}

function handleCompactSelection(groupType, value) {
    if (groupType === "day") {
        activeDay = value;
        updateGroupButtons(dayGroup, value);
        closeCompactPicker(compactDayPicker);
    } else if (groupType === "period") {
        activePeriod = value;
        updateGroupButtons(periodGroup, value);
        closeCompactPicker(compactPeriodPicker);
    } else if (groupType === "type") {
        activeFilter = value;
        updateGroupButtons(filterGroup, value);
        closeCompactPicker(compactTypePicker);
    }
    setCompactSelectionLabels();
    handleSearch();
}

function onCompactOptionClick(event) {
    const button = event.target.closest(".compact-option");
    if (!button) return;
    handleCompactSelection(button.dataset.group, button.dataset.value);
}

function startLongPress(picker) {
    longPressTimer = window.setTimeout(() => openCompactPicker(picker), 400);
}

function cancelLongPress() {
    if (longPressTimer) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

function toggleCompactPicker(picker) {
    if (picker.classList.contains("open")) {
        closeCompactPicker(picker);
    } else {
        openCompactPicker(picker);
    }
}

async function fetchSchedule() {
    try {
        const response = await fetch("/api/room-schedule");
        const data = await response.json();

        if (!response.ok) {
            searchResult.innerHTML = `<div class="empty-state"><p>Unable to load schedule data.</p></div>`;
            return;
        }

        if (periodGroup && Array.isArray(data.periods)) {
            periodGroup.innerHTML = data.periods
                .map((period, index) => {
                    const label = period.split(" - ")[0]; 
                    return `<button type="button" class="filter-item${index === 0 ? " active" : ""}" data-value="${period}">${label}</button>`;
                })
                .join("");
            activePeriod = data.periods[0] || "";
        }

        syncCompactOptions();
        setCompactSelectionLabels();
        
        handleSearch();
    } catch (error) {
        searchResult.innerHTML = `<div class="empty-state"><p>Connection error. Please try again.</p></div>`;
    }
}

function parseFloorName(room) {
    const upper = room.toUpperCase();
    if (upper.startsWith("AN1-") || upper.startsWith("AN2-")) return "Annex";
    if (upper === "UB0000") return null;
    if (upper.startsWith("FT")) return "Facilities Tower";

    const match = upper.match(/^([0-9]{1,2})/);
    if (match) {
        const floorNumber = Number(match[1]);
        const suffix = floorNumber === 1 ? "st" : floorNumber === 2 ? "nd" : floorNumber === 3 ? "rd" : "th";
        return `${floorNumber}${suffix} Floor`;
    }

    return "Other";
}

function formatGroupedRooms(rooms) {
    const groups = {};
    rooms.forEach((room) => {
        const floor = parseFloorName(room);
        if (!floor) return;
        groups[floor] = groups[floor] || [];
        groups[floor].push(room);
    });

    const order = [
        "Annex",
        "Facilities Tower",
        "1st Floor",
        "2nd Floor",
        "3rd Floor",
        "4th Floor",
        "5th Floor",
        "6th Floor",
        "7th Floor",
        "8th Floor",
        "9th Floor",
        "10th Floor",
        "11th Floor",
        "12th Floor",
        "Other",
    ];

    const html = order
        .filter((key) => groups[key])
        .map((key) => {
            const list = groups[key].sort((a, b) => a.localeCompare(b));
            const cards = list.map((r) => `
                <div class="room-card">
                    <span class="room-name">${r}</span>
                </div>
            `).join("");
            
            return `
                <section class="floor-section">
                    <h2 class="floor-title">${key}</h2>
                    <div class="room-grid">
                        ${cards}
                    </div>
                </section>
            `;
        })
        .join("");

    return html;
}

function roomTypeOf(room) {
    if (!room || typeof room !== 'string') return null;
    const last = room.trim().slice(-1).toUpperCase();
    if (last === 'C' || last === 'T') return 'class';
    if (last === 'L') return 'lab';
    return 'other';
}

function applyFilter(rooms, filter) {
    if (!filter || filter === 'all') return rooms;
    if (filter === 'class') return rooms.filter((r) => roomTypeOf(r) === 'class');
    if (filter === 'lab') return rooms.filter((r) => roomTypeOf(r) === 'lab');
    return rooms;
}

function updateGroupButtons(group, selectedValue) {
    if (!group) return;
    const buttons = group.querySelectorAll(".filter-item");
    buttons.forEach((button) => {
        button.classList.toggle("active", button.dataset.value === selectedValue);
    });

    if (group === dayGroup) {
        document.querySelectorAll("#compact-day-options .compact-option").forEach((button) => {
            button.classList.toggle("active", button.dataset.value === selectedValue);
        });
    } else if (group === periodGroup) {
        document.querySelectorAll("#compact-period-options .compact-option").forEach((button) => {
            button.classList.toggle("active", button.dataset.value === selectedValue);
        });
    } else if (group === filterGroup) {
        document.querySelectorAll("#compact-type-options .compact-option").forEach((button) => {
            button.classList.toggle("active", button.dataset.value === selectedValue);
        });
    }

    setCompactSelectionLabels();
}

function onToggleClick(event) {
    const button = event.target.closest(".filter-item");
    if (!button) return;
    
    const value = button.dataset.value;
    const group = button.parentElement;
    
    if (group === dayGroup) {
        activeDay = value;
    } else if (group === periodGroup) {
        activePeriod = value;
    } else if (group === filterGroup) {
        activeFilter = value;
    }
    
    updateGroupButtons(group, value);
    handleSearch();
}

compactDayField.addEventListener("mousedown", () => startLongPress(compactDayPicker));
compactDayField.addEventListener("touchstart", () => startLongPress(compactDayPicker), { passive: true });
compactDayField.addEventListener("mouseup", cancelLongPress);
compactDayField.addEventListener("mouseleave", cancelLongPress);
compactDayField.addEventListener("touchend", cancelLongPress);
compactDayField.addEventListener("click", (event) => {
    toggleCompactPicker(compactDayPicker);
    event.preventDefault();
});

compactPeriodField.addEventListener("mousedown", () => startLongPress(compactPeriodPicker));
compactPeriodField.addEventListener("touchstart", () => startLongPress(compactPeriodPicker), { passive: true });
compactPeriodField.addEventListener("mouseup", cancelLongPress);
compactPeriodField.addEventListener("mouseleave", cancelLongPress);
compactPeriodField.addEventListener("touchend", cancelLongPress);
compactPeriodField.addEventListener("click", (event) => {
    toggleCompactPicker(compactPeriodPicker);
    event.preventDefault();
});

compactTypeField.addEventListener("mousedown", () => startLongPress(compactTypePicker));
compactTypeField.addEventListener("touchstart", () => startLongPress(compactTypePicker), { passive: true });
compactTypeField.addEventListener("mouseup", cancelLongPress);
compactTypeField.addEventListener("mouseleave", cancelLongPress);
compactTypeField.addEventListener("touchend", cancelLongPress);
compactTypeField.addEventListener("click", (event) => {
    toggleCompactPicker(compactTypePicker);
    event.preventDefault();
});

compactDayList.addEventListener("click", onCompactOptionClick);
compactPeriodList.addEventListener("click", onCompactOptionClick);
compactTypeList.addEventListener("click", onCompactOptionClick);

document.addEventListener("click", (event) => {
    if (!event.target.closest(".compact-picker")) {
        closeAllCompactPickers();
    }
});

window.addEventListener("resize", closeAllCompactPickers);

async function handleSearch() {
    const day = activeDay;
    const period = activePeriod;
    const filter = activeFilter;

    if (!period) return;

    searchResult.innerHTML = `<div class="empty-state"><p>Updating results...</p></div>`;

    try {
        const response = await fetch(`/api/free-rooms?day=${encodeURIComponent(day)}&period=${encodeURIComponent(period)}`);
        const data = await response.json();

        if (!response.ok) {
            searchResult.innerHTML = `<div class="empty-state"><p>${data.error || "Search error."}</p></div>`;
            return;
        }

        const filtered = applyFilter(data.free_rooms, filter);
        
        if (!filtered.length) {
            searchResult.innerHTML = `<div class="empty-state"><p>No rooms available for ${period} on ${day}.</p></div>`;
            return;
        }

        searchResult.innerHTML = formatGroupedRooms(filtered);
    } catch (error) {
        searchResult.innerHTML = `<div class="empty-state"><p>Search failed. Check your connection.</p></div>`;
    }
}

dayGroup.addEventListener("click", onToggleClick);
periodGroup.addEventListener("click", onToggleClick);
filterGroup.addEventListener("click", onToggleClick);

syncCompactOptions();
setCompactSelectionLabels();

// Initial fetch
fetchSchedule();
