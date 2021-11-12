import { CompareMatch, TypeContext, StrategyHints, BasicType, BasicMetaModel, MetaModel, RecordMetaModel, OptionalStrategyOpts, UnionStrategyOpts, ObjectMetaModel, ConcreteMetaModel } from './types.ts';
import { getRuntimeType, createMetaModel, shallowObjectSameShape, expandObjectTypes, expandObjectTypesToSingleList } from './utils.ts';
import { compare, objectCompare } from './compare.ts';

export function observeOne(key: string, obj: unknown, context: TypeContext, opts: StrategyHints) {
  if (!context[key]) {
    context[key] = [];
  }
  const strategy = selectStrategy(key, obj, context, opts);
  strategy(key, obj, context, opts as any);
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
    return basicStrategy;
  }
}

const strategyMap = {
  basic: basicStrategy,
  array: arrayStrategy,
  union: unionStrategy,
  optional: optionalStrategy,
  record: recordStrategy,
}

export function basicStrategy(key: string, obj: unknown, context: TypeContext, opts: StrategyHints): void {
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

export function arrayStrategy(key: string, obj: unknown, context: TypeContext, opts: StrategyHints ): void {
  const cm = createMetaModel(key, obj, context);
 
  const existingModel = context[key];
  for (const m of existingModel) {
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

export function optionalStrategy(key: string, obj: unknown, context: TypeContext, opts: OptionalStrategyOpts ): void {
  
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

export function recordStrategy(key: string, obj: unknown, context: TypeContext, opts: StrategyHints): void {
  const cm = createMetaModel(key, obj, context) as ObjectMetaModel;
  const existingModel = context[key];
  const existingRecord = existingModel.find((m) => m.type === 'record') as RecordMetaModel | undefined;

  if (existingRecord) {
   expandObjectTypesToSingleList(cm, existingRecord.values);
  } else {
    const nonObjTypes: ConcreteMetaModel[] = [];
    const objTypes: ObjectMetaModel[] = [];
    existingModel.forEach((m) => (m.type === 'object' ? objTypes : nonObjTypes).push(m));
    const allValues: MetaModel = [];
    objTypes.forEach((o) => {
      expandObjectTypesToSingleList(o, allValues);
    });
    const record: RecordMetaModel = {
      type: 'record',
      name: key,
      values: allValues
    }
    context[key] = [record, ...nonObjTypes];
  }
}

export function unionStrategy(key: string, obj: unknown, context: TypeContext, opts: UnionStrategyOpts): void  {

  // if strategy is union
  // if card(mm) less than RecordConversionThreshold
  //             add object to model
  // if card(mm) more than RecordConversionThreshold
  //             promote to Record < string, x >
  //   remove all objects from model, replace with Record < string, x | y >
  const m = createMetaModel(key, obj, context) as ObjectMetaModel;
  const existingModel = context[key];
  if (!existingModel.length) {
    context[key].push(m);
    return;
  }

  let foundSameShape: ObjectMetaModel | null = null;
  for (const cm of existingModel) {
    if (cm.type === 'object' && m.type === 'object'){
      const sameShape = shallowObjectSameShape(m, cm);
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

