import os
import pandas as pd
from openpyxl.styles import Border, Side, Font, Alignment, PatternFill
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from database import get_all_teachers

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
PERIODS = 8

SHORT_ACTIVITY_LABELS = {
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
}

def get_short_activity_name(name):
    if not name or not isinstance(name, str):
        return name
    return SHORT_ACTIVITY_LABELS.get(name.strip().lower(), name)


def export_excel(teacher_timetable, class_timetable=None, output_path="timetable.xlsx"):
    """Export timetable to Excel format with separate sheets for each teacher and class"""
    try:
        output_path = os.path.abspath(output_path)
        if os.path.exists(output_path):
            os.remove(output_path)
            print(f"Removed existing Excel output file: {output_path}")
        print(f"\n=== EXCEL EXPORT START ===")
        print(f"Teachers to export: {list(teacher_timetable.keys())}")
        print(f"Total teachers: {len(teacher_timetable)}")
        print(f"Classes to export: {list(class_timetable.keys()) if class_timetable else 'None'}")
        print(f"Total classes: {len(class_timetable) if class_timetable else 0}")
        
        # Get all teachers for name lookup
        all_teachers_list = get_all_teachers()
        teacher_lookup = {t.teacher_id: t for t in all_teachers_list}
        print(f"Teachers in database: {list(teacher_lookup.keys())}")
        
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            # Export All Teacher Timetables in One Sheet
            exported_teachers = 0
            combined_data = []
            
            for teacher_id in sorted(teacher_timetable.keys()):
                teacher_info = teacher_lookup.get(teacher_id)
                teacher_name = teacher_info.name if teacher_info else f"Teacher_{teacher_id}"
                
                try:
                    schedule = teacher_timetable[teacher_id]
                    
                    # Add teacher name as a separator row
                    combined_data.append([f"TEACHER: {teacher_name.upper()}"] + [""] * PERIODS)
                    
                    # Build header
                    header = ["Day"] + [f"P{i+1}" for i in range(PERIODS)]
                    combined_data.append(header)
                    
                    for day in DAYS:
                        row = [day]
                        for period in range(PERIODS):
                            slot = schedule[day][period]
                            
                            if slot["type"] == "Break":
                                row.append("Break")
                            elif slot["type"] == "Free":
                                row.append("")
                            elif slot["type"] == "R&D":
                                row.append("R&D")
                            else:
                                subject = get_short_activity_name(slot.get("subject", ""))
                                class_name = slot.get("class", "")
                                entry_type = slot.get("type", "Class")
                                if entry_type == "Lab":
                                    row.append(f"{subject} ({class_name}) [LAB]")
                                else:
                                    row.append(f"{subject} ({class_name})")
                        
                        combined_data.append(row)
                    
                    # Add blank row separator between teachers
                    combined_data.append([""] * (PERIODS + 1))
                    
                    print(f"Added teacher {teacher_id}: {teacher_name}")
                    exported_teachers += 1
                    
                except Exception as e:
                    print(f"Error exporting teacher {teacher_id} ({teacher_name}): {str(e)}")
                    raise
            
            # Write all teachers to a single sheet
            if combined_data:
                df = pd.DataFrame(combined_data)
                df.to_excel(writer, sheet_name="Teachers Timetable", index=False, header=False)
                
                # Apply styling using openpyxl
                ws = writer.sheets["Teachers Timetable"]
                thin_border = Border(
                    left=Side(style='thin', color='000000'),
                    right=Side(style='thin', color='000000'),
                    top=Side(style='thin', color='000000'),
                    bottom=Side(style='thin', color='000000')
                )
                
                row_num = 1
                teacher_count = 0
                
                for idx, row in enumerate(combined_data):
                    current_row = row_num
                    
                    # Teacher name row
                    if row[0].startswith("TEACHER:"):
                        teacher_count += 1
                        for col_num, value in enumerate(row, 1):
                            cell = ws.cell(row=current_row, column=col_num)
                            cell.value = value
                            cell.border = thin_border
                            cell.font = Font(bold=True, size=13, color="000000")
                            cell.alignment = Alignment(horizontal='center', vertical='center')
                            ws.column_dimensions[cell.column_letter].width = 14
                        row_num += 1
                    
                    # Header row (Day, P1, P2, ...)
                    elif row[0] == "Day":
                        for col_num, value in enumerate(row, 1):
                            cell = ws.cell(row=current_row, column=col_num)
                            cell.value = value
                            cell.border = thin_border
                            cell.font = Font(bold=True, size=11, color="FFFFFF")
                            cell.fill = PatternFill(start_color="003366", end_color="003366", fill_type="solid")
                            cell.alignment = Alignment(horizontal='center', vertical='center')
                            if col_num == 1:
                                ws.column_dimensions[cell.column_letter].width = 12
                            else:
                                ws.column_dimensions[cell.column_letter].width = 14
                        row_num += 1
                    
                    # Day data rows
                    elif row[0] in DAYS:
                        for col_num, value in enumerate(row, 1):
                            cell = ws.cell(row=current_row, column=col_num)
                            cell.value = value
                            cell.border = thin_border
                            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
                            if col_num == 1:
                                cell.font = Font(bold=True, size=10)
                                ws.column_dimensions[cell.column_letter].width = 12
                            else:
                                ws.column_dimensions[cell.column_letter].width = 14
                                if value == 'R&D':
                                    cell.fill = PatternFill(start_color='FFE6CC', end_color='FFE6CC', fill_type='solid')
                        ws.row_dimensions[current_row].height = 30
                        row_num += 1
                    
                    # Blank separator rows
                    else:
                        row_num += 1
                
                print(f"All {exported_teachers} teachers exported to 'Teachers Timetable' sheet with formatting")
            
            # Export Student/Class Timetables - All in One Sheet
            if class_timetable and len(class_timetable) > 0:
                exported_classes = 0
                combined_class_data = []
                
                for class_name in sorted(class_timetable.keys()):
                    try:
                        schedule = class_timetable[class_name]
                        
                        # Add class name as a separator row
                        combined_class_data.append([f"CLASS: {class_name.upper()}"] + [""] * PERIODS)
                        
                        # Build header
                        header = ["Day"] + [f"P{i+1}" for i in range(PERIODS)]
                        combined_class_data.append(header)
                        
                        for day in DAYS:
                            row = [day]
                            for period in range(PERIODS):
                                slot = schedule[day][period]
                                
                                if slot["type"] == "Break":
                                    row.append("Break")
                                elif slot["type"] == "Free":
                                    row.append("")
                                else:
                                    subject = get_short_activity_name(slot.get("subject", ""))
                                    entry_type = slot.get("type", "Class")
                                    if entry_type == "Lab":
                                        row.append(f"{subject} [LAB]")
                                    elif entry_type == "Activity":
                                        row.append(f"{subject} [Activity]")
                                    else:
                                        row.append(subject)
                            
                            combined_class_data.append(row)
                        
                        # Add blank row separator between classes
                        combined_class_data.append([""] * (PERIODS + 1))
                        
                        print(f"Added class {class_name}")
                        exported_classes += 1
                        
                    except Exception as e:
                        print(f"Error exporting class {class_name}: {str(e)}")
                        raise
                
                # Write all classes to a single sheet with formatting
                if combined_class_data:
                    df = pd.DataFrame(combined_class_data)
                    df.to_excel(writer, sheet_name="Students Timetable", index=False, header=False)
                    
                    # Apply styling using openpyxl
                    ws_class = writer.sheets["Students Timetable"]
                    thin_border = Border(
                        left=Side(style='thin', color='000000'),
                        right=Side(style='thin', color='000000'),
                        top=Side(style='thin', color='000000'),
                        bottom=Side(style='thin', color='000000')
                    )
                    
                    row_num = 1
                    
                    for idx, row in enumerate(combined_class_data):
                        current_row = row_num
                        
                        # Class name row
                        if row[0].startswith("CLASS:"):
                            for col_num, value in enumerate(row, 1):
                                cell = ws_class.cell(row=current_row, column=col_num)
                                cell.value = value
                                cell.border = thin_border
                                cell.font = Font(bold=True, size=13, color="000000")
                                cell.alignment = Alignment(horizontal='center', vertical='center')
                                ws_class.column_dimensions[cell.column_letter].width = 14
                            row_num += 1
                        
                        # Header row (Day, P1, P2, ...)
                        elif row[0] == "Day":
                            for col_num, value in enumerate(row, 1):
                                cell = ws_class.cell(row=current_row, column=col_num)
                                cell.value = value
                                cell.border = thin_border
                                cell.font = Font(bold=True, size=11, color="FFFFFF")
                                cell.fill = PatternFill(start_color="003366", end_color="003366", fill_type="solid")
                                cell.alignment = Alignment(horizontal='center', vertical='center')
                                if col_num == 1:
                                    ws_class.column_dimensions[cell.column_letter].width = 12
                                else:
                                    ws_class.column_dimensions[cell.column_letter].width = 14
                            row_num += 1
                        
                        # Day data rows
                        elif row[0] in DAYS:
                            for col_num, value in enumerate(row, 1):
                                cell = ws_class.cell(row=current_row, column=col_num)
                                cell.value = value
                                cell.border = thin_border
                                cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
                                if col_num == 1:
                                    cell.font = Font(bold=True, size=10)
                                    ws_class.column_dimensions[cell.column_letter].width = 12
                                else:
                                    ws_class.column_dimensions[cell.column_letter].width = 14
                                    if value == 'R&D':
                                        cell.fill = PatternFill(start_color='FFE6CC', end_color='FFE6CC', fill_type='solid')
                            ws_class.row_dimensions[current_row].height = 30
                            row_num += 1
                        
                        # Blank separator rows
                        else:
                            row_num += 1
                    
                    print(f"All {exported_classes} classes exported to 'Students Timetable' sheet with formatting")
        
        print(f"Total teachers exported: {exported_teachers}")
        print(f"Excel file saved: {output_path}")
        print(f"=== EXCEL EXPORT COMPLETE ===\n")
        
    except Exception as e:
        print(f"FATAL ERROR in export_excel: {str(e)}")
        raise


def export_pdf(teacher_timetable, class_timetable=None, output_path="timetable.pdf"):
    """Export timetable to PDF format with table per teacher and per class"""
    try:
        output_path = os.path.abspath(output_path)
        if os.path.exists(output_path):
            os.remove(output_path)
            print(f"Removed existing PDF output file: {output_path}")
        print(f"\n=== PDF EXPORT START ===")
        print(f"Teachers to export: {list(teacher_timetable.keys())}")
        print(f"Total teachers: {len(teacher_timetable)}")
        print(f"Classes to export: {list(class_timetable.keys()) if class_timetable else 'None'}")
        print(f"Total classes: {len(class_timetable) if class_timetable else 0}")
        
        # Get all teachers for name lookup
        all_teachers_list = get_all_teachers()
        teacher_lookup = {t.teacher_id: t for t in all_teachers_list}
        
        doc = SimpleDocTemplate(output_path)
        story = []
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1f4788'),
            spaceAfter=30,
            alignment=1
        )
        
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=18,
            textColor=colors.HexColor('#1f4788'),
            spaceAfter=12,
            spaceBefore=12
        )
        
        teacher_style = ParagraphStyle(
            'TeacherName',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#003366'),
            spaceAfter=12,
            spaceBefore=12
        )
        
        class_style = ParagraphStyle(
            'ClassName',
            parent=styles['Heading2'],
            fontSize=13,
            textColor=colors.HexColor('#1f4788'),
            spaceAfter=10,
            spaceBefore=10
        )
        
        # Title
        story.append(Paragraph("Faculty AI Timetable Management System", title_style))
        story.append(Spacer(1, 0.3 * inch))
        
        # TEACHER TIMETABLES SECTION
        story.append(Paragraph("TEACHER TIMETABLES", section_style))
        
        exported_teachers = 0
        teacher_ids = sorted(teacher_timetable.keys())
        
        for idx, teacher_id in enumerate(teacher_ids):
            teacher_info = teacher_lookup.get(teacher_id)
            if not teacher_info:
                print(f"Warning: Teacher {teacher_id} not found in database - skipping")
                continue
            
            teacher = teacher_info
            
            try:
                schedule = teacher_timetable[teacher_id]
                
                # Teacher name - bold and prominent
                teacher_name_text = f"<b><font size=12>{teacher.name}</font></b>"
                story.append(Paragraph(teacher_name_text, teacher_style))
                
                # Build table data
                table_data = []
                header = ["Day"] + [f"P{i+1}" for i in range(PERIODS)]
                table_data.append(header)
                
                r_and_d_rows = []
                for day in DAYS:
                    row = [day]
                    for period in range(PERIODS):
                        slot = schedule[day][period]
                        
                        if slot["type"] == "Break":
                            row.append("Break")
                        elif slot["type"] == "Free":
                            row.append("")
                        elif slot["type"] == "R&D":
                            row.append("R&D")
                        else:
                                subject = get_short_activity_name(slot.get("subject", ""))
                    table_data.append(row)
                    if "R&D" in row[1:]:
                        r_and_d_rows.append(len(table_data) - 1)
                
                # Create and style table with equal column widths
                col_widths = [0.9*inch] + [0.75*inch]*PERIODS
                table = Table(table_data, colWidths=col_widths)
                table_style = TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('TOPPADDING', (0, 0), (-1, 0), 8),
                    ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#e6f0ff')),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f5ff')]),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 1), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
                ])
                for row_idx in r_and_d_rows:
                    table_style.add('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#FFE6CC'))
                table.setStyle(table_style)
                
                story.append(table)

                # Add spacing when there is more content to follow
                if idx != len(teacher_ids) - 1 or (class_timetable and len(class_timetable) > 0):
                    story.append(Spacer(1, 0.4 * inch))

                # Add page break after every 2 teachers when there are more teachers remaining
                if (idx + 1) % 2 == 0 and idx != len(teacher_ids) - 1:
                    story.append(PageBreak())
                    story.append(Paragraph("TEACHER TIMETABLES", section_style))

                print(f"Exported teacher {teacher_id}: {teacher.name}")
                exported_teachers += 1

            except Exception as e:
                print(f"Error exporting teacher {teacher_id}: {str(e)}")
                raise
        
        # STUDENT/CLASS TIMETABLES SECTION
        if class_timetable and len(class_timetable) > 0:
            story.append(Paragraph("STUDENT/CLASS TIMETABLES", section_style))
            
            exported_classes = 0
            class_names = sorted(class_timetable.keys())
            for idx, class_name in enumerate(class_names):
                try:
                    schedule = class_timetable[class_name]
                    
                    # Class info
                    class_info = f"<b>Class:</b> {class_name}"
                    story.append(Paragraph(class_info, class_style))
                    
                    # Build table data
                    table_data = []
                    header = ["Day"] + [f"P{i+1}" for i in range(PERIODS)]
                    table_data.append(header)
                    r_and_d_rows = []

                    for day in DAYS:
                        row = [day]
                        for period in range(PERIODS):
                            slot = schedule[day][period]

                            if slot["type"] == "Break":
                                row.append("Break")
                            elif slot["type"] == "Free":
                                row.append("")
                            elif slot["type"] == "R&D":
                                row.append("R&D")
                            else:
                                subject = get_short_activity_name(slot.get("subject", ""))
                                entry_type = slot.get("type", "Class")
                                if entry_type == "Lab":
                                    row.append(f"{subject}\n[LAB]")
                                elif entry_type == "Activity":
                                    row.append(f"{subject}\n[Activity]")
                                else:
                                    row.append(subject)

                        table_data.append(row)
                        if "R&D" in row[1:]:
                            r_and_d_rows.append(len(table_data) - 1)

                    # Create and style table
                    table = Table(table_data, colWidths=[0.8*inch] + [0.7*inch]*PERIODS)
                    table_style = TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f4788')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, 0), 10),
                        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                        ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f0f0f0')),
                        ('GRID', (0, 0), (-1, -1), 1, colors.black),
                        ('FONTSIZE', (0, 1), (-1, -1), 8),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
                    ])
                    for row_idx in r_and_d_rows:
                        table_style.add('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#FFE6CC'))
                    table.setStyle(table_style)
                    
                    story.append(table)

                    # Add spacing when there are more class schedules following
                    if idx != len(class_names) - 1:
                        story.append(Spacer(1, 0.4 * inch))

                    # Force two classes per PDF page when more classes remain
                    if (idx + 1) % 2 == 0 and idx != len(class_names) - 1:
                        story.append(PageBreak())
                        story.append(Paragraph("STUDENT/CLASS TIMETABLES", section_style))

                    print(f"Exported class {class_name}")
                    exported_classes += 1

                except Exception as e:
                    print(f"Error exporting class {class_name}: {str(e)}")
                    raise
            
            print(f"\nTotal classes exported: {exported_classes}")
        
        doc.build(story)
        print(f"Total teachers exported: {exported_teachers}")
        print(f"PDF file saved: {output_path}")
        print(f"=== PDF EXPORT COMPLETE ===\n")
        
    except Exception as e:
        print(f"FATAL ERROR in export_pdf: {str(e)}")
        raise
