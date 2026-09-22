/**
 * Definición de campos de dirección y listas geográficas por país.
 * Cada país sigue el estándar fiscal de su autoridad tributaria.
 *
 * Estructura de cada entrada:
 *   label       – nombre del país
 *   fiscalAuth  – nombre de la autoridad tributaria
 *   fiscalNote  – nota sobre el estándar fiscal
 *   fields      – array de campos de dirección en orden de presentación
 *     key         – clave en settings.general (prefijo addr_)
 *     label       – etiqueta visible
 *     type        – 'select' | 'text' | 'postal'
 *     options     – array de {value, label} (solo para type='select')
 *     cities      – array de strings para datalist (solo ciudades principales)
 *     maxLength   – longitud máxima para tipo postal
 *     required    – boolean (default true)
 *     hint        – texto de ayuda opcional
 */

// ─── Colombia ────────────────────────────────────────────────────────────────
const CO_DEPARTMENTS = [
  'Amazonas','Antioquia','Arauca','Atlántico','Bogotá D.C.','Bolívar',
  'Boyacá','Caldas','Caquetá','Casanare','Cauca','Cesar','Chocó',
  'Córdoba','Cundinamarca','Guainía','Guaviare','Huila','La Guajira',
  'Magdalena','Meta','Nariño','Norte de Santander','Putumayo','Quindío',
  'Risaralda','San Andrés y Providencia','Santander','Sucre','Tolima',
  'Valle del Cauca','Vaupés','Vichada',
]

const CO_CITIES = {
  'Antioquia':        ['Medellín','Bello','Itagüí','Envigado','Apartadó','Rionegro','Sabaneta','Turbo'],
  'Atlántico':        ['Barranquilla','Soledad','Malambo','Sabanalarga'],
  'Bogotá D.C.':      ['Bogotá D.C.'],
  'Bolívar':          ['Cartagena','Magangué','El Carmen de Bolívar'],
  'Boyacá':           ['Tunja','Duitama','Sogamoso','Chiquinquirá'],
  'Caldas':           ['Manizales','La Dorada','Chinchiná'],
  'Cauca':            ['Popayán','Santander de Quilichao','Puerto Tejada'],
  'Cesar':            ['Valledupar','Aguachica','Bosconia'],
  'Córdoba':          ['Montería','Lorica','Cereté','Sahagún'],
  'Cundinamarca':     ['Soacha','Facatativá','Zipaquirá','Chía','Mosquera','Madrid'],
  'Huila':            ['Neiva','Pitalito','Garzón'],
  'La Guajira':       ['Riohacha','Maicao','Uribia'],
  'Magdalena':        ['Santa Marta','Ciénaga','Fundación'],
  'Meta':             ['Villavicencio','Acacías','Granada'],
  'Nariño':           ['Pasto','Ipiales','Tumaco','Túquerres'],
  'Norte de Santander':['Cúcuta','Ocaña','Pamplona','Villa del Rosario'],
  'Quindío':          ['Armenia','Calarcá','Montenegro'],
  'Risaralda':        ['Pereira','Dosquebradas','Santa Rosa de Cabal'],
  'Santander':        ['Bucaramanga','Floridablanca','Girón','Piedecuesta','Barrancabermeja'],
  'Sucre':            ['Sincelejo','Corozal','Sampués'],
  'Tolima':           ['Ibagué','Espinal','Honda','Melgar'],
  'Valle del Cauca':  ['Cali','Buenaventura','Palmira','Buga','Tuluá','Cartago','Jamundí'],
}

// ─── México ───────────────────────────────────────────────────────────────────
const MX_STATES = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche',
  'Chiapas','Chihuahua','Ciudad de México','Coahuila de Zaragoza','Colima',
  'Durango','Guanajuato','Guerrero','Hidalgo','Jalisco','México',
  'Michoacán de Ocampo','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla',
  'Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora',
  'Tabasco','Tamaulipas','Tlaxcala','Veracruz de Ignacio de la Llave',
  'Yucatán','Zacatecas',
]

const MX_CITIES = [
  'Ciudad de México','Guadalajara','Monterrey','Puebla','Tijuana','Toluca',
  'León','Juárez','Zapopan','Mérida','San Luis Potosí','Aguascalientes',
  'Mexicali','Culiacán','Acapulco','Querétaro','Chihuahua','Hermosillo',
  'Saltillo','Morelia','Veracruz','Cancún','Torreón','Tuxtla Gutiérrez',
  'San Nicolás de los Garza','Ecatepec de Morelos','Nezahualcóyotl',
]

// ─── USA ──────────────────────────────────────────────────────────────────────
const US_STATES = [
  {v:'AL',l:'Alabama'},{v:'AK',l:'Alaska'},{v:'AZ',l:'Arizona'},{v:'AR',l:'Arkansas'},
  {v:'CA',l:'California'},{v:'CO',l:'Colorado'},{v:'CT',l:'Connecticut'},{v:'DE',l:'Delaware'},
  {v:'DC',l:'District of Columbia'},{v:'FL',l:'Florida'},{v:'GA',l:'Georgia'},{v:'HI',l:'Hawaii'},
  {v:'ID',l:'Idaho'},{v:'IL',l:'Illinois'},{v:'IN',l:'Indiana'},{v:'IA',l:'Iowa'},
  {v:'KS',l:'Kansas'},{v:'KY',l:'Kentucky'},{v:'LA',l:'Louisiana'},{v:'ME',l:'Maine'},
  {v:'MD',l:'Maryland'},{v:'MA',l:'Massachusetts'},{v:'MI',l:'Michigan'},{v:'MN',l:'Minnesota'},
  {v:'MS',l:'Mississippi'},{v:'MO',l:'Missouri'},{v:'MT',l:'Montana'},{v:'NE',l:'Nebraska'},
  {v:'NV',l:'Nevada'},{v:'NH',l:'New Hampshire'},{v:'NJ',l:'New Jersey'},{v:'NM',l:'New Mexico'},
  {v:'NY',l:'New York'},{v:'NC',l:'North Carolina'},{v:'ND',l:'North Dakota'},{v:'OH',l:'Ohio'},
  {v:'OK',l:'Oklahoma'},{v:'OR',l:'Oregon'},{v:'PA',l:'Pennsylvania'},{v:'RI',l:'Rhode Island'},
  {v:'SC',l:'South Carolina'},{v:'SD',l:'South Dakota'},{v:'TN',l:'Tennessee'},{v:'TX',l:'Texas'},
  {v:'UT',l:'Utah'},{v:'VT',l:'Vermont'},{v:'VA',l:'Virginia'},{v:'WA',l:'Washington'},
  {v:'WV',l:'West Virginia'},{v:'WI',l:'Wisconsin'},{v:'WY',l:'Wyoming'},
]

// ─── Perú ─────────────────────────────────────────────────────────────────────
const PE_DEPARTMENTS = [
  'Amazonas','Áncash','Apurímac','Arequipa','Ayacucho','Cajamarca','Callao',
  'Cusco','Huancavelica','Huánuco','Ica','Junín','La Libertad','Lambayeque',
  'Lima','Loreto','Madre de Dios','Moquegua','Pasco','Piura','Puno',
  'San Martín','Tacna','Tumbes','Ucayali',
]

const PE_CITIES = [
  'Lima','Arequipa','Trujillo','Chiclayo','Piura','Iquitos','Cusco','Chimbote',
  'Huancayo','Tacna','Callao','Ica','Pucallpa','Sullana','Ayacucho','Juliaca',
]

// ─── Chile ────────────────────────────────────────────────────────────────────
const CL_REGIONS = [
  {v:'XV', l:'Arica y Parinacota'},{v:'I',  l:'Tarapacá'},
  {v:'II', l:'Antofagasta'},{v:'III',l:'Atacama'},
  {v:'IV', l:'Coquimbo'},{v:'V',   l:'Valparaíso'},
  {v:'RM', l:'Metropolitana de Santiago'},{v:'VI', l:'O\'Higgins'},
  {v:'VII',l:'Maule'},{v:'XVI',l:'Ñuble'},
  {v:'VIII',l:'Biobío'},{v:'IX',l:'La Araucanía'},
  {v:'XIV',l:'Los Ríos'},{v:'X',  l:'Los Lagos'},
  {v:'XI', l:'Aysén'},{v:'XII',l:'Magallanes'},
]

const CL_CITIES = [
  'Santiago','Maipú','Las Condes','Puente Alto','La Florida','Antofagasta',
  'Viña del Mar','Valparaíso','Concepción','Temuco','Iquique','Rancagua',
  'Arica','Talca','Chillán','Puerto Montt','Osorno','Coquimbo','La Serena',
]

// ─── Argentina ───────────────────────────────────────────────────────────────
const AR_PROVINCES = [
  'Buenos Aires','Catamarca','Chaco','Chubut','Ciudad Autónoma de Buenos Aires',
  'Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja',
  'Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis',
  'Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán',
]

const AR_CITIES = [
  'Buenos Aires','Córdoba','Rosario','Mendoza','Tucumán','La Plata','Mar del Plata',
  'Salta','Santa Fe','San Juan','Resistencia','Corrientes','Posadas','Neuquén',
  'Santiago del Estero','Formosa','San Luis','Comodoro Rivadavia','Bahía Blanca',
]

// ─── Bolivia ─────────────────────────────────────────────────────────────────
const BO_DEPARTMENTS = [
  'Beni','Chuquisaca','Cochabamba','La Paz','Oruro','Pando','Potosí','Santa Cruz','Tarija',
]

// ─── Paraguay ────────────────────────────────────────────────────────────────
const PY_DEPARTMENTS = [
  'Alto Paraguay','Alto Paraná','Amambay','Asunción (Capital)','Boquerón',
  'Caaguazú','Caazapá','Canindeyú','Central','Concepción','Cordillera',
  'Guairá','Itapúa','Misiones','Ñeembucú','Paraguarí','Presidente Hayes',
  'San Pedro',
]

// ─── Uruguay ─────────────────────────────────────────────────────────────────
const UY_DEPARTMENTS = [
  'Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida',
  'Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha',
  'Salto','San José','Soriano','Tacuarembó','Treinta y Tres',
]

// ─── España ──────────────────────────────────────────────────────────────────
const ES_PROVINCES = [
  'Álava','Albacete','Alicante','Almería','Asturias','Ávila','Badajoz',
  'Baleares','Barcelona','Burgos','Cáceres','Cádiz','Cantabria','Castellón',
  'Ciudad Real','Córdoba','La Coruña','Cuenca','Gerona','Granada','Guadalajara',
  'Guipúzcoa','Huelva','Huesca','Jaén','León','Lérida','Lugo','Madrid',
  'Málaga','Murcia','Navarra','Orense','Palencia','Las Palmas','Pontevedra',
  'La Rioja','Salamanca','Santa Cruz de Tenerife','Segovia','Sevilla','Soria',
  'Tarragona','Teruel','Toledo','Valencia','Valladolid','Vizcaya','Zamora','Zaragoza',
  'Ceuta','Melilla',
]

// ─── Ecuador ─────────────────────────────────────────────────────────────────
const EC_PROVINCES = [
  'Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi','El Oro','Esmeraldas',
  'Galápagos','Guayas','Imbabura','Loja','Los Ríos','Manabí','Morona Santiago',
  'Napo','Orellana','Pastaza','Pichincha','Santa Elena','Santo Domingo de los Tsáchilas',
  'Sucumbíos','Tungurahua','Zamora Chinchipe',
]

// ─── Venezuela ───────────────────────────────────────────────────────────────
const VE_STATES = [
  'Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo',
  'Cojedes','Delta Amacuro','Distrito Capital','Falcón','Guárico','Lara',
  'Mérida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre','Táchira',
  'Trujillo','Vargas','Yaracuy','Zulia',
]


// ═══════════════════════════════════════════════════════════════════════════════
// DEFINICIÓN PRINCIPAL POR PAÍS
// ═══════════════════════════════════════════════════════════════════════════════

export const COUNTRY_ADDRESS = {

  CO: {
    label: 'Colombia',
    fiscalAuth: 'DIAN',
    fiscalNote: 'La dirección debe corresponder al domicilio fiscal registrado en el RUT ante la DIAN.',
    addrFields: [
      {
        key: 'department', label: 'Departamento', type: 'select', required: true,
        options: CO_DEPARTMENTS.map(d => ({ v: d, l: d })),
        hint: 'Código de departamento DANE',
      },
      {
        key: 'city', label: 'Municipio / Ciudad', type: 'city_select', required: true,
        hint: 'Municipio según código DANE',
        getCities: (dept) => CO_CITIES[dept] || [],
      },
      {
        key: 'neighborhood', label: 'Barrio / Localidad', type: 'text', required: false,
        placeholder: 'Ej. El Poblado',
      },
      {
        key: 'street', label: 'Dirección (calle y número)', type: 'text', required: true,
        placeholder: 'Cll 50 # 10-23 Piso 2',
        hint: 'Formato: Cll/Cra/Av + número + # + número',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: false,
        placeholder: '050001', maxLength: 6,
        hint: 'Código postal de 6 dígitos (Serpost)',
      },
    ],
  },

  MX: {
    label: 'México',
    fiscalAuth: 'SAT',
    fiscalNote: 'El código postal es obligatorio para la generación de CFDI 4.0 ante el SAT.',
    addrFields: [
      {
        key: 'state', label: 'Estado', type: 'select', required: true,
        options: MX_STATES.map(s => ({ v: s, l: s })),
      },
      {
        key: 'municipality', label: 'Municipio / Alcaldía', type: 'text', required: true,
        placeholder: 'Ej. Cuauhtémoc',
      },
      {
        key: 'neighborhood', label: 'Colonia', type: 'text', required: true,
        placeholder: 'Ej. Centro Histórico',
        hint: 'La colonia aparece en el CFDI',
      },
      {
        key: 'street', label: 'Calle y número', type: 'text', required: true,
        placeholder: 'Av. Insurgentes Sur 123 Int. 4',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: true,
        placeholder: '06600', maxLength: 5,
        hint: 'CP obligatorio en CFDI 4.0',
      },
    ],
  },

  US: {
    label: 'United States',
    fiscalAuth: 'IRS',
    fiscalNote: 'Address must match the business registration with the IRS (EIN).',
    addrFields: [
      {
        key: 'street', label: 'Street address', type: 'text', required: true,
        placeholder: '123 Main Street Suite 100',
      },
      {
        key: 'city', label: 'City', type: 'text', required: true,
        placeholder: 'New York',
        datalist: ['New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia',
                   'San Antonio','San Diego','Dallas','San Jose','Austin','Jacksonville'],
      },
      {
        key: 'state', label: 'State', type: 'select', required: true,
        options: US_STATES.map(s => ({ v: s.v, l: `${s.l} (${s.v})` })),
      },
      {
        key: 'postal', label: 'ZIP Code', type: 'postal', required: true,
        placeholder: '10001', maxLength: 10,
      },
    ],
  },

  PE: {
    label: 'Perú',
    fiscalAuth: 'SUNAT',
    fiscalNote: 'La dirección debe coincidir con el domicilio fiscal en el RUC ante la SUNAT.',
    addrFields: [
      {
        key: 'department', label: 'Departamento', type: 'select', required: true,
        options: PE_DEPARTMENTS.map(d => ({ v: d, l: d })),
      },
      {
        key: 'province', label: 'Provincia', type: 'text', required: true,
        placeholder: 'Ej. Lima',
      },
      {
        key: 'district', label: 'Distrito', type: 'text', required: true,
        placeholder: 'Ej. Miraflores',
        hint: 'El ubigeo (departamento/provincia/distrito) es requerido por SUNAT',
      },
      {
        key: 'street', label: 'Dirección', type: 'text', required: true,
        placeholder: 'Av. Larco 1234',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: false,
        placeholder: '15046', maxLength: 5,
      },
    ],
  },

  CL: {
    label: 'Chile',
    fiscalAuth: 'SII',
    fiscalNote: 'La dirección debe coincidir con la actividad económica registrada ante el SII.',
    addrFields: [
      {
        key: 'region', label: 'Región', type: 'select', required: true,
        options: CL_REGIONS.map(r => ({ v: r.v, l: `${r.l} (${r.v})` })),
      },
      {
        key: 'province', label: 'Provincia', type: 'text', required: false,
        placeholder: 'Ej. Santiago',
      },
      {
        key: 'city', label: 'Comuna', type: 'text', required: true,
        placeholder: 'Ej. Providencia',
        hint: 'La comuna es obligatoria en la documentación tributaria del SII',
        datalist: CL_CITIES,
      },
      {
        key: 'street', label: 'Dirección', type: 'text', required: true,
        placeholder: 'Av. Providencia 1234 Of. 5',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: false,
        placeholder: '7500000', maxLength: 7,
      },
    ],
  },

  AR: {
    label: 'Argentina',
    fiscalAuth: 'AFIP',
    fiscalNote: 'El domicilio debe coincidir con el registrado en el CUIT ante la AFIP.',
    addrFields: [
      {
        key: 'province', label: 'Provincia', type: 'select', required: true,
        options: AR_PROVINCES.map(p => ({ v: p, l: p })),
      },
      {
        key: 'city', label: 'Localidad / Ciudad', type: 'text', required: true,
        placeholder: 'Ej. Buenos Aires',
        datalist: AR_CITIES,
      },
      {
        key: 'neighborhood', label: 'Barrio (opcional)', type: 'text', required: false,
        placeholder: 'Ej. Palermo',
      },
      {
        key: 'street', label: 'Calle y número', type: 'text', required: true,
        placeholder: 'Av. Corrientes 1234 Piso 3',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: true,
        placeholder: 'C1043', maxLength: 8,
        hint: 'CPA (Código Postal Argentino) de 4 a 8 caracteres',
      },
    ],
  },

  BO: {
    label: 'Bolivia',
    fiscalAuth: 'SIN',
    fiscalNote: 'El domicilio debe coincidir con el NIT registrado ante el SIN (Servicio de Impuestos Nacionales).',
    addrFields: [
      {
        key: 'department', label: 'Departamento', type: 'select', required: true,
        options: BO_DEPARTMENTS.map(d => ({ v: d, l: d })),
      },
      {
        key: 'city', label: 'Municipio / Ciudad', type: 'text', required: true,
        placeholder: 'Ej. Santa Cruz de la Sierra',
      },
      {
        key: 'zone', label: 'Zona / Barrio', type: 'text', required: false,
        placeholder: 'Ej. Plan 3000',
      },
      {
        key: 'street', label: 'Dirección', type: 'text', required: true,
        placeholder: 'Av. Banzer km 5 local 10',
      },
    ],
  },

  PY: {
    label: 'Paraguay',
    fiscalAuth: 'SET',
    fiscalNote: 'El domicilio debe coincidir con el RUC registrado ante la Subsecretaría de Estado de Tributación (SET).',
    addrFields: [
      {
        key: 'department', label: 'Departamento', type: 'select', required: true,
        options: PY_DEPARTMENTS.map(d => ({ v: d, l: d })),
      },
      {
        key: 'city', label: 'Ciudad / Distrito', type: 'text', required: true,
        placeholder: 'Ej. Asunción',
      },
      {
        key: 'neighborhood', label: 'Barrio', type: 'text', required: false,
        placeholder: 'Ej. Villa Morra',
      },
      {
        key: 'street', label: 'Dirección', type: 'text', required: true,
        placeholder: 'Av. España 1234',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: false,
        placeholder: '1209', maxLength: 4,
      },
    ],
  },

  UY: {
    label: 'Uruguay',
    fiscalAuth: 'DGI',
    fiscalNote: 'El domicilio debe coincidir con el RUT registrado ante la Dirección General Impositiva (DGI).',
    addrFields: [
      {
        key: 'department', label: 'Departamento', type: 'select', required: true,
        options: UY_DEPARTMENTS.map(d => ({ v: d, l: d })),
      },
      {
        key: 'city', label: 'Ciudad / Localidad', type: 'text', required: true,
        placeholder: 'Ej. Montevideo',
      },
      {
        key: 'neighborhood', label: 'Barrio', type: 'text', required: false,
        placeholder: 'Ej. Pocitos',
      },
      {
        key: 'street', label: 'Dirección', type: 'text', required: true,
        placeholder: '18 de Julio 1234 Ap. 5',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: false,
        placeholder: '11200', maxLength: 5,
      },
    ],
  },

  ES: {
    label: 'España',
    fiscalAuth: 'AEAT',
    fiscalNote: 'El domicilio fiscal debe coincidir con el declarado ante la Agencia Tributaria (AEAT).',
    addrFields: [
      {
        key: 'province', label: 'Provincia', type: 'select', required: true,
        options: ES_PROVINCES.map(p => ({ v: p, l: p })),
      },
      {
        key: 'city', label: 'Municipio', type: 'text', required: true,
        placeholder: 'Ej. Madrid',
        datalist: ['Madrid','Barcelona','Valencia','Sevilla','Zaragoza','Málaga','Murcia',
                   'Palma','Las Palmas de Gran Canaria','Bilbao','Alicante','Córdoba',
                   'Valladolid','Vigo','Gijón','Eibar','Hospitalet de Llobregat'],
      },
      {
        key: 'street', label: 'Calle y número', type: 'text', required: true,
        placeholder: 'C/ Gran Vía 28, 3º Izda',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: true,
        placeholder: '28013', maxLength: 5,
        hint: 'CP de 5 dígitos obligatorio en la factura',
      },
    ],
  },

  EC: {
    label: 'Ecuador',
    fiscalAuth: 'SRI',
    fiscalNote: 'El domicilio debe coincidir con el RUC registrado ante el Servicio de Rentas Internas (SRI).',
    addrFields: [
      {
        key: 'province', label: 'Provincia', type: 'select', required: true,
        options: EC_PROVINCES.map(p => ({ v: p, l: p })),
      },
      {
        key: 'canton', label: 'Cantón', type: 'text', required: true,
        placeholder: 'Ej. Guayaquil',
      },
      {
        key: 'parish', label: 'Parroquia', type: 'text', required: true,
        placeholder: 'Ej. Tarqui',
        hint: 'La parroquia es requerida en el RUC',
      },
      {
        key: 'street', label: 'Dirección', type: 'text', required: true,
        placeholder: 'Av. 9 de Octubre 100 y Malecón',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: false,
        placeholder: '090150', maxLength: 6,
      },
    ],
  },

  VE: {
    label: 'Venezuela',
    fiscalAuth: 'SENIAT',
    fiscalNote: 'El domicilio debe coincidir con el RIF registrado ante el SENIAT.',
    addrFields: [
      {
        key: 'state', label: 'Estado', type: 'select', required: true,
        options: VE_STATES.map(s => ({ v: s, l: s })),
      },
      {
        key: 'municipality', label: 'Municipio', type: 'text', required: true,
        placeholder: 'Ej. Libertador',
      },
      {
        key: 'parish', label: 'Parroquia', type: 'text', required: false,
        placeholder: 'Ej. El Recreo',
      },
      {
        key: 'street', label: 'Dirección', type: 'text', required: true,
        placeholder: 'Av. Francisco de Miranda, Edif. Centro Lido, Piso 8',
      },
      {
        key: 'postal', label: 'Código postal', type: 'postal', required: false,
        placeholder: '1060', maxLength: 4,
      },
    ],
  },

}

/** Retorna la configuración del país o un fallback genérico */
export function getCountryConfig(countryCode) {
  return COUNTRY_ADDRESS[countryCode?.toUpperCase()] || {
    label: countryCode || 'Internacional',
    fiscalAuth: null,
    fiscalNote: null,
    addrFields: [
      { key: 'state',  label: 'Estado / Departamento / Región', type: 'text', required: false, placeholder: '' },
      { key: 'city',   label: 'Ciudad',    type: 'text', required: true,  placeholder: '' },
      { key: 'street', label: 'Dirección', type: 'text', required: true,  placeholder: '' },
      { key: 'postal', label: 'Código postal', type: 'postal', required: false, placeholder: '', maxLength: 10 },
    ],
  }
}
