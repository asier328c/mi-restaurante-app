// ============================================
// CONFIGURACIÓN
// ============================================
const API_URL = 'http://localhost:3000'; // Dirección de nuestro servidor

// Variables globales (datos que guardamos mientras el usuario navega)
let platos = [];           // Lista de platos del menú
let carrito = [];          // Platos que el usuario ha añadido
let pedidoEnviado = false; // Para evitar enviar dos veces

// ============================================
// AL CARGAR LA PÁGINA: Obtener el menú del servidor
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarMenu();
});

// ============================================
// FUNCIÓN: Cargar el menú desde el servidor
// ============================================
async function cargarMenu() {
    const contenedor = document.getElementById('lista-platos');
    
    try {
        // Hacemos una petición GET al servidor para obtener los platos
        const respuesta = await fetch(`${API_URL}/platos`);
        const datos = await respuesta.json();
        
        if (datos.exito) {
            platos = datos.datos;
            mostrarPlatos(platos);
        } else {
            contenedor.innerHTML = '<p class="cargando">Error al cargar el menú</p>';
        }
    } catch (error) {
        console.error('Error:', error);
        contenedor.innerHTML = '<p class="cargando">No se pudo conectar con el servidor. ¿Está encendido?</p>';
    }
}

// ============================================
// FUNCIÓN: Mostrar los platos en la pantalla
// ============================================
function mostrarPlatos(listaPlatos) {
    const contenedor = document.getElementById('lista-platos');
    contenedor.innerHTML = ''; // Limpiamos el "Cargando..."
    
    // Agrupamos platos por categoría para mostrarlos ordenados
    const categorias = {
        'entrante': 'Entrantes',
        'principal': 'Principales',
        'bebida': 'Bebidas',
        'postre': 'Postres'
    };
    
    // Para cada categoría, mostramos sus platos
    for (const [key, nombre] of Object.entries(categorias)) {
        const platosCategoria = listaPlatos.filter(p => p.categoria === key);
        
        if (platosCategoria.length > 0) {
            // Título de la categoría
            const tituloCat = document.createElement('h3');
            tituloCat.className = 'categoria-titulo';
            tituloCat.textContent = nombre;
            tituloCat.style.gridColumn = '1 / -1';
            tituloCat.style.color = '#2c3e50';
            tituloCat.style.marginTop = '1rem';
            tituloCat.style.marginBottom = '0.5rem';
            tituloCat.style.fontSize = '1.4rem';
            contenedor.appendChild(tituloCat);
            
            // Tarjeta de cada plato
            platosCategoria.forEach(plato => {
                const card = crearTarjetaPlato(plato);
                contenedor.appendChild(card);
            });
        }
    }
}

// ============================================
// FUNCIÓN: Crear una tarjeta HTML para un plato
// ============================================
function crearTarjetaPlato(plato) {
    const div = document.createElement('div');
    div.className = 'plato-card';
    
    div.innerHTML = `
        <span class="plato-categoria">${plato.categoria}</span>
        <h3 class="plato-nombre">${plato.nombre}</h3>
        <p class="plato-descripcion">${plato.descripcion || ''}</p>
        <p class="plato-precio">${parseFloat(plato.precio).toFixed(2)}</p>
        <button onclick="agregarAlCarrito(${plato.id})" class="btn-principal">
            ➕ Añadir al pedido
        </button>
    `;
    
    return div;
}

// ============================================
// FUNCIÓN: Añadir un plato al carrito
// ============================================
function agregarAlCarrito(platoId) {
    const plato = platos.find(p => p.id === platoId);
    if (!plato) return;
    
    // ¿Ya está en el carrito? Aumentamos cantidad
    const itemExistente = carrito.find(item => item.plato_id === platoId);
    if (itemExistente) {
        itemExistente.cantidad++;
    } else {
        // Si no, lo añadimos nuevo
        carrito.push({
            plato_id: platoId,
            cantidad: 1,
            nombre: plato.nombre,
            precio: parseFloat(plato.precio)
        });
    }
    
    actualizarCarrito();
    
    // Mostramos una pequeña animación o confirmación
    const btn = event.target;
    const textoOriginal = btn.textContent;
    btn.textContent = '✅ Añadido';
    btn.style.background = '#27ae60';
    setTimeout(() => {
        btn.textContent = textoOriginal;
        btn.style.background = '';
    }, 1000);
}

// ============================================
// FUNCIÓN: Actualizar la vista del carrito
// ============================================
// ============================================
// FUNCIÓN: Actualizar la vista del carrito
// ============================================
function actualizarCarrito() {
    const contenedor = document.getElementById('items-carrito');
    const totalElement = document.getElementById('total-precio');
    const carritoSection = document.getElementById('carrito');
    
    if (carrito.length === 0) {
        carritoSection.classList.add('oculto');
        return;
    }
    
    carritoSection.classList.remove('oculto');
    contenedor.innerHTML = '';
    
    let total = 0;
    
    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        
        const div = document.createElement('div');
        div.className = 'item-carrito';
        div.innerHTML = `
            <div class="item-info">
                <span class="item-cantidad">${item.cantidad}</span>
                <span>${item.nombre}</span>
            </div>
            <div class="item-acciones">
                <span class="item-precio">${subtotal.toFixed(2)} €</span>
                <button onclick="eliminarDelCarrito(${index})" class="btn-eliminar" title="Eliminar del carrito">
                    🗑️
                </button>
            </div>
        `;
        contenedor.appendChild(div);
    });
    
    totalElement.textContent = total.toFixed(2);
}

// ============================================
// FUNCIÓN: Mostrar el formulario de pedido
// ============================================
function mostrarFormulario() {
    if (carrito.length === 0) {
        alert('Tu carrito está vacío. Añade algunos platos primero.');
        return;
    }
    
    // Ocultamos el menú y el carrito, mostramos el formulario
    document.getElementById('menu').classList.add('oculto');
    document.getElementById('carrito').classList.add('oculto');
    document.getElementById('formulario-pedido').classList.remove('oculto');
    
    // Actualizamos el resumen en el formulario
    const resumenItems = document.getElementById('resumen-items');
    const totalFinal = document.getElementById('total-final');
    
    resumenItems.innerHTML = '';
    let total = 0;
    
    carrito.forEach(item => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        
        const p = document.createElement('p');
        p.textContent = `${item.cantidad}x ${item.nombre} - ${subtotal.toFixed(2)} €`;
        resumenItems.appendChild(p);
    });
    
    totalFinal.textContent = total.toFixed(2);
}

// ============================================
// FUNCIÓN: Volver al menú desde el formulario
// ============================================
function volverAlMenu() {
    document.getElementById('formulario-pedido').classList.add('oculto');
    document.getElementById('menu').classList.remove('oculto');
    document.getElementById('carrito').classList.remove('oculto');
}

// ============================================
// FUNCIÓN: Enviar el pedido al servidor
// ============================================
async function enviarPedido(event) {
    event.preventDefault(); // Evita que la página se recargue
    
    if (pedidoEnviado) {
        alert('El pedido ya se está enviando. Por favor espera.');
        return;
    }
    
    // Recogemos los datos del formulario
    const nombre = document.getElementById('nombre').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const direccion = document.getElementById('direccion').value.trim();
    const pago = document.getElementById('pago').value;
    const notas = document.getElementById('notas').value.trim();
    
    // Validación básica
    if (!nombre || !direccion) {
        alert('Por favor, completa los campos obligatorios (nombre y dirección).');
        return;
    }
    
    // Preparamos los datos para enviar
    const datosPedido = {
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: direccion,
        items: carrito.map(item => ({
            plato_id: item.plato_id,
            cantidad: item.cantidad
        })),
        metodo_pago: pago,
        notas: notas
    };
    
    pedidoEnviado = true;
    const btnEnviar = document.querySelector('.btn-enviar');
    const textoOriginal = btnEnviar.textContent;
    btnEnviar.textContent = '⏳ Enviando...';
    btnEnviar.disabled = true;
    
    try {
        const respuesta = await fetch(`${API_URL}/pedidos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datosPedido)
        });
        
        const resultado = await respuesta.json();
        
        if (resultado.exito) {
            // ¡Éxito! Mostramos la confirmación
            mostrarConfirmacion(resultado.pedido.id);
        } else {
            alert('Error: ' + resultado.mensaje);
            pedidoEnviado = false;
            btnEnviar.textContent = textoOriginal;
            btnEnviar.disabled = false;
        }
    } catch (error) {
        console.error('Error:', error);
        alert('No se pudo conectar con el servidor. Inténtalo de nuevo.');
        pedidoEnviado = false;
        btnEnviar.textContent = textoOriginal;
        btnEnviar.disabled = false;
    }
}

// ============================================
// FUNCIÓN: Mostrar pantalla de confirmación
// ============================================
function mostrarConfirmacion(numeroPedido) {
    document.getElementById('formulario-pedido').classList.add('oculto');
    document.getElementById('confirmacion').classList.remove('oculto');
    document.getElementById('numero-pedido').textContent = '#' + numeroPedido;
}

// ============================================
// FUNCIÓN: Hacer un nuevo pedido (reiniciar todo)
// ============================================
function nuevoPedido() {
    // Limpiamos todo
    carrito = [];
    pedidoEnviado = false;
    
    // Limpiamos el formulario
    document.getElementById('pedido-form').reset();
    
    // Ocultamos confirmación, mostramos menú
    document.getElementById('confirmacion').classList.add('oculto');
    document.getElementById('menu').classList.remove('oculto');
    
    // Actualizamos el carrito (quedará vacío/oculto)
    actualizarCarrito();
    
    // Recargamos el menú por si cambió algo
    cargarMenu();
}// ============================================
// FUNCIÓN: Eliminar un plato del carrito
// ============================================
function eliminarDelCarrito(index) {
    const item = carrito[index];
    
    if (item.cantidad > 1) {
        // Si hay más de 1, reducimos la cantidad
        item.cantidad--;
    } else {
        // Si solo hay 1, eliminamos el item completamente
        carrito.splice(index, 1);
    }
    
    // Actualizamos la vista del carrito
    actualizarCarrito();
}