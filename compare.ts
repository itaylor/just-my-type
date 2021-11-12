import { ConcreteMetaModel, CompareMatch, ArrayMetaModel, ObjectMetaModel, MetaModel,  } from './types.ts';
import { keyDifference } from './utils.ts';

export function compare(m1: ConcreteMetaModel, m2: ConcreteMetaModel): CompareMatch {
  let cm: CompareMatch = {
    exactMatch: false,
    diff: 0,
    compatibleType: false
  }
  //console.log('comparing', m1, m2);
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
      // cm.compatibleType === true;
      // const m1Keys = Object.keys(m1.model);
      // for (const k of m1Keys) {
      //   if (!m2.model[k]) {
      //     cm.diff++;
      //     cm.exactMatch = false;
      //   } else {
      //     // TODO: should I be looping on these here too?
      //     const result = compare(m1.model[k][0], m2.model[k][0]);
      //     if (!result.exactMatch) {
      //       cm.diff += result.diff;
      //     }
      //   }
      // }
      // if (cm.diff === 0) {
      //   cm.exactMatch = true;
      // }
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
  //console.log('compare result', cm);
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
  unMatchedKeys: string[]
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
  }

  // Premature? optimization:
  // if the object shapes don't match, we don't have to do deep comparison of the types.
  // const diffKeys = keyDifference(o1, o2);
  // if (diffKeys.length > 0) {
  //   cm.diff = diffKeys.length;
  //   cm.unMatchedKeys = diffKeys;
  //   return cm;
  // }
  
  const unMatchedKeys = [];
  for (const k of Object.keys(o1.model)) {
    const currModel = o2.model[k];
    if (!currModel && !o2.optionals[k]) {
      unMatchedKeys.push(k);
    } else {
      let hadMatch = true;
      // // TODO: should I be looping on these here too?
      // This is garbage.  The below double loop makes tests fail, because it picks keys
      // across different models, which should not be possible, but the loop
      // has to be on keys to look up the models by key.
      // const result = compare(o1.model[k][0], o2.model[k][0]);
      // if (result.exactMatch) {
      //   hadMatch = true;
      // }
      const oldWay = compare(o1.model[k][0], o2.model[k][0]);
 
      for (const m of o1.model[k]) {
        let hadMatchInThisModel = false;
        for (const cm of currModel) {
          const result = compare(m, cm);
          if (result.exactMatch !== oldWay.exactMatch) {
            console.log('Data Dump:');
            console.log('key', k);
            console.log('Data Dump:', k, '\no1: \n', JSON.stringify(o1, null, 2), '\no2:\n', JSON.stringify(o2, null, 2), `\nm:\n`, m, `\ncm:\n`, cm);
          }
          if (!result.exactMatch) {
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
  cm.unMatchedKeys = unMatchedKeys;
  cm.diff = unMatchedKeys.length;
  cm.exactMatch = cm.diff === 0
  return cm;
}