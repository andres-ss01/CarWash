// =============================================================================
// src/seed/data.js - Datos de demostración para npm run seed
// -----------------------------------------------------------------------------
// Los catálogos (tipos de vehículo, servicios, precios, horarios y estados de
// orden) ya vienen en database/schema.sql. Aquí solo hay usuarios, vehículos y
// citas de ejemplo. Los IDs de tipo de vehículo: 1 Auto, 2 SUV, 3 Camioneta, 4 Moto.
// =============================================================================

export const PASSWORD_DEMO = "Demo1234!";

export const administrador = {
  nombre: "Ana", apellidos: "García López", telefono: "442-100-0001",
  correo: "admin@carwash.mx", contrasena: "Admin123!", rol: "administrador",
  perfil: { rfc: "GALA800101AB1", curp: "GALA800101MQTRPN05" },
};

export const trabajadores = [
  {
    nombre: "Luis", apellidos: "Hernández Soto", telefono: "442-100-0002",
    correo: "luis@carwash.mx", contrasena: PASSWORD_DEMO, rol: "trabajador",
    perfil: { rfc: "HESL900505CD2", curp: "HESL900505HQTRTS08", turno: "matutino" },
  },
  {
    nombre: "María", apellidos: "Torres Vega", telefono: "442-100-0003",
    correo: "maria@carwash.mx", contrasena: PASSWORD_DEMO, rol: "trabajador",
    perfil: { rfc: "TOVM920312EF3", curp: "TOVM920312MQTRGR02", turno: "vespertino" },
  },
];

export const clientes = [
  { nombre: "Carlos", apellidos: "Ramírez Cruz", telefono: "442-200-0001", correo: "carlos@correo.com", contrasena: PASSWORD_DEMO, rol: "cliente" },
  { nombre: "Sofía", apellidos: "Mendoza Ruiz", telefono: "442-200-0002", correo: "sofia@correo.com", contrasena: PASSWORD_DEMO, rol: "cliente" },
  { nombre: "Jorge", apellidos: "Villanueva Paz", telefono: "442-200-0003", correo: "jorge@correo.com", contrasena: PASSWORD_DEMO, rol: "cliente" },
];

// `cliente` = posición en el arreglo `clientes`
export const vehiculos = [
  { cliente: 0, matricula: "QRO-123-A", marca: "Nissan", modelo: "Versa", color: "Gris", anio: 2021, idTipoVehiculo: 1 },
  { cliente: 0, matricula: "QRO-456-B", marca: "Honda", modelo: "CR-V", color: "Blanco", anio: 2022, idTipoVehiculo: 2 },
  { cliente: 1, matricula: "GTO-789-C", marca: "Toyota", modelo: "Hilux", color: "Negro", anio: 2020, idTipoVehiculo: 3 },
  { cliente: 2, matricula: "MEX-321-D", marca: "Italika", modelo: "FT150", color: "Rojo", anio: 2023, idTipoVehiculo: 4 },
];

// `diasHabiles`: cuántos días hábiles (lun-vie) a partir de hoy. `vehiculo` = posición en `vehiculos`.
export const citas = [
  { vehiculo: 0, diasHabiles: 1, hora: "09:00", servicios: [1], notas: "Lavado rápido antes del trabajo" },
  { vehiculo: 1, diasHabiles: 1, hora: "11:00", servicios: [2] },
  { vehiculo: 2, diasHabiles: 2, hora: "10:00", servicios: [3], notas: "Interior muy sucio" },
  { vehiculo: 3, diasHabiles: 2, hora: "10:30", servicios: [1, 2] },
];
