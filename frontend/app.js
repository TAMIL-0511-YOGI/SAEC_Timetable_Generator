// Frontend is deployed on Vercel, backend is hosted separately on Render.
// Use the local backend API when running locally, otherwise use the deployed Render backend.
const API_BASE = ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '/api'
    : 'https://saec-timetable-generator.onrender.com/api');

// API retry configuration
const API_CONFIG = {
    MAX_RETRIES: 2,
    RETRY_DELAY: 1500,  // 1.5 seconds between retries
    TIMEOUT: 15000     // 15 second timeout for API calls
};

// Global initialization state
let initializationFailed = false;

// Period timings (50 mins each)
const PERIOD_TIMINGS = {
    0: "8:30 - 9:20",
    1: "9:20 - 10:10",
    2: "10:10 - 11:00",
    "break1": "11:00 - 11:10",
    3: "11:10 - 12:00",
    4: "12:00 - 12:50",
    "lunch": "12:50 - 1:25",
    5: "1:25 - 2:15",
    6: "2:15 - 3:05",
    "break3": "3:05 - 3:15",
    7: "3:15 - 4:05"
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const PERIOD_HEADERS = [
    { label: "P1", time: "8:30 - 9:20" },
    { label: "P2", time: "9:20 - 10:10" },
    { label: "P3", time: "10:10 - 11:00" },
    { label: "B1", time: "11:00 - 11:10" },
    { label: "P4", time: "11:10 - 12:00" },
    { label: "P5", time: "12:00 - 12:50" },
    { label: "Lunch", time: "12:50 - 1:25" },
    { label: "P6", time: "1:25 - 2:15" },
    { label: "P7", time: "2:15 - 3:05" },
    { label: "B3", time: "3:05 - 3:15" },
    { label: "P8", time: "3:15 - 4:05" }
];

// Global teacher list for use across the app
let allTeachers = [];

// Activity state
const ACTIVITY_STORAGE_KEY = "saec_activities";
const TEACHER_STORAGE_KEY = "saec_teachers";
let activities = [];
let editingActivityIndex = null;

function loadActivitiesFromLocalStorage() {
    const stored = sessionStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Failed to parse saved activities from local storage:", error);
        return [];
    }
}

function loadTeachersFromLocalStorage() {
    const stored = sessionStorage.getItem(TEACHER_STORAGE_KEY);
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Failed to parse saved teachers from local storage:", error);
        return [];
    }
}

function saveTeachersToStorage(teachers) {
    sessionStorage.setItem(TEACHER_STORAGE_KEY, JSON.stringify(teachers));
}

function clearTeachersFromStorage() {
    sessionStorage.removeItem(TEACHER_STORAGE_KEY);
}

async function loadActivitiesFromBackend() {
    try {
        const response = await fetchWithTimeout(`${API_BASE}/activities`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }, API_CONFIG.TIMEOUT);

        if (!response.ok) {
            throw new Error(`Backend returned status ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error("Invalid activities response from backend");
        }

        return {
            online: true,
            activities: data.map((activity) => ({
                ...activity,
                year: parseInt(activity.year, 10),
                period: parseInt(activity.period, 10),
                hours: parseInt(activity.hours, 10),
                teachers: Array.isArray(activity.teachers) ? activity.teachers : [],
                is_three_period: !!activity.is_three_period,
                auto_generated: !!activity.auto_generated,
                all_sections: !!activity.all_sections,
                multiple_occurrences: !!activity.multiple_occurrences,
                occurrence_count: parseInt(activity.occurrence_count, 10) || 1
            }))
        };
    } catch (error) {
        console.warn("Unable to load activities from backend:", error);
        return { online: false, activities: [] };
    }
}

function saveActivitiesToStorage() {
    sessionStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activities));
}

function clearActivitiesFromStorage() {
    sessionStorage.removeItem(ACTIVITY_STORAGE_KEY);
}

function mergeTeacherLists(backendTeachers, localTeachers) {
    const merged = new Map();

    (localTeachers || []).forEach((teacher) => {
        if (teacher && teacher.teacher_id != null) {
            merged.set(String(teacher.teacher_id), teacher);
        }
    });

    (backendTeachers || []).forEach((teacher) => {
        if (teacher && teacher.teacher_id != null) {
            merged.set(String(teacher.teacher_id), teacher);
        }
    });

    return Array.from(merged.values()).sort((a, b) => {
        const aId = String(a.teacher_id);
        const bId = String(b.teacher_id);
        return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
    });
}

async function syncLocalTeachersToBackend(localTeachers, backendTeachers = []) {
    const backendIds = new Set((backendTeachers || []).map((t) => String(t.teacher_id)));

    for (const teacher of (localTeachers || [])) {
        if (!teacher || teacher.teacher_id == null) continue;
        const teacherId = String(teacher.teacher_id);
        if (backendIds.has(teacherId)) continue;

        try {
            await fetch(`${API_BASE}/teachers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ teacher_id: teacherId, name: teacher.name })
            });

            if (Array.isArray(teacher.subjects)) {
                for (const subject of teacher.subjects) {
                    if (!subject || !subject.name) continue;
                    await fetch(`${API_BASE}/subjects`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            subject_name: subject.name,
                            year: subject.year,
                            section: subject.section,
                            hours_per_week: subject.hours_per_week,
                            teacher_id: teacherId,
                            is_lab: subject.is_lab ? 1 : 0,
                            lab_days: Array.isArray(subject.lab_days) ? subject.lab_days.join(',') : (subject.lab_days || '')
                        })
                    });
                }
            }
        } catch (error) {
            console.warn("Unable to sync local teacher to backend:", error);
        }
    }
}

async function saveActivityToBackend(activity) {
    try {
        const response = await fetch(`${API_BASE}/activities`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(activity)
        });
        if (!response.ok) {
            console.warn("Backend activity save failed:", response.status);
            return null;
        }
        const data = await response.json();
        return data.activity || null;
    } catch (error) {
        console.warn("Unable to save activity to backend:", error);
        return null;
    }
}

async function updateActivityOnBackend(activity) {
    if (!activity.id) {
        return saveActivityToBackend(activity);
    }

    try {
        const response = await fetch(`${API_BASE}/activities/${activity.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(activity)
        });
        if (!response.ok) {
            console.warn("Backend activity update failed:", response.status);
            return null;
        }
        return activity;
    } catch (error) {
        console.warn("Unable to update activity on backend:", error);
        return null;
    }
}

async function deleteActivityFromBackend(activity) {
    if (!activity || !activity.id) return false;

    try {
        const response = await fetch(`${API_BASE}/activities/${activity.id}`, {
            method: "DELETE"
        });
        return response.ok;
    } catch (error) {
        console.warn("Unable to delete activity on backend:", error);
        return false;
    }
}

async function syncLocalActivitiesToBackend(localActivities) {
    for (const activity of localActivities) {
        if (activity.id) continue;
        const saved = await saveActivityToBackend(activity);
        if (saved && saved.id) {
            activity.id = saved.id;
        }
    }
    saveActivitiesToStorage();
}

async function loadActivities() {
    const localActivities = loadActivitiesFromLocalStorage();
    const backendResult = await loadActivitiesFromBackend();
    const backendActivities = backendResult.activities || [];
    const backendOnline = backendResult.online;

    const mergedActivities = [];
    const backendIds = new Set(backendActivities.map(activity => activity.id));

    // Start with backend activities so saved records are always available
    mergedActivities.push(...backendActivities);

    // Preserve any locally stored activities that are not yet synced or not present on backend
    if (Array.isArray(localActivities) && localActivities.length > 0) {
        for (const activity of localActivities) {
            if (!activity) continue;
            if (activity.id && backendIds.has(activity.id)) {
                continue;
            }
            mergedActivities.push(activity);
        }
    }

    activities = mergedActivities;
    saveActivitiesToStorage();

    // Sync any locally created activities to the backend if they were not saved yet
    const unsyncedActivities = activities.filter(activity => !activity.id);
    if (unsyncedActivities.length > 0 && backendOnline) {
        await syncLocalActivitiesToBackend(unsyncedActivities);
        const refreshed = await loadActivitiesFromBackend();
        if (refreshed.online) {
            activities = refreshed.activities;
            saveActivitiesToStorage();
        }
    }

    return backendOnline;
}

async function syncActivities() {
    const backendOnline = await loadActivities();
    renderActivities();
    const syncMessage = document.getElementById("activitySyncMessage");
    if (syncMessage) {
        syncMessage.textContent = backendOnline
            ? "Activities synced from backend."
            : "Unable to reach backend. Working in isolated tab mode.";
        syncMessage.className = "message success";
        setTimeout(() => {
            syncMessage.textContent = "";
            syncMessage.className = "message";
        }, 4000);
    }
}

// Initialize activity type event listener
document.addEventListener("DOMContentLoaded", async function() {
    await loadActivities();
    renderActivities();

    const activityTypeSelect = document.getElementById("activityType");
    const activityThreePeriodCheckbox = document.getElementById("activityThreePeriod");
    const editActivityTypeSelect = document.getElementById("editActivityType");
    const editActivityThreePeriodCheckbox = document.getElementById("editActivityThreePeriod");

    
    if (activityTypeSelect) {
        activityTypeSelect.addEventListener("change", () => updateActivityTypeFields());
        // Initial state
        updateActivityTypeFields();
    }
    
    if (activityThreePeriodCheckbox) {
        activityThreePeriodCheckbox.addEventListener("change", () => updateActivityTypeFields());
        activityThreePeriodCheckbox.addEventListener("change", function() {
            const hoursField = document.getElementById("activityHours");
            const hoursLabel = document.querySelector('label[for="activityHours"]');
            
            if (this.checked) {
                hoursField.disabled = true;
                hoursField.style.opacity = "0.5";
                hoursField.style.cursor = "not-allowed";
                hoursField.placeholder = "Auto: 3 periods";
                if (hoursLabel) {
                    hoursLabel.style.color = "#999";
                }
            } else {
                hoursField.disabled = false;
                hoursField.style.opacity = "1";
                hoursField.style.cursor = "auto";
                hoursField.placeholder = "1";
                if (hoursLabel) {
                    hoursLabel.style.color = "inherit";
                }
            }
        });
    }

    const labCheckbox = document.getElementById("isLab");
    if (labCheckbox) {
        labCheckbox.addEventListener("change", () => toggleLabTeacherSelectors());
        toggleLabTeacherSelectors();
    }

    if (editActivityTypeSelect) {
        editActivityTypeSelect.addEventListener("change", () => updateActivityTypeFields("edit"));
    }

    if (editActivityThreePeriodCheckbox) {
        editActivityThreePeriodCheckbox.addEventListener("change", () => updateActivityTypeFields("edit"));
    }
});

// Enable/Disable fields based on Activity Type
function updateActivityTypeFields(prefix = "") {
    const prefixId = prefix ? prefix + "Activity" : "activity";
    const activityType = document.getElementById(prefixId + "Type").value;
    const daySelect = document.getElementById(prefixId + "Day");
    const periodInput = document.getElementById(prefixId + "Period");
    const sectionSelect = document.getElementById(prefixId + "Section");
    const hoursField = document.getElementById(prefixId + "Hours");
    const hoursLabel = document.querySelector('label[for="' + prefixId + 'Hours"]');

    const manualTypes = ["PT", "Library"];
    const autoTypes = ["Professional Elective", "Open Elective", "Mini Project", "Skillrack/Placement", "Project Phase / Internship"];
    const isManual = manualTypes.includes(activityType);
    const isAuto = autoTypes.includes(activityType);

    // Day/period fields for manual activities, not for auto-generated activities
    daySelect.disabled = !isManual;
    periodInput.disabled = !isManual;

    // Section should be disabled for Professional Elective, Open Elective, and Internship
    const disableSectionTypes = ["Professional Elective", "Open Elective", "Project Phase / Internship"];
    if (disableSectionTypes.includes(activityType)) {
        sectionSelect.disabled = true;
        sectionSelect.style.opacity = "0.5";
        sectionSelect.style.cursor = "not-allowed";
    } else {
        sectionSelect.disabled = false;
        sectionSelect.style.opacity = "1";
        sectionSelect.style.cursor = "pointer";
    }

    if (!isManual) {
        daySelect.style.opacity = "0.5";
        daySelect.style.cursor = "not-allowed";
        periodInput.style.opacity = "0.5";
        periodInput.style.cursor = "not-allowed";
    } else {
        daySelect.style.opacity = "1";
        daySelect.style.cursor = "pointer";
        periodInput.style.opacity = "1";
        periodInput.style.cursor = "auto";
    }

    // Hours field should be enabled for all activity types (unless 3-period checkbox is checked)
    const threePeriodCheckbox = document.getElementById(prefixId + "ThreePeriod");
    const isThreePeriod = threePeriodCheckbox ? threePeriodCheckbox.checked : false;
    if (isThreePeriod) {
        hoursField.disabled = true;
        hoursField.style.opacity = "0.5";
        hoursField.style.cursor = "not-allowed";
        hoursField.placeholder = "Auto: 3 periods";
        if (hoursLabel) hoursLabel.style.color = "#999";
    } else {
        hoursField.disabled = false;
        hoursField.style.opacity = "1";
        hoursField.style.cursor = "auto";
        hoursField.placeholder = "1";
        if (hoursLabel) hoursLabel.style.color = "inherit";
    }

    // For PT and Library, require section and manual day/period; for other types keep section optional
    if (!isManual && !isAuto) {
        // if new/custom types are added - default to manual behavior
        sectionSelect.disabled = false;
        sectionSelect.style.opacity = "1";
        sectionSelect.style.cursor = "pointer";
    }
}

function updateActivityDayAccess() {
    updateActivityTypeFields();
}

function updateActivitySectionAccess() {
    updateActivityTypeFields();
}

function toggleIntroDetails() {
    const introMore = document.getElementById("introMore");
    const toggleBtn = document.getElementById("introToggleBtn");
    const introLayout = document.querySelector(".intro-layout");
    const imageBox = document.querySelector(".intro-image-box");
    if (!introMore || !toggleBtn || !imageBox) return;

    const expanded = introMore.classList.toggle("expanded");
    toggleBtn.textContent = expanded ? "Show Less" : "Read More";
    if (introLayout) {
        introLayout.classList.toggle("expanded", expanded);
    }

    if (expanded) {
        const expandedHeight = introMore.scrollHeight;
        introMore.style.maxHeight = `${expandedHeight}px`;
        introMore.style.opacity = "1";
        introMore.style.marginTop = "16px";
    } else {
        introMore.style.maxHeight = "0";
        introMore.style.opacity = "0";
        introMore.style.marginTop = "0";
    }
}

// ======================
// ADD TEACHER FUNCTIONS
// ======================
async function addTeacher() {
    const teacherId = document.getElementById("teacherId").value.trim();
    const teacherName = document.getElementById("teacherName").value.trim();
    const rndDay = document.getElementById("teacherRndDay").value;
    const messageDiv = document.getElementById("teacherMessage");

    if (!teacherId || !teacherName) {
        showMessage(messageDiv, "Please fill all fields", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/teachers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teacher_id: teacherId, name: teacherName, rnd_day: rndDay })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(messageDiv, "Teacher added successfully!", "success");
            document.getElementById("teacherId").value = "";
            document.getElementById("teacherName").value = "";
            document.getElementById("teacherRndDay").value = "";
            loadTeachers();
        } else {
            showMessage(messageDiv, data.error || "Error adding teacher", "error");
        }
    } catch (error) {
        showMessage(messageDiv, "Error: " + error.message, "error");
    }
}

// ======================
// ADD SUBJECT FUNCTIONS
// ======================
async function toggleLabTeacherSelectors() {
    const isLab = document.getElementById("isLab").checked;
    const labSelectors = document.getElementById("labTeacherSelectors");
    if (labSelectors) {
        labSelectors.style.display = isLab ? "flex" : "none";
    }
    if (!isLab) {
        const second = document.getElementById("labTeacher2Select");
        const third = document.getElementById("labTeacher3Select");
        if (second) second.value = "";
        if (third) third.value = "";
    }
}

async function addSubject() {
    const teacherSelect = document.getElementById("teacherSelect");
    const subjectName = document.getElementById("subjectName").value.trim();
    const yearLevel = document.getElementById("yearLevel").value;
    const section = document.getElementById("section").value.trim();
    const hoursPerWeek = document.getElementById("hoursPerWeek").value;
    const isLab = document.getElementById("isLab").checked ? 1 : 0;
    const messageDiv = document.getElementById("subjectMessage");
    const teacherIds = [teacherSelect.value];

    if (!teacherSelect.value || !subjectName || !yearLevel || !section || !hoursPerWeek) {
        showMessage(messageDiv, "Please fill all fields", "error");
        return;
    }

    if (isLab) {
        const secondTeacher = document.getElementById("labTeacher2Select").value;
        const thirdTeacher = document.getElementById("labTeacher3Select").value;
        if (!secondTeacher || !thirdTeacher) {
            showMessage(messageDiv, "Please select three teachers for the lab.", "error");
            return;
        }
        if (secondTeacher === teacherIds[0] || thirdTeacher === teacherIds[0] || secondTeacher === thirdTeacher) {
            showMessage(messageDiv, "Please select three different teachers for the lab.", "error");
            return;
        }
        teacherIds.push(secondTeacher, thirdTeacher);
    }

    try {
        const response = await fetch(`${API_BASE}/subjects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject_name: subjectName,
                year: parseInt(yearLevel),
                section: section,
                hours_per_week: parseInt(hoursPerWeek),
                teacher_id: teacherSelect.value,
                teacher_ids: teacherIds,
                is_lab: isLab,
                lab_days: isLab ? "0" : ""  // Default: Monday only for labs
            })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(messageDiv, "Subject added successfully!", "success");
            document.getElementById("subjectName").value = "";
            document.getElementById("yearLevel").value = "";
            document.getElementById("section").value = "";
            document.getElementById("hoursPerWeek").value = "";
            document.getElementById("isLab").checked = false;
            loadTeachers();
        } else {
            showMessage(messageDiv, data.error || "Error adding subject", "error");
        }
    } catch (error) {
        showMessage(messageDiv, "Error: " + error.message, "error");
    }
}

async function addActivity() {
    const type = document.getElementById("activityType").value;
    const year = parseInt(document.getElementById("activityYear").value, 10);
    const section = document.getElementById("activitySection").value.trim();
    const isThreePeriod = document.getElementById("activityThreePeriod").checked;
    const periodHours = parseInt(document.getElementById("activityHours").value, 10) || 1;
    const elective = document.getElementById("profElectiveName").value.trim();
    const electiveNo = document.getElementById("electiveSubjectNo").value.trim();
    const t1 = document.getElementById("multiTeacher1").value.trim();
    const t2 = document.getElementById("multiTeacher2").value.trim();
    const t3 = document.getElementById("multiTeacher3").value.trim();
    const t4 = document.getElementById("multiTeacher4").value.trim();
    const t5 = document.getElementById("multiTeacher5").value.trim();
    const t6 = document.getElementById("multiTeacher6").value.trim();
    const t7 = document.getElementById("multiTeacher7").value.trim();
    const t8 = document.getElementById("multiTeacher8").value.trim();
    const t9 = document.getElementById("multiTeacher9").value.trim();
    const t10 = document.getElementById("multiTeacher10").value.trim();
    const isMultipleOccurrences = document.getElementById("activityMultipleOccurrences").checked;
    const occurrenceCount = parseInt(document.getElementById("activityOccurrenceCount").value, 10);
    
    // Determine if this is a manual activity type
    const manualTypes = ["PT", "Library"];
    const isManualType = manualTypes.includes(type);
    const isProjectPhase = type === "Project Phase / Internship";
    const isAutoAllSections = ["Mini Project", "Skillrack/Placement"].includes(type);
    
    // PT/Library/Mini Project/Skillrack/Placement require section selection
    const requiredSectionTypes = ["PT", "Library", "Mini Project", "Skillrack/Placement"];
    if (requiredSectionTypes.includes(type) && !section) {
        alert("Please select a section for the selected activity type.");
        return;
    }
    
    let day, period;
    
    if (isProjectPhase) {
        // Project Phase / Internship: allocate to last 2 periods (7-8) on a random day
        day = DAYS[Math.floor(Math.random() * DAYS.length)];
        period = 7; // P7-P8 (last 2 periods)
    } else if (isManualType) {
        // For manual types, get day and period from form
        day = document.getElementById("activityDay").value;
        period = parseInt(document.getElementById("activityPeriod").value, 10);
        
        if (!day || !period || period < 1 || period > 8) {
            alert("Please provide a valid day and period (1 - 8) for the activity.");
            return;
        }
    } else {
        // For auto-generated types, generate day and period automatically
        day = DAYS[Math.floor(Math.random() * DAYS.length)];
        if (isThreePeriod) {
            const allowedStarts = [1, 2, 3, 6];
            period = allowedStarts[Math.floor(Math.random() * allowedStarts.length)];
        } else {
            period = Math.floor(Math.random() * 8) + 1;
        }
    }

    if (isThreePeriod && ![1, 2, 3, 6].includes(period)) {
        alert("3-consecutive period activity can only start at period 1, 2, 3 or 6.");
        return;
    }

    if (year === 2 && ["Mini Project", "Professional Elective", "Open Elective"].includes(type)) {
        alert("2nd year students cannot have mini project / professional elective / open elective activities.");
        return;
    }

    // Allow Professional/Open Elective for 3rd and 4th year, but restrict Project Phase / Internship to 4th year only
    if (["Professional Elective", "Open Elective"].includes(type) && ![3, 4].includes(year)) {
        alert("Professional Elective and Open Elective are only available for 3rd and 4th Year students.");
        return;
    }

    if (type === "Project Phase / Internship" && year !== 4) {
        alert("Project Phase / Internship is only available for 4th Year students.");
        return;
    }

    let duration;
    if (isProjectPhase) {
        duration = isThreePeriod ? 3 : (periodHours || 2);
    } else {
        duration = isThreePeriod ? 3 : periodHours;
    }
    
    if (duration < 1 || duration > 25) {
        alert("Activity hours must be between 1 and 25.");
        return;
    }

    // For manual types (PT, Library), check if period allocation exceeds 8 periods in a day
    if (isManualType && period + duration - 1 > 8) {
        alert("The selected period and hours exceed 8 total periods. Adjust start period or hours.");
        return;
    }

    if (isThreePeriod && period > 6) {
        alert("3-period activities can only start at P1-P6.");
        return;
    }

    // Validate multiple occurrences only for Mini Project
    if (isMultipleOccurrences && type !== "Mini Project") {
        alert("Multiple occurrences per week is only available for Mini Project activities.");
        return;
    }

    const activity = {
        id: null,
        day,
        year,
        period,
        section: section || null,
        type,
        hours: duration,
        elective: elective || null,
        elective_no: electiveNo || null,
        teachers: [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10].filter(Boolean),
        is_three_period: isThreePeriod,
        auto_generated: !isManualType || isProjectPhase,
        all_sections: isAutoAllSections && !section,
        multiple_occurrences: isMultipleOccurrences,
        occurrence_count: isMultipleOccurrences ? occurrenceCount : 1
    };

    activities.push(activity);
    saveActivitiesToStorage();

    const saved = await saveActivityToBackend(activity);
    if (saved && saved.id) {
        activity.id = saved.id;
        saveActivitiesToStorage();
    }

    renderActivities();

    // Reset personal fields for next entry
    document.getElementById("profElectiveName").value = "";
    document.getElementById("electiveSubjectNo").value = "";
    document.getElementById("multiTeacher1").value = "";
    document.getElementById("multiTeacher2").value = "";
    document.getElementById("multiTeacher3").value = "";
    document.getElementById("multiTeacher4").value = "";
    document.getElementById("multiTeacher5").value = "";
    document.getElementById("multiTeacher6").value = "";
    document.getElementById("multiTeacher7").value = "";
    document.getElementById("multiTeacher8").value = "";
    document.getElementById("multiTeacher9").value = "";
    document.getElementById("multiTeacher10").value = "";
    document.getElementById("activityPeriod").value = "";
    document.getElementById("activitySection").value = "";
    document.getElementById("activityThreePeriod").checked = false;
    document.getElementById("activityMultipleOccurrences").checked = false;
    document.getElementById("activityHours").value = "";
}

function renderActivities() {
    const container = document.getElementById("activityList");

    if (activities.length === 0) {
        container.innerHTML = "<p style='color:#555;'>No activities configured yet.</p>";
        return;
    }

    container.innerHTML = activities.map((a, i) => {
        const shortType = getShortActivityLabel(a.type);
        let summary = `Year ${a.year}`;
        if (a.section) summary += ` | Section ${a.section}`;
        summary += ` | ${shortType} | ${a.day} P${a.period} - ${a.hours} hr${a.hours > 1 ? 's' : ''}`;
        if (a.is_three_period) summary += ' (3 periods)';
        if (a.multiple_occurrences) {
            summary += ` <span style="color: #ff6b35; font-weight: bold;">[${a.occurrence_count} times/week]</span>`;
        }
        if (a.auto_generated) {
            summary += ' <span style="color: #d32f2f; font-weight: bold;">[Auto-Generated]</span>';
        }
        if (a.all_sections) {
            summary += ' <span style="color: #1976d2; font-weight: bold;">[All Sections]</span>';
        }
        if (a.elective) {
            summary += ` - Elective: ${a.elective}`;
        }
        if (a.elective_no) {
            summary += ` (No. ${a.elective_no})`;
        }
        if (a.teachers.length) {
            summary += ` - Instructors: ${a.teachers.join(', ')}`;
        }

        return (
            '<div class="activity-item">'
            + '<span>' + summary + '</span>'
            + '<div style="display: flex; gap: 6px;">'
            + '<button class="edit-btn icon-btn" onclick="startEditActivity(' + i + ')" title="Edit activity" aria-label="Edit activity">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M12 20h9"></path>'
            + '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 3 20l.5-4L16.5 3.5z"></path>'
            + '</svg>'
            + '</button>'
            + '<button class="delete-btn icon-btn" onclick="removeActivity(' + i + ')" title="Delete activity" aria-label="Delete activity">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<polyline points="3 6 5 6 21 6"></polyline>'
            + '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>'
            + '<line x1="10" y1="11" x2="10" y2="17"></line>'
            + '<line x1="14" y1="11" x2="14" y2="17"></line>'
            + '</svg>'
            + '</button>'
            + '</div>'
            + '</div>'
        );
    }).join('');
}

async function removeActivity(index) {
    const activity = activities[index];
    if (activity) {
        await deleteActivityFromBackend(activity);
    }

    activities.splice(index, 1);
    saveActivitiesToStorage();
    renderActivities();
}

function startEditActivity(index) {
    const activity = activities[index];
    if (!activity) return;

    editingActivityIndex = index;
    document.getElementById("editActivityIndex").value = index;
    document.getElementById("editActivityDay").value = activity.day || "Mon";
    document.getElementById("editActivityYear").value = activity.year;
    document.getElementById("editActivitySection").value = activity.section || "";
    document.getElementById("editActivityPeriod").value = activity.period || "";
    document.getElementById("editActivityHours").value = activity.hours || 1;
    document.getElementById("editActivityType").value = activity.type;
    document.getElementById("editProfElectiveName").value = activity.elective || "";
    document.getElementById("editElectiveSubjectNo").value = activity.elective_no || "";
    document.getElementById("editActivityThreePeriod").checked = !!activity.is_three_period;
    document.getElementById("editActivityMultipleOccurrences").checked = !!activity.multiple_occurrences;
    document.getElementById("editActivityOccurrenceCount").value = activity.occurrence_count || 1;

    // Populate edit modal teacher selects with available teachers
    const teacherNames = allTeachers.map(t => t.name);
    for (let i = 0; i < 10; i++) {
        const select = document.getElementById(`editMultiTeacher${i + 1}`);
        if (select) {
            select.innerHTML = '<option value="">Select Teacher</option>';
            teacherNames.forEach(name => {
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
            const teacherName = activity.teachers[i] || "";
            select.value = teacherName;
        }
    }

    updateActivityTypeFields("edit");
    document.getElementById("editActivityModal").style.display = "block";
}

function closeEditActivityModal() {
    document.getElementById("editActivityModal").style.display = "none";
    editingActivityIndex = null;
}

async function saveEditedActivity() {
    const index = editingActivityIndex;
    if (index === null || index === undefined) return;

    const type = document.getElementById("editActivityType").value;
    const year = parseInt(document.getElementById("editActivityYear").value, 10);
    const section = document.getElementById("editActivitySection").value.trim();
    const period = parseInt(document.getElementById("editActivityPeriod").value, 10) || 1;
    const hours = parseInt(document.getElementById("editActivityHours").value, 10) || 1;
    const elective = document.getElementById("editProfElectiveName").value.trim();
    const electiveNo = document.getElementById("editElectiveSubjectNo").value.trim();
    const isThreePeriod = document.getElementById("editActivityThreePeriod").checked;
    const isMultipleOccurrences = document.getElementById("editActivityMultipleOccurrences").checked;
    const occurrenceCount = parseInt(document.getElementById("editActivityOccurrenceCount").value, 10) || 1;
    const day = document.getElementById("editActivityDay").value;

    const updatedTeachers = [];
    for (let i = 0; i < 10; i++) {
        const value = document.getElementById(`editMultiTeacher${i + 1}`).value.trim();
        if (value) updatedTeachers.push(value);
    }

    activities[index] = {
        ...activities[index],
        day,
        year,
        section: section || null,
        period,
        type,
        hours,
        elective: elective || null,
        elective_no: electiveNo || null,
        teachers: updatedTeachers,
        is_three_period: isThreePeriod,
        multiple_occurrences: isMultipleOccurrences,
        occurrence_count: isMultipleOccurrences ? occurrenceCount : 1
    };

    const updated = await updateActivityOnBackend(activities[index]);
    if (updated && updated.id && !activities[index].id) {
        activities[index].id = updated.id;
    }

    saveActivitiesToStorage();
    renderActivities();
    closeEditActivityModal();
}

// ======================
// DELETE SUBJECT
// ======================
async function deleteSubject(subjectId) {
    if (confirm("Are you sure you want to delete this subject?")) {
        try {
            const response = await fetch(`${API_BASE}/subjects/${subjectId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" }
            });

            if (response.ok) {
                loadTeachers();
            } else {
                const data = await response.json();
                alert(data.error || "Error deleting subject");
            }
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
}

// ======================
// EDIT SUBJECT
// ======================
function showEditModal(subjectId, name, year, section, hours, isLab) {
    const modal = document.getElementById("editModal");
    document.getElementById("editSubjectId").value = subjectId;
    document.getElementById("editSubjectName").value = name;
    document.getElementById("editYearLevel").value = year;
    document.getElementById("editSection").value = section;
    document.getElementById("editHoursPerWeek").value = hours;
    document.getElementById("editIsLab").checked = isLab;
    modal.style.display = "block";
}

function closeEditModal() {
    const modal = document.getElementById("editModal");
    modal.style.display = "none";
}

async function updateSubject() {
    const subjectId = document.getElementById("editSubjectId").value;
    const subjectName = document.getElementById("editSubjectName").value.trim();
    const yearLevel = document.getElementById("editYearLevel").value;
    const section = document.getElementById("editSection").value.trim();
    const hoursPerWeek = document.getElementById("editHoursPerWeek").value;
    const isLab = document.getElementById("editIsLab").checked ? 1 : 0;

    if (!subjectName || !yearLevel || !section || !hoursPerWeek) {
        alert("Please fill all fields");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/subjects/${subjectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject_name: subjectName,
                year: parseInt(yearLevel),
                section: section,
                hours_per_week: parseInt(hoursPerWeek),
                is_lab: isLab
            })
        });

        const data = await response.json();

        if (response.ok) {
            closeEditModal();
            loadTeachers();
        } else {
            alert(data.error || "Error updating subject");
        }
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById("editModal");
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

// ======================
// LOAD TEACHERS
// ======================
async function fetchWithTimeout(url, options = {}, timeout = API_CONFIG.TIMEOUT) {
    const controller = new AbortController();
    const signal = controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { ...options, signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

let autoRetryInterval = null;

async function loadTeachers(retryCount = 0) {
    console.log("Loading teachers...");
    
    // Always try to fetch from backend first to get the latest teachers
    try {
        console.log("Fetching from backend:", API_BASE + "/teachers");
        const response = await fetch(`${API_BASE}/teachers`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        console.log("Backend response status:", response.status);
        
        if (response.ok) {
            const backendTeachers = await response.json();
            console.log("Backend teachers:", backendTeachers);
            
            if (Array.isArray(backendTeachers) && backendTeachers.length > 0) {
                allTeachers = backendTeachers;
                saveTeachersToStorage(backendTeachers);
                populateActivityTeacherSelects(backendTeachers);
                populateActivityTeacherDatalist(backendTeachers);
                displayTeachers(backendTeachers);
                console.log("Loaded", backendTeachers.length, "teachers from backend");
                return; // Success - no need to check localStorage
            }
        }
    } catch (error) {
        console.error("Error fetching from backend:", error);
    }
    
    // Fallback to localStorage if backend fails or returns empty
    console.log("Falling back to localStorage...");
    const localTeachers = loadTeachersFromLocalStorage();
    console.log("Local teachers:", localTeachers);
    
    if (localTeachers && localTeachers.length > 0) {
        allTeachers = localTeachers;
        populateActivityTeacherSelects(localTeachers);
        populateActivityTeacherDatalist(localTeachers);
        displayTeachers(localTeachers);
        console.log("Loaded", localTeachers.length, "teachers from local storage");
    } else {
        // No teachers anywhere
        console.log("No teachers found anywhere");
        allTeachers = [];
        const teacherSelect = document.getElementById("teacherSelect");
        if (teacherSelect) {
            teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
        }
        populateActivityTeacherSelects([]);
        populateActivityTeacherDatalist([]);
        displayTeachers([]);
    }
}

function showInitializationError(errorMessage) {
    const errorDiv = document.getElementById("initializationError");
    if (!errorDiv) {
        const container = document.getElementById("mainContent") || document.body;
        const newErrorDiv = document.createElement("div");
        newErrorDiv.id = "initializationError";
        newErrorDiv.style.cssText = `
            background-color: #ffe0e0;
            border: 2px solid #d32f2f;
            border-radius: 8px;
            padding: 20px;
            margin: 20px;
            text-align: center;
            z-index: 1000;
        `;
        newErrorDiv.innerHTML = `
            <h3 style="color: #d32f2f; margin-top: 0;">⚠️ Connection Error</h3>
            <p style="color: #333; margin: 10px 0;">Unable to connect to the backend server.</p>
            <p style="color: #666; font-size: 14px; margin: 10px 0;">Error: ${errorMessage}</p>
            <p style="color: #666; font-size: 14px; margin: 10px 0;">This might happen if:<br/>• The backend server is starting up (first page load)<br/>• The backend is temporarily unavailable<br/>• There's a network connectivity issue</p>
            <button onclick="retryInitialization()" style="
                background-color: #d32f2f;
                color: white;
                border: none;
                padding: 10px 24px;
                border-radius: 4px;
                font-size: 16px;
                cursor: pointer;
                margin-top: 10px;
            ">Retry Connection</button>
        `;
        container.insertBefore(newErrorDiv, container.firstChild);
    } else {
        errorDiv.style.display = "block";
    }

    // Do not disable the page when backend loading fails; users can still retry or use functionality once the backend is back.
}

function hideInitializationError() {
    const errorDiv = document.getElementById("initializationError");
    if (errorDiv) {
        errorDiv.style.display = "none";
    }

    // Stop auto-retry if backend is available
    if (autoRetryInterval) {
        clearInterval(autoRetryInterval);
        autoRetryInterval = null;
    }

    // Re-enable main form
    enableMainContent();
}

function retryInitialization() {
    console.log("User initiated retry...");
    initializationFailed = false;
    loadTeachers(0);  // Reset retry counter
}

function disableMainContent() {
    const buttons = document.querySelectorAll("button");
    const inputs = document.querySelectorAll("input, select, textarea");
    
    buttons.forEach(btn => {
        if (btn.id !== "retryBtn") {
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
        }
    });
    
    inputs.forEach(input => {
        input.disabled = true;
        input.style.opacity = "0.7";
        input.style.cursor = "not-allowed";
    });
}

function enableMainContent() {
    const buttons = document.querySelectorAll("button");
    const inputs = document.querySelectorAll("input, select, textarea");
    
    buttons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    });
    
    inputs.forEach(input => {
        input.disabled = false;
        input.style.opacity = "1";
        input.style.cursor = "auto";
    });
}

function populateActivityTeacherDatalist(teachers) {
    const datalist = document.getElementById("teacherDatalist");
    if (!datalist) return;

    datalist.innerHTML = "";
    teachers.forEach(teacher => {
        const option = document.createElement("option");
        option.value = teacher.name;
        datalist.appendChild(option);
    });
}

function populateActivityTeacherSelects(teachers) {
    const teacherSelects = document.querySelectorAll(".teacher-select, #teacherSelect");
    teacherSelects.forEach(select => {
        const selected = select.value;
        select.innerHTML = '<option value="">Select Teacher</option>';
        teachers.forEach(teacher => {
            const option = document.createElement("option");
            option.value = teacher.teacher_id; // Use teacher_id as value
            option.textContent = teacher.name; // Show name
            select.appendChild(option);
        });
        if (selected) {
            select.value = selected;
        }
    });
}


async function openTeacherDatabase() {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("teacherDatabaseSection").style.display = "block";
    await loadTeacherDatabase();
}

function closeTeacherDatabase() {
    document.getElementById("teacherDatabaseSection").style.display = "none";
    document.getElementById("mainContent").style.display = "block";
}

async function openActivityDatabase() {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("activityDatabaseSection").style.display = "block";
    await loadActivities();
    renderActivities();
    
    // Ensure teacher dropdowns are populated
    await loadTeachers();
}

function closeActivityDatabase() {
    document.getElementById("activityDatabaseSection").style.display = "none";
    document.getElementById("mainContent").style.display = "block";
}

async function loadTeacherDatabase() {
    try {
        const response = await fetchWithTimeout(`${API_BASE}/teachers`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }, API_CONFIG.TIMEOUT);

        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }

        const teachers = await response.json();
        allTeachers = teachers;
        displayTeacherDatabase(teachers);
    } catch (error) {
        console.error("Error loading teacher database:", error);
    }
}

function displayTeacherDatabase(teachers) {
    const container = document.getElementById("teacherDatabaseContent");

    if (!teachers || teachers.length === 0) {
        container.innerHTML = "<p style='color: #888;'>No teacher records available.</p>";
        return;
    }

    const teacherById = teachers.reduce((map, teacher) => {
        map[teacher.teacher_id] = teacher.name;
        return map;
    }, {});

    container.innerHTML = teachers.map(teacher => `
        <div class="teacher-card" style="margin-bottom: 14px; border: 1px solid #c8d7f4; padding: 14px; border-radius: 10px; background: #f8fcff;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: 12px;">
                <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <h3 style="margin:0; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${teacher.name} (ID: ${teacher.teacher_id})</h3>
                        ${teacher.rnd_day ? `<span style="display:inline-block; padding: 4px 10px; border-radius: 999px; background: #2e7d32; color: #fff; font-size: 0.78rem; font-weight: 700;">R&D ${teacher.rnd_day}</span>` : '<span style="display:inline-block; padding: 4px 10px; border-radius: 999px; background: #f1f1f1; color: #555; font-size: 0.78rem;">No R&D Day</span>'}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="edit-btn icon-btn" onclick="editTeacher('${teacher.teacher_id}', '${teacher.name.replace(/'/g, "\\'")}', '${teacher.rnd_day || ''}')" title="Edit teacher" aria-label="Edit teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="delete-btn icon-btn" onclick="deleteTeacher('${teacher.teacher_id}')" title="Delete teacher" aria-label="Delete teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
            </div>
            <p style="margin:12px 0 0 0;"><strong>Total Hours:</strong> ${teacher.total_hours_per_week}</p>
            <p style="margin:4px 0 0 0;"><strong>Free periods:</strong> ${teacher.free_periods_count || 0}</p>
            <p style="margin:4px 0 0 0;"><strong>Subjects (${teacher.subjects.length}):</strong></p>
            <div>
                ${teacher.subjects.length === 0 ? `<p style='color:#999;'>No subjects</p>` : teacher.subjects.map(s => {
                    const labTeacherInfo = s.teacher_ids && s.teacher_ids.length > 1 ? `<div style="font-size:0.86rem; color:#444; margin-top:2px;">Shared Lab Teachers: ${s.teacher_ids.map(id => {
                        const idKey = String(id);
                        return teacherById[idKey] ? `${teacherById[idKey]} (${idKey})` : idKey;
                    }).join(', ')}</div>` : '';
                    return `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 8px;">
                        <span style="flex:1; min-width:0;">${s.name} (${s.year}${s.section}) - ${s.hours_per_week} hr${s.hours_per_week > 1 ? 's' : ''}${s.is_lab ? ' [LAB]' : ''}${labTeacherInfo}</span>
                        <div style="display:flex; gap:6px; flex-wrap: wrap;">
                            <button class="edit-btn icon-btn" onclick="showEditModal(${s.subject_id}, '${s.name}', ${s.year}, '${s.section}', ${s.hours_per_week}, ${s.is_lab})" title="Edit subject" aria-label="Edit subject"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                            <button class="delete-btn icon-btn" onclick="deleteSubject(${s.subject_id})" title="Delete subject" aria-label="Delete subject"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                        </div>
                    </div>
                `}).join('')}
            </div>
        </div>
    `).join('');
}

async function deleteTeacher(teacherId) {
    if (!confirm("Delete this teacher and all associated subjects?")) return;

    try {
        const response = await fetch(`${API_BASE}/teachers/${teacherId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();
        if (response.ok) {
            clearTeachersFromStorage(); // Clear localStorage cache to prevent deleted teachers from reappearing
            await loadTeachers();
            await loadTeacherDatabase();
        } else {
            alert(data.error || "Error deleting teacher");
        }
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function editTeacher(teacherId, currentName, currentRndDay) {
    const newName = prompt("Update teacher name:", currentName);
    if (!newName || newName.trim().length === 0) return;

    const newRndDay = prompt("Update R&D day (Mon, Tue, Wed, Thu, Fri) or leave blank:", currentRndDay || "") || "";
    const normalizedRndDay = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(newRndDay) ? newRndDay : "";

    fetch(`${API_BASE}/teachers/${teacherId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), rnd_day: normalizedRndDay })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success || data.message) {
            loadTeachers();
            loadTeacherDatabase();
        } else {
            alert(data.error || "Error updating teacher");
        }
    })
    .catch(err => alert("Error: " + err.message));
}


function displayTeachers(teachers) {
    const container = document.getElementById("teachersList");
    
    if (teachers.length === 0) {
        container.innerHTML = "<p style='color: #888; text-align: center;'>No teachers added yet. Add a teacher to get started.</p>";
        return;
    }

    container.innerHTML = teachers.map(teacher => `
        <div class="teacher-card" style="padding: 14px; margin-bottom: 16px; border-radius: 12px; border: 1px solid #d8e6f6; background: #f7fbff;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div style="min-width:0; flex:1; display:flex; flex-direction:column; gap:6px;">
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <h3 style="margin:0; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${teacher.name} (ID: ${teacher.teacher_id})</h3>
                        ${teacher.rnd_day ? `<span style="display:inline-block; padding: 4px 10px; border-radius: 999px; background: #2e7d32; color: #fff; font-size: 0.78rem; font-weight: 700;">R&D ${teacher.rnd_day}</span>` : '<span style="display:inline-block; padding: 4px 10px; border-radius: 999px; background: #e0e0e0; color: #444; font-size: 0.78rem;">No R&D Day</span>'}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="edit-btn icon-btn" onclick="editTeacher('${teacher.teacher_id}', '${teacher.name.replace("'", "\'")}', '${teacher.rnd_day || ''}')" title="Edit teacher" aria-label="Edit teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="delete-btn icon-btn" onclick="deleteTeacher('${teacher.teacher_id}')" title="Delete teacher" aria-label="Delete teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
            </div>
            <p style="margin:10px 0 0 0;"><strong>Total Hours per Week:</strong> ${teacher.total_hours_per_week}</p>
            <div style="margin-top: 10px;">
                <strong>Subjects:</strong>
                ${teacher.subjects.length === 0 ? 
                    "<p style='color: #999;'>No subjects added</p>" : 
                    teacher.subjects.map(subject => `
                        <div class="subject-item ${subject.is_lab ? 'lab' : ''}">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span><strong>${subject.name}</strong> - Year ${subject.year}${subject.section} | 
                                ${subject.hours_per_week} hrs/week
                                ${subject.is_lab ? ' [LAB]' : ''}</span>
                                <div style="display: flex; gap: 8px;">
                                    <button class="edit-btn icon-btn" onclick="showEditModal(${subject.subject_id}, '${subject.name}', ${subject.year}, '${subject.section}', ${subject.hours_per_week}, ${subject.is_lab})" title="Edit subject" aria-label="Edit subject"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                                    <button class="delete-btn icon-btn" onclick="deleteSubject(${subject.subject_id})" title="Delete subject" aria-label="Delete subject"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                                </div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
    `).join('');
}

// ======================
// GENERATE TIMETABLE
// ======================
async function generateTimetable() {
    const messageDiv = document.getElementById("generateMessage");
    await loadActivities(); // Refresh saved activities before generating
    
    try {
        console.log("Generating timetable with activities:", activities);
        const response = await fetch(`${API_BASE}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ activities })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(messageDiv, data.message, "success");
            displayTimetable(data.timetable);
            renderActivities();
            document.getElementById("viewTimetableButtonSection").style.display = "block";
        } else {
            showMessage(messageDiv, data.error || "Error generating timetable", "error");
        }
    } catch (error) {
        showMessage(messageDiv, "Error: " + error.message, "error");
    }
}

// ======================
// DISPLAY TIMETABLE
// ======================
function buildTimetableSection(title, scheduleData, labelMapper = (key) => key) {
    const events = Object.keys(scheduleData);
    if (events.length === 0) {
        return `<div class="section"><p style="color:#666;">No ${title.toLowerCase()} generated.</p></div>`;
    }

    return events.map(key => {
        const schedule = scheduleData[key];
        const displayLabel = labelMapper(key);
        const downloadView = title === 'Class' ? 'student' : 'teacher';
        return `
            <div class="teacher-timetable">
                <div class="timetable-header">
                    <div class="timetable-title">${title}: ${displayLabel}</div>
                    <button class="btn-download" data-view="${downloadView}" data-key="${encodeURIComponent(key)}">
                        ⬇ Download
                    </button>
                </div>
                <table class="timetable">
                    <thead>
                        <tr>
                            <th>Day</th>
                            ${PERIOD_HEADERS.map(p => `<th><div class="period-header"><div>${p.label}</div><div class="time-small">${p.time}</div></div></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${DAYS.map(day => `
                            <tr>
                                <td class="day-cell"><strong>${day}</strong></td>
                                ${generatePeriodCells(schedule, day)}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');
}

// Global variable to store timetable data for toggling between views
let currentTimetableData = null;
let currentTeacherNameMap = null;
let currentTimetableView = 'teacher';

async function displayTimetable(timetable) {
    const teacherResponse = await fetch(`${API_BASE}/teachers`);
    const teacherList = await teacherResponse.json();
    const teacherNameMap = new Map(teacherList.map(t => [t.teacher_id, t.name]));

    const teacherSchedules = timetable.teachers || timetable;
    const classSchedules = timetable.classes || {};

    // Store globally for toggling between views
    currentTimetableData = {
        teachers: teacherSchedules,
        classes: classSchedules
    };
    currentTeacherNameMap = teacherNameMap;

    // Show the default view depending on the current state
    if (currentTimetableView === 'student') {
        showStudentsTimetables();
    } else {
        showTeachersTimetables();
    }
}

// ======================
// GENERATED TIMETABLE PAGE FUNCTIONS
// ======================
function openGeneratedTimetablePage() {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("generatedTimetableSection").style.display = "block";
    showTeachersTimetables();
    const generatedSection = document.getElementById("generatedTimetableSection");
    if (generatedSection) {
        generatedSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function closeGeneratedTimetablePage() {
    document.getElementById("generatedTimetableSection").style.display = "none";
    document.getElementById("mainContent").style.display = "block";
}

function showTeachersTimetables() {
    if (!currentTimetableData) return;
    currentTimetableView = 'teacher';
    
    const container = document.getElementById("timetableContainer");
    let html = "";

    html += `<section class="section"><h2>Consolidated Teacher Timetables</h2></section>`;
    html += buildTimetableSection("Teacher", currentTimetableData.teachers, key => currentTeacherNameMap.get(key) || key);

    if (activities && activities.length > 0) {
        html += `<section class="section"><h2>Institutional Activities</h2><div class="activity-list">`;
        html += activities.map(a => `<div class="activity-item"><span>${a.type} - ${a.day} P${a.period} ${a.elective ? '- ' + a.elective : ''} ${a.teachers.length ? '- Instructors:' + a.teachers.join(', ') : ''}</span></div>`).join('');
        html += `</div></section>`;
    }

    container.innerHTML = html;
    attachPerTableDownloadButtons(container);

    // Update active button state
    const teacherBtn = document.getElementById("teacherTimetableBtn");
    const studentBtn = document.getElementById("studentTimetableBtn");
    teacherBtn.classList.add("active");
    studentBtn.classList.remove("active");
}

function showStudentsTimetables() {
    if (!currentTimetableData) return;
    currentTimetableView = 'student';
    
    const container = document.getElementById("timetableContainer");
    let html = "";

    html += `<section class="section"><h2>Student Class Timetables</h2></section>`;
    html += buildTimetableSection("Class", currentTimetableData.classes);

    if (activities && activities.length > 0) {
        html += `<section class="section"><h2>Institutional Activities</h2><div class="activity-list">`;
        html += activities.map(a => `<div class="activity-item"><span>${a.type} - ${a.day} P${a.period} ${a.elective ? '- ' + a.elective : ''} ${a.teachers.length ? '- Instructors:' + a.teachers.join(', ') : ''}</span></div>`).join('');
        html += `</div></section>`;
    }

    container.innerHTML = html;
    attachPerTableDownloadButtons(container);

    // Update active button state
    const teacherBtn = document.getElementById("teacherTimetableBtn");
    const studentBtn = document.getElementById("studentTimetableBtn");
    teacherBtn.classList.remove("active");
    studentBtn.classList.add("active");
}

function attachPerTableDownloadButtons(container) {
    const buttons = container.querySelectorAll('.btn-download');
    buttons.forEach(button => {
        const view = button.dataset.view;
        const key = decodeURIComponent(button.dataset.key || '');
        button.addEventListener('click', () => downloadSingleTimetable(view, key));
    });
}

async function downloadSingleTimetable(view, itemKey) {
    const messageDiv = document.getElementById("downloadMessage");
    const fileType = 'pdf';

    try {
        const response = await fetch(`${API_BASE}/download/${fileType}?view_type=${view}&item_key=${encodeURIComponent(itemKey)}`);

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${view}-${itemKey}-timetable.${fileType}`;
            a.click();
            window.URL.revokeObjectURL(url);
            showMessage(messageDiv, `Downloaded ${view} timetable for ${itemKey}.`, "success");
        } else {
            const error = await response.json();
            showMessage(messageDiv, error.error || "Error downloading timetable", "error");
        }
    } catch (error) {
        showMessage(messageDiv, "Error: " + error.message, "error");
    }
}

// ======================
// GENERATE PERIOD CELLS
// ======================
function generatePeriodCells(schedule, day) {
    let html = "";
    const daySchedule = schedule[day];
    
    if (!daySchedule) return html;
    
    for (let i = 0; i < 8; i++) {
        const slot = daySchedule[i];
        const cellClass = getCellClass(slot);
        const content = getSlotContent(slot);
        html += `<td class="${cellClass}">${content}</td>`;

        // Insert breaks at fixed positions after certain teaching periods
        if (i === 2) {  // After P3
            html += `<td class="break">Break</td>`;
        } else if (i === 4) {  // After P5
            html += `<td class="lunch">Lunch</td>`;
        } else if (i === 6) {  // After P7
            html += `<td class="break">Break</td>`;
        }
    }

    return html;
}

const SHORT_ACTIVITY_LABELS = {
    'physical training': 'PT',
    'pt': 'PT',
    'mini project': 'MP',
    'professional elective': 'PE',
    'open elective': 'OE',
    'skillrack/placement': 'SR/PM',
    'skillrack placement': 'SR/PM',
    'library': 'Lib',
    'project phase / internship': 'PI',
    'project phase internship': 'PI',
};

function getShortActivityLabel(name) {
    if (!name || typeof name !== 'string') return name;
    const normalized = name.trim().toLowerCase();
    return SHORT_ACTIVITY_LABELS[normalized] || name;
}

function getCellClass(slot) {
    if (slot.type === "Free") return "free";
    if (slot.type === "Break") return "break";
    if (slot.type === "Lab") return "lab";
    if (slot.type === "Class") return "class";
    if (slot.type === "Activity") return "activity";
    return "";
}

function getSlotContent(slot) {
    const subject = getShortActivityLabel(slot.subject);
    if (slot.type === "Free") return "";  // Blank for free periods
    if (slot.type === "Break") return "Break";
    if (slot.type === "Lab") {
        return `<strong>${subject}</strong><br><small>(${slot.class || 'N/A'})</small><br><span style="color: #e65100; font-weight: bold;">LAB</span>`;
    }
    if (slot.type === "Activity") {
        return `<strong>${subject}</strong><br><small>(${slot.class || 'N/A'})</small>${slot.elective_no ? '<br><small style="color: #1565c0; font-weight: 500;">Elective No. ' + slot.elective_no + '</small>' : ''}`;
    }
    if (slot.subject) {
        return `<strong>${subject}</strong><br><small>(${slot.class || 'N/A'})</small>`;
    }
    return "";
}

// ======================
// DOWNLOAD FUNCTIONS
// ======================
async function downloadExcel() {
    const messageDiv = document.getElementById("downloadMessage");
    const view = currentTimetableView === 'student' ? 'student' : 'teacher';
    
    try {
        const response = await fetch(`${API_BASE}/download/excel?view_type=${view}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `timetable-${view}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            showMessage(messageDiv, "Excel file downloaded successfully!", "success");
        } else {
            const error = await response.json();
            showMessage(messageDiv, error.error || "Error downloading file", "error");
        }
    } catch (error) {
        showMessage(messageDiv, "Error: " + error.message, "error");
    }
}

async function downloadPDF() {
    const messageDiv = document.getElementById("downloadMessage");
    const view = currentTimetableView === 'student' ? 'student' : 'teacher';
    
    try {
        const response = await fetch(`${API_BASE}/download/pdf?view_type=${view}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `timetable-${view}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showMessage(messageDiv, "PDF file downloaded successfully!", "success");
        } else {
            const error = await response.json();
            showMessage(messageDiv, error.error || "Error downloading file", "error");
        }
    } catch (error) {
        showMessage(messageDiv, "Error: " + error.message, "error");
    }
}

// ======================
// CLEAR DATA
// ======================
async function clearAllData() {
    // First confirmation
    if (!confirm("Are you sure you want to clear all data? This cannot be undone.")) {
        return;
    }

    // Second confirmation for extra safety
    if (!confirm("⚠️ WARNING: This will permanently delete all teacher, subject, and timetable data. Click OK only if you are absolutely certain you want to proceed.")) {
        return;
    }

    // Third confirmation - require typing "CLEAR"
    const confirmText = prompt("Type 'CLEAR' (in capitals) to confirm permanent data deletion:");
    if (confirmText !== "CLEAR") {
        alert("Data clearing cancelled. You did not type 'CLEAR' correctly.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/clear`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById("teacherMessage").textContent = "";
            document.getElementById("subjectMessage").textContent = "";
            document.getElementById("generateMessage").textContent = "";
            document.getElementById("downloadMessage").textContent = "";
            document.getElementById("viewTimetableButtonSection").style.display = "none";
            document.getElementById("generatedTimetableSection").style.display = "none";
            currentTimetableData = null;
            currentTeacherNameMap = null;
            activities = [];
            clearActivitiesFromStorage();
            clearTeachersFromStorage();
            renderActivities();
            loadTeachers();
            alert("✓ All data has been cleared successfully! The system has been reset to its initial state.");
        } else {
            alert(data.error || "Error clearing data");
        }
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// ======================
// UTILITY FUNCTIONS
// ======================
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = "message " + type;
    
    // Auto-hide success messages after 5 seconds
    if (type === "success") {
        setTimeout(() => {
            element.textContent = "";
            element.className = "message";
        }, 5000);
    }
}

// ======================
// INITIALIZATION
// ======================
document.addEventListener("DOMContentLoaded", async function() {
    await loadActivities();
    renderActivities();
    loadTeachers(0);
});

function showLoadingIndicator() {
    const loadingDiv = document.getElementById("loadingIndicator");
    if (!loadingDiv) {
        const container = document.body;
        const newLoadingDiv = document.createElement("div");
        newLoadingDiv.id = "loadingIndicator";
        newLoadingDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            text-align: center;
            z-index: 2000;
            max-width: 300px;
        `;
        newLoadingDiv.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #1976d2;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                "></div>
            </div>
            <p style="margin: 10px 0; color: #333; font-weight: 500;">Connecting to server...</p>
            <p style="margin: 5px 0; color: #999; font-size: 14px;">This may take a moment on first load</p>
        `;
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        container.appendChild(newLoadingDiv);
    }
}

function hideLoadingIndicator() {
    const loadingDiv = document.getElementById("loadingIndicator");
    if (loadingDiv) {
        loadingDiv.style.display = "none";
    }
}
