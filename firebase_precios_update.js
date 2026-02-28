// ── Script para actualizar smile_config/precios en Firebase ──────────
// Ejecutar UNA VEZ desde la consola del browser en admin.html
// Abre admin.html → F12 → Console → pega esto y Enter

await db.collection('smile_config').doc('precios').set({
    base_clinica:      23,
    base_solo:         19,
    usuario_adicional: 2.5,
    modulos: {
        laboratorio:    5,
        nomina:         5,
        inventario:     5,
        reportes:       5,
        multisucursal: 15,
        expediente:     5,
    },
    moneda:         'USD',
    simbolo:        '$',
    actualizadoEn:  new Date().toISOString(),
});

console.log('✓ Precios actualizados en Firebase');
