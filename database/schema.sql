-- ============================================
-- BASE DE DATOS PARA RESTAURANTE + DELIVERY
-- ============================================

-- Crear la base de datos (ejecutar esto primero en psql)
-- CREATE DATABASE restaurante_db;

-- ============================================
-- TABLA: platos (el menú)
-- ============================================
CREATE TABLE IF NOT EXISTS platos (
    id SERIAL PRIMARY KEY,           -- Número único automático
    nombre VARCHAR(100) NOT NULL,    -- Nombre del plato (obligatorio)
    descripcion TEXT,                 -- Descripción del plato
    precio DECIMAL(10,2) NOT NULL,   -- Precio con 2 decimales (ej: 12.50)
    categoria VARCHAR(50),            -- Entrante, principal, postre, bebida...
    imagen_url VARCHAR(255),          -- Ruta de la foto (por ahora vacío)
    disponible BOOLEAN DEFAULT TRUE,   -- ¿Está disponible ahora? Sí por defecto
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Fecha de creación
);

-- ============================================
-- TABLA: pedidos (las órdenes de los clientes)
-- ============================================
CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,            -- Número único del pedido
    cliente_nombre VARCHAR(100) NOT NULL,   -- Nombre del cliente
    cliente_telefono VARCHAR(20),     -- Teléfono para contactar
    cliente_direccion TEXT NOT NULL,  -- Dirección de entrega
    total DECIMAL(10,2) NOT NULL,     -- Total a pagar
    estado VARCHAR(20) DEFAULT 'pendiente',  -- pendiente, preparando, en_camino, entregado, cancelado
    metodo_pago VARCHAR(20) DEFAULT 'efectivo',  -- efectivo, tarjeta, transferencia
    notas TEXT,                       -- Notas especiales (ej: "sin cebolla")
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Cuándo se hizo el pedido
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Última actualización
);

-- ============================================
-- TABLA: items_pedido (los platos dentro de cada pedido)
-- ============================================
CREATE TABLE IF NOT EXISTS items_pedido (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,  -- A qué pedido pertenece
    plato_id INTEGER NOT NULL REFERENCES platos(id),  -- Qué plato es
    cantidad INTEGER NOT NULL DEFAULT 1,  -- Cuántas unidades
    precio_unitario DECIMAL(10,2) NOT NULL,  -- Precio en el momento del pedido
    subtotal DECIMAL(10,2) NOT NULL    -- cantidad * precio_unitario
);

-- ============================================
-- DATOS DE EJEMPLO (platos para el menú)
-- ============================================
INSERT INTO platos (nombre, descripcion, precio, categoria) VALUES
('Hamburguesa Clásica', 'Carne de res, lechuga, tomate, queso cheddar y salsa especial', 12.50, 'principal'),
('Hamburguesa BBQ', 'Carne de res, cebolla caramelizada, bacon y salsa barbacoa', 14.00, 'principal'),
('Pizza Margarita', 'Tomate, mozzarella fresca y albahaca', 10.00, 'principal'),
('Pizza Pepperoni', 'Tomate, mozzarella y pepperoni italiano', 12.00, 'principal'),
('Ensalada César', 'Lechuga romana, pollo a la parrilla, crutones y aderezo césar', 9.50, 'entrante'),
('Alitas de Pollo', '6 alitas crujientes con salsa a elegir', 8.00, 'entrante'),
('Patatas Bravas', 'Patatas fritas con salsa brava picante', 6.00, 'entrante'),
('Refresco Cola', 'Lata 33cl', 2.50, 'bebida'),
('Agua Mineral', 'Botella 50cl', 1.50, 'bebida'),
('Cerveza Artesanal', 'Botella 33cl', 3.50, 'bebida'),
('Tarta de Queso', 'Tarta de queso al horno con mermelada de frutos rojos', 5.50, 'postre'),
('Helado Artesanal', '2 bolas de helado, sabor a elegir', 4.00, 'postre');