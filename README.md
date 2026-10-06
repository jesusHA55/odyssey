# Planificador de rutas urbanas con LLM

Aplicación web que genera un itinerario optimizado por ciudad a partir de:

- hora y lugar de inicio,
- hora y lugar de fin,
- ubicaciones clave obligatorias,
- número de comidas y horario de cada una.

El backend geocodifica las ubicaciones, pide recomendaciones al LLM, calcula tiempos
de desplazamiento y monta una línea temporal realista respetando la ventana horaria.

## Estructura

