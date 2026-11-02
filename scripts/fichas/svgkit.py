"""Helpers para dibujar esquemas de fichas (viewBox 560x300)."""

def lbl(x, y, t, a="start"):
    return f'<text class="lbl" x="{x}" y="{y}" text-anchor="{a}">{t}</text>'

def lead(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#999" stroke-width=".8" fill="none"/>'

def note(px, py, tx, ty, t, a="start"):
    """Punto del dibujo -> rótulo. La línea termina un poco antes del texto."""
    ly = ty + 4 if ty > py else ty - 12
    lx = tx
    return lead(px, py, lx, ly if ty > py else ty + 4) + lbl(tx, ty, t, a)

def dimh(x1, x2, y, t, above=True):
    ty = y - 6 if above else y + 14
    return (f'<g stroke="#666" stroke-width="1"><line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}"/>'
            f'<line x1="{x1}" y1="{y-6}" x2="{x1}" y2="{y+6}"/><line x1="{x2}" y1="{y-6}" x2="{x2}" y2="{y+6}"/></g>'
            f'<text class="dim" x="{(x1+x2)/2}" y="{ty}" text-anchor="middle">{t}</text>')

def dimv(x, y1, y2, t, right=True):
    tx = x + 8 if right else x - 8
    a = "start" if right else "end"
    return (f'<g stroke="#666" stroke-width="1"><line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}"/>'
            f'<line x1="{x-6}" y1="{y1}" x2="{x+6}" y2="{y1}"/><line x1="{x-6}" y1="{y2}" x2="{x+6}" y2="{y2}"/></g>'
            f'<text class="dim" x="{tx}" y="{(y1+y2)/2+4}" text-anchor="{a}">{t}</text>')

def rect(x, y, w, h, fill, stroke="#777", sw=1, extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'

def svg(body, label):
    return f'<svg viewBox="0 0 590 300" role="img" aria-label="{label}">{body}</svg>'

DEFS = """<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="p-tierra" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#e2d5bf"/><path d="M2 4l4 4M10 2l3 3M6 12l4 3" stroke="#b9a684" stroke-width="1"/></pattern>
<pattern id="p-horm" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#c4c8cc"/><circle cx="3" cy="3" r="1.1" fill="#8f969c"/><circle cx="9" cy="8" r=".9" fill="#8f969c"/><path d="M7 2l2 1-1 2z" fill="#a3a9ae"/></pattern>
<pattern id="p-mamp" width="24" height="14" patternUnits="userSpaceOnUse"><rect width="24" height="14" fill="#d8a58a"/><path d="M0 0H24M0 7H24M12 0V7M0 7V14M24 7V14" stroke="#f1e6dc" stroke-width="1.4"/></pattern>
<pattern id="p-mort" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#e6e1d6"/><circle cx="2" cy="3" r=".6" fill="#a9a293"/><circle cx="7" cy="7" r=".6" fill="#a9a293"/></pattern>
<pattern id="p-casc" width="18" height="14" patternUnits="userSpaceOnUse"><rect width="18" height="14" fill="#ddd5c6"/><path d="M2 3l5 1-2 4zM11 8l5-1 1 4-4 1z" fill="#c98f74"/></pattern>
<pattern id="p-lana" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#f6e3bd"/><path d="M0 7 Q3.5 0 7 7 T14 7" fill="none" stroke="#d1a85e" stroke-width="1"/></pattern>
<pattern id="p-arena" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#efe3c4"/><circle cx="2" cy="2" r=".7" fill="#c7b17b"/><circle cx="6" cy="5" r=".7" fill="#c7b17b"/></pattern>
<pattern id="p-madera" width="20" height="8" patternUnits="userSpaceOnUse"><rect width="20" height="8" fill="#e8cfa4"/><path d="M0 4 Q5 2 10 4 T20 4" fill="none" stroke="#c49a5c" stroke-width=".8"/></pattern>
</defs></svg>"""
