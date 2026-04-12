import random
from itertools import combinations

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
PERIODS = 8  # 8 periods per day

# Allowed 3-period start indices (0-based): 1-3, 2-4, 3-5, 6-8
ALLOWED_3_PERIOD_STARTS = [0, 1, 2, 5]

# Consecutive 3-period lab slots
LAB_SLOTS = [
    (0, 1, 2),      # Periods 1-3
    (1, 2, 3),      # Periods 2-4
    (2, 3, 4),      # Periods 3-5
    (5, 6, 7)       # Periods 6-8
]

def create_empty_schedule():
    """Create empty schedule for all days and periods"""
    return {day: [{"type": "Free", "subject": None, "class": None} for _ in range(PERIODS)] for day in DAYS}

def is_slot_free(schedule, day, period):
    """Check if a specific slot is free"""
    slot = schedule[day][period]
    return slot["type"] == "Free"

def is_consecutive_free(schedule, day, periods_list):
    """Check if consecutive periods are all free"""
    return all(is_slot_free(schedule, day, p) for p in periods_list)

def allocate_class_period(schedule, day, period, subject_name, class_name):
    """Allocate a single class period"""
    if is_slot_free(schedule, day, period):
        schedule[day][period] = {"type": "Class", "subject": subject_name, "class": class_name}
        return True
    return False

def allocate_lab_block(schedule, day, periods_tuple, subject_name, class_name):
    """Allocate a 3-period lab block"""
    if is_consecutive_free(schedule, day, periods_tuple):
        for period in periods_tuple:
            schedule[day][period] = {"type": "Lab", "subject": subject_name, "class": class_name}
        return True
    return False


def find_teacher_matches(teachers, activity_teacher_names):
    """Return teacher objects matching activity teacher names/ids (case-insensitive)."""
    normalized_names = {name.strip().lower() for name in activity_teacher_names if isinstance(name, str) and name.strip()}
    matched = []
    for teacher in teachers:
        if teacher is None:
            continue
        teacher_id = str(teacher.teacher_id).strip().lower() if teacher.teacher_id is not None else ""
        teacher_name = str(teacher.name).strip().lower() if teacher.name is not None else ""
        if teacher_id in normalized_names or teacher_name in normalized_names:
            matched.append(teacher)
    return matched


def allocate_activity(schedule, day, period_indices, activity_name, class_name=None, elective_no=None, force=False):
    """Allocate activity slots in schedule as reserved and avoid conflicts.
    
    Args:
        force: If True, attempt to allocate even if slots are occupied, but preserve fixed manual activities.
    """
    locked_subjects = {"PT", "Library", "Project Phase / Internship", "Professional Elective", "Open Elective"}

    # If any slot in interval is fixed manual activity, fail allocation.
    if any((not is_slot_free(schedule, day, p)) and (schedule[day][p]["subject"] in locked_subjects) for p in period_indices):
        return False

    # If not forcing, require all slots be free
    if not force and any(not is_slot_free(schedule, day, p) for p in period_indices):
        return False

    for p in period_indices:
        existing = schedule[day][p]
        if not is_slot_free(schedule, day, p):
            # if forcing and current subject is not locked, allow overwrite
            if force and existing.get("subject") not in locked_subjects:
                pass
            else:
                return False

        slot_data = {"type": "Activity", "subject": activity_name, "class": class_name}
        if elective_no:
            slot_data["elective_no"] = elective_no
        schedule[day][p] = slot_data
    return True


def find_common_consecutive_slot(class_names, class_schedules, teacher_schedules, matched_teachers, length=3, preferred_day=None, preferred_start=None):
    """Return a shared day and start period that is free for all target classes and teachers."""
    def slot_ok(day, start):
        period_indices = list(range(start, start + length))
        if start < 0 or start + length > PERIODS:
            return False
        for class_name in class_names:
            if not is_consecutive_free(class_schedules[class_name], day, period_indices):
                return False
        for teacher in matched_teachers or []:
            if not is_consecutive_free(teacher_schedules[teacher.teacher_id], day, period_indices):
                return False
        return True

    if preferred_day in DAYS and preferred_start is not None and slot_ok(preferred_day, preferred_start):
        return preferred_day, preferred_start

    starts = ALLOWED_3_PERIOD_STARTS if length == 3 else list(range(0, PERIODS - length + 1))
    for day in DAYS:
        for start in starts:
            if slot_ok(day, start):
                return day, start
    return None, None


def find_same_slots_for_elective(class_names, class_schedules, teacher_schedules, matched_teachers, count=4):
    """Find same free period slots for elective activities across all classes and teachers."""
    available = []
    for day in DAYS:
        for period in range(PERIODS):
            if all(is_slot_free(class_schedules[class_name], day, period) for class_name in class_names):
                if all(is_slot_free(teacher_schedules[teacher.teacher_id], day, period) for teacher in matched_teachers or []):
                    available.append((day, period))
    random.shuffle(available)
    if len(available) < count:
        return []
    return available[:count]


def schedule_labs_for_teacher(schedule, teacher):
    """Schedule lab periods for a teacher based on actual hours_per_week"""
    for subject in teacher.subjects:
        if subject.is_lab and subject.hours_per_week > 0:
            # Each 3-period block = 3 hours, so allocate blocks accordingly
            # hours_per_week / 3 = number of blocks needed
            blocks_needed = subject.hours_per_week // 3
            
            lab_day = subject.lab_days[0] if subject.lab_days else 0  # Use preferred day
            day = DAYS[lab_day]
            
            allocated_blocks = 0
            attempts = 0
            
            # Allocate consecutive 3-period blocks for the lab
            while allocated_blocks < blocks_needed and attempts < 50:
                slot = random.choice(LAB_SLOTS)
                
                if allocate_lab_block(schedule, day, slot, subject.name, subject.class_name):
                    allocated_blocks += 1
                
                attempts += 1

def schedule_classes_for_teacher(schedule, teacher):
    """Schedule class periods for a teacher"""
    for subject in teacher.subjects:
        if not subject.is_lab and subject.hours_per_week > 0:
            hours_needed = subject.hours_per_week
            allocated = 0
            attempts = 0
            
            # Allocate individual periods for the class
            while allocated < hours_needed and attempts < 100:
                day = random.choice(DAYS)
                period = random.randint(0, PERIODS - 1)
                
                if allocate_class_period(schedule, day, period, subject.name, subject.class_name):
                    allocated += 1
                
                attempts += 1

def generate(teachers, activities=None):
    """Main function to generate class and teacher timetables with no conflicts and balanced workloads"""
    if not teachers or len(teachers) == 0:
        return {}

    activities = activities or []

    # Collect unique class names from all subjects
    class_names = {subject.class_name for teacher in teachers for subject in teacher.subjects}

    # Add classes referenced by activities (even if no subjects exist yet for that year/section)
    for activity in activities:
        activity_year = int(activity.get('year', 2))
        activity_section = activity.get('section')

        if activity_section:
            class_names.add(f"{activity_year}{activity_section}")
        else:
            # If no section provided and there are no known classes for that year yet, add a default section A
            year_classes = [cn for cn in class_names if len(cn) >= 2 and int(cn[0]) == activity_year]
            if not year_classes:
                class_names.add(f"{activity_year}A")

    class_names = sorted(class_names)

    # Create empty schedules
    teacher_schedules = {teacher.teacher_id: create_empty_schedule() for teacher in teachers}
    class_schedules = {class_name: create_empty_schedule() for class_name in class_names}

    # Keep teacher daily load counters to enforce 3-4 free periods per day (max 5 occupied periods each day)
    teacher_daily_load = {teacher.teacher_id: {day: 0 for day in DAYS} for teacher in teachers}

    # Global lab slots to avoid cross-class lab conflicts
    global_lab_slots = set()

    # 0) Allocate institutional activities first
    for activity in activities:
        activity_type = activity.get('type', '')
        year = int(activity.get('year', 2))
        activity_section = activity.get('section')
        
        if year == 2 and activity_type in ["Mini Project", "Professional Elective", "Open Elective"]:
            # No such activities for 2nd year
            continue

        # For Mini Project/Skillrack, default to class-specific when section is provided
        allocate_all_sections = activity_type in ["Mini Project", "Skillrack/Placement"] and (activity_section is None or activity_section == "")
        
        # Get occurrence count for activities that can occur multiple times per week
        if activity_type == "Mini Project":
            occurrence_count = 2  # Always 2 times a week for Mini Project
            is_three_period = True  # Always 3 consecutive periods
        elif activity_type == "Skillrack/Placement":
            occurrence_count = 1  # Once a week
            is_three_period = True  # 3 consecutive periods
        else:
            occurrence_count = activity.get('occurrence_count', 1) if activity_type == "Mini Project" else 1
            is_three_period = activity.get('is_three_period', False)
        
        # Fixed placement for manual-instruction activities (PT, Library, Project Phase / Internship)
        if activity_type in ["PT", "Library", "Project Phase / Internship"]:
            # Must have specific day and period from activity settings
            day = activity.get('day')
            if day not in DAYS:
                continue

            start_period = int(activity.get('period', 1)) - 1
            if start_period < 0 or start_period >= PERIODS:
                continue

            # 3-period block rule enforcement
            if is_three_period:
                length = 3
                if start_period not in [0, 1, 2, 5]:  # only 1-3,2-4,3-5,6-8
                    continue
            else:
                length = int(activity.get('hours', 1))

            if start_period + length > PERIODS:
                continue

            period_indices = list(range(start_period, start_period + length))
            textual = activity_type
            elective_no = activity.get('elective_no')
            activity_year = int(activity.get('year', 2))
            activity_section = activity.get('section') or None

            # Determine which class(es) should be assigned
            target_classes = []
            if activity_section:
                class_name = f"{activity_year}{activity_section}"
                if class_name in class_schedules:
                    target_classes.append(class_name)
            else:
                target_classes = [cn for cn in class_schedules if len(cn) >= 2 and int(cn[0]) == activity_year]

            # Allocate to class schedules first
            for class_name in target_classes:
                allocate_activity(class_schedules[class_name], day, period_indices, textual, class_name, elective_no, force=True)

            # Allocate to teacher schedules for matching instructors
            matched_teachers = find_teacher_matches(teachers, activity.get('teachers', []))
            teacher_slot_class_name = f"{activity_year}{activity_section}" if activity_section else None
            for teacher in matched_teachers:
                allocate_activity(teacher_schedules[teacher.teacher_id], day, period_indices, textual, teacher_slot_class_name, elective_no, force=True)
                teacher_daily_load[teacher.teacher_id][day] += len(period_indices)

            continue

        # Special handling for Professional/Open Elective: allocate one period per day across multiple days
        if activity_type in ["Professional Elective", "Open Elective"]:
            activity_year = int(activity.get('year', 2))
            elective_no = activity.get('elective_no')
            textual = activity_type
            matched_teachers = find_teacher_matches(teachers, activity.get('teachers', []))
            target_classes = sorted([cn for cn in class_schedules if len(cn) >= 2 and int(cn[0]) == activity_year])
            if not target_classes:
                continue

            user_day = activity.get('day')
            user_period = int(activity.get('period', 0)) - 1 if activity.get('period') else None
            duration = int(activity.get('hours', 4)) if activity.get('hours') else 4
            if duration < 1:
                duration = 1
            duration = min(duration, len(DAYS))

            def slot_available(day, period):
                if day not in DAYS or period is None or period < 0 or period >= PERIODS:
                    return False
                if any(not is_slot_free(class_schedules[class_name], day, period) for class_name in target_classes):
                    return False
                if any(not is_slot_free(teacher_schedules[teacher.teacher_id], day, period) for teacher in matched_teachers):
                    return False
                return True

            elective_slots = []

            def choose_slot_for_day(day):
                if day not in DAYS:
                    return None
                periods = list(range(PERIODS))
                random.shuffle(periods)

                # If a specific period is requested, prefer it if available
                if day == user_day and user_period is not None:
                    if slot_available(day, user_period):
                        return user_period

                for period in periods:
                    if slot_available(day, period):
                        return period
                return None

            # Try to reserve the requested day/period first, if provided
            if user_day in DAYS:
                chosen_period = choose_slot_for_day(user_day)
                if chosen_period is not None:
                    elective_slots.append((user_day, chosen_period))

            # Randomize remaining days and allocate one slot per day until done
            remaining_days = [day for day in DAYS if day != user_day]
            random.shuffle(remaining_days)
            for day in remaining_days:
                if len(elective_slots) >= duration:
                    break
                chosen_period = choose_slot_for_day(day)
                if chosen_period is not None:
                    elective_slots.append((day, chosen_period))

            if len(elective_slots) == duration:
                for day, period in elective_slots:
                    for class_name in target_classes:
                        allocate_activity(class_schedules[class_name], day, [period], textual, class_name, elective_no, force=False)
                    for teacher in matched_teachers:
                        if allocate_activity(teacher_schedules[teacher.teacher_id], day, [period], textual, None, elective_no, force=False):
                            teacher_daily_load[teacher.teacher_id][day] += 1
            continue

        else:
            # For ALL-SECTION activities (Mini Project, Skillrack), allocate to section(s)
            activity_year = int(activity.get('year', 2))
            
            if activity_section:
                class_name_for_section = f"{activity_year}{activity_section}"
                year_classes = [class_name_for_section] if class_name_for_section in class_schedules else []
            else:
                # For no-section activity, allocate to all sections of this year
                year_classes = sorted([cn for cn in class_schedules.keys() if len(cn) >= 2 and int(cn[0]) == activity_year])
            
            matched_teachers = find_teacher_matches(teachers, activity.get('teachers', []))
            teacher_slot_class_name = f"{activity_year}{activity_section}" if activity_section else None
            textual = activity_type

            if activity_type == "Skillrack/Placement":
                preferred_day = activity.get('day') if activity.get('day') in DAYS else None
                preferred_start = int(activity.get('period', 1)) - 1 if activity.get('period') else None
                chosen_day, chosen_start = find_common_consecutive_slot(year_classes, class_schedules, teacher_schedules, matched_teachers, length=3, preferred_day=preferred_day, preferred_start=preferred_start)
                if chosen_day is None:
                    chosen_day, chosen_start = find_common_consecutive_slot(year_classes, class_schedules, teacher_schedules, matched_teachers, length=3)

                if chosen_day is not None:
                    period_indices = list(range(chosen_start, chosen_start + 3))
                    for class_name in year_classes:
                        allocate_activity(class_schedules[class_name], chosen_day, period_indices, textual, class_name, activity.get('elective_no'), force=False)
                    for teacher in matched_teachers:
                        if allocate_activity(teacher_schedules[teacher.teacher_id], chosen_day, period_indices, textual, teacher_slot_class_name, activity.get('elective_no'), force=True):
                            teacher_daily_load[teacher.teacher_id][chosen_day] += len(period_indices)
                continue

            # Mini Project: assign two 3-period blocks per class, preferring different days
            for class_name in year_classes:
                assigned_occurrences = 0
                preferred_days = [activity.get('day')] if activity.get('day') in DAYS else []
                remaining_days = [d for d in DAYS if d not in preferred_days]
                search_days = preferred_days + random.sample(remaining_days, len(remaining_days))

                for day in search_days:
                    if assigned_occurrences >= occurrence_count:
                        break
                    for start_period in ALLOWED_3_PERIOD_STARTS:
                        period_indices = list(range(start_period, start_period + 3))
                        if not is_consecutive_free(class_schedules[class_name], day, period_indices):
                            continue
                        if any(not is_consecutive_free(teacher_schedules[teacher.teacher_id], day, period_indices) for teacher in matched_teachers):
                            continue

                        if allocate_activity(class_schedules[class_name], day, period_indices, textual, class_name, activity.get('elective_no'), force=False):
                            for teacher in matched_teachers:
                                if allocate_activity(teacher_schedules[teacher.teacher_id], day, period_indices, textual, teacher_slot_class_name, activity.get('elective_no'), force=True):
                                    teacher_daily_load[teacher.teacher_id][day] += len(period_indices)
                            assigned_occurrences += 1
                            break

                # If not enough occurrences assigned, try again across all days
                if assigned_occurrences < occurrence_count:
                    for day in DAYS:
                        if assigned_occurrences >= occurrence_count:
                            break
                        for start_period in ALLOWED_3_PERIOD_STARTS:
                            if day in search_days and assigned_occurrences >= len(search_days):
                                break
                            period_indices = list(range(start_period, start_period + 3))
                            if not is_consecutive_free(class_schedules[class_name], day, period_indices):
                                continue
                            if any(not is_consecutive_free(teacher_schedules[teacher.teacher_id], day, period_indices) for teacher in matched_teachers):
                                continue
                            if allocate_activity(class_schedules[class_name], day, period_indices, textual, class_name, activity.get('elective_no'), force=False):
                                for teacher in matched_teachers:
                                    if allocate_activity(teacher_schedules[teacher.teacher_id], day, period_indices, textual, teacher_slot_class_name, activity.get('elective_no'), force=True):
                                        teacher_daily_load[teacher.teacher_id][day] += len(period_indices)
                                assigned_occurrences += 1
                                break

            continue

    # 1) Allocate lab sessions first (3-period sessions)
    for teacher in teachers:
        for subject in teacher.subjects:
            if subject.is_lab and subject.hours_per_week > 0:
                blocks_needed = max(1, subject.hours_per_week // 3)
                allocated_blocks = 0
                attempts = 0

                available_days = DAYS.copy()
                random.shuffle(available_days)

                while allocated_blocks < blocks_needed and attempts < 200:
                    day = random.choice(available_days)

                    # avoid teacher overload on this day
                    if teacher_daily_load[teacher.teacher_id][day] >= 5:
                        attempts += 1
                        continue

                    slot = random.choice(LAB_SLOTS)
                    slot_key = (day, slot)

                    if slot_key in global_lab_slots:
                        attempts += 1
                        continue

                    if not is_consecutive_free(teacher_schedules[teacher.teacher_id], day, slot):
                        attempts += 1
                        continue

                    if not is_consecutive_free(class_schedules[subject.class_name], day, slot):
                        attempts += 1
                        continue

                    # Assign block to both teacher and class schedules
                    allocate_lab_block(teacher_schedules[teacher.teacher_id], day, slot, subject.name, subject.class_name)
                    allocate_lab_block(class_schedules[subject.class_name], day, slot, subject.name, subject.class_name)

                    for p in slot:
                        teacher_daily_load[teacher.teacher_id][day] += 1

                    global_lab_slots.add(slot_key)
                    allocated_blocks += 1
                    attempts += 1

    # 2) Allocate theory/class periods while respecting teacher and class conflicts
    for teacher in teachers:
        for subject in teacher.subjects:
            if not subject.is_lab and subject.hours_per_week > 0:
                hours_needed = subject.hours_per_week
                allocated = 0

                all_slots = [(day, period) for day in DAYS for period in range(PERIODS)]
                random.shuffle(all_slots)

                for day, period in all_slots:
                    if allocated >= hours_needed:
                        break

                    if teacher_daily_load[teacher.teacher_id][day] >= 5:
                        continue

                    if not is_slot_free(teacher_schedules[teacher.teacher_id], day, period):
                        continue

                    if not is_slot_free(class_schedules[subject.class_name], day, period):
                        continue

                    allocate_class_period(teacher_schedules[teacher.teacher_id], day, period, subject.name, subject.class_name)
                    allocate_class_period(class_schedules[subject.class_name], day, period, subject.name, subject.class_name)

                    teacher_daily_load[teacher.teacher_id][day] += 1
                    allocated += 1

    # 3) Ensure each teacher has 3-4 free periods per day by leaving unassigned slots as Free
    # (This is inherently enforced by max 5 occupied periods per day above.)

    # 4) Attach the generated class schedules to the returned object
    # Map teacher and class schedules separately
    return {
        'teachers': teacher_schedules,
        'classes': class_schedules
    }

