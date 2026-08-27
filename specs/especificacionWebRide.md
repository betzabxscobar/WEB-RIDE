# Especificación del sistema

## Nombre
WEB-RIDE

## Objetivo
Permitir a los usuarios solicitar y gestionar viajes mediante una plataforma web, mostrando la ubicación, el origen, el destino, la ruta por calles y el estado del viaje.

## Requisitos funcionales

RF1:
El usuario podrá seleccionar o ingresar un punto de origen.

RF2:
El usuario podrá seleccionar o ingresar un destino.

RF3:
El sistema podrá buscar y mostrar direcciones cercanas a la ubicación del usuario.

RF4:
El sistema mostrará la ubicación del usuario en el mapa.

RF5:
El sistema mostrará los puntos de origen y destino en el mapa.

RF6:
El sistema calculará una ruta real por las calles entre el origen y el destino.

RF7:
El sistema mostrará la ruta seleccionada sobre el mapa.

RF8:
El usuario podrá solicitar un viaje indicando origen y destino.

RF9:
El sistema mostrará el estado del viaje solicitado.

RF10:
El conductor podrá visualizar la información y ubicación relacionada con el viaje.

RF11:
El sistema actualizará la ubicación del conductor durante el seguimiento del viaje.

RF12:
El sistema mostrará al usuario la información correspondiente a su viaje.

## Regla del negocio

El precio del viaje no podrá ser definido ni modificado desde la aplicación web. La tarifa deberá ser calculada y validada por el servidor mediante la función `cotizarviaje` en PostgreSQL.

## Reglas del mapa

El mapa utilizará OpenStreetMap como fuente de teselas.

Las rutas por calles serán obtenidas mediante OSRM.

La aplicación no deberá utilizar una ciudad o coordenada fija como ubicación predeterminada.

Cuando exista una ubicación conocida del usuario, esta deberá utilizarse para centrar el mapa y mejorar la búsqueda de direcciones.

Si no existe una ubicación conocida, el sistema mostrará una vista general del mapa.

## Regla de rutas

La ruta mostrada deberá corresponder al recorrido real por las calles y no a una línea recta entre origen y destino.

Cuando existan varias rutas disponibles, se seleccionará una ruta que no supere en más de un 10 % el tiempo de la ruta más rápida y que, entre esas opciones, tenga la menor distancia.

## Regla de disponibilidad

El servidor público de OSRM se utilizará únicamente para desarrollo y pruebas.

Para producción deberá utilizarse una instancia propia de OSRM.

## Atribución

Cuando se utilicen datos de OpenStreetMap, la aplicación deberá mostrar la atribución correspondiente a OpenStreetMap.
