import sqlite3
import os
import json
from models import Teacher, Subject

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "timetable.db")

def init_db():
    """Initialize database with proper schema"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Teachers table
    c.execute('''CREATE TABLE IF NOT EXISTS teachers (
                    teacher_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    rnd_day TEXT DEFAULT ''
                )''')
    
    # Subjects table
    c.execute('''CREATE TABLE IF NOT EXISTS subjects (
                    subject_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    section TEXT NOT NULL,
                    hours_per_week INTEGER NOT NULL,
                    is_lab BOOLEAN DEFAULT 0,
                    lab_days TEXT DEFAULT '',
                    teacher_id TEXT NOT NULL,
                    teacher_ids TEXT DEFAULT '',
                    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id)
                )''')
    
    # Timetable entries table
    c.execute('''CREATE TABLE IF NOT EXISTS timetable_entries (
                    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    teacher_id TEXT NOT NULL,
                    subject_name TEXT NOT NULL,
                    class_name TEXT NOT NULL,
                    day INTEGER NOT NULL,
                    period INTEGER NOT NULL,
                    entry_type TEXT DEFAULT 'Class',
                    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id)
                )''')

    # Activities table for persisted institutional activities
    c.execute('''CREATE TABLE IF NOT EXISTS activities (
                    activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    year INTEGER NOT NULL,
                    section TEXT,
                    day TEXT,
                    period INTEGER,
                    type TEXT NOT NULL,
                    hours INTEGER NOT NULL,
                    elective TEXT,
                    elective_no TEXT,
                    teachers TEXT,
                    is_three_period INTEGER DEFAULT 0,
                    auto_generated INTEGER DEFAULT 0,
                    all_sections INTEGER DEFAULT 0,
                    multiple_occurrences INTEGER DEFAULT 0,
                    occurrence_count INTEGER DEFAULT 1
                )''')
    
    # Ensure legacy databases get the new rnd_day column
    c.execute("PRAGMA table_info(teachers)")
    teacher_columns = [row[1] for row in c.fetchall()]
    if 'rnd_day' not in teacher_columns:
        c.execute("ALTER TABLE teachers ADD COLUMN rnd_day TEXT DEFAULT ''")
    
    conn.commit()
    conn.close()

    # Ensure legacy subjects table has teacher_ids for shared lab assignments
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("PRAGMA table_info(subjects)")
    subject_columns = [row[1] for row in c.fetchall()]
    if 'teacher_ids' not in subject_columns:
        c.execute("ALTER TABLE subjects ADD COLUMN teacher_ids TEXT DEFAULT ''")
    conn.commit()
    conn.close()

def connect():
    """Connect to database"""
    return sqlite3.connect(DB_PATH)

def add_teacher(teacher_id, name, rnd_day=''):
    """Add a new teacher"""
    conn = connect()
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO teachers (teacher_id, name, rnd_day) VALUES (?, ?, ?)", 
              (teacher_id, name, rnd_day or ''))
    conn.commit()
    conn.close()

def add_subject(subject_name, year, section, hours_per_week, teacher_id, is_lab=0, lab_days='', teacher_ids=None):
    """Add a subject to a teacher or multiple teachers"""
    conn = connect()
    c = conn.cursor()
    teacher_ids_list = teacher_ids if isinstance(teacher_ids, list) else [teacher_id]
    teacher_ids_str = json.dumps(teacher_ids_list)
    c.execute('''INSERT INTO subjects 
                 (name, year, section, hours_per_week, is_lab, lab_days, teacher_id, teacher_ids) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', 
              (subject_name, year, section, hours_per_week, is_lab, lab_days, teacher_id, teacher_ids_str))
    conn.commit()
    conn.close()

def get_all_teachers():
    """Get all teachers with their subjects"""
    conn = connect()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM teachers")
    teachers_data = c.fetchall()
    
    teachers = {t['teacher_id']: Teacher(t['teacher_id'], t['name'], rnd_day=t['rnd_day'] if 'rnd_day' in t.keys() else '') for t in teachers_data}

    c.execute("SELECT * FROM subjects")
    subjects_data = c.fetchall()

    for s in subjects_data:
        # Convert lab_days from string to list of integers
        if s['lab_days'] and s['lab_days'].strip():
            lab_days = [int(x.strip()) for x in s['lab_days'].split(',')]
        else:
            lab_days = []

        # Convert teacher_ids JSON string or fallback to the main teacher_id
        try:
            teacher_ids = json.loads(s['teacher_ids']) if s['teacher_ids'] else []
            if not isinstance(teacher_ids, list):
                teacher_ids = [str(teacher_ids)]
        except Exception:
            teacher_ids = [str(s['teacher_id'])]

        if not teacher_ids:
            teacher_ids = [str(s['teacher_id'])]

        for teacher_id in teacher_ids:
            teacher = teachers.get(str(teacher_id))
            if not teacher:
                continue

            subject = Subject(
                name=s['name'],
                year=s['year'],
                section=s['section'],
                hours_per_week=s['hours_per_week'],
                is_lab=bool(s['is_lab']),
                lab_days=lab_days,
                teacher_ids=teacher_ids,
                subject_id=s['subject_id']
            )
            teacher.add_subject(subject)

    conn.close()
    return list(teachers.values())

def delete_subject(subject_id):
    """Delete a specific subject by ID"""
    conn = connect()
    c = conn.cursor()
    c.execute("DELETE FROM subjects WHERE subject_id = ?", (subject_id,))
    conn.commit()
    conn.close()


def delete_teacher(teacher_id):
    """Delete teacher and associated subjects"""
    conn = connect()
    c = conn.cursor()
    c.execute("DELETE FROM subjects WHERE teacher_id = ?", (teacher_id,))
    c.execute("DELETE FROM teachers WHERE teacher_id = ?", (teacher_id,))
    conn.commit()
    conn.close()


def update_teacher(teacher_id, name, rnd_day=None):
    """Update teacher name and optional R&D day"""
    conn = connect()
    c = conn.cursor()
    if rnd_day is None:
        c.execute("UPDATE teachers SET name = ? WHERE teacher_id = ?", (name, teacher_id))
    else:
        c.execute("UPDATE teachers SET name = ?, rnd_day = ? WHERE teacher_id = ?", (name, rnd_day or '', teacher_id))
    conn.commit()
    conn.close()


def update_subject(subject_id, subject_name, year, section, hours_per_week, is_lab=0, teacher_ids=None):
    """Update a specific subject"""
    conn = connect()
    c = conn.cursor()
    if teacher_ids is not None:
        teacher_ids_str = json.dumps(teacher_ids if isinstance(teacher_ids, list) else [teacher_ids])
        c.execute('''UPDATE subjects 
                     SET name = ?, year = ?, section = ?, hours_per_week = ?, is_lab = ?, teacher_ids = ?
                     WHERE subject_id = ?''', 
                  (subject_name, year, section, hours_per_week, is_lab, teacher_ids_str, subject_id))
    else:
        c.execute('''UPDATE subjects 
                     SET name = ?, year = ?, section = ?, hours_per_week = ?, is_lab = ?
                     WHERE subject_id = ?''', 
                  (subject_name, year, section, hours_per_week, is_lab, subject_id))
    conn.commit()
    conn.close()

def clear_all():
    """Clear all data from database"""
    conn = connect()
    c = conn.cursor()
    c.execute("DELETE FROM timetable_entries")
    c.execute("DELETE FROM subjects")
    c.execute("DELETE FROM teachers")
    c.execute("DELETE FROM activities")
    conn.commit()
    conn.close()


def save_activity(activity):
    """Save a new activity to the database"""
    conn = connect()
    c = conn.cursor()
    c.execute('''INSERT INTO activities 
                 (year, section, day, period, type, hours, elective, elective_no, teachers, is_three_period, auto_generated, all_sections, multiple_occurrences, occurrence_count) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (
                  activity.get('year'),
                  activity.get('section'),
                  activity.get('day'),
                  activity.get('period'),
                  activity.get('type'),
                  activity.get('hours'),
                  activity.get('elective'),
                  activity.get('elective_no'),
                  json.dumps(activity.get('teachers', [])),
                  int(bool(activity.get('is_three_period'))),
                  int(bool(activity.get('auto_generated'))),
                  int(bool(activity.get('all_sections'))),
                  int(bool(activity.get('multiple_occurrences'))),
                  int(activity.get('occurrence_count', 1))
              ))
    activity_id = c.lastrowid
    conn.commit()
    conn.close()
    return activity_id


def get_all_activities():
    """Return all saved activities from the database"""
    conn = connect()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM activities ORDER BY activity_id ASC")
    rows = c.fetchall()
    activities = []

    for row in rows:
        activities.append({
            "id": row["activity_id"],
            "year": row["year"],
            "section": row["section"],
            "day": row["day"],
            "period": row["period"],
            "type": row["type"],
            "hours": row["hours"],
            "elective": row["elective"],
            "elective_no": row["elective_no"],
            "teachers": json.loads(row["teachers"] or "[]"),
            "is_three_period": bool(row["is_three_period"]),
            "auto_generated": bool(row["auto_generated"]),
            "all_sections": bool(row["all_sections"]),
            "multiple_occurrences": bool(row["multiple_occurrences"]),
            "occurrence_count": row["occurrence_count"]
        })

    conn.close()
    return activities


def update_activity(activity_id, activity):
    """Update an existing activity record"""
    conn = connect()
    c = conn.cursor()
    c.execute('''UPDATE activities SET
                 year = ?,
                 section = ?,
                 day = ?,
                 period = ?,
                 type = ?,
                 hours = ?,
                 elective = ?,
                 elective_no = ?,
                 teachers = ?,
                 is_three_period = ?,
                 auto_generated = ?,
                 all_sections = ?,
                 multiple_occurrences = ?,
                 occurrence_count = ?
                 WHERE activity_id = ?''',
              (
                  activity.get('year'),
                  activity.get('section'),
                  activity.get('day'),
                  activity.get('period'),
                  activity.get('type'),
                  activity.get('hours'),
                  activity.get('elective'),
                  activity.get('elective_no'),
                  json.dumps(activity.get('teachers', [])),
                  int(bool(activity.get('is_three_period'))),
                  int(bool(activity.get('auto_generated'))),
                  int(bool(activity.get('all_sections'))),
                  int(bool(activity.get('multiple_occurrences'))),
                  int(activity.get('occurrence_count', 1)),
                  activity_id
              ))
    conn.commit()
    conn.close()


def delete_activity(activity_id):
    """Delete an activity record"""
    conn = connect()
    c = conn.cursor()
    c.execute("DELETE FROM activities WHERE activity_id = ?", (activity_id,))
    conn.commit()
    conn.close()


def save_timetable(timetable_dict):
    """Save generated timetable to database"""
    conn = connect()
    c = conn.cursor()
    c.execute("DELETE FROM timetable_entries")  # Clear old entries
    
    for teacher_id, schedule in timetable_dict.items():
        for day_idx, day in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri"]):
            for period_idx, entry in enumerate(schedule[day]):
                # Only save Class and Lab entries, skip Free and Break
                if entry["type"] in ["Class", "Lab"] and entry.get("subject"):
                    c.execute('''INSERT INTO timetable_entries 
                                 (teacher_id, subject_name, class_name, day, period, entry_type)
                                 VALUES (?, ?, ?, ?, ?, ?)''',
                              (teacher_id, entry['subject'], entry.get('class', 'N/A'), day_idx, period_idx, entry['type']))
    
    conn.commit()
    conn.close()

# Initialize database on import
init_db()
