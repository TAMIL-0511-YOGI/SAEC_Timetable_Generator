import pandas as pd
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from database import get_all_teachers

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
PERIODS = 8

def export_excel(teacher_timetable, class_timetable=None):
    """Export timetable to Excel format with separate sheets for each teacher and class"""
    try:
        print(f"DEBUG export_excel: teacher_timetable keys = {list(teacher_timetable.keys())}")
        print(f"DEBUG export_excel: class_timetable type = {type(class_timetable)}, length = {len(class_timetable) if class_timetable else 0}")
        print(f"DEBUG export_excel: class_timetable keys = {list(class_timetable.keys()) if class_timetable else 'None'}")
        
        # Create lookup dictionary for teacher info
        all_teachers = get_all_teachers()
        teacher_lookup = {t.teacher_id: t for t in all_teachers}
        
        with pd.ExcelWriter("timetable.xlsx", engine="openpyxl") as writer:
            # Export Teacher Timetables - iterate through timetable keys only
            for teacher_id in sorted(teacher_timetable.keys()):
                if teacher_id not in teacher_lookup:
                    print(f"Warning: Teacher {teacher_id} not found in database")
                    continue
                
                teacher = teacher_lookup[teacher_id]
                schedule = teacher_timetable[teacher_id]
                
                # Build data structure: rows = days, columns = periods
                data = []
                header = ["Day"] + [f"Period {i+1}" for i in range(PERIODS)]
                data.append(header)
                
                for day in DAYS:
                    row = [day]
                    for period in range(PERIODS):
                        slot = schedule[day][period]
                        
                        if slot["type"] == "Break":
                            row.append("Break")
                        elif slot["type"] == "Free":
                            row.append("")  # Blank instead of "Free"
                        else:
                            # Class or Lab
                            subject = slot.get("subject", "")
                            class_name = slot.get("class", "")
                            entry_type = slot.get("type", "Class")
                            if entry_type == "Lab":
                                row.append(f"{subject}\n({class_name})\n[LAB]")
                            else:
                                row.append(f"{subject}\n({class_name})")
                    
                    data.append(row)
                
                # Create DataFrame and write to Excel
                df = pd.DataFrame(data[1:], columns=data[0])
                sheet_name = f"T-{teacher.name[:15]}"
                print(f"Exporting teacher {teacher.name} ({teacher_id}) to sheet {sheet_name}")
                df.to_excel(writer, sheet_name=sheet_name, index=False)
            
            # Export Student/Class Timetables
            if class_timetable is not None and len(class_timetable) > 0:
                print(f"Exporting {len(class_timetable)} classes")
                for class_name in sorted(class_timetable.keys()):
                    schedule = class_timetable[class_name]
                    
                    # Build data structure: rows = days, columns = periods
                    data = []
                    header = ["Day"] + [f"Period {i+1}" for i in range(PERIODS)]
                    data.append(header)
                    
                    for day in DAYS:
                        row = [day]
                        for period in range(PERIODS):
                            slot = schedule[day][period]
                            
                            if slot["type"] == "Break":
                                row.append("Break")
                            elif slot["type"] == "Free":
                                row.append("")  # Blank instead of "Free"
                            else:
                                # Class or Lab
                                subject = slot.get("subject", "")
                                entry_type = slot.get("type", "Class")
                                if entry_type == "Lab":
                                    row.append(f"{subject}\n[LAB]")
                                elif entry_type == "Activity":
                                    row.append(f"{subject}\n[Activity]")
                                else:
                                    row.append(subject)
                        
                        data.append(row)
                    
                    # Create DataFrame and write to Excel
                    df = pd.DataFrame(data[1:], columns=data[0])
                    df.to_excel(writer, sheet_name=f"C-{class_name}", index=False)
        
        print("Excel file exported successfully as timetable.xlsx")
    except Exception as e:
        print(f"Error exporting Excel: {str(e)}")
        raise

def export_pdf(teacher_timetable, class_timetable=None):
    """Export timetable to PDF format with table per teacher and per class"""
    try:
        print(f"DEBUG export_pdf: teacher_timetable keys = {list(teacher_timetable.keys())}")
        print(f"DEBUG export_pdf: class_timetable type = {type(class_timetable)}, length = {len(class_timetable) if class_timetable else 0}")
        print(f"DEBUG export_pdf: class_timetable keys = {list(class_timetable.keys()) if class_timetable else 'None'}")
        
        # Create lookup dictionary for teacher info
        all_teachers = get_all_teachers()
        teacher_lookup = {t.teacher_id: t for t in all_teachers}
        
        doc = SimpleDocTemplate("timetable.pdf")
        story = []
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1f4788'),
            spaceAfter=30,
            alignment=1  # Center
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
        
        # Iterate through teacher_timetable keys only (all generated teachers)
        for teacher_id in sorted(teacher_timetable.keys()):
            if teacher_id not in teacher_lookup:
                print(f"Warning: Teacher {teacher_id} not found in database")
                continue
            
            teacher = teacher_lookup[teacher_id]
            
            # Teacher info
            teacher_info = f"<b>Teacher:</b> {teacher.name} | <b>Subjects:</b> {', '.join(s.name for s in teacher.subjects)}"
            print(f"Exporting teacher {teacher.name} ({teacher_id}) to PDF")
            story.append(Paragraph(teacher_info, teacher_style))
            
            schedule = teacher_timetable[teacher_id]
            
            # Build table data: rows = days, columns = periods
            table_data = []
            header = ["Day"] + [f"P{i+1}" for i in range(PERIODS)]
            table_data.append(header)
            
            for day in DAYS:
                row = [day]
                for period in range(PERIODS):
                    slot = schedule[day][period]
                    
                    if slot["type"] == "Break":
                        row.append("Break")
                    elif slot["type"] == "Free":
                        row.append("")  # Blank instead of "Free"
                    else:
                        subject = slot.get("subject", "")
                        class_name = slot.get("class", "")
                        entry_type = slot.get("type", "Class")
                        if entry_type == "Lab":
                            row.append(f"{subject}\n({class_name})\n[LAB]")
                        else:
                            row.append(f"{subject}\n({class_name})")
                
                table_data.append(row)
            
            # Create and style table
            table = Table(table_data, colWidths=[0.8*inch] + [0.7*inch]*PERIODS)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#e6f0ff')),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f5ff')]),
            ]))
            
            story.append(table)
            story.append(Spacer(1, 0.5 * inch))
            story.append(PageBreak())
        
        # STUDENT/CLASS TIMETABLES SECTION
        if class_timetable is not None and len(class_timetable) > 0:
            print(f"Exporting {len(class_timetable)} classes to PDF")
            story.append(Paragraph("STUDENT/CLASS TIMETABLES", section_style))
            
            for class_name in sorted(class_timetable.keys()):
                schedule = class_timetable[class_name]
                print(f"Exporting class {class_name} to PDF")
                
                # Class info
                class_info = f"<b>Class:</b> {class_name}"
                story.append(Paragraph(class_info, class_style))
                
                # Build table data: rows = days, columns = periods
                table_data = []
                header = ["Day"] + [f"P{i+1}" for i in range(PERIODS)]
                table_data.append(header)
                
                for day in DAYS:
                    row = [day]
                    for period in range(PERIODS):
                        slot = schedule[day][period]
                        
                        if slot["type"] == "Break":
                            row.append("Break")
                        elif slot["type"] == "Free":
                            row.append("")  # Blank instead of "Free"
                        else:
                            subject = slot.get("subject", "")
                            entry_type = slot.get("type", "Class")
                            if entry_type == "Lab":
                                row.append(f"{subject}\n[LAB]")
                            elif entry_type == "Activity":
                                row.append(f"{subject}\n[Activity]")
                            else:
                                row.append(subject)
                    
                    table_data.append(row)
                
                # Create and style table
                table = Table(table_data, colWidths=[0.8*inch] + [0.7*inch]*PERIODS)
                table.setStyle(TableStyle([
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
                ]))
                
                story.append(table)
                story.append(Spacer(1, 0.4 * inch))
        
        doc.build(story)
        print("PDF file exported successfully as timetable.pdf")
    except Exception as e:
        print(f"Error exporting PDF: {str(e)}")
        raise
