from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


OUTPUT = "work/nfe-amostra-ficticia.pdf"


def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("DOCUMENTO FISCAL FICTICIO - SOMENTE TESTE", styles["Title"]),
        Spacer(1, 6 * mm),
        Paragraph("Nota fiscal: 987654 | Serie: 1 | Emissao: 12/07/2026", styles["Normal"]),
        Paragraph("Fornecedor: FORNECEDOR TESTE LTDA", styles["Normal"]),
        Paragraph("CNPJ: 11.222.333/0001-44", styles["Normal"]),
        Spacer(1, 6 * mm),
    ]

    rows = [
        ["Codigo", "Descricao", "Qtd.", "Un.", "Valor unit.", "Valor total"],
        ["LUV-001", "Luva nitrilica para procedimento", "10", "CX", "25,00", "250,00"],
        ["SER-005", "Seringa descartavel 5 ml", "4", "CX", "30,00", "120,00"],
    ]
    table = Table(rows, colWidths=[25 * mm, 63 * mm, 15 * mm, 15 * mm, 27 * mm, 27 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7e2635")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#aeb5ba")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f5f6")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([
        table,
        Spacer(1, 6 * mm),
        Paragraph("Valor total da nota: R$ 370,00", styles["Heading2"]),
        Paragraph("Este documento nao possui validade fiscal.", styles["Normal"]),
    ])
    doc.build(story)


if __name__ == "__main__":
    build_pdf()
