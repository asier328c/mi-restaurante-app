// ============================================
// SERVIDOR DEL RESTAURANTE - VERSION SQLITE
// Este archivo es el "camarero": recibe pedidos, los guarda en la base de datos
// y devuelve informacion cuando se la piden.
// ============================================

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estaticos (frontend)
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// CONEXION A SQLITE
// ============================================
const dbPath = path.join(__dirname, 'restaurante.db');
const db = new sqlite3.Database(dbPath);

// Promisificar para usar async/await
const dbAsync = {
    query: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve({ rows });
            });
        });
    },
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID });
            });
        });
    }
};

// ============================================
// CREAR TABLAS SI NO EXISTEN
// ============================================
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS platos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio REAL NOT NULL,
        categoria TEXT,
        imagen_url TEXT,
        disponible INTEGER DEFAULT 1,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_nombre TEXT NOT NULL,
        cliente_telefono TEXT,
        cliente_direccion TEXT NOT NULL,
        total REAL NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        metodo_pago TEXT DEFAULT 'efectivo',
        notas TEXT,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS items_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        plato_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 1,
        precio_unitario REAL NOT NULL,
        subtotal REAL NOT NULL
    )`);

    // Insertar platos de ejemplo si la tabla esta vacia
    db.get("SELECT COUNT(*) as count FROM platos", (err, row) => {
        if (row.count === 0) {
            const platos = [
                ['Hamburguesa Clasica', 'Carne de res, lechuga, tomate, queso cheddar y salsa especial', 12.50, 'principal'],
                ['Hamburguesa BBQ', 'Carne de res, cebolla caramelizada, bacon y salsa barbacoa', 14.00, 'principal'],
                ['Pizza Margarita', 'Tomate, mozzarella fresca y albahaca', 10.00, 'principal'],
                ['Pizza Pepperoni', 'Tomate, mozzarella y pepperoni italiano', 12.00, 'principal'],
                ['Ensalada Cesar', 'Lechuga romana, pollo a la parrilla, crutones y aderezo cesar', 9.50, 'entrante'],
                ['Alitas de Pollo', '6 alitas crujientes con salsa a elegir', 8.00, 'entrante'],
                ['Patatas Bravas', 'Patatas fritas con salsa brava picante', 6.00, 'entrante'],
                ['Refresco Cola', 'Lata 33cl', 2.50, 'bebida'],
                ['Agua Mineral', 'Botella 50cl', 1.50, 'bebida'],
                ['Cerveza Artesanal', 'Botella 33cl', 3.50, 'bebida'],
                ['Tarta de Queso', 'Tarta de queso al horno con mermelada de frutos rojos', 5.50, 'postre'],
                ['Helado Artesanal', '2 bolas de helado, sabor a elegir', 4.00, 'postre']
            ];
            
            const stmt = db.prepare("INSERT INTO platos (nombre, descripcion, precio, categoria) VALUES (?, ?, ?, ?)");
            platos.forEach(p => stmt.run(p));
            stmt.finalize();
            console.log('Platos de ejemplo insertados');
        }
    });
});

// ============================================
// RUTAS DE LA API
// ============================================

// --- GET /platos ---
app.get('/platos', async (req, res) => {
    try {
        const result = await dbAsync.query(
            'SELECT * FROM platos WHERE disponible = 1 ORDER BY categoria, nombre'
        );
        
        res.json({
            exito: true,
            datos: result.rows
        });
    } catch (error) {
        console.error('Error al obtener platos:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al cargar el menu'
        });
    }
});

// --- POST /pedidos ---
app.post('/pedidos', async (req, res) => {
    const {
        cliente_nombre,
        cliente_telefono,
        cliente_direccion,
        items,
        metodo_pago,
        notas
    } = req.body;

    if (!cliente_nombre || !cliente_direccion || !items || items.length === 0) {
        return res.status(400).json({
            exito: false,
            mensaje: 'Faltan datos obligatorios: nombre, direccion o platos'
        });
    }

    try {
        // Calcular total
        let total = 0;
        for (const item of items) {
            const platoResult = await dbAsync.query(
                'SELECT precio FROM platos WHERE id = ? AND disponible = 1',
                [item.plato_id]
            );
            
            if (platoResult.rows.length === 0) {
                throw new Error(`Plato con ID ${item.plato_id} no encontrado`);
            }
            
            const precio = platoResult.rows[0].precio;
            total += precio * item.cantidad;
        }

        // Insertar pedido
        const pedidoResult = await dbAsync.run(
            `INSERT INTO pedidos (cliente_nombre, cliente_telefono, cliente_direccion, total, metodo_pago, notas)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cliente_nombre, cliente_telefono, cliente_direccion, total, metodo_pago || 'efectivo', notas]
        );
        
        const pedidoId = pedidoResult.lastID;

        // Insertar items
        for (const item of items) {
            const platoResult = await dbAsync.query(
                'SELECT precio FROM platos WHERE id = ?',
                [item.plato_id]
            );
            const precioUnitario = platoResult.rows[0].precio;
            const subtotal = precioUnitario * item.cantidad;

            await dbAsync.run(
                `INSERT INTO items_pedido (pedido_id, plato_id, cantidad, precio_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [pedidoId, item.plato_id, item.cantidad, precioUnitario, subtotal]
            );
        }

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
        console.error('Error al crear pedido:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al procesar el pedido: ' + error.message
        });
    }
});

// --- GET /pedidos ---
app.get('/pedidos', async (req, res) => {
    try {
        const result = await dbAsync.query(
            `SELECT p.*, 
                json_group_array(json_object(
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
app.patch('/pedidos/:id', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = ['pendiente', 'preparando', 'en_camino', 'entregado', 'cancelado'];
    
    if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
            exito: false,
            mensaje: 'Estado no valido'
        });
    }

    try {
        await dbAsync.run(
            `UPDATE pedidos 
             SET estado = ?, actualizado_en = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [estado, id]
        );

        res.json({
            exito: true,
            mensaje: 'Estado actualizado'
        });
    } catch (error) {
        console.error('Error al actualizar pedido:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al actualizar el estado'
        });
    }
});

// --- GET /estadisticas ---
app.get('/estadisticas', async (req, res) => {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        
        const pedidosHoy = await dbAsync.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as ingresos 
             FROM pedidos 
             WHERE DATE(creado_en) = ?`,
            [hoy]
        );

        const semana = await dbAsync.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as ingresos 
             FROM pedidos 
             WHERE creado_en >= DATE('now', '-7 days')`
        );

        const topPlatos = await dbAsync.query(
            `SELECT p.nombre, SUM(ip.cantidad) as vendidos, SUM(ip.subtotal) as ingresos
             FROM items_pedido ip
             JOIN platos p ON ip.plato_id = p.id
             GROUP BY p.id, p.nombre
             ORDER BY vendidos DESC
             LIMIT 5`
        );

        const porHora = await dbAsync.query(
            `SELECT strftime('%H', creado_en) as hora, COUNT(*) as cantidad
             FROM pedidos
             WHERE creado_en >= DATE('now', '-7 days')
             GROUP BY hora
             ORDER BY hora`
        );

        const porEstado = await dbAsync.query(
            `SELECT estado, COUNT(*) as cantidad
             FROM pedidos
             WHERE creado_en >= DATE('now', '-7 days')
             GROUP BY estado`
        );

        res.json({
            exito: true,
            datos: {
                hoy: {
                    pedidos: pedidosHoy.rows[0].total,
                    ingresos: pedidosHoy.rows[0].ingresos
                },
                semana: {
                    pedidos: semana.rows[0].total,
                    ingresos: semana.rows[0].ingresos
                },
                topPlatos: topPlatos.rows,
                porHora: porHora.rows,
                porEstado: porEstado.rows
            }
        });
    } catch (error) {
        console.error('Error en estadisticas:', error);
        res.status(500).json({
            exito: false,
            mensaje: 'Error al cargar estadisticas'
        });
    }
});

// --- GET /clientes ---
app.get('/clientes', async (req, res) => {
    try {
        const result = await dbAsync.query(
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
app.get('/pedidos/:id/detalles', async (req, res) => {
    const { id } = req.params;
    
    try {
        const pedidoResult = await dbAsync.query(
            'SELECT * FROM pedidos WHERE id = ?',
            [id]
        );

        if (pedidoResult.rows.length === 0) {
            return res.status(404).json({
                exito: false,
                mensaje: 'Pedido no encontrado'
            });
        }

        const itemsResult = await dbAsync.query(
            `SELECT ip.*, p.nombre, p.descripcion
             FROM items_pedido ip
             JOIN platos p ON ip.plato_id = p.id
             WHERE ip.pedido_id = ?`,
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
const PUERTO = process.env.PORT || 3000;

app.listen(PUERTO, () => {
    console.log(`Servidor del restaurante corriendo en puerto ${PUERTO}`);
});