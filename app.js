const formulario = document.getElementById('form-incidencia');
const btnPurgar = document.getElementById('btn-purgar');

function procesarEnvioReporte(datosFormulario){
  const endpoint = 'https://jsonplaceholder.typicode.com/posts';

  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datosFormulario)
  })
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error('Error HTTP del servidor');
      return respuesta.json();
    })
    .then(() => {
      // Envío exitoso en vivo: registrar en bitácora local como sincronizado
      return guardarRegistro({
        ...datosFormulario,
        estado: 'sincronizado',
        fechaCreacion: Date.now()
      });
    })
    .catch(() => {
      console.warn('[Outbox] Sin conexión. Encolando transacción localmente...');
      // Falla de red: guardar en IndexedDB como pendiente para reenvío posterior
      return guardarRegistro({
        ...datosFormulario,
        estado: 'pendiente',
        fechaCreacion: Date.now()
      });
    })
    .then(() => {
      // Actualizar la lista visual en ambos escenarios
      return renderizarColaOutbox();
    });
}

function sincronizarPendientes(){
  console.log('[Outbox] Conexión detectada. Buscando registros pendientes...');

  return obtenerTodosLosRegistros()
    .then((registros) => {
      const pendientes = registros.filter((item) => item.estado === 'pendiente');

      if (pendientes.length === 0) {
        console.log('[Outbox] No hay transacciones pendientes por sincronizar.');
        return;
      }

      // Convertir cada registro pendiente en una promesa de envío + actualización
      const promesasDeEnvio = pendientes.map((item) => {
        return fetch('https://jsonplaceholder.typicode.com/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.titulo, body: item.descripcion })
        })
          .then((res) => {
            if (!res.ok) throw new Error('Falla al reintentar envío');
            // Actualizar estado en IndexedDB de 'pendiente' a 'sincronizado'
            return actualizarEstadoRegistro(item.id, 'sincronizado');
          });
      });

      // Esperar a que todos los reenvíos concluyan
      return Promise.all(promesasDeEnvio);
    })
    .then(() => {
      return renderizarColaOutbox();
    })
    .catch((error) => {
      console.error('[Outbox] Error durante la sincronización masiva:', error);
    });
}

function renderizarColaOutbox() {
    const lista = document.getElementById('lista-outbox');
    return obtenerTodosLosRegistros()
        .then((registros) => {
            // Limpiar la lista anterior
            lista.innerHTML = '';
            // Si no hay registros
            if (registros.length === 0) {
                const li = document.createElement('li');
                li.textContent = 'No hay incidencias registradas.';
                lista.appendChild(li);
                return;
            }
            // Recorrer todos los registros
            registros.forEach((item) => {
                const li = document.createElement('li');
                // Formatear la fecha
                const fecha = new Date(item.fechaCreacion);
                const horaFormateada = fecha.toLocaleString('es-MX');
                // Mostrar información
                li.textContent =
                    item.titulo +
                    ' | Estado: ' + item.estado +
                    ' | Fecha: ' + horaFormateada;

                // Agregar clase según su estado
                li.classList.add(item.estado === 'pendiente' ? 'pendiente' : 'sincronizado');
                // Agregar el elemento al UL
                lista.appendChild(li);
            });
        })
        .catch((error) => {
            console.error(
                'Error al mostrar la bandeja de salida:',
                error
            );
        });

}

formulario.addEventListener('submit', (e) => {
    // Evitar que el navegador recargue la página
    e.preventDefault();
    // Obtener los valores del formulario
    const datosFormulario = {
        titulo: document.getElementById('titulo').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim()
    };
    // Procesar el envío
    procesarEnvioReporte(datosFormulario)
        .then(() => {
            console.log('Incidencia procesada correctamente');
            // Limpiar los campos
            formulario.reset();
        })
        .catch((error) => {
            console.error(
                'Error al procesar la incidencia:',
                error
            );
        });
});

btnPurgar.addEventListener('click', () => {
    // Obtener todos los registros
    obtenerTodosLosRegistros()
        .then((registros) => {
            // Filtrar solamente los sincronizados
            const sincronizados = registros.filter(
                (item) => item.estado === 'sincronizado'
            );
            // Crear una promesa de eliminación por registro
            const promesasEliminacion = sincronizados.map((item) => {
                return eliminarRegistro(item.id);
            });
            // Esperar a que todas las eliminaciones terminen
            return Promise.all(promesasEliminacion);
        })
        .then(() => {
            console.log('Registros sincronizados eliminados');
            // Actualizar la lista visual
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error(
                'Error al purgar registros:',
                error
            );
        });

});
// Escuchar el regreso de la conectividad
window.addEventListener('online', () => {
  actualizarIndicadorRed();
  sincronizarPendientes();
});
window.addEventListener('offline', actualizarIndicadorRed);