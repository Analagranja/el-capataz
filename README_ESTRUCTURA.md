# Estructura del Proyecto

Esta es una estructura base organizada para implementar tus diseños de Figma.

## Estructura de Carpetas

```
src/
├── components/
│   ├── ui/              # Componentes reutilizables (Button, Input, Card)
│   └── layout/          # Componentes de layout (Header, Footer, Layout)
├── pages/               # Páginas de la aplicación
├── hooks/               # Custom hooks de React
├── utils/               # Funciones utilitarias
└── types/               # Definiciones de TypeScript
```

## Componentes Disponibles

### UI Components
- **Button**: Botón con variantes (primary, secondary, outline, ghost) y tamaños (sm, md, lg)
- **Input**: Input con label, error y helper text
- **Card**: Tarjeta con padding configurable y efecto hover

### Layout Components
- **Header**: Cabecera con navegación responsive
- **Footer**: Pie de página con información
- **Layout**: Contenedor principal que incluye Header y Footer

## Cómo Usar

1. **Añadir nuevas páginas**: Crea archivos en `src/pages/`
2. **Crear componentes**: Añade componentes reutilizables en `src/components/ui/`
3. **Estilos personalizados**: Edita `tailwind.config.js` para colores y estilos de tu marca
4. **Tipos TypeScript**: Define interfaces en `src/types/`

## Personalización

### Colores
Edita `tailwind.config.js` para añadir tu paleta de colores:

```js
theme: {
  extend: {
    colors: {
      'brand-primary': '#tu-color',
      'brand-secondary': '#tu-color',
    }
  }
}
```

### Componentes
Cada componente está diseñado para ser modificado. Cambia estilos, añade props o ajusta la funcionalidad según tus diseños.

## Próximos Pasos

1. Reemplaza los textos placeholder con tu contenido
2. Ajusta los colores según tu marca
3. Añade más páginas según necesites
4. Implementa tus diseños de Figma en los componentes existentes
