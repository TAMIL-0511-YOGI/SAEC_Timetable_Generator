import os
import pandas as pd
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from database import get_all_teachers

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
PERIODS = 8

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
            # Export Teacher Timetables
            exported_teachers = 0
            for teacher_id in sorted(teacher_timetable.keys()):
                teacher_info = teacher_lookup.get(teacher_id)
                teacher_name = teacher_info.name if teacher_info else f"Teacher_{teacher_id}"
                
                try:
                    schedule = teacher_timetable[teacher_id]
                    
                    # Build data for this teacher
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
                                row.append("")
                            else:
                                subject = slot.get("subject", "")
                                class_name = slot.get("class", "")
                                entry_type = slot.get("type", "Class")
                                if entry_type == "Lab":
                                    row.append(f"{subject}\n({class_name})\n[LAB]")
                                else:
                                    row.append(f"{subject}\n({class_name})")
                        
                        data.append(row)
                    
                    # Create sheet name (ensure uniqueness)
                    sheet_name = f"T-{teacher_name[:12]}"
                    
                    # Write to Excel
                    df = pd.DataFrame(data[1:], columns=data[0])
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
                    
                    print(f"Exported teacher {teacher_id}: {teacher_name} to sheet '{sheet_name}'")
                    exported_teachers += 1
                    
                except Exception as e:
                    print(f"Error exporting teacher {teacher_id} ({teacher_name}): {str(e)}")
                    raise
            
            # Export Student/Class Timetables
            if class_timetable and len(class_timetable) > 0:
                exported_classes = 0
                for class_name in sorted(class_timetable.keys()):
                    try:
                        schedule = class_timetable[class_name]
                        
                        # Build data for this class
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
                                    row.append("")
                                else:
                                    subject = slot.get("subject", "")
                                    entry_type = slot.get("type", "Class")
                                    if entry_type == "Lab":
                                        row.append(f"{subject}\n[LAB]")
                                    elif entry_type == "Activity":
                                        row.append(f"{subject}\n[Activity]")
                                    else:
                                        row.append(subject)
                            
                            data.append(row)
                        
                        # Create sheet name
                        sheet_name = f"C-{class_name}"
                        
                        # Write to Excel
                        df = pd.DataFrame(data[1:], columns=data[0])
                        df.to_excel(writer, sheet_name=sheet_name, index=False)
                        
                        print(f"Exported class {class_name} to sheet 'C-{class_name}'")
                        exported_classes += 1
                        
                    except Exception as e:
                        print(f"Error exporting class {class_name}: {str(e)}")
                        raise
                
                print(f"\nTotal classes exported: {exported_classes}")
        
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
        for teacher_id in sorted(teacher_timetable.keys()):
            teacher_info = teacher_lookup.get(teacher_id)
            if not teacher_info:
                print(f"Warning: Teacher {teacher_id} not found in database - skipping")
                continue
            
            teacher = teacher_info
            
            try:
                schedule = teacher_timetable[teacher_id]
                
                # Teacher info
                teacher_info_text = f"<b>Teacher:</b> {teacher.name} | <b>Subjects:</b> {', '.join(s.name for s in teacher.subjects)}"
                story.append(Paragraph(teacher_info_text, teacher_style))
                
                # Build table data
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
                            row.append("")
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
                
                print(f"Exported teacher {teacher_id}: {teacher.name}")
                exported_teachers += 1
                
            except Exception as e:
                print(f"Error exporting teacher {teacher_id}: {str(e)}")
                raise
        
        # STUDENT/CLASS TIMETABLES SECTION
        if class_timetable and len(class_timetable) > 0:
            story.append(Paragraph("STUDENT/CLASS TIMETABLES", section_style))
            
            exported_classes = 0
            for class_name in sorted(class_timetable.keys()):
                try:
                    schedule = class_timetable[class_name]
                    
                    # Class info
                    class_info = f"<b>Class:</b> {class_name}"
                    story.append(Paragraph(class_info, class_style))
                    
                    # Build table data
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
                                row.append("")
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
