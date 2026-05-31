# Finanzas Personales

Proyecto local-first para control de finanzas personales con:

- login local con usuario y contraseña
- datos cifrados en el navegador
- tarjetas, gastos, pagos fijos y prestamos
- resumen quincenal o mensual
- respaldo exportable/importable
- modo PWA instalable

## Uso

Abre `index.html` con un servidor local o publícalo como sitio estatico.

Ejemplo rapido con Python:

```bash
python -m http.server 5173
```

## Nota de seguridad

Los datos no se suben a GitHub ni a ningun backend. Se guardan cifrados en el navegador con una contraseña maestra.
