
import { ComputationTask, Rubro } from './types';

export const COMPUTATION_RUBROS: Rubro[] = [
    { id: "rub_muros", name: "Muros y Tabiques" },
    { id: "rub_revoques", name: "Revoques" },
    { id: "rub_pintura", name: "Pintura" },
    { id: "rub_pisos", name: "Pisos y Revestimientos" },
    { id: "rub_cielorrasos", name: "Cielorrasos" },
    { id: "rub_inst_elec", name: "Instalación Eléctrica" },
    { id: "rub_inst_san", name: "Instalación Sanitaria" },
    { id: "rub_cubiertas", name: "Cubiertas y Techos" },
    { id: "rub_carpinterias", name: "Carpinterías" }
];

export const COMPUTATION_TASKS: ComputationTask[] = [
    {
      id: "task_muro_comun_10",
      rubroId: "rub_muros",
      name: "Muro Ladrillo Común 0.10m",
      unit: "m2",
      description: "Mampostería de ladrillo común de 10cm de espesor (panderete), asentado en mezcla.",
      parameters: [
        { name: "Largo", type: "number", unit: "m", min: 0 },
        { name: "Alto", type: "number", unit: "m", min: 0 },
        { name: "Desperdicio", type: "number", unit: "%", defaultValue: 5, min: 0, max: 20 }
      ],
      formulaExample: "Largo * Alto * (1 + Desperdicio/100)",
      tags: ["ladrillo", "comun", "panderete", "10cm"]
    },
    {
      id: "task_muro_comun_15",
      rubroId: "rub_muros",
      name: "Muro Ladrillo Común 0.15m",
      unit: "m2",
      description: "Mampostería de ladrillo común de 15cm de espesor (soga), asentado en mezcla.",
      parameters: [
        { name: "Largo", type: "number", unit: "m", min: 0 },
        { name: "Alto", type: "number", unit: "m", min: 0 },
        { name: "Desperdicio", type: "number", unit: "%", defaultValue: 5 }
      ],
      formulaExample: "Largo * Alto * (1 + Desperdicio/100)",
      tags: ["ladrillo", "comun", "soga", "15cm"]
    },
    {
      id: "task_muro_comun_20",
      rubroId: "rub_muros",
      name: "Muro Ladrillo Común 0.20m",
      unit: "m2",
      description: "Mampostería de ladrillo común de 20cm de espesor (doble panderete o especial).",
      parameters: [
        { name: "Largo", type: "number", unit: "m", min: 0 },
        { name: "Alto", type: "number", unit: "m", min: 0 },
        { name: "Desperdicio", type: "number", unit: "%", defaultValue: 5 }
      ],
      formulaExample: "Largo * Alto * (1 + Desperdicio/100)",
      tags: ["ladrillo", "comun", "20cm"]
    },
    {
      id: "task_muro_hueco",
      rubroId: "rub_muros",
      name: "Muro Ladrillo Hueco Cerámico",
      unit: "m2",
      description: "Mampostería de bloques cerámicos huecos portantes o no portantes.",
      parameters: [
        { name: "Espesor", type: "enum", options: ["8cm", "12cm", "18cm", "20cm"], defaultValue: "12cm" },
        { name: "Largo", type: "number", unit: "m", min: 0 },
        { name: "Alto", type: "number", unit: "m", min: 0 },
        { name: "Desperdicio", type: "number", unit: "%", defaultValue: 5 }
      ],
      formulaExample: "Largo * Alto * (1 + Desperdicio/100)",
      tags: ["ladrillo", "hueco", "ceramico"]
    },
    {
      id: "task_tabique_durlock",
      rubroId: "rub_muros",
      name: "Tabique Placa de Yeso (Durlock)",
      unit: "m2",
      description: "Tabique divisorio de estructura metálica y placas de yeso simple por lado.",
      parameters: [
        { name: "Perfileria", type: "enum", options: ["70mm", "35mm"], defaultValue: "70mm" },
        { name: "Placa", type: "enum", options: ["Standard", "Resistente Humedad", "Ignifuga"], defaultValue: "Standard" },
        { name: "Largo", type: "number", unit: "m", min: 0 },
        { name: "Alto", type: "number", unit: "m", min: 0 },
        { name: "Desperdicio", type: "number", unit: "%", defaultValue: 5 }
      ],
      formulaExample: "Largo * Alto * (1 + Desperdicio/100)",
      tags: ["durlock", "seco", "tabique"]
    }
];
