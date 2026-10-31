# Panel de proyectos con portadas y vistas

## Objetivo
Que "Mis Proyectos" muestre cada obra con una imagen y se pueda ver de distintas formas.

## Alcance
- Portada por proyecto (`projects.cover_image`):
  - sin elegir, una de 10 fotos según el proyecto (siempre la misma);
  - elegir otra foto: casa, edificio de departamentos, obra en construcción, remodelación en curso, interior terminado, local comercial, nave industrial, frente de edificio, restauración de fachada, terreno. Son fotos de Unsplash (licencia libre) servidas desde su CDN; si una no carga, se muestra una ilustración de respaldo;
  - subir una foto (JPG, PNG o WebP): se achica a 1600 px y se guarda en el bucket privado `project-covers`, dentro de la carpeta de la empresa;
  - volver a la de por defecto (borra la foto subida).
- Vistas: Tarjetas, Galería, Lista y Por estado. Buscador por obra, cliente o dirección, filtro por estado con cantidades y orden (recientes, nombre, inicio, estado). La vista y el orden se recuerdan en el navegador.
- La portada también se ve en el proyecto activo de la barra lateral.
- Migración `064_project_cover_images.sql`: columna, bucket y políticas (ver: miembros de la empresa; subir, cambiar y borrar: owner, admin y editor).

## Fuera de alcance
- Galería de fotos de avance de obra.
