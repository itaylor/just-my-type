import {  ArrayMetaModel, CompareMatch, TypeContext, StrategyHints, BasicMetaModel, MetaModel, RecordMetaModel, OptionalStrategyOpts, UnionStrategyOpts, ObjectMetaModel, ConcreteMetaModel } from './types.ts';
import { shallowObjectSameShape, expandObjectTypes, expandObjectTypesToSingleList } from './utils.ts';
import { compare, objectCompare } from './compare.ts';

export function observeOne(cm: ConcreteMetaModel, context: TypeContext, opts: StrategyHints) {
  if (!context[cm.name]) {
    context[cm.name] = [];
  }
  if (cm.type === 'object') {
    const strategyName = opts.strategyHints[cm.name] || opts.defaultObjectStrategy;
    if (strategyName === 'optional') {
      return optionalStrategy(cm, context, opts as OptionalStrategyOpts);
    } 
    if (strategyName === 'record') { 
      return recordStrategy(cm, context, opts);
    }
    if (strategyName === 'union') {
      return unionStrategy(cm, context, opts as UnionStrategyOpts);
    }
    throw new Error(`Unsupported object strategy ${strategyName}`);
  }
  if (cm.type === 'array') {
    return arrayStrategy(cm, context, opts);
  }
  if (cm.type !== 'record') {
    return basicStrategy(cm, context);
  }
  throw new Error(`Unsupported type: + ${cm.type}`);
}
export default observeOne;
 
export function basicStrategy(m: BasicMetaModel, context: TypeContext): void {

  const mm = context[m.name];
  for (const cm of mm) {
    const res = compare(m, cm);
    if (res.exactMatch) {
      // type already exists in the model, do nothing
      return;
    }
  }
  context[m.name].push(m);
} 

export function arrayStrategy(cm: ArrayMetaModel, context: TypeContext, opts: StrategyHints ): void {
 
  const existingModel = context[cm.name];
  for (const m of existingModel) {
    if (compare(cm, m).exactMatch) {
      //match already exists, nothing to do.
      return;
    }
  }
  const arrKey = `${cm.name}[]`;
  for (const o of cm.items) {
    observeOne(o, context, opts);
  }
  context[cm.name] = [{ name: cm.name, type: 'array', items: context[arrKey] || [] }];
}

export function optionalStrategy(cm: ObjectMetaModel, context: TypeContext, opts: OptionalStrategyOpts ): void {
  
  const existingModel = context[cm.name];
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
      opts.strategyHints[cm.name] = 'record';
      observeOne(cm, context, opts);
    }
  }
}

export function recordStrategy(cm: ObjectMetaModel, context: TypeContext, opts: StrategyHints): void {
  const existingModel = context[cm.name];
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
      name: cm.name,
      values: allValues
    }
    context[cm.name] = [record, ...nonObjTypes];
  }
}

export function unionStrategy(m: ObjectMetaModel, context: TypeContext, opts: UnionStrategyOpts): void  {

  // if strategy is union
  // if card(mm) less than RecordConversionThreshold
  //             add object to model
  // if card(mm) more than RecordConversionThreshold
  //             promote to Record < string, x >
  //   remove all objects from model, replace with Record < string, x | y >
  const existingModel = context[m.name];
  if (!existingModel.length) {
    context[m.name].push(m);
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
      opts.strategyHints[m.name] = 'record';
      observeOne(m, context, opts);
    }
  } else {
    expandObjectTypes(Object.keys(m.model), m, foundSameShape);
  }
}

