# Manual de usuario — GabAn

Bienvenido a **GabAn**, el sistema de punto de venta y gestión 360 en la nube. Esta guía explica, en lenguaje sencillo, cómo usar cada parte del sistema según tu rol.

## 1. Ingresar al sistema

Abre GabAn en tu navegador, escribe tu **correo** y **contraseña** y pulsa *Entrar*. El menú que verás a la izquierda (o arriba, en el celular) depende de tu rol.

Si trabajas desde una tablet o celular, GabAn se adapta automáticamente a la pantalla.

## 2. Roles

- **Administrador Master:** administra todo el sistema (todas las empresas).
- **Administrador de empresa (TENANT_ADMIN):** configura su empresa y accede a todos los módulos.
- **Vendedor, Comprador, Inventarios, Contabilidad:** acceden solo a lo que su rol permite.

## 3. Administrador Master

Desde **Administración** puedes:

- **Crear empresas (tenants):** nombre, moneda base, país y el correo/contraseña del administrador de esa empresa. Al crearla, el sistema prepara su espacio de datos y sus roles básicos automáticamente.
- **Crear sucursales:** asígnalas a una empresa e indica su moneda.
- **Auditoría:** en la pestaña *Auditoría* revisas todas las acciones realizadas en el sistema (quién, qué, cuándo y desde qué empresa). Puedes filtrar por empresa.

## 4. Administrador de empresa

### Configuración inicial recomendada
1. Ve a **Usuarios** y crea las cuentas de tu equipo, asignando un rol a cada una (Ventas, Compras, Inventarios, Contabilidad) o creando roles propios con permisos a la medida.
2. En **Ventas → Config. fiscal**, captura los datos de tu empresa (razón social, NIT o RFC, régimen, serie, etc.). Estos datos salen impresos en los comprobantes.
3. Da de alta tu catálogo en **Productos** y carga el inventario inicial.

## 5. Productos

En **Productos → Nuevo producto**:

- Escribe el **SKU/referencia**, el nombre y elige el **tipo** (Zapatos, Ropa, Alimentos, Electrónicos…).
- Agrega una o varias **variantes**. Cada variante es lo que realmente se vende: por ejemplo, un modelo de zapato en talla 40 color negro. Aquí capturas su **código de barras EAN**, talla, color, costo y precio de venta.
- Para calzado y ropa, crea una variante por cada talla (corrida de tallas).

## 6. Inventarios

- **Existencias:** elige la sucursal para ver el stock. Las cantidades en rojo están en o por debajo del mínimo.
- **Ajuste / ingreso manual:** suma o resta stock indicando el motivo (por ejemplo, inventario inicial o mermas).
- **Kardex:** con el botón *ver* consultas el historial de movimientos de cada producto y su saldo.
- **Traslados:** mueve stock de una sucursal a otra; el sistema descuenta en el origen y suma en el destino, dejando el registro en el kardex.

## 7. Compras

- **Proveedores:** da de alta a tus proveedores.
- **Órdenes de compra:** crea una orden eligiendo proveedor, sucursal y productos. Cuando llega la mercancía, pulsa **Recibir**: el inventario aumenta, se registra el kardex y se genera la **factura/cuenta por pagar**.
- **Estado de cuenta:** consulta lo que debes a cada proveedor y registra **pagos** a sus facturas.
- **Reabastecimiento:** el sistema detecta productos bajo el mínimo y, con un clic, genera órdenes de compra borrador agrupadas por proveedor.

## 8. Ventas

### Caja táctil (recomendada para el mostrador)
Pantalla con botones grandes. Toca los productos para agregarlos, ajusta cantidades con **+ / −**, elige el método de pago y pulsa **COBRAR**. Se imprime el comprobante.

**Sin internet:** si se cae la conexión, la caja sigue funcionando. Las ventas se guardan como *OFFLINE* y, al reconectar, se sincronizan solas (el botón *Sincronizar* muestra cuántas quedan pendientes). No se duplican.

### POS clásico (Ventas)
Además del cobro, permite:
- Elegir **cliente** y tipo (Venta o **Pedido**).
- Aplicar **promociones** por línea (porcentaje, monto fijo, 2x1).
- **Pago mixto:** combinar varios métodos (efectivo + tarjeta, etc.).
- **Pedidos:** se registran como pendientes y se descuentan del inventario al pulsar **Entregar**.
- **Comprobante:** ver e imprimir la factura/ticket con el formato fiscal del país.
- **Promociones** y **Clientes:** pestañas para administrarlos.

## 9. Contabilidad

- **Asientos (Libro diario):** registra movimientos en partida doble. El sistema no deja guardar si el *Debe* y el *Haber* no cuadran.
- **Plan de cuentas:** consulta y crea cuentas (activo, pasivo, patrimonio, ingreso, gasto).
- **Balanza de comprobación:** débitos, créditos y saldo de cada cuenta.
- **Estado de resultados:** ingresos − gastos = utilidad del periodo.
- **Balance general:** activos, pasivos y patrimonio; verifica que la ecuación contable cuadre.
- **Bancos:** da de alta cuentas bancarias, registra ingresos/egresos y consulta el **estado de cuenta** con su saldo.

## 10. Dashboard y reportes

En **Dashboard** ves los indicadores clave (ventas del periodo, ticket promedio, valor de inventario, cuentas por pagar y por cobrar), gráficos de ventas por día y top de productos. Con los botones puedes **exportar a Excel** (ventas e inventario) y a **PDF** (resumen ejecutivo), respetando el filtro de sucursal y fechas.

## 11. Usuarios y permisos (administrador)

En **Usuarios**:
- *Usuarios:* crea cuentas (nombre, correo, contraseña, rol y sucursal), cambia el rol o desactiva una cuenta.
- *Roles:* crea roles marcando exactamente los permisos que quieres (por ejemplo, un “Cajero” que solo pueda vender).

## 12. Consejos

- Mantén al día los **mínimos de stock** para aprovechar el reabastecimiento automático.
- Revisa la **auditoría** periódicamente (rol master) para dar seguimiento a la operación.
- Configura bien los **datos fiscales** antes de empezar a facturar.

---

¿Dudas? Escribe a soporte de GabAn. Este manual corresponde a la versión actual del sistema.
