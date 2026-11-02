from svgkit import lbl, lead, dimh, dimv, rect, svg

ACERO = "#7b8794"
PLACA = "#f3efe6"


def demolicion():
    b = rect(60, 60, 170, 200, "url(#p-mamp)", "#9b6e57")
    # muro parcialmente demolido (perfil escalonado)
    b += rect(230, 150, 60, 110, "url(#p-mamp)", "#9b6e57")
    b += '<path d="M230 60 L230 150 L290 150 L290 260" fill="none" stroke="#5a4033" stroke-width="1.5" stroke-dasharray="6 4"/>'
    b += rect(40, 260, 480, 6, "#999", "#777")
    # escombros
    for (x, y) in [(320, 248), (340, 252), (360, 246), (335, 240), (352, 236), (375, 252), (390, 250), (368, 240)]:
        b += f'<path d="M{x} {y} l12 -3 l4 9 l-13 3z" fill="#c98f74" stroke="#8d5d48" stroke-width=".8"/>'
    # volquete
    b += '<path d="M420 200 L520 200 L508 256 L432 256 Z" fill="#e8b84a" stroke="#9c7a24"/>'
    b += '<path d="M380 225 Q400 205 420 212" fill="none" stroke="#555" stroke-width="1.2" marker-end="url(#arr)"/>'
    b += lead(150, 120, 150, 40) + lbl(150, 34, "Mampostería existente", "middle")
    b += lead(262, 150, 300, 70) + lbl(300, 64, "Línea de corte", "middle")
    b += lead(355, 240, 330, 285) + lbl(330, 296, "Escombro (esponjamiento ≈ 30 %)", "middle")
    b += lbl(470, 190, "Volquete / contenedor", "middle")
    b = '<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#555"/></marker></defs>' + b
    return svg(b, "Demolición de mampostería")


def excavacion():
    b = rect(30, 90, 500, 190, "url(#p-tierra)", "none", 0)
    b += rect(230, 90, 100, 150, "#fafafa", "#8a7a5c")
    b += '<path d="M30 90 H230 M330 90 H530" stroke="#6b5a3c" stroke-width="2"/>'
    # montículo
    b += '<path d="M60 90 Q120 40 180 90 Z" fill="url(#p-tierra)" stroke="#8a7a5c"/>'
    b += dimh(230, 330, 262, "ancho 0,40–0,60 m", above=False)
    b += dimv(350, 90, 240, "prof. según estudio de suelos")
    b += lead(120, 66, 120, 30) + lbl(120, 24, "Suelo extraído: +25 % por esponjamiento", "middle")
    b += lead(440, 160, 470, 60) + lbl(470, 54, "Terreno natural", "middle")
    b += lead(280, 235, 280, 205) + lbl(280, 200, "Fondo limpio y nivelado", "middle")
    return svg(b, "Excavación de zanja para cimientos")


def zapata():
    b = rect(30, 70, 500, 210, "url(#p-tierra)", "none", 0)
    b += rect(190, 216, 180, 10, "url(#p-horm)", "#8f969c")  # limpieza
    b += rect(190, 156, 180, 60, "url(#p-horm)", "#6f767c", 1.4)  # zapata
    b += rect(240, 70, 80, 86, "url(#p-mamp)", "#9b6e57")  # muro arranque
    b += f'<rect x="200" y="164" width="160" height="44" fill="none" stroke="{ACERO}" stroke-width="1.6"/>'
    for x in (210, 250, 310, 350):
        b += f'<circle cx="{x}" cy="200" r="4" fill="#3d454d"/>'
    for x in (210, 350):
        b += f'<circle cx="{x}" cy="172" r="3.2" fill="#3d454d"/>'
    b += dimh(190, 370, 250, "ancho según cálculo (≥ 0,40 m)", above=False)
    b += dimv(390, 156, 216, "h ≥ 0,30 m")
    b += lead(355, 200, 450, 120) + lbl(452, 116, "Armadura ADN 420")
    b += lead(320, 168, 452, 150) + lbl(452, 146, "Estribos")
    b += lead(220, 221, 120, 262) + lbl(40, 274, "Hormigón de limpieza 5 cm")
    b += lead(200, 180, 110, 190) + lbl(108, 194, "Hormigón H-21", "end")
    b += lead(280, 90, 280, 40) + lbl(280, 34, "Muro de arranque", "middle")
    return svg(b, "Zapata corrida de hormigón armado")


def losa():
    b = ""
    # bloques y viguetas cada 120px (0,50 m aprox.)
    for i, x in enumerate(range(40, 520, 120)):
        # bloque cerámico
        bx = x + 14
        b += rect(bx, 150, 92, 50, "#d8a58a", "#9b6e57")
        for k in range(3):
            b += rect(bx + 8 + k * 28, 158, 20, 34, "#f4e2d6", "#c08a70", .6)
    for x in range(40, 540, 120):
        b += f'<path d="M{x-6} 200 L{x+20} 200 L{x+16} 186 L{x+10} 186 L{x+10} 150 L{x+4} 150 L{x+4} 186 L{x-2} 186 Z" fill="#b9bec3" stroke="#6f767c"/>'
        b += f'<circle cx="{x+7}" cy="194" r="2" fill="#3d454d"/>'
    b += rect(30, 125, 500, 25, "url(#p-horm)", "#6f767c")
    b += f'<path d="M30 136 H530" stroke="{ACERO}" stroke-width="1.4" stroke-dasharray="8 4"/>'
    b += dimh(47, 167, 230, "≈ 0,50 m", above=False)
    b += dimv(540, 125, 200, "17 cm")
    b += lead(300, 130, 300, 70) + lbl(300, 64, "Capa de compresión 5 cm + malla", "middle")
    b += lead(410, 175, 460, 100) + lbl(460, 94, "Bloque cerámico", "middle")
    b += lead(167, 195, 150, 280) + lbl(150, 292, "Vigueta pretensada", "middle")
    return svg(b, "Losa de viguetas pretensadas")


def capa_aisladora():
    b = rect(30, 210, 500, 70, "url(#p-tierra)", "none", 0)
    b += rect(200, 210, 160, 70, "url(#p-horm)", "#6f767c")  # cimiento
    b += rect(220, 40, 120, 170, "url(#p-mamp)", "#9b6e57")
    # capas horizontales
    b += rect(220, 150, 120, 8, "#4b5563", "#333")
    b += rect(220, 186, 120, 8, "#4b5563", "#333")
    # verticales (cajón)
    b += rect(212, 150, 8, 44, "#4b5563", "#333")
    b += rect(340, 150, 8, 44, "#4b5563", "#333")
    b += '<path d="M30 170 H212 M348 170 H372" stroke="#444" stroke-dasharray="6 4"/>'
    b += lbl(40, 164, "Nivel de piso interior")
    b += lead(340, 154, 430, 110) + lbl(432, 106, "Capa horizontal superior")
    b += lead(340, 190, 430, 230) + lbl(432, 234, "Capa horizontal inferior")
    b += lead(212, 172, 120, 122) + lbl(40, 116, "Cajón: verticales en ambas caras")
    b += dimv(380, 150, 194, "≈ 15–20 cm")
    b += lbl(280, 30, "Muro", "middle")
    return svg(b, "Capa aisladora horizontal doble con cajón")


def ladrillo_comun():
    b = ""
    for r, y in enumerate(range(50, 230, 18)):
        off = 0 if r % 2 == 0 else -38
        for x in range(60 + off, 420, 76):
            xx = max(x, 60)
            w = min(x + 72, 416) - xx
            if w > 4:
                b += rect(xx, y, w, 14, "#d8a58a", "#9b6e57", .8)
    b += rect(56, 46, 364, 186, "none", "#7a5646", 1.2)
    # corte del muro
    b += rect(470, 46, 50, 186, "url(#p-mamp)", "#9b6e57")
    b += dimh(470, 520, 254, "0,15 m", above=False)
    b += dimh(98, 170, 34, "0,25 m")
    b += lead(240, 120, 300, 270) + lbl(300, 284, "Ladrillo común 5 × 12 × 25 cm", "middle")
    b += lead(130, 155, 130, 270) + lbl(130, 284, "Junta 1–1,5 cm", "middle")
    b += lbl(495, 36, "Corte", "middle")
    return svg(b, "Muro de ladrillo común 0,15")


def ladrillo_hueco():
    b = ""
    for r, y in enumerate(range(50, 230, 40)):
        off = 0 if r % 2 == 0 else -50
        for x in range(60 + off, 420, 102):
            xx = max(x, 60)
            w = min(x + 98, 416) - xx
            if w > 6:
                b += rect(xx, y, w, 36, "#dca88b", "#9b6e57", .8)
                for k in range(3):
                    yy = y + 6 + k * 9
                    b += f'<line x1="{xx+6}" y1="{yy+3}" x2="{xx+w-6}" y2="{yy+3}" stroke="#b47c62" stroke-width="2.5" stroke-linecap="round"/>'
    b += rect(56, 46, 364, 186, "none", "#7a5646", 1.2)
    b += rect(470, 46, 40, 186, "#dca88b", "#9b6e57")
    for y in range(52, 228, 12):
        b += rect(476, y, 28, 7, "#f4e2d6", "#c08a70", .5)
    b += dimh(470, 510, 254, "0,12 m", above=False)
    b += dimh(60, 158, 34, "0,33 m")
    b += lead(240, 120, 280, 270) + lbl(280, 284, "Ladrillo cerámico hueco 12 × 18 × 33 cm", "middle")
    b += lbl(490, 36, "Corte", "middle")
    return svg(b, "Muro de ladrillo cerámico hueco")


def capas(layers, title, side_label_left="", side_label_right=""):
    """Corte de capas verticales (muro a la izquierda)."""
    b = ""
    x = 60
    for (w, fill, stroke, name, ly) in layers:
        b += rect(x, 40, w, 210, fill, stroke)
        cx = x + w / 2
        b += lead(cx, ly, 330, ly) + lbl(336, ly + 4, name)
        x += w
    if side_label_left:
        b += lbl(100, 272, side_label_left, "middle")
    if side_label_right:
        b += lbl(x + 20, 272, side_label_right, "start")
    return b, x


def revoque_int():
    b, x = capas([
        (130, "url(#p-mamp)", "#9b6e57", "Muro de mampostería", 70),
        (24, "url(#p-mort)", "#a59e8e", "Revoque grueso a la cal 1,5–2 cm", 130),
        (6, "#fbf8f2", "#a59e8e", "Revoque fino a la cal 2–3 mm", 190),
    ], "")
    b += dimh(190, 220, 268, "≈ 2 cm", above=False)
    b += lbl(260, 30, "Interior →", "middle")
    return svg(b, "Revoque grueso y fino interior")


def revoque_ext():
    b, x = capas([
        (130, "url(#p-mamp)", "#9b6e57", "Muro de mampostería", 60),
        (7, "#6b7280", "#4b5563", "Azotado hidrófugo 5 mm", 110),
        (22, "url(#p-mort)", "#a59e8e", "Revoque grueso 1,5 cm", 160),
        (6, "#f5efe4", "#a59e8e", "Revoque fino exterior / premezcla", 210),
    ], "")
    b += dimh(190, 225, 268, "≈ 2,5 cm", above=False)
    b += lbl(260, 30, "Exterior →", "middle")
    return svg(b, "Revoque exterior completo")


def contrapiso():
    b = rect(30, 190, 470, 90, "url(#p-tierra)", "none", 0)
    b += '<path d="M30 190 H500" stroke="#6b5a3c" stroke-width="1.5"/>'
    b += f'<path d="M30 186 H500" stroke="#2563eb" stroke-width="2"/>'
    b += rect(30, 130, 470, 56, "url(#p-casc)", "#8d7e66")
    b += '<path d="M30 124 H500" stroke="#999" stroke-dasharray="6 4"/>'
    b += dimv(515, 130, 186, "10–12 cm")
    b += lead(200, 160, 200, 60) + lbl(200, 54, "Hormigón pobre de cascote 1/4 : 1 : 4 : 8", "middle")
    b += lead(380, 186, 420, 100) + lbl(420, 94, "Film de polietileno 200 µm", "middle")
    b += lead(120, 230, 120, 280) + lbl(120, 292, "Terreno compactado", "middle")
    b += lbl(470, 118, "Piso (otra tarea)", "middle")
    return svg(b, "Contrapiso sobre terreno")


def carpeta():
    b = rect(30, 170, 500, 80, "url(#p-casc)", "#8d7e66")
    b += rect(30, 150, 500, 20, "url(#p-mort)", "#8f887a")
    b += '<path d="M40 140 H520" stroke="#2563eb" stroke-dasharray="3 3"/>'
    b += '<path d="M500 132 l8 8 l-8 8 M60 132 l-8 8 l8 8" fill="none" stroke="#2563eb"/>'
    b += dimv(540, 150, 170, "2 cm")
    b += lead(250, 160, 250, 90) + lbl(250, 84, "Carpeta de cemento 1 : 3 (fratasada)", "middle")
    b += lbl(280, 128, "Nivel / pendiente de proyecto", "middle")
    b += lead(150, 210, 150, 280) + lbl(150, 292, "Contrapiso existente", "middle")
    return svg(b, "Carpeta de nivelación")


def piso_ceramico():
    b = rect(30, 190, 500, 70, "url(#p-casc)", "#8d7e66")
    b += rect(30, 172, 500, 18, "url(#p-mort)", "#8f887a")
    # adhesivo
    b += rect(30, 164, 500, 8, "#cfd3d6", "#9aa0a6")
    # piezas
    for x in range(30, 530, 112):
        b += rect(x + 2, 152, min(106, 528 - x), 12, "#e9e2d0", "#8d8676")
    for x in range(140, 530, 112):
        b += rect(x, 152, 4, 12, "#6b7280", "none", 0)
    b += dimh(142, 252, 136, "pieza 30–60 cm")
    b += lead(250, 168, 330, 110) + lbl(332, 106, "Adhesivo cementicio (llana dentada)")
    b += lead(142, 158, 100, 100) + lbl(40, 96, "Junta 2–3 mm con pastina")
    b += lead(420, 180, 440, 230) + lbl(442, 240, "Carpeta")
    b += lead(200, 220, 200, 280) + lbl(200, 292, "Contrapiso", "middle")
    return svg(b, "Piso cerámico pegado")


def revestimiento_ceramico():
    b = rect(60, 40, 120, 220, "url(#p-mamp)", "#9b6e57")
    b += rect(180, 40, 22, 220, "url(#p-mort)", "#a59e8e")
    b += rect(202, 40, 6, 220, "#cfd3d6", "#9aa0a6")
    for y in range(40, 260, 74):
        b += rect(208, y + 2, 10, 70, "#eef2f5", "#8d8f93")
    b += lead(120, 70, 330, 70) + lbl(336, 74, "Muro")
    b += lead(191, 120, 330, 120) + lbl(336, 124, "Revoque grueso fratasado (sin fino)")
    b += lead(205, 170, 330, 170) + lbl(336, 174, "Adhesivo cementicio")
    b += lead(214, 215, 330, 215) + lbl(336, 219, "Cerámico / porcellanato + pastina")
    b += lbl(240, 30, "Interior (local húmedo) →", "start")
    return svg(b, "Revestimiento cerámico en muro")


def cubierta_chapa():
    import math
    b = ""
    # correas inclinadas
    x0, y0, x1, y1 = 40, 230, 520, 110
    def pt(t):
        return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    for t in (0.05, 0.35, 0.65, 0.95):
        x, y = pt(t)
        b += f'<path d="M{x-10} {y+22} v-18 h20 v18" fill="none" stroke="{ACERO}" stroke-width="2.4"/>'
    # aislante
    b += f'<path d="M{x0} {y0-8} L{x1} {y1-8} L{x1} {y1-14} L{x0} {y0-14} Z" fill="url(#p-lana)" stroke="#c9a15a"/>'
    # chapa ondulada
    pts = []
    n = 160
    for i in range(n + 1):
        t = i / n
        x, y = pt(t)
        y += -20 + 4 * math.sin(t * 60)
        pts.append(f"{x:.1f},{y:.1f}")
    b += f'<polyline points="{" ".join(pts)}" fill="none" stroke="#5b6670" stroke-width="2"/>'
    x, y = pt(0.35)
    b += f'<line x1="{x}" y1="{y-30}" x2="{x}" y2="{y}" stroke="#222" stroke-width="2"/>'
    b += lead(x, y - 30, 190, 70) + lbl(190, 64, "Tornillo autoperforante con arandela", "middle")
    xm, ym = pt(0.7)
    b += lead(xm, ym - 22, 470, 70) + lbl(470, 64, "Chapa acanalada / trapezoidal", "middle")
    xa, ya = pt(0.55)
    b += lead(xa, ya - 11, 330, 250) + lbl(330, 262, "Aislación térmica + barrera de vapor", "middle")
    xc, yc = pt(0.95)
    b += lead(xc, yc + 20, 470, 230) + lbl(470, 242, "Correa C c/ ≈ 1,00 m", "middle")
    b += '<path d="M60 270 L180 270 L180 240" fill="none" stroke="#666"/>'
    b += lbl(120, 288, "pendiente ≥ 10 %", "middle")
    return svg(b, "Cubierta de chapa sobre correas")


def membrana():
    b = rect(30, 230, 500, 40, "url(#p-horm)", "#6f767c")  # losa
    b += '<path d="M30 230 L30 190 L470 214 L470 230 Z" fill="url(#p-casc)" stroke="#8d7e66"/>'
    b += '<path d="M30 190 L30 180 L470 204 L470 214 Z" fill="url(#p-mort)" stroke="#8f887a"/>'
    b += rect(470, 120, 50, 110, "url(#p-mamp)", "#9b6e57")  # parapeto
    # membrana con solape
    b += '<path d="M30 177 L300 191.7" stroke="#111" stroke-width="3"/>'
    b += '<path d="M260 186.5 L470 198 L470 150 L482 150" stroke="#9aa3ab" stroke-width="3" fill="none"/>'
    b += '<path d="M466 150 L486 150 L486 160" stroke="#555" stroke-width="2" fill="none"/>'
    b += dimh(260, 300, 160, "solape ≥ 10 cm")
    b += lead(150, 183, 150, 120) + lbl(150, 114, "Membrana asfáltica 4 mm con aluminio", "middle")
    b += lead(476, 156, 520, 100) + lbl(520, 94, "Babeta / zócalo ≥ 20 cm", "end")
    b += lead(100, 185, 80, 280) + lbl(80, 292, "Carpeta + imprimación", "middle")
    b += lead(300, 210, 300, 280) + lbl(300, 292, "Contrapiso con pendiente ≥ 2 %", "middle")
    b += lbl(500, 252, "Losa", "middle")
    return svg(b, "Impermeabilización con membrana asfáltica")


def cloaca():
    b = rect(30, 80, 500, 200, "url(#p-tierra)", "none", 0)
    b += '<path d="M30 80 H530" stroke="#6b5a3c" stroke-width="2"/>'
    # zanja con caño inclinado
    b += '<path d="M60 120 L440 160 L440 200 L60 160 Z" fill="url(#p-arena)" stroke="#b39b62"/>'
    b += '<path d="M60 140 L440 180" stroke="#e07a2f" stroke-width="10" stroke-linecap="round"/>'
    # cámara de inspección
    b += rect(440, 80, 70, 130, "#c4c8cc", "#6f767c")
    b += rect(452, 92, 46, 106, "#f2f3f4", "#9aa0a6")
    b += lead(250, 160, 250, 40) + lbl(250, 34, "Caño PVC 110 mm (junta elástica)", "middle")
    b += lead(150, 158, 150, 250) + lbl(150, 262, "Lecho y recubrimiento de arena", "middle")
    b += lead(475, 140, 475, 40) + lbl(475, 34, "Cámara de inspección", "middle")
    b += '<path d="M120 220 L330 242" stroke="#444" marker-end="url(#arr2)"/>'
    b += lbl(320, 280, "pendiente 1:20 a 1:60", "middle")
    b = '<defs><marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#444"/></marker></defs>' + b
    return svg(b, "Cañería cloacal PVC 110")


def agua():
    b = rect(40, 40, 480, 220, "#f3ece4", "#c9b8a6")
    b += '<path d="M40 210 H300 V120" fill="none" stroke="#2563eb" stroke-width="5"/>'
    b += '<path d="M40 230 H340 V120" fill="none" stroke="#dc2626" stroke-width="5"/>'
    for (x, c) in ((300, "#2563eb"), (340, "#dc2626")):
        b += f'<circle cx="{x}" cy="112" r="9" fill="#fff" stroke="{c}" stroke-width="3"/>'
    b += '<path d="M290 104 h60" stroke="#666" stroke-width="2"/>'
    b += rect(110, 202, 16, 16, "#fff", "#2563eb", 2)
    b += dimv(380, 120, 260, "h según artefacto")
    b += lead(300, 105, 260, 60) + lbl(260, 54, "Codo / conexión a grifería", "middle")
    b += lead(118, 210, 118, 120) + lbl(118, 114, "Llave de paso", "middle")
    b += lbl(60, 200, "Agua fría", "start")
    b += lbl(60, 252, "Agua caliente", "start")
    b += lbl(470, 240, "Termofusión PPR", "middle")
    b += lbl(470, 254, "20–25 mm embutido", "middle")
    return svg(b, "Boca de agua fría y caliente")


def electricidad():
    b = rect(40, 40, 480, 230, "#f3ece4", "#c9b8a6")
    b += '<path d="M40 52 H520" stroke="#999"/>'
    b += rect(250, 52, 24, 14, "#fff", "#555", 1.4)  # caja octogonal (representación)
    b += '<path d="M262 66 V178" stroke="#f59e0b" stroke-width="5"/>'
    b += rect(252, 178, 20, 30, "#fff", "#555", 1.4)
    b += rect(256, 184, 12, 18, "#e5e7eb", "#555", .8)
    for i, c in enumerate(("#8b4513", "#60a5fa", "#16a34a")):
        b += f'<path d="M{257+i*5} 70 V176" stroke="{c}" stroke-width="1.4"/>'
    b += '<path d="M40 262 H520" stroke="#999"/>'
    b += dimv(320, 193, 262, "1,10 m (tomas 0,30 m)")
    b += lead(274, 59, 360, 90) + lbl(362, 94, "Caja de techo / pase")
    b += lead(266, 120, 360, 140) + lbl(362, 144, "Caño corrugado ignífugo 3/4\"")
    b += lead(272, 190, 360, 186) + lbl(362, 190, "Caja rectangular + módulo")
    b += lead(262, 100, 150, 100) + lbl(148, 104, "Fase · Neutro · Tierra", "end")
    return svg(b, "Boca de electricidad")


def marco():
    b = rect(60, 40, 440, 230, "url(#p-mamp)", "#9b6e57")
    b += rect(200, 70, 160, 200, "#fafafa", "none", 0)
    b += '<path d="M200 270 V70 H360 V270" fill="none" stroke="#4b5563" stroke-width="8"/>'
    for y in (100, 170, 240):
        b += f'<path d="M196 {y} h-18 l-6 6" stroke="#222" stroke-width="2" fill="none"/>'
        b += f'<path d="M364 {y} h18 l6 6" stroke="#222" stroke-width="2" fill="none"/>'
    b += '<path d="M190 70 H370" stroke="#999" stroke-dasharray="4 3"/>'
    b += dimh(204, 356, 290, "luz de paso", above=True)
    b += dimv(520, 70, 270, "2,00–2,05 m")
    b += lead(380, 100, 440, 30) + lbl(440, 24, "Grapas amuradas (3 por lado)", "middle")
    b += lead(204, 140, 120, 30) + lbl(120, 24, "Marco de chapa", "middle")
    return svg(b, "Colocación de marco de chapa")


def pintura():
    b, x = capas([
        (120, "url(#p-mamp)", "#9b6e57", "Muro", 60),
        (20, "url(#p-mort)", "#a59e8e", "Revoque fino (sano y seco)", 105),
        (4, "#e5e7eb", "#9aa0a6", "Fijador sellador", 150),
        (4, "#f8fafc", "#9aa0a6", "Enduido (donde haga falta) y lijado", 195),
        (6, "#93c5fd", "#3b82f6", "2 manos de látex", 240),
    ], "")
    b += lbl(250, 30, "Interior →", "middle")
    return svg(b, "Pintura látex interior")
