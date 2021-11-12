import { ConcreteMetaModel, CompareMatch, ArrayMetaModel, ObjectMetaModel, MetaModel,  } from './types.ts';

export function compare(m1: ConcreteMetaModel, m2: ConcreteMetaModel): CompareMatch {
  let cm: CompareMatch = {
    exactMatch: false,
    diff: 0,
    compatibleType: false
  }
  if (m1.type === m2.type) {
    if (m1.type === 'record' && m2.type === 'record') {
      cm.compatibleType = true;
      cm.exactMatch = true;
      cm.diff = 0;
    } else if (m1.type === 'object' && m2.type === 'record' || m1.type === 'record' && m2.type === 'object') {
      cm.compatibleType = true;
      cm.exactMatch = false;
      cm.diff === 0;
    } else if (m1.type === 'object' && m2.type === 'object') {
      cm = objectCompare(m1, m2);
    } else if (m1.type === 'array' && m2.type === 'array') {
      cm = arrayCompare(m1, m2);
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

type ArrayCompareMatch = CompareMatch & {
  unMatchedItems: MetaModel,
}
// For each item in a1, there must be a match in a2 for exactMatch to be true
// For each item in a1 that does not have a match in a2, it is returned in the unMatchedItems array
// The diff number is the number of items in a1 that did not have a corresponding match in a2
export function arrayCompare(a1: ArrayMetaModel, a2: ArrayMetaModel): ArrayCompareMatch {
  const cm: ArrayCompareMatch = {
    exactMatch: false,
    diff: 0,
    compatibleType: true,
    unMatchedItems: [],
  }
  const unMatchedItems: MetaModel = [];
  for (const itemModel1 of a1.items) {
    let hadMatch = false;
    for (const itemModel2 of a2.items) {
      const out = compare(itemModel1, itemModel2);
      if (out.exactMatch) {
        hadMatch = true;
        break;
      }
    }
    if (!hadMatch) {
      unMatchedItems.push(itemModel1);
    }
  }
  cm.unMatchedItems = unMatchedItems;
  cm.diff = unMatchedItems.length;
  cm.exactMatch = cm.diff === 0
  return cm;
}

type ObjectCompareMatch = CompareMatch & {
  unMatchedKeys: string[],
  missingKeys: string[],
  extraKeys: string[]
}

// For each key/value in o1.model, there must be a matching key/value in o2.model. 
// If there are any keys missing from o1.model, then that key must be o2.model or be marked optional for an exactMatch 
// For each key/value in o1.model which doesn't have a match, the key is returned in unMatchedKeys
// The diff number is the number of keys/values in o1 that did not have a corresponding match in o2
export function objectCompare(o1: ObjectMetaModel, o2: ObjectMetaModel): ObjectCompareMatch {
  const cm: ObjectCompareMatch = {
    exactMatch: false,
    diff: 0,
    compatibleType: true,
    unMatchedKeys: [],
    missingKeys: [],
    extraKeys:[]
  }
  
  const unMatchedKeys = [];
  const missingKeys = [];
  const extraKeys = [];
  for (const k of Object.keys(o1.model)) {
    const currModel = o2.model[k];
    if (!currModel && !o2.optionals[k]) {
      missingKeys.push(k)
    } else {
      let hadMatch = true;

      // for a key in o1, each model must have a match in one of the models in o2
      // If not, then the key is not a match
      for (const m of o1.model[k]) {
        let hadMatchInThisModel = false;
        for (const cm of currModel) {
          const result = compare(m, cm);
          if (result.exactMatch) {
            hadMatchInThisModel = true;
            break;
          }
        }
        if (!hadMatchInThisModel) {
          hadMatch = false;
        }
      }
      if (!hadMatch) {
        unMatchedKeys.push(k);
      }
    }
  }
  for (const k of Object.keys(o2.model)) {
    if (!o1.model[k]) {
      extraKeys.push(k);
    }
  }
  cm.missingKeys = missingKeys;
  cm.unMatchedKeys = unMatchedKeys;
  cm.extraKeys = extraKeys;
  cm.diff = unMatchedKeys.length + missingKeys.length + extraKeys.length;
  cm.exactMatch = cm.diff === 0;
  return cm;
}