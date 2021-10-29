
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
  suggest(options: SuggestOptions = { defaultObjectMergeStrategy: 'union', objectMergeStrategyOverrides: {} }) {
    const mm = merge2(this.modelsByKey[this.typeName], options);
    const output = `export type ${safeName(mm[0].name)} = ${printType(mm, 0, options)}`;
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
      return { name, type, model: o, optionals: {} }
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
  optionals: Record<string, boolean>;
}

export type MergeStrategy = 'union' | 'optional';
export type SuggestOptions = {
  defaultObjectMergeStrategy: MergeStrategy;
  objectMergeStrategyOverrides: Record<string, MergeStrategy>
}

function collapseObjectModels(om1: ObjectMetaModel, om2:ObjectMetaModel, options: SuggestOptions): ObjectMetaModel {
  const keys1 = Object.keys(om1.model);
  const keys2 = Object.keys(om2.model);
  const allKeys = new Set<string>([...keys1, ...keys2]);
  const newOm: ObjectMetaModel = {
    model: {},
    optionals: {},
    name: om1.name,
    type: om1.type
  };
  for (const k of allKeys) {
    const mergeStrategy = options.objectMergeStrategyOverrides[k] || options.defaultObjectMergeStrategy;
    const model1Val = om1.model[k];
    const model2Val = om2.model[k];
    if (!model1Val?.length) {
      newOm.model[k] = model2Val;
      if (mergeStrategy === 'optional') {
        newOm.optionals[k] = true;
      }
    }
    else if (!model2Val?.length) {
      newOm.model[k] = model1Val;
      if (mergeStrategy === 'optional') {
        newOm.optionals[k] = true;
      }
    } else {
      // include all metamodels from both 
      newOm.model[k] = merge2([...model1Val, ...model2Val], options);
    }
  }
  return newOm;
}

function merge2(mm: MetaModel, options:SuggestOptions): MetaModel {
  let objects: ObjectMetaModel[] = [];
  let others: ConcreteMetaModel[] = [];
  mm.forEach((cm) => {
    if (cm.type === 'object') {
      objects.push(cm);
    } else {
      others.push(cm);
    }
  });

  const threshold = 3;

  if (objects.length > 0) {
    let incObjects: ObjectMetaModel[] = [];
    do { 
      const curr = objects.shift() as ObjectMetaModel;
      let exactMatch: ObjectMetaModel | null = null;
      let bestMatch: {
        diff: number,
        obj: ObjectMetaModel
      } | null = null;
      for (const om of incObjects) {
        const comRes = compare(curr, om);
        if (comRes.exactMatch) {
          exactMatch = curr;
          break;
        }
        if (!bestMatch || bestMatch.diff > comRes.diff) {
          bestMatch = {
            obj: om,
            diff: comRes.diff
          }
        }
      }
      if (exactMatch) {
        //nothing to do object already found in list. 
      } else if (!bestMatch){
        //no match found, add object to meta model
        incObjects.push(curr);
      } else if (bestMatch.diff > threshold) {
        //poor match, add this object to meta model
        incObjects.push(curr);
      } else if (bestMatch.diff < threshold) {
        console.log('collapsing models', bestMatch, curr );
        // not exact match, but acceptably close, combine the two object defintions.
        const newObject = collapseObjectModels(curr, bestMatch.obj, options);
        // TODO: should probably just mutate the bestMatch.obj instead of rebuilding list.
        incObjects = incObjects.filter((o) => o !== bestMatch?.obj);
        incObjects.push(newObject);
      }
    } while (objects.length > 0);
    objects = incObjects;
  }

  if (others.length > 0) {
    const dedupedOthers: ConcreteMetaModel[] = [others.shift() as ConcreteMetaModel];
    for (const cm1 of others) {
      let reject = false;
      for (const cm2 of dedupedOthers) {
        if (compare(cm1, cm2).exactMatch) {
          reject = true;
          break;
        }
      }
      if (!reject) {
        dedupedOthers.push(cm1);
      }
    }
    others = dedupedOthers;
  }
  return [ ...others, ...objects];
}


function safeName(str: string) {
  return str.split(/[\W_]+/g).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function printType(mm: MetaModel, depth: number, options: SuggestOptions): string {
  return mm.map((cm) => {
    if (cm.type === 'object') {
      return printObject(cm, depth, options);
    }
    if (cm.type === 'array') {
      return printArray(cm, depth, options);
    }
    return cm.type;
  }).join(' | ');
}

function collapseAllObjectModels(k: string, mm: MetaModel, options: SuggestOptions) {
  const mergeStrategy = options.objectMergeStrategyOverrides[k] || options.defaultObjectMergeStrategy;
  if (mergeStrategy === 'union') {
    return mm;
  }
  const newMms: MetaModel = [];
  let onlyObject: ObjectMetaModel | undefined = undefined;
  for (const cm of mm) {
    if (cm.type === 'object') {
      if (!onlyObject) {
        onlyObject = cm;
      } else {
        onlyObject = collapseObjectModels(onlyObject, cm, options);
      }
    } else {
      newMms.push(cm);
    }
  }
  if (onlyObject) {
    newMms.push(onlyObject);
  }
  return newMms;
}

function printObject(om: ObjectMetaModel, depth: number, options: SuggestOptions): string {
  const keys = Object.keys(om.model);

  const eachKey = keys.map((k) => {
    const isOptional = om.optionals[k] ? '?' : '';
    const nextType = printType(collapseAllObjectModels(k, om.model[k], options), depth + 1, options);
    return `${k}${isOptional}: ${nextType}`;
  });
  return `{\n${printDepth(depth+1)}${eachKey.join(',\n' + printDepth(depth+1))}\n${printDepth(depth)}}`;
}
function printDepth(depth: number){
  let str = '';
  for(let i = 0; i < depth; i++) {
    str += '  ';
  }
  return str; 
}

function printArray(am: ArrayMetaModel, depth: number, options: SuggestOptions) {
  if (am.items.length === 0) {
    return `Array<unknown>`;
  }
  return `Array<${printType(am.items, depth, options)}>`
}