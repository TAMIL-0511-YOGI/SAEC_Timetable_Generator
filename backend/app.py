from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from database import add_teacher, add_subject, get_all_teachers, clear_all, delete_subject, update_subject, save_timetable, delete_teacher, update_teacher
from scheduler import generate
from export import export_excel, export_pdf
import os

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_FILE = os.path.join(BASE_DIR, "timetable.xlsx")
PDF_FILE = os.path.join(BASE_DIR, "timetable.pdf")

latest_timetable = None

def remove_existing_export_file(path):
    if os.path.exists(path):
        try:
            os.remove(path)
            print(f"Removed old export file: {path}")
        except Exception as e:
            print(f"Unable to remove old export file {path}: {e}")

@app.route("/")
def index():
    """Serve the main index.html"""
    return send_from_directory('../frontend', 'index.html')

@app.route("/<path:filename>")
def static_files(filename):
    """Serve static files (CSS, JS)"""
    return send_from_directory('../frontend', filename)

@app.route("/api/teachers", methods=["GET"])
def get_teachers():
    """Get all teachers with their subjects"""
    try:
        teachers = get_all_teachers()
        return jsonify([t.to_dict() for t in teachers])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/teachers", methods=["POST"])
def create_teacher():
    """Add a new teacher"""
    try:
        data = request.json
        teacher_id = data.get("teacher_id")
        name = data.get("name")
        
        if not teacher_id or not name:
            return jsonify({"error": "teacher_id and name are required"}), 400
        
        add_teacher(teacher_id, name)
        return jsonify({"message": "Teacher added successfully", "teacher_id": teacher_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/subjects", methods=["POST"])
def create_subject():
    """Add a subject to a teacher"""
    try:
        data = request.json
        
        required_fields = ["subject_name", "year", "section", "hours_per_week", "teacher_id"]
        if not all(field in data for field in required_fields):
            return jsonify({"error": f"Missing required fields: {required_fields}"}), 400
        
        add_subject(
            subject_name=data.get("subject_name"),
            year=data.get("year"),
            section=data.get("section"),
            hours_per_week=int(data.get("hours_per_week")),
            teacher_id=data.get("teacher_id"),
            is_lab=int(data.get("is_lab", 0)),
            lab_days=data.get("lab_days", "0")  # Default: Monday only
        )
        
        return jsonify({"message": "Subject added successfully"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/generate", methods=["POST"])
def gen_timetable():
    """Generate timetable for all teachers and classes"""
    global latest_timetable

    try:
        teachers = get_all_teachers()

        if not teachers:
            return jsonify({"error": "No teachers found. Please add teachers and subjects first."}), 400

        request_data = request.json or {}
        activities = request_data.get("activities", [])

        latest_timetable = generate(teachers, activities)

        # Save only teacher schedules to timetable_entries for backward compatibility
        save_timetable(latest_timetable.get('teachers', {}))

        return jsonify({
            "success": True,
            "timetable": latest_timetable,
            "message": "Timetable generated successfully"
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/download/excel", methods=["GET"])
def download_excel():
    """Download timetable as Excel"""
    try:
        if latest_timetable is None:
            return jsonify({"error": "No timetable generated yet"}), 400

        teachers_timetable = latest_timetable.get('teachers', {})
        classes_timetable = latest_timetable.get('classes', {})
        
        print(f"DEBUG: Downloading Excel with {len(teachers_timetable)} teachers and {len(classes_timetable)} classes")
        print(f"DEBUG: Teacher keys = {list(teachers_timetable.keys())}")
        print(f"DEBUG: Class keys = {list(classes_timetable.keys())}")
        
        remove_existing_export_file(EXCEL_FILE)
        export_excel(teachers_timetable, classes_timetable, output_path=EXCEL_FILE)
    
        return send_file(EXCEL_FILE, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/download/pdf", methods=["GET"])
def download_pdf():
    """Download timetable as PDF"""
    try:
        if latest_timetable is None:
            return jsonify({"error": "No timetable generated yet"}), 400

        teachers_timetable = latest_timetable.get('teachers', {})
        classes_timetable = latest_timetable.get('classes', {})
        
        print(f"DEBUG: Downloading PDF with {len(teachers_timetable)} teachers and {len(classes_timetable)} classes")
        print(f"DEBUG: Teacher keys = {list(teachers_timetable.keys())}")
        print(f"DEBUG: Class keys = {list(classes_timetable.keys())}")
        
        remove_existing_export_file(PDF_FILE)
        export_pdf(teachers_timetable, classes_timetable, output_path=PDF_FILE)
        return send_file(PDF_FILE, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/teachers/<string:teacher_id>", methods=["DELETE"])
def remove_teacher(teacher_id):
    """Delete a specific teacher and their subjects"""
    try:
        delete_teacher(teacher_id)
        return jsonify({"message": "Teacher deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/teachers/<string:teacher_id>", methods=["PUT"])
def edit_teacher(teacher_id):
    """Update a teacher name"""
    try:
        data = request.json
        name = data.get("name")
        if not name:
            return jsonify({"error": "Teacher name is required"}), 400

        update_teacher(teacher_id, name)
        return jsonify({"message": "Teacher updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/subjects/<int:subject_id>", methods=["DELETE"])
def remove_subject(subject_id):
    """Delete a specific subject"""
    try:
        delete_subject(subject_id)
        return jsonify({"message": "Subject deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/subjects/<int:subject_id>", methods=["PUT"])
def edit_subject(subject_id):
    """Update a specific subject"""
    try:
        data = request.json
        
        update_subject(
            subject_id=subject_id,
            subject_name=data.get("subject_name"),
            year=int(data.get("year")),
            section=data.get("section"),
            hours_per_week=int(data.get("hours_per_week")),
            is_lab=int(data.get("is_lab", 0))
        )
        
        return jsonify({"message": "Subject updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/clear", methods=["POST"])
def clear_data():
    """Clear all teachers and subjects"""
    try:
        clear_all()
        global latest_timetable
        latest_timetable = None
        return jsonify({"message": "All data cleared successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
