import { BasicType, ConcreteMetaModel, TypeContext, MetaModel, CompoundType, StrategyHints, ObjectMetaModel } from './types.ts';
import { observeOne } from './strategies.ts';
import { compare } from './compare.ts';

export function getRuntimeType(arg: unknown): BasicType | CompoundType {
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

export function createMetaModel(name: string, value: unknown, context: TypeContext) {
  const type: BasicType | CompoundType = getRuntimeType(value);
  if (type === 'array' || type === 'object' || type === 'record') {
    return getCompoundMetaModel(name, type, value, context);
  }
  return getBasicMetaModel(name, type);
}

function getBasicMetaModel(name: string, type: BasicType): ConcreteMetaModel {
  return {
    name,
    type,
  };
}

function getCompoundMetaModel(name: string, type: CompoundType, value: unknown, context: TypeContext): ConcreteMetaModel {
  if (type === 'object') {
    const o: Record<string, MetaModel> = {};
    Object.keys(value as Record<string, unknown>).forEach((key) => {
      const v = (value as Record<string, unknown>)[key];
      o[key] = [createMetaModel(`${name}.${key}`, v, context)];
    });
    return { name, type, model: o, optionals: {} }
  }
  if (type === 'array') {
    const tempCache: Record<string, MetaModel> = { [name]: [] };
    const arrKey = `${name}[]`;
    const arr = value as Array<unknown>;
    for (const o of arr) {
      observeOne(arrKey, o, tempCache, { defaultObjectStrategy: 'union', strategyHints: {}, recordConversionThreshold: 10 } as StrategyHints);
    }
    return { name: name, type: 'array', items: tempCache[arrKey] };
  }
  throw new Error(`unsupported type ${type}`);
} 

export function shallowObjectSameShape(o1: ObjectMetaModel, o2: ObjectMetaModel): boolean {
  const k1 = Object.keys(o1.model);
  const k2 = Object.keys(o2.model);
  const s = new Set([...k1, ...k2]);
  const currentLevelSame = (k1.length === k2.length) && (k1.length === s.size);
  return currentLevelSame;
}

export function keyDifference(o1: ObjectMetaModel, o2: ObjectMetaModel): string[] {
  const k1 = Object.keys(o1.model);
  const k2 = Object.keys(o2.model);
  const s = new Set([...k1, ...k2]);
  const currentLevelSame = (k1.length === k2.length) && (k1.length === s.size);
  if (currentLevelSame) {
    return [];
  }
  const s1 = new Set([...k1]);
  const s2 = new Set([...k2]);
  const diffKeys = new Set<string>();
  for (const k of k1) {
    if (!s2.has(k) && !o2.optionals[k]) {
      diffKeys.add(k);
    }
  }
  for (const k of k2) {
    if (!s1.has(k) && !o1.optionals[k]) {
      diffKeys.add(k);
    }
  }
  return [...diffKeys];
}


export function expandObjectTypesToSingleList(o1: ObjectMetaModel, list: MetaModel) {
  for (const k of Object.keys(o1.model)) {
    for (const currModel of o1.model[k]) {
      let hasExactMatch = false;
      for (const foundM of list) {
        const res = compare(currModel, foundM);
        if (res.exactMatch) {
          hasExactMatch = true;
          break;
        }
      }
      if (!hasExactMatch) {
        list.push(currModel);
      }
    }
  }
}

export function expandObjectTypes(keys: string[], o1: ObjectMetaModel, o2: ObjectMetaModel) {
  for (const k of keys) {
    for (const currModel of o1.model[k]) {
      let hasExactMatch = false;
      for (const foundM of o2.model[k]) {
        const res = compare(currModel, foundM);
        if (res.exactMatch) {
          hasExactMatch = true;
        }
      }
      if (!hasExactMatch) {
        o2.model[k].push(currModel);
      }
    }
  }
}