import { TypeContext, StrategyHints, BasicType, BasicMetaModel, MetaModel, RecordMetaModel, OptionalStrategyOpts, UnionStrategyOpts, ObjectMetaModel } from './types.ts';
import { findBestModel, getRuntimeType, createMetaModel, shallowObjectSameShape } from './utils.ts';
import { compare } from './compare.ts';

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
  const mm = context[key];

  const m = createMetaModel(key, obj, context) as ObjectMetaModel;
  const o = obj as Record<string, unknown>;
  const existingModel = context[key];
  if (!existingModel.length) {
    context[key] = [m];
    return;
  }
  // if (m.model.type === 'object' && m.existing && m.diff < opts.objectDiffThreshold) {
  //   //Expand the Add optional properties
  //   if (m.diff === 0) {
  //     // do nothing.
  //   } else {
  //     const o = obj as Record<string, unknown>;
  //     // Go through the object's keys, if they don't exist in the current model, mark them as optional
  //     for (const k of Object.keys(o)) {
  //       if (!m.model.model[k]) {
  //         m.model.optionals[k] = true;
  //       }
  //       // By observing each value, we expand the allowed types. 
  //       const propKey = `${key}.${k}`;
  //       observeOne(propKey, o[k], context, opts);
  //       m.model.model[k] = context[propKey];
  //     }
  //   } 
  // } else if (m.model.type === 'object') {
  //   if (mm.length < opts.recordConversionThreshold) {
  //     mm.push(m.model);
  //   } else {
  //     // we've passed the configured number of types to store, we will need to convert this type to a record
  //     // do this by specifying the strategy for the key and running back through the observer.
  //     opts.strategyHints[key] = 'record';
  //     observeOne(key, obj, context, opts);
  //   }
  // } else {
  //   mm.push(m.model);
  // }
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
    for (const k of Object.keys(o)) {
      for (const currModel of m.model[k]) {
        let hasExactMatch = false;
       // console.log(k,foundSameShape, currModel);
        for (const foundM of foundSameShape.model[k]) {
          const res = compare(currModel, foundM);
          if (res.exactMatch) {
            console.log('is Exact Match', currModel, foundM);
            hasExactMatch = true;
          }
        }
        if (!hasExactMatch) {
          console.log('Not Exact Match', JSON.stringify(foundSameShape.model[k], null, 2));
          foundSameShape.model[k].push(currModel);
          console.log('After Match', JSON.stringify(foundSameShape.model[k], null, 2));
        }
      }
    }
  }
}
