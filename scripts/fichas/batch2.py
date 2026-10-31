from svgkit import lbl, lead, dimh, dimv, rect, svg
from dibujos import capas, ACERO

# ---------------- dibujos ----------------

def enlucido():
    b, x = capas([
        (130, "url(#p-mamp)", "#9b6e57", "Muro de mampostería", 70),
        (20, "#f1efe9", "#b7b2a6", "Jaharro de yeso ≈ 1 cm", 135),
        (5, "#ffffff", "#b7b2a6", "Enlucido de yeso a la llana 2 mm", 200),
    ], "")
    b += rect(205, 40, 8, 30, "#9aa3ab", "#6b7280")
    b += lead(213, 52, 330, 30) + lbl(336, 34, "Guardacanto en aristas")
    b += dimh(190, 215, 268, "≈ 1,2 cm", above=False)
    b += lbl(150, 30, "Interior seco →", "middle")
    return svg(b, "Enlucido de yeso")


def cielo_aplicado():
    b = rect(40, 60, 440, 60, "url(#p-horm)", "#6f767c")
    b += rect(40, 120, 440, 4, "#cfd3d6", "#9aa0a6")
    b += rect(40, 124, 440, 16, "#f1efe9", "#b7b2a6")
    b += rect(40, 140, 440, 3, "#ffffff", "#b7b2a6")
    b += rect(40, 60, 20, 200, "url(#p-mamp)", "#9b6e57")
    b += rect(460, 60, 20, 200, "url(#p-mamp)", "#9b6e57")
    b += dimv(500, 120, 143, "≈ 1–1,5 cm")
    b += lead(280, 90, 280, 40) + lbl(280, 34, "Losa de hormigón", "middle")
    b += lead(200, 122, 140, 200) + lbl(140, 212, "Puente de adherencia", "middle")
    b += lead(300, 132, 300, 200) + lbl(300, 212, "Jaharro de yeso", "middle")
    b += lead(400, 141, 400, 200) + lbl(400, 212, "Enlucido a la llana", "middle")
    return svg(b, "Cielorraso aplicado de yeso")


def zocalo():
    b = rect(380, 30, 120, 230, "url(#p-mamp)", "#9b6e57")
    b += rect(362, 30, 18, 230, "url(#p-mort)", "#a59e8e")
    b += rect(40, 230, 340, 30, "url(#p-casc)", "#8d7e66")
    b += rect(40, 218, 340, 12, "url(#p-mort)", "#8f887a")
    b += rect(40, 210, 322, 8, "#e9e2d0", "#8d8676")
    b += rect(356, 160, 6, 58, "#cfd3d6", "#9aa0a6")
    b += rect(348, 160, 8, 50, "#e9e2d0", "#8d8676")
    b += dimv(330, 160, 210, "7–10 cm", right=False)
    b += lead(352, 170, 250, 90) + lbl(250, 84, "Zócalo cerámico / porcellanato", "middle")
    b += lead(359, 190, 470, 290) + lbl(530, 292, "Adhesivo + pastina", "end")
    b += lead(150, 214, 150, 140) + lbl(150, 134, "Piso", "middle")
    b += lbl(440, 22, "Muro revocado", "middle")
    return svg(b, "Zócalo cerámico")


def ventana_alu():
    b = rect(60, 40, 440, 230, "url(#p-mamp)", "#9b6e57")
    b += rect(170, 80, 220, 140, "#e8f1f8", "none", 0)
    b += '<rect x="170" y="80" width="220" height="140" fill="none" stroke="#9aa3ab" stroke-width="10"/>'
    b += '<rect x="166" y="76" width="228" height="148" fill="none" stroke="#4b5563" stroke-width="2"/>'
    b += '<line x1="280" y1="85" x2="280" y2="215" stroke="#9aa3ab" stroke-width="6"/>'
    b += '<rect x="160" y="218" width="240" height="10" fill="#c4c8cc" stroke="#6f767c"/>'
    for (x, y) in ((166, 110), (166, 190), (394, 110), (394, 190)):
        b += f'<circle cx="{x}" cy="{y}" r="3" fill="#222"/>'
    b += lead(166, 110, 110, 30) + lbl(110, 24, "Premarco amurado / fijado", "middle")
    b += lead(390, 150, 470, 30) + lbl(470, 24, "Marco de aluminio", "middle")
    b += lead(394, 190, 500, 280) + lbl(570, 292, "Sellador perimetral exterior", "end")
    b += lead(280, 223, 200, 290) + lbl(200, 292, "Alféizar con pendiente", "middle")
    b += dimh(170, 390, 66, "ancho de vano")
    return svg(b, "Ventana de aluminio con premarco")


def gas():
    b = rect(40, 40, 500, 220, "#f3ece4", "#c9b8a6")
    b += rect(60, 150, 70, 80, "#e5e7eb", "#6b7280")
    b += lbl(95, 196, "Medidor", "middle")
    b += '<path d="M130 190 H300 V110 H450 V150" fill="none" stroke="#eab308" stroke-width="6"/>'
    b += rect(440, 150, 30, 20, "#fff", "#6b7280", 1.4)
    b += '<path d="M290 120 h20" stroke="#222" stroke-width="3"/>'
    b += '<circle cx="455" cy="128" r="6" fill="#fff" stroke="#222" stroke-width="2"/>'
    b += lead(220, 190, 220, 250) + lbl(220, 262, "Cañería aprobada (epoxi o termofusión)", "middle")
    b += lead(455, 128, 470, 70) + lbl(470, 64, "Llave de paso por artefacto", "middle")
    b += lead(455, 170, 455, 230) + lbl(455, 242, "Artefacto", "middle")
    b += lead(300, 150, 360, 210) + lbl(362, 214, "Grapas de sujeción")
    return svg(b, "Instalación de gas")


def tablero():
    b = rect(150, 40, 260, 230, "#eef0f2", "#4b5563", 2)
    b += rect(170, 70, 220, 40, "#fff", "#9aa0a6")
    b += rect(170, 130, 220, 40, "#fff", "#9aa0a6")
    b += rect(180, 76, 36, 28, "#2563eb", "#1e3a8a")
    for i in range(4):
        b += rect(224 + i * 20, 76, 16, 28, "#f8fafc", "#4b5563")
    b += rect(170, 210, 220, 10, "#16a34a", "#14532d")
    b += lead(198, 90, 80, 30) + lbl(20, 24, "Disyuntor diferencial 30 mA")
    b += lead(260, 90, 470, 30) + lbl(570, 24, "Termomagnéticas por circuito", "end")
    b += lead(280, 215, 470, 240) + lbl(472, 244, "Barra de tierra")
    b += lead(390, 150, 470, 150) + lbl(472, 154, "Riel DIN de reserva")
    b += lbl(280, 290, "Gabinete con tapa y cierre", "middle")
    return svg(b, "Tablero seccional")


def imp_banio():
    b = rect(380, 30, 120, 230, "url(#p-mamp)", "#9b6e57")
    b += rect(40, 230, 340, 30, "url(#p-casc)", "#8d7e66")
    b += rect(40, 216, 340, 14, "url(#p-mort)", "#8f887a")
    b += '<path d="M40 214 H376 V110" fill="none" stroke="#0e7490" stroke-width="4"/>'
    b += '<path d="M352 214 Q376 214 376 190" fill="none" stroke="#f59e0b" stroke-width="5"/>'
    b += dimv(350, 110, 214, "≥ 20 cm (ducha ≥ 1,80 m)", right=False)
    b += lead(200, 214, 200, 150) + lbl(200, 144, "Impermeabilizante cementicio, 2 manos", "middle")
    b += lead(370, 205, 290, 290) + lbl(290, 292, "Banda / malla de refuerzo en encuentros", "middle")
    b += lead(120, 223, 70, 290) + lbl(40, 292, "Carpeta")
    return svg(b, "Impermeabilización de baño")


def pintura_ext():
    b, x = capas([
        (120, "url(#p-mamp)", "#9b6e57", "Muro", 60),
        (20, "url(#p-mort)", "#a59e8e", "Revoque exterior sano", 105),
        (4, "#e5e7eb", "#9aa0a6", "Fijador al solvente o al agua", 150),
        (4, "#f8fafc", "#9aa0a6", "Enduido exterior en fisuras", 195),
        (7, "#fcd34d", "#d97706", "2–3 manos de látex acrílico exterior", 240),
    ], "")
    b += lbl(250, 30, "Exterior →", "middle")
    return svg(b, "Pintura látex exterior")


def esmalte():
    b = rect(80, 120, 380, 22, "#9aa3ab", "#4b5563")
    b += rect(80, 112, 380, 8, "#b91c1c", "#7f1d1d")
    b += rect(80, 106, 380, 6, "#1f2937", "#111")
    b += lead(200, 131, 200, 230) + lbl(200, 242, "Superficie metálica desengrasada y lijada", "middle")
    b += lead(320, 116, 380, 60) + lbl(380, 54, "Fondo antióxido", "middle")
    b += lead(150, 109, 120, 60) + lbl(120, 54, "2 manos de esmalte sintético", "middle")
    b += dimh(80, 460, 180, "carpintería / reja / baranda", above=False)
    return svg(b, "Esmalte sintético sobre metal")


def encadenado():
    b = rect(170, 150, 160, 130, "url(#p-mamp)", "#9b6e57")
    b += rect(170, 70, 160, 80, "url(#p-horm)", "#6f767c", 1.4)
    b += rect(150, 66, 20, 88, "url(#p-madera)", "#a07a43")
    b += rect(330, 66, 20, 88, "url(#p-madera)", "#a07a43")
    b += f'<rect x="182" y="82" width="136" height="56" fill="none" stroke="{ACERO}" stroke-width="1.6"/>'
    for (x, y) in ((190, 90), (310, 90), (190, 130), (310, 130)):
        b += f'<circle cx="{x}" cy="{y}" r="4" fill="#3d454d"/>'
    b += dimh(170, 330, 40, "ancho del muro (≥ 0,15 m)")
    b += dimv(380, 70, 150, "≥ 0,20 m")
    b += lead(310, 130, 470, 120) + lbl(472, 124, "4 Ø 10 (ADN 420)")
    b += lead(318, 100, 470, 92) + lbl(472, 96, "Estribos Ø 6 c/ 20 cm")
    b += lead(155, 120, 80, 120) + lbl(78, 124, "Encofrado", "end")
    b += lead(250, 200, 470, 220) + lbl(472, 224, "Muro")
    return svg(b, "Encadenado de hormigón armado")


# ---------------- datos ----------------
REF = "Valores de referencia de práctica habitual en AMBA. Ajustar al proyecto, al proveedor y al cálculo cuando corresponda."

def add(t):
    t("Hormigón armado", "HA-ENC", "Encadenado / viga de hormigón armado 0,15 × 0,20", "ml", encadenado(),
      "Viga de hormigón armado que corona o ata los muros de mampostería y recibe losas o techos. Se hormigona en encofrado de madera sobre el muro. Medidas y armadura mínimas; el cálculo puede pedir más.",
      [("Sección habitual", "0,15 × 0,20 m"), ("Armadura mínima", "4 Ø 10 + estribos Ø 6 c/ 20 cm"), ("Hormigón", "H-21")],
      [("Hormigón H-21", "0,032 m³"), ("Acero ADN 420", "3,5 kg"), ("Alambre de atar", "0,05 kg"), ("Madera de encofrado (con reúso)", "0,40 m²"), ("Clavos", "0,05 kg")],
      [("Oficial + ayudante", "4–6 ml/jornada")],
      ["Atar los hierros en esquinas con escuadras.", "Desencofrar los laterales a las 48 h."])

    t("Yesería", "YES-ENL", "Jaharro y enlucido de yeso sobre mampostería", "m²", enlucido(),
      "Terminación interior de paredes con jaharro de yeso y enlucido a la llana, sobre mampostería o revoque grueso. Deja una superficie muy lisa, lista para pintar. Solo para locales secos.",
      [("Espesor total", "≈ 1,2 cm"), ("Uso", "interiores secos"), ("Aristas", "con guardacanto")],
      [("Yeso para jaharro", "9 kg"), ("Yeso fino para enlucido", "2 kg"), ("Guardacanto (por ml de arista)", "s/ obra")],
      [("Yesero + ayudante", "15–20 m²/jornada")],
      ["No aplicar en baños, cocinas ni muros con humedad.", "Esperar el secado completo antes de pintar."])

    t("Yesería", "YES-CIE", "Cielorraso aplicado de yeso bajo losa", "m²", cielo_aplicado(),
      "Cielorraso de yeso aplicado directamente bajo la losa de hormigón: puente de adherencia, jaharro de yeso y enlucido a la llana. Superficie continua, sin estructura.",
      [("Espesor", "≈ 1–1,5 cm"), ("Base", "losa limpia, sin desmoldante"), ("Andamio", "requerido")],
      [("Puente de adherencia", "0,20 l"), ("Yeso para jaharro", "10 kg"), ("Yeso fino para enlucido", "2 kg")],
      [("Yesero + ayudante", "12–15 m²/jornada")],
      ["Picar o tratar la losa si está muy lisa.", "Prever cajas de luz antes de aplicar."])

    t("Pisos y revestimientos", "PIS-ZOC", "Zócalo cerámico o de porcellanato", "ml", zocalo(),
      "Colocación de zócalo cerámico o de porcellanato cortado del mismo piso, pegado con adhesivo sobre el revoque, con junta tomada con pastina.",
      [("Altura", "7–10 cm"), ("Desperdicio", "≈ 5 %"), ("Junta con el piso", "2–3 mm")],
      [("Zócalo cerámico", "1,05 ml"), ("Adhesivo cementicio", "0,4 kg"), ("Pastina", "0,03 kg")],
      [("Oficial", "25–35 ml/jornada")],
      ["Colocar después del piso, alineado con sus juntas.", "Inglete o pieza esquinera en los ángulos."],
      corte="Corte. Esquema ilustrativo, sin escala.")

    t("Cubiertas e impermeabilizaciones", "IMP-BAÑ", "Impermeabilización de piso de baño con cementicio", "m²", imp_banio(),
      "Impermeabilizante cementicio bicomponente aplicado sobre la carpeta del baño antes del piso, con subida en los muros y refuerzo con banda o malla en los encuentros piso-muro y en los pasos de cañerías.",
      [("Subida en muros", "≥ 20 cm (en ducha ≥ 1,80 m)"), ("Manos", "2, cruzadas"), ("Base", "carpeta sana y húmeda")],
      [("Impermeabilizante cementicio bicomponente", "2 kg"), ("Banda / malla de refuerzo", "0,30 ml"), ("Pincel / llana (prorrateo)", "s/ obra")],
      [("Oficial", "25–30 m²/jornada")],
      ["Reforzar especialmente rejillas y bocas de desagüe.", "Prueba de estanqueidad 24 h antes de colocar el piso."])

    t("Instalación de gas", "GAS-CAÑ", "Cañería de gas natural embutida", "ml", gas(),
      "Tendido de cañería interna de gas natural con material aprobado (acero con revestimiento epoxi o sistema de termofusión aprobado), desde el medidor hasta cada artefacto, con llave de paso por artefacto. La ejecuta un gasista matriculado.",
      [("Normativa", "NAG-200 y distribuidora"), ("Prueba de hermeticidad", "antes de tapar"), ("Ejecuta", "gasista matriculado")],
      [("Caño aprobado (diámetro según cálculo)", "1,05 ml"), ("Accesorios (prorrateo)", "0,4 un"), ("Grapas", "1 un"), ("Llaves de paso", "s/ artefactos")],
      [("Gasista + ayudante", "6–10 ml/jornada")],
      ["Respetar ventilaciones y rejillas de los locales.", "Planos y trámite ante la distribuidora."],
      corte="Elevación esquemática. Sin escala.")

    t("Instalación eléctrica", "ELE-TAB", "Tablero seccional con protecciones", "un", tablero(),
      "Tablero embutido o exterior con disyuntor diferencial de 30 mA, interruptores termomagnéticos por circuito, barra de tierra y espacio de reserva.",
      [("Diferencial", "30 mA"), ("Circuitos mínimos", "según grado de electrificación"), ("Norma", "AEA 90364")],
      [("Gabinete 12 módulos", "1 un"), ("Disyuntor diferencial 2×40 A 30 mA", "1 un"), ("Interruptor termomagnético", "4 un"), ("Barra de tierra + borneras", "1 un"), ("Peines y cable de conexión", "2 ml")],
      [("Electricista + ayudante", "1 tablero/jornada")],
      ["Rotular cada circuito.", "Medir la resistencia de puesta a tierra."],
      corte="Vista frontal. Esquema ilustrativo.")

    t("Carpinterías", "CAR-ALU", "Colocación de ventana de aluminio con premarco", "un", ventana_alu(),
      "Colocación de ventana de aluminio sobre premarco amurado o atornillado al vano, con espuma de poliuretano en el perímetro y sellado exterior con sellador neutro.",
      [("Holgura premarco–vano", "5–10 mm"), ("Sellado", "exterior, continuo"), ("Alféizar", "con pendiente y goterón")],
      [("Premarco de aluminio", "1 un"), ("Tornillos + tarugos", "8 un"), ("Espuma de poliuretano", "0,3 lata"), ("Sellador neutro", "0,5 cartucho")],
      [("Oficial + ayudante", "3–4 ventanas/jornada")],
      ["Verificar escuadra y plomo del premarco antes de fijar.", "No usar silicona acética sobre aluminio."],
      corte="Elevación. Esquema ilustrativo, sin escala.")

    t("Pintura", "PIN-EXT", "Pintura látex acrílico exterior", "m²", pintura_ext(),
      "Pintura de fachadas y muros exteriores: limpieza, fijador, tratamiento de fisuras con enduido exterior y dos o tres manos de látex acrílico para exteriores.",
      [("Manos", "2–3"), ("Rendimiento (por mano)", "≈ 8–10 m²/l"), ("Condiciones", "sin lluvia, 10–30 °C")],
      [("Fijador", "0,12 l"), ("Enduido exterior", "0,10 kg"), ("Látex acrílico exterior", "0,30 l")],
      [("Pintor", "25–30 m²/jornada (sin andamio)")],
      ["Lavar y eliminar hongos antes de pintar.", "Andamio o silleta según altura."])

    t("Pintura", "PIN-ESM", "Esmalte sintético sobre carpintería metálica", "m²", esmalte(),
      "Pintura de carpinterías, rejas y barandas metálicas: desengrase, lijado, fondo antióxido y dos manos de esmalte sintético.",
      [("Manos", "antióxido + 2 de esmalte"), ("Rendimiento esmalte (por mano)", "≈ 12–14 m²/l"), ("Medición", "superficie desarrollada")],
      [("Antióxido", "0,10 l"), ("Esmalte sintético", "0,15 l"), ("Aguarrás / thinner", "0,05 l"), ("Lijas (prorrateo)", "s/ obra")],
      [("Pintor", "15–20 m²/jornada")],
      ["Quitar todo el óxido suelto antes del fondo.", "En rejas, medir 2 caras × superficie aparente × coef. 0,7–1."],
      corte="Corte de capas. Esquema ilustrativo.")
