export type Preparation={layoutReady:boolean;venueReady:boolean;backdropColor:string|null;suppliesPacked?:boolean;equipmentChecked?:boolean;operatorName?:string|null};
export function preparationProgress(p:Preparation){return [p.layoutReady,p.venueReady,Boolean(p.backdropColor?.trim()),p.suppliesPacked,p.equipmentChecked,Boolean(p.operatorName?.trim())].filter(Boolean).length;}
export function preparationReady(p:Preparation){return preparationProgress(p)===6;}
