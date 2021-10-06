
export default class TypeGenerator {
  typeName: string;
  modelsByKey: Record<string, MetaModel>;
  constructor(typeName: string) {
    this.typeName = typeName;
    this.modelsByKey = {};
  }
  observe(thing: unknown) {
    const matchModel = this.findBestModel(this.typeName, thing, this.modelsByKey);
    if (!this.modelsByKey[this.typeName]) {
      this.modelsByKey[this.typeName] = [];
    }
    if (!matchModel.existing) {
      this.modelsByKey[this.typeName]?.push(matchModel.model);
    } else if (matchModel.diff > 0) {
      this.modelsByKey[this.typeName]?.push(matchModel.model);
    } else {
      // 0 diff and existing, do nothing.
    }
  }
  readCurrentModel() {
    return this.modelsByKey[this.typeName];
  }
  suggest() {
    const mm = this.modelsByKey[this.typeName];
    const output = `export type ${safeName(mm[0].name)} = ${printType(mm, 0)}`;
    return output;  
  }

  private getMetaModel(name: string, value: unknown) {
    const type: BasicType | CompoundType = getRuntimeType(value);
    if (type === 'array' || type === 'object') {
      return this.getCompoundMetaModel(name, type, value);
    }
    return this.getBasicMetaModel(name, type);
  }

  private getBasicMetaModel(name: string, type: BasicType): ConcreteMetaModel {
    return {
      name,
      type,
    };
  }

  private getCompoundMetaModel(name: string, type: CompoundType, value: unknown): ConcreteMetaModel {
    if (type === 'object') {
      const o: Record<string, MetaModel> = {};
      Object.keys(value as Record<string, unknown>).forEach((key) => {
        const v = (value as Record<string, unknown>)[key];
        o[key] = [this.getMetaModel(`${name}.${key}`, v)];
      });
      return { name, type, model: o }
    } 
    return {
      name,
      type: 'array',
      items: this.computeArrayMetaModel(name, value as unknown[], this.modelsByKey)
    }
  }

  private findBestModel(name: string, item: unknown, modelsByKey: Record<string, MetaModel>): MatchModel {
    const existingModel: MetaModel = modelsByKey[name];
    const m = this.getMetaModel(name, item);
    let bestMatch: MatchModel = { model: m, diff: 0, existing: false };
    if (!existingModel) {
      return bestMatch;
    }
    for (const cm of existingModel) {
      const result = compare(m, cm);
      if (result.exactMatch) {
        return { model: cm, diff: 0, existing: true };
      } else if (result.compatibleType && result.diff < bestMatch.diff) {
        bestMatch = { model: cm, diff: result.diff, existing: true };
      }
    }
    return bestMatch;
  }

  private computeArrayMetaModel(name: string, items: unknown[], modelsByKey: Record<string, MetaModel>): MetaModel {
    const arrName = `${name}[]`;
    if (!modelsByKey[arrName]) {
      modelsByKey[arrName] = [];
    }
    for (const item of items) {
      const bestModelMatch = this.findBestModel(arrName, item, modelsByKey);
      if (!bestModelMatch.existing) {
        modelsByKey[arrName]?.push(bestModelMatch.model);
      } else if (bestModelMatch.diff > 0) {
        // expand definition instead of add variation?
        modelsByKey[arrName]?.push(bestModelMatch.model);
      } else {
        // 0 diff and existing, do nothing.
      }
    }
    return modelsByKey[arrName];
  }
}

function getRuntimeType(arg: unknown): BasicType | CompoundType {
  if (arg === null) {
    return 'null';
  }
  if (arg === undefined) {
    return 'undefined';
  }
  const t = typeof arg;  
  if (t === 'object') {
    if (Array.isArray(arg)) {
      return 'array';
    }
    return 'object';
  }
  return t;
}



type MatchModel = { model: ConcreteMetaModel, diff: number, existing: boolean }

function compare(m1: ConcreteMetaModel, m2: ConcreteMetaModel): CompareMatch  {
  const cm: CompareMatch = {
    exactMatch: false,
    diff: 0,
    compatibleType: false
  }
  if (m1.type === m2.type) {
    if(m1.type === 'object' && m2.type === 'object') {
      cm.compatibleType === true;
      const m1Keys = Object.keys(m1.model);
      for (const k of m1Keys) {
        if (!m2.model[k]) {
          cm.diff++;
          cm.exactMatch = false;
        } else {
          // TODO: should I be looping on these here too?
          const result = compare(m1.model[k][0], m2.model[k][0]);
          if (!result.exactMatch) {
            cm.diff += result.diff;
          }
        }
      }
      if (cm.diff === 0) {
        cm.exactMatch = true;
      }
    } else if (m1.type === 'array' && m2.type === 'array') {
      cm.compatibleType === true;
      for (const itemModel1 of m1.items) {
        for (const itemModel2 of m2.items) {
          const out = compare(itemModel1, itemModel2);
          if (out.exactMatch) {
            cm.diff = 0;
            cm.exactMatch = true; 
          }
        }
        cm.diff++;
      }
    } else {
      cm.exactMatch = true;
      cm.compatibleType = true;
    }
  } else {
    cm.compatibleType = false;
    cm.diff++;
  }
  return cm;
}

type CompareMatch = {
  exactMatch: boolean,
  diff: number,
  compatibleType: boolean,
}

export type MetaModel = Array<ConcreteMetaModel>;
type ConcreteMetaModel = BasicMetaModel | ObjectMetaModel | ArrayMetaModel

type BasicType = 'string' | 'boolean' | 'number' | 'bigint' | 'symbol' | 'function' | 'undefined' | 'null';
type CompoundType = 'array' | 'object';

type BasicMetaModel = {
  name: string,
  type: BasicType
}

export type ArrayMetaModel = {
  name: string,
  type: 'array';
  items: MetaModel;
}

export type ObjectMetaModel = {
  name: string,
  type: 'object';
  model: Record<string, MetaModel>;
}

function collapseObjectModels(om1: ObjectMetaModel, om2:ObjectMetaModel): ObjectMetaModel {
  const keys1 = Object.keys(om1.model);
  const keys2 = Object.keys(om2.model);
  const allKeys = new Set<string>([...keys1, ...keys2]);
  const newOm: ObjectMetaModel = {
    model: {},
    name: om1.name,
    type: om1.type
  };
  for (const k of allKeys) {
    const model1Val = om1.model[k];
    const model2Val = om2.model[k];
    if (!model1Val?.length) {
      newOm.model[k] = model2Val;  
    }
    else if (!model2Val?.length) {
      newOm.model[k] = model1Val;
    } else {
      newOm.model[k] = mergeMetaModels(model1Val, model2Val);
    }
  }
  return newOm;
}

function mergeMetaModels(mm1:MetaModel, mm2:MetaModel): MetaModel {
  const newmm = [...mm1];
  for(const cm2 of mm2) {
    for (const cm1 of newmm) {
      if (!compare(cm1, cm2).exactMatch) {
        newmm.push(cm2);
      }
    }
  }
  return newmm;
}

function safeName(str: string) {
  return str.split(/[\W_]+/g).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function printType(mm: MetaModel, depth: number): string {
  return mm.map((cm) => {
    if (cm.type === 'object') {
      return printObject(cm, depth);
    }
    if (cm.type === 'array') {
      return printArray(cm, depth);
    }
    return cm.type;
  }).join(' | ');
}

function printObject(om: ObjectMetaModel, depth: number):string {
  const keys = Object.keys(om.model);
  const eachKey = keys.map((k) => `${k}: ${printType(om.model[k], depth + 1)}`);
  return `{\n${printDepth(depth+1)}${eachKey.join(',\n' + printDepth(depth+1))}\n${printDepth(depth)}}`;
}
function printDepth(depth: number){
  let str = '';
  for(let i = 0; i < depth; i++) {
    str += '  ';
  }
  return str; 
}

function printArray(am: ArrayMetaModel, depth: number) {
  return `Array<${printType(am.items, depth)}>`
}