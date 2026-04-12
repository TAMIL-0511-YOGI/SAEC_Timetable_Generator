const API_BASE = "http://localhost:5000/api";

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

// Activity state
let activities = [];
let editingActivityIndex = null;

// Initialize activity type event listener
document.addEventListener("DOMContentLoaded", function() {
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

    if (editActivityTypeSelect) {
        editActivityTypeSelect.addEventListener("change", () => updateActivityTypeFields("edit"));
    }

    if (editActivityThreePeriodCheckbox) {
        editActivityThreePeriodCheckbox.addEventListener("change", () => updateActivityTypeFields("edit"));
    }
});

// Enable/Disable fields based on Activity Type
function updateActivityTypeFields(prefix = "") {
    const activityType = document.getElementById(prefix + "activityType").value;
    const daySelect = document.getElementById(prefix + "activityDay");
    const periodInput = document.getElementById(prefix + "activityPeriod");
    const sectionSelect = document.getElementById(prefix + "activitySection");
    const hoursField = document.getElementById(prefix + "activityHours");
    const hoursLabel = document.querySelector('label[for="' + prefix + 'activityHours"]');

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
    const isThreePeriod = document.getElementById(prefix + "activityThreePeriod").checked;
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

// ======================
// ADD TEACHER FUNCTIONS
// ======================
async function addTeacher() {
    const teacherId = document.getElementById("teacherId").value.trim();
    const teacherName = document.getElementById("teacherName").value.trim();
    const messageDiv = document.getElementById("teacherMessage");

    if (!teacherId || !teacherName) {
        showMessage(messageDiv, "Please fill all fields", "error");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/teachers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teacher_id: teacherId, name: teacherName })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(messageDiv, "Teacher added successfully!", "success");
            document.getElementById("teacherId").value = "";
            document.getElementById("teacherName").value = "";
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
async function addSubject() {
    const teacherSelect = document.getElementById("teacherSelect");
    const subjectName = document.getElementById("subjectName").value.trim();
    const yearLevel = document.getElementById("yearLevel").value;
    const section = document.getElementById("section").value.trim();
    const hoursPerWeek = document.getElementById("hoursPerWeek").value;
    const isLab = document.getElementById("isLab").checked ? 1 : 0;
    const messageDiv = document.getElementById("subjectMessage");

    if (!teacherSelect.value || !subjectName || !yearLevel || !section || !hoursPerWeek) {
        showMessage(messageDiv, "Please fill all fields", "error");
        return;
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

    container.innerHTML = activities.map((a, i) => `
        <div class="activity-item">
            <span>
                Year ${a.year} ${a.section ? '| Section ' + a.section : ''} | ${a.type} | ${a.day} P${a.period} - ${a.hours} hr${a.hours > 1 ? 's' : ''}
                ${a.is_three_period ? '(3 periods)' : ''}
                ${a.multiple_occurrences ? `<span style="color: #ff6b35; font-weight: bold;">[${a.occurrence_count} times/week]</span>` : ''}
                ${a.auto_generated ? '<span style="color: #d32f2f; font-weight: bold;">[Auto-Generated]</span>' : ''}
                ${a.all_sections ? '<span style="color: #1976d2; font-weight: bold;">[All Sections]</span>' : ''}
                ${a.elective ? '- Elective: ' + a.elective : ''}
                ${a.elective_no ? '(No. ' + a.elective_no + ')' : ''}
                ${a.teachers.length ? '- Instructors: ' + a.teachers.join(', ') : ''}
            </span>
            <div style="display: flex; gap: 6px;">
                <button class="edit-btn icon-btn" onclick="startEditActivity(${i})" title="Edit activity" aria-label="Edit activity"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 3 20l.5-4L16.5 3.5z"></path></svg></button>
                <button class="delete-btn icon-btn" onclick="removeActivity(${i})" title="Delete activity" aria-label="Delete activity"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
            </div>
        </div>
    `).join('');
}

function removeActivity(index) {
    activities.splice(index, 1);
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

    for (let i = 0; i < 10; i++) {
        const teacherName = activity.teachers[i] || "";
        const select = document.getElementById(`editMultiTeacher${i + 1}`);
        if (select) select.value = teacherName;
    }

    updateActivityTypeFields("edit");
    document.getElementById("editActivityModal").style.display = "block";
}

function closeEditActivityModal() {
    document.getElementById("editActivityModal").style.display = "none";
    editingActivityIndex = null;
}

function saveEditedActivity() {
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
async function loadTeachers() {
    try {
        const response = await fetch(`${API_BASE}/teachers`);
        const teachers = await response.json();

        // Update teacher dropdown
        const teacherSelect = document.getElementById("teacherSelect");
        const currentValue = teacherSelect.value;
        teacherSelect.innerHTML = '<option value="">Select Teacher</option>';

        teachers.forEach(teacher => {
            const option = document.createElement("option");
            option.value = teacher.teacher_id;
            option.textContent = teacher.name;
            teacherSelect.appendChild(option);
        });

        teacherSelect.value = currentValue;

        // Update activity teacher selects and datalist for quick selection in activity form
        populateActivityTeacherSelects(teachers);
        populateActivityTeacherDatalist(teachers);

        // Display teachers and subjects
        displayTeachers(teachers);
    } catch (error) {
        console.error("Error loading teachers:", error);
    }
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
    const teacherNames = teachers.map(t => t.name);
    const teacherSelects = document.querySelectorAll(".teacher-select");
    teacherSelects.forEach(select => {
        const selected = select.value;
        select.innerHTML = '<option value="">Select Teacher</option>';
        teacherNames.forEach(name => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
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

function openActivityDatabase() {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("activityDatabaseSection").style.display = "block";
    renderActivities();
}

function closeActivityDatabase() {
    document.getElementById("activityDatabaseSection").style.display = "none";
    document.getElementById("mainContent").style.display = "block";
}

async function loadTeacherDatabase() {
    try {
        const response = await fetch(`${API_BASE}/teachers`);
        const teachers = await response.json();
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

    container.innerHTML = teachers.map(teacher => `
        <div class="teacher-card" style="margin-bottom: 14px; border: 1px solid #c8d7f4;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">${teacher.name} (ID: ${teacher.teacher_id})</h3>
                <div style="display: flex; gap: 8px;">
                    <button class="edit-btn icon-btn" onclick="editTeacher('${teacher.teacher_id}', '${teacher.name.replace(/'/g, "\\'")}')" title="Edit teacher" aria-label="Edit teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="delete-btn icon-btn" onclick="deleteTeacher('${teacher.teacher_id}')" title="Delete teacher" aria-label="Delete teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
            </div>
            <p><strong>Total Hours:</strong> ${teacher.total_hours_per_week}</p>
            <p><strong>Free periods:</strong> ${teacher.free_periods_count || 0}</p>
            <p><strong>Subjects (${teacher.subjects.length}):</strong></p>
            <div>
                ${teacher.subjects.length === 0 ? `<p style='color:#999;'>No subjects</p>` : teacher.subjects.map(s => `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span>${s.name} (${s.year}${s.section}) - ${s.hours_per_week} hr${s.hours_per_week > 1 ? 's' : ''}${s.is_lab ? ' [LAB]' : ''}</span>
                        <div style="display:flex; gap:6px;">
                            <button class="edit-btn icon-btn" onclick="showEditModal(${s.subject_id}, '${s.name}', ${s.year}, '${s.section}', ${s.hours_per_week}, ${s.is_lab})" title="Edit subject" aria-label="Edit subject"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                            <button class="delete-btn icon-btn" onclick="deleteSubject(${s.subject_id})" title="Delete subject" aria-label="Delete subject"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                        </div>
                    </div>
                `).join('')}
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
            await loadTeachers();
            await loadTeacherDatabase();
        } else {
            alert(data.error || "Error deleting teacher");
        }
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function editTeacher(teacherId, currentName) {
    const newName = prompt("Update teacher name:", currentName);
    if (!newName || newName.trim().length === 0) return;

    fetch(`${API_BASE}/teachers/${teacherId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() })
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
        <div class="teacher-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3 style="margin:0;">${teacher.name} (ID: ${teacher.teacher_id})</h3>
                <div style="display: flex; gap: 8px;">
                    <button class="edit-btn icon-btn" onclick="editTeacher('${teacher.teacher_id}', '${teacher.name.replace("'", "\'")}')" title="Edit teacher" aria-label="Edit teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="delete-btn icon-btn" onclick="deleteTeacher('${teacher.teacher_id}')" title="Delete teacher" aria-label="Delete teacher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
            </div>
            <p><strong>Total Hours per Week:</strong> ${teacher.total_hours_per_week}</p>
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
    
    try {
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
            document.getElementById("timetableSection").style.display = "block";
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
        return `
            <div class="teacher-timetable">
                <div class="timetable-title">${title}: ${displayLabel}</div>
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

async function displayTimetable(timetable) {
    const container = document.getElementById("timetableContainer");

    const teacherResponse = await fetch(`${API_BASE}/teachers`);
    const teacherList = await teacherResponse.json();
    const teacherNameMap = new Map(teacherList.map(t => [t.teacher_id, t.name]));

    const teacherSchedules = timetable.teachers || timetable;
    const classSchedules = timetable.classes || {};

    let html = "";

    html += `<section class="section"><h2>Consolidated Teacher Timetables</h2></section>`;
    html += buildTimetableSection("Teacher", teacherSchedules, key => teacherNameMap.get(key) || key);

    html += `<section class="section"><h2>Student Class Timetables</h2></section>`;
    html += buildTimetableSection("Class", classSchedules);

    if (activities && activities.length > 0) {
        html += `<section class="section"><h2>Institutional Activities</h2><div class="activity-list">`;
        html += activities.map(a => `<div class="activity-item"><span>${a.type} - ${a.day} P${a.period} ${a.elective ? '- ' + a.elective : ''} ${a.teachers.length ? '- Instructors:' + a.teachers.join(', ') : ''}</span></div>`).join('');
        html += `</div></section>`;
    }

    container.innerHTML = html;
}


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

function getCellClass(slot) {
    if (slot.type === "Free") return "free";
    if (slot.type === "Break") return "break";
    if (slot.type === "Lab") return "lab";
    if (slot.type === "Class") return "class";
    if (slot.type === "Activity") return "activity";
    return "";
}

function getSlotContent(slot) {
    if (slot.type === "Free") return "";  // Blank for free periods
    if (slot.type === "Break") return "Break";
    if (slot.type === "Lab") {
        return `<strong>${slot.subject}</strong><br><small>(${slot.class || 'N/A'})</small><br><span style="color: #e65100; font-weight: bold;">LAB</span>`;
    }
    if (slot.type === "Activity") {
        return `<strong>${slot.subject}</strong><br><small>(${slot.class || 'N/A'})</small>${slot.elective_no ? '<br><small style="color: #1565c0; font-weight: 500;">Elective No. ' + slot.elective_no + '</small>' : ''}`;
    }
    if (slot.subject) {
        return `<strong>${slot.subject}</strong><br><small>(${slot.class || 'N/A'})</small>`;
    }
    return "";
}

// ======================
// DOWNLOAD FUNCTIONS
// ======================
async function downloadExcel() {
    const messageDiv = document.getElementById("downloadMessage");
    
    try {
        const response = await fetch(`${API_BASE}/download/excel`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "timetable.xlsx";
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
    
    try {
        const response = await fetch(`${API_BASE}/download/pdf`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "timetable.pdf";
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
    if (!confirm("Are you sure you want to clear all data? This cannot be undone.")) {
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
            document.getElementById("timetableSection").style.display = "none";
            loadTeachers();
            alert("All data has been cleared successfully!");
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
document.addEventListener("DOMContentLoaded", function() {
    loadTeachers();
});
