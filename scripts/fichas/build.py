import re, json, html, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dibujos as D
from svgkit import DEFS

old_svgs = json.load(open(os.path.join(HERE, "svgs_v1.json"), encoding="utf-8"))
assert len(old_svgs) == 3

REF = "Valores de referencia de práctica habitual en AMBA. Ajustar al proyecto, al proveedor y al estudio de suelos o cálculo cuando corresponda."
DUR = "Valores de referencia según Manual Técnico Durlock (tomos 2, 3 y 4). Verificar con el fabricante del sistema utilizado."

T = []
def t(gremio, cod, titulo, unidad, svg, desc, datos, consumos, mo, notas, fuente=REF, corte="Corte. Esquema ilustrativo, sin escala."):
    T.append(dict(gremio=gremio, codigo=cod, titulo=titulo, unidad=unidad, svg=svg, descripcion=desc,
                  datos_tecnicos=datos, consumos=consumos, mano_de_obra=mo, notas=notas, fuente=fuente, pie=corte))

# ---------------- DEMOLICIONES ----------------
t("Demoliciones", "DEM-MAM", "Demolición de mampostería con retiro de escombros", "m³", D.demolicion(),
  "Demolición manual de muros de ladrillo, con carga del escombro en volquete y retiro. Antes de demoler hay que verificar que el muro no sea portante y cortar las instalaciones que pasan por él.",
  [("Esponjamiento del escombro", "≈ 30 %"), ("Volquete habitual", "5–6 m³"), ("Peso mampostería común", "≈ 1.600 kg/m³")],
  [("Volquete (por m³ demolido)", "0,25 un"), ("Bolsas de escombro / lona", "s/ obra")],
  [("Peón (demolición + carga)", "1,5–2,0 m³/jornada")],
  ["Apuntalar dinteles y losas antes de retirar apoyos.", "Regar para evitar polvo; proteger pisos y aberturas existentes."],
  corte="Elevación. Esquema ilustrativo, sin escala.")

# ---------------- MOVIMIENTO DE SUELOS ----------------
t("Movimiento de suelos", "MS-EXC", "Excavación manual de zanjas para cimientos", "m³", D.excavacion(),
  "Excavación a mano de zanjas para cimientos corridos o vigas de fundación, con perfilado de paredes y fondo. La profundidad y el ancho salen del estudio de suelos y del cálculo estructural.",
  [("Esponjamiento del suelo", "≈ 25 %"), ("Ancho habitual", "0,40–0,60 m"), ("Fondo", "limpio, nivelado, sin agua")],
  [("Sin materiales (solo retiro de suelo sobrante)", "—")],
  [("Peón, suelo tipo AMBA", "2,5–4,0 m³/jornada")],
  ["Con napas o paredes inestables, entibar o bombear.", "No dejar la zanja abierta muchos días antes de hormigonar."])

# ---------------- HORMIGÓN ARMADO ----------------
t("Hormigón armado", "HA-ZAP", "Zapata corrida de hormigón armado H-21", "m³", D.zapata(),
  "Cimiento corrido de hormigón armado bajo muros portantes, con hormigón de limpieza en el fondo. Las dimensiones y la armadura las define el cálculo estructural; los valores de esta ficha son orientativos para presupuesto.",
  [("Resistencia del hormigón", "H-21 (21 MPa)"), ("Recubrimiento mínimo", "5 cm (contacto con suelo)"), ("Cuantía orientativa de acero", "40–70 kg/m³")],
  [("Hormigón elaborado H-21", "1,05 m³"), ("Acero ADN 420 (barras + estribos)", "55 kg"), ("Alambre de atar", "1 kg"), ("Hormigón de limpieza (por m³ de zapata)", "0,15 m³")],
  [("Oficial + ayudante (armado + hormigonado)", "1,5–2,0 m³/jornada")],
  ["Separadores para respetar el recubrimiento.", "Vibrar o varillar; curado húmedo al menos 7 días."])

t("Hormigón armado", "HA-LOS", "Losa de viguetas pretensadas y ladrillo cerámico", "m²", D.losa(),
  "Losa alivianada con viguetas pretensadas, bloques cerámicos entre viguetas y capa de compresión de hormigón con malla. Es la solución más usada en vivienda por su rapidez y bajo encofrado. El tipo de vigueta sale de la tabla del fabricante según luz y sobrecarga.",
  [("Espesor total habitual", "12 + 5 = 17 cm"), ("Separación de viguetas", "≈ 0,50 m"), ("Luz máxima", "según fabricante (≈ 5–6 m sin apuntalar intermedio)")],
  [("Vigueta pretensada", "2,00 ml"), ("Bloque cerámico 12×42×25", "8 un"), ("Hormigón H-21 (capa de compresión y nervios)", "0,065 m³"), ("Malla electrosoldada Q-188", "1,10 m²"), ("Puntales y tablas (alquiler)", "s/ obra")],
  [("Oficial + ayudante", "15–20 m²/jornada")],
  ["Apuntalar según tabla del fabricante (en general cada 1,50 m).", "Mojar los bloques antes de hormigonar."])

# ---------------- MAMPOSTERÍA ----------------
t("Mampostería", "MAM-CAP", "Capa aisladora horizontal doble con cajón", "ml", D.capa_aisladora(),
  "Barrera contra la humedad ascendente en el arranque de los muros: dos capas horizontales de concreto hidrófugo unidas por capas verticales en ambas caras (cajón), por encima y por debajo del nivel de piso interior.",
  [("Mortero", "cemento : arena 1 : 3 + hidrófugo"), ("Espesor de cada capa", "≈ 2 cm"), ("Para muro de", "0,15–0,20 m")],
  [("Cemento", "6 kg"), ("Arena", "0,015 m³"), ("Hidrófugo inorgánico", "0,6 kg"), ("Pintura asfáltica (sobre capa)", "0,15 l")],
  [("Oficial + ayudante", "8–10 ml/jornada")],
  ["Continuidad total: sin cortes en esquinas ni en vanos de puertas.", "Las verticales deben unirse con las horizontales."])

t("Mampostería", "MAM-COM15", "Muro de ladrillo común de 0,15 m", "m²", D.ladrillo_comun(),
  "Muro de ladrillos comunes macizos asentados con mortero de cal reforzado, en aparejo trabado. Muy usado en medianeras, muros de carga de baja altura y tabiques que necesitan masa.",
  [("Espesor sin revoque", "0,15 m"), ("Peso aproximado", "≈ 240 kg/m²"), ("Mortero", "MHR 1/4 : 1 : 4 (cemento : cal : arena)")],
  [("Ladrillo común", "60 un"), ("Mortero de asiento", "0,045 m³"), ("  · cemento", "3 kg"), ("  · cal hidráulica", "7 kg"), ("  · arena", "0,05 m³")],
  [("Oficial + ayudante", "7–9 m²/jornada")],
  ["Mojar los ladrillos antes de asentar.", "Trabar con muros transversales; colocar dinteles en vanos."],
  corte="Elevación y corte. Esquema ilustrativo, sin escala.")

t("Mampostería", "MAM-HUE12", "Muro de ladrillo cerámico hueco 12 × 18 × 33", "m²", D.ladrillo_hueco(),
  "Tabique o muro de cerramiento de ladrillos cerámicos huecos no portantes. Es liviano y rápido de levantar; se usa en divisiones interiores y en cerramientos dentro de estructura de hormigón.",
  [("Espesor sin revoque", "0,12 m"), ("Peso aproximado", "≈ 90 kg/m²"), ("Uso", "no portante")],
  [("Ladrillo cerámico hueco 12×18×33", "15,5 un"), ("Mortero de asiento", "0,012 m³"), ("  · cemento", "1 kg"), ("  · cal hidráulica", "2 kg"), ("  · arena", "0,013 m³")],
  [("Oficial + ayudante", "12–15 m²/jornada")],
  ["Anclar a columnas con hierros cada 3–4 hiladas.", "Encadenado superior si el muro es alto o largo."],
  corte="Elevación y corte. Esquema ilustrativo, sin escala.")

# ---------------- REVOQUES ----------------
t("Revoques", "REV-INT", "Revoque grueso y fino a la cal interior", "m²", D.revoque_int(),
  "Revoque interior tradicional en dos capas: grueso a la cal reforzado, fratasado, y terminación con fino a la cal (o premezcla) fieltrado, listo para pintar.",
  [("Espesor total", "≈ 2 cm"), ("Grueso", "MHR 1/4 : 1 : 4"), ("Fino", "premezcla o 1/8 : 1 : 3")],
  [("Mortero grueso", "0,018 m³"), ("  · cemento", "1,2 kg"), ("  · cal hidráulica", "3 kg"), ("  · arena", "0,02 m³"), ("Revoque fino premezcla", "3,5 kg")],
  [("Oficial + ayudante (grueso + fino)", "10–12 m²/jornada")],
  ["Colocar guías y fajas para controlar plomo y espesor.", "Esperar el fraguado del grueso antes del fino."])

t("Revoques", "REV-EXT", "Revoque exterior completo (azotado, grueso y fino)", "m²", D.revoque_ext(),
  "Revoque exterior en tres capas: azotado de concreto hidrófugo sobre el muro, revoque grueso y terminación con fino exterior. El azotado es la barrera contra la lluvia; no debe interrumpirse.",
  [("Espesor total", "≈ 2,5 cm"), ("Azotado", "cemento : arena 1 : 3 + hidrófugo"), ("Fino", "premezcla exterior")],
  [("Azotado hidrófugo", "0,006 m³"), ("  · cemento", "2,6 kg"), ("  · hidrófugo", "0,2 kg"), ("Mortero grueso", "0,016 m³"), ("Revoque fino exterior premezcla", "4 kg")],
  [("Oficial + ayudante", "8–10 m²/jornada (sin andamio)")],
  ["Aplicar el grueso sobre el azotado todavía fresco.", "Prever andamio y buñas o juntas en paños grandes."])

# ---------------- CONTRAPISOS Y CARPETAS ----------------
t("Contrapisos y carpetas", "PIS-CON", "Contrapiso de hormigón pobre sobre terreno", "m²", D.contrapiso(),
  "Base de hormigón de cascote sobre terreno compactado, con film de polietileno como barrera de humedad. Recibe la carpeta y el piso.",
  [("Espesor", "10–12 cm"), ("Dosaje", "1/4 : 1 : 4 : 8 (cemento : cal : arena : cascote)"), ("Barrera", "polietileno 200 µm")],
  [("Hormigón pobre", "0,105 m³"), ("  · cemento", "4,2 kg"), ("  · cal hidráulica", "9,5 kg"), ("  · arena", "0,042 m³"), ("  · cascote", "0,085 m³"), ("Film de polietileno 200 µm", "1,10 m²")],
  [("Oficial + ayudante", "15–20 m²/jornada")],
  ["Compactar el terreno y retirar la capa vegetal.", "Dejar juntas de dilatación en paños de más de 25 m²."])

t("Contrapisos y carpetas", "PIS-CAR", "Carpeta de nivelación de cemento", "m²", D.carpeta(),
  "Capa de mortero de cemento fratasado sobre el contrapiso para dejar una superficie plana y a nivel (o con la pendiente de proyecto) donde pegar el piso.",
  [("Espesor", "≈ 2 cm"), ("Dosaje", "cemento : arena 1 : 3"), ("Tolerancia", "± 3 mm en 2 m")],
  [("Mortero 1:3", "0,021 m³"), ("  · cemento", "9 kg"), ("  · arena", "0,023 m³"), ("Hidrófugo (en locales húmedos)", "0,5 kg")],
  [("Oficial + ayudante", "20–25 m²/jornada")],
  ["Humedecer el contrapiso antes de aplicar.", "Curado húmedo 3 días antes de pegar el piso."])

# ---------------- PISOS Y REVESTIMIENTOS ----------------
t("Pisos y revestimientos", "PIS-CER", "Piso cerámico o porcellanato pegado", "m²", D.piso_ceramico(),
  "Colocación de piezas cerámicas o de porcellanato con adhesivo cementicio sobre carpeta, con junta tomada con pastina. Para porcellanato usar adhesivo específico y doble encolado en piezas grandes.",
  [("Junta", "2–3 mm"), ("Desperdicio", "5–10 % (más en diagonal)"), ("Adhesivo", "llana dentada 8–10 mm")],
  [("Cerámico / porcellanato", "1,08 m²"), ("Adhesivo cementicio", "5 kg"), ("Pastina", "0,3 kg"), ("Crucetas / niveladores", "s/ formato")],
  [("Oficial + ayudante", "10–15 m²/jornada")],
  ["Replantear desde el centro o desde la puerta de acceso.", "No pisar ni tomar juntas antes de 24 h."])

t("Pisos y revestimientos", "REV-CER", "Revestimiento cerámico en muros", "m²", D.revestimiento_ceramico(),
  "Revestimiento de paredes de baños y cocinas con piezas cerámicas pegadas con adhesivo sobre revoque grueso fratasado. Las esquinas salientes se terminan con guardacantos.",
  [("Base", "revoque grueso fratasado, a plomo"), ("Junta", "2 mm"), ("Desperdicio", "≈ 8 %")],
  [("Cerámico de pared", "1,08 m²"), ("Adhesivo cementicio", "4,5 kg"), ("Pastina", "0,25 kg"), ("Guardacanto (por ml de arista)", "s/ obra")],
  [("Oficial + ayudante", "8–10 m²/jornada")],
  ["Arrancar con regla nivelada a la altura de la segunda hilada.", "Dejar resueltas las bocas de agua antes de revestir."])

# ---------------- CONSTRUCCIÓN EN SECO (fichas v1) ----------------
t("Construcción en seco", "CS-TAB-70-1x12", "Tabique de placa de yeso — estructura 70, simple placa 12,5 mm por cara", "m²", old_svgs[0],
  "Tabique interior no portante de perfiles de acero galvanizado (solera 70 y montante 69 cada 0,40 m) con una placa de yeso de 12,5 mm atornillada en cada cara y aislación de lana en el interior. Para divisiones en ambientes secos; en baños y cocinas va con placa resistente a la humedad.",
  [("Espesor final", "95 mm"), ("Peso aproximado", "22 kg/m²"), ("Altura máxima (montantes c/0,40 / c/0,48)", "4,00 / 3,75 m"), ("Aislación acústica Rw (sin / con lana 70 mm)", "37 / 45 dB"), ("Resistencia al fuego", "F30")],
  [("Placa de yeso 12,5 mm", "2,10 m²"), ("Solera 70 / Montante 69", "1,00 / 3,00 ml"), ("Tornillos T1 / T2", "10 / 30 u"), ("Fijaciones (tarugo + tornillo)", "3,5 u"), ("Cinta de papel / Masilla", "3,30 ml / 1,80 kg"), ("Lana de vidrio", "1,05 m²")],
  [("Oficial + ayudante", "15–20 m²/jornada")],
  ["Placa separada 15 mm del piso; juntas trabadas entre caras.", "Prever refuerzos para alacenas, mesadas y marcos antes de emplacar."],
  fuente=DUR, corte="Corte horizontal. Esquema ilustrativo, sin escala.")

t("Construcción en seco", "CS-CIE-JT-12", "Cielorraso suspendido de placa de yeso junta tomada — estructura 35", "m²", old_svgs[1],
  "Cielorraso suspendido con estructura de soleras y montantes de 35 mm (montantes cada 0,40 m, vigas maestras cada 1,20 m, velas rígidas ancladas a la losa) y placa de yeso de 12,5 mm con juntas tomadas con cinta y masilla. Superficie continua, lista para pintar.",
  [("Peso aproximado", "11,5 kg/m²"), ("Separación de montantes / vigas maestras", "0,40 / 1,20 m"), ("Velas rígidas", "c/1,00 m máx."), ("Juntas de trabajo", "c/10 m máx.")],
  [("Placa de yeso 12,5 mm", "1,05 m²"), ("Solera 35 / Montante 34", "1,10 / 3,20 ml"), ("Tornillos T1 / T2", "16 / 18 u"), ("Fijaciones a losa", "6 u"), ("Cinta de papel / Masilla", "1,65 ml / 0,90 kg")],
  [("Oficial + ayudante", "20–25 m²/jornada")],
  ["Nivelar con láser antes de fijar la solera perimetral.", "Prever tapas de inspección y refuerzos para artefactos de iluminación."],
  fuente=DUR, corte="Corte vertical. Esquema ilustrativo, sin escala.")

t("Construcción en seco", "CS-REV-OM-12", "Revestimiento de placa de yeso sobre perfiles Omega", "m²", old_svgs[2],
  "Revestimiento de muros existentes con placa de yeso de 12,5 mm atornillada a perfiles Omega fijados al muro cada 0,40 m. Corrige plomos menores y deja una superficie lisa para pintar con poco espesor.",
  [("Espesor agregado", "≈ 25 mm"), ("Peso aproximado", "11,4 kg/m²"), ("Separación de perfiles", "0,40 m")],
  [("Placa de yeso 12,5 mm", "1,05 m²"), ("Perfil Omega", "3,00 ml"), ("Tornillos T2", "15 u"), ("Fijaciones (tarugo + tornillo)", "8 u"), ("Cinta de papel / Masilla", "1,65 ml / 0,90 kg")],
  [("Oficial + ayudante", "20–25 m²/jornada")],
  ["No apto sobre muros con humedad sin resolver la causa primero.", "En locales húmedos, usar placa resistente a la humedad."],
  fuente=DUR, corte="Corte horizontal. Esquema ilustrativo, sin escala.")

# ---------------- CUBIERTAS ----------------
t("Cubiertas e impermeabilizaciones", "CUB-CHA", "Cubierta de chapa sobre correas metálicas", "m²", D.cubierta_chapa(),
  "Techo liviano de chapa de acero prepintada o cincalum fijada con tornillos autoperforantes a correas C, con aislación térmica y barrera de vapor debajo. Las correas y su separación salen del cálculo según luz y viento.",
  [("Pendiente mínima", "≈ 10 % (según perfil de chapa)"), ("Solape lateral / longitudinal", "1 onda / 20 cm"), ("Separación de correas", "≈ 1,00 m")],
  [("Chapa C-25", "1,15 m²"), ("Tornillos autoperforantes con arandela", "6 un"), ("Aislante con foil de aluminio", "1,10 m²"), ("Correa C 100 (por m² de cubierta)", "1,00 ml")],
  [("Oficial + ayudante (sin estructura principal)", "20–25 m²/jornada")],
  ["Fijar en la cresta de la onda, nunca en el valle.", "Trabajo en altura: arnés y línea de vida."])

t("Cubiertas e impermeabilizaciones", "CUB-MEM", "Impermeabilización de azotea con membrana asfáltica", "m²", D.membrana(),
  "Membrana asfáltica de 4 mm con terminación de aluminio, soldada a soplete sobre carpeta imprimada, con solapes de al menos 10 cm y babetas en los parapetos.",
  [("Pendiente mínima de la carpeta", "≈ 2 %"), ("Solape", "≥ 10 cm"), ("Babeta", "≥ 20 cm sobre nivel de azotea")],
  [("Membrana asfáltica 4 mm con aluminio", "1,15 m²"), ("Imprimación asfáltica", "0,30 l"), ("Gas envasado (soplete)", "s/ obra")],
  [("Oficial + ayudante", "25–35 m²/jornada")],
  ["Carpeta seca y limpia; no trabajar con lluvia o rocío.", "Resolver embudos y babetas antes de los paños."])

# ---------------- INSTALACIÓN SANITARIA ----------------
t("Instalación sanitaria", "SAN-CLO", "Cañería cloacal de PVC 110 enterrada", "ml", D.cloaca(),
  "Tendido de cañería cloacal principal de PVC de 110 mm con junta elástica, en zanja con lecho y recubrimiento de arena, hasta cámara de inspección. Incluye la zanja liviana; las cámaras se presupuestan aparte.",
  [("Pendiente", "1:20 a 1:60"), ("Tapada mínima", "≈ 0,30 m"), ("Material", "PVC 3,2 mm con junta elástica")],
  [("Caño PVC 110", "1,05 ml"), ("Accesorios (prorrateo)", "0,3 un"), ("Arena para lecho y recubrimiento", "0,05 m³"), ("Lubricante para juntas", "s/ obra")],
  [("Plomero + ayudante", "8–12 ml/jornada")],
  ["Prueba hidráulica antes de tapar.", "Cámaras en cambios de dirección y cada 30 m como máximo."],
  corte="Corte longitudinal. Esquema ilustrativo, sin escala.")

t("Instalación sanitaria", "SAN-AGU", "Boca de agua fría y caliente en termofusión", "un", D.agua(),
  "Alimentación de un artefacto (lavatorio, pileta, ducha) con agua fría y caliente en polipropileno por termofusión, embutida en muro, desde el ramal hasta la conexión de la grifería.",
  [("Material", "PPR termofusión 20–25 mm"), ("Presión de prueba", "≈ 1,5 veces la de servicio"), ("Alturas", "según artefacto y grifería")],
  [("Caño PPR 20 mm (fría + caliente)", "6 ml"), ("Codos, tees y uniones", "6 un"), ("Llave de paso (prorrateo)", "0,5 un"), ("Tapones de prueba", "2 un")],
  [("Plomero + ayudante", "3–4 bocas/jornada")],
  ["Aislar la cañería de agua caliente.", "Prueba de presión antes de revocar o revestir."],
  corte="Elevación. Esquema ilustrativo, sin escala.")

# ---------------- INSTALACIÓN ELÉCTRICA ----------------
t("Instalación eléctrica", "ELE-BOC", "Boca de electricidad embutida (toma o punto)", "un", D.electricidad(),
  "Boca completa embutida: caño corrugado ignífugo, caja, conductores unipolares (fase, neutro y tierra) y módulo con tapa. La cantidad de bocas por ambiente sigue la reglamentación AEA 90364.",
  [("Conductor tomas / iluminación", "2,5 / 1,5 mm²"), ("Altura de tomas / llaves", "0,30 / 1,10 m"), ("Norma", "AEA 90364")],
  [("Caño corrugado ignífugo 3/4\"", "5 ml"), ("Conductor unipolar (3 cables)", "16 ml"), ("Caja rectangular u octogonal", "1 un"), ("Módulo + bastidor + tapa", "1 un")],
  [("Electricista + ayudante", "6–8 bocas/jornada")],
  ["Respetar colores: marrón fase, celeste neutro, verde-amarillo tierra.", "Medir aislación y continuidad de tierra al terminar."],
  corte="Elevación. Esquema ilustrativo, sin escala.")

# ---------------- CARPINTERÍAS ----------------
t("Carpinterías", "CAR-MAR", "Colocación de marco de puerta de chapa en mampostería", "un", D.marco(),
  "Amurado de marco de chapa doblada para puerta, aplomado y escuadrado, con grapas empotradas en el muro y relleno de mortero. La hoja se coloca después de los revoques.",
  [("Grapas", "3 por lado"), ("Tolerancia de plomo", "± 2 mm"), ("Relleno", "mortero de cemento 1:3")],
  [("Mortero 1:3 (relleno)", "0,015 m³"), ("Cuñas y travesaño provisorio", "s/ obra")],
  [("Oficial + ayudante", "4–6 marcos/jornada")],
  ["Rellenar el marco con mortero para que no suene hueco.", "Proteger con cinta hasta la pintura."],
  corte="Elevación. Esquema ilustrativo, sin escala.")

# ---------------- PINTURA ----------------
t("Pintura", "PIN-LAT", "Pintura látex interior sobre revoque", "m²", D.pintura(),
  "Pintura de muros interiores sobre revoque fino seco: fijador sellador, enduido en las zonas que lo necesiten con lijado, y dos manos de látex interior.",
  [("Manos de terminación", "2"), ("Rendimiento látex (por mano)", "≈ 8–10 m²/l"), ("Secado entre manos", "≈ 4 h")],
  [("Fijador sellador", "0,10 l"), ("Enduido plástico", "0,15 kg"), ("Látex interior", "0,25 l"), ("Lijas, cinta, rodillos (prorrateo)", "s/ obra")],
  [("Pintor", "30–40 m²/jornada (dos manos)")],
  ["El revoque nuevo debe estar seco (≈ 28 días).", "Tapar pisos y aberturas antes de empezar."])

import batch2
batch2.add(t)
import batch3
batch3.add(t)
ORDEN = ["Demoliciones","Movimiento de suelos","Hormigón armado","Mampostería","Revoques","Yesería","Contrapisos y carpetas","Pisos y revestimientos","Construcción en seco","Cubiertas e impermeabilizaciones","Instalación sanitaria","Instalación de gas","Instalación eléctrica","Carpinterías","Equipamiento","Pintura","Exteriores"]
T.sort(key=lambda x: ORDEN.index(x["gremio"]))
json.dump([{k: v for k, v in x.items() if k not in ("svg", "pie")} | {"esquema_svg": x["svg"]} for x in T],
          open(os.path.join(HERE, "fichas_catalogo.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------------- HTML ----------------
gremios = []
for x in T:
    if x["gremio"] not in gremios:
        gremios.append(x["gremio"])
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower().translate(str.maketrans("áéíóúñ", "aeioun"))).strip("-")

def rows(pairs):
    return "".join(f"<tr><td>{html.escape(a)}</td><td>{html.escape(b)}</td></tr>" for a, b in pairs)

cards = []
for g in gremios:
    cards.append(f'<h2 class="gremio" id="{slug(g)}">{g}</h2>')
    for x in [y for y in T if y["gremio"] == g]:
        cards.append(f'''<article class="ficha" data-g="{slug(g)}">
  <div class="head"><div><h3 class="tt">{html.escape(x["titulo"])}</h3><div class="rubro">Gremio: {g} · Unidad: {x["unidad"]}</div></div><span class="cod">{x["codigo"]}</span></div>
  <div class="body">
    <figure class="fig">{x["svg"]}<figcaption>{x["pie"]}</figcaption></figure>
    <div class="info"><p>{html.escape(x["descripcion"])}</p>
      <h4>Datos técnicos</h4><table>{rows(x["datos_tecnicos"])}</table>
      <h4>Consumo por {x["unidad"]}</h4><table>{rows(x["consumos"])}</table>
      <h4>Mano de obra</h4><table>{rows(x["mano_de_obra"])}</table>
      <h4>Notas de ejecución</h4><ul>{"".join(f"<li>{html.escape(n)}</li>" for n in x["notas"])}</ul>
    </div>
  </div>
  <div class="fuente">{x["fuente"]}</div>
</article>''')

nav = "".join(f'<a href="#{slug(g)}">{g} <span>{sum(1 for y in T if y["gremio"]==g)}</span></a>' for g in gremios)

page = f'''<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ObraFlow — Fichas técnicas de tareas (prototipo)</title>
<style>
:root{{--ink:#1f2328;--muted:#5b6470;--line:#d9dde2;--bg:#f6f7f8;--card:#fff;--accent:#1d4e89;--soft:#eef3f9;--placa:#f3efe6;--placa-s:#8a8170;--acero:#7b8794;--lana:#f2d7a6;--muro:#c9c4bb;--hormigon:#bfc3c7}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}}
header{{max-width:1080px;margin:0 auto;padding:28px 20px 6px}}
header h1{{font-size:22px;margin:0 0 4px}} header p{{margin:0;color:var(--muted)}}
nav{{position:sticky;top:0;z-index:5;background:rgba(246,247,248,.96);border-bottom:1px solid var(--line)}}
nav div{{max-width:1080px;margin:0 auto;padding:10px 20px;display:flex;gap:6px;flex-wrap:wrap}}
nav a{{font-size:12.5px;color:var(--ink);text-decoration:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 10px}}
nav a span{{color:var(--muted)}} nav a:hover{{border-color:var(--accent);color:var(--accent)}}
main{{max-width:1080px;margin:0 auto;padding:6px 20px 48px;display:grid;gap:22px}}
h2.gremio{{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:22px 0 -8px;scroll-margin-top:70px}}
.ficha{{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}}
.head{{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)}}
.tt{{font-size:18px;margin:0}}
.cod{{font:600 12px/1 ui-monospace,Consolas,monospace;color:var(--accent);background:var(--soft);padding:5px 8px;border-radius:5px;white-space:nowrap}}
.rubro{{color:var(--muted);font-size:13px;margin-top:2px}}
.body{{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}}
.fig{{margin:0;padding:16px 20px;border-right:1px solid var(--line);background:#fbfbfa}}
.fig svg{{width:100%;height:auto;display:block}}
.fig figcaption{{font-size:12px;color:var(--muted);margin-top:6px}}
.info{{padding:16px 20px}} .info p{{margin:0 0 12px}}
h4{{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px}}
table{{width:100%;border-collapse:collapse;font-size:13.5px}}
td{{padding:5px 0;border-bottom:1px solid #eef0f2;vertical-align:top}}
td:last-child{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:12px}}
ul{{margin:0;padding-left:18px}} li{{margin:2px 0}}
.fuente{{font-size:12px;color:var(--muted);padding:10px 20px;border-top:1px solid var(--line);background:#fbfbfa}}
.lbl{{font:11px "Segoe UI",Arial,sans-serif;fill:#333}} .dim{{font:10.5px "Segoe UI",Arial,sans-serif;fill:#555}}
@media (max-width:820px){{.body{{grid-template-columns:1fr}}.fig{{border-right:0;border-bottom:1px solid var(--line)}}}}
</style></head><body>
{DEFS}
<header><h1>Fichas técnicas de tareas — catálogo maestro ObraFlow</h1>
<p>{len(T)} tareas frecuentes en {len(gremios)} gremios, en el orden de la obra. Esquema propio, descripción, datos técnicos, consumos y rendimiento de mano de obra.</p></header>
<nav><div>{nav}</div></nav>
<main>{"".join(cards)}</main></body></html>'''
if __name__ == "__main__":
    open(os.path.join(HERE, "fichas_preview.html"), "w", encoding="utf-8").write(page)
    print(len(T), "fichas,", len(gremios), "gremios")
