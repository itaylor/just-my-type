import { CompareMatch, TypeContext, StrategyHints, BasicType, BasicMetaModel, MetaModel, RecordMetaModel, OptionalStrategyOpts, UnionStrategyOpts, ObjectMetaModel, ConcreteMetaModel } from './types.ts';
import { findBestModel, getRuntimeType, createMetaModel, shallowObjectSameShape } from './utils.ts';
import { compare, objectCompare } from './compare.ts';

export function observeOne(key: string, obj: unknown, context: TypeContext, opts: StrategyHints) {
  if (!context[key]) {
    context[key] = [];
  }
  const strategy = selectStrategy(key, obj, context, opts);
  //console.log('selected strategy', strategy, context, opts);
  strategy(key, obj, context, opts as any);
  //console.log('context after', context);
  return context[key];
}

export default observeOne;

function selectStrategy(key: string, obj: unknown, context: TypeContext, opts: StrategyHints) {
  const type = getRuntimeType(obj);
  if (type === 'object') {
    const strategyName = opts.strategyHints[key] || opts.defaultObjectStrategy;
    return strategyMap[strategyName];
  }
  if (type === 'array') {
    return strategyMap.array;
  } else {
    return BasicStrategy;
  }
}

const strategyMap = {
  basic: BasicStrategy,
  array: ArrayStrategy,
  union: UnionStrategy,
  optional: OptionalStrategy,
  record: RecordStrategy,
}

export function BasicStrategy(key: string, obj: unknown, context: TypeContext, opts: StrategyHints): void {
  const basicType: BasicMetaModel = { name: key, type: getRuntimeType(obj) as BasicType };
  const mm = context[key];
  for (const cm of mm) {
    const res = compare(basicType, cm);
    if (res.exactMatch) {
      // type already exists in the model, do nothing
      return;
    }
  }
  context[key] = [basicType];
} 

export function ArrayStrategy(key: string, obj: unknown, context: TypeContext, opts: StrategyHints ): void {
  const cm = createMetaModel(key, obj, context);
 
  const existingModel = context[key];
  for (const m of existingModel) {
    console.log(cm, m);
    if (compare(cm, m).exactMatch) {
      //match already exists, nothing to do.
      return;
    }
  }
  const arrKey = `${key}[]`;
  const arr = obj as Array<unknown>;
  for (const o of arr) {
    observeOne(arrKey, o, context, opts);
  }
  context[key] = [{ name: arrKey, type: 'array', items: context[arrKey] || [] }];
}

// function symmetricDiff<T>(a1: T[], a2: T[]): T[] {
//   return a1.filter(x => !a2.includes(x)).concat(a2.filter(x => !a1.includes(x)));
// }

export function OptionalStrategy(key: string, obj: unknown, context: TypeContext, opts: OptionalStrategyOpts ): void {
  
  const cm = createMetaModel(key, obj, context) as ObjectMetaModel;
  const existingModel = context[key];
  let bestMatch: CompareMatch | null = null;
  let bestMatchModel: ObjectMetaModel | null = null;
  for (const m2 of existingModel) {
    const result = compare(cm, m2);
    if (result.exactMatch) {
      return; // already exists, do nothing
    }else if (result.compatibleType) {
      if (bestMatch === null || bestMatch.diff > result.diff) {
        bestMatch = result;
        bestMatchModel = m2 as ObjectMetaModel;
      }
    }
  }
  if (!bestMatch || !bestMatchModel) { //No match found, add the model.
    existingModel.push(cm);
    return;
  }
  if (bestMatch.diff < opts.objectDiffThreshold) {
    // Go through the object's keys, if they don't exist in the current model, mark them as optional
    const { missingKeys, unMatchedKeys, extraKeys } = objectCompare(cm, bestMatchModel);
    for (const key of missingKeys) {
      bestMatchModel.model[key] = cm.model[key];
      bestMatchModel.optionals[key] = true;
    }
    for (const key of extraKeys) {
      // convert fields that the current object doesn't have to be optionals
      bestMatchModel.optionals[key] = true;
    }
    // Any types that didn't match get expanded.
    expandObjectTypes(unMatchedKeys, cm, bestMatchModel);   
  } else {
    if (existingModel.length < opts.recordConversionThreshold) {
      existingModel.push(cm);
    } else {
      // we've passed the configured number of types to store, we will need to convert this type to a record
      // do this by specifying the strategy for the key and running back through the observer.
      opts.strategyHints[key] = 'record';
      observeOne(key, obj, context, opts);
    }
  }
}

export function RecordStrategy(key: string, obj: unknown, context: TypeContext, opts: StrategyHints ): void {
  const mm = context[key];
  const match = findBestModel(key, obj, context);
  const valueKey = `${key}<>`;
  let record: RecordMetaModel;
  if (match.existing && match.model.type === 'record') {
    record = match.model;
    if (match.diff > 0) {
      Object.values(obj as Record<string, unknown>).forEach(o => observeOne(valueKey, o, context, opts))
    }
  } else {
    // promote all existing objects to Record<string, X | Y | Z> where X, Y, Z are types of values of the objects
    // Remove all 'object' types from metamodel, insert a record type instead.
    record = { name: key, type: 'record', keys: ['string'], values: [] };
    const newMm: MetaModel = [record];
    for (const cm of mm) {
      if (cm.type === 'object') {
        Object.values(cm.model).forEach(o => observeOne(valueKey, o, context, opts));
      } else {
        newMm.push(cm);
      }
    }
  }
  record.values = context[valueKey];
}

export function UnionStrategy(key: string, obj: unknown, context: TypeContext, opts: UnionStrategyOpts): void  {

  // if strategy is union
  // if card(mm) less than RecordConversionThreshold
  //             add object to model
  // if card(mm) more than RecordConversionThreshold
  //             promote to Record < string, x >
  //   remove all objects from model, replace with Record < string, x | y >
  const m = createMetaModel(key, obj, context) as ObjectMetaModel;
  const o = obj as Record<string, unknown>;
  const existingModel = context[key];
  if (!existingModel.length) {
    console.log('replace existing model:', key);
    context[key].push(m);
    return;
  }

  let foundSameShape: ObjectMetaModel | null = null;
  for (const cm of existingModel) {
    if (cm.type === 'object' && m.type === 'object'){
      const sameShape = shallowObjectSameShape(m, cm);
      // console.log('sameshape', cm.model, Object.keys(o), m.model);
      if (sameShape) {
        foundSameShape = cm;
        break;
      }
    }
  }
  if (!foundSameShape) {
    if (existingModel.length < opts.recordConversionThreshold) {
      existingModel.push(m);
    } else {
      // we've passed the configured number of types to store, we will need to convert this type to a record
      // do this by specifying the strategy for the key and running back through the observer.
      opts.strategyHints[key] = 'record';
      observeOne(key, obj, context, opts);
    }
  } else {
    expandObjectTypes(Object.keys(m.model), m, foundSameShape);
  }
}

function expandObjectTypes(keys: string[], o1: ObjectMetaModel, o2: ObjectMetaModel) {
  for (const k of keys) {
    for (const currModel of o1.model[k]) {
      let hasExactMatch = false;
      // console.log(k,foundSameShape, currModel);
      for (const foundM of o2.model[k]) {
        const res = compare(currModel, foundM);
        if (res.exactMatch) {
          console.log('is Exact Match', currModel, foundM);
          hasExactMatch = true;
        }
      }
      if (!hasExactMatch) {
        console.log('Not Exact Match', JSON.stringify(o2.model[k], null, 2));
        o2.model[k].push(currModel);
        console.log('After Match', JSON.stringify(o2.model[k], null, 2));
      }
    }
  }
}