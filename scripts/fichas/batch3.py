from svgkit import lbl, lead, dimh, dimv, rect, svg
from dibujos import ACERO

# ---------------- dibujos ----------------

def columna():
    b = rect(200, 60, 160, 160, "url(#p-horm)", "#6f767c", 1.4)
    b += rect(180, 40, 20, 200, "url(#p-madera)", "#a07a43")
    b += rect(360, 40, 20, 200, "url(#p-madera)", "#a07a43")
    b += rect(200, 40, 160, 20, "url(#p-madera)", "#a07a43")
    b += rect(200, 220, 160, 20, "url(#p-madera)", "#a07a43")
    b += f'<rect x="218" y="78" width="124" height="124" fill="none" stroke="{ACERO}" stroke-width="1.8"/>'
    for (x, y) in ((226, 86), (334, 86), (226, 194), (334, 194)):
        b += f'<circle cx="{x}" cy="{y}" r="5" fill="#3d454d"/>'
    b += dimh(200, 360, 268, "0,20 m (mín. según cálculo)", above=False)
    b += dimv(400, 60, 220, "0,20 m")
    b += lead(334, 194, 470, 230) + lbl(472, 234, "4 Ø 12 (ADN 420)")
    b += lead(342, 120, 470, 130) + lbl(472, 134, "Estribos Ø 6 c/ 15 cm")
    b += lead(190, 140, 80, 140) + lbl(78, 144, "Encofrado", "end")
    b += lead(280, 140, 470, 70) + lbl(472, 74, "Hormigón H-21")
    return svg(b, "Columna de hormigón armado en planta")


def losa_maciza():
    b = rect(40, 110, 460, 50, "url(#p-horm)", "#6f767c", 1.4)
    b += f'<path d="M50 150 H490" stroke="{ACERO}" stroke-width="2"/>'
    for x in range(60, 490, 30):
        b += f'<circle cx="{x}" cy="146" r="2.4" fill="#3d454d"/>'
    b += f'<path d="M50 118 H130 M410 118 H490" stroke="{ACERO}" stroke-width="2"/>'
    b += rect(40, 160, 460, 10, "url(#p-madera)", "#a07a43")
    for x in (90, 210, 330, 450):
        b += f'<path d="M{x} 170 V270" stroke="#8a6a3a" stroke-width="5"/><path d="M{x-14} 270 H{x+14}" stroke="#8a6a3a" stroke-width="3"/>'
    b += dimv(520, 110, 160, "10–15 cm")
    b += lead(300, 146, 300, 60) + lbl(300, 54, "Armadura inferior principal y de repartición", "middle")
    b += lead(100, 118, 100, 80) + lbl(60, 74, "Armadura superior en apoyos")
    b += lead(260, 165, 230, 230) + lbl(230, 242, "Encofrado fenólico", "middle")
    b += lead(450, 230, 520, 230) + lbl(560, 220, "Puntales", "end")
    b += lbl(470, 100, "Recubrimiento ≥ 2 cm", "middle")
    return svg(b, "Losa maciza de hormigón armado")


def tejas():
    b = ""
    x0, y0, x1, y1 = 40, 250, 500, 90
    def pt(t):
        return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    import math
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    # cabio
    b += f'<g transform="translate({x0},{y0}) rotate({ang})">'
    L = math.hypot(x1 - x0, y1 - y0)
    b += rect(0, 0, L, 26, "url(#p-madera)", "#a07a43")
    b += rect(0, -8, L, 8, "#e8cfa4", "#a07a43")  # machimbre
    b += rect(0, -11, L, 3, "#1f2937", "none", 0)  # membrana
    for k in range(0, int(L), 44):
        b += rect(k, -19, 10, 8, "#c49a5c", "#8a6a3a")  # listones
    for k in range(0, int(L) - 30, 44):
        b += f'<path d="M{k-2} -19 L{k+44} -19 L{k+44} -27 L{k+6} -31 Z" fill="#c2603a" stroke="#8b3d22" stroke-width=".8"/>'
    b += '</g>'
    xa, ya = pt(0.75)
    b += lead(xa, ya - 28, 470, 40) + lbl(470, 34, "Teja cerámica francesa", "middle")
    xb, yb = pt(0.35)
    b += lead(xb, yb - 18, 170, 60) + lbl(170, 54, "Listón / clavadera", "middle")
    xc, yc = pt(0.5)
    b += lead(xc + 6, yc - 8, 330, 230) + lbl(330, 242, "Membrana hidrófuga + aislación sobre machimbre", "middle")
    xd, yd = pt(0.2)
    b += lead(xd + 10, yd + 18, 170, 280) + lbl(170, 292, "Cabio de madera", "middle")
    b += '<path d="M380 270 L500 270 L500 230" fill="none" stroke="#666"/>'
    b += lbl(440, 288, "pendiente ≥ 30 %", "middle")
    return svg(b, "Cubierta de tejas sobre estructura de madera")


def pluvial():
    b = rect(40, 50, 330, 40, "url(#p-horm)", "#6f767c")
    b += rect(370, 50, 50, 230, "url(#p-mamp)", "#9b6e57")
    b += '<path d="M340 90 V270 H40" fill="none" stroke="#9ca3af" stroke-width="12"/>'
    b += '<path d="M325 50 h30 l-6 14 h-18 z" fill="#6b7280"/>'
    for y in (130, 200):
        b += f'<path d="M330 {y} h22" stroke="#222" stroke-width="3"/>'
    b += rect(40, 252, 60, 30, "#c4c8cc", "#6f767c")
    b += lead(340, 56, 470, 30) + lbl(470, 24, "Embudo / boca de desagüe", "middle")
    b += lead(346, 160, 470, 150) + lbl(472, 154, "Caño PVC 110 vertical")
    b += lead(352, 200, 470, 210) + lbl(472, 214, "Grapas c/ 1,50 m")
    b += lead(200, 270, 200, 230) + lbl(200, 224, "Horizontal con pendiente ≥ 1 %", "middle")
    b += lbl(70, 296, "Boca de desagüe", "middle")
    b += lbl(200, 40, "Azotea / canaleta", "middle")
    return svg(b, "Desagüe pluvial")


def tanque():
    b = rect(40, 250, 500, 20, "url(#p-horm)", "#6f767c")
    b += rect(170, 230, 180, 20, "url(#p-horm)", "#6f767c")
    b += '<path d="M190 230 V100 Q190 70 260 66 Q330 70 330 100 V230 Z" fill="#1f3b57" stroke="#0f2233"/>'
    b += '<path d="M330 120 H400" stroke="#2563eb" stroke-width="5"/>'
    b += '<circle cx="310" cy="122" r="7" fill="#e5e7eb" stroke="#555"/>'
    b += '<path d="M200 220 H130 V270" fill="none" stroke="#2563eb" stroke-width="5"/>'
    b += '<path d="M105 245 V215 H130" fill="none" stroke="#2563eb" stroke-width="3"/>'
    for (x, y) in ((360, 120), (160, 220)):
        b += f'<rect x="{x-7}" y="{y-7}" width="14" height="14" fill="#fff" stroke="#222" stroke-width="2"/>'
    b += lead(400, 120, 470, 80) + lbl(470, 74, "Alimentación con flotante", "middle")
    b += lead(160, 220, 80, 120) + lbl(80, 114, "Colector + llaves de paso", "middle")
    b += lead(105, 230, 60, 200) + lbl(40, 194, "Ruptor de vacío")
    b += lead(260, 150, 470, 170) + lbl(472, 174, "Tanque tricapa 1.000 l")
    b += lead(260, 240, 470, 230) + lbl(472, 234, "Base firme y nivelada")
    return svg(b, "Tanque de reserva")


def inodoro():
    b = rect(380, 30, 120, 230, "url(#p-mamp)", "#9b6e57")
    b += rect(40, 230, 340, 30, "url(#p-casc)", "#8d7e66")
    b += '<path d="M330 120 H378 V200 H330 Z" fill="#f8fafc" stroke="#6b7280"/>'
    b += '<path d="M180 230 L200 170 Q200 150 240 150 H330 V210 Q330 230 300 230 Z" fill="#f8fafc" stroke="#6b7280"/>'
    b += '<path d="M190 150 H330" stroke="#6b7280" stroke-width="4"/>'
    b += '<circle cx="290" cy="244" r="12" fill="#e07a2f" stroke="#9a4b16"/>'
    b += '<path d="M354 200 V215 Q354 222 362 222 H378" fill="none" stroke="#2563eb" stroke-width="3"/>'
    b += lead(354, 140, 260, 60) + lbl(260, 54, "Mochila", "middle")
    b += lead(290, 244, 200, 290) + lbl(200, 292, "Descarga Ø 110 + aro de sello", "middle")
    b += lead(370, 218, 470, 280) + lbl(470, 292, "Flexible + llave de paso", "middle")
    b += lead(200, 200, 90, 130) + lbl(90, 124, "Fijación con tarugos y tornillos", "middle")
    b += dimh(300, 378, 110, "≈ 0,30 m (eje)")
    return svg(b, "Colocación de inodoro")


def lavatorio():
    b = rect(380, 30, 120, 230, "url(#p-mamp)", "#9b6e57")
    b += rect(40, 250, 340, 20, "url(#p-casc)", "#8d7e66")
    b += '<path d="M250 110 H378 V125 Q378 160 330 165 H280 Q250 160 250 125 Z" fill="#f8fafc" stroke="#6b7280"/>'
    b += rect(318, 92, 8, 18, "#9ca3af", "#4b5563")
    b += '<path d="M310 165 V190 Q310 200 322 200 H378" fill="none" stroke="#6b7280" stroke-width="5"/>'
    b += '<path d="M340 120 V140 M360 120 V150" stroke="#2563eb" stroke-width="2"/>'
    b += dimv(100, 110, 250, "0,80–0,85 m", right=False)
    b += lead(322, 96, 300, 60) + lbl(300, 54, "Grifería", "middle")
    b += lead(310, 195, 230, 226) + lbl(130, 236, "Sifón + descarga Ø 40")
    b += lead(345, 140, 150, 110) + lbl(40, 104, "Flexibles con llaves")
    b += lead(270, 120, 120, 60) + lbl(40, 54, "Lavatorio / vanitory")
    return svg(b, "Colocación de lavatorio")


def puesta_tierra():
    b = rect(40, 110, 500, 180, "url(#p-tierra)", "none", 0)
    b += '<path d="M40 110 H540" stroke="#6b5a3c" stroke-width="2"/>'
    b += rect(250, 100, 60, 30, "#c4c8cc", "#6f767c")
    b += '<path d="M280 112 V285" stroke="#b45309" stroke-width="6"/>'
    b += '<path d="M280 112 Q200 90 120 60" fill="none" stroke="#16a34a" stroke-width="3"/>'
    b += rect(90, 40, 60, 40, "#eef0f2", "#4b5563")
    b += dimv(320, 130, 285, "1,50 m (mín.)")
    b += lead(310, 115, 470, 70) + lbl(470, 64, "Caja de inspección", "middle")
    b += lead(280, 220, 200, 220) + lbl(40, 224, "Jabalina cobre-acero 3/4\"")
    b += lead(200, 86, 200, 40) + lbl(230, 34, "Conductor PE 10 mm² verde-amarillo", "middle")
    b += lbl(120, 98, "Tablero", "middle")
    return svg(b, "Puesta a tierra con jabalina")


def vereda():
    b = rect(30, 210, 500, 70, "url(#p-tierra)", "none", 0)
    b += rect(30, 160, 500, 50, "url(#p-casc)", "#8d7e66")
    b += rect(30, 146, 500, 14, "url(#p-mort)", "#8f887a")
    for x in range(30, 530, 80):
        b += rect(x + 1, 134, min(78, 529 - x), 12, "#d6d3cc", "#8d8676")
    b += rect(530, 120, 30, 160, "url(#p-horm)", "#6f767c")
    b += '<path d="M40 126 L520 136" stroke="#2563eb" stroke-dasharray="4 3"/>'
    b += lbl(280, 116, "pendiente 1–2 % hacia el cordón", "middle")
    b += lead(150, 140, 120, 60) + lbl(120, 54, "Baldosa según normativa", "middle")
    b += lead(300, 153, 330, 60) + lbl(330, 54, "Mortero de asiento", "middle")
    b += lead(200, 185, 200, 290) + lbl(200, 296, "Contrapiso de hormigón 10 cm", "middle")
    b += lead(545, 200, 470, 260) + lbl(470, 272, "Cordón", "middle")
    return svg(b, "Vereda")


def mesada():
    b = rect(430, 30, 80, 250, "url(#p-mamp)", "#9b6e57")
    b += rect(80, 100, 350, 14, "#3f3f46", "#18181b")
    b += rect(410, 60, 20, 40, "#3f3f46", "#18181b")
    b += '<path d="M200 114 V150 Q200 160 210 160 H290 Q300 160 300 150 V114" fill="#d1d5db" stroke="#6b7280"/>'
    b += rect(100, 114, 330, 160, "#f5f5f4", "#a8a29e")
    b += '<path d="M265 114 V274" stroke="#a8a29e"/>'
    b += dimv(60, 100, 274, "0,90 m", right=False)
    b += dimh(80, 430, 86, "largo")
    b += lead(150, 105, 120, 40) + lbl(120, 34, "Granito 2 cm con canto pulido", "middle")
    b += lead(420, 70, 400, 40) + lbl(410, 34, "Zócalo / frentín 5–10 cm", "end")
    b += lead(250, 150, 330, 290) + lbl(330, 296, "Bacha pegada bajo mesada", "middle")
    b += lbl(180, 200, "Bajomesada", "middle")
    return svg(b, "Mesada de granito")


def puerta_placa():
    b = rect(60, 40, 440, 230, "url(#p-mamp)", "#9b6e57")
    b += '<path d="M200 270 V70 H360 V270" fill="none" stroke="#4b5563" stroke-width="8"/>'
    b += rect(204, 74, 152, 192, "url(#p-madera)", "#a07a43")
    for y in (90, 165, 245):
        b += rect(352, y, 6, 12, "#222", "none", 0)
    b += '<circle cx="216" cy="175" r="4" fill="#9ca3af" stroke="#4b5563"/><path d="M216 175 h18" stroke="#4b5563" stroke-width="3"/>'
    b += dimh(204, 356, 290, "hoja 0,70 / 0,80 m")
    b += dimv(520, 74, 266, "2,00 m")
    b += lead(355, 96, 440, 24) + lbl(440, 24, "3 bisagras", "middle")
    b += lead(230, 175, 120, 120) + lbl(120, 114, "Cerradura + picaporte", "middle")
    b += lead(280, 140, 150, 30) + lbl(150, 24, "Hoja placa", "middle")
    return svg(b, "Colocación de puerta placa")


# ---------------- datos ----------------

def add(t):
    t("Hormigón armado", "HA-COL", "Columna de hormigón armado 0,20 × 0,20", "ml", columna(),
      "Columna de hormigón armado hormigonada en encofrado de madera, con armadura longitudinal y estribos. Sección y armadura mínimas de referencia; las define el cálculo estructural.",
      [("Sección habitual", "0,20 × 0,20 m"), ("Armadura mínima", "4 Ø 12 + estribos Ø 6 c/ 15 cm"), ("Recubrimiento", "≥ 2 cm (interior)")],
      [("Hormigón H-21", "0,042 m³"), ("Acero ADN 420", "5,1 kg"), ("Alambre de atar", "0,08 kg"), ("Madera de encofrado (con reúso)", "0,80 m²"), ("Clavos", "0,08 kg")],
      [("Oficial + ayudante", "3–4 ml/jornada")],
      ["Aplomar el encofrado en dos direcciones.", "Hormigonar en capas y vibrar; desencofrar a las 48 h."],
      corte="Planta (corte horizontal). Esquema ilustrativo, sin escala.")

    t("Hormigón armado", "HA-LMA", "Losa maciza de hormigón armado", "m²", losa_maciza(),
      "Losa llena de hormigón armado sobre encofrado de placas fenólicas y puntales, con armadura inferior en dos direcciones y armadura superior en apoyos. Espesor y armadura según cálculo.",
      [("Espesor habitual", "10–15 cm (según luz)"), ("Recubrimiento", "≥ 2 cm"), ("Cuantía orientativa de acero", "8–10 kg/m²")],
      [("Hormigón elaborado H-21 (e = 12 cm)", "0,126 m³"), ("Acero ADN 420", "9 kg"), ("Alambre de atar", "0,15 kg"), ("Encofrado fenólico + puntales (alquiler, con reúso)", "1,05 m²"), ("Separadores", "4 un")],
      [("Oficial + ayudante (encofrado, armado y hormigonado)", "8–10 m²/jornada")],
      ["Curado húmedo al menos 7 días.", "Mantener puntales hasta que el hormigón alcance su resistencia (≈ 21–28 días)."])

    t("Cubiertas e impermeabilizaciones", "CUB-TEJ", "Cubierta de tejas cerámicas sobre estructura de madera", "m²", tejas(),
      "Techo inclinado de tejas cerámicas francesas sobre listones, con membrana hidrófuga y aislación sobre machimbre apoyado en cabios de madera. La sección y separación de cabios salen del cálculo.",
      [("Pendiente mínima", "≈ 30 % (según fabricante de teja)"), ("Tejas francesas", "≈ 14–15 un/m²"), ("Separación de cabios", "≈ 0,50 m")],
      [("Teja cerámica francesa", "15,5 un"), ("Cabio 3\" × 6\"", "2,00 ml"), ("Machimbre 1/2\"", "1,05 m²"), ("Membrana hidrófuga", "1,10 m²"), ("Aislante térmico", "1,05 m²"), ("Listón / clavadera 1\" × 2\"", "3,00 ml"), ("Clavos y alambre", "0,15 kg")],
      [("Oficial + ayudante (estructura y cubierta)", "8–12 m²/jornada")],
      ["Fijar las tejas de borde y cumbrera con alambre o clavo.", "Resolver cumbreras, limatesas y canaletas con piezas específicas."])

    t("Instalación sanitaria", "SAN-PLU", "Desagüe pluvial de PVC 110", "ml", pluvial(),
      "Bajada y conducción de agua de lluvia en caño de PVC de 110 mm desde el embudo de azotea o canaleta hasta la boca de desagüe, con grapas de sujeción.",
      [("Diámetro habitual", "110 mm"), ("Regla práctica de sección", "≈ 1 cm² de caño por m² de cubierta"), ("Pendiente tramo horizontal", "≥ 1 %")],
      [("Caño PVC 110", "1,05 ml"), ("Grapas", "0,7 un"), ("Accesorios (prorrateo)", "0,3 un"), ("Adhesivo / lubricante", "s/ obra")],
      [("Plomero + ayudante", "10–15 ml/jornada")],
      ["No conectar el pluvial a la cloaca.", "Prever embudos con rejilla y caños de limpieza."],
      corte="Corte esquemático. Sin escala.")

    t("Instalación sanitaria", "SAN-TAN", "Tanque de reserva plástico de 1.000 l instalado", "un", tanque(),
      "Provisión y conexión de tanque de reserva tricapa sobre base firme, con flotante en la alimentación, colector de salida con llaves de paso y ruptor de vacío.",
      [("Capacidad", "según cálculo de reserva diaria"), ("Altura", "suficiente para presión en la ducha más alta"), ("Material", "polietileno tricapa")],
      [("Tanque tricapa 1.000 l", "1 un"), ("Flotante", "1 un"), ("Llaves esféricas", "3 un"), ("Caño PPR y accesorios del colector", "6 ml"), ("Ruptor de vacío", "1 un")],
      [("Plomero + ayudante", "1 tanque/jornada")],
      ["Verificar que la losa o base soporte ≈ 1.100 kg.", "Tapa ajustada y limpieza antes de habilitar."],
      corte="Corte esquemático. Sin escala.")

    t("Instalación sanitaria", "SAN-INO", "Colocación de inodoro con mochila", "un", inodoro(),
      "Colocación de inodoro y mochila (o depósito) provistos aparte, fijados al piso con tarugos y tornillos, con aro de sello en la descarga y conexión de agua con flexible y llave de paso.",
      [("Eje de descarga", "≈ 0,30 m del muro terminado"), ("Descarga", "Ø 110 mm"), ("Sellado", "aro de sello + silicona al piso")],
      [("Aro de sello / conector", "1 un"), ("Flexible", "1 un"), ("Tornillos y tarugos de fijación", "2 un"), ("Silicona", "0,2 cartucho")],
      [("Plomero", "3–4 un/jornada")],
      ["Verificar el eje de la descarga antes del piso.", "Probar descarga y pérdidas al terminar."],
      corte="Corte esquemático. Sin escala.")

    t("Instalación sanitaria", "SAN-LAV", "Colocación de lavatorio o vanitory con grifería", "un", lavatorio(),
      "Colocación de lavatorio o vanitory provisto aparte, con grifería, flexibles con llaves de paso, sifón y conexión a la descarga de Ø 40.",
      [("Altura de borde", "0,80–0,85 m"), ("Descarga", "Ø 40 mm con sifón"), ("Alimentación", "fría y caliente")],
      [("Flexibles", "2 un"), ("Sifón", "1 un"), ("Tornillos y tarugos", "4 un"), ("Silicona", "0,2 cartucho")],
      [("Plomero", "3–4 un/jornada")],
      ["Colocar después del revestimiento.", "Sellar el encuentro con el muro."],
      corte="Corte esquemático. Sin escala.")

    t("Instalación eléctrica", "ELE-PAT", "Puesta a tierra con jabalina", "un", puesta_tierra(),
      "Toma de tierra con jabalina de cobre-acero hincada en el terreno, caja de inspección y conductor de protección hasta la barra de tierra del tablero.",
      [("Resistencia de puesta a tierra", "≤ 40 Ω (AEA 90364), medir"), ("Conductor PE", "≥ 10 mm² hasta el tablero"), ("Jabalina", "3/4\" × 1,50 m")],
      [("Jabalina cobre-acero 3/4\" × 1,50 m", "1 un"), ("Caja de inspección", "1 un"), ("Conductor verde-amarillo 10 mm²", "10 ml"), ("Tomacable / morseto", "1 un")],
      [("Electricista + ayudante", "2–3 un/jornada")],
      ["Medir con telurímetro y dejar registro.", "Si no se alcanza el valor, agregar jabalinas en paralelo."],
      corte="Corte esquemático. Sin escala.")

    t("Exteriores", "EXT-VER", "Vereda de baldosas sobre contrapiso", "m²", vereda(),
      "Vereda con contrapiso de hormigón, mortero de asiento y baldosas del tipo exigido por la normativa del GCBA, con pendiente hacia el cordón. En CABA requiere el tipo de baldosa, rampas y solados táctiles que fije la normativa vigente.",
      [("Pendiente transversal", "1–2 % hacia el cordón"), ("Contrapiso", "≈ 10 cm"), ("Baldosa", "según normativa GCBA vigente")],
      [("Hormigón para contrapiso", "0,105 m³"), ("Mortero de asiento 1/4 : 1 : 4", "0,03 m³"), ("Baldosa", "1,05 m²"), ("Lechada de cemento", "0,5 kg")],
      [("Oficial + ayudante", "8–10 m²/jornada")],
      ["Verificar niveles con el umbral y el cordón existentes.", "Vallar y señalizar durante la obra."])

    t("Equipamiento", "EQU-MES", "Mesada de granito con bacha", "ml", mesada(),
      "Provisión y colocación de mesada de granito de 2 cm con canto pulido, zócalo o frentín, y bacha pegada bajo mesada, apoyada sobre bajomesada o ménsulas.",
      [("Espesor", "2 cm"), ("Profundidad / altura", "0,60 / 0,90 m"), ("Bacha", "pegada bajo mesada")],
      [("Granito 2 cm (por ml de mesada)", "0,62 m²"), ("Zócalo de granito", "1,00 ml"), ("Adhesivo / sellador", "0,3 cartucho"), ("Ménsulas (si no hay bajomesada)", "1 un")],
      [("Marmolero + ayudante", "3–5 ml/jornada")],
      ["Tomar medidas después de los revoques.", "Calar bacha y anafe en taller."],
      corte="Elevación esquemática. Sin escala.")

    t("Carpinterías", "CAR-PUE", "Colocación de puerta placa en marco existente", "un", puerta_placa(),
      "Colocación de hoja de puerta placa en marco de chapa o madera ya amurado: ajuste, colocación de bisagras, cerradura y picaporte, con luz inferior para ventilación.",
      [("Hojas habituales", "0,70 / 0,80 × 2,00 m"), ("Luz inferior", "≈ 1 cm"), ("Bisagras", "3 por hoja")],
      [("Hoja placa", "1 un"), ("Bisagras", "3 un"), ("Cerradura", "1 un"), ("Juego de picaporte", "1 un"), ("Tornillos", "s/ obra")],
      [("Carpintero / oficial", "4–6 un/jornada")],
      ["Colocar después de la pintura del marco.", "Verificar que cierre sin rozar."],
      corte="Elevación. Esquema ilustrativo, sin escala.")
