# Lunar Outpost - Fixes Tracking

## P0 - BLOQUEANTES (Priority 1)

### P0-1. La pestaña "Crew" no existe y el refugio es inaccesible
- [x] Añadir pestaña Crew en index.html
- [x] Añadir id y aria-controls a todas las pestañas
- [x] Añadir role="tabpanel" + aria-labelledby a los paneles
- [x] Botón de emergencia "Shelter crew" en pestaña Base (HUD)
- [x] Actualizar footer (ya estaba bien)

### P0-2. La primera misión causa superpoblación automática
- [x] En resolveMission: colocar solo tripulantes que caben, resto a pendingCrew
- [x] Al completar habitat, incorporar pendingCrew
- [x] Subir crowdingGraceHours a 168 (7 días)
- [x] Alerta persistente con horas restantes
- [ ] En tarjeta misión: avisar si recompensa crew supera plazas libres

### P0-3. Un edificio al 0% elimina toda su capacidad de golpe
- [x] Sustituir intactCount por capacidad gradual (condition/100)
- [x] Aplicar a shelterCapacity
- [x] Alerta "Housing crisis" en renderAlerts
- [x] UI Structures: estado "OFFLINE" y botón reparar destacado cuando condición=0

### P0-4. Bloqueo económico: sin materiales no se puede lanzar primera misión
- [x] Reducir costes materiales misión: Expansion 250→100, Emergency 200→100
- [x] Abaratar Fabricador a 300 materiales
- [x] Acción "Salvage" (desguazar): 50% coste materiales de edificio cond=0
- [x] Mensaje "Missing X materials — order them in Earth Imports" cuando falten
- [ ] Alerta cuando materials < 300 y misión activa

### P0-5. Comprar recursos en el tope desperdicia dinero
- [x] buyResource: calcular space = cap - current, si <=0 return error
- [x] Comprar amount = min(lot, space), cobrar price*amount + launchFee
- [x] Log cantidad real recibida
- [x] UI imports: deshabilitar botón "Storage full"

### P0-6. Fallo de misión = muerte instantánea + una sola tirada
- [x] Fallo parcial: penalización configurable (perder 1 tripulante, 20% escudo, etc.)
- [x] Solo termina si fallo catastrófico (rand<0.05) o 3 fallos acumulados
- [x] Aumentar peso estado base en probabilidad
- [x] UI: desglose probabilidad (base, atmósfera, escudo, hábitat, salud)

### P0-7. Plazo misión = muerte sorpresa
- [x] Alerta persistente en renderAlerts con "Mission deadline: X days"
- [x] A 7 días: pausa automática + toast "Launch now"
- [x] Avisos a 14, 7, 3, 1 días
- [x] Cuenta atrás en tarjeta misión (badge en pestaña pendiente)

## P1 - REALISMO (Priority 2)

### P1-1. El sol nunca se pone (ciclo día/noche)
- [ ] dayLengthHours = 24 (12h luz / 12h oscuridad)
- [ ] solarFactor(hora) 0..1 (seno suavizado) * output.power en powerModel
- [ ] Ajustar producción solar y batería (día cubre noche)
- [ ] HUD: "Day/Night" + tinte cielo en escena

### P1-2. Radiación incoherente
- [ ] Reescalar: base 0.3-1.2 µSv/h; tormentas 50-500 µSv/h
- [ ] Añadir crew.dose (mSv acumulados); enfermedad 100mSv, riesgo agudo 1000mSv
- [ ] Ajustar illnessChance/deathChance a dosis, no nivel instantáneo
- [ ] Escudo solo degrada por exposición (tormenta o sin refugio)
- [ ] Mostrar dosis acumulada en panel Crew

### P1-3. Atmósfera = depósito, no atmósfera
- [ ] Separar "reserva O2" (cap 2000kg) de "atmósfera cabina" (cabin: {o2%, co2%})
- [ ] Cabina volumen fijo; reserva mantiene 21%
- [ ] CO2 por tripulante + scrubber (lab o edificio nuevo)
- [ ] CO2 >3% baja eficiencia; 8% derrota
- [ ] HUD: "O2 reserve: X days" y "CO2: Y%"

### P1-4. Agua/comida a 0 = muerte instantánea
- [ ] Crisis escalonada: 0 recursos -> eficiencia -30%, crisis hours
- [ ] 24h: enfermedad + riesgo muerte/tripulante/hora
- [ ] 72h: muertes; partida termina si muere toda tripulación
- [ ] Racionamiento voluntario (50% consumo, -20% eficiencia)
- [ ] Cuenta atrás y alerta

### P1-5. Desgaste y capacidad poco realistas
- [ ] Desgaste solo si edificio alimentado y con tripulación (o reducido si inactivo)
- [ ] powerModel: demanda usa unidades efectivas (condición>0), no count bruto
- [ ] Coste reparación proporcional a coste edificio/categoría
- [ ] Estado "OFFLINE" y efecto en producción

### P1-6. Importaciones instantáneas
- [ ] state.shipments[] + BALANCE.importTravelHours = 48
- [ ] Al comprar: shipment con arrivesAt = hour + travelHours; step entrega y clamp
- [ ] UI: "In transit: 250 L water — 31 h"

### P1-7. Tripulación no corre riesgo en misiones
- [ ] Con fallo parcial: bajas reales (1-2) y lesiones
- [ ] Si hay refugio, parte sobrevive
- [ ] Registrar bajas en stats e historial misiones

### P1-8. Escena no refleja estado
- [ ] Si crew.sheltered: dibujar astronautas en hábitat/refugio
- [ ] Ciclo día/noche en cielo (P1-1)
- [ ] Dibujar todas estructuras o paginación/zoom; priorizar recientes + lista completa UI

## P2 - JUGABILIDAD/UX (Priority 3)

### P2-1. Escala tiempo muy rápida
- [ ] Pausa automática: tormenta, últimos 7 días misión, crisis (O2<15%, agua/comida<50%)
- [ ] Opción "Pause on alerts" en UI
- [ ] Velocidad 0.5× o botón "Slow"

### P2-2. Dinero no es restricción
- [ ] Dinero inicial 15-20M
- [ ] Financiación 3-5M/mes
- [ ] Costes operativos: salarios/tripulante + mantenimiento/edificio/hora
- [ ] Subir coste imports o límite mensual lanzamientos
- [ ] Financiación depende rendimiento (misiones, eficiencia)

### P2-3. Botón Build permite sobreconstruir sin cancelación
- [ ] Cola construcción con tareas + botón "Cancel" (reembolso 50%)
- [ ] Si ya hay tarea mismo tipo: "Queue another" + confirmación
- [ ] Límite cola por tipo (ej. 2) o coste total acumulado

### P2-4. Falta energía = espiral invisible
- [ ] Prioridad energía: soporte vital > ciencia > industria
- [ ] Factor por prioridad: soporte vital primero; industria/greenhouse se apagan antes
- [ ] "Throttled by power" en tarjetas afectadas + alerta qué construir

### P2-5. Base apenas mejora misiones
- [ ] Incluir condición hábitats, salud tripulación, reservas, lab en missionChance
- [ ] Mostrar desglose en UI
- [ ] Gastar dinero en "equipo misión" para mejorar probabilidad

### P2-6. Sin condición victoria
- [ ] Objetivo: sobrevivir 10 años o autosuficiencia (neto≥0 1 año)
- [ ] Pantalla victoria + stats + puntuación
- [ ] Modo infinito tras victoria

### P2-7. Pantalla derrota no deja revisar base
- [ ] "Keep reviewing" + "New base"
- [ ] Resumen: año/día, recursos, edificios, research, misiones, causa

### P2-8. Accesibilidad y teclado
- [ ] Space: ignorar si target es botón/enlace/input; solo pausa en body
- [ ] aria-controls, id, role="tabpanel", aria-labelledby
- [ ] Foco al abrir overlay derrota
- [ ] aria-live solo último mensaje, no lista completa

### P2-9. Info incompleta
- [ ] Subtítulo presupuesto: financiación real + próxima fecha (no fijo)
- [ ] Unidades energía (kWh)
- [ ] Año en horas log
- [ ] Botón misión: indica recurso faltante

## P3 - MENORES/TÉCNICOS (Priority 4)

### P3-1. Código muerto/duplicado
- [ ] Eliminar/implementar: researchBaseBonus, missionIntervalDays, labCount, hasSave, waterOutput, materialOutput, habitatCapacity
- [ ] Deduplicar shelterCapacityOf (ui.js) usando shelterCapacity (state.js)
- [ ] effectiveUnits en powerModel para demanda

### P3-2. Validación saves y XSS
- [ ] sanitizeTemplate: validar claves reward contra RESOURCES+crew+researchBonus
- [ ] No innerHTML con nombres misión: textContent o createTextNode
- [ ] Validar state.hour entero >=0
- [ ] Tests saneado saves corruptos

### P3-3. Notificaciones
- [ ] notify: Math.max(0, state.hour - last) o reset notes si reloj retrocede

### P3-4. Variedad misiones
- [ ] Eliminar ciclo fijo seq%4; plantilla aleatoria sin repetir anterior + 3-4 nuevas
- [ ] Dificultad escala con año

### P3-5. Tests
- [ ] createInitialState, getRates inicial
- [ ] clampResource, compra tope
- [ ] crewCapacity cond 100/50/0
- [ ] Recompensa crew plazas libres/pendientes
- [ ] Desgaste/reparación
- [ ] Sanitize save corrupto
- [ ] missionChance estados
- [ ] resolveMission fallo parcial
- [ ] Comando: node --test tests/

## Validación final
- [ ] npm run build
- [ ] node --test tests/
- [ ] Checklist manual completo