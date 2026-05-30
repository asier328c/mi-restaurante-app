// ============================================
// SERVIDOR DEL RESTAURANTE
// Este archivo es el "camarero": recibe pedidos, los guarda en la base de datos
// y devuelve información cuando se la piden.
// ============================================

// EXPRESS: Es una librería que facilita crear servidores web en Node.js
// CORS: Permite que la página web (frontend) hable con el servidor (backend)
// PG: Es el conector para hablar con PostgreSQL
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// Creamos la aplicación Express
const app = express();

// Middleware (funciones que se ejecutan en cada petición):
app.use(cors()); // Permite que cualquier página web use nuestra API
app.use(express.json()); // Convierte automáticamente el JSON que recibimos en objetos JavaScript

// ============================================
// CONEXIÓN A LA BASE DE DATOS
// ============================================
// Pool es un grupo de conexiones a PostgreSQL. Reutiliza conexiones para ser más rápido.
const pool = new Pool({
    user: 'postgres',           // Usuario de PostgreSQL (el que pusiste al instalar)
    host: 'localhost',          // La base de datos está en esta misma computadora
    database: 'restaurante_db', // Nombre de la base de datos que creamos
    password: 'admin123',       // <-- CAMBIA ESTO: Pon tu contraseña real de PostgreSQL
    port: 5432,                 // Puerto estándar de PostgreSQL
});

// ============================================
// RUTAS DE LA API (los "endpoints" o direcciones que atiende el servidor)
// ============================================

// --- GET /platos ---
// Cuando alguien visita esta dirección, le devolvemos el menú completo
// Ejemplo: http://localhost:3000/platos
app.get('/platos', async (req, res) => {
    try {
        // Consultamos todos los platos disponibles de la base de datos
        const result = await pool.query(
            'SELECT * FROM platos WHERE disponible = true ORDER BY categoria, nombre'
        );
        
        // Enviamos los platos como respuesta en formato JSON
        res.json({
            exito: true,
            datos: result.rows  // result.rows contiene los platos encontrados
        });
    } catch (error) {
        // Si algo falla, enviamos un mensaje de error
        console.error('Error al obtener platos:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al cargar el menú'
        });
    }
});

// --- POST /pedidos ---
// Cuando un cliente hace un pedido, lo recibimos aquí y lo guardamos
// Ejemplo: http://localhost:3000/pedidos
app.post('/pedidos', async (req, res) => {
    // Extraemos los datos que envió el cliente
    const {
        cliente_nombre,
        cliente_telefono,
        cliente_direccion,
        items,           // Array de objetos: [{plato_id: 1, cantidad: 2}, ...]
        metodo_pago,
        notas
    } = req.body;

    // Validación básica: ¿vino todo lo necesario?
    if (!cliente_nombre || !cliente_direccion || !items || items.length === 0) {
        return res.status(400).json({
            exito: false,
            mensaje: 'Faltan datos obligatorios: nombre, dirección o platos'
        });
    }

    // Usamos una transacción: si algo falla, NO se guarda nada (evita pedidos incompletos)
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN'); // Iniciamos la transacción

        // PASO 1: Calcular el total del pedido
        let total = 0;
        for (const item of items) {
            const platoResult = await client.query(
                'SELECT precio FROM platos WHERE id = $1 AND disponible = true',
                [item.plato_id]
            );
            
            if (platoResult.rows.length === 0) {
                throw new Error(`Plato con ID ${item.plato_id} no encontrado o no disponible`);
            }
            
            const precio = platoResult.rows[0].precio;
            total += precio * item.cantidad;
        }

        // PASO 2: Insertar el pedido en la tabla "pedidos"
        const pedidoResult = await client.query(
            `INSERT INTO pedidos (cliente_nombre, cliente_telefono, cliente_direccion, total, metodo_pago, notas)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [cliente_nombre, cliente_telefono, cliente_direccion, total, metodo_pago || 'efectivo', notas]
        );
        
        const pedidoId = pedidoResult.rows[0].id;

        // PASO 3: Insertar cada plato en "items_pedido"
        for (const item of items) {
            const platoResult = await client.query(
                'SELECT precio FROM platos WHERE id = $1',
                [item.plato_id]
            );
            const precioUnitario = platoResult.rows[0].precio;
            const subtotal = precioUnitario * item.cantidad;

            await client.query(
                `INSERT INTO items_pedido (pedido_id, plato_id, cantidad, precio_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [pedidoId, item.plato_id, item.cantidad, precioUnitario, subtotal]
            );
        }

        await client.query('COMMIT'); // Confirmamos la transacción (todo se guarda)

        // Enviamos respuesta de éxito al cliente
        res.status(201).json({
            exito: true,
            mensaje: 'Pedido recibido correctamente',
            pedido: {
                id: pedidoId,
                total: total,
                estado: 'pendiente'
            }
        });

    } catch (error) {
        await client.query('ROLLBACK'); // Si algo falló, deshacemos TODO
        console.error('Error al crear pedido:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al procesar el pedido: ' + error.message
        });
    } finally {
        client.release(); // Liberamos la conexión para que otros la usen
    }
});

// --- GET /pedidos ---
// El dueño del restaurante ve todos los pedidos (para su panel de control)
app.get('/pedidos', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, 
                json_agg(json_build_object(
                    'plato_id', ip.plato_id,
                    'cantidad', ip.cantidad,
                    'precio_unitario', ip.precio_unitario,
                    'subtotal', ip.subtotal,
                    'nombre', pl.nombre
                )) as items
             FROM pedidos p
             LEFT JOIN items_pedido ip ON p.id = ip.pedido_id
             LEFT JOIN platos pl ON ip.plato_id = pl.id
             GROUP BY p.id
             ORDER BY p.creado_en DESC`
        );

        res.json({
            exito: true,
            datos: result.rows
        });
    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al cargar los pedidos'
        });
    }
});

// --- PATCH /pedidos/:id ---
// Actualizar el estado de un pedido (ej: de "pendiente" a "en preparación")
// :id significa "cualquier número", ej: /pedidos/5
app.patch('/pedidos/:id', async (req, res) => {
    const { id } = req.params; // Extraemos el ID de la URL
    const { estado } = req.body; // Extraemos el nuevo estado del cuerpo

    // Estados permitidos
    const estadosValidos = ['pendiente', 'preparando', 'en_camino', 'entregado', 'cancelado'];
    
    if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
            exito: false,
            mensaje: 'Estado no válido. Usa: ' + estadosValidos.join(', ')
        });
    }

    try {
        const result = await pool.query(
            `UPDATE pedidos 
             SET estado = $1, actualizado_en = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING *`,
            [estado, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                exito: false,
                mensaje: 'Pedido no encontrado'
            });
        }

        res.json({
            exito: true,
            mensaje: 'Estado actualizado',
            pedido: result.rows[0]
        });
    } catch (error) {
        console.error('Error al actualizar pedido:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al actualizar el estado'
        });
    }
});
// ============================================
// RUTAS PARA EL PANEL DE ADMINISTRACIÓN
// ============================================

// --- GET /estadisticas ---
// Dashboard con métricas del restaurante
app.get('/estadisticas', async (req, res) => {
    try {
        // Total de pedidos hoy
        const hoy = new Date().toISOString().split('T')[0];
        const pedidosHoy = await pool.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as ingresos 
             FROM pedidos 
             WHERE DATE(creado_en) = $1`,
            [hoy]
        );

        // Pedidos de la semana
        const semana = await pool.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as ingresos 
             FROM pedidos 
             WHERE creado_en >= CURRENT_DATE - INTERVAL '7 days'`
        );

        // Platos más vendidos (top 5)
        const topPlatos = await pool.query(
            `SELECT p.nombre, SUM(ip.cantidad) as vendidos, SUM(ip.subtotal) as ingresos
             FROM items_pedido ip
             JOIN platos p ON ip.plato_id = p.id
             GROUP BY p.id, p.nombre
             ORDER BY vendidos DESC
             LIMIT 5`
        );

        // Pedidos por hora (para ver horarios pico)
        const porHora = await pool.query(
            `SELECT EXTRACT(HOUR FROM creado_en) as hora, COUNT(*) as cantidad
             FROM pedidos
             WHERE creado_en >= CURRENT_DATE - INTERVAL '7 days'
             GROUP BY hora
             ORDER BY hora`
        );

        // Pedidos por estado actual
        const porEstado = await pool.query(
            `SELECT estado, COUNT(*) as cantidad
             FROM pedidos
             WHERE creado_en >= CURRENT_DATE - INTERVAL '7 days'
             GROUP BY estado`
        );

        res.json({
            exito: true,
            datos: {
                hoy: {
                    pedidos: parseInt(pedidosHoy.rows[0].total),
                    ingresos: parseFloat(pedidosHoy.rows[0].ingresos)
                },
                semana: {
                    pedidos: parseInt(semana.rows[0].total),
                    ingresos: parseFloat(semana.rows[0].ingresos)
                },
                topPlatos: topPlatos.rows,
                porHora: porHora.rows,
                porEstado: porEstado.rows
            }
        });
    } catch (error) {
        console.error('Error en estadísticas:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al cargar estadísticas'
        });
    }
});

// --- GET /clientes ---
// Lista de clientes con historial para campañas de fidelización
app.get('/clientes', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                cliente_nombre as nombre,
                cliente_telefono as telefono,
                cliente_direccion as direccion,
                COUNT(*) as total_pedidos,
                COALESCE(SUM(total), 0) as total_gastado,
                MAX(creado_en) as ultimo_pedido
             FROM pedidos
             WHERE cliente_telefono IS NOT NULL AND cliente_telefono != ''
             GROUP BY cliente_nombre, cliente_telefono, cliente_direccion
             ORDER BY total_pedidos DESC`
        );

        res.json({
            exito: true,
            datos: result.rows
        });
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al cargar clientes'
        });
    }
});

// --- GET /pedidos/:id/detalles ---
// Ver detalles completos de un pedido específico
app.get('/pedidos/:id/detalles', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Info del pedido
        const pedidoResult = await pool.query(
            'SELECT * FROM pedidos WHERE id = $1',
            [id]
        );

        if (pedidoResult.rows.length === 0) {
            return res.status(404).json({
                exito: false,
                mensaje: 'Pedido no encontrado'
            });
        }

        // Items del pedido
        const itemsResult = await pool.query(
            `SELECT ip.*, p.nombre, p.descripcion
             FROM items_pedido ip
             JOIN platos p ON ip.plato_id = p.id
             WHERE ip.pedido_id = $1`,
            [id]
        );

        res.json({
            exito: true,
            datos: {
                pedido: pedidoResult.rows[0],
                items: itemsResult.rows
            }
        });
    } catch (error) {
        console.error('Error al obtener detalles:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al cargar detalles del pedido'
        });
    }
});
// ============================================
// INICIAR EL SERVIDOR
// ============================================
const PUERTO = 3000; // El servidor escuchará en el puerto 3000

app.listen(PUERTO, () => {
    console.log(`🚀 Servidor del restaurante corriendo en http://localhost:${PUERTO}`);
    console.log(`📋 Menú disponible en: http://localhost:${PUERTO}/platos`);
    console.log(`📦 Pedidos en: http://localhost:${PUERTO}/pedidos`);
});