import { BasicType, ConcreteMetaModel, TypeContext, MetaModel, CompoundType, MatchModel, CompareMatch, StrategyHints, ObjectMetaModel } from './types.ts';
import { observeOne } from './Strategies.ts';
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


export function findBestModel(name: string, item: unknown, context: TypeContext): MatchModel {
  const existingModel: MetaModel = context[name];
  const m = createMetaModel(name, item, context);
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
